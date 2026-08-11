# AI VTuber RunPod workers

Two independent workers are enabled. Neither worker changes the application's
chat/LLM routing. Chat-Qwen, reflection, warmup reflection and Deep reasoning
workers remain disabled. MiniMax H3 itself still uses its required Qwen3-VL
text/image encoder inside the video worker.

- `voice`: Irodori-TTS v4, base64 WAV output
- `video`: open-weight MiniMax H3 through ComfyUI, native audio/video output
- `image`: Anima Base v1.0 through the same ComfyUI Pod, anime/manga-style image output

The default image backend remains GPT Image 2. Select **Anima** in a character's
Image AI setting only when you want the ComfyUI/Anima look. Anima is currently
text-to-image in this application: automatically attached character reference
images are ignored, and the prompt plus the character's visual description are
used instead. Keep GPT Image 2 selected for reference-image edits or strict
character preservation.

## GitHub Actions build

Run **Build RunPod workers** and choose either `voice` or `video`. The workflow
publishes these images to GHCR:

- `ghcr.io/<github-user>/ai-vtuber-runpod-voice:<tag>`
- `ghcr.io/<github-user>/ai-vtuber-runpod-video:<tag>`

Use the commit SHA tag for a reproducible RunPod release. `latest` is also
published for initial setup.

## MiniMax H3 endpoint

Create a separate queue-based endpoint from the video image. Recommended start:

- GPU: RTX 5090 (32 GB)
- Active workers: `0` while testing costs, `1` when low latency matters
- Max workers: `1`
- GPU count: `1`
- Execution timeout: `10800` seconds
- Container disk: at least `20 GB`
- Network Volume: at least `100 GB`, mounted at `/runpod-volume`

After the endpoint is created, save its ID as **MiniMax H3 Video Endpoint ID**
in API Settings. Press **H3: Download Models** once. This downloads the official
ComfyUI H3 INT8/NVFP4 model set to the Network Volume, including both first-frame
and up-to-nine-image reference modes. Later worker starts reuse those files.

The application submits `video.generate`; the worker returns either an S3 URL or
an inline MP4. RunPod limits `/runsync` responses to 20 MB, so the worker keeps
inline video below a conservative 13 MB before base64/JSON overhead. Configure
`S3_BUCKET` and the related `S3_*` environment variables for longer clips.

## Anima image generation on the shared Pod

The Irodori Pod setup also installs a small authenticated ComfyUI bridge on HTTP
port `8792`. After installing or updating the Pod bridge, run this once in the
Pod terminal:

```bash
/workspace/ai-vtuber-voice/download-anima.sh
```

The resumable download places the official Anima diffusion model, Qwen text
encoder, and Qwen Image VAE in the Pod's persistent ComfyUI model directory.
Restart the Pod after the download, expose ports `8791` (Irodori) and `8792`
(H3/Anima), and use the same shared Pod token for both bridges.

In the character settings, choose **Anima** for Image AI. Phrases such as
`漫画調の一枚絵、太いインク線、スクリーントーン、吹き出しは空欄` can be
included in the image request. Reliable panel layout and Japanese lettering are
not part of this first integration; compose panels and overlay dialogue in a
later manga-layout step.

Anima is distributed under Circlestone Labs' non-commercial license. Confirm the
model license before any commercial use.

## Contract tests

```powershell
python -m unittest discover -s runpod\voice -p "test_*.py"
python -m unittest discover -s runpod\video -p "test_*.py"
```
