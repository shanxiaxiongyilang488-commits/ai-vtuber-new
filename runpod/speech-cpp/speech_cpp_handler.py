"""RunPod queue worker: official speech.cpp 0.8.6 on a discrete Vulkan GPU.

The Python process only validates RunPod jobs and transports JSON Lines.
All model inference and reference-voice embedding are done by speech.cpp.
"""
from __future__ import annotations

import atexit
import base64
import hashlib
import io
import json
import math
import os
from pathlib import Path
import queue
import re
import subprocess
import tempfile
import threading
import time
import uuid
import wave

VERSION = "0.8.6"
MODELS = {
    "sakasegawa/Irodori-TTS-v4.1-Small-GGUF": "irodori-tts",
    "sakasegawa/Irodori-TTS-v4.1-Small-MF-GGUF": "irodori-tts-mf",
}
DEFAULT_MODEL = os.getenv("SPEECH_CPP_MODEL", "irodori-tts")
EXE = os.getenv("SPEECH_CPP_EXECUTABLE", "/opt/speech/bin/speech")
MAX_REFERENCE = 12 * 1024 * 1024
MAX_PCM = 32 * 1024 * 1024
TIMEOUT = 900
_lock = threading.Lock()
_runtime = None


def select_model(value):
    if not value:
        if DEFAULT_MODEL not in MODELS.values():
            raise ValueError("Invalid configured speech.cpp model")
        return DEFAULT_MODEL
    if value not in MODELS:
        raise ValueError("speech.cpp requires its Small or Small-MF GGUF model; Large/Python checkpoints are unsupported")
    return MODELS[value]


def discrete_device(output):
    for line in output.splitlines():
        match = re.match(r"^(Vulkan\d+)\s+dgpu\s+(.+)$", line.strip())
        if match:
            return match.group(1), match.group(2)
    raise RuntimeError("No discrete Vulkan GPU is available; refusing CPU fallback on a billed GPU worker")


def reference_bytes(value):
    if not isinstance(value, str) or not value:
        raise ValueError("referenceAudioBase64 is required for clone mode")
    raw = value.split(",", 1)[1] if value.startswith("data:audio/") and "," in value else value
    if len(raw) > (MAX_REFERENCE + 2) // 3 * 4:
        raise ValueError("Reference WAV exceeds 12 MB")
    try:
        audio = base64.b64decode(raw, validate=True)
        with wave.open(io.BytesIO(audio), "rb") as reader:
            if reader.getnframes() <= 0 or reader.getframerate() <= 0:
                raise ValueError("Empty reference WAV")
    except Exception as exc:
        raise ValueError("Reference must be a valid nonempty PCM WAV") from exc
    if not audio or len(audio) > MAX_REFERENCE:
        raise ValueError("Reference WAV exceeds 12 MB")
    return audio


def validate_speech(data):
    text = data.get("text")
    if not isinstance(text, str) or not text.strip() or len(text) > 1000:
        raise ValueError("text must contain 1 to 1000 characters")
    voice = data.get("voice") or {}
    if not isinstance(voice, dict):
        raise ValueError("voice must be an object")
    mode = voice.get("mode") or "design"
    if mode not in {"design", "clone"}:
        raise ValueError("speech.cpp supports design or clone voices")
    speed = float(voice.get("speed") or 1)
    if not math.isfinite(speed) or not 0.5 <= speed <= 2:
        raise ValueError("voice.speed must be between 0.5 and 2")
    caption = voice.get("caption") or ""
    if not isinstance(caption, str) or len(caption) > 4000:
        raise ValueError("Invalid voice caption")
    # Keep the voice description when the app adds its Python-only speech preamble.
    if caption.startswith("EXACT TEXT SPEECH") and "\n\nVOICE DESIGN:" in caption:
        caption = caption.split("\n\nVOICE DESIGN:", 1)[1].strip()
    # Same conservative UTF-8 instruction budget as the local adapter.
    instructions = caption.encode("utf-8")[:384].decode("utf-8", errors="ignore")
    ref = reference_bytes(data.get("referenceAudioBase64")) if mode == "clone" else None
    seed = data.get("seed")
    if seed is not None and (type(seed) is not int or not 0 <= seed <= 2147483647):
        raise ValueError("Invalid seed")
    return text.strip(), voice, instructions, speed, ref, seed


class Runtime:
    def __init__(self, model):
        version = subprocess.run([EXE, "--version"], check=True, capture_output=True, text=True, timeout=30)
        if not version.stdout.startswith("speech.cpp " + VERSION + ","):
            raise RuntimeError("Unexpected speech.cpp executable version")
        devices = subprocess.run([EXE, "devices"], check=True, capture_output=True, text=True, timeout=30)
        self.device, self.device_name = discrete_device(devices.stdout)
        self.model = model
        self.messages = queue.Queue()
        self.voices = set()
        self.process = subprocess.Popen(
            [EXE, "worker", model, "--device", self.device, "--threads", "4"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=None,
            text=True, encoding="utf-8", bufsize=1,
        )
        threading.Thread(target=self._read, daemon=True).start()
        try:
            ready = self._message(time.monotonic() + TIMEOUT)
            if ready.get("type") != "ready" or ready.get("protocol") != 3 or ready.get("version") != VERSION:
                raise RuntimeError("Invalid speech.cpp readiness/protocol")
            self.info = ready.get("model") or {}
            self.sample_rate = self.info.get("sample_rate")
            if type(self.sample_rate) is not int or not 8000 <= self.sample_rate <= 192000:
                raise RuntimeError("Invalid model sample rate")
        except Exception:
            self.close()
            raise

    def _read(self):
        try:
            while True:
                line = self.process.stdout.readline(16 * 1024 * 1024 + 1)
                if not line:
                    raise RuntimeError("speech.cpp exited before completing its response")
                if len(line) > 16 * 1024 * 1024:
                    raise RuntimeError("speech.cpp protocol line exceeds limit")
                value = json.loads(line)
                if not isinstance(value, dict) or not isinstance(value.get("type"), str):
                    raise RuntimeError("Invalid speech.cpp protocol message")
                self.messages.put(value)
        except Exception as exc:
            self.messages.put(exc)

    def _message(self, deadline):
        try:
            message = self.messages.get(timeout=max(0.001, deadline - time.monotonic()))
        except queue.Empty as exc:
            raise RuntimeError("speech.cpp response timeout") from exc
        if isinstance(message, Exception):
            raise message
        return message

    def request(self, message, audio=False):
        request_id = uuid.uuid4().hex
        self.process.stdin.write(json.dumps({**message, "id": request_id}, ensure_ascii=False) + "\n")
        self.process.stdin.flush()
        deadline = time.monotonic() + TIMEOUT
        pcm = bytearray()
        sequence = 0
        while True:
            response = self._message(deadline)
            if response.get("id") != request_id:
                raise RuntimeError("speech.cpp returned an unrelated response")
            kind = response["type"]
            if kind == "progress":
                continue
            if kind == "chunk" and audio:
                if response.get("seq") != sequence:
                    raise RuntimeError("speech.cpp audio sequence mismatch")
                chunk = base64.b64decode(response.get("pcm", ""), validate=True)
                if len(chunk) % 2 or len(pcm) + len(chunk) > MAX_PCM:
                    raise RuntimeError("Invalid or oversized PCM response")
                pcm.extend(chunk)
                sequence += 1
            elif kind == "end":
                if audio and (response.get("stop") != "complete" or response.get("samples") != len(pcm) // 2 or not pcm):
                    raise RuntimeError("speech.cpp returned incomplete or empty speech")
                return bytes(pcm), response
            else:
                # Do not echo potentially sensitive text in upstream error messages.
                raise RuntimeError("speech.cpp request failed: " + kind)

    def add_voice(self, audio):
        name = "reference_" + hashlib.sha256(audio).hexdigest()
        if name in self.voices:
            return name
        if len(self.voices) >= 128:
            raise RuntimeError("Reference voice limit reached; restart the worker")
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as output:
            output.write(audio)
            filename = output.name
        try:
            self.request({"type": "add_voice", "name": name, "path": filename})
            self.voices.add(name)
            return name
        finally:
            Path(filename).unlink(missing_ok=True)

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=10)


def stop_runtime():
    global _runtime
    if _runtime is not None:
        _runtime.close()
        _runtime = None


def get_runtime(model):
    global _runtime
    if _runtime is not None and (_runtime.model != model or _runtime.process.poll() is not None):
        stop_runtime()
    if _runtime is None:
        _runtime = Runtime(model)
    return _runtime


def handler(job):
    data = job.get("input")
    if not isinstance(data, dict):
        raise ValueError("job.input must be an object")
    task = data.get("task")
    if task not in {"voice.warmup", "voice.speak"}:
        raise ValueError("Unsupported task")
    model = select_model(data.get("modelCheckpoint"))
    validated = validate_speech(data) if task == "voice.speak" else None
    with _lock:
        runtime = get_runtime(model)
        metadata = {"engine": "speech.cpp", "source_revision": VERSION,
                    "model": "hf:" + next(repo for repo, alias in MODELS.items() if alias == model),
                    "device": runtime.device, "device_name": runtime.device_name}
        if task == "voice.warmup":
            return {**metadata, "ready": True, "sessionId": data.get("sessionId")}
        text, voice, instructions, speed, ref, seed = validated
        name = runtime.add_voice(ref) if ref is not None else "none"
        request = {"type": "synthesize", "text": text, "voice": name,
                   "language": "ja", "speed": speed, "instructions": instructions}
        if seed is not None:
            request["seed"] = seed
        try:
            pcm, terminal = runtime.request(request, audio=True)
        except Exception:
            stop_runtime()  # discard a desynchronized or failed protocol stream
            raise
        output = io.BytesIO()
        with wave.open(output, "wb") as writer:
            writer.setnchannels(1)
            writer.setsampwidth(2)
            writer.setframerate(runtime.sample_rate)
            writer.writeframes(pcm)
        result = {**metadata, "audio_base64": base64.b64encode(output.getvalue()).decode("ascii"),
                  "duration": round(len(pcm) / 2 / runtime.sample_rate, 3),
                  "sample_rate": runtime.sample_rate, "used_seed": terminal.get("seed")}
        warnings = []
        if len(instructions.encode("utf-8")) < len((voice.get("caption") or "").encode("utf-8")):
            warnings.append("Voice instructions shortened to fit the speech.cpp budget")
        if float(voice.get("pitchShiftSemitones") or 0):
            warnings.append("Pitch shift was not applied")
        if warnings:
            result["warning"] = "; ".join(warnings)
        return result


atexit.register(stop_runtime)
if __name__ == "__main__":
    import runpod
    runpod.serverless.start({"handler": handler})
