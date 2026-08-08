"""RunPod Serverless adapter for the official HunyuanVideo-1.5 generator."""

from __future__ import annotations

import base64
import json
import mimetypes
import os
import subprocess
import tempfile
import urllib.request
import uuid
from pathlib import Path
from typing import Any


HUNYUAN_ROOT = Path(os.getenv("HUNYUAN_ROOT", "/opt/HunyuanVideo-1.5")).resolve()
MODEL_PATH = Path(os.getenv("HUNYUAN_MODEL_PATH", "/runpod-volume/models/HunyuanVideo-1.5")).resolve()
MAX_IMAGE_BYTES = 7 * 1024 * 1024
MAX_INLINE_VIDEO_BYTES = 7 * 1024 * 1024


def duration_to_frames(duration: float, fps: int = 24) -> int:
    """Return a 4n+1 frame count required by the Hunyuan temporal VAE."""
    duration = min(15.0, max(1.0, float(duration)))
    approximate = max(5, round(duration * fps))
    return round((approximate - 1) / 4) * 4 + 1


def _decode_data_image(value: str) -> tuple[bytes, str]:
    header, separator, encoded = value.partition(",")
    if not separator or not header.lower().startswith("data:image/") or ";base64" not in header.lower():
        raise ValueError("imageUrl data URL must be a base64 image.")
    try:
        payload = base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise ValueError("imageUrl contains invalid base64.") from exc
    if not payload or len(payload) > MAX_IMAGE_BYTES:
        raise ValueError("Reference image must be between 1 byte and 7 MB.")
    mime = header[5:].split(";", 1)[0].lower()
    extension = mimetypes.guess_extension(mime) or ".png"
    return payload, extension


def _download_image(value: str, destination: Path) -> Path:
    if value.lower().startswith("data:image/"):
        payload, extension = _decode_data_image(value)
        output = destination.with_suffix(extension)
        output.write_bytes(payload)
        return output
    if not value.lower().startswith("https://"):
        raise ValueError("RunPod imageUrl must be HTTPS or a base64 image data URL.")
    request = urllib.request.Request(value, headers={"User-Agent": "ai-vtuber-runpod-worker/1"})
    with urllib.request.urlopen(request, timeout=60) as response:
        content_type = response.headers.get_content_type()
        if not content_type.startswith("image/"):
            raise ValueError(f"imageUrl returned {content_type}, not an image.")
        payload = response.read(MAX_IMAGE_BYTES + 1)
    if not payload or len(payload) > MAX_IMAGE_BYTES:
        raise ValueError("Downloaded reference image must be between 1 byte and 7 MB.")
    output = destination.with_suffix(mimetypes.guess_extension(content_type) or ".png")
    output.write_bytes(payload)
    return output


def _compress_inline(source: Path, duration: float, workdir: Path) -> Path:
    if source.stat().st_size <= MAX_INLINE_VIDEO_BYTES:
        return source
    output = workdir / "inline.mp4"
    target_kbps = max(350, int((MAX_INLINE_VIDEO_BYTES * 8 * 0.88) / max(1.0, duration) / 1000))
    subprocess.run(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(source),
            "-an", "-c:v", "libx264", "-preset", "medium", "-b:v", f"{target_kbps}k",
            "-maxrate", f"{target_kbps}k", "-bufsize", f"{target_kbps * 2}k",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output),
        ],
        check=True,
        timeout=1800,
    )
    if output.stat().st_size > MAX_INLINE_VIDEO_BYTES:
        raise RuntimeError(
            "Generated MP4 is too large for RunPod inline output. Configure S3_BUCKET or reduce duration."
        )
    return output


def _upload_or_inline(source: Path, duration: float, workdir: Path) -> dict[str, Any]:
    bucket = os.getenv("S3_BUCKET", "").strip()
    if bucket:
        import boto3

        key = f"{os.getenv('S3_PREFIX', 'ai-vtuber').strip('/')}/{uuid.uuid4()}.mp4"
        client = boto3.client(
            "s3",
            endpoint_url=os.getenv("S3_ENDPOINT_URL") or None,
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
    inline = _compress_inline(source, duration, workdir)
    return {
        "video_base64": base64.b64encode(inline.read_bytes()).decode("ascii"),
        "storage": "inline",
        "size_bytes": inline.stat().st_size,
    }


def _validate_model_files(mode: str) -> None:
    if not (MODEL_PATH / "transformer").is_dir():
        raise FileNotFoundError(
            f"Hunyuan model is not prepared at {MODEL_PATH}. Run task=video.prepare once with a Network Volume."
        )
    if mode == "i2v" and not (MODEL_PATH / "vision_encoder").is_dir():
        raise FileNotFoundError(
            "I2V requires ckpts/vision_encoder/siglip (FLUX.1-Redux-dev access and HF_TOKEN)."
        )


def generate(data: dict[str, Any]) -> dict[str, Any]:
    prompt = str(data.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("prompt is required.")
    if len(prompt) > 12000:
        raise ValueError("prompt exceeds 12000 characters.")
    image_url = str(data.get("imageUrl") or "").strip()
    mode = "i2v" if image_url else "t2v"
    _validate_model_files(mode)
    duration = min(15.0, max(1.0, float(data.get("duration") or 5)))
    seed = int(data.get("seed") if data.get("seed") is not None else 1)
    step_distilled = mode == "i2v" and os.getenv("HUNYUAN_I2V_STEP_DISTILLED", "1") == "1"
    steps = int(os.getenv("HUNYUAN_I2V_STEPS", "8")) if step_distilled else 50

    with tempfile.TemporaryDirectory(prefix="hunyuan-runpod-") as temporary:
        workdir = Path(temporary)
        image_path = _download_image(image_url, workdir / "reference") if image_url else None
        output = workdir / "output.mp4"
        command = [
            os.getenv("PYTHON_BIN", "python3"), str(HUNYUAN_ROOT / "generate.py"),
            "--prompt", prompt,
            "--resolution", os.getenv("HUNYUAN_RESOLUTION", "480p"),
            "--aspect_ratio", str(data.get("aspectRatio") or "16:9"),
            "--seed", str(seed),
            "--rewrite", "false",
            "--cfg_distilled", "false",
            "--enable_step_distill", "true" if step_distilled else "false",
            "--sparse_attn", "false",
            "--use_sageattn", "false",
            "--enable_cache", "false" if step_distilled else "true",
            "--cache_type", "deepcache",
            "--offloading", "true",
            "--overlap_group_offloading", "false",
            "--sr", "false",
            "--save_pre_sr_video", "false",
            "--num_inference_steps", str(steps),
            "--video_length", str(duration_to_frames(duration)),
            "--output_path", str(output),
            "--model_path", str(MODEL_PATH),
        ]
        if image_path:
            command.extend(["--image_path", str(image_path)])
        completed = subprocess.run(
            command,
            cwd=str(HUNYUAN_ROOT),
            capture_output=True,
            text=True,
            timeout=int(os.getenv("VIDEO_TIMEOUT_SECONDS", "7200")),
        )
        if completed.returncode != 0 or not output.is_file():
            detail = "\n".join(part[-6000:] for part in (completed.stdout, completed.stderr) if part)
            raise RuntimeError(f"HunyuanVideo generation failed ({completed.returncode}):\n{detail}")
        result = _upload_or_inline(output, duration, workdir)
        return {
            **result,
            "model": "hunyuan-video-1.5",
            "mode": mode,
            "duration": duration,
            "frames": duration_to_frames(duration),
            "seed": seed,
            "steps": steps,
        }


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input")
    if not isinstance(data, dict):
        raise ValueError("job.input must be an object.")
    task = data.get("task")
    if task == "video.generate":
        return generate(data)
    if task == "video.warmup":
        mode = "i2v" if data.get("mode") == "i2v" else "t2v"
        _validate_model_files(mode)
        return {"ready": True, "model": "hunyuan-video-1.5", "mode": mode}
    if task == "video.prepare":
        from prepare_models import prepare_models

        return prepare_models(include_i2v=bool(data.get("includeI2v", True)))
    raise ValueError(f"Unsupported task: {task!r}")


if __name__ == "__main__":
    import runpod

    runpod.serverless.start({"handler": handler})
