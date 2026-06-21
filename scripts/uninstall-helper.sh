#!/bin/bash
# Remove the Vox menu bar helper LaunchAgent and app bundle.
# Kills the running helper if active, then removes the agent and VoxHelper.app.
set -eo pipefail

LABEL="com.melolabdev.vox-helper"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
APP_SUPPORT="$HOME/Library/Application Support/Vox"

if [[ ! -f "$PLIST_DST" ]]; then
    echo "[vox-helper] Helper not installed — nothing to do."
    exit 0
fi

echo "[vox-helper] Uninstalling menu bar helper…"

# Stop and unload the LaunchAgent (suppresses KeepAlive restart)
UID_VAL=$(id -u)
launchctl stop "gui/$UID_VAL/$LABEL" 2>/dev/null || true
launchctl unload "$PLIST_DST" 2>/dev/null || true
rm -f "$PLIST_DST"

# Kill any remaining VoxHelper process and wait for it to exit
if pgrep -x "VoxHelper" &>/dev/null; then
    pkill -x "VoxHelper" 2>/dev/null || true
    for i in {1..10}; do
        pgrep -x "VoxHelper" &>/dev/null || break
        sleep 0.3
    done
fi

# Remove VoxHelper.app from /Applications
if [[ -d "/Applications/VoxHelper.app" ]]; then
    rm -rf "/Applications/VoxHelper.app"
    echo "[vox-helper] Removed VoxHelper.app from /Applications"
fi


echo ""
echo "[vox-helper] Helper uninstalled."
echo ""
echo "  Log files kept at: $HOME/Library/Logs/Vox/"
echo "  Venv kept at:      $APP_SUPPORT/venv"
echo ""
echo "  Run scripts/install-helper.sh to reinstall."
