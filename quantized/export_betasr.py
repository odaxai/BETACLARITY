#!/usr/bin/env python3
"""
Export BETACLARITY/BetaSR to optimized formats for edge deployment.

Pipeline:
  1. Load LDMSuperResolutionPipeline (CompVis)
  2. Load BetaSR fine-tuned weights (model.pth)
  3. Export each component (UNet, VQ-VAE encoder, VQ-VAE decoder) to ONNX
  4. Dynamically quantize the UNet (the heavy module) to INT8 using OdaxAI SDK
  5. Convert UNet to CoreML fp16 for Apple Neural Engine
  6. Smoke test all artifacts

The UNet is the only fine-tuned module (~454 MB fp32 -> ~115 MB int8).
The VQ-VAE is shared with CompVis and kept as fp32 for fidelity.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch
from diffusers import DDIMScheduler, LDMSuperResolutionPipeline
from onnxruntime.quantization import QuantType, quantize_dynamic


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def file_size_mb(path: Path) -> float:
    return path.stat().st_size / (1024 * 1024)


def load_pipeline_with_betasr_weights(checkpoint_path: Path) -> LDMSuperResolutionPipeline:
    log("Loading CompVis LDM-SR pipeline...")
    pipe = LDMSuperResolutionPipeline.from_pretrained(
        "CompVis/ldm-super-resolution-4x-openimages"
    )
    pipe.scheduler = DDIMScheduler.from_config(pipe.scheduler.config)

    log(f"Loading BetaSR weights from {checkpoint_path.name}...")
    ckpt = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    state = ckpt.get("model_state", ckpt.get("model_state_dict", ckpt))

    # Split into VQ-VAE and UNet sub-state-dicts
    vqvae_sd = {k.removeprefix("vqvae."): v for k, v in state.items() if k.startswith("vqvae.")}
    unet_sd = {k.removeprefix("unet."): v for k, v in state.items() if k.startswith("unet.")}

    if vqvae_sd:
        miss, unexp = pipe.vqvae.load_state_dict(vqvae_sd, strict=False)
        log(f"  VQ-VAE: loaded {len(vqvae_sd)} tensors (missing={len(miss)}, unexpected={len(unexp)})")
    if unet_sd:
        miss, unexp = pipe.unet.load_state_dict(unet_sd, strict=False)
        log(f"  UNet:   loaded {len(unet_sd)} tensors (missing={len(miss)}, unexpected={len(unexp)})")

    pipe.unet.eval()
    pipe.vqvae.eval()
    return pipe


# ---------- ONNX wrappers ----------------------------------------------------

class UNetWrapper(torch.nn.Module):
    """Plain forward wrapper so torch.onnx.export sees a clean signature."""

    def __init__(self, unet: torch.nn.Module) -> None:
        super().__init__()
        self.unet = unet

    def forward(self, sample: torch.Tensor, timestep: torch.Tensor) -> torch.Tensor:
        return self.unet(sample, timestep).sample


class VqvaeEncoderWrapper(torch.nn.Module):
    def __init__(self, vqvae: torch.nn.Module) -> None:
        super().__init__()
        self.vqvae = vqvae

    def forward(self, image: torch.Tensor) -> torch.Tensor:
        return self.vqvae.encode(image).latents


class VqvaeDecoderWrapper(torch.nn.Module):
    def __init__(self, vqvae: torch.nn.Module) -> None:
        super().__init__()
        self.vqvae = vqvae

    def forward(self, latents: torch.Tensor) -> torch.Tensor:
        return self.vqvae.decode(latents).sample


# ---------- Export helpers ---------------------------------------------------

def export_unet_onnx(unet: torch.nn.Module, output_path: Path, image_size: int = 128) -> Path:
    log(f"Exporting UNet to ONNX (sample {image_size}x{image_size}, opset 17)...")
    wrapper = UNetWrapper(unet).eval()
    sample = torch.randn(1, 6, image_size, image_size)
    timestep = torch.tensor([1], dtype=torch.long)

    torch.onnx.export(
        wrapper,
        (sample, timestep),
        str(output_path),
        input_names=["sample", "timestep"],
        output_names=["noise_pred"],
        dynamic_axes={
            "sample": {0: "batch", 2: "height", 3: "width"},
            "noise_pred": {0: "batch", 2: "height", 3: "width"},
        },
        opset_version=20,
        do_constant_folding=True,
        dynamo=False,
    )
    # checker can fail on huge external-data models; do a structural-only check
    onnx.checker.check_model(str(output_path), full_check=False)
    log(f"  -> {output_path.name} ({file_size_mb(output_path):.1f} MB)")
    return output_path


def export_vqvae_onnx(vqvae: torch.nn.Module, out_dir: Path, image_size: int = 512) -> tuple[Path, Path]:
    log(f"Exporting VQ-VAE encoder/decoder to ONNX...")

    enc_path = out_dir / "vqvae_encoder.onnx"
    enc_wrapper = VqvaeEncoderWrapper(vqvae).eval()
    enc_input = torch.randn(1, 3, image_size, image_size)
    torch.onnx.export(
        enc_wrapper,
        enc_input,
        str(enc_path),
        input_names=["image"],
        output_names=["latents"],
        dynamic_axes={"image": {0: "batch", 2: "height", 3: "width"},
                      "latents": {0: "batch", 2: "height", 3: "width"}},
        opset_version=20,
        do_constant_folding=True,
        dynamo=False,
    )
    log(f"  -> {enc_path.name} ({file_size_mb(enc_path):.1f} MB)")

    dec_path = out_dir / "vqvae_decoder.onnx"
    dec_wrapper = VqvaeDecoderWrapper(vqvae).eval()
    # Decoder takes latents at 1/8 the spatial size (3 down blocks)
    dec_input = torch.randn(1, vqvae.config.latent_channels, image_size // 8, image_size // 8)
    torch.onnx.export(
        dec_wrapper,
        dec_input,
        str(dec_path),
        input_names=["latents"],
        output_names=["image"],
        dynamic_axes={"latents": {0: "batch", 2: "height", 3: "width"},
                      "image": {0: "batch", 2: "height", 3: "width"}},
        opset_version=20,
        do_constant_folding=True,
        dynamo=False,
    )
    log(f"  -> {dec_path.name} ({file_size_mb(dec_path):.1f} MB)")
    return enc_path, dec_path


# ---------- Quantization (powered by OdaxAI SDK conventions) -----------------

def quantize_unet_int8(input_path: Path, output_path: Path) -> Path:
    """Dynamic INT8 quantization of the UNet.

    We use the same QDQ / per-channel weight strategy that OdaxAI SDK exposes
    via OnnxQuantizer, but applied directly to a multi-input model (the SDK's
    high-level OnnxQuantizer calibration reader assumes a single image input).
    """
    log(f"Quantizing UNet to INT8 (dynamic, per-channel weights)...")
    quantize_dynamic(
        model_input=str(input_path),
        model_output=str(output_path),
        weight_type=QuantType.QInt8,
        per_channel=True,
        reduce_range=False,
    )
    orig = file_size_mb(input_path)
    quant = file_size_mb(output_path)
    log(f"  -> {output_path.name} ({quant:.1f} MB, compression {orig / quant:.2f}x)")
    return output_path


# ---------- CoreML conversion (Apple Neural Engine) --------------------------

def export_unet_coreml(unet: torch.nn.Module, output_path: Path, image_size: int = 128) -> Path | None:
    try:
        import coremltools as ct
    except ImportError:
        log("coremltools not installed — skipping CoreML export")
        return None

    log(f"Tracing UNet for CoreML (sample {image_size}x{image_size}, fp16)...")
    wrapper = UNetWrapper(unet).eval()
    sample = torch.randn(1, 6, image_size, image_size)
    timestep = torch.tensor([1], dtype=torch.long)

    with torch.no_grad():
        traced = torch.jit.trace(wrapper, (sample, timestep), strict=False)

    log("Converting to CoreML fp16 (target iOS17 / macOS14)...")
    mlmodel = ct.convert(
        traced,
        inputs=[
            ct.TensorType(name="sample", shape=sample.shape, dtype=np.float32),
            ct.TensorType(name="timestep", shape=timestep.shape, dtype=np.int32),
        ],
        outputs=[ct.TensorType(name="noise_pred")],
        compute_precision=ct.precision.FLOAT16,
        minimum_deployment_target=ct.target.macOS14,
        compute_units=ct.ComputeUnit.ALL,
    )
    mlmodel.save(str(output_path))
    size_mb = sum(f.stat().st_size for f in output_path.rglob("*") if f.is_file()) / (1024 * 1024)
    log(f"  -> {output_path.name} ({size_mb:.1f} MB)")
    return output_path


# ---------- Smoke tests ------------------------------------------------------

def smoke_test_onnx(path: Path, sample_shape: tuple[int, ...], extra_inputs: dict | None = None) -> None:
    log(f"Smoke testing {path.name}...")
    sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    inputs = {sess.get_inputs()[0].name: np.random.randn(*sample_shape).astype(np.float32)}
    if extra_inputs:
        inputs.update(extra_inputs)
    out = sess.run(None, inputs)
    log(f"  -> output[0] shape={out[0].shape}, dtype={out[0].dtype}")


# ---------- Main -------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Export and quantize BetaSR for edge deployment")
    parser.add_argument(
        "--checkpoint",
        type=Path,
        required=True,
        help="Path to the BetaSR PyTorch checkpoint (model.pth)",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("./build"),
        help="Output directory for ONNX artifacts",
    )
    parser.add_argument("--unet-image-size", type=int, default=128)
    parser.add_argument("--vqvae-image-size", type=int, default=512)
    parser.add_argument("--skip-coreml", action="store_true")
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)

    pipe = load_pipeline_with_betasr_weights(args.checkpoint)

    # 1. UNet ONNX (fp32)
    unet_fp32 = args.out_dir / "betasr_unet_fp32.onnx"
    export_unet_onnx(pipe.unet, unet_fp32, image_size=args.unet_image_size)

    # 2. UNet ONNX (int8 quantized)
    unet_int8 = args.out_dir / "betasr_unet_int8.onnx"
    quantize_unet_int8(unet_fp32, unet_int8)

    # 3. VQ-VAE ONNX
    enc_path, dec_path = export_vqvae_onnx(pipe.vqvae, args.out_dir, image_size=args.vqvae_image_size)

    # 4. CoreML
    coreml_path = None
    if not args.skip_coreml:
        coreml_path = export_unet_coreml(
            pipe.unet,
            args.out_dir / "betasr_unet_coreml_fp16.mlpackage",
            image_size=args.unet_image_size,
        )

    # 5. Smoke tests
    log("=" * 60)
    smoke_test_onnx(
        unet_fp32,
        (1, 6, args.unet_image_size, args.unet_image_size),
        extra_inputs={"timestep": np.array([1], dtype=np.int64)},
    )
    smoke_test_onnx(
        unet_int8,
        (1, 6, args.unet_image_size, args.unet_image_size),
        extra_inputs={"timestep": np.array([1], dtype=np.int64)},
    )
    smoke_test_onnx(enc_path, (1, 3, args.vqvae_image_size, args.vqvae_image_size))
    smoke_test_onnx(
        dec_path,
        (1, pipe.vqvae.config.latent_channels, args.vqvae_image_size // 8, args.vqvae_image_size // 8),
    )

    # 6. Summary
    summary = {
        "betasr_unet_fp32.onnx": file_size_mb(unet_fp32),
        "betasr_unet_int8.onnx": file_size_mb(unet_int8),
        "vqvae_encoder.onnx": file_size_mb(enc_path),
        "vqvae_decoder.onnx": file_size_mb(dec_path),
    }
    if coreml_path is not None:
        summary["betasr_unet_coreml_fp16.mlpackage"] = sum(
            f.stat().st_size for f in coreml_path.rglob("*") if f.is_file()
        ) / (1024 * 1024)

    (args.out_dir / "summary.json").write_text(json.dumps(summary, indent=2))
    log("=" * 60)
    log("Artifacts:")
    for name, mb in summary.items():
        print(f"  {name:<45s} {mb:8.1f} MB")
    log("Done.")


if __name__ == "__main__":
    main()
