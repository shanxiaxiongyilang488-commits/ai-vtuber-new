# Drama-3-Japanese (full Q4_K) speech.cpp worker for RunPod Serverless.
# Q4_K Vulkan variant (whisper pack v2 rebuild, user-approved 2026-11-26).
# Official model-card configuration for the full Q4_K GGUF: UNPATCHED
# speech.cpp v0.11.2 + Vulkan. The fast-patch CUDA build cannot compute
# Q4_K weights ("logits are not finite numbers" on sm86 and sm89), and
# upstream ggml-cuda overflows on Q4_K activations, so CUDA is not used.
# This image is pushed ONLY as drama3-worker:q4k-vulkan by its own
# workflow; the small IQ3_XXS image keeps the :latest tag untouched.

# ---------- builder ----------
FROM ubuntu:24.04 AS builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      git cmake build-essential curl ca-certificates pkg-config xz-utils \
    && rm -rf /var/lib/apt/lists/*

ARG SPEECH_CPP_TAG=v0.11.2
ARG HF_BASE=https://huggingface.co/StudioYebisu-ship-it/Drama-3-Japanese-speech-cpp-gguf/resolve/main
ARG MODEL_FILE=Drama-35B-A3B-Japanese-v3-Q4_K.gguf
ARG VULKAN_SDK_VERSION=1.4.357.0

# Vulkan SDK: the documented one-archive route for the ggml Vulkan build
# (docs/install.md of speech.cpp v0.11.2). Brings headers, the loader,
# glslc and the SPIRV-Headers CMake config that ggml-vulkan requires.
RUN curl -sL -o /tmp/vulkansdk.tar.xz \
      https://sdk.lunarg.com/sdk/download/${VULKAN_SDK_VERSION}/linux/vulkansdk-linux-x86_64-${VULKAN_SDK_VERSION}.tar.xz \
    && mkdir -p /opt/vulkansdk \
    && tar -xJf /tmp/vulkansdk.tar.xz -C /opt/vulkansdk --strip-components=1 \
    && rm /tmp/vulkansdk.tar.xz \
    && ls /opt/vulkansdk

WORKDIR /src
RUN git clone --depth 1 --branch ${SPEECH_CPP_TAG} https://github.com/nyosegawa/speech.cpp speech.cpp \
    && cd speech.cpp && git submodule update --init --recursive

# NO drama3 fast patch: vanilla v0.11.2, Vulkan backend (CPU backend is
# always built alongside as the documented fallback).
RUN cd /src/speech.cpp \
    && . /opt/vulkansdk/setup-env.sh \
    && cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DGGML_VULKAN=ON \
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
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip libgomp1 libcurl4 ca-certificates libvulkan1 \
    && rm -rf /var/lib/apt/lists/*
RUN pip3 install --no-cache-dir --break-system-packages "runpod>=1.7,<2"

# NVIDIA Vulkan ICD descriptor: the driver library itself is injected by
# the container runtime; this lets the Vulkan loader find it even when
# the runtime does not mount its own descriptor copy.
RUN mkdir -p /usr/share/vulkan/icd.d \
    && printf '%s\n' '{"file_format_version":"1.0.0","ICD":{"library_path":"libGLX_nvidia.so.0","api_version":"1.3.0"}}' \
       > /usr/share/vulkan/icd.d/nvidia_icd.json

COPY --from=builder /opt/speech /opt/speech
COPY --from=builder /models /models
COPY handler.py /handler.py

# The three GGML_VK_DISABLE_* flags are the model card's required runtime
# configuration for Q4_K on Vulkan. No SPEECH_DRAMA3_* variables: those
# belong to the fast patch, which is not present in this build.
ENV LD_LIBRARY_PATH=/opt/speech \
    SPEECH_BIN=/opt/speech/speech \
    MODEL_PATH=/models/Drama-35B-A3B-Japanese-v3-Q4_K.gguf \
    GGML_VK_DISABLE_F16=1 \
    GGML_VK_DISABLE_COOPMAT=1 \
    GGML_VK_DISABLE_COOPMAT2=1 \
    PYTHONUNBUFFERED=1

WORKDIR /
CMD ["python3", "-u", "/handler.py"]
