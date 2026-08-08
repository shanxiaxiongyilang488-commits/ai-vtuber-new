FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git \
    && rm -rf /var/lib/apt/lists/*
RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir \
       "runpod>=1.7,<2" \
       "transformers>=4.51,<5" \
       "accelerate>=1.6,<2" \
       "safetensors>=0.5,<1" \
       "sentencepiece>=0.2,<1"

COPY handler.py /worker/handler.py
WORKDIR /worker

ENV PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    MODEL_ID=Qwen/Qwen3-8B \
    MODEL_CACHE=/runpod-volume/huggingface \
    HF_HOME=/runpod-volume/huggingface \
    HUGGINGFACE_HUB_CACHE=/runpod-volume/huggingface/hub \
    TORCH_HOME=/runpod-volume/torch \
    MAX_CONTEXT_TOKENS=24576 \
    PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,max_split_size_mb:128

CMD ["python", "-u", "handler.py"]
