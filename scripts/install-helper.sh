#!/bin/bash
# Install the Vox menu bar helper as a LaunchAgent.
# If assets/Vox.dmg exists (signed build), installs VoxHelper.app to /Applications.
# Falls back to running python3 directly from the venv when no DMG is present.
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

echo "[vox-helper] Installing menu bar helper…"

[[ -f "$VENV/bin/python3" ]] || { echo "[vox-helper] ✗ Venv not found — run bash vox.sh install first."; exit 1; }

mkdir -p "$AGENTS_DIR" "$LOG_DIR" "$APP_SUPPORT/menubar"

# ── Install Python dependencies ───────────────────────────────────────────────
echo "[vox-helper] Installing Python dependencies (rumps, psutil)…"
"$VENV/bin/pip" install --quiet rumps psutil pyobjc-framework-Cocoa

# ── Copy helper script to permanent location ──────────────────────────────────
echo "[vox-helper] Copying helper script to $APP_SUPPORT/menubar/..."
cp "$ROOT/menubar/vox_helper.py" "$APP_SUPPORT/menubar/vox_helper.py"

# ── Install VoxHelper.app from DMG or fall back to direct python3 ─────────────
if [[ -f "$DMG" ]]; then
    echo "[vox-helper] DMG found — installing VoxHelper.app to /Applications…"
    mkdir -p "$MOUNT_POINT"
    hdiutil attach "$DMG" -nobrowse -quiet -mountpoint "$MOUNT_POINT"
    rm -rf /Applications/VoxHelper.app
    cp -r "$MOUNT_POINT/VoxHelper.app" /Applications/VoxHelper.app
    hdiutil detach "$MOUNT_POINT" -quiet
    rm -df "$MOUNT_POINT"
    echo "[vox-helper] VoxHelper.app installed to /Applications"
    PROGRAM_ARG="/Applications/VoxHelper.app/Contents/MacOS/vox-helper"
else
    echo "[vox-helper] No DMG found — using python3 directly (run build-apps.sh to build signed app)"
    PROGRAM_ARG="$VENV/bin/python3"
fi

# ── Write LaunchAgent plist ───────────────────────────────────────────────────
cat > "$PLIST_DST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PROGRAM_ARG</string>
$([ "$PROGRAM_ARG" != "/Applications/VoxHelper.app/Contents/MacOS/vox-helper" ] && echo "    <string>$APP_SUPPORT/menubar/vox_helper.py</string>")
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
echo "[vox-helper] Menu bar helper installed and started."
echo ""
echo "  The Vox icon will appear in your menu bar within a few seconds."
echo "  Logs: tail -f $LOG_DIR/vox-helper.log"
echo ""
echo "  To uninstall: bash scripts/uninstall-helper.sh"
