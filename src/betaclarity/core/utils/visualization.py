#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import base64
from io import BytesIO
import matplotlib
matplotlib.use('Agg')  # For environments without a graphical interface
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image

def plot_loss(history, output_path):
    """
    Plots training and validation loss history.
    
    Args:
        history: Dictionary with 'train_loss' and 'val_loss' lists
        output_path: Path to save the plot image
    """
    plt.figure(figsize=(10, 6))
    plt.plot(history['train_loss'], label='Training Loss', color='#3498db')
    
    if 'val_loss' in history and history['val_loss']:
        plt.plot(history['val_loss'], label='Validation Loss', color='#e74c3c')
    
    plt.xlabel('Epoch')
    plt.ylabel('Loss')
    plt.title('Training and Validation Loss')
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(output_path)
    plt.close()
    
    # Return the plot as a base64 encoded string
    with open(output_path, 'rb') as f:
        plot_bytes = f.read()
    
    return base64.b64encode(plot_bytes).decode()

def to_b64_pil(pil_img):
    """
    Converts a PIL image to a base64-encoded PNG string.
    
    Args:
        pil_img: PIL Image
        
    Returns:
        str: base64-encoded PNG image
    """
    buf = BytesIO()
    pil_img.save(buf, format='PNG')
    buf.seek(0)
    return base64.b64encode(buf.read()).decode()

def generate_html_report(
    out_path,
    training_plot_b64,
    report_data,
    validation_mode
):
    """
    Generates a dark-themed HTML report with metrics and sample images.
    
    Args:
        out_path: Path to save the HTML report
        training_plot_b64: Base64-encoded training plot image
        report_data: Dictionary with validation results and sample images
        validation_mode: Validation mode ('fast' or 'full')
    """
    html_sections = ""

    # Insert training/validation plots
    html_sections += f"""
    <h2><b>Training Overview - {validation_mode.capitalize()} Validation</b></h2>
    <div style="text-align:center; margin-bottom:30px;">
        <img src="data:image/png;base64,{training_plot_b64}" style="max-width:1000px; border:2px solid #555;">
    </div>
    """

    for modality, cases in report_data.items():
        html_sections += f"<h2><b>{modality.replace('_',' ').title()}</b></h2>"
        for case_name, cdata in cases.items():
            if case_name != 'both':
                continue
            degradation_info = cdata['degradation_info']
            html_sections += f"""
            <h3>{case_name.capitalize()} - {degradation_info}</h3>
            """

            sample_images = cdata['samples']
            for idx, (clean_img, degraded_img, restored_img) in enumerate(sample_images):
                noise_type = cdata['noise_types'][idx] if idx < len(cdata['noise_types']) else 'N/A'
                ds_factor = cdata['downscale_factors'][idx] if idx < len(cdata['downscale_factors']) else 'N/A'
                c_b64 = to_b64_pil(clean_img)
                d_b64 = to_b64_pil(degraded_img)
                r_b64 = to_b64_pil(restored_img)

                html_sections += f"""
                <div style="display:flex; gap:20px; margin-bottom:20px;">
                    <div style="text-align:center;">
                        <p><b>Clean</b></p>
                        <img src="data:image/png;base64,{c_b64}" style="max-width:300px; border:2px solid #555;">
                    </div>
                    <div style="text-align:center;">
                        <p><b>Degraded (Noise: {noise_type}, DS: {ds_factor})</b></p>
                        <img src="data:image/png;base64,{d_b64}" style="max-width:300px; border:2px solid #555;">
                    </div>
                    <div style="text-align:center;">
                        <p><b>Restored</b></p>
                        <img src="data:image/png;base64,{r_b64}" style="max-width:300px; border:2px solid #555;">
                    </div>
                </div>
                """

    # Full HTML with dark theme and styling
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>BetaClarity - Latent Diffusion Training Report</title>
        <style>
            body {{
                background-color: #1f1f1f;
                color: #f0f0f0;
                font-family: Arial, sans-serif;
                padding: 20px;
                max-width: 1200px;
                margin: 0 auto;
            }}
            h1, h2, h3 {{
                color: #3498db;
            }}
            h1 {{
                border-bottom: 2px solid #3498db;
                padding-bottom: 10px;
            }}
            img {{
                border-radius: 5px;
            }}
            .metric-container {{
                background-color: #2a2a2a;
                border-radius: 5px;
                padding: 15px;
                margin: 10px 0;
            }}
            .timestamp {{
                color: #7f8c8d;
                font-size: 0.9em;
                margin-top: 5px;
            }}
        </style>
    </head>
    <body>
        <h1>BetaClarity - Latent Diffusion Model Training Report</h1>
        <p class="timestamp">Generated: {get_timestamp()}</p>
        
        {html_sections}
        
    </body>
    </html>
    """

    with open(out_path, 'w') as f:
        f.write(html)

def get_timestamp():
    """Returns current timestamp string."""
    from datetime import datetime
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def tensor_to_pil(tensor):
    """
    Converts a tensor to a PIL image.
    
    Args:
        tensor: PyTorch tensor of shape [C, H, W] in range [-1, 1]
        
    Returns:
        PIL.Image: The converted image
    """
    # Convert from [-1, 1] to [0, 1]
    img = (tensor + 1) / 2
    img = img.clamp(0, 1)
    
    # Convert to numpy and then to PIL
    if img.is_cuda:
        img = img.cpu()
    
    img = img.permute(1, 2, 0).numpy() * 255
    return Image.fromarray(img.astype(np.uint8)) 