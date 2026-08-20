#!/usr/bin/env bash
set -euo pipefail

COMFY_ROOT="${COMFYUI_ROOT:-/workspace/runpod-slim/ComfyUI}"
WORKFLOW_ROOT="$COMFY_ROOT/user/default/workflows"

echo "AI VTuber ComfyUI diagnosis"
echo ""

if python3 - <<'PY' >/tmp/ai-vtuber-comfy-manifest.txt 2>/dev/null
import zipfile
with zipfile.ZipFile("/workspace/COMFYUI_WORKFLOWS_OPEN_THIS.zip") as archive:
    print(archive.read("MANIFEST.txt").decode("utf-8"))
PY
then
  echo "Package manifest:"
  cat /tmp/ai-vtuber-comfy-manifest.txt
  echo ""
else
  echo "Package manifest: not readable from /workspace/COMFYUI_WORKFLOWS_OPEN_THIS.zip"
  echo ""
fi

check_path() {
  local label="$1"
  local path="$2"
  if [ -e "$path" ]; then
    echo "OK   $label: $path"
  else
    echo "MISS $label: $path"
  fi
}

check_path "ComfyUI root" "$COMFY_ROOT"
check_path "Workflow root" "$WORKFLOW_ROOT"
check_path "AI VTuber workflow folder" "$WORKFLOW_ROOT/ai-vtuber"

echo ""
echo "Workflow files:"
check_path "image ui" "$WORKFLOW_ROOT/anima-base-v1-ui.json"
check_path "image ui in ai-vtuber" "$WORKFLOW_ROOT/ai-vtuber/anima-base-v1-ui.json"
check_path "video ui" "$WORKFLOW_ROOT/minimax-h3-i2v-ui.json"
check_path "video ui in ai-vtuber" "$WORKFLOW_ROOT/ai-vtuber/minimax-h3-i2v-ui.json"
check_path "manifest" "$WORKFLOW_ROOT/MANIFEST.txt"
check_path "manifest in ai-vtuber" "$WORKFLOW_ROOT/ai-vtuber/MANIFEST.txt"

echo ""
echo "Anima image model files:"
check_path "anima diffusion" "$COMFY_ROOT/models/diffusion_models/anima-base-v1.0.safetensors"
check_path "qwen text encoder" "$COMFY_ROOT/models/text_encoders/qwen_3_06b_base.safetensors"
check_path "qwen vae" "$COMFY_ROOT/models/vae/qwen_image_vae.safetensors"

echo ""
echo "MiniMax H3 video model files:"
check_path "h3 diffusion" "$COMFY_ROOT/models/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors"
check_path "h3 text encoder" "$COMFY_ROOT/models/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"
check_path "h3 video vae" "$COMFY_ROOT/models/vae/minimax_h3_video_vae_fp16.safetensors"
check_path "h3 audio vae" "$COMFY_ROOT/models/vae/minimax_h3_audio_vae_fp32.safetensors"

echo ""
echo "Community H3 add-on hints:"
find "$COMFY_ROOT/models" -maxdepth 3 -type f \( \
  -iname '*minimax*h3*lora*' -o \
  -iname '*h3*lora*' -o \
  -iname '*MiniMax-H3_comfy*' -o \
  -iname '*voice*clone*' \
\) -print 2>/dev/null | sed 's/^/FOUND /' || true
echo "If nothing is listed, no obvious H3 LoRA or voice-clone add-on file was found."

echo ""
echo "Next:"
echo "- If workflow files are MISS, install the ZIP first."
echo "- If Anima model files are MISS, run:"
echo "  bash $WORKFLOW_ROOT/ai-vtuber/DOWNLOAD_ANIMA_ON_RUNPOD.sh"
echo "- If H3 model files are MISS, run H3: Download Models from the app or the Pod setup command."
echo "- If using a community H3 LoRA/voice workflow, import its official workflow JSON before editing app code."
echo "- If all are OK but ComfyUI still fails, click Show details on the red error popup."
