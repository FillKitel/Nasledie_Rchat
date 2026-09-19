#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$ROOT_DIR/.env.local" ]; then
  source "$ROOT_DIR/.env.local"
fi
NODE_BIN="${NODE_BIN:-node}"

if ! command -v "$NODE_BIN" >/dev/null 2>&1; then
  echo "Node.js не найден. Установите Node.js или задайте NODE_BIN=/path/to/node в .env.local." >&2
  exit 1
fi

if ! "$NODE_BIN" -e "require('node:sqlite')" >/dev/null 2>&1; then
  echo "Для Маяка v0.9 нужен Node.js 22.16+ со встроенной SQLite. Проверьте NODE_BIN в .env.local." >&2
  exit 1
fi

if ! (cd "$ROOT_DIR" && "$NODE_BIN" -e "require('pg'); require('qrcode')") >/dev/null 2>&1; then
  echo "Не установлены зависимости. В папке проекта выполните: npx --yes pnpm@11.19.0 install --frozen-lockfile" >&2
  exit 1
fi

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-4173}"

"$NODE_BIN" --no-warnings=ExperimentalWarning "$ROOT_DIR/server/index.js"
