"""RunPod Serverless worker for persistent Irodori-TTS v4 inference."""

from __future__ import annotations

import base64
import os
import sys
import tempfile
import threading
from pathlib import Path
from typing import Any


IRODORI_ROOT = Path(os.getenv("IRODORI_ROOT", "/opt/Irodori-TTS")).resolve()
CHECKPOINT_ENV = os.getenv("IRODORI_CHECKPOINT", "").strip()
HF_CHECKPOINT = os.getenv(
    "IRODORI_HF_CHECKPOINT",
    "Aratako/Irodori-TTS-v4-Small-Quantized/int8-weight-only",
).strip()
CODEC_REPO = os.getenv("IRODORI_CODEC_REPO", "Aratako/Semantic-DACVAE-Japanese-32dim")
MAX_TEXT_CHARS = int(os.getenv("MAX_TEXT_CHARS", "1000"))
MAX_REFERENCE_BYTES = 12 * 1024 * 1024

_runtime: Any = None
_runtime_lock = threading.Lock()


def _irodori_api() -> tuple[Any, Any, Any, Any, Any]:
    if str(IRODORI_ROOT) not in sys.path:
        sys.path.insert(0, str(IRODORI_ROOT))
    from irodori_tts.inference_runtime import (  # type: ignore[import-not-found]
        InferenceRuntime,
        RuntimeKey,
        SamplingRequest,
        download_hf_checkpoint,
        save_wav,
    )

    return InferenceRuntime, RuntimeKey, SamplingRequest, download_hf_checkpoint, save_wav


def _checkpoint_path(download_hf_checkpoint: Any) -> str:
    if CHECKPOINT_ENV:
        checkpoint = Path(CHECKPOINT_ENV).expanduser()
        if checkpoint.is_file():
            return str(checkpoint.resolve())
        raise FileNotFoundError(f"IRODORI_CHECKPOINT not found: {checkpoint}")
    if not HF_CHECKPOINT:
        raise RuntimeError("Set IRODORI_CHECKPOINT or IRODORI_HF_CHECKPOINT.")
    return str(download_hf_checkpoint(HF_CHECKPOINT))


def get_runtime() -> Any:
    global _runtime
    if _runtime is not None:
        return _runtime
    with _runtime_lock:
        if _runtime is not None:
            return _runtime
        InferenceRuntime, RuntimeKey, _, download_hf_checkpoint, _ = _irodori_api()
        checkpoint = _checkpoint_path(download_hf_checkpoint)
        quantized = "quantized" in checkpoint.lower() or "int8" in checkpoint.lower()
        _runtime = InferenceRuntime.from_key(
            RuntimeKey(
                checkpoint=checkpoint,
                model_device="cuda",
                codec_repo=CODEC_REPO,
                model_precision="bf16" if quantized else "fp32",
                codec_device="cuda",
                codec_precision="fp32",
                codec_deterministic_encode=True,
                codec_deterministic_decode=True,
                compile_model=False,
                compile_dynamic=False,
            )
        )
        return _runtime


def _required_text(data: dict[str, Any], name: str, limit: int) -> str:
    value = data.get(name)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} is required.")
    value = value.strip()
    if len(value) > limit:
        raise ValueError(f"{name} exceeds {limit} characters.")
    return value


def _decode_reference(value: Any) -> bytes:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("referenceAudioBase64 is required for clone mode.")
    raw = value.split(",", 1)[1] if value.lower().startswith("data:audio/") and "," in value else value
    try:
        audio = base64.b64decode(raw, validate=True)
    except Exception as exc:
        raise ValueError("referenceAudioBase64 is not valid base64.") from exc
    if not audio or len(audio) > MAX_REFERENCE_BYTES:
        raise ValueError("Reference WAV must be between 1 byte and 12 MB.")
    if not audio.startswith(b"RIFF") or audio[8:12] != b"WAVE":
        raise ValueError("Reference audio must be a WAV file.")
    return audio


def synthesize(data: dict[str, Any]) -> dict[str, Any]:
    text = _required_text(data, "text", MAX_TEXT_CHARS)
    voice = data.get("voice") if isinstance(data.get("voice"), dict) else {}
    mode = str(voice.get("mode") or "design").strip().lower()
    if mode not in {"design", "clone"}:
        raise ValueError("RunPod Irodori supports voice.mode design or clone.")
    caption = str(voice.get("caption") or "").strip()
    if len(caption) > 4000:
        raise ValueError("voice.caption exceeds 4000 characters.")
    if mode == "design" and not caption:
        caption = "A clear, warm, natural Japanese character voice recorded dry and close."
    speed = float(voice.get("speed") or 1.0)
    if not 0.5 <= speed <= 2.0:
        raise ValueError("voice.speed must be between 0.5 and 2.0.")
    reference = _decode_reference(data.get("referenceAudioBase64")) if mode == "clone" else None

    runtime = get_runtime()
    _, _, SamplingRequest, _, save_wav = _irodori_api()
    reference_path = ""
    output_path = ""
    try:
        if reference is not None:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
                handle.write(reference)
                reference_path = handle.name
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
            output_path = handle.name
        situation = caption.startswith("SITUATION PERFORMANCE")
        result = runtime.synthesize(
            SamplingRequest(
                text=text,
                caption=caption or None,
                ref_wav=reference_path or None,
                no_ref=mode == "design",
                # Change delivery speed inside generation. This avoids the
                # chorus/phase residue caused by post-generation stretching.
                duration_scale=1.0 / speed,
                min_seconds=0.5,
                max_seconds=30.0,
                num_steps=int(os.getenv("IRODORI_NUM_STEPS", "40")),
                cfg_scale_text=3.0,
                cfg_scale_caption=4.0 if situation else 3.0,
                cfg_scale_speaker=5.0,
                seed=int(data["seed"]) if data.get("seed") is not None else None,
                trim_tail=True,
            )
        )
        save_wav(output_path, result.audio, result.sample_rate)
        wav = Path(output_path).read_bytes()
        duration = float(result.audio.shape[-1]) / float(result.sample_rate)
        pitch = float(voice.get("pitchShiftSemitones") or 0.0)
        return {
            "audio_base64": base64.b64encode(wav).decode("ascii"),
            "duration": round(duration, 3),
            "sample_rate": int(result.sample_rate),
            "used_seed": int(result.used_seed),
            "engine": "irodori-v4",
            **(
                {"warning": "pitchShiftSemitones was not applied to keep the voice free of chorus artifacts."}
                if abs(pitch) >= 0.01
                else {}
            ),
        }
    finally:
        for temporary in (reference_path, output_path):
            if temporary:
                try:
                    Path(temporary).unlink()
                except OSError:
                    pass


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input")
    if not isinstance(data, dict):
        raise ValueError("job.input must be an object.")
    task = data.get("task")
    if task == "voice.warmup":
        runtime = get_runtime()
        return {
            "ready": True,
            "engine": "irodori-v4",
            "device": str(runtime.model_device),
            "sessionId": data.get("sessionId"),
        }
    if task == "voice.speak":
        return synthesize(data)
    raise ValueError(f"Unsupported task: {task!r}")


if __name__ == "__main__":
    import runpod

    runpod.serverless.start({"handler": handler})
