FROM runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404

ARG DEBIAN_FRONTEND=noninteractive
ARG COMFYUI_REF=v0.33.0
ARG IRODORI_REF=8ca3acb58ab4e19ad6d594aaed6bafe3e88f7f71

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash build-essential ca-certificates curl ffmpeg git libgl1 libglib2.0-0 \
    libsndfile1 tini \
    && rm -rf /var/lib/apt/lists/*

# ComfyUI and its HTTP bridge run in the image's Python environment. Pinning
# the release makes a newly migrated Pod behave like the previous Pod. The
# RunPod base image also ships a Debian-managed cryptography package without
# pip RECORD metadata, so a pip-owned copy is installed before requirements.
RUN git clone --filter=blob:none https://github.com/Comfy-Org/ComfyUI.git /opt/ComfyUI \
    && cd /opt/ComfyUI \
    && git checkout "${COMFYUI_REF}" \
    && python -m pip install --no-cache-dir --ignore-installed "cryptography>=43,<47" \
    && python -m pip install --no-cache-dir -r requirements.txt \
    && python -m pip install --no-cache-dir \
       "fastapi>=0.115,<1" "uvicorn[standard]>=0.34,<1" \
       "runpod>=1.7,<2" "boto3>=1.35,<2" \
       "huggingface_hub>=0.34,<2" "hf_transfer>=0.1.9,<1" \
       "requests>=2.32,<3" "jupyterlab>=4.3,<5" \
       "sqlalchemy>=2,<3" "alembic>=1.14,<2" "tqdm>=4.67,<5" \
    && rm -rf /opt/ComfyUI/.git /root/.cache/pip

# Irodori uses its own uv environment, so its Python dependencies do not
# replace the ComfyUI stack in the CUDA 12.8 RunPod base environment.
RUN python -m pip install --no-cache-dir --upgrade uv \
    && git clone https://github.com/Aratako/Irodori-TTS.git /opt/Irodori-TTS \
    && cd /opt/Irodori-TTS \
    && git checkout "${IRODORI_REF}" \
    && uv sync --no-dev --extra cu128 \
    && uv pip install --python /opt/Irodori-TTS/.venv/bin/python \
       "fastapi>=0.115,<1" "uvicorn[standard]>=0.34,<1" "runpod>=1.7,<2" \
    && rm -rf /opt/Irodori-TTS/.git /root/.cache/uv

RUN mkdir -p /opt/ai-vtuber/voice /opt/ai-vtuber/video /opt/ai-vtuber/bridge /worker

COPY voice/handler.py voice/pod_server.py /opt/ai-vtuber/voice/
COPY video/handler.py /opt/ai-vtuber/video/video_handler.py
COPY video/pod_server.py video/prepare_models.py video/anima.py /opt/ai-vtuber/video/
COPY video/workflows/ /opt/ai-vtuber/video/workflows/
COPY unified/bridge/ /opt/ai-vtuber/bridge/
COPY unified/extra_model_paths.yaml /worker/extra_model_paths.yaml
COPY --chmod=755 unified/entrypoint.sh /opt/ai-vtuber/entrypoint.sh

ENV PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    CC=/usr/bin/gcc \
    COMFYUI_ROOT=/opt/ComfyUI \
    COMFY_URL=http://127.0.0.1:8188 \
    COMFY_INPUT=/workspace/ComfyUI/input \
    COMFY_OUTPUT=/workspace/ComfyUI/output \
    H3_MODEL_ROOT=/workspace/ComfyUI/models \
    ANIMA_MODEL_ROOT=/workspace/ComfyUI/models \
    IRODORI_ROOT=/opt/Irodori-TTS \
    IRODORI_HF_CHECKPOINT=Aratako/Irodori-TTS-v4-Small \
    IRODORI_MODEL_PRECISION=bf16 \
    IRODORI_CODEC_PRECISION=fp32 \
    HF_HOME=/workspace/cache/huggingface \
    HUGGINGFACE_HUB_CACHE=/workspace/cache/huggingface/hub \
    TORCH_HOME=/workspace/cache/torch \
    HF_HUB_ENABLE_HF_TRANSFER=1 \
    HF_HUB_DISABLE_TELEMETRY=1 \
    PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,max_split_size_mb:128 \
    VIDEO_TIMEOUT_SECONDS=10800 \
    RUNPOD_INIT_TIMEOUT=1200

WORKDIR /workspace
# Only the shared gateway and JupyterLab need RunPod HTTP proxy entries.
# Voice (8791) and video (8792) stay private inside the Pod.
EXPOSE 8188 8888
HEALTHCHECK --interval=30s --timeout=10s --start-period=10m --retries=3 \
  CMD TOKEN="$$(cat /workspace/ai-vtuber-runtime/shared-token 2>/dev/null)" \
   && test -n "$$TOKEN" \
   && curl -fsS http://127.0.0.1:8188/ >/dev/null \
   && curl -fsS -H "Authorization: Bearer $$TOKEN" http://127.0.0.1:8188/ai-vtuber/voice/health >/dev/null \
   && curl -fsS -H "Authorization: Bearer $$TOKEN" http://127.0.0.1:8188/ai-vtuber/video/health >/dev/null \
   || exit 1
ENTRYPOINT ["/usr/bin/tini", "--", "/opt/ai-vtuber/entrypoint.sh"]
