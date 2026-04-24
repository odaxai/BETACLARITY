"""
Hardware monitoring + device selection for the BETACLARITY backend.

Provides:
    list_devices()              -> list of available compute devices (CPU/CUDA/MPS/CoreML/DirectML)
    DeviceMonitor singleton     -> background sampler for utilisation/memory/throughput
    DeviceMonitor.snapshot()    -> latest sampled stats (cheap, JSON-friendly)
    DeviceMonitor.start_session(name)
    DeviceMonitor.stop_session()

The monitor is intentionally dependency-light: it uses psutil for CPU/RAM,
torch.cuda for NVIDIA, and best-effort subprocess calls for the rest.
"""
from __future__ import annotations

import os
import platform
import subprocess
import threading
import time
from collections import deque
from typing import Any, Optional


# ─────────────────────────────────────────────────────────────────────────────
# Optional dependencies
# ─────────────────────────────────────────────────────────────────────────────
try:
    import torch
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

try:
    import onnxruntime as ort
    HAS_ORT = True
    _ORT_PROVIDERS = ort.get_available_providers()
except ImportError:
    HAS_ORT = False
    _ORT_PROVIDERS = []


# ─────────────────────────────────────────────────────────────────────────────
# Device discovery
# ─────────────────────────────────────────────────────────────────────────────
def _cpu_label() -> str:
    """Best-effort human-readable CPU name."""
    sysname = platform.system()
    arch = platform.machine()
    try:
        if sysname == "Darwin":
            return subprocess.check_output(
                ["sysctl", "-n", "machdep.cpu.brand_string"], text=True, timeout=2
            ).strip()
        if sysname == "Linux":
            try:
                out = subprocess.check_output(
                    ["grep", "-m1", "model name", "/proc/cpuinfo"], text=True, timeout=2
                )
                name = out.split(":", 1)[-1].strip()
                if name:
                    return name
            except Exception:
                pass
            return f"{arch} CPU" + (" (arm64)" if arch in ("aarch64", "arm64") else "")
        return platform.processor() or "CPU"
    except Exception:
        return platform.processor() or "CPU"


def list_devices() -> list[dict[str, Any]]:
    """
    Return the list of compute devices the backend can target.

    Each entry:
        {
            "id":          "cpu" | "cuda:0" | "mps" | "coreml" | "directml",
            "kind":        "cpu" | "gpu" | "npu",
            "vendor":      "Intel" | "AMD" | "Apple" | "NVIDIA" | "Microsoft" | "Generic",
            "label":       human readable name,
            "available":   True/False,
            "supports_pytorch": True/False,
            "supports_onnx":    True/False,
            "details":     {...}
        }
    """
    devices: list[dict[str, Any]] = []

    # --- CPU (always present) ---
    cpu_label = _cpu_label()
    cpu_arch = platform.machine()
    cpu_vendor = "Apple" if "Apple" in cpu_label else (
        "Intel" if "Intel" in cpu_label else (
            "AMD" if "AMD" in cpu_label else "Generic"))
    cores = (psutil.cpu_count(logical=False) if HAS_PSUTIL else os.cpu_count()) or 1
    threads = (psutil.cpu_count(logical=True) if HAS_PSUTIL else os.cpu_count()) or 1
    devices.append({
        "id": "cpu",
        "kind": "cpu",
        "vendor": cpu_vendor,
        "label": cpu_label,
        "available": True,
        "supports_pytorch": True,
        "supports_onnx": True,
        "details": {
            "arch": cpu_arch,
            "cores": cores,
            "threads": threads,
        },
    })

    # --- CUDA GPUs ---
    if HAS_TORCH and torch.cuda.is_available():
        for idx in range(torch.cuda.device_count()):
            prop = torch.cuda.get_device_properties(idx)
            devices.append({
                "id": f"cuda:{idx}",
                "kind": "gpu",
                "vendor": "NVIDIA",
                "label": prop.name,
                "available": True,
                "supports_pytorch": True,
                "supports_onnx": "CUDAExecutionProvider" in _ORT_PROVIDERS,
                "details": {
                    "vram_total_gb": round(prop.total_memory / 1024**3, 1),
                    "compute_capability": f"{prop.major}.{prop.minor}",
                    "cuda_version": torch.version.cuda,
                },
            })

    # --- Apple MPS (PyTorch on Apple Silicon GPU/ANE) ---
    if HAS_TORCH and hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        devices.append({
            "id": "mps",
            "kind": "gpu",
            "vendor": "Apple",
            "label": f"{cpu_label} GPU (Metal)",
            "available": True,
            "supports_pytorch": True,
            "supports_onnx": False,
            "details": {"backend": "MPS"},
        })

    # --- CoreML / Apple Neural Engine via ONNX Runtime ---
    if "CoreMLExecutionProvider" in _ORT_PROVIDERS:
        devices.append({
            "id": "coreml",
            "kind": "npu",
            "vendor": "Apple",
            "label": f"{cpu_label} Neural Engine",
            "available": True,
            "supports_pytorch": False,
            "supports_onnx": True,
            "details": {"provider": "CoreMLExecutionProvider"},
        })

    # --- DirectML (Windows GPUs/NPUs) ---
    if "DmlExecutionProvider" in _ORT_PROVIDERS or "DirectMLExecutionProvider" in _ORT_PROVIDERS:
        devices.append({
            "id": "directml",
            "kind": "npu",
            "vendor": "Microsoft",
            "label": "DirectML GPU/NPU",
            "available": True,
            "supports_pytorch": False,
            "supports_onnx": True,
            "details": {"provider": "DirectMLExecutionProvider"},
        })

    return devices


# ─────────────────────────────────────────────────────────────────────────────
# DeviceMonitor (singleton)
# ─────────────────────────────────────────────────────────────────────────────
class DeviceMonitor:
    """
    Background thread that samples CPU/GPU utilisation every `interval_ms`
    and keeps a small ring buffer of recent samples for the frontend
    activity widget.
    """

    _instance: Optional["DeviceMonitor"] = None

    def __init__(self, interval_ms: int = 500, history_seconds: int = 60):
        self.interval = interval_ms / 1000.0
        self.history_max = max(1, int(history_seconds / self.interval))
        self._buffer: deque[dict[str, Any]] = deque(maxlen=self.history_max)
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._active_session: Optional[str] = None
        self._session_started_at: Optional[float] = None
        self._session_step: int = 0
        self._session_total_steps: int = 0
        self._thread: Optional[threading.Thread] = None

    @classmethod
    def instance(cls) -> "DeviceMonitor":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    # ─── Lifecycle ────────────────────────────────────────────────────────
    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="DeviceMonitor", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    # ─── Session tracking (denoising progress) ────────────────────────────
    def start_session(self, name: str, total_steps: int) -> None:
        with self._lock:
            self._active_session = name
            self._session_started_at = time.time()
            self._session_step = 0
            self._session_total_steps = max(1, total_steps)

    def update_step(self, step: int) -> None:
        with self._lock:
            self._session_step = step

    def stop_session(self) -> None:
        with self._lock:
            self._active_session = None
            self._session_started_at = None
            self._session_step = 0
            self._session_total_steps = 0

    # ─── Sampling loop ────────────────────────────────────────────────────
    def _run(self) -> None:
        while not self._stop.wait(self.interval):
            try:
                sample = self._collect_sample()
                with self._lock:
                    self._buffer.append(sample)
            except Exception:
                # Never crash the monitor thread
                pass

    def _collect_sample(self) -> dict[str, Any]:
        ts = time.time()
        sample: dict[str, Any] = {"ts": round(ts, 3)}

        # CPU + RAM
        if HAS_PSUTIL:
            sample["cpu_percent"] = psutil.cpu_percent(interval=None)
            vm = psutil.virtual_memory()
            sample["ram_used_gb"] = round((vm.total - vm.available) / 1024**3, 2)
            sample["ram_total_gb"] = round(vm.total / 1024**3, 2)
        else:
            sample["cpu_percent"] = None

        # CUDA (if available)
        if HAS_TORCH and torch.cuda.is_available():
            try:
                idx = torch.cuda.current_device()
                free, total = torch.cuda.mem_get_info(idx)
                sample["gpu_mem_used_gb"] = round((total - free) / 1024**3, 2)
                sample["gpu_mem_total_gb"] = round(total / 1024**3, 2)
                # Best-effort GPU util via nvidia-smi (cheap query)
                try:
                    out = subprocess.check_output([
                        "nvidia-smi", "--query-gpu=utilization.gpu,temperature.gpu",
                        "--format=csv,noheader,nounits"
                    ], text=True, timeout=1)
                    util_str, temp_str = out.strip().split(",")
                    sample["gpu_percent"] = float(util_str.strip())
                    sample["gpu_temp_c"] = float(temp_str.strip())
                except Exception:
                    pass
            except Exception:
                pass

        # Apple powermetrics is sandboxed, but we can read /proc-equivalent on macOS
        # for ANE residency: not available without root. Skip.

        return sample

    # ─── Public read API ─────────────────────────────────────────────────
    def snapshot(self, last_n: int = 60) -> dict[str, Any]:
        with self._lock:
            recent = list(self._buffer)[-last_n:]
            session = {
                "name": self._active_session,
                "step": self._session_step,
                "total_steps": self._session_total_steps,
                "elapsed_s": (
                    round(time.time() - self._session_started_at, 2)
                    if self._session_started_at is not None else 0.0
                ),
            } if self._active_session else None
        return {
            "samples": recent,
            "session": session,
            "interval_ms": int(self.interval * 1000),
        }


# Auto-start when imported
DeviceMonitor.instance().start()
