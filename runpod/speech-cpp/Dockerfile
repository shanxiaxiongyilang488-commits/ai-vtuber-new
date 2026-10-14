FROM nvidia/cuda:12.8.1-base-ubuntu22.04
ARG DEBIAN_FRONTEND=noninteractive
ARG SPEECH_VERSION=0.8.6
ARG SPEECH_MODEL=irodori-tts
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip ca-certificates curl unzip libvulkan1 vulkan-tools \
    && rm -rf /var/lib/apt/lists/*
RUN python3 -m pip install --no-cache-dir 'runpod>=1.7,<2'
RUN set -eu; \
    archive="speech-$SPEECH_VERSION-linux-x64-vulkan.zip"; \
    base="https://github.com/nyosegawa/speech.cpp/releases/download/v$SPEECH_VERSION"; \
    mkdir -p /tmp/speech-install /opt/speech/bin; \
    curl --fail --location --retry 3 "$base/$archive" -o "/tmp/speech-install/$archive"; \
    curl --fail --location --retry 3 "$base/SHA256SUMS" -o /tmp/speech-install/SHA256SUMS; \
    cd /tmp/speech-install; \
    grep -E "[ *]$archive$" SHA256SUMS | sha256sum --check --strict -; \
    unzip -q "$archive" -d /opt/speech/bin; \
    /opt/speech/bin/speech --version | grep -F "speech.cpp $SPEECH_VERSION,"; \
    rm -rf /tmp/speech-install
# GPU driver libraries are supplied by the NVIDIA container runtime.
RUN mkdir -p /usr/share/vulkan/icd.d \
    && printf '%s\n' '{"file_format_version":"1.0.0","ICD":{"library_path":"libGLX_nvidia.so.0","api_version":"1.3.0"}}' \
       > /usr/share/vulkan/icd.d/nvidia_icd.json
ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility,graphics \
    SPEECH_CPP_EXECUTABLE=/opt/speech/bin/speech \
    SPEECH_MODEL_DIR=/opt/speech-models \
    SPEECH_CPP_MODEL=$SPEECH_MODEL \
    SPEECH_NO_UPDATE_CHECK=1 \
    PYTHONUNBUFFERED=1 \
    RUNPOD_INIT_TIMEOUT=800
# The selected GGUF includes its codec. Paid workers need no model download.
RUN /opt/speech/bin/speech pull "$SPEECH_MODEL"
COPY runpod/speech-cpp/speech_cpp_handler.py /worker/speech_cpp_handler.py
WORKDIR /worker
CMD ["python3", "-u", "speech_cpp_handler.py"]
