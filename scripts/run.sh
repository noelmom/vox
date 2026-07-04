#!/bin/bash
# Start the Vox server manually in the foreground (dev / troubleshooting).
# Uses the permanent venv and .env from Application Support,
# but serves the API code from this project folder (live reload enabled).
#
# For production use: bash scripts/install-agent.sh, then launchctl kickstart gui/$(id -u)/com.noelmom.vox
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_SUPPORT="$HOME/Library/Application Support/Vox"
VENV="$APP_SUPPORT/venv"

if [[ ! -f "$VENV/bin/python" ]]; then
    echo "[vox] Virtual environment not found at $VENV"
    echo "[vox] Run: bash setup.sh"
    exit 1
fi

# Load .env from permanent location
if [[ -f "$APP_SUPPORT/.env" ]]; then
    set -o allexport
    source "$APP_SUPPORT/.env"
    set +o allexport
fi

HOST="${VOX_HOST:-127.0.0.1}"
PORT="${VOX_PORT:-8000}"
PID_FILE="$APP_SUPPORT/vox-server.pid"

if [[ -f "$PID_FILE" ]]; then
    old_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
        echo "[vox] Server already running with PID $old_pid — exiting."
        exit 0
    fi
    rm -f "$PID_FILE"
fi

echo $$ > "$PID_FILE"
cleanup_pid() {
    if [[ "$(cat "$PID_FILE" 2>/dev/null || true)" == "$$" ]]; then
        rm -f "$PID_FILE"
    fi
}
trap cleanup_pid EXIT

echo "[vox] Starting (dev mode) on http://${HOST}:${PORT}"
echo "[vox] API docs: http://localhost:${PORT}/docs"
echo "[vox] Serving from: $ROOT"
echo ""

cd "$ROOT"
exec "$VENV/bin/uvicorn" api.main:app --host "$HOST" --port "$PORT" --reload --no-access-log
