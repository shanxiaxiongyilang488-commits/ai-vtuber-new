"""Text-to-image generation with Anima through the Pod's existing ComfyUI."""

from __future__ import annotations

import base64
import os
import time
import uuid
from pathlib import Path
from typing import Any

import video_handler as comfy


MODEL_ROOT = Path(os.getenv("ANIMA_MODEL_ROOT", os.getenv("H3_MODEL_ROOT", "/workspace/runpod-slim/ComfyUI/models"))).resolve()
OUTPUT_ROOT = Path(os.getenv("COMFY_OUTPUT", "/workspace/runpod-slim/ComfyUI/output")).resolve()
MODEL_NAMES = {
    "unet": "anima-base-v1.0.safetensors",
    "clip": "qwen_3_06b_base.safetensors",
    "vae": "qwen_image_vae.safetensors",
}
DEFAULT_NEGATIVE = "worst quality, low quality, score_1, score_2, score_3, blurry, jpeg artifacts, sepia"


def _model_path(kind: str, name: str) -> Path:
    return MODEL_ROOT / kind / name


def model_status() -> dict[str, Any]:
    required = {
        "diffusion_model": _model_path("diffusion_models", MODEL_NAMES["unet"]),
        "text_encoder": _model_path("text_encoders", MODEL_NAMES["clip"]),
        "vae": _model_path("vae", MODEL_NAMES["vae"]),
    }
    missing = [str(path) for path in required.values() if not path.is_file()]
    return {"ready": not missing, "missing": missing}


def _validate_model_files() -> None:
    status = model_status()
    if status["missing"]:
        raise FileNotFoundError(
            "Anima is not prepared on this Pod. Run /workspace/ai-vtuber-voice/download-anima.sh first. Missing: "
            + ", ".join(status["missing"])
        )


def dimensions_for_size(value: str) -> tuple[int, int]:
    # Keep the pixel count near one megapixel so Anima is reliable on a 24 GB RTX 4090.
    sizes = {
        "1024x1024": (1024, 1024),
        "1024x1536": (832, 1216),
        "1024x1792": (832, 1216),
        "1536x1024": (1216, 832),
        "1792x1024": (1216, 832),
    }
    return sizes.get(value, sizes["1024x1024"])


def workflow(data: dict[str, Any], prefix: str) -> dict[str, Any]:
    width, height = dimensions_for_size(str(data.get("size") or "1024x1024"))
    seed = int(data.get("seed") if data.get("seed") is not None else uuid.uuid4().int % (2**63 - 1))
    steps = min(50, max(20, int(data.get("steps") or 30)))
    cfg = min(6.0, max(3.0, float(data.get("cfg") or 4.0)))
    negative = str(data.get("negative") or DEFAULT_NEGATIVE).strip()
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": MODEL_NAMES["unet"], "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": MODEL_NAMES["clip"], "type": "stable_diffusion", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": MODEL_NAMES["vae"]}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": str(data["prompt"]), "clip": ["2", 0]}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"text": negative, "clip": ["2", 0]}},
        "6": {"class_type": "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "7": {"class_type": "KSampler", "inputs": {
            "model": ["1", 0], "positive": ["4", 0], "negative": ["5", 0], "latent_image": ["6", 0],
            "seed": seed, "steps": steps, "cfg": cfg, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0,
        }},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["3", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": prefix}},
    }


def _wait_for_output(prompt_id: str, prefix: str) -> Path:
    timeout = int(os.getenv("ANIMA_TIMEOUT_SECONDS", "1800"))
    deadline = time.monotonic() + timeout
    leaf = prefix.split("/")[-1]
    while time.monotonic() < deadline:
        history = comfy._json_request(f"/history/{prompt_id}", timeout=30)
        item = history.get(prompt_id)
        if item:
            status = item.get("status") or {}
            if status.get("status_str") == "error":
                raise RuntimeError(f"ComfyUI Anima generation failed: {status.get('messages')}")
            candidates = sorted(
                (path for path in OUTPUT_ROOT.rglob(f"{leaf}*") if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}),
                key=lambda path: path.stat().st_mtime,
                reverse=True,
            )
            if candidates:
                return candidates[0]
        time.sleep(2)
    raise TimeoutError(f"Anima did not finish within {timeout} seconds.")


def generate(data: dict[str, Any]) -> dict[str, Any]:
    prompt = str(data.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("prompt is required.")
    if len(prompt) > 12000:
        raise ValueError("prompt exceeds 12000 characters.")
    if data.get("imageUrl") or data.get("imageUrls"):
        raise ValueError("Anima currently supports text-to-image only. Use GPT Image 2 for reference-image edits.")
    _validate_model_files()
    comfy._ensure_comfy()
    prefix = f"image/anima-{uuid.uuid4()}"
    queued = comfy._json_request("/prompt", {"prompt": workflow(data, prefix)}, timeout=120)
    prompt_id = str(queued.get("prompt_id") or "")
    if not prompt_id:
        raise RuntimeError(f"ComfyUI rejected the Anima workflow: {queued}")
    output = _wait_for_output(prompt_id, prefix)
    mime = "image/jpeg" if output.suffix.lower() in {".jpg", ".jpeg"} else ("image/webp" if output.suffix.lower() == ".webp" else "image/png")
    return {
        "image_base64": base64.b64encode(output.read_bytes()).decode("ascii"),
        "mime_type": mime,
        "model": "Anima Base v1.0",
        "prompt_id": prompt_id,
        "width": dimensions_for_size(str(data.get("size") or "1024x1024"))[0],
        "height": dimensions_for_size(str(data.get("size") or "1024x1024"))[1],
    }
