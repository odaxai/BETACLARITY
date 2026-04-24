#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import logging

def setup_logging(log_path):
    """
    Configures logging to file and console.
    
    Args:
        log_path: Path to the log file
    """
    # Create the directory if it doesn't exist
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    
    # Set up logging format and handlers
    logging.basicConfig(
        filename=log_path,
        filemode='a',
        format='%(asctime)s - %(levelname)s - %(message)s',
        level=logging.INFO
    )
    
    # Add console handler
    console = logging.StreamHandler()
    console.setLevel(logging.INFO)
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    console.setFormatter(formatter)
    logging.getLogger('').addHandler(console)
    
    return logging.getLogger('') 