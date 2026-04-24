#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import logging
import time
import heapq
import torch
import torch.nn as nn
import matplotlib.pyplot as plt
from torch.optim import Adam
from tqdm import tqdm
from typing import Dict, Any, List, Tuple, Optional
from skimage.metrics import peak_signal_noise_ratio as compute_psnr
from skimage.metrics import structural_similarity as compute_ssim

from diffusers import LDMSuperResolutionPipeline

from ..models import EnhancedLatentDiffusionModel
from ..datasets import ModalityDataset 
from ..datasets.data_utils import (
    get_modality_datasets, 
    create_datasets, 
    create_combined_dataset, 
    balanced_data_loader
)
from ..utils.visualization import tensor_to_pil, plot_loss, generate_html_report
from ..utils.logging_utils import setup_logging
from ..utils.file_utils import find_latest_checkpoint, save_config_log

def train_model(
    data_root: str,
    output_dir: str,
    epochs: int = 100,
    batch_size: int = 4,
    lr: float = 5e-5,
    num_workers: int = 2,
    early_stop_patience: int = 20,
    save_every: int = 5,
    top_n: int = 3,
    downscale_levels: List[float] = [0.1, 0.2, 0.25],
    noise_types: List[str] = ['gaussian','salt-pepper','speckle','poisson','rician'],
    val_every: int = 1,
    max_train_images: Optional[int] = None,
    max_val_images: int = 50,
    mask_ratio: float = 0.0,
    wavelet_mask_ratio: float = 0.0,
    accumulation_steps: int = 8,
    validation_mode: str = 'fast',
    fast_validation_modality: str = 'xray',
    resume: bool = False,
    val_ddim_steps: int = 5,
    show_sampling_progress: bool = False,
    pretrained_model_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Train the EnhancedLatentDiffusionModel on medical imaging data.
    
    Args:
        data_root: Path to dataset directory with modality subdirectories
        output_dir: Directory to save checkpoints, logs, and reports
        epochs: Number of training epochs
        batch_size: Batch size for training
        lr: Learning rate
        num_workers: Number of worker processes for data loading
        early_stop_patience: Number of epochs without improvement before stopping
        save_every: Save checkpoint every N epochs
        top_n: Number of best checkpoints to keep
        downscale_levels: List of downscaling factors to apply during training
        noise_types: List of noise types to apply during training
        val_every: Validate every N epochs
        max_train_images: Maximum number of training images per modality (None for all)
        max_val_images: Maximum number of validation images per modality
        mask_ratio: Ratio of latent vectors to mask (0.0 to disable)
        wavelet_mask_ratio: Ratio of wavelet coefficients to mask (0.0 to disable)
        accumulation_steps: Number of steps for gradient accumulation
        validation_mode: 'fast' (single modality) or 'full' (all modalities)
        fast_validation_modality: Modality to use for fast validation
        resume: Whether to resume from latest checkpoint
        val_ddim_steps: Number of DDIM steps during validation
        show_sampling_progress: Whether to show progress bar during validation
        pretrained_model_path: Path to pretrained model checkpoint
        
    Returns:
        Dict containing training history and best metrics
    """
    # Setup output directory and logging
    os.makedirs(output_dir, exist_ok=True)
    log_path = os.path.join(output_dir, "training.log")
    logger = setup_logging(log_path)
    
    # Setup device
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info(f"Using device: {device}")
    
    # Load pretrained model
    if pretrained_model_path:
        logger.info(f"Loading pretrained model from {pretrained_model_path}")
        pipeline = LDMSuperResolutionPipeline.from_pretrained(pretrained_model_path)
    else:
        logger.info("Loading pretrained model from Hugging Face")
        pipeline = LDMSuperResolutionPipeline.from_pretrained("CompVis/ldm-super-resolution-4x-openimages")
    
    # Create model
    model = EnhancedLatentDiffusionModel(
        pipeline=pipeline,
        mask_ratio=mask_ratio,
        wavelet_mask_ratio=wavelet_mask_ratio
    )
    model.to(device)
    
    # Setup optimizer
    optimizer = Adam(model.unet.parameters(), lr=lr)
    
    # Initialize training variables
    start_epoch = 0
    best_val_loss = float('inf')
    no_improve_count = 0
    history = {'train_loss': [], 'val_loss': [], 'val_psnr': [], 'val_ssim': []}
    checkpoint_heap = []
    
    # Resume training if requested
    if resume:
        models_dir = os.path.join(output_dir, "models")
        checkpoint_path, epoch = find_latest_checkpoint(models_dir)
        
        if checkpoint_path:
            logger.info(f"Resuming training from epoch {epoch}")
            checkpoint = torch.load(checkpoint_path, map_location=device)
            model.unet.load_state_dict(checkpoint['model_state_dict'])
            optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
            start_epoch = epoch
            
            # Load history if available
            history_path = os.path.join(output_dir, "history.pt")
            if os.path.exists(history_path):
                history = torch.load(history_path)
                
                if 'val_loss' in history and history['val_loss']:
                    best_val_loss = min(history['val_loss'])
        else:
            logger.warning("No checkpoint found, starting from scratch")
    
    # Setup data
    logger.info("Loading datasets...")
    
    # Get all modalities
    modality_paths = get_modality_datasets(data_root)
    if not modality_paths:
        logger.error(f"No data found in {data_root}")
        return history
    
    # Create train datasets
    train_datasets = create_datasets(
        modality_paths, 
        ModalityDataset,
        crop_size=256,
        degradation_cases=['noise', 'downscale', 'both'],
        downscale_levels=downscale_levels,
        noise_types=noise_types,
        augment=True,
        aggressive=True
    )
    
    # Create combined train dataset
    train_dataset, modality_names = create_combined_dataset(train_datasets)
    logger.info(f"Found modalities: {', '.join(modality_names)}")
    
    # Create validation datasets with the same parameters
    val_paths = get_modality_datasets(data_root)
    val_datasets = create_datasets(
        val_paths,
        ModalityDataset,
        crop_size=256,
        degradation_cases=['both'],  # Only test on combined degradation
        downscale_levels=downscale_levels,
        noise_types=noise_types,
        augment=False,
        aggressive=False
    )
    
    # Create train dataloader
    train_loader = balanced_data_loader(
        train_dataset, 
        batch_size=batch_size, 
        num_workers=num_workers,
        drop_last=True
    )
    
    # Training loop
    logger.info(f"Starting training for {epochs} epochs")
    start_time = time.time()
    
    for epoch in range(start_epoch, start_epoch + epochs):
        # Training
        model.train()
        train_loss = 0
        train_batches = 0
        optimizer.zero_grad()
        
        for batch_idx, (degraded_imgs, clean_imgs, _, _, _) in enumerate(tqdm(train_loader, desc=f"Epoch {epoch+1}/{start_epoch+epochs}")):
            degraded_imgs = degraded_imgs.to(device)
            clean_imgs = clean_imgs.to(device)
            
            # Forward pass
            loss, _, _ = model(degraded_imgs, clean_imgs)
            
            # Backward pass with gradient accumulation
            loss = loss / accumulation_steps
            loss.backward()
            
            if (batch_idx + 1) % accumulation_steps == 0 or (batch_idx + 1) == len(train_loader):
                optimizer.step()
                optimizer.zero_grad()
            
            train_loss += loss.item() * accumulation_steps
            train_batches += 1
        
        # Calculate average training loss
        avg_train_loss = train_loss / train_batches
        history['train_loss'].append(avg_train_loss)
        logger.info(f"Epoch {epoch+1}/{start_epoch+epochs} - Train Loss: {avg_train_loss:.6f}")
        
        # Validation
        if (epoch + 1) % val_every == 0:
            # Decide validation mode
            if validation_mode == 'fast':
                val_modalities = [fast_validation_modality]
            else:
                val_modalities = list(val_datasets.keys())
            
            model.eval()
            val_loss = 0
            val_psnr = 0
            val_ssim = 0
            val_batches = 0
            
            # Initialize report data
            report_data = {}
            
            for modality in val_modalities:
                if modality not in val_datasets:
                    logger.warning(f"Validation modality {modality} not found, skipping")
                    continue
                
                # Create validation dataloader
                val_loader = balanced_data_loader(
                    val_datasets[modality],
                    batch_size=1,  # Validate one image at a time
                    num_workers=num_workers
                )
                
                # Initialize modality data in report
                report_data[modality] = {
                    'both': {
                        'samples': [],
                        'degradation_info': "Combined Noise + Downscaling",
                        'noise_types': [],
                        'downscale_factors': []
                    }
                }
                
                # Validate on a subset of images
                for batch_idx, (degraded_imgs, clean_imgs, deg_info, noise_types, ds_factors) in enumerate(val_loader):
                    if batch_idx >= max_val_images:
                        break
                    
                    degraded_imgs = degraded_imgs.to(device)
                    clean_imgs = clean_imgs.to(device)
                    
                    with torch.no_grad():
                        # Calculate loss
                        batch_loss, _, _ = model(degraded_imgs, clean_imgs)
                        val_loss += batch_loss.item()
                        
                        # Reconstruct using DDIM scheduler
                        reconstructed = model.reconstruct(
                            degraded_imgs, 
                            ddim_steps=val_ddim_steps,
                            show_progress=show_sampling_progress
                        )
                        
                        # Calculate metrics
                        psnr, ssim = compute_image_metrics(clean_imgs, reconstructed)
                        val_psnr += psnr
                        val_ssim += ssim
                        
                        # Save sample for report
                        if batch_idx < 5:  # Save first 5 samples for report
                            clean_pil = tensor_to_pil(clean_imgs[0])
                            degraded_pil = tensor_to_pil(degraded_imgs[0])
                            reconstructed_pil = tensor_to_pil(reconstructed[0])
                            
                            report_data[modality]['both']['samples'].append(
                                (clean_pil, degraded_pil, reconstructed_pil)
                            )
                            report_data[modality]['both']['noise_types'].append(noise_types[0])
                            report_data[modality]['both']['downscale_factors'].append(ds_factors[0])
                    
                    val_batches += 1
            
            # Calculate average validation metrics
            avg_val_loss = val_loss / val_batches if val_batches > 0 else float('inf')
            avg_val_psnr = val_psnr / val_batches if val_batches > 0 else 0
            avg_val_ssim = val_ssim / val_batches if val_batches > 0 else 0
            
            history['val_loss'].append(avg_val_loss)
            history['val_psnr'].append(avg_val_psnr)
            history['val_ssim'].append(avg_val_ssim)
            
            logger.info(f"Epoch {epoch+1}/{start_epoch+epochs} - "
                       f"Val Loss: {avg_val_loss:.6f}, "
                       f"PSNR: {avg_val_psnr:.2f}, "
                       f"SSIM: {avg_val_ssim:.4f}")
            
            # Save visualization
            plot_path = os.path.join(output_dir, "training_plot.png")
            plot_b64 = plot_loss({
                'train_loss': history['train_loss'],
                'val_loss': history['val_loss'],
                'val_psnr': history['val_psnr'],
                'val_ssim': history['val_ssim']
            }, plot_path)
            
            # Generate HTML report
            report_path = os.path.join(output_dir, "training_report.html")
            generate_html_report(
                report_path,
                plot_b64,
                report_data,
                validation_mode
            )
            
            # Early stopping check
            if avg_val_loss < best_val_loss:
                best_val_loss = avg_val_loss
                no_improve_count = 0
                
                # Save best model
                save_checkpoint(
                    model, optimizer, epoch, avg_val_loss,
                    os.path.join(output_dir, "models", "model_best.pth")
                )
            else:
                no_improve_count += 1
                if no_improve_count >= early_stop_patience:
                    logger.info(f"Early stopping triggered after {epoch+1} epochs")
                    break
        
        # Save checkpoint
        if (epoch + 1) % save_every == 0:
            checkpoint_path = os.path.join(output_dir, "models", f"model_epoch_{epoch+1}.pth")
            curr_val_loss = history['val_loss'][-1] if history['val_loss'] else float('inf')
            
            save_checkpoint(model, optimizer, epoch, curr_val_loss, checkpoint_path)
            
            # Maintain priority queue of best checkpoints
            if top_n > 0:
                if len(checkpoint_heap) < top_n:
                    heapq.heappush(checkpoint_heap, (-curr_val_loss, checkpoint_path))
                else:
                    worst_loss, worst_path = heapq.heappop(checkpoint_heap)
                    if -worst_loss > curr_val_loss:
                        if os.path.exists(worst_path) and worst_path != os.path.join(output_dir, "models", "model_best.pth"):
                            os.remove(worst_path)
                        heapq.heappush(checkpoint_heap, (-curr_val_loss, checkpoint_path))
                    else:
                        heapq.heappush(checkpoint_heap, (worst_loss, worst_path))
                        if os.path.exists(checkpoint_path) and checkpoint_path != os.path.join(output_dir, "models", "model_best.pth"):
                            os.remove(checkpoint_path)
        
        # Save history
        torch.save(history, os.path.join(output_dir, "history.pt"))
    
    # Final report
    train_time = time.time() - start_time
    logger.info(f"Training completed in {train_time/60:.2f} minutes")
    logger.info(f"Best validation loss: {best_val_loss:.6f}")
    
    return history

def compute_image_metrics(clean_imgs, reconstructed_imgs):
    """
    Compute PSNR and SSIM metrics between clean and reconstructed images.
    
    Args:
        clean_imgs: Tensor of clean images [-1, 1]
        reconstructed_imgs: Tensor of reconstructed images [-1, 1]
        
    Returns:
        Tuple of (psnr, ssim) values
    """
    # Convert to numpy arrays in [0, 1] range
    clean = ((clean_imgs[0].detach().cpu().permute(1, 2, 0).numpy() + 1) / 2).clip(0, 1)
    recon = ((reconstructed_imgs[0].detach().cpu().permute(1, 2, 0).numpy() + 1) / 2).clip(0, 1)
    
    # Calculate metrics
    psnr = compute_psnr(clean, recon, data_range=1.0)
    ssim = compute_ssim(clean, recon, channel_axis=2, data_range=1.0)
    
    return psnr, ssim

def save_checkpoint(model, optimizer, epoch, val_loss, path):
    """
    Save a model checkpoint.
    
    Args:
        model: Model instance
        optimizer: Optimizer instance
        epoch: Current epoch
        val_loss: Validation loss
        path: Path to save checkpoint
    """
    os.makedirs(os.path.dirname(path), exist_ok=True)
    
    torch.save({
        'epoch': epoch,
        'model_state_dict': model.unet.state_dict(),
        'optimizer_state_dict': optimizer.state_dict(),
        'val_loss': val_loss
    }, path) 