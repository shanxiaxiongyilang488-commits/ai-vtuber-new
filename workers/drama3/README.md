# drama3-runpod-worker

RunPod Serverless worker for **Drama-3-Japanese** (StudioYebisu GGUF pack,
small IQ3_XXS) running on speech.cpp v0.11.2 with the drama3 fast patch
(CUDA). The model (~9.1 GiB) is baked into the image; no network volume.

- Image: `ghcr.io/shanxiaxiongyilang488-commits/drama3-worker:latest`
- Built by GitHub Actions from the `drama3-worker` branch
  (`.github/workflows/drama3-worker.yml`).
- Job input: `{ref_audio_base64, transcript, lines: [{text, seed}]}`
- Job output: `{outputs: [{audio_base64}], meta: {voice_extract_sec, tts_sec, model}}`

Model weights are under the Fish Audio Community License 1.0
(non-commercial research / personal use only).
