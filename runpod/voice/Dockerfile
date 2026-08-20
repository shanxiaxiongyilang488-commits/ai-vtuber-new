FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu22.04

ARG DEBIAN_FRONTEND=noninteractive
ARG IRODORI_REF=8ca3acb58ab4e19ad6d594aaed6bafe3e88f7f71

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv git ffmpeg libsndfile1 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN python3 -m pip install --no-cache-dir --upgrade pip uv

RUN git clone https://github.com/Aratako/Irodori-TTS.git /opt/Irodori-TTS \
    && cd /opt/Irodori-TTS \
    && git checkout "${IRODORI_REF}"

# Irodori-TTS declares Git and CUDA package sources in [tool.uv.sources].
# A plain `pip install -e .` ignores those sources (notably dacvae).
RUN cd /opt/Irodori-TTS \
    && uv sync --no-dev --extra cu128 \
    && uv pip install \
       --python /opt/Irodori-TTS/.venv/bin/python \
       "runpod>=1.7,<2" \
    && rm -rf /root/.cache/uv /opt/Irodori-TTS/.git

COPY handler.py /worker/handler.py
WORKDIR /worker

ENV PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    IRODORI_ROOT=/opt/Irodori-TTS \
    HF_HOME=/runpod-volume/huggingface \
    HUGGINGFACE_HUB_CACHE=/runpod-volume/huggingface/hub \
    TORCH_HOME=/runpod-volume/torch \
    IRODORI_HF_CHECKPOINT=Aratako/Irodori-TTS-v4-Small \
    IRODORI_MODEL_PRECISION=bf16 \
    IRODORI_CODEC_PRECISION=fp32 \
    RUNPOD_INIT_TIMEOUT=800 \
    HF_HUB_DISABLE_TELEMETRY=1 \
    PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,max_split_size_mb:128

CMD ["/opt/Irodori-TTS/.venv/bin/python", "-u", "handler.py"]
