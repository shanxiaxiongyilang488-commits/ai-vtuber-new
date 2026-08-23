"""RunPod Serverless worker for persistent Irodori-TTS v4 inference."""

from __future__ import annotations

import base64
import gc
import os
import re
import sys
import tempfile
import threading
from pathlib import Path
from typing import Any


IRODORI_ROOT = Path(os.getenv("IRODORI_ROOT", "/opt/Irodori-TTS")).resolve()
CHECKPOINT_ENV = os.getenv("IRODORI_CHECKPOINT", "").strip()
HF_CHECKPOINT = os.getenv(
    "IRODORI_HF_CHECKPOINT",
    "Aratako/Irodori-TTS-v4.1-Small",
).strip()
CODEC_REPO = os.getenv("IRODORI_CODEC_REPO", "Aratako/Semantic-DACVAE-Japanese-32dim")
MAX_TEXT_CHARS = int(os.getenv("MAX_TEXT_CHARS", "1000"))
MAX_REFERENCE_BYTES = 12 * 1024 * 1024

_runtime: Any = None
_runtime_model_id = ""
_runtime_lock = threading.Lock()
_synthesis_lock = threading.Lock()


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


def _normalize_model_id(value: Any) -> str:
    model_id = str(value or "").strip() or HF_CHECKPOINT
    if len(model_id) > 200 or not re.fullmatch(
        r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)?",
        model_id,
    ):
        raise ValueError("modelCheckpoint must use org/repo or org/repo/subfolder format.")
    return model_id


def _cached_checkpoint_path(model_id: str, cache_root: Any = None) -> str:
    """Resolve a RunPod/Hugging Face cached checkpoint without network I/O."""
    parts = model_id.split("/")
    repo_id = "/".join(parts[:2])
    subfolder = parts[2] if len(parts) > 2 else ""
    relative = Path(subfolder) / "model.safetensors" if subfolder else Path("model.safetensors")

    if cache_root is not None:
        roots = [Path(cache_root)]
    else:
        configured_hub = os.getenv("HUGGINGFACE_HUB_CACHE", "").strip()
        configured_home = os.getenv("HF_HOME", "").strip()
        runpod_cache = os.getenv(
            "RUNPOD_MODEL_CACHE_ROOT",
            "/runpod-volume/huggingface-cache/hub",
        ).strip()
        roots = []
        if configured_hub:
            roots.append(Path(configured_hub))
        if configured_home:
            roots.append(Path(configured_home) / "hub")
        # RunPod Serverless mounts Cached Models here. Keep this explicit so
        # older images with a legacy HF_HOME value still find the cache.
        if runpod_cache:
            roots.append(Path(runpod_cache))
        roots.append(Path.home() / ".cache" / "huggingface" / "hub")

    expected_name = f"models--{repo_id.replace('/', '--')}"
    seen_roots: set[str] = set()
    for root in roots:
        root_key = str(root.absolute()).casefold()
        if root_key in seen_roots:
            continue
        seen_roots.add(root_key)

        repo_root = root / expected_name
        if not repo_root.is_dir() and root.is_dir():
            # Some cache provisioning paths normalize repository IDs to lower
            # case. Hugging Face IDs are case-sensitive, but the cache folder
            # itself can still be matched safely without changing the ID sent
            # to Hugging Face on fallback.
            repo_root = next(
                (
                    candidate
                    for candidate in root.glob("models--*")
                    if candidate.name.casefold() == expected_name.casefold()
                ),
                repo_root,
            )

        candidates: list[Path] = []
        main_ref = repo_root / "refs" / "main"
        if main_ref.is_file():
            revision = main_ref.read_text(encoding="utf-8").strip()
            if revision:
                candidates.append(repo_root / "snapshots" / revision / relative)
        snapshots = repo_root / "snapshots"
        if snapshots.is_dir():
            candidates.extend(
                sorted(
                    snapshots.glob(f"*/{relative.as_posix()}"),
                    key=lambda path: path.stat().st_mtime,
                    reverse=True,
                )
            )
        for candidate in candidates:
            if candidate.is_file():
                # Keep the snapshot filename (for example model.safetensors).
                # Resolving the Hugging Face symlink returns an extensionless
                # blob hash, which Irodori would treat as a torch pickle.
                return str(candidate.absolute())
    return ""


def _checkpoint_path(download_hf_checkpoint: Any, model_id: str) -> str:
    if CHECKPOINT_ENV:
        checkpoint = Path(CHECKPOINT_ENV).expanduser()
        if checkpoint.is_file():
            return str(checkpoint.resolve())
        raise FileNotFoundError(f"IRODORI_CHECKPOINT not found: {checkpoint}")
    if not model_id:
        raise RuntimeError("Set IRODORI_CHECKPOINT or IRODORI_HF_CHECKPOINT.")
    cached = _cached_checkpoint_path(model_id)
    if cached:
        print(f"Using cached Irodori checkpoint: {cached}", flush=True)
        return cached
    print(
        f"Irodori Model Cache miss for {model_id}; downloading from Hugging Face.",
        flush=True,
    )
    return str(download_hf_checkpoint(model_id))


def get_runtime(model_checkpoint: Any = "") -> Any:
    global _runtime, _runtime_model_id
    model_id = _normalize_model_id(model_checkpoint)
    runtime_id = f"local:{CHECKPOINT_ENV}" if CHECKPOINT_ENV else f"hf:{model_id}"
    if _runtime is not None and _runtime_model_id == runtime_id:
        return _runtime
    with _runtime_lock:
        if _runtime is not None and _runtime_model_id == runtime_id:
            return _runtime
        InferenceRuntime, RuntimeKey, _, download_hf_checkpoint, _ = _irodori_api()
        if _runtime is not None:
            _runtime = None
            _runtime_model_id = ""
            gc.collect()
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass
        checkpoint = _checkpoint_path(download_hf_checkpoint, model_id)
        model_precision = os.getenv("IRODORI_MODEL_PRECISION", "bf16").strip().lower()
        codec_precision = os.getenv("IRODORI_CODEC_PRECISION", "fp32").strip().lower()
        if model_precision not in {"bf16", "fp32"}:
            raise ValueError("IRODORI_MODEL_PRECISION must be bf16 or fp32.")
        if codec_precision not in {"bf16", "fp32"}:
            raise ValueError("IRODORI_CODEC_PRECISION must be bf16 or fp32.")
        _runtime = InferenceRuntime.from_key(
            RuntimeKey(
                checkpoint=checkpoint,
                model_device="cuda",
                codec_repo=CODEC_REPO,
                model_precision=model_precision,
                codec_device="cuda",
                codec_precision=codec_precision,
                codec_deterministic_encode=True,
                codec_deterministic_decode=True,
                compile_model=False,
                compile_dynamic=False,
            )
        )
        _runtime_model_id = runtime_id
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
    delivery_override = data.get("deliveryOverride") is True and mode == "clone"

    runtime = get_runtime(data.get("modelCheckpoint"))
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
                # Match Irodori's official VoiceDesign app. With no reference
                # speaker, speaker CFG must be disabled; guiding a nonexistent
                # speaker embedding produces groans, screams, and long gaps.
                # A conversational style request keeps the saved speaker but
                # needs enough caption guidance to be audible. The conservative
                # 4.0/4.5 balance changes delivery without redesigning identity.
                cfg_scale_caption=4.0 if mode == "design" or situation or delivery_override else 3.0,
                cfg_scale_speaker=0.0 if mode == "design" else 4.5 if delivery_override else 5.0,
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
        with _synthesis_lock:
            runtime = get_runtime(data.get("modelCheckpoint"))
            return {
                "ready": True,
                "engine": "irodori-v4",
                "model": _runtime_model_id,
                "device": str(runtime.model_device),
                "sessionId": data.get("sessionId"),
            }
    if task == "voice.speak":
        with _synthesis_lock:
            return synthesize(data)
    raise ValueError(f"Unsupported task: {task!r}")


if __name__ == "__main__":
    import runpod

    runpod.serverless.start({"handler": handler})
