FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu22.04

ARG DEBIAN_FRONTEND=noninteractive
ARG IRODORI_REF=8224dafb46d0aba89209a8f905f1cb7e3299d9c1
ARG IRODORI_CODEC_REPO=Aratako/Semantic-DACVAE-Japanese-32dim
ARG IRODORI_CODEC_REVISION=main

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

# RunPod Cached Models can preload one Hugging Face repository per endpoint.
# Use that slot for the 3.1 GB Irodori checkpoint and bake the separate 430 MB
# DACVAE codec into the image, so the first paid request performs no model download.
RUN mkdir -p /opt/irodori-assets/codec \
    && /opt/Irodori-TTS/.venv/bin/python -c \
       "import shutil, sys; from huggingface_hub import hf_hub_download; shutil.copyfile(hf_hub_download(repo_id=sys.argv[1], filename='weights.pth', revision=sys.argv[2]), '/opt/irodori-assets/codec/weights.pth')" \
       "${IRODORI_CODEC_REPO}" "${IRODORI_CODEC_REVISION}" \
    && test -s /opt/irodori-assets/codec/weights.pth \
    && rm -rf /root/.cache/huggingface

COPY handler.py /worker/handler.py
WORKDIR /worker

ENV PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    IRODORI_ROOT=/opt/Irodori-TTS \
    HF_HOME=/runpod-volume/huggingface-cache \
    HUGGINGFACE_HUB_CACHE=/runpod-volume/huggingface-cache/hub \
    TORCH_HOME=/runpod-volume/torch \
    IRODORI_HF_CHECKPOINT=Aratako/Irodori-TTS-v4.1-Small \
    IRODORI_CODEC_REPO=/opt/irodori-assets/codec/weights.pth \
    IRODORI_MODEL_PRECISION=bf16 \
    IRODORI_CODEC_PRECISION=fp32 \
    RUNPOD_INIT_TIMEOUT=800 \
    HF_HUB_DISABLE_TELEMETRY=1 \
    PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,max_split_size_mb:128

CMD ["/opt/Irodori-TTS/.venv/bin/python", "-u", "handler.py"]
