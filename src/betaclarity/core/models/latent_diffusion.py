#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import torch
import torch.nn as nn
import torch.nn.functional as F
import pywt
import numpy as np

class EnhancedLatentDiffusionModel(nn.Module):
    """
    Enhanced Latent Diffusion Model for super-resolution and denoising.
    Wraps the LDMSuperResolutionPipeline from diffusers.
    
    Features:
    - Latent space processing for efficiency
    - Optional random masking for regularization
    - Wavelet-based processing for multi-scale feature learning
    """
    def __init__(
        self,
        pipeline,
        scale_factor=0.18215,
        mask_ratio=0.0,
        wavelet_mask_ratio=0.0
    ):
        super().__init__()
        self.pipeline = pipeline
        self.vae = pipeline.vqvae
        self.unet = pipeline.unet
        self.scheduler = pipeline.scheduler
        self.vae.requires_grad_(False)  # Freeze VAE weights
        self.scale_factor = scale_factor
        self.mask_ratio = mask_ratio
        self.wavelet_mask_ratio = wavelet_mask_ratio
        
        # Get the expected UNet input channels
        self.unet_in_channels = self.unet.in_channels

    @torch.no_grad()
    def encode_latents(self, images: torch.Tensor) -> torch.Tensor:
        """
        Encode images to latent space using the pre-trained VAE.
        Args:
            images: [B, 3, H, W] tensor of normalized images (-1 to 1)
        Returns:
            [B, C, H/f, W/f] latents where f is the VAE's downsampling factor
        """
        return self.vae.encode(images).latent_dist.sample() * self.scale_factor

    @torch.no_grad()
    def decode_latents(self, latents: torch.Tensor) -> torch.Tensor:
        """
        Decode latent vectors back to images.
        Args:
            latents: [B, C, H, W] latent vectors
        Returns:
            [B, 3, H*f, W*f] decoded images (-1 to 1) where f is the VAE's upsampling factor
        """
        # Scale latents back
        latents = latents / self.scale_factor
        return self.vae.decode(latents).sample

    def pad_channels(self, x: torch.Tensor, target_channels: int) -> torch.Tensor:
        """
        Pad the number of channels to match UNet input channels if necessary.
        Args:
            x: [B, C, H, W] latent tensor
            target_channels: The desired number of channels
        Returns:
            [B, target_channels, H, W] padded tensor
        """
        _, c, _, _ = x.shape
        if c == target_channels:
            return x
        
        # Pad with zeros to reach target_channels
        padding_channels = target_channels - c
        padding = torch.zeros_like(x[:, :1, :, :]).repeat(1, padding_channels, 1, 1)
        return torch.cat([x, padding], dim=1)

    def apply_random_mask(self, latents: torch.Tensor, ratio: float) -> torch.Tensor:
        """Apply random masking to latent vectors for regularization."""
        if ratio <= 0:
            return latents
        mask = torch.rand_like(latents) > ratio
        return latents * mask

    def wavelet_decompose(self, latents):
        """
        Apply 2D wavelet decomposition to latent tensors.
        
        Args:
            latents: Tensor of shape [B, C, H, W]
            
        Returns:
            List of tuples containing wavelet coefficients
        """
        # Move to CPU for wavelet transform
        device = latents.device
        latents_cpu = latents.detach().cpu().numpy()
        
        batch_size, channels, height, width = latents.shape
        all_coeffs = []
        
        # Process each image in the batch
        for b in range(batch_size):
            # Process each channel
            chan_coeffs = []
            for c in range(channels):
                # Apply wavelet transform
                coeffs = pywt.wavedec2(latents_cpu[b, c], 'db1', level=2)
                chan_coeffs.append(coeffs)
            all_coeffs.append(chan_coeffs)
            
        return all_coeffs, device, latents.shape

    def wavelet_recompose(self, all_coeffs, device, shape):
        """
        Recompose latents from wavelet coefficients.
        
        Args:
            all_coeffs: List of wavelet coefficients
            device: Target device for tensors
            shape: Original tensor shape
            
        Returns:
            Tensor of shape [B, C, H, W]
        """
        batch_size, channels = shape[:2]
        recomposed = np.zeros(shape)
        
        # Process each image in the batch
        for b in range(batch_size):
            # Process each channel
            for c in range(channels):
                # Recompose from wavelet coefficients
                recomposed[b, c] = pywt.waverec2(all_coeffs[b][c], 'db1')
                
        # Convert back to tensor and move to device
        return torch.tensor(recomposed, dtype=torch.float32).to(device)

    def apply_wavelet_mask(self, wavelet_coeffs, ratio: float):
        """
        Apply masking to wavelet coefficients for regularization.
        
        Args:
            wavelet_coeffs: List of wavelet coefficients
            ratio: Masking ratio (0 to 1)
            
        Returns:
            Masked wavelet coefficients
        """
        if ratio <= 0:
            return wavelet_coeffs
            
        batch_size = len(wavelet_coeffs)
        channels = len(wavelet_coeffs[0])
        
        # Apply masking to detail coefficients only (not approximation)
        for b in range(batch_size):
            for c in range(channels):
                coeffs = wavelet_coeffs[b][c]
                
                # The first element is the approximation, leave it unchanged
                # Process detail coefficients
                for level in range(1, len(coeffs)):
                    # Each level has horizontal, vertical, and diagonal details
                    for i in range(3):
                        mask = np.random.rand(*coeffs[level][i].shape) > ratio
                        coeffs[level][i] = coeffs[level][i] * mask
                        
        return wavelet_coeffs

    def forward(self, degraded_imgs, clean_imgs):
        """
        Forward pass of the latent diffusion model.
        Args:
            degraded_imgs: [B, 3, H, W] tensor of degraded images (normalized -1 to 1)
            clean_imgs: [B, 3, H, W] tensor of clean target images (normalized -1 to 1)
        Returns:
            loss: MSE loss between predicted and target latents
            clean_latents: Encoded latents of clean images
            predicted_latents: Predicted latents
        """
        # Encode degraded and clean images to latent space
        with torch.no_grad():
            degraded_latents = self.encode_latents(degraded_imgs)
            clean_latents = self.encode_latents(clean_imgs)
        
        # Apply masking if specified
        if self.mask_ratio > 0:
            degraded_latents = self.apply_random_mask(degraded_latents, self.mask_ratio)
            
        # Apply wavelet masking if specified
        if self.wavelet_mask_ratio > 0:
            # Decompose to wavelet domain
            wav_coeffs, device, shape = self.wavelet_decompose(degraded_latents)
            
            # Apply masking to wavelet coefficients
            masked_coeffs = self.apply_wavelet_mask(wav_coeffs, self.wavelet_mask_ratio)
            
            # Recompose to spatial domain
            degraded_latents = self.wavelet_recompose(masked_coeffs, device, shape)
        
        # Ensure the latents match UNet's expected input channels
        degraded_latents = self.pad_channels(degraded_latents, self.unet_in_channels)
        
        # Forward through UNet to predict noise-free latents
        predicted_latents = self.unet(degraded_latents).sample
        
        # Calculate loss in latent space
        loss = F.mse_loss(predicted_latents, clean_latents)
        
        return loss, clean_latents, predicted_latents

    @torch.no_grad()
    def reconstruct(self, degraded_imgs, ddim_steps=5, show_progress=False):
        """
        Reconstruct clean images from degraded ones using the DDIM scheduler for improved quality.
        
        Args:
            degraded_imgs: [B, 3, H, W] tensor of degraded images (normalized -1 to 1)
            ddim_steps: Number of denoising steps (higher = better quality but slower)
            show_progress: Whether to show progress bar during sampling
            
        Returns:
            [B, 3, H, W] tensor of reconstructed images (normalized -1 to 1)
        """
        # Encode degraded images to latent space
        degraded_latents = self.encode_latents(degraded_imgs)
        
        # Ensure the latents match UNet's expected input channels
        degraded_latents = self.pad_channels(degraded_latents, self.unet_in_channels)
        
        # Get scheduler for controlled sampling
        try:
            scheduler = self.scheduler
        except AttributeError:
            from diffusers import DDIMScheduler
            scheduler = DDIMScheduler(
                beta_start=0.00085, 
                beta_end=0.012, 
                beta_schedule="scaled_linear",
                num_train_timesteps=1000
            )
        
        # Set scheduler parameters
        scheduler.set_timesteps(ddim_steps)
        
        # Use DDIM scheduler for controlled sampling
        latents = degraded_latents
        iterator = scheduler.timesteps
        
        if show_progress:
            from tqdm import tqdm
            iterator = tqdm(iterator, desc="DDIM Sampling")
            
        for t in iterator:
            # Predict noise and get denoised latent
            model_output = self.unet(latents, t).sample
            
            # DDIM step
            latents = scheduler.step(model_output, t, latents).prev_sample
        
        # Decode predicted latents back to image space
        reconstructed_imgs = self.decode_latents(latents)
        
        return reconstructed_imgs 