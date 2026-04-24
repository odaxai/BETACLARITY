#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import json
from PIL import Image

def pil_loader(path):
    """
    Loads an image and converts it to RGB.
    
    Args:
        path: Path to the image file
        
    Returns:
        PIL.Image: The loaded image in RGB format
    """
    with open(path, 'rb') as f:
        img = Image.open(f)
        return img.convert('RGB')

def find_latest_checkpoint(models_dir):
    """
    Finds the latest checkpoint in models_dir based on epoch number.
    
    Args:
        models_dir: Directory containing model checkpoints
        
    Returns:
        tuple: (checkpoint_path, epoch_int) or (None, None) if not found
    """
    if not os.path.exists(models_dir):
        return None, None

    checkpoints = []
    for fn in os.listdir(models_dir):
        if fn.startswith("model_epoch_") and fn.endswith(".pth"):
            try:
                ep_str = fn.replace(".pth", "").split("_")[-1]
                ep_int = int(ep_str)
                checkpoints.append((ep_int, os.path.join(models_dir, fn)))
            except ValueError:
                continue

    if not checkpoints:
        return None, None

    best_ep, best_ckpt = max(checkpoints, key=lambda x: x[0])
    return best_ckpt, best_ep

def save_config_log(output_dir, args):
    """
    Saves argparse arguments to a JSON file for reproducibility.
    
    Args:
        output_dir: Directory to save the config file
        args: Argparse arguments
    """
    os.makedirs(output_dir, exist_ok=True)
    config_path = os.path.join(output_dir, "config.log")
    with open(config_path, "w") as f:
        json.dump(vars(args), f, indent=4)
    print(f"[INFO] Config saved to {config_path}")

def get_files_from_directory(directory, extensions=None, recursive=True):
    """
    Gets all files with specified extensions from a directory.
    
    Args:
        directory: Directory to search
        extensions: List of file extensions to include (e.g., ['.jpg', '.png'])
        recursive: Whether to search subdirectories recursively
        
    Returns:
        list: List of file paths
    """
    file_list = []
    
    if extensions:
        extensions = [ext.lower() for ext in extensions]
    
    for root, dirs, files in os.walk(directory):
        for file in files:
            if extensions is None or any(file.lower().endswith(ext) for ext in extensions):
                file_list.append(os.path.join(root, file))
        
        if not recursive:
            break
    
    return file_list 