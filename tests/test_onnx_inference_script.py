"""Lightweight tests for the standalone ONNX inference helpers.

These do not require model weights — they just import the script and
exercise the pure-numpy helpers.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import numpy as np
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = REPO_ROOT / "quantized" / "inference_onnx.py"


@pytest.fixture(scope="module")
def inference_module():
    if not SCRIPT_PATH.exists():
        pytest.skip(f"{SCRIPT_PATH} not found")
    spec = importlib.util.spec_from_file_location("inference_onnx", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules["inference_onnx"] = module
    spec.loader.exec_module(module)
    return module


def test_get_providers_returns_cpu_at_minimum(inference_module):
    providers = inference_module.get_providers()
    assert isinstance(providers, list)
    assert "CPUExecutionProvider" in providers


def test_make_ddim_schedule_shapes(inference_module):
    timesteps, alphas = inference_module.make_ddim_schedule(num_inference_steps=10)
    assert timesteps.shape == (10,)
    assert alphas.shape == (inference_module.NUM_TRAIN_TIMESTEPS,)
    assert timesteps[0] > timesteps[-1], "timesteps must be reverse-ordered"
    assert (alphas > 0).all() and (alphas <= 1).all()


def test_preprocess_postprocess_roundtrip(inference_module):
    from PIL import Image

    rng = np.random.default_rng(0)
    img_arr = (rng.integers(0, 255, size=(64, 64, 3), dtype=np.uint8))
    img = Image.fromarray(img_arr)

    pre = inference_module.preprocess(img, size=32)
    assert pre.shape == (1, 3, 32, 32)
    assert pre.dtype == np.float32
    assert -1.0 <= pre.min() and pre.max() <= 1.0

    post = inference_module.postprocess(pre)
    assert post.size == (32, 32)
    assert post.mode == "RGB"
