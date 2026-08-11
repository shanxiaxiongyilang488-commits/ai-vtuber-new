"""Authenticated HTTP bridge from AI VTuber to MiniMax H3 on an existing ComfyUI Pod."""

from __future__ import annotations

import hmac
import os
import threading

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import video_handler as worker
import anima


app = FastAPI(title="AI VTuber MiniMax H3 Pod", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
_generation_lock = threading.Lock()


def authorize(authorization: str | None) -> None:
    expected = os.environ.get("H3_BRIDGE_TOKEN", "").strip()
    supplied = (authorization or "").removeprefix("Bearer ").strip()
    if not expected or not hmac.compare_digest(supplied, expected):
        raise HTTPException(401, "Invalid H3 Pod token.")


class VideoJob(BaseModel):
    input: dict


@app.get("/health")
def health(authorization: str | None = Header(None)) -> dict:
    authorize(authorization)
    try:
        stats = worker._json_request("/system_stats", timeout=5)
        return {
            "status": "ok",
            "service": "ai-vtuber-comfy-pod",
            "comfyui": bool(stats),
            "minimax_h3": True,
            "anima": anima.model_status(),
        }
    except Exception as error:
        raise HTTPException(503, f"ComfyUI is unavailable: {error}") from error


@app.post("/run")
def run_video(job: VideoJob, authorization: str | None = Header(None)) -> dict:
    authorize(authorization)
    data = job.input
    try:
        with _generation_lock:
            task = data.get("task")
            if task == "video.warmup":
                mode = "r2v" if data.get("mode") == "r2v" else "i2v"
                worker._validate_model_files(mode)
                worker._ensure_comfy()
                return {"output": {"ready": True, "model": "MiniMax-H3", "mode": mode}}
            if task == "image.generate":
                return {"output": anima.generate(data)}
            if task != "video.generate":
                raise ValueError(f"Unsupported task: {task!r}")
            return {"output": worker.generate(data)}
    except (ValueError, FileNotFoundError) as error:
        raise HTTPException(400, str(error)) from error
    except Exception as error:
        raise HTTPException(500, str(error)) from error
