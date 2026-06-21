#!/bin/bash
# Remove the VoxForge server LaunchAgent.
# The server stops immediately and will not restart on login.
set -euo pipefail

PLIST_DST="$HOME/Library/LaunchAgents/com.melolabdev.vox.plist"
APP_SUPPORT="$HOME/Library/Application Support/VoxForge"

if [[ ! -f "$PLIST_DST" ]]; then
    echo "[vox] Server LaunchAgent not installed — nothing to do."
    exit 0
fi

echo "[vox] Uninstalling server LaunchAgent…"
launchctl unload "$PLIST_DST" 2>/dev/null || true
rm -f "$PLIST_DST"

echo ""
echo "[vox] Server LaunchAgent removed."
echo ""
echo "  The following are kept and must be removed manually if needed:"
echo "    Data:  $APP_SUPPORT/{voices,outputs,data,input}"
echo "    Logs:  $HOME/Library/Logs/VoxForge/"
echo "    Code:  $APP_SUPPORT/{api,config,scripts}"
echo ""
echo "  Run scripts/install-agent.sh to reinstall."
