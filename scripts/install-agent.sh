#!/bin/bash
# Install the VoxForge LaunchAgent so macOS can manage the server.
# Run once after cloning. Re-run after moving the project folder.
#
# After install, control the server with:
#   launchctl start  com.melolabdev.vox   → start
#   launchctl stop   com.melolabdev.vox   → stop
#   launchctl kickstart -k gui/$(id -u)/com.melolabdev.vox  → restart
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_SRC="$ROOT/launchagent/com.melolabdev.vox.plist"
AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_DST="$AGENTS_DIR/com.melolabdev.vox.plist"
LOG_DIR="$HOME/Library/Logs/VoxForge"
LABEL="com.melolabdev.vox"

echo "[vox] Installing LaunchAgent…"

# 1. Create the log directory
mkdir -p "$LOG_DIR"

# 2. Write the final plist, substituting real paths into the template
sed \
  -e "s|VOX_PROJECT_ROOT|$ROOT|g" \
  -e "s|VOX_LOG_DIR|$LOG_DIR|g" \
  "$PLIST_SRC" > "$PLIST_DST"

echo "[vox] Plist written to: $PLIST_DST"

# 3. Unload any previously loaded version (ignore error if not loaded)
launchctl unload "$PLIST_DST" 2>/dev/null || true

# 4. Load the agent (registers it with launchd; does NOT start it yet because RunAtLoad=false)
launchctl load "$PLIST_DST"

echo ""
echo "[vox] LaunchAgent installed successfully."
echo ""
echo "  Start:   launchctl start  $LABEL"
echo "  Stop:    launchctl stop   $LABEL"
echo "  Restart: launchctl kickstart -k gui/\$(id -u)/$LABEL"
echo "  Logs:    tail -f $LOG_DIR/vox.log"
echo "  Errors:  tail -f $LOG_DIR/vox-error.log"
echo ""
echo "  NOTE: The server does NOT start automatically on login."
echo "  When shipping the .app, set RunAtLoad=true in the plist"
echo "  and re-run this script. See BACKLOG.md for details."
