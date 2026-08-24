"""Download the official ComfyUI MiniMax H3 model set to a Network Volume."""

from __future__ import annotations

import os
from pathlib import Path


MODEL_REPO = "Comfy-Org/MiniMax-H3"
MUSIC3_REPO = "Comfy-Org/MiniMax-Music-3"
COMMON_FILES = (
    "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
    "vae/minimax_h3_video_vae_fp16.safetensors",
    "vae/minimax_h3_audio_vae_fp32.safetensors",
)
MODE_FILES = {
    "fl2va": "diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors",
    "ref2va": "diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors",
}
MUSIC3_COMMON_FILES = (
    "text_encoders/minimax_music3_text_encoder_pruned_int8_convrot.safetensors",
    "vae/minimax_music3_dav.safetensors",
)
MUSIC3_VARIANTS = {
    "int8": "diffusion_models/minimax_music3_dit_int8_convrot.safetensors",
    "fp16": "diffusion_models/minimax_music3_dit_fp16.safetensors",
}


def _model_root() -> Path:
    return Path(os.getenv("H3_MODEL_ROOT", "/runpod-volume/comfyui-models")).resolve()


def _file_status(root: Path, files: tuple[str, ...]) -> list[dict[str, object]]:
    status: list[dict[str, object]] = []
    for relative in files:
        path = root / relative
        status.append({
            "path": str(path),
            "exists": path.is_file(),
            "bytes": path.stat().st_size if path.is_file() else 0,
        })
    return status


def prepare_models(include_ref2va: bool = True) -> dict[str, object]:
    from huggingface_hub import hf_hub_download

    root = _model_root()
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


def _music3_variant(value: str | None) -> str:
    variant = (value or "int8").strip().lower()
    if variant not in MUSIC3_VARIANTS:
        raise ValueError(f"Unsupported MiniMax Music 3 variant: {variant!r}")
    return variant


def music3_model_status(variant: str = "int8") -> dict[str, object]:
    variant = _music3_variant(variant)
    root = _model_root()
    required = (MUSIC3_VARIANTS[variant], *MUSIC3_COMMON_FILES)
    files = _file_status(root, required)
    return {
        "ready": all(bool(item["exists"]) and int(item["bytes"]) > 0 for item in files),
        "model": "MiniMax-Music3",
        "variant": variant,
        "repo": MUSIC3_REPO,
        "root": str(root),
        "files": files,
    }


def prepare_music3_models(variant: str = "int8") -> dict[str, object]:
    from huggingface_hub import hf_hub_download

    variant = _music3_variant(variant)
    root = _model_root()
    downloaded: list[str] = []
    files = (MUSIC3_VARIANTS[variant], *MUSIC3_COMMON_FILES)
    for relative in files:
        destination = root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.is_file() and destination.stat().st_size > 0:
            downloaded.append(str(destination))
            continue
        cached = hf_hub_download(
            repo_id=MUSIC3_REPO,
            filename=relative,
            local_dir=root,
            token=os.getenv("HF_TOKEN") or None,
        )
        downloaded.append(str(Path(cached)))
    return {
        "ready": True,
        "model": "MiniMax-Music3",
        "variant": variant,
        "repo": MUSIC3_REPO,
        "root": str(root),
        "files": downloaded,
    }


if __name__ == "__main__":
    import json
    import sys

    target = sys.argv[1].strip().lower() if len(sys.argv) > 1 else "h3"
    if target in {"music", "music3", "minimax-music3"}:
        variant = sys.argv[2] if len(sys.argv) > 2 else "int8"
        result = prepare_music3_models(variant)
    elif target in {"music-status", "music3-status"}:
        variant = sys.argv[2] if len(sys.argv) > 2 else "int8"
        result = music3_model_status(variant)
    else:
        result = prepare_models()
    print(json.dumps(result, ensure_ascii=False, indent=2))
