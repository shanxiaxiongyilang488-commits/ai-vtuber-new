#!/usr/bin/env bash
set -Eeuo pipefail

RUNTIME_ROOT="${AI_VTUBER_RUNTIME_ROOT:-/workspace/ai-vtuber-runtime}"
COMFY_DATA="${COMFY_DATA_ROOT:-/workspace/ComfyUI}"
mkdir -p \
  "$RUNTIME_ROOT" "$COMFY_DATA/models" "$COMFY_DATA/input" \
  "$COMFY_DATA/output" "$COMFY_DATA/user" "$COMFY_DATA/custom_nodes" \
  /workspace/cache/huggingface/hub /workspace/cache/torch

persist_comfy_dir() {
  local name="$1"
  local source="/opt/ComfyUI/$name"
  local target="$COMFY_DATA/$name"
  mkdir -p "$target"
  if [[ -d "$source" && ! -L "$source" ]]; then
    cp -an "$source/." "$target/" 2>/dev/null || true
    rm -rf "$source"
  fi
  ln -sfn "$target" "$source"
}

for directory in models input output user custom_nodes; do
  persist_comfy_dir "$directory"
done

# This one known integration node is refreshed from the image on every boot;
# user-installed custom nodes remain untouched on the Network Volume.
mkdir -p "$COMFY_DATA/custom_nodes/ai_vtuber_bridge"
cp -f /opt/ai-vtuber/bridge/*.py \
  "$COMFY_DATA/custom_nodes/ai_vtuber_bridge/"

# Make the bundled API workflows visible in ComfyUI without overwriting the
# user's own workflows stored on the Network Volume.
WORKFLOW_TARGET="$COMFY_DATA/user/default/workflows/ai-vtuber"
mkdir -p "$WORKFLOW_TARGET"
cp -f /opt/ai-vtuber/video/workflows/*.json "$WORKFLOW_TARGET/"

TOKEN_FILE="$RUNTIME_ROOT/shared-token"
SHARED_TOKEN="${AI_VTUBER_BRIDGE_TOKEN:-${VOICE_BRIDGE_TOKEN:-${H3_BRIDGE_TOKEN:-}}}"
if [[ -z "$SHARED_TOKEN" && -s "$TOKEN_FILE" ]]; then
  SHARED_TOKEN="$(tr -d '\r\n' < "$TOKEN_FILE")"
fi
if [[ -z "$SHARED_TOKEN" ]]; then
  SHARED_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
fi
printf '%s' "$SHARED_TOKEN" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"
export AI_VTUBER_BRIDGE_TOKEN="$SHARED_TOKEN"
export VOICE_BRIDGE_TOKEN="$SHARED_TOKEN"
export H3_BRIDGE_TOKEN="$SHARED_TOKEN"

pids=()
stop_services() {
  trap - EXIT INT TERM
  if ((${#pids[@]})); then
    kill "${pids[@]}" 2>/dev/null || true
    wait "${pids[@]}" 2>/dev/null || true
  fi
}
trap stop_services EXIT INT TERM

echo "[unified] Starting JupyterLab on :8888"
jupyter lab \
  --ip=0.0.0.0 --port=8888 --no-browser --allow-root \
  --ServerApp.root_dir=/workspace \
  --ServerApp.token="${JUPYTER_TOKEN:-}" \
  --ServerApp.allow_origin='*' &
JUPYTER_PID="$!"
pids+=("$JUPYTER_PID")

echo "[unified] Starting ComfyUI and AI VTuber gateway on :8188"
(
  cd /opt/ComfyUI
  exec python main.py \
    --listen 0.0.0.0 --port 8188 --disable-auto-launch \
    --extra-model-paths-config /worker/extra_model_paths.yaml \
    --input-directory "$COMFY_DATA/input" \
    --output-directory "$COMFY_DATA/output" \
    --user-directory "$COMFY_DATA/user"
) &
COMFY_PID="$!"
pids+=("$COMFY_PID")

COMFY_STARTUP_TIMEOUT="${COMFY_STARTUP_TIMEOUT:-600}"
for _ in $(seq 1 "$COMFY_STARTUP_TIMEOUT"); do
  if curl -fsS http://127.0.0.1:8188/ >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$COMFY_PID" 2>/dev/null; then
    echo "[unified] ComfyUI exited during startup" >&2
    wait "$COMFY_PID" || true
    exit 1
  fi
  sleep 1
done
curl -fsS http://127.0.0.1:8188/ >/dev/null

echo "[unified] Starting Irodori TTS internally on :8791"
(
  cd /opt/ai-vtuber/voice
  exec /opt/Irodori-TTS/.venv/bin/python -m uvicorn pod_server:app \
    --host 127.0.0.1 --port 8791
) &
VOICE_PID="$!"
pids+=("$VOICE_PID")

echo "[unified] Starting MiniMax H3 bridge internally on :8792"
(
  cd /opt/ai-vtuber/video
  exec python -m uvicorn pod_server:app --host 127.0.0.1 --port 8792
) &
VIDEO_PID="$!"
pids+=("$VIDEO_PID")

wait_for_health() {
  local name="$1"
  local url="$2"
  local timeout="$3"
  local pid="$4"
  local second
  for second in $(seq 1 "$timeout"); do
    if curl -fsS -H "Authorization: Bearer $SHARED_TOKEN" "$url" >/dev/null 2>&1; then
      echo "[unified] $name is ready"
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "[unified] $name exited during startup" >&2
      wait "$pid" || true
      return 1
    fi
    sleep 1
  done
  echo "[unified] $name did not become ready within ${timeout}s" >&2
  return 1
}

SIDECAR_STARTUP_TIMEOUT="${SIDECAR_STARTUP_TIMEOUT:-${RUNPOD_INIT_TIMEOUT:-1200}}"
wait_for_health "Irodori TTS" "http://127.0.0.1:8791/health" "$SIDECAR_STARTUP_TIMEOUT" "$VOICE_PID"
wait_for_health "MiniMax H3 bridge" "http://127.0.0.1:8792/health" "$SIDECAR_STARTUP_TIMEOUT" "$VIDEO_PID"

echo "[unified] Ready: public :8188; internal voice :8791; internal video :8792"
echo "[unified] Shared token is stored at $TOKEN_FILE"
wait -n "${pids[@]}"
