#!/usr/bin/env bash
set -euo pipefail

ROOT=/workspace/ai-vtuber-voice
IRODORI="$ROOT/Irodori-TTS"
APP="$ROOT/app"
SOURCE_REPO="${AI_VTUBER_REPO:-https://github.com/shanxiaxiongyilang488-commits/ai-vtuber-new.git}"
SOURCE_REF="${AI_VTUBER_REF:-feature/emotion-growth-system}"

mkdir -p "$ROOT" "$APP" /workspace/huggingface/hub /workspace/torch
if [ ! -s "$ROOT/token" ]; then
  "$IRODORI/.venv/bin/python" -c 'import secrets; print(secrets.token_urlsafe(36))' > "$ROOT/token" 2>/dev/null || python3 -c 'import secrets; print(secrets.token_urlsafe(36))' > "$ROOT/token"
fi
if [ ! -d "$IRODORI/.git" ]; then
  git clone https://github.com/Aratako/Irodori-TTS.git "$IRODORI"
fi
git -C "$IRODORI" fetch --depth 1 origin 8ca3acb58ab4e19ad6d594aaed6bafe3e88f7f71
git -C "$IRODORI" checkout 8ca3acb58ab4e19ad6d594aaed6bafe3e88f7f71
python3 -m pip install --upgrade uv
cd "$IRODORI"
uv sync --no-dev --extra cu128
uv pip install --python "$IRODORI/.venv/bin/python" fastapi uvicorn 'runpod>=1.7,<2'

if [ ! -d "$ROOT/source/.git" ]; then
  git clone --branch "$SOURCE_REF" --single-branch "$SOURCE_REPO" "$ROOT/source"
else
  git -C "$ROOT/source" fetch origin "$SOURCE_REF"
  git -C "$ROOT/source" checkout "$SOURCE_REF"
  git -C "$ROOT/source" pull --ff-only origin "$SOURCE_REF"
fi
cp "$ROOT/source/runpod/voice/handler.py" "$APP/handler.py"
cp "$ROOT/source/runpod/voice/pod_server.py" "$APP/pod_server.py"

cat > "$ROOT/start-voice.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
ROOT=/workspace/ai-vtuber-voice
export IRODORI_ROOT="$ROOT/Irodori-TTS"
export HF_HOME=/workspace/huggingface
export HUGGINGFACE_HUB_CACHE=/workspace/huggingface/hub
export TORCH_HOME=/workspace/torch
export IRODORI_HF_CHECKPOINT="${IRODORI_HF_CHECKPOINT:-Aratako/Irodori-TTS-v4-Small}"
export IRODORI_MODEL_PRECISION="${IRODORI_MODEL_PRECISION:-bf16}"
export IRODORI_CODEC_PRECISION="${IRODORI_CODEC_PRECISION:-fp32}"
export VOICE_BRIDGE_TOKEN="$(cat "$ROOT/token")"
cd "$ROOT/app"
exec "$ROOT/Irodori-TTS/.venv/bin/python" -m uvicorn pod_server:app --host 0.0.0.0 --port 8791
EOF
chmod +x "$ROOT/start-voice.sh"

NODE=/workspace/runpod-slim/ComfyUI/custom_nodes/ai_vtuber_voice_bridge
mkdir -p "$NODE"
cat > "$NODE/__init__.py" <<'EOF'
import os
import socket
import subprocess

def _open(port):
    with socket.socket() as sock:
        sock.settimeout(0.2)
        return sock.connect_ex(("127.0.0.1", port)) == 0

if not _open(8791):
    log = open("/workspace/ai-vtuber-voice/voice.log", "ab", buffering=0)
    subprocess.Popen(
        ["/workspace/ai-vtuber-voice/start-voice.sh"],
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
EOF

echo "Irodori Pod voice installed. Restart the Pod once and expose HTTP port 8791."
echo "Voice Pod token (save this in AI VTuber settings):"
cat "$ROOT/token"
