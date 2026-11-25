#!/usr/bin/env python3
"""RunPod Serverless handler for Drama-3-Japanese (speech.cpp).

Input:
  {
    "ref_audio_base64": "<base64 WAV of the reference voice>",
    "transcript": "<exact transcript of the reference audio>",
    "lines": [{"text": "...", "seed": 42}, ...]
  }

Output:
  {
    "outputs": [{"audio_base64": "<base64 WAV>"}, ...],
    "meta": {"voice_extract_sec": float, "tts_sec": [float, ...],
             "model": "<gguf filename>"}
  }

The voice file is extracted once per job with `speech voice`, then each
line is synthesized with `speech tts` using that voice file.
"""
import base64
import os
import subprocess
import tempfile
import time

import runpod

SPEECH = os.environ.get("SPEECH_BIN", "/opt/speech/speech")
MODEL = os.environ.get(
    "MODEL_PATH", "/models/Drama-35B-A3B-Japanese-v3-small-IQ3_XXS.gguf"
)
CMD_TIMEOUT = 1100  # seconds per speech.cpp invocation


def run_speech(args):
    """Run the speech binary, return elapsed seconds. Raise on failure."""
    t0 = time.time()
    proc = subprocess.run(
        [SPEECH] + args,
        capture_output=True,
        text=True,
        timeout=CMD_TIMEOUT,
    )
    elapsed = time.time() - t0
    if proc.returncode != 0:
        tail = (proc.stderr or "")[-1500:]
        raise RuntimeError(
            f"speech {' '.join(args[:1])} failed rc={proc.returncode}: {tail}"
        )
    return elapsed


def handler(job):
    inp = job["input"]
    ref_b64 = inp["ref_audio_base64"]
    transcript = inp["transcript"]
    lines = inp["lines"]
    if not lines:
        return {"error": "lines is empty"}

    meta = {"model": os.path.basename(MODEL)}
    outputs = []

    with tempfile.TemporaryDirectory() as td:
        ref_path = os.path.join(td, "ref.wav")
        with open(ref_path, "wb") as f:
            f.write(base64.b64decode(ref_b64))

        voice_path = os.path.join(td, "speaker.voice.gguf")
        dt = run_speech(
            ["voice", MODEL, ref_path, "--transcript", transcript, voice_path]
        )
        meta["voice_extract_sec"] = round(dt, 2)
        print(f"[drama3] voice extract: {dt:.1f}s", flush=True)

        tts_secs = []
        for i, line in enumerate(lines):
            out_path = os.path.join(td, f"out_{i}.wav")
            dt = run_speech(
                [
                    "tts",
                    MODEL,
                    "--experts-on-cpu=false",
                    "--add-voice",
                    f"speaker={voice_path}",
                    "--voice",
                    "speaker",
                    "--seed",
                    str(line.get("seed", 42)),
                    "-o",
                    out_path,
                    line["text"],
                ]
            )
            tts_secs.append(round(dt, 2))
            print(f"[drama3] tts line {i}: {dt:.1f}s", flush=True)
            with open(out_path, "rb") as f:
                outputs.append({"audio_base64": base64.b64encode(f.read()).decode()})
        meta["tts_sec"] = tts_secs

    return {"outputs": outputs, "meta": meta}


runpod.serverless.start({"handler": handler})
