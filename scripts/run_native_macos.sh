#!/usr/bin/env bash
# ==========================================================================
#  BETACLARITY — native macOS launcher with Apple Neural Engine (ANE)
# ==========================================================================
#
#  Why this script exists:
#    Docker Desktop on macOS does NOT expose the Apple Neural Engine to
#    Linux containers (the host must talk to CoreML directly). To run
#    BETACLARITY with INT8 acceleration on the ANE, we launch the backend
#    natively in a Python venv with `onnxruntime` providing the
#    CoreMLExecutionProvider, plus the React frontend served by `serve`.
#
#  Requirements:
#    - macOS 12 Monterey or newer on Apple Silicon (M1 / M2 / M3 / M4)
#    - Python 3.10 or 3.11
#    - Node.js 18+ (only for first-time frontend build)
#    - Internet (first run only — to download model + npm deps)
#
#  Usage:
#    ./scripts/run_native_macos.sh                # FP32 PyTorch on MPS
#    ./scripts/run_native_macos.sh --quantized    # INT8 ONNX on Apple NPU
#    ./scripts/run_native_macos.sh --port 9000    # custom UI port
# ==========================================================================
set -euo pipefail

QUANTIZED=0
PORT=8080
while [[ $# -gt 0 ]]; do
    case "$1" in
        --quantized) QUANTIZED=1; shift ;;
        --port)      PORT="$2"; shift 2 ;;
        --help|-h)   sed -n '2,25p' "$0"; exit 0 ;;
        *)           echo "Unknown flag: $1" >&2; exit 1 ;;
    esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.venv-native"
INTERFACE="$ROOT/interface"
BACKEND="$INTERFACE/backend"

# ── Sanity ────────────────────────────────────────────────────────────────
if [[ "$(uname)" != "Darwin" ]]; then
    echo "ERROR: This script is for macOS only." >&2
    exit 1
fi
ARCH="$(uname -m)"
if [[ "$ARCH" != "arm64" ]]; then
    echo "WARNING: You are on $ARCH — Apple Neural Engine requires Apple Silicon (arm64)." >&2
fi

# ── Python venv ───────────────────────────────────────────────────────────
if [[ ! -d "$VENV" ]]; then
    echo "[1/5] Creating Python venv at $VENV ..."
    python3 -m venv "$VENV"
fi
# shellcheck disable=SC1091
source "$VENV/bin/activate"

echo "[2/5] Installing Python dependencies ..."
pip install --upgrade pip --quiet
pip install --quiet \
    Flask flask-cors pydicom numpy scikit-image Pillow matplotlib psutil \
    opencv-python-headless huggingface-hub gunicorn

if [[ "$QUANTIZED" -eq 1 ]]; then
    pip install --quiet onnxruntime          # ships CoreMLExecutionProvider on macOS arm64
    pip install --quiet diffusers transformers accelerate
    export BETACLARITY_BACKEND="onnx-coreml"
    export BETACLARITY_HF_REPO="OdaxAI/betaclarity-betasr-onnx"
    export BETACLARITY_HF_FILE="model_quantized.onnx"
else
    pip install --quiet torch torchvision     # arm64 wheels include MPS
    pip install --quiet diffusers transformers accelerate
    export BETACLARITY_BACKEND="pytorch-mps"
    export BETACLARITY_HF_REPO="OdaxAI/betaclarity-betasr"
    export BETACLARITY_HF_FILE="model.pth"
fi

# ── Model download ────────────────────────────────────────────────────────
MODEL_DIR="$BACKEND/model"
mkdir -p "$MODEL_DIR"
MODEL_PATH="$MODEL_DIR/$BETACLARITY_HF_FILE"
if [[ ! -f "$MODEL_PATH" ]]; then
    echo "[3/5] Downloading $BETACLARITY_HF_FILE from $BETACLARITY_HF_REPO ..."
    python - <<PY
import os
from huggingface_hub import hf_hub_download
hf_hub_download(
    repo_id=os.environ["BETACLARITY_HF_REPO"],
    filename=os.environ["BETACLARITY_HF_FILE"],
    local_dir="$MODEL_DIR",
)
PY
else
    echo "[3/5] Model already present at $MODEL_PATH"
fi

# ── Frontend build (first run only) ───────────────────────────────────────
DIST_DIR="$INTERFACE/dist"
if [[ ! -d "$DIST_DIR" || -z "$(ls -A "$DIST_DIR" 2>/dev/null)" ]]; then
    echo "[4/5] Building React frontend (first run only) ..."
    pushd "$INTERFACE" >/dev/null
    if [[ ! -d node_modules ]]; then
        npm install --silent
    fi
    REACT_APP_API_URL="http://localhost:8001" npx webpack --mode production
    popd >/dev/null
else
    echo "[4/5] Frontend already built — skipping rebuild."
fi

# ── Launch backend + static server ────────────────────────────────────────
echo "[5/5] Launching BETACLARITY natively on macOS"
echo "       Backend  : http://localhost:8001"
echo "       Frontend : http://localhost:$PORT"
echo "       Backend  : $BETACLARITY_BACKEND"
echo "       Model    : $BETACLARITY_HF_REPO/$BETACLARITY_HF_FILE"
[[ "$QUANTIZED" -eq 1 ]] && echo "       NPU path : Apple Neural Engine via CoreMLExecutionProvider"
echo "       (Press Ctrl+C to stop)"

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# Backend
( cd "$BACKEND" && python app.py ) &

# Frontend (use python http.server — no extra dep)
( cd "$DIST_DIR" && python -m http.server "$PORT" ) &

wait
