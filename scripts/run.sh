#!/bin/bash
# Start the Vox API server using the local venv.
# Run setup.sh first if .venv does not exist.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.venv"

if [[ ! -d "$VENV" ]]; then
    echo "[vox] .venv not found. Run: bash setup.sh"
    exit 1
fi

# Load .env if present so VOX_HOST / VOX_PORT overrides work
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
