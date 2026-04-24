#!/usr/bin/env python3
"""
Download the BETACLARITY demo sample images from HuggingFace.

Pulls the dataset `OdaxAI/betaclarity-sample-images` into the path expected by
the Flask backend (`<backend_dir>/public/imgs/`). Idempotent: if the folder
already contains the expected files, nothing is downloaded.

Run via `python download_samples.py` or imported and called as
`download_samples(target_dir)` from the entrypoint.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

REPO_ID = os.environ.get(
    "BETACLARITY_SAMPLES_REPO", "OdaxAI/betaclarity-sample-images"
)

# Folder name -> filename prefix (must match backend/app.py)
EXPECTED = {
    "brain_mri": "brain",
    "breast_mri": "breast",
    "cardiac_mri": "cardiac",
    "cardiac_us": "cardiacUS",
    "chest_xray": "chest",
    "knee_mri": "knee",
}


def already_present(target_dir: Path) -> bool:
    for folder, prefix in EXPECTED.items():
        for i in range(1, 7):
            if not (target_dir / folder / f"{prefix}{i}.png").is_file():
                return False
    return True


def download_samples(target_dir: Path) -> Path:
    """Download (or skip) sample images into ``target_dir``.

    Returns the populated directory.
    """
    target_dir = Path(target_dir).resolve()
    target_dir.mkdir(parents=True, exist_ok=True)

    if already_present(target_dir):
        print(f"[samples] already present at {target_dir}", flush=True)
        return target_dir

    try:
        from huggingface_hub import snapshot_download
    except ImportError as e:  # pragma: no cover
        raise RuntimeError(
            "huggingface_hub is required to download sample images"
        ) from e

    token = os.environ.get("HUGGINGFACE_HUB_TOKEN")
    print(
        f"[samples] downloading {REPO_ID} -> {target_dir}",
        flush=True,
    )
    snapshot_path = snapshot_download(
        repo_id=REPO_ID,
        repo_type="dataset",
        local_dir=str(target_dir),
        token=token,
        allow_patterns=["*/*.png", "README.md"],
    )
    print(f"[samples] done ({snapshot_path})", flush=True)
    return target_dir


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "target_dir",
        nargs="?",
        default=str(Path(__file__).resolve().parent / "public" / "imgs"),
        help="Destination folder for the sample images",
    )
    args = parser.parse_args()
    try:
        download_samples(Path(args.target_dir))
    except Exception as e:
        print(f"[samples] WARNING: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
