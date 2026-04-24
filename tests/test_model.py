#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import unittest
import torch
from diffusers import LDMSuperResolutionPipeline

from betaclarity.core.models import EnhancedLatentDiffusionModel

class TestEnhancedLatentDiffusionModel(unittest.TestCase):
    """Test cases for the Enhanced Latent Diffusion Model."""
    
    def setUp(self):
        """Set up model for testing."""
        # Use CPU for tests
        self.device = torch.device("cpu")
        
        # Load pipeline
        pipeline = LDMSuperResolutionPipeline.from_pretrained("CompVis/ldm-super-resolution-4x-openimages")
        
        # Create model
        self.model = EnhancedLatentDiffusionModel(
            pipeline=pipeline,
            mask_ratio=0.1,
            wavelet_mask_ratio=0.1
        )
        self.model.to(self.device)
        self.model.eval()
    
    def test_model_components(self):
        """Test that model has required components."""
        self.assertIsNotNone(self.model.vae)
        self.assertIsNotNone(self.model.unet)
        self.assertEqual(self.model.mask_ratio, 0.1)
        self.assertEqual(self.model.wavelet_mask_ratio, 0.1)
    
    def test_pad_channels(self):
        """Test channel padding."""
        latent = torch.randn(1, 4, 64, 64).to(self.device)
        
        # Pad to 8 channels
        padded = self.model.pad_channels(latent, 8)
        
        # Check padded shape
        self.assertEqual(padded.shape, (1, 8, 64, 64))
        
        # Check that original channels are preserved
        self.assertTrue(torch.allclose(padded[:, :4, :, :], latent))

if __name__ == '__main__':
    unittest.main() 