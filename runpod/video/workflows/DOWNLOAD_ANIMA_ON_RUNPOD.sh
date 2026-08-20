#!/usr/bin/env bash
set -euo pipefail

MODELS="${ANIMA_MODEL_ROOT:-/workspace/runpod-slim/ComfyUI/models}"
mkdir -p "$MODELS/diffusion_models" "$MODELS/text_encoders" "$MODELS/vae"

download() {
  local url="$1"
  local target="$2"
  if [ -s "$target" ]; then
    echo "Already present: $target"
    return
  fi
  echo "Downloading: $target"
  if command -v curl >/dev/null 2>&1; then
    curl --fail --location --retry 5 --continue-at - --output "$target.part" "$url"
  else
    python3 - "$url" "$target.part" <<'PY'
import sys
import urllib.request

url, target = sys.argv[1], sys.argv[2]
urllib.request.urlretrieve(url, target)
PY
  fi
  mv "$target.part" "$target"
}

download \
  "https://huggingface.co/circlestone-labs/Anima/resolve/main/split_files/diffusion_models/anima-base-v1.0.safetensors" \
  "$MODELS/diffusion_models/anima-base-v1.0.safetensors"
download \
  "https://huggingface.co/circlestone-labs/Anima/resolve/main/split_files/text_encoders/qwen_3_06b_base.safetensors" \
  "$MODELS/text_encoders/qwen_3_06b_base.safetensors"
download \
  "https://huggingface.co/circlestone-labs/Anima/resolve/main/split_files/vae/qwen_image_vae.safetensors" \
  "$MODELS/vae/qwen_image_vae.safetensors"

echo "Anima Base v1.0 model files are ready."
echo "Reload ComfyUI, then open anima-base-v1-ui.json."
