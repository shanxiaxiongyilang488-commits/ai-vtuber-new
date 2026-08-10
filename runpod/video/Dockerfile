FROM pytorch/pytorch:2.7.1-cuda12.8-cudnn9-runtime

ARG DEBIAN_FRONTEND=noninteractive
ARG COMFYUI_REF=57500fc

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ffmpeg libgl1 libglib2.0-0 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# MiniMax H3 support was merged into ComfyUI core on 2026-08-03. Models are
# deliberately kept out of the image and downloaded once to a Network Volume.
RUN git clone --filter=blob:none https://github.com/Comfy-Org/ComfyUI.git /opt/ComfyUI \
    && cd /opt/ComfyUI \
    && git checkout "${COMFYUI_REF}" \
    && python -m pip install --no-cache-dir -r requirements.txt \
    && python -m pip install --no-cache-dir \
        "runpod>=1.7,<2" "boto3>=1.35,<2" "huggingface_hub>=0.34,<2" "requests>=2.32,<3"

COPY handler.py prepare_models.py extra_model_paths.yaml /worker/
WORKDIR /worker

ENV PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    COMFYUI_ROOT=/opt/ComfyUI \
    H3_MODEL_ROOT=/runpod-volume/comfyui-models \
    HF_HOME=/runpod-volume/huggingface \
    HUGGINGFACE_HUB_CACHE=/runpod-volume/huggingface/hub \
    TORCH_HOME=/runpod-volume/torch \
    PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,max_split_size_mb:128 \
    VIDEO_TIMEOUT_SECONDS=10800

CMD ["python", "-u", "handler.py"]
