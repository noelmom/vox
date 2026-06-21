#!/bin/bash
# Remove the Vox menu bar helper LaunchAgent and app bundle.
# Kills the running helper if active, then removes the agent and VoxHelper.app.
set -euo pipefail

LABEL="com.melolabdev.vox-helper"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
APP_SUPPORT="$HOME/Library/Application Support/Vox"

if [[ ! -f "$PLIST_DST" ]]; then
    echo "[vox-helper] Helper not installed — nothing to do."
    exit 0
fi

echo "[vox-helper] Uninstalling menu bar helper…"

# Stop the running process (suppresses KeepAlive restart), then unload
UID_VAL=$(id -u)
launchctl stop "gui/$UID_VAL/$LABEL" 2>/dev/null || true
sleep 1
launchctl unload "$PLIST_DST" 2>/dev/null || true
rm -f "$PLIST_DST"

# Remove helper script from permanent location
if [[ -f "$APP_SUPPORT/menubar/vox_helper.py" ]]; then
    rm -f "$APP_SUPPORT/menubar/vox_helper.py"
    echo "[vox-helper] Removed helper script from Application Support"
fi

echo ""
echo "[vox-helper] Helper uninstalled."
echo ""
echo "  Log files kept at: $HOME/Library/Logs/Vox/"
echo "  Venv kept at:      $APP_SUPPORT/venv"
echo ""
echo "  Run scripts/install-helper.sh to reinstall."
