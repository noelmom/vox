#!/bin/bash
# Start the Vox server manually in the foreground (dev / troubleshooting).
# Uses the permanent venv and .env from Application Support,
# but serves the API code from this project folder (live reload enabled).
#
# For production use: bash scripts/install-agent.sh, then launchctl start com.melolabdev.vox
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_SUPPORT="$HOME/Library/Application Support/VoxForge"
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

HOST="${VOX_HOST:-0.0.0.0}"
PORT="${VOX_PORT:-8000}"

echo "[vox] Starting (dev mode) on http://${HOST}:${PORT}"
echo "[vox] API docs: http://localhost:${PORT}/docs"
echo "[vox] Serving from: $ROOT"
echo ""

cd "$ROOT"
exec "$VENV/bin/uvicorn" api.main:app --host "$HOST" --port "$PORT" --reload
