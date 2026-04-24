#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Simple inference example for BetaSR model.
Demonstrates how to use the model to denoise and super-resolve a medical image.
"""

import os
import argparse
import torch
import torchvision.transforms as transforms
from PIL import Image
from diffusers import LDMSuperResolutionPipeline

from betaclarity.core.models import EnhancedLatentDiffusionModel
from betaclarity.core.utils.visualization import tensor_to_pil

def parse_args():
    parser = argparse.ArgumentParser(description='BetaSR Inference Example')
    parser.add_argument('--input', type=str, required=True, help='Path to input image')
    parser.add_argument('--output', type=str, required=True, help='Path to save output image')
    parser.add_argument('--model_path', type=str, required=True, help='Path to model checkpoint')
    parser.add_argument('--ddim_steps', type=int, default=10, help='Number of DDIM steps (higher = better quality)')
    parser.add_argument('--device', type=str, default='cuda', help='Device to use (cuda or cpu)')
    return parser.parse_args()

def load_model(model_path, device):
    """Load the BetaSR model from checkpoint."""
    print(f"Loading model from {model_path}...")
    
    # Load LDM pipeline from Hugging Face
    pipeline = LDMSuperResolutionPipeline.from_pretrained("CompVis/ldm-super-resolution-4x-openimages")
    
    # Create model
    model = EnhancedLatentDiffusionModel(pipeline=pipeline)
    
    # Load checkpoint
    checkpoint = torch.load(model_path, map_location=device)
    model.unet.load_state_dict(checkpoint['model_state_dict'])
    
    model.to(device)
    model.eval()
    
    print("Model loaded successfully!")
    return model

def load_image(image_path):
    """Load and preprocess input image."""
    print(f"Loading image from {image_path}...")
    
    # Load image
    image = Image.open(image_path).convert('RGB')
    
    # Define transformation
    transform = transforms.Compose([
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5])
    ])
    
    # Apply transformation
    tensor = transform(image).unsqueeze(0)
    
    return tensor, image

def main():
    args = parse_args()
    
    # Set device
    device = torch.device(args.device if torch.cuda.is_available() and args.device == 'cuda' else 'cpu')
    print(f"Using device: {device}")
    
    # Load model
    model = load_model(args.model_path, device)
    
    # Load image
    tensor, original_image = load_image(args.input)
    tensor = tensor.to(device)
    
    # Create output directory if it doesn't exist
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    
    # Perform inference
    print(f"Running inference with {args.ddim_steps} DDIM steps...")
    with torch.no_grad():
        # Reconstruct using DDIM scheduler
        reconstructed = model.reconstruct(
            tensor, 
            ddim_steps=args.ddim_steps,
            show_progress=True
        )
    
    # Convert to PIL and save
    reconstructed_image = tensor_to_pil(reconstructed[0])
    reconstructed_image.save(args.output)
    
    print(f"Enhanced image saved to {args.output}")
    
    # Create side-by-side comparison
    width, height = original_image.size
    comparison = Image.new('RGB', (width * 2, height))
    comparison.paste(original_image, (0, 0))
    comparison.paste(reconstructed_image, (width, 0))
    
    comparison_path = os.path.splitext(args.output)[0] + "_comparison.png"
    comparison.save(comparison_path)
    
    print(f"Comparison image saved to {comparison_path}")

if __name__ == "__main__":
    main() 