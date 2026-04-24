# ============================================================
#  BETACLARITY Interface — unified Docker image
#  Frontend (React/Webpack) + Backend (Flask/PyTorch)
# ============================================================

# ---- Stage 1: Build the React frontend ----
FROM node:18-alpine AS frontend-build

WORKDIR /build

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts 2>/dev/null || npm install

COPY webpack.config.js ./
COPY src/ ./src/
COPY public/ ./public/
COPY components/ ./components/
COPY index.html ./

ENV NODE_ENV=production
ENV REACT_APP_API_URL=/api
ENV REACT_APP_BACKEND_URL=http://localhost:8001

RUN npx webpack --mode production


# ---- Stage 2: Python backend + serve frontend ----
FROM pytorch/pytorch:2.1.2-cuda12.1-cudnn8-runtime

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility \
    CUDA_DEVICE_ORDER=PCI_BUS_ID

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    curl \
    nginx \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /tmp/requirements.txt && \
    pip install --no-cache-dir diffusers transformers accelerate huggingface-hub gunicorn && \
    rm /tmp/requirements.txt

COPY backend/ ./backend/

COPY --from=frontend-build /build/dist /app/static

RUN mkdir -p /app/backend/sessions /app/backend/model

COPY <<'NGINX_CONF' /etc/nginx/sites-available/default
server {
    listen 80;
    server_name _;

    root /app/static;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        client_max_body_size 100M;
    }

    location /health {
        proxy_pass http://127.0.0.1:8001/health;
    }

    location /create_session {
        proxy_pass http://127.0.0.1:8001/create_session;
        proxy_read_timeout 300s;
        client_max_body_size 100M;
    }

    location /upload_file {
        proxy_pass http://127.0.0.1:8001/upload_file;
        proxy_read_timeout 300s;
        client_max_body_size 100M;
    }

    location /enhance {
        proxy_pass http://127.0.0.1:8001/enhance;
        proxy_read_timeout 600s;
        client_max_body_size 100M;
    }
}
NGINX_CONF

COPY <<'ENTRYPOINT' /app/entrypoint.sh
#!/bin/bash
set -e

echo "==============================================="
echo "  BETACLARITY Interface starting..."
echo "==============================================="
echo "  Compute device: $(python -c 'import torch; print("CUDA" if torch.cuda.is_available() else "CPU")')"

MODEL_PATH="/app/backend/model/model.pth"
HF_REPO="${BETACLARITY_HF_REPO:-odaxai/betaclarity-betasr}"
HF_FILE="${BETACLARITY_HF_FILE:-model.pth}"

if [ ! -f "$MODEL_PATH" ]; then
    echo "  Model not found at $MODEL_PATH"
    echo "  Downloading $HF_FILE from $HF_REPO ..."
    python - <<PYDL
import os, sys
from huggingface_hub import hf_hub_download
try:
    p = hf_hub_download(
        repo_id=os.environ.get("HF_REPO", "odaxai/betaclarity-betasr"),
        filename=os.environ.get("HF_FILE", "model.pth"),
        local_dir="/app/backend/model",
        token=os.environ.get("HUGGINGFACE_HUB_TOKEN"),
    )
    print(f"  Downloaded to {p}")
except Exception as e:
    print(f"  WARNING: model download failed: {e}", file=sys.stderr)
    print("  The interface will start, but enhancement endpoints will return 503", file=sys.stderr)
    print("  Mount weights with: -v /local/model.pth:/app/backend/model/model.pth", file=sys.stderr)
PYDL
else
    echo "  Model already present at $MODEL_PATH"
fi

echo "  Starting nginx (port 80) and gunicorn (port 8001)..."
echo "==============================================="

nginx

cd /app/backend
exec gunicorn app:app \
    --bind 0.0.0.0:8001 \
    --workers 1 \
    --threads 4 \
    --timeout 600 \
    --access-logfile - \
    --error-logfile -
ENTRYPOINT
RUN chmod +x /app/entrypoint.sh

EXPOSE 80 8001

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:80/ && curl -f http://localhost:8001/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
