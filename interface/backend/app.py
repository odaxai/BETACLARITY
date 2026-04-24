#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import uuid
import logging
import traceback
import random
import subprocess
import signal
import base64
import shutil
import time
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import cv2

from PIL import Image
from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS

# Device configuration
DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# Optional: DICOM support
try:
    from pydicom import dcmread
    from pydicom.pixel_data_handlers.util import apply_modality_lut
    HAS_PYDICOM = True
except ImportError:
    HAS_PYDICOM = False

# Metrics
from skimage.metrics import structural_similarity as ssim
import matplotlib
matplotlib.use('Agg')

# Diffusers
from diffusers import LDMSuperResolutionPipeline, DDIMScheduler

# Device monitor (HW utilisation samples + active session tracking)
from device_monitor import DeviceMonitor, list_devices as list_compute_devices

# Configure logging
LOG_FILE = "backend.log"
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

file_handler = logging.FileHandler(LOG_FILE)
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
logger.addHandler(file_handler)

console_handler = logging.StreamHandler()
console_handler.setLevel(logging.DEBUG)
console_handler.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
logger.addHandler(console_handler)

logger.info("Logging configured.")

# Get absolute paths
CURRENT_DIR = os.path.abspath(os.path.dirname(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(CURRENT_DIR))
IMGS_BASE_DIR = os.path.join(CURRENT_DIR, "public", "imgs")  # Path relativo
SESSIONS_DIR = os.path.join(CURRENT_DIR, "sessions")

# Create sessions directory if it doesn't exist
os.makedirs(SESSIONS_DIR, exist_ok=True)

print(f"\nDirectories configuration:")
print(f"CURRENT_DIR: {CURRENT_DIR}")
print(f"PROJECT_ROOT: {PROJECT_ROOT}")
print(f"IMGS_BASE_DIR: {IMGS_BASE_DIR}")
print(f"SESSIONS_DIR: {SESSIONS_DIR}")

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "model")
MODEL_PATH = os.path.join(MODEL_DIR, "model.pth")

def free_port(port: int):
    """
    Kills any process using the specified port.
    """
    try:
        current_pid = os.getpid()
        proc = subprocess.run(["lsof", "-i", f":{port}", "-t"],
                              text=True, capture_output=True, check=True)
        pids = proc.stdout.strip().split("\n")
        for pid in pids:
            if pid.strip() and int(pid) != current_pid:
                try:
                    proc_name = subprocess.run(
                        ["ps", "-p", pid, "-o", "comm="],
                        text=True, capture_output=True, check=True
                    ).stdout.strip()
                    logger.info(f"Killing process {proc_name} (PID {pid}) on port {port}...")
                    os.kill(int(pid), signal.SIGKILL)
                    logger.info(f"Killed PID={pid}.")
                except Exception as ex:
                    logger.error(f"Error killing process {pid}: {ex}")
        # Add a delay to allow the port to be released
        time.sleep(1)
    except subprocess.CalledProcessError:
        logger.info(f"Port {port} is free.")

def clamp_multiple_of_64(val: int) -> int:
    return int(np.ceil(val / 64) * 64)

def clamp_dimensions(width: int, height: int):
    cw = clamp_multiple_of_64(width)
    ch = clamp_multiple_of_64(height)
    return max(cw, 64), max(ch, 64)

def force_multiple_of_64(img_t):
    c, h, w = img_t.shape
    new_h = clamp_multiple_of_64(h)
    new_w = clamp_multiple_of_64(w)
    if (new_h == h) and (new_w == w):
        return img_t
    out = F.interpolate(img_t.unsqueeze(0), size=(new_h, new_w),
                        mode='bicubic', align_corners=False)[0]
    return out.clamp(0, 1)

class EnhancedLatentDiffusionModel(nn.Module):
    def __init__(self, pipeline, scale_factor=0.18215):
        super().__init__()
        self.scale_factor = scale_factor
        # Replace pipeline's scheduler with DDIM
        self.scheduler = DDIMScheduler.from_config(pipeline.scheduler.config)
        pipeline.scheduler = self.scheduler
        self.vqvae = pipeline.vqvae
        self.vqvae.eval()
        for param in self.vqvae.parameters():
            param.requires_grad = False
        self.unet = pipeline.unet
        self.pipeline = pipeline
        self.sampling_eta = 0.0

    def set_sampling_eta(self, eta: float):
        self.sampling_eta = eta

    @torch.no_grad()
    def encode_latents(self, x):
        enc_out = self.vqvae.encode(x)
        return enc_out.latents * self.scale_factor

    @torch.no_grad()
    def decode_latents(self, z):
        z = z / self.scale_factor
        dec_out = self.vqvae.decode(z)
        return dec_out.sample.clamp(0, 1)

    def reconstruct_generator(self, degraded_imgs, ddim_steps=50):
        """
        Yields each step as an integer. The final yield is the output image tensor.
        """
        device = degraded_imgs.device
        ddim_steps = min(ddim_steps, 999)
        self.scheduler.set_timesteps(ddim_steps, device=device)
        latents = self.encode_latents(degraded_imgs).to(device)
        x_t = latents
        t_list = self.scheduler.timesteps

        for step_idx, t_ in enumerate(t_list):
            if not isinstance(t_, torch.Tensor):
                t_ = torch.tensor([t_], dtype=torch.long, device=device)
            degrade_resized = F.interpolate(
                degraded_imgs,
                size=(x_t.shape[2], x_t.shape[3]),
                mode="bilinear",
                align_corners=False
            )
            cond_in = torch.cat([x_t, degrade_resized], dim=1)

            with torch.no_grad():
                noise_pred = self.unet(cond_in, t_).sample
                latent_noise = noise_pred[:, :x_t.shape[1], :, :]
                step_out = self.scheduler.step(
                    model_output=latent_noise,
                    timestep=t_,
                    sample=x_t,
                    eta=self.sampling_eta
                )
                x_t = step_out.prev_sample

            yield step_idx + 1

        out = self.decode_latents(x_t)
        out = out.clamp(0, 1)
        yield out

SR_MODEL = None

def load_sr_model():
    """
    Load or instantiate the super-resolution model from Diffusers.
    """
    global SR_MODEL
    if not os.path.exists(MODEL_PATH):
        logger.warning(f"No checkpoint found at {MODEL_PATH}. Using default pipeline.")
        pipeline = LDMSuperResolutionPipeline.from_pretrained("CompVis/ldm-super-resolution-4x-openimages")
        model = EnhancedLatentDiffusionModel(pipeline=pipeline)
        model.to(DEVICE)
        model.eval()
        SR_MODEL = model
        return

    logger.info("Loading pipeline from 'CompVis/ldm-super-resolution-4x-openimages' ...")
    pipeline = LDMSuperResolutionPipeline.from_pretrained("CompVis/ldm-super-resolution-4x-openimages")
    model = EnhancedLatentDiffusionModel(pipeline=pipeline)
    model.to(DEVICE)
    model.eval()

    ckp = torch.load(MODEL_PATH, map_location=DEVICE, weights_only=False)
    if "model_state" in ckp:
        model.load_state_dict(ckp["model_state"], strict=True)
        logger.info("Loaded from 'model_state' key.")
    else:
        model.load_state_dict(ckp, strict=False)
        logger.info("Loaded checkpoint directly.")

    SR_MODEL = model
    logger.info("SR model loaded successfully.")

load_sr_model()

def dicom_to_png(dicom_path, png_path):
    """
    Convert DICOM to PNG if needed.
    """
    if not HAS_PYDICOM:
        raise RuntimeError("pydicom is not installed.")
    ds = dcmread(dicom_path)
    arr = apply_modality_lut(ds.pixel_array, ds)
    arr_norm = (arr - arr.min()) / (arr.max() - arr.min()) * 255.0
    arr_norm = arr_norm.astype(np.uint8)
    Image.fromarray(arr_norm).convert("RGB").save(png_path)

def clamp_resize_rgb(input_path, output_path, preserve_original_size=True):
    """
    Clamp to multiples of 64 while preserving original dimensions as much as possible.
    """
    pil_img = Image.open(input_path).convert("RGB")
    
    if preserve_original_size:
        # Only clamp to multiples of 64, don't force resize
        w, h = pil_img.size
        cw, ch = clamp_dimensions(w, h)
        # Only resize if absolutely necessary (not multiple of 64)
        if (cw != w) or (ch != h):
            pil_img = pil_img.resize((cw, ch), Image.Resampling.LANCZOS)
    else:
        # Legacy behavior - force to 800x500 then clamp
        pil_img = pil_img.resize((800, 500), Image.Resampling.LANCZOS)
        w, h = pil_img.size
        cw, ch = clamp_dimensions(w, h)
        pil_img = pil_img.resize((cw, ch), Image.Resampling.LANCZOS)
    
    pil_img.save(output_path)

def training_style_distortion(input_path, output_path, dist_type, dist_level, scale_factor):
    """
    Downscale -> Upscale + apply noise. Mimics training style distortion.
    """
    pil_img = Image.open(input_path).convert("RGB")
    arr = np.array(pil_img, dtype=np.float32) / 255.0
    H, W, C = arr.shape

    ds_h = max(1, int(round(H / scale_factor)))
    ds_w = max(1, int(round(W / scale_factor)))
    down = cv2.resize(arr, (ds_w, ds_h), interpolation=cv2.INTER_AREA)
    up = cv2.resize(down, (W, H), interpolation=cv2.INTER_AREA)

    if dist_type == "gaussian":
        noise = np.random.randn(*up.shape) * dist_level
        out = up + noise
    elif dist_type == "salt":
        out = up.copy()
        coords = np.random.rand(H, W)
        mask = coords < dist_level
        for c in range(C):
            out[..., c][mask] = 1.0
    elif dist_type == "speckle":
        noise = np.random.randn(*up.shape) * dist_level * up
        out = up + noise
    elif dist_type == "poisson":
        vals = 2 ** np.random.randint(3, 8)
        out = np.random.poisson(up * vals) / float(vals)
    else:
        out = up

    out = np.clip(out, 0, 1)
    arr_255 = (out * 255).astype(np.uint8)
    out_img = Image.fromarray(arr_255, "RGB")

    cw, ch = clamp_dimensions(out_img.width, out_img.height)
    out_img = out_img.resize((cw, ch), Image.Resampling.LANCZOS)
    out_img.save(output_path)

def compute_psnr_ssim(ref_path, compare_path):
    """
    Loads both images in GRAYSCALE and computes PSNR & SSIM.
    PSNR is always capped at 30 dB to avoid unrealistic values.
    SSIM is returned scaled by 100 (so the frontend can convert).
    """
    orig = cv2.imread(ref_path, cv2.IMREAD_GRAYSCALE)
    comp = cv2.imread(compare_path, cv2.IMREAD_GRAYSCALE)
    if orig is None or comp is None:
        raise ValueError("Invalid images for computing metrics.")
    if orig.shape != comp.shape:
        raise ValueError(f"Shape mismatch: {orig.shape} vs {comp.shape}")

    # Calcola MSE manualmente per evitare divisione per zero
    mse = np.mean((orig.astype(float) - comp.astype(float)) ** 2)
    
    if mse < 1e-10:  # Se le immagini sono praticamente identiche
        psnr_val = 30.0
    else:
        psnr_val = min(30.0, 20 * np.log10(255.0 / np.sqrt(mse)))

    # Calcola SSIM e limita a 1.0
    val_ssim = min(1.0, ssim(orig, comp, data_range=comp.max() - comp.min()))
    
    logger.info(f"Computed metrics - PSNR: {psnr_val:.2f} dB, SSIM: {val_ssim:.3f}")
    
    return {
        "psnr": float(psnr_val),  # Assicura che sia un float JSON-serializzabile
        "ssim": float(val_ssim * 100.0)  # Scala SSIM a percentuale
    }

@app.route("/create_session", methods=["POST"])
def create_session():
    sid = str(uuid.uuid4())
    sess_dir = os.path.join(SESSIONS_DIR, sid)
    os.makedirs(sess_dir, exist_ok=True)
    logger.info(f"New session => {sid}")
    return jsonify({"session_id": sid})

@app.route("/load_sample", methods=["GET"])
def load_sample():
    try:
        sid = request.args.get("session_id", "")
        filename = request.args.get("file", "")
        if not sid or not filename:
            return jsonify({"error": "Missing parameters"}), 400

        src_path = os.path.join(IMGS_BASE_DIR, filename)
        if not os.path.exists(src_path):
            return jsonify({"error": f"File not found: {src_path}"}), 404

        sess_dir = os.path.join(SESSIONS_DIR, sid)
        os.makedirs(sess_dir, exist_ok=True)
        dest_path = os.path.join(sess_dir, "preprocessed.png")
        Image.open(src_path).convert("RGB").save(dest_path)
        clamp_resize_rgb(dest_path, dest_path)

        return jsonify({"message": "Sample loaded"})
    except Exception as ex:
        logger.error(f"load_sample error: {ex}")
        traceback.print_exc()
        return jsonify({"error": str(ex)}), 500

@app.route("/upload_file", methods=["POST"])
def upload_file():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file part"}), 400

        file = request.files['file']
        session_id = request.form.get('session_id')

        if not file or not session_id:
            return jsonify({"error": "No file or session_id"}), 400

        session_dir = os.path.join(SESSIONS_DIR, session_id)
        os.makedirs(session_dir, exist_ok=True)

        preprocessed_path = os.path.join(session_dir, "preprocessed.png")
        file.save(preprocessed_path)

        # Optionally clamp/resize here
        clamp_resize_rgb(preprocessed_path, preprocessed_path)

        return jsonify({"message": "File uploaded successfully"})

    except Exception as e:
        print(f"Error in upload_file: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/get_preprocessed/<session_id>", methods=["GET"])
def get_preprocessed(session_id):
    try:
        file_path = os.path.join(SESSIONS_DIR, session_id, "preprocessed.png")
        if not os.path.exists(file_path):
            return jsonify({"error": "File not found"}), 404

        response = send_file(file_path, mimetype='image/png')
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
    except Exception as e:
        print(f"Error in get_preprocessed: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/process_distortion", methods=["POST"])
def process_distortion():
    try:
        data = request.json
        sid = data["session_id"]
        dist_type = data["distortion_type"]
        dist_level = float(data["distortion_level"])
        scale_factor = float(data["scale_factor"])

        sess_dir = os.path.join(SESSIONS_DIR, sid)
        prep_path = os.path.join(sess_dir, "preprocessed.png")
        dist_path = os.path.join(sess_dir, "distorted.png")
        if not os.path.exists(prep_path):
            return jsonify({"error": "No preprocessed image"}), 404

        training_style_distortion(prep_path, dist_path, dist_type, dist_level, scale_factor)
        return jsonify({"success": True})
    except Exception as ex:
        logger.error(f"process_distortion error: {ex}")
        return jsonify({"error": str(ex)}), 500

@app.route("/get_distorted/<session_id>", methods=["GET"])
def get_distorted(session_id):
    path = os.path.join(SESSIONS_DIR, session_id, "distorted.png")
    if os.path.exists(path):
        response = send_file(path, mimetype="image/png")
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
    return jsonify({"error": "No distorted image"}), 404

@app.route("/apply_denoising", methods=["POST"])
def apply_denoising():
    """
    Streams JSON lines with the current step progress, then emits
    a final line with {"completed": true} upon finishing.
    """
    try:
        if SR_MODEL is None:
            return jsonify({"error": "SR model not loaded"}), 500

        data = request.json
        sid = data["session_id"]
        ddim_steps = max(1, min(int(data.get("ddim_steps", 50)), 999))
        eta_val = float(data.get("eta", 0.0))

        sess_dir = os.path.join(SESSIONS_DIR, sid)
        dist_path = os.path.join(sess_dir, "distorted.png")
        den_path = os.path.join(sess_dir, "denoised.png")

        if not os.path.exists(dist_path):
            return jsonify({"error": "No distorted image"}), 404

        pil_in = Image.open(dist_path).convert("RGB")
        arr = np.array(pil_in, dtype=np.float32) / 255.0
        ten_in = torch.from_numpy(arr.transpose(2, 0, 1)).unsqueeze(0).to(DEVICE)
        ten_in = force_multiple_of_64(ten_in[0]).unsqueeze(0)

        SR_MODEL.set_sampling_eta(eta_val)

        monitor = DeviceMonitor.instance()
        monitor.start_session(name=f"denoise:{sid}", total_steps=ddim_steps)

        def generate_chunks():
            # Store original dimensions
            original_pil = Image.open(dist_path).convert("RGB")
            original_size = original_pil.size  # (width, height)
            logger.info(f"Original image size: {original_size}")
            
            step_gen = SR_MODEL.reconstruct_generator(ten_in, ddim_steps=ddim_steps)
            total_steps = ddim_steps
            for val in step_gen:
                if isinstance(val, int):
                    step_idx = val
                    monitor.update_step(step_idx)
                    yield f'{{"step": {step_idx}, "total_steps": {total_steps}}}\n'
                else:
                    # final image - POST PROCESS TO FIX DIMENSIONS AND COLORS
                    out_tensor = val
                    out_np = (out_tensor.squeeze(0).cpu().numpy().transpose(1, 2, 0) * 255).astype(np.uint8)
                    
                    # Create PIL image from model output
                    enhanced_pil = Image.fromarray(out_np, 'RGB')
                    logger.info(f"Model output size: {enhanced_pil.size}")
                    
                    # RESIZE TO ORIGINAL DIMENSIONS (fix super resolution scaling)
                    enhanced_pil = enhanced_pil.resize(original_size, Image.Resampling.LANCZOS)
                    logger.info(f"Resized to original: {enhanced_pil.size}")
                    
                    # COLOR CORRECTION - blend with original to preserve color balance
                    # Convert to numpy for processing
                    enhanced_np = np.array(enhanced_pil)
                    original_np = np.array(original_pil)
                    
                    # Apply color correction (preserve color distribution of original)
                    enhanced_lab = cv2.cvtColor(enhanced_np, cv2.COLOR_RGB2LAB)
                    original_lab = cv2.cvtColor(original_np, cv2.COLOR_RGB2LAB)
                    
                    # Keep enhanced L channel (luminance/details) but use original A,B (color)
                    corrected_lab = enhanced_lab.copy()
                    corrected_lab[:, :, 1] = original_lab[:, :, 1]  # A channel
                    corrected_lab[:, :, 2] = original_lab[:, :, 2]  # B channel
                    
                    # Convert back to RGB
                    corrected_rgb = cv2.cvtColor(corrected_lab, cv2.COLOR_LAB2RGB)
                    final_pil = Image.fromarray(corrected_rgb, 'RGB')
                    
                    logger.info(f"Final processed size: {final_pil.size}")
                    final_pil.save(den_path)
            monitor.stop_session()
            yield '{"completed": true}\n'

        return Response(generate_chunks(), mimetype="text/plain")

    except Exception as ex:
        logger.error(f"apply_denoising error: {ex}")
        traceback.print_exc()
        return jsonify({"error": str(ex)}), 500

@app.route("/get_denoised/<session_id>", methods=["GET"])
def get_denoised(session_id):
    path = os.path.join(SESSIONS_DIR, session_id, "denoised.png")
    if os.path.exists(path):
        response = send_file(path, mimetype="image/png")
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
    return jsonify({"error": "No denoised image"}), 404

@app.route("/compute_metrics", methods=["POST"])
def compute_metrics_route():
    """
    Computes PSNR & SSIM between 'preprocessed.png' (reference)
    and one of the stages (preprocessed, distorted, denoised).
    """
    try:
        data = request.json
        sid = data["session_id"]
        stage = data["stage"]
        sess_dir = os.path.join(SESSIONS_DIR, sid)
        ref_path = os.path.join(sess_dir, "preprocessed.png")

        if stage == "preprocessed":
            comp_path = ref_path
        elif stage == "distorted":
            comp_path = os.path.join(sess_dir, "distorted.png")
        elif stage == "denoised":
            comp_path = os.path.join(sess_dir, "denoised.png")
        else:
            return jsonify({"error": "Invalid stage"}), 400

        if not (os.path.exists(ref_path) and os.path.exists(comp_path)):
            return jsonify({"error": "Images missing"}), 404

        m = compute_psnr_ssim(ref_path, comp_path)
        return jsonify({"psnr": m["psnr"], "ssim": m["ssim"]})
    except Exception as ex:
        logger.error(f"compute_metrics error: {ex}")
        traceback.print_exc()
        return jsonify({"error": str(ex)}), 500

@app.route("/get_sample_images/<modality>")
def get_sample_images(modality):
    """
    Endpoint removed: pre-built sample images from public datasets are no
    longer distributed with BETACLARITY (repo or Docker image). Users must
    upload their own DICOM / PNG / JPEG files via /upload_file.
    """
    return jsonify({
        "images": [],
        "message": (
            "Sample images from public datasets are not included in this release. "
            "Please upload your own medical image (DICOM, PNG or JPEG) using the "
            "Upload File button."
        )
    }), 200


@app.route("/load_sample_image", methods=["POST"])
def load_sample_image():
    """
    Endpoint removed: see get_sample_images above.
    """
    return jsonify({
        "error": (
            "Sample images are no longer bundled. Upload your own DICOM / PNG / JPEG "
            "file using the Upload File button."
        )
    }), 410

def print_directory_tree(startpath):
    """
    Debug utility to print the directory tree of IMGS_BASE_DIR.
    """
    for root, dirs, files in os.walk(startpath):
        level = root.replace(startpath, '').count(os.sep)
        indent = ' ' * 4 * level
        print(f"{indent}{os.path.basename(root)}/")
        subindent = ' ' * 4 * (level + 1)
        for f in files:
            if f.endswith('.png'):
                print(f"{subindent}{f}")

print("\nDirectory tree of images:")
print_directory_tree(IMGS_BASE_DIR)

def check_permissions():
    print("\n=== CHECKING PERMISSIONS ===")
    try:
        print(f"Current working directory: {os.getcwd()}")
        print(f"IMGS_BASE_DIR: {IMGS_BASE_DIR}")
        print(f"Directory exists: {os.path.exists(IMGS_BASE_DIR)}")
        if os.path.exists(IMGS_BASE_DIR):
            print(f"Directory permissions: {oct(os.stat(IMGS_BASE_DIR).st_mode)[-3:]}")
            print("Contents:")
            for item in os.listdir(IMGS_BASE_DIR):
                item_path = os.path.join(IMGS_BASE_DIR, item)
                if os.path.isdir(item_path):
                    print(f"  DIR  {item}: {oct(os.stat(item_path).st_mode)[-3:]}")
                    for subitem in os.listdir(item_path):
                        subitem_path = os.path.join(item_path, subitem)
                        print(f"    FILE {subitem}: {oct(os.stat(subitem_path).st_mode)[-3:]}")
    except Exception as e:
        print(f"Error checking permissions: {str(e)}")

check_permissions()

def verify_directories():
    print("\n=== VERIFYING DIRECTORIES ===")
    directories = {
        "IMGS_BASE_DIR": IMGS_BASE_DIR,
        "SESSIONS_DIR": SESSIONS_DIR
    }

    for name, path in directories.items():
        print(f"\nChecking {name}: {path}")
        if os.path.exists(path):
            print("✓ Directory exists")
            print(f"Permissions: {oct(os.stat(path).st_mode)[-3:]}")
            try:
                test_file = os.path.join(path, "test.txt")
                with open(test_file, "w") as f:
                    f.write("test")
                os.remove(test_file)
                print("✓ Write permission OK")
            except Exception as e:
                print(f"✗ Write permission ERROR: {str(e)}")
        else:
            print("✗ Directory does not exist")
            try:
                os.makedirs(path, exist_ok=True)
                print("✓ Created directory")
            except Exception as e:
                print(f"✗ Cannot create directory: {str(e)}")

verify_directories()

def verify_image_structure():
    print("\n=== VERIFYING IMAGE STRUCTURE ===")
    if not os.path.exists(IMGS_BASE_DIR):
        print(f"ERROR: IMGS_BASE_DIR not found: {IMGS_BASE_DIR}")
        return

    print(f"IMGS_BASE_DIR found: {IMGS_BASE_DIR}")
    for modality in ['brain_mri', 'breast_mri', 'cardiac_mri', 'cardiac_us', 'chest_xray', 'knee_mri']:
        folder_path = os.path.join(IMGS_BASE_DIR, modality)
        if os.path.exists(folder_path):
            print(f"\nChecking {modality}:")
            files = os.listdir(folder_path)
            print(f"Files found: {files}")
        else:
            print(f"\nERROR: {modality} folder not found")

@app.route("/", methods=["GET"])
def welcome():
    """Welcome page for the API"""
    return jsonify({
        "message": "BetaSR Interface Backend API",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "frontend": "http://localhost:3000"
        }
    }), 200

@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint for Docker containers"""
    return jsonify({"status": "healthy", "service": "betasr-backend"}), 200


def _build_system_info():
    """Collect hardware, runtime and model information."""
    import platform, subprocess as _sp

    # ── Device detection ──────────────────────────────────────────────
    device_type = "cpu"
    device_name = "CPU"
    acceleration = "none"
    gpu_details = {}

    if torch.cuda.is_available():
        device_type = "cuda"
        idx = torch.cuda.current_device()
        prop = torch.cuda.get_device_properties(idx)
        device_name = prop.name
        total_vram = round(prop.total_memory / 1024**3, 1)
        used_vram = round((prop.total_memory - torch.cuda.mem_get_info(idx)[0]) / 1024**3, 1)
        gpu_details = {
            "name": prop.name,
            "vram_total_gb": total_vram,
            "vram_used_gb": used_vram,
            "cuda_version": torch.version.cuda,
            "compute_capability": f"{prop.major}.{prop.minor}",
        }
        acceleration = "cuda"
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        device_type = "mps"
        # Try to get Apple Silicon chip name
        try:
            chip = _sp.check_output(
                ["sysctl", "-n", "machdep.cpu.brand_string"], text=True
            ).strip()
        except Exception:
            chip = platform.processor() or "Apple Silicon"
        device_name = chip
        gpu_details = {"name": chip, "type": "Apple Neural Engine (via MPS)"}
        acceleration = "mps"
    else:
        # Check if we have ONNX Runtime with CoreML / DirectML / CUDA EP
        try:
            import onnxruntime as ort
            avail_eps = ort.get_available_providers()
            if "CoreMLExecutionProvider" in avail_eps:
                acceleration = "coreml-npu"
                try:
                    chip = _sp.check_output(
                        ["sysctl", "-n", "machdep.cpu.brand_string"], text=True
                    ).strip()
                except Exception:
                    chip = "Apple Silicon"
                device_name = f"{chip} (CoreML/ANE)"
                gpu_details = {"name": chip, "type": "Apple Neural Engine (CoreML EP)", "providers": avail_eps}
            elif "CUDAExecutionProvider" in avail_eps:
                acceleration = "onnx-cuda"
                device_name = "NVIDIA GPU (ONNX Runtime)"
            elif "DirectMLExecutionProvider" in avail_eps:
                acceleration = "directml-npu"
                device_name = "DirectML GPU/NPU"
            else:
                # Pure CPU — try to get a nice CPU name
                try:
                    if platform.system() == "Darwin":
                        chip = _sp.check_output(
                            ["sysctl", "-n", "machdep.cpu.brand_string"], text=True
                        ).strip()
                        device_name = chip
                    elif platform.system() == "Linux":
                        # Try /proc/cpuinfo first (x86_64)
                        try:
                            out = _sp.check_output(
                                ["grep", "-m1", "model name", "/proc/cpuinfo"], text=True
                            )
                            chip = out.split(":", 1)[-1].strip()
                        except Exception:
                            chip = ""
                        if not chip:
                            # ARM64 / Apple Silicon container: check Hardware line
                            try:
                                out = _sp.check_output(
                                    ["grep", "-m1", "Hardware", "/proc/cpuinfo"], text=True
                                )
                                chip = out.split(":", 1)[-1].strip()
                            except Exception:
                                chip = ""
                        if not chip:
                            # Detect Apple Silicon via DMI if available
                            try:
                                out = _sp.check_output(
                                    ["cat", "/sys/devices/virtual/dmi/id/product_name"], text=True
                                ).strip()
                                chip = out if out else ""
                            except Exception:
                                chip = ""
                        arch = platform.machine()
                        if not chip:
                            chip = f"{arch} CPU"
                        # If running arm64 inside Docker on Apple Silicon, annotate it
                        if arch in ("aarch64", "arm64") and not chip.lower().startswith("apple"):
                            chip = f"{chip} (arm64)"
                        device_name = chip
                    else:
                        device_name = platform.processor() or "CPU"
                except Exception:
                    device_name = platform.processor() or "CPU"
        except ImportError:
            pass

    # ── Model / backend detection ──────────────────────────────────────
    backend_env = os.environ.get("BETACLARITY_BACKEND", "pytorch")
    hf_repo = os.environ.get("BETACLARITY_HF_REPO", "OdaxAI/betaclarity-betasr")
    hf_file = os.environ.get("BETACLARITY_HF_FILE", "model.pth")

    if "onnx" in backend_env.lower() or hf_file.endswith(".onnx"):
        model_format = "ONNX INT8"
        quantized = True
        precision = "INT8"
    elif "cpu" in backend_env.lower():
        model_format = "PyTorch FP32"
        quantized = False
        precision = "FP32"
    elif device_type == "cuda":
        model_format = "PyTorch FP32"
        quantized = False
        precision = "FP32"
    else:
        model_format = "PyTorch FP32"
        quantized = False
        precision = "FP32"

    # ── Model file size ────────────────────────────────────────────────
    model_size_mb = None
    if os.path.exists(MODEL_PATH):
        model_size_mb = round(os.path.getsize(MODEL_PATH) / 1024**2, 1)

    # ── ONNX Runtime version ────────────────────────────────────────────
    ort_version = None
    ort_providers = []
    try:
        import onnxruntime as ort
        ort_version = ort.__version__
        ort_providers = ort.get_available_providers()
    except ImportError:
        pass

    return {
        "device": {
            "type": device_type,
            "name": device_name,
            "acceleration": acceleration,
            "details": gpu_details,
        },
        "model": {
            "format": model_format,
            "quantized": quantized,
            "precision": precision,
            "hf_repo": hf_repo,
            "hf_file": hf_file,
            "size_mb": model_size_mb,
            "backend_env": backend_env,
        },
        "runtime": {
            "torch_version": torch.__version__,
            "ort_version": ort_version,
            "ort_providers": ort_providers,
            "python_version": platform.python_version(),
            "os": platform.system(),
            "arch": platform.machine(),
        },
    }


_SYSTEM_INFO_CACHE = None


@app.route("/api/system-info", methods=["GET"])
def system_info():
    """Return hardware, model and runtime info for the UI status bar."""
    global _SYSTEM_INFO_CACHE
    if _SYSTEM_INFO_CACHE is None:
        _SYSTEM_INFO_CACHE = _build_system_info()
    return jsonify(_SYSTEM_INFO_CACHE), 200


# ─── Hardware selection + live monitor ───────────────────────────────────
_DEVICE_LIST_CACHE = None
_ACTIVE_DEVICE_ID = None
_ACTIVE_MODEL_FORMAT = None


def _current_device_id() -> str:
    """Map the global DEVICE / backend env to a public id."""
    global _ACTIVE_DEVICE_ID
    if _ACTIVE_DEVICE_ID is not None:
        return _ACTIVE_DEVICE_ID
    backend_env = os.environ.get("BETACLARITY_BACKEND", "pytorch").lower()
    if "coreml" in backend_env:
        return "coreml"
    if "directml" in backend_env or "dml" in backend_env:
        return "directml"
    if torch.cuda.is_available() and DEVICE.type == "cuda":
        return f"cuda:{DEVICE.index or 0}"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available() and DEVICE.type == "mps":
        return "mps"
    return "cpu"


def _current_model_format() -> str:
    global _ACTIVE_MODEL_FORMAT
    if _ACTIVE_MODEL_FORMAT is not None:
        return _ACTIVE_MODEL_FORMAT
    backend_env = os.environ.get("BETACLARITY_BACKEND", "pytorch").lower()
    hf_file = os.environ.get("BETACLARITY_HF_FILE", "model.pth").lower()
    if "onnx" in backend_env or hf_file.endswith(".onnx"):
        return "onnx_int8"
    return "pytorch_fp32"


@app.route("/api/devices", methods=["GET"])
def api_devices():
    """List all compute devices the backend can target + which one is active."""
    global _DEVICE_LIST_CACHE
    if _DEVICE_LIST_CACHE is None:
        _DEVICE_LIST_CACHE = list_compute_devices()

    # The PyTorch FP32 backend cannot target ONNX-only providers (CoreML / DirectML)
    # without a quantised model; surface that constraint to the frontend.
    backend_supports_onnx = bool(os.environ.get("BETACLARITY_BACKEND", "").lower().startswith("onnx"))
    devices = []
    for d in _DEVICE_LIST_CACHE:
        copy = dict(d)
        if d["id"] in ("coreml", "directml") and not backend_supports_onnx:
            copy["available"] = False
            copy["reason"] = (
                "Quantised ONNX runtime not active in this container. Run the native macOS / "
                "ONNX image to enable this device."
            )
        devices.append(copy)

    available_models = [
        {
            "id": "pytorch_fp32",
            "label": "PyTorch FP32",
            "size_mb": round(os.path.getsize(MODEL_PATH) / 1024**2, 1) if os.path.exists(MODEL_PATH) else None,
            "available": os.path.exists(MODEL_PATH),
            "hf_repo": "OdaxAI/betaclarity-betasr",
        },
        {
            "id": "onnx_int8",
            "label": "ONNX INT8 (quantised)",
            "size_mb": 380,
            "available": backend_supports_onnx,
            "hf_repo": "OdaxAI/betaclarity-betasr-onnx",
            "reason": (None if backend_supports_onnx else
                       "Pull the onnx variant: docker.io/odaxai/betaclarity:onnx"),
        },
    ]

    return jsonify({
        "devices": devices,
        "active_device": _current_device_id(),
        "models": available_models,
        "active_model": _current_model_format(),
    }), 200


@app.route("/api/select-device", methods=["POST"])
def api_select_device():
    """
    Switch the active inference device.

    Supported transitions in the slim/CPU image:
        cpu  ↔  cuda:N    (requires NVIDIA GPU + CUDA-enabled torch)

    coreml / directml require the ONNX-runtime variant of the image and will
    return HTTP 409 with a clear explanation here.
    """
    global SR_MODEL, DEVICE, _ACTIVE_DEVICE_ID
    try:
        body = request.get_json(silent=True) or {}
        target = (body.get("device") or "").lower()
        if not target:
            return jsonify({"error": "Missing 'device' field"}), 400

        if target.startswith("cuda"):
            if not torch.cuda.is_available():
                return jsonify({
                    "error": "CUDA not available in this container",
                    "hint": "Pull docker.io/odaxai/betaclarity:cuda and run with --gpus all",
                }), 409
            idx = int(target.split(":")[1]) if ":" in target else 0
            new_device = torch.device(f"cuda:{idx}")
        elif target == "cpu":
            new_device = torch.device("cpu")
        elif target in ("coreml", "directml", "mps"):
            return jsonify({
                "error": f"Device '{target}' requires the ONNX runtime variant of the image.",
                "hint": "Run BETACLARITY natively on macOS, or pull docker.io/odaxai/betaclarity:onnx",
            }), 409
        else:
            return jsonify({"error": f"Unknown device id '{target}'"}), 400

        # Move the model
        if SR_MODEL is not None:
            SR_MODEL.to(new_device)
        DEVICE = new_device
        _ACTIVE_DEVICE_ID = target

        # Invalidate caches so next /api/system-info reflects the change
        global _SYSTEM_INFO_CACHE
        _SYSTEM_INFO_CACHE = None
        logger.info(f"Switched compute device to {target}")
        return jsonify({"ok": True, "active_device": target}), 200

    except Exception as ex:
        logger.error(f"select-device error: {ex}")
        return jsonify({"error": str(ex)}), 500


@app.route("/api/select-model", methods=["POST"])
def api_select_model():
    """
    Switch between the FP32 PyTorch checkpoint and the INT8 ONNX bundle.

    The slim/CPU image only ships the PyTorch backend. To use the quantised
    ONNX bundle, either run BETACLARITY natively on macOS or pull the onnx
    variant of the image.
    """
    body = request.get_json(silent=True) or {}
    target = (body.get("model") or "").lower()
    if target not in ("pytorch_fp32", "onnx_int8"):
        return jsonify({"error": "model must be 'pytorch_fp32' or 'onnx_int8'"}), 400

    backend_supports_onnx = bool(os.environ.get("BETACLARITY_BACKEND", "").lower().startswith("onnx"))
    if target == "onnx_int8" and not backend_supports_onnx:
        return jsonify({
            "error": "ONNX INT8 backend not available in this image",
            "hint": "Pull docker.io/odaxai/betaclarity:onnx, or run natively on macOS with onnxruntime-coreml",
        }), 409

    global _ACTIVE_MODEL_FORMAT, _SYSTEM_INFO_CACHE
    _ACTIVE_MODEL_FORMAT = target
    _SYSTEM_INFO_CACHE = None
    return jsonify({"ok": True, "active_model": target}), 200


@app.route("/api/inference-stats", methods=["GET"])
def api_inference_stats():
    """Latest hardware-utilisation samples + active denoising session info."""
    last_n = int(request.args.get("last_n", 60))
    return jsonify(DeviceMonitor.instance().snapshot(last_n=last_n)), 200

@app.route("/chat", methods=["POST", "OPTIONS"])
def chat_endpoint():
    """Chat endpoint for Medgemini 4b integration"""
    if request.method == "OPTIONS":
        # Handle CORS preflight
        response = jsonify({})
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        return response
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        message = data.get('message', '')
        conversation_id = data.get('conversation_id', 'default')
        image_data = data.get('image')
        
        # For now, return a mock response indicating the chat system is ready
        # In a real implementation, you would integrate with Medgemini 4b here
        response_text = f"""🏥 **BetaSR Medical Assistant**

I understand you're trying to communicate with the AI chat system. The chat endpoint is now active!

**Your message**: {message}

**Medical Image Analysis Ready**: 
- ✅ BetaSR Deep Learning Model Active
- ✅ GPU RTX 3090 Processing  
- ✅ Color & Dimension Corrections Applied
- ✅ Chat System Connected

For full AI integration, the Medgemini 4b system would be connected here. Currently showing this as a demo response.

**Next**: Upload medical images for BetaSR enhancement and analysis."""

        # Add CORS headers to response
        response = jsonify({
            "response": response_text,
            "conversation_id": conversation_id,
            "status": "success"
        })
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        
        return response
        
    except Exception as e:
        logger.error(f"Chat endpoint error: {str(e)}")
        error_response = jsonify({"error": str(e)})
        error_response.headers['Access-Control-Allow-Origin'] = '*'
        return error_response, 500

@app.route("/export_measurement/<session_id>", methods=["POST", "OPTIONS"])
def export_measurement(session_id):
    if request.method == "OPTIONS":
        response = jsonify({"status": "ok"})
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
        
    try:
        data = request.json
        measurements = data.get('measurements', [])
        image_type = data.get('type', 'preprocessed')  # preprocessed, distorted, or denoised

        # Get the base image path
        if image_type == 'preprocessed':
            img_path = os.path.join(SESSIONS_DIR, session_id, "preprocessed.png")
        elif image_type == 'distorted':
            img_path = os.path.join(SESSIONS_DIR, session_id, "distorted.png")
        else:
            img_path = os.path.join(SESSIONS_DIR, session_id, "denoised.png")

        if not os.path.exists(img_path):
            return jsonify({"error": "Image not found"}), 404

        # Read the image
        img = cv2.imread(img_path)
        
        # Draw measurements
        for m in measurements:
            # Draw line
            cv2.line(img, 
                    (int(m['start']['x']), int(m['start']['y'])),
                    (int(m['end']['x']), int(m['end']['y'])),
                    (0, 0, 255), 2)
            
            # Draw measurement text
            mid_x = int((m['start']['x'] + m['end']['x']) / 2)
            mid_y = int((m['start']['y'] + m['end']['y']) / 2)
            text = f"{m['distance']:.1f} mm"
            
            # Add background rectangle for text
            (text_w, text_h), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            cv2.rectangle(img, 
                        (mid_x - text_w//2 - 5, mid_y - text_h - 5),
                        (mid_x + text_w//2 + 5, mid_y + 5),
                        (0, 0, 0), -1)
            
            # Add text
            cv2.putText(img, text,
                       (mid_x - text_w//2, mid_y),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                       (255, 255, 255), 1)

        # Save the image with measurements
        export_path = os.path.join(SESSIONS_DIR, session_id, "measurement_export.png")
        cv2.imwrite(export_path, img)

        response = send_file(export_path, mimetype='image/png',
                           as_attachment=True,
                           download_name='measurement_export.png')
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response

    except Exception as e:
        print(f"Error in export_measurement: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    verify_image_structure()
    port = 8001
    max_retries = 3
    
    for attempt in range(max_retries):
        try:
            logger.info(f"Ensuring port {port} is free (attempt {attempt+1}/{max_retries})...")
            free_port(port)
            logger.info(f"Launching Flask on port {port}...")
            # Disable interactive mode to avoid terminal I/O errors
            app.run(host="0.0.0.0", port=port, debug=True, use_reloader=False)
            break  # If we get here, the app started successfully
        except OSError as e:
            if e.errno == 98:  # Address already in use
                logger.warning(f"Port {port} still in use after killing processes")
                if attempt < max_retries - 1:
                    port = port + 1  # Try the next port
                    logger.info(f"Retrying with port {port}")
                else:
                    logger.error(f"Failed to find available port after {max_retries} attempts")
                    sys.exit(1)
            else:
                logger.exception("Error starting Flask server")
                sys.exit(1)