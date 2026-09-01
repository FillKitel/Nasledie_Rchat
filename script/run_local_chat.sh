#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLED_NODE="/Users/romanorendarenko/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
NODE_BIN="${NODE_BIN:-node}"

if ! command -v "$NODE_BIN" >/dev/null 2>&1; then
  if [ -x "$BUNDLED_NODE" ]; then
    NODE_BIN="$BUNDLED_NODE"
  else
    echo "Node.js не найден. Установите Node.js или задайте NODE_BIN=/path/to/node." >&2
    exit 1
  fi
fi

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-4173}"

"$NODE_BIN" "$ROOT_DIR/server/index.js"
