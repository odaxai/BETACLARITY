"""Lightweight import/smoke tests for CI.

These tests do not download any model weights and complete in a few seconds.
"""
import importlib

import pytest


def test_package_importable():
    """The top-level package must be importable."""
    pkg = importlib.import_module("betaclarity")
    assert pkg is not None


def test_core_submodules_importable():
    """Each core submodule must be importable without side effects."""
    for name in [
        "betaclarity.core",
        "betaclarity.core.models",
        "betaclarity.core.datasets",
        "betaclarity.core.trainers",
        "betaclarity.core.utils",
    ]:
        mod = importlib.import_module(name)
        assert mod is not None, f"failed to import {name}"


def test_model_class_exposed():
    """EnhancedLatentDiffusionModel must be importable from the public API."""
    from betaclarity.core.models import EnhancedLatentDiffusionModel
    assert EnhancedLatentDiffusionModel is not None


def test_torch_available():
    """PyTorch must be importable as a hard dependency."""
    import torch
    assert torch.__version__


def test_diffusers_available():
    """Hugging Face Diffusers must be importable as a hard dependency."""
    import diffusers
    assert diffusers.__version__


def test_pywavelets_available():
    """PyWavelets must be importable for wavelet regularization."""
    import pywt
    assert pywt.__version__
