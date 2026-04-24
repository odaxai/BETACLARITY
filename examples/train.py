#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Training script for BetaSR model.
Demonstrates how to train the model on a medical image dataset.
"""

import os
import argparse
import torch
from betaclarity.core.trainers import train_model
from betaclarity.core.utils.file_utils import save_config_log

def parse_args():
    parser = argparse.ArgumentParser(description='BetaSR Training Script')
    
    # Dataset parameters
    parser.add_argument('--data_root', type=str, required=True,
                        help='Path to dataset directory with modality subdirectories')
    parser.add_argument('--output_dir', type=str, required=True,
                        help='Directory to save checkpoints, logs, and reports')
    
    # Training parameters
    parser.add_argument('--epochs', type=int, default=100,
                        help='Number of training epochs')
    parser.add_argument('--batch_size', type=int, default=4,
                        help='Batch size for training')
    parser.add_argument('--lr', type=float, default=5e-5,
                        help='Learning rate')
    parser.add_argument('--num_workers', type=int, default=4,
                        help='Number of worker processes for data loading')
    parser.add_argument('--early_stop_patience', type=int, default=20,
                        help='Number of epochs without improvement before stopping')
    parser.add_argument('--save_every', type=int, default=5,
                        help='Save checkpoint every N epochs')
    parser.add_argument('--top_n', type=int, default=3,
                        help='Number of best checkpoints to keep')
    
    # Degradation parameters
    parser.add_argument('--downscale_levels', type=float, nargs='+', 
                        default=[0.1, 0.2, 0.25],
                        help='List of downscaling factors to apply during training')
    parser.add_argument('--noise_types', type=str, nargs='+', 
                        default=['gaussian', 'salt-pepper', 'speckle', 'poisson', 'rician'],
                        help='List of noise types to apply during training')
    
    # Validation parameters
    parser.add_argument('--val_every', type=int, default=1,
                        help='Validate every N epochs')
    parser.add_argument('--max_train_images', type=int, default=None,
                        help='Maximum number of training images per modality (None for all)')
    parser.add_argument('--max_val_images', type=int, default=50,
                        help='Maximum number of validation images per modality')
    parser.add_argument('--validation_mode', type=str, default='fast', choices=['fast', 'full'],
                        help="Validation mode: 'fast' (single modality) or 'full' (all modalities)")
    parser.add_argument('--fast_validation_modality', type=str, default='xray',
                        help='Modality to use for fast validation')
    parser.add_argument('--val_ddim_steps', type=int, default=5,
                        help='Number of DDIM steps during validation')
    
    # Regularization parameters
    parser.add_argument('--mask_ratio', type=float, default=0.0,
                        help='Ratio of latent vectors to mask (0.0 to disable)')
    parser.add_argument('--wavelet_mask_ratio', type=float, default=0.0,
                        help='Ratio of wavelet coefficients to mask (0.0 to disable)')
    parser.add_argument('--accumulation_steps', type=int, default=8,
                        help='Number of steps for gradient accumulation')
    
    # Model parameters
    parser.add_argument('--pretrained_model_path', type=str, default=None,
                        help='Path to pretrained model checkpoint')
    
    # Miscellaneous
    parser.add_argument('--resume', action='store_true',
                        help='Whether to resume from latest checkpoint')
    parser.add_argument('--show_sampling_progress', action='store_true',
                        help='Whether to show progress bar during validation')
    
    return parser.parse_args()

def main():
    # Parse arguments
    args = parse_args()
    
    # Print configuration
    print("=== BetaSR Training Configuration ===")
    for arg in vars(args):
        print(f"{arg}: {getattr(args, arg)}")
    print("====================================")
    
    # Create output directory
    os.makedirs(args.output_dir, exist_ok=True)
    
    # Save configuration
    save_config_log(args.output_dir, args)
    
    # Train model
    print("Starting training...")
    history = train_model(
        data_root=args.data_root,
        output_dir=args.output_dir,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        num_workers=args.num_workers,
        early_stop_patience=args.early_stop_patience,
        save_every=args.save_every,
        top_n=args.top_n,
        downscale_levels=args.downscale_levels,
        noise_types=args.noise_types,
        val_every=args.val_every,
        max_train_images=args.max_train_images,
        max_val_images=args.max_val_images,
        mask_ratio=args.mask_ratio,
        wavelet_mask_ratio=args.wavelet_mask_ratio,
        accumulation_steps=args.accumulation_steps,
        validation_mode=args.validation_mode,
        fast_validation_modality=args.fast_validation_modality,
        resume=args.resume,
        val_ddim_steps=args.val_ddim_steps,
        show_sampling_progress=args.show_sampling_progress,
        pretrained_model_path=args.pretrained_model_path
    )
    
    print("Training completed!")
    
    # Print best metrics
    if 'val_loss' in history and history['val_loss']:
        best_epoch = history['val_loss'].index(min(history['val_loss']))
        print(f"Best validation metrics (epoch {best_epoch+1}):")
        print(f"  Loss: {history['val_loss'][best_epoch]:.6f}")
        print(f"  PSNR: {history['val_psnr'][best_epoch]:.2f} dB")
        print(f"  SSIM: {history['val_ssim'][best_epoch]:.4f}")

if __name__ == "__main__":
    main() 