"""Download the official ComfyUI MiniMax H3 model set to a Network Volume."""

from __future__ import annotations

import os
from pathlib import Path


MODEL_REPO = "Comfy-Org/MiniMax-H3"
COMMON_FILES = (
    "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
    "vae/minimax_h3_video_vae_fp16.safetensors",
    "vae/minimax_h3_audio_vae_fp32.safetensors",
)
MODE_FILES = {
    "fl2va": "diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors",
    "ref2va": "diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors",
}


def prepare_models(include_ref2va: bool = True) -> dict[str, object]:
    from huggingface_hub import hf_hub_download

    root = Path(os.getenv("H3_MODEL_ROOT", "/runpod-volume/comfyui-models")).resolve()
    files = [*COMMON_FILES, MODE_FILES["fl2va"]]
    if include_ref2va:
        files.append(MODE_FILES["ref2va"])
    downloaded: list[str] = []
    for relative in files:
        destination = root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.is_file() and destination.stat().st_size > 0:
            downloaded.append(str(destination))
            continue
        cached = hf_hub_download(
            repo_id=MODEL_REPO,
            filename=relative,
            local_dir=root,
            token=os.getenv("HF_TOKEN") or None,
        )
        downloaded.append(str(Path(cached)))
    return {
        "ready": True,
        "model": "MiniMax-H3",
        "root": str(root),
        "files": downloaded,
        "referenceMode": include_ref2va,
    }
