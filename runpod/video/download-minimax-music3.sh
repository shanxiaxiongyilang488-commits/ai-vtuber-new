#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
if [ -f prepare_models.py ]; then
  python prepare_models.py music3
elif [ -f prepare_video_models.py ]; then
  python prepare_video_models.py music3
else
  echo "prepare_models.py was not found." >&2
  exit 1
fi
