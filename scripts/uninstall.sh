#!/bin/bash
# Unified Vox uninstaller.
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_SUPPORT="$HOME/Library/Application Support/Vox"
LOG_DIR="$HOME/Library/Logs/Vox"

REMOVE_AGENT=false
REMOVE_HELPER=false
REMOVE_DATA=false
YES=false

usage() {
  cat <<'EOF'
Usage: bash scripts/uninstall.sh [flags]

Flags:
  --all       Remove server and helper agents/apps
  --agent     Remove server agent/app only
  --helper    Remove helper agent/app only
  --data      Also remove user data, outputs, voices, venv, synced code, and logs
  --yes       Skip confirmation prompts
  --help      Show this help
EOF
}

confirm() {
  if $YES; then return 0; fi
  printf "%s [y/N] " "$1"
  read -r answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all) REMOVE_AGENT=true; REMOVE_HELPER=true ;;
    --agent) REMOVE_AGENT=true ;;
    --helper) REMOVE_HELPER=true ;;
    --data) REMOVE_DATA=true ;;
    --yes|-y) YES=true ;;
    --help|-h) usage; exit 0 ;;
    *) echo "[vox] Unknown argument: $1"; usage; exit 1 ;;
  esac
  shift
done

if ! $REMOVE_AGENT && ! $REMOVE_HELPER; then
  if $YES; then
    REMOVE_AGENT=true
    REMOVE_HELPER=true
  else
    confirm "Remove server agent/app?" && REMOVE_AGENT=true
    confirm "Remove helper agent/app?" && REMOVE_HELPER=true
    confirm "Remove user data too? This deletes voices, outputs, database, venv, and logs." && REMOVE_DATA=true
  fi
fi

if ! $REMOVE_AGENT && ! $REMOVE_HELPER && ! $REMOVE_DATA; then
  echo "[vox] Nothing selected — cancelled."
  exit 0
fi

if $REMOVE_AGENT; then
  bash "$ROOT/scripts/uninstall-agent.sh"
fi

if $REMOVE_HELPER; then
  bash "$ROOT/scripts/uninstall-helper.sh"
fi

if $REMOVE_DATA; then
  echo "[vox] Removing Vox user data…"
  rm -rf "$APP_SUPPORT/voices" \
         "$APP_SUPPORT/outputs" \
         "$APP_SUPPORT/data" \
         "$APP_SUPPORT/input" \
         "$APP_SUPPORT/venv" \
         "$APP_SUPPORT/api" \
         "$APP_SUPPORT/ui-dist" \
         "$APP_SUPPORT/scripts" \
         "$APP_SUPPORT/.env" \
         "$LOG_DIR"
  rmdir "$APP_SUPPORT" 2>/dev/null || true
fi

echo "[vox] Uninstall complete."
