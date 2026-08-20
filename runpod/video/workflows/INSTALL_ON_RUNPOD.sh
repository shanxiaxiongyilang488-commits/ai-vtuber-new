#!/usr/bin/env bash
set -euo pipefail

ZIP_PATH="${1:-/workspace/COMFYUI_WORKFLOWS_OPEN_THIS.zip}"
COMFY_ROOT="${COMFYUI_ROOT:-/workspace/runpod-slim/ComfyUI}"
TARGET_ROOT="$COMFY_ROOT/user/default/workflows"
TARGET_PACK="$TARGET_ROOT/ai-vtuber"

if [ ! -f "$ZIP_PATH" ]; then
  echo "Workflow zip was not found: $ZIP_PATH" >&2
  echo "Upload COMFYUI_WORKFLOWS_OPEN_THIS.zip to /workspace first." >&2
  exit 1
fi

if [ ! -d "$COMFY_ROOT" ]; then
  echo "ComfyUI root was not found: $COMFY_ROOT" >&2
  echo "Set COMFYUI_ROOT if your ComfyUI folder is elsewhere." >&2
  exit 1
fi

mkdir -p "$TARGET_PACK"
python3 - "$ZIP_PATH" "$TARGET_PACK" "$TARGET_ROOT" <<'PY'
import pathlib
import sys
import zipfile

zip_path = pathlib.Path(sys.argv[1])
targets = [pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])]

for target in targets:
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as archive:
        archive.extractall(target)
PY

echo "Installed workflows to:"
echo "  $TARGET_PACK"
echo "  $TARGET_ROOT"
echo ""
echo "Reload ComfyUI, then open anima-base-v1-ui.json first."
