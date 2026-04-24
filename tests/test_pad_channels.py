"""Unit tests for utility methods that do not require a loaded pipeline."""
import torch

from betaclarity.core.models.latent_diffusion import EnhancedLatentDiffusionModel


def _make_model_without_pipeline():
    """Create an EnhancedLatentDiffusionModel instance bypassing __init__.

    This avoids downloading a 1.5GB HuggingFace pipeline during CI.
    """
    model = EnhancedLatentDiffusionModel.__new__(EnhancedLatentDiffusionModel)
    return model


def test_pad_channels_no_op():
    model = _make_model_without_pipeline()
    x = torch.randn(1, 8, 16, 16)
    out = model.pad_channels(x, target_channels=8)
    assert out.shape == x.shape
    assert torch.equal(out, x)


def test_pad_channels_extends_with_zeros():
    model = _make_model_without_pipeline()
    x = torch.randn(1, 4, 16, 16)
    out = model.pad_channels(x, target_channels=8)
    assert out.shape == (1, 8, 16, 16)
    assert torch.equal(out[:, :4], x)
    assert torch.equal(out[:, 4:], torch.zeros_like(out[:, 4:]))


def test_apply_random_mask_zero_ratio_is_identity():
    model = _make_model_without_pipeline()
    x = torch.randn(2, 4, 8, 8)
    out = model.apply_random_mask(x, ratio=0.0)
    assert torch.equal(out, x)


def test_apply_random_mask_drops_some_values():
    model = _make_model_without_pipeline()
    torch.manual_seed(0)
    x = torch.ones(1, 1, 100, 100)
    out = model.apply_random_mask(x, ratio=0.5)
    # Roughly half the pixels should be zeroed out
    zero_fraction = (out == 0).float().mean().item()
    assert 0.3 < zero_fraction < 0.7
