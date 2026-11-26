# Drama-3-Japanese (full Q4_K) speech.cpp worker for RunPod Serverless.
# v2 variant for the whisper pack rebuild (Q4_K model, 48GB GPU class).
# NOTE: the workflow pushes this as drama3-worker:latest; the Q4_K image is
# pinned by digest in its own template, and this file is reverted to the
# small IQ3_XXS version right after the build so :latest returns to small.
# Multi-stage: build speech.cpp v0.11.2 + drama3 fast patch with CUDA,
# bake the GGUF model into the image (no network volume).

# ---------- builder ----------
FROM nvidia/cuda:12.8.0-devel-ubuntu22.04 AS builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      git cmake build-essential curl ca-certificates pkg-config \
    && rm -rf /var/lib/apt/lists/*

ARG SPEECH_CPP_TAG=v0.11.2
ARG HF_BASE=https://huggingface.co/StudioYebisu-ship-it/Drama-3-Japanese-speech-cpp-gguf/resolve/main
ARG MODEL_FILE=Drama-35B-A3B-Japanese-v3-Q4_K.gguf

WORKDIR /src
RUN git clone --depth 1 --branch ${SPEECH_CPP_TAG} https://github.com/nyosegawa/speech.cpp speech.cpp \
    && cd speech.cpp && git submodule update --init --recursive

RUN curl -sL -o /tmp/drama3-speechcpp-fast.patch ${HF_BASE}/drama3-speechcpp-fast.patch \
    && cd /src/speech.cpp && git apply /tmp/drama3-speechcpp-fast.patch

RUN cd /src/speech.cpp \
    && cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
       -DGGML_CUDA=ON -DGGML_CUDA_GRAPHS=ON -DCMAKE_CUDA_ARCHITECTURES="86;89" \
    && cmake --build build --target speech speech-cli -j"$(nproc)"

# Collect the speech binary and every shared library it needs, side by side.
RUN mkdir -p /opt/speech \
    && SPEECH_BIN_PATH=$(find /src/speech.cpp/build -maxdepth 3 -name speech -type f | head -1) \
    && test -n "$SPEECH_BIN_PATH" \
    && cp "$SPEECH_BIN_PATH" /opt/speech/speech \
    && find /src/speech.cpp/build -name "*.so*" \( -type f -o -type l \) -exec cp -a {} /opt/speech/ \; \
    && ls -la /opt/speech

# Download the model + sidecar and verify against the published SHA256 sums.
RUN mkdir -p /models \
    && curl -sL -o /tmp/SHA256SUMS.txt ${HF_BASE}/SHA256SUMS.txt \
    && curl -L -o /models/${MODEL_FILE} ${HF_BASE}/${MODEL_FILE} \
    && curl -sL -o /models/${MODEL_FILE}.json ${HF_BASE}/${MODEL_FILE}.json \
    && EXPECTED=$(awk '$NF ~ /-Q4_K\.gguf$/ {print $1}' /tmp/SHA256SUMS.txt | head -1) \
    && ACTUAL=$(sha256sum /models/${MODEL_FILE} | awk '{print $1}') \
    && test -n "$EXPECTED" && test "$EXPECTED" = "$ACTUAL" \
    && ls -la /models

# ---------- runtime ----------
FROM nvidia/cuda:12.8.0-runtime-ubuntu22.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip libgomp1 libcurl4 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN pip3 install --no-cache-dir "runpod>=1.7,<2"

COPY --from=builder /opt/speech /opt/speech
COPY --from=builder /models /models
COPY handler.py /handler.py

ENV LD_LIBRARY_PATH=/opt/speech \
    SPEECH_BIN=/opt/speech/speech \
    MODEL_PATH=/models/Drama-35B-A3B-Japanese-v3-Q4_K.gguf \
    SPEECH_DRAMA3_MAX_PAUSE_FRAMES=18 \
    PYTHONUNBUFFERED=1

WORKDIR /
CMD ["python3", "-u", "/handler.py"]
