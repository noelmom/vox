#!/bin/bash
# Install the VoxForge menu bar helper as a LaunchAgent.
# The helper auto-starts on login and provides a menu bar icon
# to start/stop the server, view stats, and open the web UI.
#
# Run after install-agent.sh (server agent) and setup.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.venv"
PLIST_SRC="$ROOT/launchagent/com.melolabdev.vox-helper.plist"
AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_DST="$AGENTS_DIR/com.melolabdev.vox-helper.plist"
LOG_DIR="$HOME/Library/Logs/VoxForge"
LABEL="com.melolabdev.vox-helper"

echo "[vox-helper] Installing menu bar helper…"

# 1. Ensure rumps and psutil are installed in the venv
echo "[vox-helper] Installing Python dependencies (rumps, psutil)…"
"$VENV/bin/pip" install --quiet rumps psutil

# Create a named symlink so macOS shows 'vox-helper' in Login Items / Activity Monitor
# instead of the generic 'Python3' label.
ln -sf "$VENV/bin/python3" "$VENV/bin/vox-helper"

# 2. Create required directories
mkdir -p "$AGENTS_DIR"
mkdir -p "$LOG_DIR"

# 3. Write the final plist with real paths substituted
sed \
  -e "s|VOX_PROJECT_ROOT|$ROOT|g" \
  -e "s|VOX_LOG_DIR|$LOG_DIR|g" \
  "$PLIST_SRC" > "$PLIST_DST"

echo "[vox-helper] Plist written to: $PLIST_DST"

# 4. Unload any previous version
launchctl unload "$PLIST_DST" 2>/dev/null || true

# 5. Load — RunAtLoad=true means the helper starts immediately
launchctl load "$PLIST_DST"

echo ""
echo "[vox-helper] Menu bar helper installed and started."
echo ""
echo "  The Vox icon will appear in your menu bar within a few seconds."
echo "  Logs: tail -f $LOG_DIR/vox-helper.log"
echo ""
echo "  To uninstall: bash scripts/uninstall-helper.sh"
