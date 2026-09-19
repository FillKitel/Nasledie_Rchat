#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$ROOT_DIR/.env.local" ]; then
  source "$ROOT_DIR/.env.local"
fi
APP_DIR="$ROOT_DIR/clients/rchat_app"
FLUTTER_BIN="${FLUTTER_BIN:-flutter}"
APP_NAME="rchat_app"
APP_BUNDLE="$APP_DIR/build/macos/Build/Products/Debug/$APP_NAME.app"

if [ -n "${FLUTTER_USER_HOME:-}" ]; then
  export HOME="$FLUTTER_USER_HOME"
fi
if [ -n "${PUB_CACHE:-}" ]; then
  export PUB_CACHE
fi
export FLUTTER_SUPPRESS_ANALYTICS=true
export CI=true

if ! command -v "$FLUTTER_BIN" >/dev/null 2>&1; then
  echo "Flutter не найден. Установите Flutter или задайте FLUTTER_BIN=/path/to/flutter в .env.local." >&2
  exit 1
fi

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
