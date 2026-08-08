# AI VTuber RunPod workers

This directory contains three independent RunPod Serverless queue workers.

- `voice`: Irodori-TTS v4. Loads the model once per warm worker and returns a base64 WAV.
- `video`: Official HunyuanVideo-1.5 T2V/I2V adapter. Runs long jobs and returns either an object-storage URL or a size-bounded base64 MP4.
- `reflection`: Persistent Hugging Face chat model used only for Reflection Router `deep` replies. It returns final character dialogue without hidden reasoning.

## Build

Docker Desktop must be running. Replace `YOUR_DOCKER_ID` and run from the project root:

```powershell
.\tools\build-runpod-workers.ps1 -Registry YOUR_DOCKER_ID -Push
```

This creates and optionally pushes:

```text
YOUR_DOCKER_ID/ai-vtuber-irodori:v4
YOUR_DOCKER_ID/ai-vtuber-hunyuan:1.5
YOUR_DOCKER_ID/ai-vtuber-reflection:qwen3
```

RunPod requires Linux AMD64 images. The build script always supplies `--platform linux/amd64`.

To avoid installing Docker or writing its large build cache to this PC, push the
repository and run **Actions -> Build RunPod workers -> Run workflow** on GitHub.
`.github/workflows/runpod-workers.yml` builds on GitHub-hosted runners and publishes:

```text
ghcr.io/<github-user>/ai-vtuber-runpod-voice:latest
ghcr.io/<github-user>/ai-vtuber-runpod-video:latest
ghcr.io/<github-user>/ai-vtuber-runpod-reflection:latest
```

If the repository or package is private, configure RunPod container-registry
authentication with the GitHub username and a Personal Access Token carrying
`read:packages` permission.

## Voice endpoint

Recommended initial settings:

- Endpoint type: Queue
- Active workers: `0`
- Max workers: `1`
- Idle timeout: `90` seconds
- Execution timeout: `600` seconds or more
- GPU: NVIDIA CUDA GPU with sufficient memory for the selected v4 checkpoint
- Network Volume: optional but recommended, mounted automatically at `/runpod-volume`

The first `voice.warmup` downloads the Irodori checkpoint and codec to the Network Volume cache and loads them. Later warm workers reuse the downloaded files. The browser warm button keeps the already-started worker alive only while voice chat is wanted.

For a saved clone voice, the app embeds the local basic-voice WAV in the synthesis request. The RunPod image therefore does not need the user's character voices baked into it.

## Video endpoint

Recommended initial settings:

- Endpoint type: Queue
- Active workers: `0`
- Max workers: `1`
- Execution timeout: `7200` seconds or more
- Job TTL: longer than the execution timeout
- GPU: 24 GB or more is recommended; the official minimum is 14 GB with offloading
- Network Volume: required for practical use; use at least 150 GB while testing

Attach the Network Volume to the endpoint. It appears at `/runpod-volume`. Prepare the checkpoints once by submitting:

```json
{
  "input": {
    "task": "video.prepare",
    "includeI2v": true
  }
}
```

I2V also needs the gated `black-forest-labs/FLUX.1-Redux-dev` vision encoder. Accept its Hugging Face license and set `HF_TOKEN` as a private endpoint environment variable before `video.prepare`.

The default worker uses 480p I2V step distillation (8 steps) and normal 50-step T2V. It disables remote prompt rewriting so no Gemini/vLLM service is required.

### Video result delivery

Without storage credentials, the worker recompresses an MP4 when necessary and returns at most 7 MB inline. The app saves it under `data/generated-videos`.

For larger or higher-quality results, configure S3-compatible storage as private endpoint environment variables:

```text
S3_BUCKET=...
S3_ENDPOINT_URL=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_REGION=...
S3_PUBLIC_BASE_URL=...   # optional; a 24-hour signed URL is used when omitted
S3_PREFIX=ai-vtuber     # optional
```

Never place RunPod, Hugging Face or S3 secrets in this repository or in a browser-visible setting.

## Deep Reflection endpoint

Recommended initial settings:

- Endpoint type: Queue
- Active workers: `0`
- Max workers: `1`
- Idle timeout: `90` seconds while testing
- Execution timeout: `1200` seconds or more for the first model download
- GPU: 24 GB VRAM for the default `Qwen/Qwen3-8B`
- Network Volume: recommended, mounted at `/runpod-volume`

The model can be replaced without rebuilding the image by setting the private
endpoint environment variable `MODEL_ID`. Set `HF_TOKEN` only when the selected
model requires authentication. The first `reflection.warmup` downloads and loads
the model; later `reflection.generate` jobs reuse it while the worker remains warm.

In AI VTuber settings, enter this endpoint under **Deep Reflection Endpoint ID**
and choose **RunPod Auto**. `fast` and `think` continue through the existing CHAT
provider. Only `deep` attempts this worker, and any worker error falls back to the
existing provider automatically.

## Local contract tests

These tests only validate request parsing and do not download models or require a GPU:

```powershell
python -m unittest discover -s runpod\voice -p "test_*.py"
python -m unittest discover -s runpod\video -p "test_*.py"
python -m unittest discover -s runpod\reflection -p "test_*.py"
```
