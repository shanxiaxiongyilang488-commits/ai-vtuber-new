"""Voice Bridge API — Voice-Design-Cloner を HTTP 経由で使う独立サーバー.

Voice-Design-Cloner (VDC) の Gradio UI には依存せず、VDC の modules/*
(ModelManager / voice_design / lora_pipeline) を直接 import して合成する。

起動方法 (VDC の venv を使う。gradio 依存で fastapi / uvicorn は導入済み):

    set VDC_ROOT=E:\\Dev\\Voice-Design-Cloner
    "%VDC_ROOT%\\.venv\\Scripts\\python.exe" python\\voice_bridge\\server.py

環境変数:
    VDC_ROOT           Voice-Design-Cloner のチェックアウト先 (必須)
    VOICE_BRIDGE_PORT  待ち受けポート (default: 8791)

API:
    GET  /health  -> {"status": "ok", "backend": ..., "loras": [...]}
    POST /speak   -> audio/wav バイナリ + X-Duration / X-Sample-Rate ヘッダ
        {"text": "...", "mode": "lora|clone|design",
         "model": "LoRA名 or 保存済みボイス名", "caption": null,
         "speed": 1.0, "seed": null}

同時生成は threading.Lock で常に 1 件 (後続リクエストは順番待ち)。
"""

from __future__ import annotations

import io
import os
import sys
import threading
from pathlib import Path

# ---------------------------------------------------------------- VDC import
_DEFAULT_VDC_ROOT = Path(__file__).resolve().parents[2].parent / "Voice-Design-Cloner"
VDC_ROOT = Path(os.environ.get("VDC_ROOT") or _DEFAULT_VDC_ROOT).resolve()

if not (VDC_ROOT / "modules" / "model_manager.py").is_file():
    raise SystemExit(
        f"Voice-Design-Cloner not found at {VDC_ROOT}. "
        "Set the VDC_ROOT environment variable to your Voice-Design-Cloner checkout."
    )

sys.path.insert(0, str(VDC_ROOT))

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.responses import Response  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from config import TTS_LANG, VOICE_DESIGN_DIR  # noqa: E402
from modules.lora_pipeline import (  # noqa: E402
    GPUBusyError,
    get_lora_adapter_path,
    get_lora_training_wav,
    list_loras,
)
from modules.model_manager import ModelManager  # noqa: E402
from modules.voice_design import (  # noqa: E402
    generate_clone_oneshot_irodori,
    generate_voice_design,
)

manager = ModelManager()

# 同時生成数 1 のキュー。blocking acquire なので後続は順番に処理される。
_generate_lock = threading.Lock()

app = FastAPI(title="Voice Bridge", version="0.1.0")


class SpeakRequest(BaseModel):
    text: str = Field(..., description="読み上げるテキスト")
    mode: str = Field("lora", description="lora | clone | design")
    model: str = Field("", description="LoRA スピーカー名 (lora) / 保存済みボイス名 (clone)")
    caption: str | None = Field(None, description="声質キャプション (design では必須)")
    speed: float = Field(1.0, gt=0.25, lt=4.0, description="再生速度 (time-stretch)")
    seed: int | None = None


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "voice-bridge",
        "vdc_root": str(VDC_ROOT),
        "backend": manager.backend,
        "device": manager.device,
        "loras": list_loras(),
    }


def _kept_voice_wav(model: str) -> Path:
    wav = VOICE_DESIGN_DIR / f"{model}.wav"
    if not wav.is_file():
        raise HTTPException(404, f"kept voice not found: {wav}")
    return wav


def _clone_standard(text: str, ref_wav: Path) -> tuple[int, np.ndarray]:
    """Qwen backend one-shot clone (kept voice の .txt を参照文として使う)."""
    txt = ref_wav.with_suffix(".txt")
    ref_text = txt.read_text(encoding="utf-8").strip() if txt.is_file() else ""
    if not ref_text:
        raise HTTPException(
            400,
            f"reference transcript is required on the {manager.backend} backend "
            f"(missing or empty: {txt})",
        )
    manager.load_model("1.7B-Base")
    prompt_items = manager.create_voice_clone_prompt(
        ref_audio=str(ref_wav), ref_text=ref_text, x_vector_only_mode=False,
    )
    wavs, sr = manager.current_model.generate_voice_clone(
        text=text, language=TTS_LANG, voice_clone_prompt=prompt_items,
    )
    return sr, wavs[0]


def _synthesize(req: SpeakRequest, text: str) -> tuple[int, np.ndarray]:
    caption = (req.caption or "").strip() or None

    if req.mode == "design":
        if not caption:
            raise HTTPException(400, "caption is required for design mode")
        return generate_voice_design(manager, text, caption)

    if req.mode == "lora":
        if manager.backend != "irodori":
            raise HTTPException(
                400, f"lora mode requires the irodori backend (current: {manager.backend})",
            )
        if not req.model:
            raise HTTPException(400, "model (LoRA speaker name) is required for lora mode")
        lora_path = get_lora_adapter_path(req.model)
        if not lora_path:
            raise HTTPException(404, f"LoRA not found: {req.model!r} (available: {list_loras()})")
        ref_wav = get_lora_training_wav(req.model)
        if not ref_wav:
            raise HTTPException(404, f"LoRA training wav not found for {req.model!r}")
        return generate_clone_oneshot_irodori(
            text=text, ref_wav=ref_wav, caption=caption, lora_path=lora_path, seed=req.seed,
        )

    if req.mode == "clone":
        if not req.model:
            raise HTTPException(400, "model (kept voice name) is required for clone mode")
        ref_wav = _kept_voice_wav(req.model)
        if manager.backend == "irodori":
            return generate_clone_oneshot_irodori(
                text=text, ref_wav=str(ref_wav), caption=caption, seed=req.seed,
            )
        return _clone_standard(text, ref_wav)

    raise HTTPException(400, f"unknown mode: {req.mode!r} (expected lora | clone | design)")


@app.post("/speak")
def speak(req: SpeakRequest) -> Response:
    text = req.text.strip()
    if not text:
        raise HTTPException(400, "text is required")

    with _generate_lock:
        try:
            sr, audio = _synthesize(req, text)
        except HTTPException:
            raise
        except GPUBusyError as exc:
            raise HTTPException(503, f"GPU busy: {exc}") from exc
        except Exception as exc:  # noqa: BLE001 — 呼び出し側へ理由をそのまま返す
            raise HTTPException(500, f"synthesis failed: {exc}") from exc

    audio = np.asarray(audio, dtype=np.float32)
    if abs(req.speed - 1.0) > 1e-3:
        import librosa

        audio = librosa.effects.time_stretch(audio, rate=float(req.speed))

    duration = float(len(audio)) / float(sr)
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV", subtype="PCM_16")
    return Response(
        content=buf.getvalue(),
        media_type="audio/wav",
        headers={
            "X-Duration": f"{duration:.3f}",
            "X-Sample-Rate": str(sr),
            "Cache-Control": "no-store",
        },
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("VOICE_BRIDGE_PORT", "8791"))
    uvicorn.run(app, host="127.0.0.1", port=port)
