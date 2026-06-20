#!/bin/bash
# Remove the VoxForge LaunchAgent from this machine.
# The server will stop immediately and will not restart on login.
set -euo pipefail

PLIST_DST="$HOME/Library/LaunchAgents/com.melolabdev.vox.plist"
LABEL="com.melolabdev.vox"

if [[ ! -f "$PLIST_DST" ]]; then
  echo "[vox] LaunchAgent not installed — nothing to do."
  exit 0
fi

echo "[vox] Uninstalling LaunchAgent…"

launchctl unload "$PLIST_DST" 2>/dev/null || true
rm -f "$PLIST_DST"

echo "[vox] LaunchAgent removed."
echo "      Log files are kept at: \$HOME/Library/Logs/VoxForge/"
echo "      Run scripts/install-agent.sh to reinstall."
