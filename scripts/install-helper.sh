#!/bin/bash
# Install the Vox menu bar helper as a LaunchAgent.
# The helper auto-starts on login and provides a menu bar icon
# to start/stop the server, view stats, and open the web UI.
#
# Run after install-agent.sh and setup.sh.
#
# NOTE: Currently runs python3 directly from the permanent venv.
# Once VoxHelper.app is code-signed with a Developer ID certificate,
# revert to the .app bundle approach — see BACKLOG.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_SUPPORT="$HOME/Library/Application Support/Vox"
VENV="$APP_SUPPORT/venv"
PLIST_SRC="$ROOT/launchagent/com.melolabdev.vox-helper.plist"
AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_DST="$AGENTS_DIR/com.melolabdev.vox-helper.plist"
LOG_DIR="$HOME/Library/Logs/Vox"
LABEL="com.melolabdev.vox-helper"

echo "[vox-helper] Installing menu bar helper…"

# 1. Verify venv exists (setup.sh must have run first)
if [[ ! -f "$VENV/bin/python" ]]; then
    echo "[vox-helper] ✗ Virtual environment not found at $VENV"
    echo "             Run 'bash setup.sh' first."
    exit 1
fi

# 2. Install Python dependencies into the permanent venv
echo "[vox-helper] Installing Python dependencies (rumps, psutil)…"
"$VENV/bin/pip" install --quiet rumps psutil pyobjc-framework-Cocoa

# 3. Create required directories
mkdir -p "$AGENTS_DIR"
mkdir -p "$LOG_DIR"
mkdir -p "$APP_SUPPORT/menubar"

# 4. Copy helper script to permanent location
echo "[vox-helper] Copying helper script to $APP_SUPPORT/menubar/…"
cp "$ROOT/menubar/vox_helper.py" "$APP_SUPPORT/menubar/vox_helper.py"

# 5. Write the final plist with real paths substituted
sed \
  -e "s|VOX_APP_SUPPORT|$APP_SUPPORT|g" \
  -e "s|VOX_LOG_DIR|$LOG_DIR|g" \
  "$PLIST_SRC" > "$PLIST_DST"

echo "[vox-helper] Plist written to: $PLIST_DST"

# 6. Stop any running instance before reloading
UID_VAL=$(id -u)
launchctl stop "gui/$UID_VAL/$LABEL" 2>/dev/null || true
sleep 1
launchctl unload "$PLIST_DST" 2>/dev/null || true

# 7. Load — RunAtLoad=true means the helper starts immediately
launchctl load "$PLIST_DST"

echo ""
echo "[vox-helper] Menu bar helper installed and started."
echo ""
echo "  The Vox icon will appear in your menu bar within a few seconds."
echo "  Helper script: $APP_SUPPORT/menubar/vox_helper.py"
echo "  Logs:          tail -f $LOG_DIR/vox-helper.log"
echo ""
echo "  To uninstall: bash scripts/uninstall-helper.sh"
