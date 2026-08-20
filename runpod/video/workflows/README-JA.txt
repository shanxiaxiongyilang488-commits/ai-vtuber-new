AI VTuber ComfyUI workflow pack

Windows local folder:
E:\Dev\ai-vtuber\runpod\video\workflows

RunPod ComfyUI folder after copying:
/workspace/runpod-slim/ComfyUI/user/default/workflows/ai-vtuber

ZIP install command:
python3 - <<'PY'
import pathlib, zipfile
zip_path = pathlib.Path("/workspace/COMFYUI_WORKFLOWS_OPEN_THIS.zip")
target_root = pathlib.Path("/workspace/runpod-slim/ComfyUI/user/default/workflows")
target_pack = target_root / "ai-vtuber"
for target in (target_root, target_pack):
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(target)
print("Installed workflows.")
PY

Run extracted helper scripts:
bash /workspace/runpod-slim/ComfyUI/user/default/workflows/ai-vtuber/INSTALL_ON_RUNPOD.sh
bash /workspace/runpod-slim/ComfyUI/user/default/workflows/ai-vtuber/DIAGNOSE_ON_RUNPOD.sh
bash /workspace/runpod-slim/ComfyUI/user/default/workflows/ai-vtuber/DOWNLOAD_ANIMA_ON_RUNPOD.sh

Diagnosis:
bash /workspace/runpod-slim/ComfyUI/user/default/workflows/ai-vtuber/DIAGNOSE_ON_RUNPOD.sh

First workflow to try:
anima-base-v1-ui.json

Manifest version:
2026-08-15-0005

Image:
anima-base-v1-ui.json
anima-shiro-img2img-ui.json
anima-shiro-posesheet-img2img-ui.json
anima-shiro-turnaround-clean-ui.json
anima-base-v1-api.json
anima-lora-v1-api.json
anima-controlnet-v1-api.json

Video:
minimax-h3-i2v-ui.json
minimax-h3-shiro-good-morning-ui.json
minimax-h3-i2v-api.json
minimax-h3-reference-api.json

Music:
minimax-music3-reference-ui.json
minimax-music3-reference.json

Note:
Files ending in -ui.json are for opening in the ComfyUI graph screen.
Files ending in -api.json are for API execution or reference.

minimax-music3-reference.json is a placeholder/reference manifest, not a
guaranteed runnable ComfyUI graph. For real music generation, open the official
MiniMax Music 3 ComfyUI template first, then export it as API JSON.
