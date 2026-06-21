#!/bin/bash
# Pull the latest changes and restart both agents.
#
# Git repo:   bash scripts/update.sh           — pulls from origin/<branch>
# Zip install: bash scripts/update.sh /path/to/new-vox-folder  — copies files in place
#
# Safe to re-run — install scripts unload before reloading.
set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

info()    { echo -e "${BOLD}[vox]${RESET} $*"; }
success() { echo -e "${GREEN}[vox] ✓ $*${RESET}"; }
warn()    { echo -e "${YELLOW}[vox] ⚠ $*${RESET}"; }
fail()    { echo -e "${RED}[vox] ✗ $*${RESET}"; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.venv"
ZIP_SRC="${1:-}"

cd "$ROOT"

# ── Stop agents before touching files ─────────────────────────────────────────
info "Stopping agents…"
launchctl stop com.melolabdev.vox        2>/dev/null || true
launchctl stop com.melolabdev.vox-helper 2>/dev/null || true

# ── Pull or copy new files ────────────────────────────────────────────────────
if [[ -n "$ZIP_SRC" ]]; then
  # Zip / manual install path — caller passes the extracted folder
  [[ -d "$ZIP_SRC" ]] || fail "Source folder not found: $ZIP_SRC"
  info "Copying files from $ZIP_SRC…"
  # Preserve .env, data/, voices/, outputs/, .venv/ — copy everything else
  rsync -a --exclude='.env' \
           --exclude='.venv/' \
           --exclude='data/' \
           --exclude='voices/' \
           --exclude='outputs/' \
           --exclude='input/' \
           --exclude='VoxHelper.app/' \
           "$ZIP_SRC/" "$ROOT/"
  success "Files updated from zip"
elif git -C "$ROOT" rev-parse --git-dir &>/dev/null; then
  # Git repo path
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  info "Pulling latest changes from origin/$BRANCH…"
  BEFORE="$(git rev-parse --short HEAD)"
  git pull origin "$BRANCH"
  AFTER="$(git rev-parse --short HEAD)"
  if [[ "$BEFORE" == "$AFTER" ]]; then
    warn "Already up to date ($AFTER) — reinstalling agents anyway."
  else
    success "Updated $BEFORE → $AFTER"
  fi
else
  warn "Not a git repo and no source folder provided."
  warn "Usage (zip install): bash scripts/update.sh /path/to/extracted-vox"
  warn "Proceeding with dependency sync and agent reinstall only."
fi

# ── Python dependencies ───────────────────────────────────────────────────────
if [[ ! -f "$VENV/bin/pip" ]]; then
  warn "Virtual environment not found — running setup.sh first…"
  bash "$ROOT/setup.sh"
else
  info "Syncing Python dependencies…"
  "$VENV/bin/pip" install --quiet -r "$ROOT/requirements.txt"
  success "Dependencies up to date"
fi

# ── Re-register agents ────────────────────────────────────────────────────────
info "Reinstalling server LaunchAgent…"
bash "$ROOT/scripts/install-agent.sh"

info "Reinstalling menu bar helper…"
bash "$ROOT/scripts/install-helper.sh"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}Vox updated successfully.${RESET}"
echo ""
if git -C "$ROOT" rev-parse --git-dir &>/dev/null; then
  echo "  Branch:  $(git rev-parse --abbrev-ref HEAD)"
  echo "  Version: $(git rev-parse --short HEAD)"
fi
echo ""
