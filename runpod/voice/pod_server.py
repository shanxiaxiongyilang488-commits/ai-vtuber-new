"""HTTP sidecar for using the existing Irodori v4 worker on a RunPod Pod."""

from __future__ import annotations

import base64
import hmac
import os
import threading

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

import handler as worker


app = FastAPI(title="AI VTuber Irodori Pod", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
_synthesis_lock = threading.Lock()


def authorize(authorization: str | None) -> None:
    expected = os.environ.get("VOICE_BRIDGE_TOKEN", "").strip()
    supplied = (authorization or "").removeprefix("Bearer ").strip()
    if not expected or not hmac.compare_digest(supplied, expected):
        raise HTTPException(401, "Invalid Voice Pod token.")


class VoiceJob(BaseModel):
    input: dict


@app.get("/health")
def health(authorization: str | None = Header(None)) -> dict:
    authorize(authorization)
    return {"status": "ok", "service": "irodori-pod", "model_loaded": worker._runtime is not None}


@app.post("/run")
def run_voice(job: VoiceJob, authorization: str | None = Header(None)):
    authorize(authorization)
    data = job.input
    try:
        with _synthesis_lock:
            if data.get("task") == "voice.warmup":
                runtime = worker.get_runtime(data.get("modelCheckpoint"))
                return {"output": {"ready": True, "device": str(runtime.model_device)}}
            if data.get("task") != "voice.speak":
                raise ValueError(f"Unsupported task: {data.get('task')!r}")
            return {"output": worker.synthesize(data)}
    except (ValueError, FileNotFoundError) as error:
        raise HTTPException(400, str(error)) from error
    except Exception as error:
        raise HTTPException(500, str(error)) from error


@app.post("/speak")
def speak(job: VoiceJob, authorization: str | None = Header(None)) -> Response:
    result = run_voice(job, authorization)["output"]
    audio = base64.b64decode(result["audio_base64"])
    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"X-Duration": str(result.get("duration", 0))},
    )
