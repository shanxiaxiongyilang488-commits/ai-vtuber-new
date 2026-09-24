FROM pytorch/pytorch:2.9.1-cuda13.0-cudnn9-runtime

ARG DEBIAN_FRONTEND=noninteractive
ARG COMFYUI_REF=73c9bad4d21e7addbe1d13bc92eee0f1431b017d

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ffmpeg libgl1 libglib2.0-0 ca-certificates build-essential \
    && rm -rf /var/lib/apt/lists/*

# ComfyUI v0.37.0 plus the official H3 partial-offload fix (PR #16485).
COPY patch_h3_vae.py /tmp/patch_h3_vae.py
RUN git clone --filter=blob:none https://github.com/Comfy-Org/ComfyUI.git /opt/ComfyUI \
    && cd /opt/ComfyUI \
    && git checkout "${COMFYUI_REF}" \
    && python /tmp/patch_h3_vae.py /opt/ComfyUI/comfy/ldm/minimax/vae.py \
    && python -m pip install --no-cache-dir -r requirements.txt \
    && python -m pip install --no-cache-dir \
        "runpod>=1.7,<2" "boto3>=1.35,<2" "huggingface_hub>=0.34,<2" "requests>=2.32,<3"

COPY handler.py prepare_models.py anima.py extra_model_paths.yaml /worker/
WORKDIR /worker

ENV PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    CC=/usr/bin/gcc \
    COMFYUI_ROOT=/opt/ComfyUI \
    H3_MODEL_ROOT=/runpod-volume/comfyui-models \
    HF_HOME=/runpod-volume/huggingface \
    HUGGINGFACE_HUB_CACHE=/runpod-volume/huggingface/hub \
    TORCH_HOME=/runpod-volume/torch \
    PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,max_split_size_mb:128 \
    VIDEO_TIMEOUT_SECONDS=10800

CMD ["python", "-u", "handler.py"]
