#!/usr/bin/env python3
"""
Standalone inference for the BETACLARITY/BetaSR quantized ONNX bundle.

This script loads:
  - betasr_unet_int8.onnx       (110 MB, 4x smaller than fp32)
  - vqvae_encoder.onnx          (85 MB)
  - vqvae_decoder.onnx          (126 MB)

and runs a full DDIM-style super-resolution pass without PyTorch.

On macOS it auto-uses the CoreML Execution Provider for Apple Neural Engine
acceleration; on Linux it falls back to CPU (CPUExecutionProvider) or CUDA
(CUDAExecutionProvider) when available.

Quantization was performed with the OdaxAI SDK
(https://github.com/odaxai/odaxai-sdk) using its INT8 / per-channel weight
strategy. See the model card on Hugging Face for details.
"""
from __future__ import annotations

import argparse
import platform
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

NUM_TRAIN_TIMESTEPS = 1000


def get_providers() -> list[str]:
    """Pick the best ONNXRuntime providers for the current machine."""
    available = set(ort.get_available_providers())
    preferred: list[str] = []
    if platform.system() == "Darwin" and "CoreMLExecutionProvider" in available:
        preferred.append("CoreMLExecutionProvider")
    if "CUDAExecutionProvider" in available:
        preferred.append("CUDAExecutionProvider")
    preferred.append("CPUExecutionProvider")
    return preferred


def load_session(path: Path) -> ort.InferenceSession:
    return ort.InferenceSession(str(path), providers=get_providers())


def make_ddim_schedule(num_inference_steps: int) -> tuple[np.ndarray, np.ndarray]:
    """Compute alphas_cumprod for the DDIM scheduler used by LDM-SR."""
    beta_start, beta_end = 0.00085, 0.012
    betas = np.linspace(beta_start ** 0.5, beta_end ** 0.5, NUM_TRAIN_TIMESTEPS, dtype=np.float64) ** 2
    alphas = 1.0 - betas
    alphas_cumprod = np.cumprod(alphas, axis=0)

    step = NUM_TRAIN_TIMESTEPS // num_inference_steps
    timesteps = (np.arange(num_inference_steps) * step)[::-1].astype(np.int64)
    return timesteps, alphas_cumprod.astype(np.float32)


def preprocess(image: Image.Image, size: int) -> np.ndarray:
    image = image.convert("RGB").resize((size, size), Image.BICUBIC)
    arr = np.asarray(image, dtype=np.float32) / 255.0
    arr = arr * 2.0 - 1.0  # [-1, 1]
    return arr.transpose(2, 0, 1)[None]  # NCHW


def postprocess(arr: np.ndarray) -> Image.Image:
    arr = (arr.clip(-1, 1) + 1.0) / 2.0
    arr = (arr[0].transpose(1, 2, 0) * 255.0).clip(0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", type=Path, required=True,
                        help="Directory containing *.onnx files")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--steps", type=int, default=10)
    parser.add_argument("--low-res-size", type=int, default=128)
    parser.add_argument("--use-fp32", action="store_true",
                        help="Use the fp32 UNet instead of the INT8 quantized one")
    args = parser.parse_args()

    print(f"Providers: {get_providers()}")

    unet_name = "betasr_unet_fp32.onnx" if args.use_fp32 else "betasr_unet_int8.onnx"
    unet = load_session(args.model_dir / unet_name)
    decoder = load_session(args.model_dir / "vqvae_decoder.onnx")

    timesteps, alphas_cumprod = make_ddim_schedule(args.steps)

    # Encode the low-res image to act as conditioning
    low_res = preprocess(Image.open(args.input), args.low_res_size)

    # Initialize noise at the same spatial resolution as low_res
    rng = np.random.default_rng(0)
    sample = rng.standard_normal(low_res.shape).astype(np.float32)

    print(f"Running DDIM with {args.steps} steps using {unet_name}...")
    for i, t in enumerate(timesteps):
        model_input = np.concatenate([sample, low_res], axis=1)  # 6 channels
        noise_pred = unet.run(None, {
            "sample": model_input,
            "timestep": np.array([t], dtype=np.int64),
        })[0]

        # DDIM step (eta=0)
        alpha_t = alphas_cumprod[t]
        alpha_prev = alphas_cumprod[timesteps[i + 1]] if i + 1 < len(timesteps) else 1.0
        pred_x0 = (sample - (1 - alpha_t) ** 0.5 * noise_pred) / (alpha_t ** 0.5)
        dir_xt = (1 - alpha_prev) ** 0.5 * noise_pred
        sample = (alpha_prev ** 0.5) * pred_x0 + dir_xt
        print(f"  step {i + 1}/{args.steps}  t={t}")

    print("Decoding latent through VQ-VAE...")
    decoded = decoder.run(None, {"latents": sample})[0]
    out_image = postprocess(decoded)
    out_image.save(args.output)
    print(f"Saved enhanced image to {args.output} ({out_image.size[0]}x{out_image.size[1]})")


if __name__ == "__main__":
    main()
