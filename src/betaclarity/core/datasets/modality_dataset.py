#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import random
import torch
import numpy as np
from torch.utils.data import Dataset
import torchvision.transforms as transforms
from PIL import Image

class ModalityDataset(Dataset):
    """
    Dataset for medical image modalities with degradation simulation.
    Supports degradation by noise, downscaling, or both.
    
    Each item returned is a tuple:
    (degraded_img, clean_img, degradation_info, noise_type, downscale_factor)
    """
    def __init__(
        self,
        image_paths,
        crop_size=256,
        degradation_cases=['noise','downscale','both'],
        downscale_levels=[0.1, 0.2, 0.25],
        noise_types=['gaussian','salt-pepper','speckle','poisson','rician'],
        augment=False,
        aggressive=False
    ):
        self.image_paths = image_paths
        self.crop_size = crop_size
        self.degradation_cases = degradation_cases
        self.downscale_levels = downscale_levels
        self.noise_types = noise_types
        self.augment = augment
        self.aggressive = aggressive
        
        # Set up transforms
        self.transform = transforms.Compose([
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5])
        ])
        
        # More aggressive transformations for data augmentation
        if augment:
            self.aug_transform = transforms.Compose([
                transforms.RandomHorizontalFlip(),
                transforms.RandomVerticalFlip(),
                transforms.RandomAffine(
                    degrees=45 if aggressive else 20,
                    scale=(0.8, 1.2) if aggressive else (0.9, 1.1)
                )
            ])
    
    def __len__(self):
        return len(self.image_paths)
    
    def __getitem__(self, idx):
        # Load image
        img_path = self.image_paths[idx]
        image = Image.open(img_path).convert('RGB')
        
        # Apply random crop
        w, h = image.size
        if w < self.crop_size or h < self.crop_size:
            # Resize if image is too small
            image = transforms.Resize(self.crop_size)(image)
            w, h = image.size
        
        # Apply random crop
        i = random.randint(0, max(0, w - self.crop_size))
        j = random.randint(0, max(0, h - self.crop_size))
        clean_image = image.crop((i, j, i + self.crop_size, j + self.crop_size))
        
        # Apply data augmentation if enabled
        if self.augment:
            clean_image = self.aug_transform(clean_image)
        
        # Apply transformations and degradation
        clean_tensor = self.transform(clean_image)
        degraded_tensor, degradation_info, noise_type, ds_factor = self.apply_degradation(clean_tensor)
        
        return degraded_tensor, clean_tensor, degradation_info, noise_type, ds_factor
    
    def apply_degradation(self, x):
        """
        Apply random degradation based on chosen case.
        
        Returns:
            Tuple of (degraded_tensor, degradation_info, noise_type, downscale_factor)
        """
        # Reset/initialize degradation metadata
        self.current_noise_type = "none"
        self.current_ds_factor = 1.0
        
        # Choose degradation case
        case = random.choice(self.degradation_cases)
        
        if case == 'noise':
            degraded = self.add_noise(x)
            degradation_info = f"Noise: {self.current_noise_type}"
        elif case == 'downscale':
            degraded = self.apply_downscale(x)
            degradation_info = f"Downscale: {self.current_ds_factor:.2f}"
        else:  # 'both'
            degraded = self.add_noise(self.apply_downscale(x))
            degradation_info = f"Both: Downscale {self.current_ds_factor:.2f} + {self.current_noise_type} noise"
        
        return degraded, degradation_info, self.current_noise_type, self.current_ds_factor
    
    def apply_downscale(self, x):
        """Apply downscaling to the image."""
        self.current_ds_factor = random.choice(self.downscale_levels)
        
        # Calculate new dimensions
        _, h, w = x.shape
        new_h, new_w = int(h * self.current_ds_factor), int(w * self.current_ds_factor)
        
        # Downscale and upscale back to original size
        return torch.nn.functional.interpolate(
            torch.nn.functional.interpolate(
                x.unsqueeze(0), size=(new_h, new_w), mode='bicubic'
            ),
            size=(h, w), mode='bicubic'
        ).squeeze(0)
    
    def add_noise(self, x):
        """Add noise to the image."""
        self.current_noise_type = random.choice(self.noise_types)
        noise_level = random.uniform(0.02, 0.1)
        
        if self.current_noise_type == 'gaussian':
            return self._add_gaussian_noise(x, noise_level)
        elif self.current_noise_type == 'salt-pepper':
            return self._add_salt_pepper_noise(x, noise_level)
        elif self.current_noise_type == 'speckle':
            return self._add_speckle_noise(x, noise_level)
        elif self.current_noise_type == 'poisson':
            return self._add_poisson_noise(x)
        elif self.current_noise_type == 'rician':
            return self._add_rician_noise(x, noise_level)
        else:
            return x  # Fallback
    
    def _add_gaussian_noise(self, x, std):
        """Add Gaussian noise to the image."""
        noise = torch.randn_like(x) * std
        return torch.clamp(x + noise, -1, 1)
    
    def _add_salt_pepper_noise(self, x, amount):
        """Add salt and pepper noise to the image."""
        salt_pepper = torch.rand_like(x)
        salt = (salt_pepper < amount / 2).float()
        pepper = (salt_pepper > 1 - amount / 2).float()
        return torch.clamp(x * (1 - salt - pepper) + salt - pepper, -1, 1)
    
    def _add_speckle_noise(self, x, std):
        """Add speckle (multiplicative) noise to the image."""
        noise = 1 + torch.randn_like(x) * std
        return torch.clamp(x * noise, -1, 1)
    
    def _add_poisson_noise(self, x):
        """Add Poisson noise to the image."""
        # Transform to [0, 1] range for Poisson simulation
        x_norm = (x + 1) / 2
        
        # Scale factor determines the noise level
        scale = 10.0
        x_scaled = x_norm * scale
        
        # Generate Poisson noise
        x_poisson = torch.poisson(x_scaled)
        
        # Transform back to original range
        x_poisson = x_poisson / scale
        x_poisson = x_poisson * 2 - 1
        
        return torch.clamp(x_poisson, -1, 1)
    
    def _add_rician_noise(self, x, std):
        """Add Rician noise to the image."""
        # Create complex noise
        real_noise = torch.randn_like(x) * std
        imag_noise = torch.randn_like(x) * std
        
        # Transform to [0, 1] for Rician simulation
        x_norm = (x + 1) / 2
        
        # Add noise (Rician is the magnitude of Gaussian noise in complex domain)
        noisy_real = x_norm + real_noise
        noisy_imag = imag_noise
        
        # Calculate magnitude
        magnitude = torch.sqrt(noisy_real**2 + noisy_imag**2)
        
        # Transform back to [-1, 1]
        magnitude = magnitude * 2 - 1
        
        return torch.clamp(magnitude, -1, 1) 