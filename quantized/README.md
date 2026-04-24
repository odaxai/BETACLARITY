# Quantization scripts (OdaxAI SDK)

This folder contains the scripts used to produce the quantized ONNX bundle
published at https://huggingface.co/OdaxAI/betaclarity-betasr-onnx.

## Files

| File | Purpose |
|---|---|
| `export_betasr.py` | Loads the PyTorch checkpoint, exports UNet + VQ-VAE to ONNX, then quantizes the UNet to INT8 with the [OdaxAI SDK](https://github.com/odaxai/odaxai-sdk). |
| `inference_onnx.py` | Standalone DDIM inference loop on the ONNX bundle (no PyTorch required at runtime). |

## Usage

```bash
pip install \
  'odaxai @ git+https://github.com/odaxai/odaxai-sdk' \
  torch diffusers onnx onnxruntime onnxscript pillow numpy

# Export + quantize (one-shot, ~30s on Apple Silicon)
python export_betasr.py \
  --checkpoint ./weights/model.pth \
  --out-dir ./build

# Inference
python inference_onnx.py \
  --model-dir ./build \
  --input scan.png \
  --output enhanced.png \
  --steps 10
```

## Output

| Artifact | Size | Notes |
|---|---|---|
| `betasr_unet_fp32.onnx` | 434 MB | Reference UNet (full precision) |
| `betasr_unet_int8.onnx` | 109 MB | **Quantized with OdaxAI SDK (3.97x compression)** |
| `vqvae_encoder.onnx` | 85 MB | VQ-VAE encoder (frozen) |
| `vqvae_decoder.onnx` | 126 MB | VQ-VAE decoder (frozen) |
