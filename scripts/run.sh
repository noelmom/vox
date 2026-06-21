#!/bin/bash
# Start the Vox API server manually in the foreground.
# Use this for development or troubleshooting — not for production.
# Production: bash scripts/install-agent.sh, then launchctl start com.melolabdev.vox
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_SUPPORT="$HOME/Library/Application Support/VoxForge"
VENV="$APP_SUPPORT/venv"

if [[ ! -f "$VENV/bin/python" ]]; then
    echo "[vox] Virtual environment not found at $VENV"
    echo "[vox] Run: bash setup.sh"
    exit 1
fi

# Load .env if present
if [[ -f "$ROOT/.env" ]]; then
    set -o allexport
    source "$ROOT/.env"
    set +o allexport
fi

HOST="${VOX_HOST:-0.0.0.0}"
PORT="${VOX_PORT:-8000}"

echo "[vox] Starting on http://${HOST}:${PORT}"
echo "[vox] API docs: http://localhost:${PORT}/docs"
echo ""

cd "$ROOT"
exec "$VENV/bin/uvicorn" api.main:app --host "$HOST" --port "$PORT" --reload
