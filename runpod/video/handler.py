"""RunPod Serverless adapter for local MiniMax H3 inference through ComfyUI."""

from __future__ import annotations

import base64
import json
import mimetypes
import os
import subprocess
import tempfile
import threading
import time
import urllib.request
import uuid
from pathlib import Path
from typing import Any


COMFYUI_ROOT = Path(os.getenv("COMFYUI_ROOT", "/opt/ComfyUI")).resolve()
MODEL_ROOT = Path(os.getenv("H3_MODEL_ROOT", "/runpod-volume/comfyui-models")).resolve()
COMFY_URL = "http://127.0.0.1:8188"
COMFY_INPUT = Path("/tmp/comfy-input")
COMFY_OUTPUT = Path("/tmp/comfy-output")
MAX_IMAGE_BYTES = 12 * 1024 * 1024
# RunPod /runsync responses are capped at 20 MB. Base64 and JSON add roughly
# 35% overhead, so keep the raw file below 13 MB when object storage is absent.
MAX_INLINE_VIDEO_BYTES = 13 * 1024 * 1024
MODEL_NAMES = {
    "fl2va": "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
    "ref2va": "minimax_h3_ref2va_pruned_int8_convrot.safetensors",
    "clip": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
    "video_vae": "minimax_h3_video_vae_fp16.safetensors",
    "audio_vae": "minimax_h3_audio_vae_fp32.safetensors",
}

_comfy_process: subprocess.Popen[Any] | None = None
_comfy_lock = threading.Lock()
_comfy_log: Any = None


def duration_to_frames(duration: float) -> int:
    """Snap 24 fps output to MiniMax H3's required 17k+5 frame grid."""
    frames = max(5, round(min(15.0, max(1.0, float(duration))) * 24))
    while frames % 17 != 5:
        frames += 1
    return frames


def dimensions_for_ratio(value: str) -> tuple[int, int]:
    ratios = {
        "16:9": (1344, 768),
        "9:16": (768, 1344),
        "1:1": (1024, 1024),
        "4:3": (1184, 896),
        "3:4": (896, 1184),
    }
    return ratios.get(value, ratios["16:9"])


def _model_path(kind: str, name: str) -> Path:
    return MODEL_ROOT / kind / name


def _validate_model_files(mode: str) -> None:
    required = [
        _model_path("text_encoders", MODEL_NAMES["clip"]),
        _model_path("vae", MODEL_NAMES["video_vae"]),
        _model_path("vae", MODEL_NAMES["audio_vae"]),
        _model_path("diffusion_models", MODEL_NAMES["ref2va" if mode == "r2v" else "fl2va"]),
    ]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise FileNotFoundError(
            "MiniMax H3 is not prepared on the Network Volume. Run task=video.prepare first. Missing: "
            + ", ".join(missing)
        )


def _json_request(path: str, payload: dict[str, Any] | None = None, timeout: int = 30) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        COMFY_URL + path,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST" if payload is not None else "GET",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read()
    return json.loads(raw) if raw else {}


def _ensure_comfy() -> None:
    global _comfy_process, _comfy_log
    try:
        _json_request("/system_stats", timeout=2)
        return
    except Exception:
        pass
    with _comfy_lock:
        try:
            _json_request("/system_stats", timeout=2)
            return
        except Exception:
            pass
        COMFY_INPUT.mkdir(parents=True, exist_ok=True)
        COMFY_OUTPUT.mkdir(parents=True, exist_ok=True)
        if _comfy_process and _comfy_process.poll() is None:
            pass
        else:
            _comfy_log = open("/tmp/comfyui.log", "a", encoding="utf-8")
            _comfy_process = subprocess.Popen(
                [
                    "python", str(COMFYUI_ROOT / "main.py"),
                    "--listen", "127.0.0.1", "--port", "8188", "--disable-auto-launch",
                    "--extra-model-paths-config", "/worker/extra_model_paths.yaml",
                    "--input-directory", str(COMFY_INPUT),
                    "--output-directory", str(COMFY_OUTPUT),
                ],
                cwd=str(COMFYUI_ROOT),
                stdout=_comfy_log,
                stderr=subprocess.STDOUT,
            )
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            if _comfy_process and _comfy_process.poll() is not None:
                detail = Path("/tmp/comfyui.log").read_text("utf-8", errors="replace")[-8000:]
                raise RuntimeError(f"ComfyUI exited during startup:\n{detail}")
            try:
                _json_request("/system_stats", timeout=3)
                return
            except Exception:
                time.sleep(2)
        raise TimeoutError("ComfyUI did not start within 180 seconds.")


def _decode_image(value: str) -> tuple[bytes, str]:
    if value.lower().startswith("data:image/"):
        header, separator, encoded = value.partition(",")
        if not separator or ";base64" not in header.lower():
            raise ValueError("Reference image data URL must be base64 encoded.")
        payload = base64.b64decode(encoded, validate=True)
        mime = header[5:].split(";", 1)[0]
        extension = mimetypes.guess_extension(mime) or ".png"
    else:
        if not value.lower().startswith("https://"):
            raise ValueError("Reference images must use HTTPS or base64 data URLs.")
        request = urllib.request.Request(value, headers={"User-Agent": "ai-vtuber-h3-worker/1"})
        with urllib.request.urlopen(request, timeout=60) as response:
            mime = response.headers.get_content_type()
            if not mime.startswith("image/"):
                raise ValueError(f"Reference URL returned {mime}, not an image.")
            payload = response.read(MAX_IMAGE_BYTES + 1)
        extension = mimetypes.guess_extension(mime) or ".png"
    if not payload or len(payload) > MAX_IMAGE_BYTES:
        raise ValueError("Each reference image must be between 1 byte and 12 MB.")
    return payload, extension


def _upload_image(value: str, index: int) -> str:
    import requests

    payload, extension = _decode_image(value)
    name = f"h3-input-{uuid.uuid4()}-{index}{extension}"
    response = requests.post(
        COMFY_URL + "/upload/image",
        files={"image": (name, payload, mimetypes.guess_type(name)[0] or "image/png")},
        data={"type": "input", "overwrite": "true"},
        timeout=120,
    )
    response.raise_for_status()
    uploaded = response.json()
    return "/".join(part for part in (uploaded.get("subfolder"), uploaded.get("name")) if part)


def _base_graph(model_name: str, seed: int) -> dict[str, Any]:
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": model_name, "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": MODEL_NAMES["clip"], "type": "minimax", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": MODEL_NAMES["video_vae"]}},
        "4": {"class_type": "VAELoader", "inputs": {"vae_name": MODEL_NAMES["audio_vae"]}},
        "5": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "6": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "res_multistep"}},
        "7": {"class_type": "BasicScheduler", "inputs": {"model": ["1", 0], "scheduler": "simple", "steps": 20, "denoise": 1.0}},
        "8": {"class_type": "BasicGuider", "inputs": {"model": ["1", 0], "conditioning": ["10", 0]}},
        "9": {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["5", 0], "guider": ["8", 0], "sampler": ["6", 0], "sigmas": ["7", 0], "latent_image": ["10", 1]}},
        "11": {"class_type": "VAEDecode", "inputs": {"samples": ["9", 0], "vae": ["3", 0]}},
        "12": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["9", 0], "vae": ["4", 0]}},
        "13": {"class_type": "CreateVideo", "inputs": {"images": ["11", 0], "audio": ["12", 0], "fps": 24}},
    }


def _workflow(data: dict[str, Any], uploaded: list[str], prefix: str) -> dict[str, Any]:
    prompt = str(data["prompt"])
    duration = float(data.get("duration") or 5)
    width, height = dimensions_for_ratio(str(data.get("aspectRatio") or "16:9"))
    seed = int(data.get("seed") if data.get("seed") is not None else 1)
    mode = "r2v" if len(uploaded) > 1 or str(data.get("mode")) == "r2v" else ("i2v" if uploaded else "t2v")
    graph = _base_graph(MODEL_NAMES["ref2va" if mode == "r2v" else "fl2va"], seed)
    for index, image_name in enumerate(uploaded):
        graph[f"image-{index}"] = {"class_type": "LoadImage", "inputs": {"image": image_name}}
    if mode == "r2v":
        conditioning: dict[str, Any] = {
            "clip": ["2", 0], "vae": ["3", 0], "audio_vae": ["4", 0],
            "prompt": prompt, "width": width, "height": height,
            "length": duration_to_frames(duration), "ref_image_size": str(data.get("referenceSize") or "match"),
        }
        for index in range(min(9, len(uploaded))):
            conditioning[f"ref_images.ref_image_{index}"] = [f"image-{index}", 0]
        graph["10"] = {"class_type": "MiniMaxH3ReferenceToVideo", "inputs": conditioning}
    else:
        conditioning = {
            "clip": ["2", 0], "vae": ["3", 0], "prompt": prompt,
            "width": width, "height": height, "length": duration_to_frames(duration),
        }
        if uploaded:
            conditioning["first_frame"] = ["image-0", 0]
        graph["10"] = {"class_type": "MiniMaxH3ImageToVideo", "inputs": conditioning}
    graph["14"] = {
        "class_type": "SaveVideo",
        "inputs": {"video": ["13", 0], "filename_prefix": prefix, "format": "auto", "codec": "auto"},
    }
    return graph


def _wait_for_output(prompt_id: str, prefix: str) -> Path:
    timeout = int(os.getenv("VIDEO_TIMEOUT_SECONDS", "10800"))
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        history = _json_request(f"/history/{prompt_id}", timeout=30)
        item = history.get(prompt_id)
        if item:
            status = item.get("status") or {}
            if status.get("status_str") == "error":
                messages = status.get("messages") or []
                raise RuntimeError(f"ComfyUI H3 generation failed: {json.dumps(messages, ensure_ascii=False)[-6000:]}")
            candidates = sorted(
                (path for path in COMFY_OUTPUT.rglob(f"{prefix.split('/')[-1]}*") if path.suffix.lower() in {".mp4", ".webm", ".mkv"}),
                key=lambda path: path.stat().st_mtime,
                reverse=True,
            )
            if candidates:
                return candidates[0]
        time.sleep(5)
    raise TimeoutError(f"MiniMax H3 did not finish within {timeout} seconds.")


def _upload_or_inline(source: Path) -> dict[str, Any]:
    bucket = os.getenv("S3_BUCKET", "").strip()
    if bucket:
        import boto3

        key = f"{os.getenv('S3_PREFIX', 'ai-vtuber').strip('/')}/{uuid.uuid4()}{source.suffix}"
        client = boto3.client(
            "s3", endpoint_url=os.getenv("S3_ENDPOINT_URL") or None,
            aws_access_key_id=os.getenv("S3_ACCESS_KEY_ID") or None,
            aws_secret_access_key=os.getenv("S3_SECRET_ACCESS_KEY") or None,
            region_name=os.getenv("S3_REGION") or None,
        )
        client.upload_file(str(source), bucket, key, ExtraArgs={"ContentType": "video/mp4"})
        public_base = os.getenv("S3_PUBLIC_BASE_URL", "").rstrip("/")
        url = f"{public_base}/{key}" if public_base else client.generate_presigned_url(
            "get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=86400
        )
        return {"video_url": url, "storage": "s3", "size_bytes": source.stat().st_size}
    if source.stat().st_size > MAX_INLINE_VIDEO_BYTES:
        raise RuntimeError("Generated video exceeds the safe 13 MB inline limit. Configure S3_BUCKET for RunPod video output.")
    return {
        "video_base64": base64.b64encode(source.read_bytes()).decode("ascii"),
        "storage": "inline", "size_bytes": source.stat().st_size,
    }


def generate(data: dict[str, Any]) -> dict[str, Any]:
    prompt = str(data.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("prompt is required.")
    if len(prompt) > 12000:
        raise ValueError("prompt exceeds 12000 characters.")
    image_values = data.get("imageUrls") if isinstance(data.get("imageUrls"), list) else []
    if data.get("imageUrl"):
        image_values = [data["imageUrl"]]
    image_values = [str(value) for value in image_values[:9] if str(value).strip()]
    mode = "r2v" if len(image_values) > 1 or data.get("mode") == "r2v" else ("i2v" if image_values else "t2v")
    _validate_model_files(mode)
    _ensure_comfy()
    uploaded = [_upload_image(value, index) for index, value in enumerate(image_values)]
    prefix = f"video/minimax-h3-{uuid.uuid4()}"
    queued = _json_request("/prompt", {"prompt": _workflow(data, uploaded, prefix)}, timeout=120)
    prompt_id = str(queued.get("prompt_id") or "")
    if not prompt_id:
        raise RuntimeError(f"ComfyUI rejected the H3 workflow: {queued}")
    output = _wait_for_output(prompt_id, prefix)
    return {
        **_upload_or_inline(output),
        "model": "MiniMax-H3", "mode": mode, "prompt_id": prompt_id,
        "duration": min(15.0, max(1.0, float(data.get("duration") or 5))),
        "frames": duration_to_frames(float(data.get("duration") or 5)),
    }


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input")
    if not isinstance(data, dict):
        raise ValueError("job.input must be an object.")
    task = data.get("task")
    if task == "video.generate":
        return generate(data)
    if task == "video.prepare":
        from prepare_models import prepare_models
        return prepare_models(include_ref2va=bool(data.get("includeRef2va", True)))
    if task == "video.warmup":
        mode = "r2v" if data.get("mode") == "r2v" else "i2v"
        _validate_model_files(mode)
        _ensure_comfy()
        return {"ready": True, "model": "MiniMax-H3", "mode": mode}
    raise ValueError(f"Unsupported task: {task!r}")


if __name__ == "__main__":
    import runpod
    runpod.serverless.start({"handler": handler})
