#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/clients/rchat_app"
FLUTTER_BIN="/Users/romanorendarenko/Documents/Codex/.tools/flutter/bin/flutter"
APP_NAME="rchat_app"
APP_BUNDLE="$APP_DIR/build/macos/Build/Products/Debug/$APP_NAME.app"

export HOME="/Users/romanorendarenko/Documents/Codex/.home"
export PUB_CACHE="/Users/romanorendarenko/Documents/Codex/.pub-cache"
export FLUTTER_SUPPRESS_ANALYTICS=true
export CI=true

stop_app() {
  pkill -x "$APP_NAME" >/dev/null 2>&1 || true
}

build_app() {
  (cd "$APP_DIR" && "$FLUTTER_BIN" build macos --debug)
}

open_app() {
  /usr/bin/open "$APP_BUNDLE"
}

case "$MODE" in
  run)
    stop_app
    build_app
    open_app
    ;;
  --verify|verify)
    stop_app
    build_app
    open_app
    sleep 1
    pgrep -x "$APP_NAME" >/dev/null
    ;;
  --logs|logs)
    stop_app
    build_app
    open_app
    /usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
    ;;
  *)
    echo "usage: $0 [run|--verify|--logs]" >&2
    exit 2
    ;;
esac
