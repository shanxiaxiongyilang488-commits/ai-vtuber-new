"""Authenticated HTTP bridge from AI VTuber to MiniMax H3 on an existing ComfyUI Pod."""

from __future__ import annotations

import hmac
import os
import threading
import time
import uuid
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import video_handler as worker
import anima
import prepare_models


app = FastAPI(title="AI VTuber MiniMax H3 Pod", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
_generation_lock = threading.Lock()
_jobs_lock = threading.Lock()
_jobs: dict[str, dict[str, Any]] = {}
_JOB_TTL_SECONDS = 6 * 60 * 60


def authorize(authorization: str | None) -> None:
    expected = os.environ.get("H3_BRIDGE_TOKEN", "").strip()
    supplied = (authorization or "").removeprefix("Bearer ").strip()
    if not expected or not hmac.compare_digest(supplied, expected):
        raise HTTPException(401, "Invalid H3 Pod token.")


class VideoJob(BaseModel):
    input: dict


def _prune_jobs() -> None:
    cutoff = time.time() - _JOB_TTL_SECONDS
    with _jobs_lock:
        for job_id in [key for key, value in _jobs.items() if float(value.get("updated_at", 0)) < cutoff]:
            _jobs.pop(job_id, None)


def _run_task(data: dict) -> dict:
    with _generation_lock:
        task = data.get("task")
        if task == "video.warmup":
            mode = "r2v" if data.get("mode") == "r2v" else "i2v"
            worker._validate_model_files(mode)
            worker._ensure_comfy()
            return {"ready": True, "model": "MiniMax-H3", "mode": mode}
        if task == "image.generate":
            return anima.generate(data)
        if task == "music.prepare":
            return prepare_models.prepare_music3_models()
        if task == "music.status":
            return prepare_models.music3_model_status()
        if task != "video.generate":
            raise ValueError(f"Unsupported task: {task!r}")
        return worker.generate(data)


def _set_job(job_id: str, **values: Any) -> None:
    with _jobs_lock:
        current = _jobs.get(job_id, {})
        _jobs[job_id] = {**current, **values, "updated_at": time.time()}


def _run_job_thread(job_id: str, data: dict) -> None:
    _set_job(job_id, status="running")
    try:
        output = _run_task(data)
        _set_job(job_id, status="succeeded", output=output)
    except Exception as error:
        _set_job(job_id, status="failed", error=str(error), error_type=type(error).__name__)


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
            "music3": prepare_models.music3_model_status(),
            "jobs": True,
        }
    except Exception as error:
        raise HTTPException(503, f"ComfyUI is unavailable: {error}") from error


@app.post("/run")
def run_video(job: VideoJob, authorization: str | None = Header(None)) -> dict:
    authorize(authorization)
    data = job.input
    try:
        return {"output": _run_task(data)}
    except (ValueError, FileNotFoundError) as error:
        raise HTTPException(400, str(error)) from error
    except Exception as error:
        raise HTTPException(500, str(error)) from error


@app.post("/jobs")
def start_job(job: VideoJob, authorization: str | None = Header(None)) -> dict:
    authorize(authorization)
    _prune_jobs()
    job_id = uuid.uuid4().hex
    now = time.time()
    with _jobs_lock:
        _jobs[job_id] = {
            "id": job_id,
            "status": "queued",
            "created_at": now,
            "updated_at": now,
        }
    thread = threading.Thread(target=_run_job_thread, args=(job_id, job.input), daemon=True)
    thread.start()
    return {"id": job_id, "status": "queued"}


@app.get("/jobs/{job_id}")
def get_job(job_id: str, authorization: str | None = Header(None)) -> dict:
    authorize(authorization)
    _prune_jobs()
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            raise HTTPException(404, "Job not found.")
        return dict(job)
