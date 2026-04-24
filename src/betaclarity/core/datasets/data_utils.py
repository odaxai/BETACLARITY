#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import torch
from torch.utils.data import DataLoader, ConcatDataset
from typing import List, Tuple, Dict, Any

def custom_collate_fn(batch):
    """
    Custom collate function that separates Tensors from string/float metadata.
    Each item in batch: (degraded_tensor, clean_tensor, degrade_info, noise_type, ds_factor).
    
    Args:
        batch: List of tuples from dataset
        
    Returns:
        Tuple of tensors and metadata lists
    """
    degraded_list = []
    clean_list = []
    degrade_info_list = []
    noise_type_list = []
    ds_factor_list = []

    for item in batch:
        degraded, clean, degrade_info, noise_type, ds_factor = item
        degraded_list.append(degraded)
        clean_list.append(clean)
        degrade_info_list.append(degrade_info)
        noise_type_list.append(noise_type)
        ds_factor_list.append(ds_factor)

    degraded_tensor = torch.stack(degraded_list, dim=0)
    clean_tensor = torch.stack(clean_list, dim=0)

    return degraded_tensor, clean_tensor, degrade_info_list, noise_type_list, ds_factor_list

def balanced_data_loader(dataset, batch_size, num_workers=2, drop_last=False):
    """
    Create a DataLoader with custom collate function.
    
    Args:
        dataset: Dataset instance
        batch_size: Batch size
        num_workers: Number of worker processes
        drop_last: Whether to drop the last incomplete batch
        
    Returns:
        DataLoader instance
    """
    return DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=True,
        num_workers=num_workers,
        pin_memory=True,
        drop_last=drop_last,
        collate_fn=custom_collate_fn
    )

def get_modality_datasets(data_root: str, modalities: List[str] = None, extensions: List[str] = ['.jpg', '.png', '.jpeg']) -> Dict[str, List[str]]:
    """
    Get image paths for each modality in the dataset.
    
    Args:
        data_root: Root directory containing modality subdirectories
        modalities: List of modality subdirectories to include (None for all)
        extensions: List of valid file extensions
        
    Returns:
        Dict mapping modality names to lists of file paths
    """
    modality_paths = {}
    
    # Use all subdirectories if modalities is None
    if modalities is None:
        modalities = [d for d in os.listdir(data_root) 
                     if os.path.isdir(os.path.join(data_root, d)) and not d.startswith('.')]
    
    # For each modality, get all image files
    for modality in modalities:
        modality_dir = os.path.join(data_root, modality)
        if not os.path.isdir(modality_dir):
            continue
            
        # Get all image files with valid extensions
        image_paths = []
        for root, _, files in os.walk(modality_dir):
            for file in files:
                if any(file.lower().endswith(ext) for ext in extensions):
                    image_paths.append(os.path.join(root, file))
        
        if image_paths:
            modality_paths[modality] = image_paths
    
    return modality_paths

def create_datasets(modality_paths: Dict[str, List[str]], dataset_class, **dataset_kwargs) -> Dict[str, Any]:
    """
    Create dataset instances for each modality.
    
    Args:
        modality_paths: Dict mapping modality names to lists of file paths
        dataset_class: Dataset class to instantiate
        dataset_kwargs: Keyword arguments to pass to dataset constructor
        
    Returns:
        Dict mapping modality names to dataset instances
    """
    datasets = {}
    
    for modality, paths in modality_paths.items():
        if not paths:
            continue
        datasets[modality] = dataset_class(paths, **dataset_kwargs)
    
    return datasets

def create_combined_dataset(datasets: Dict[str, Any]) -> Tuple[Any, List[str]]:
    """
    Combine multiple datasets into one.
    
    Args:
        datasets: Dict mapping modality names to dataset instances
        
    Returns:
        Tuple of (combined dataset, list of modality names)
    """
    dataset_list = list(datasets.values())
    modality_names = list(datasets.keys())
    
    if len(dataset_list) == 1:
        return dataset_list[0], modality_names
    
    return ConcatDataset(dataset_list), modality_names 