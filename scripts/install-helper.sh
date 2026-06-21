#!/bin/bash
# Install the Vox menu bar helper as a LaunchAgent.
# Installs VoxHelper.app from assets/Vox.dmg to /Applications.
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_SUPPORT="$HOME/Library/Application Support/Vox"
VENV="$APP_SUPPORT/venv"
AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_DST="$AGENTS_DIR/com.melolabdev.vox-helper.plist"
LOG_DIR="$HOME/Library/Logs/Vox"
LABEL="com.melolabdev.vox-helper"
DMG="$ROOT/assets/Vox.dmg"
MOUNT_POINT="/tmp/vox-dmg-install"

echo "[vox-helper] Installing menu bar helper..."

[[ -f "$DMG" ]] || { echo "[vox-helper] x Vox.dmg not found — run bash scripts/build-apps.sh first."; exit 1; }

mkdir -p "$AGENTS_DIR" "$LOG_DIR"

# ── Install VoxHelper.app from DMG ───────────────────────────────────────────
echo "[vox-helper] Installing VoxHelper.app from Vox.dmg..."
mkdir -p "$MOUNT_POINT"
hdiutil attach "$DMG" -nobrowse -quiet -mountpoint "$MOUNT_POINT"
rm -rf /Applications/VoxHelper.app
cp -r "$MOUNT_POINT/VoxHelper.app" /Applications/VoxHelper.app
hdiutil detach "$MOUNT_POINT" -quiet
rm -df "$MOUNT_POINT"

# ── Write LaunchAgent plist ───────────────────────────────────────────────────
cat > "$PLIST_DST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Applications/VoxHelper.app/Contents/MacOS/VoxHelper</string>
  </array>
  <key>WorkingDirectory</key><string>$APP_SUPPORT</string>
  <key>StandardOutPath</key><string>$LOG_DIR/vox-helper.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/vox-helper-error.log</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
</dict></plist>
EOF
echo "[vox-helper] Plist written to: $PLIST_DST"

# ── Reload LaunchAgent ────────────────────────────────────────────────────────
UID_VAL=$(id -u)
launchctl stop "gui/$UID_VAL/$LABEL" 2>/dev/null || true
sleep 1
launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load "$PLIST_DST"

echo ""
echo "[vox-helper] Vox Helper installed and started."
echo "  Logs: tail -f $LOG_DIR/vox-helper.log"
echo ""
