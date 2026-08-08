FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

ARG DEBIAN_FRONTEND=noninteractive
ARG HUNYUAN_REF=main

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ffmpeg libgl1 libglib2.0-0 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5.git /opt/HunyuanVideo-1.5 \
    && cd /opt/HunyuanVideo-1.5 \
    && git checkout "${HUNYUAN_REF}" \
    && python -m pip install --no-cache-dir -r requirements.txt \
    && python -m pip install --no-cache-dir "runpod>=1.7,<2" "boto3>=1.35,<2"

COPY handler.py prepare_models.py /worker/
WORKDIR /worker

ENV PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    HUNYUAN_ROOT=/opt/HunyuanVideo-1.5 \
    HUNYUAN_MODEL_PATH=/runpod-volume/models/HunyuanVideo-1.5 \
    HF_HOME=/runpod-volume/huggingface \
    HUGGINGFACE_HUB_CACHE=/runpod-volume/huggingface/hub \
    TORCH_HOME=/runpod-volume/torch \
    PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,max_split_size_mb:128

CMD ["python", "-u", "handler.py"]
