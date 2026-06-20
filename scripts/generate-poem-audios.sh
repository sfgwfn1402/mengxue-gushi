#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
command -v ffmpeg >/dev/null || { echo "需要 ffmpeg: brew install ffmpeg"; exit 1; }
node "$ROOT/scripts/generate-poem-audios.js"
