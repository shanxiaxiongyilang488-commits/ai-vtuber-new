FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu22.04

ARG DEBIAN_FRONTEND=noninteractive
ARG IRODORI_REF=8ca3acb58ab4e19ad6d594aaed6bafe3e88f7f71

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv git ffmpeg libsndfile1 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN python3 -m pip install --no-cache-dir --upgrade pip setuptools wheel \
    && python3 -m pip install --no-cache-dir \
       --index-url https://download.pytorch.org/whl/cu128 \
       "torch>=2.10,<2.11" "torchaudio>=2.10,<2.11" "torchao>=0.16,<0.17"
RUN git clone https://github.com/Aratako/Irodori-TTS.git /opt/Irodori-TTS \
    && cd /opt/Irodori-TTS \
    && git checkout "${IRODORI_REF}" \
    && python3 -m pip install --no-cache-dir -e . \
    && python3 -m pip install --no-cache-dir "runpod>=1.7,<2"

COPY handler.py /worker/handler.py
WORKDIR /worker

ENV PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    IRODORI_ROOT=/opt/Irodori-TTS \
    HF_HOME=/runpod-volume/huggingface \
    HUGGINGFACE_HUB_CACHE=/runpod-volume/huggingface/hub \
    TORCH_HOME=/runpod-volume/torch \
    IRODORI_HF_CHECKPOINT=Aratako/Irodori-TTS-v4-Small-Quantized/int8-weight-only \
    PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,max_split_size_mb:128

CMD ["python3", "-u", "handler.py"]
