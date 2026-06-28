#!/bin/bash
# Install the Vox server LaunchAgent.
# Installs VoxServer.app from assets/Vox.dmg to APP_SUPPORT.
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_SUPPORT="$HOME/Library/Application Support/Vox"
VENV="$APP_SUPPORT/venv"
AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_DST="$AGENTS_DIR/com.melolabdev.vox.plist"
LOG_DIR="$HOME/Library/Logs/Vox"
LABEL="com.melolabdev.vox"
DMG="$ROOT/assets/Vox.dmg"
MOUNT_POINT="/tmp/vox-dmg-install"

echo "[vox] Installing server LaunchAgent..."

[[ -f "$VENV/bin/python3" ]] || { echo "[vox] x Venv not found — run bash vox.sh install first."; exit 1; }
[[ -f "$DMG" ]]              || { echo "[vox] x Vox.dmg not found — run bash scripts/build-apps.sh first."; exit 1; }

# ── Ensure directories ────────────────────────────────────────────────────────
mkdir -p "$AGENTS_DIR" "$LOG_DIR" "$APP_SUPPORT"/{api,ui-dist,scripts,voices,outputs,data,input/processed}

# ── Sync server code and UI ───────────────────────────────────────────────────
echo "[vox] Syncing server code to Application Support..."
rsync -a --delete "$ROOT/api/"      "$APP_SUPPORT/api/"
rsync -a --delete "$ROOT/ui-dist/"  "$APP_SUPPORT/ui-dist/"

# ── Write production run.sh ───────────────────────────────────────────────────
cat > "$APP_SUPPORT/scripts/run.sh" <<'RUNSCRIPT'
#!/bin/bash
set -e
APP_SUPPORT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$APP_SUPPORT/venv"
if [[ -f "$APP_SUPPORT/.env" ]]; then
    set -o allexport; source "$APP_SUPPORT/.env"; set +o allexport
fi
HOST="${VOX_HOST:-127.0.0.1}"
PORT="${VOX_PORT:-8000}"

# Exit cleanly if another instance is already listening on the port
if "$VENV/bin/python3" -c "
import socket, sys
s = socket.socket()
s.settimeout(1)
r = s.connect_ex(('127.0.0.1', int('$PORT')))
s.close()
sys.exit(0 if r == 0 else 1)
" 2>/dev/null; then
    echo "[vox] Server already running on port $PORT — exiting." >&2
    exit 0
fi

cd "$APP_SUPPORT"
exec "$VENV/bin/uvicorn" api.main:app --host "$HOST" --port "$PORT"
RUNSCRIPT
chmod +x "$APP_SUPPORT/scripts/run.sh"

# ── Install VoxServer.app from DMG ───────────────────────────────────────────
echo "[vox] Installing VoxServer.app from Vox.dmg..."
mkdir -p "$MOUNT_POINT"
hdiutil attach "$DMG" -nobrowse -quiet -mountpoint "$MOUNT_POINT"
rm -rf "$APP_SUPPORT/VoxServer.app"
cp -r "$MOUNT_POINT/VoxServer.app" "$APP_SUPPORT/VoxServer.app"
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
    <string>$APP_SUPPORT/VoxServer.app/Contents/MacOS/vox-server</string>
  </array>
  <key>WorkingDirectory</key><string>$APP_SUPPORT</string>
  <key>StandardOutPath</key><string>$LOG_DIR/vox.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/vox-error.log</string>
  <key>RunAtLoad</key><false/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>TimeOut</key><integer>120</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>VOX_PORT</key><string>8000</string>
    <key>VOX_DEVICE</key><string>auto</string>
  </dict>
</dict></plist>
EOF
echo "[vox] Plist written to: $PLIST_DST"

# ── Reload LaunchAgent ────────────────────────────────────────────────────────
UID_VAL=$(id -u)
launchctl stop "gui/$UID_VAL/$LABEL" 2>/dev/null || true
sleep 1
launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load "$PLIST_DST"

echo ""
echo "[vox] Server LaunchAgent installed."
echo "  Start:   launchctl kickstart gui/\$(id -u)/$LABEL"
echo "  Stop:    launchctl stop gui/\$(id -u)/$LABEL"
echo "  Logs:    tail -f $LOG_DIR/vox.log"
echo "  NOTE: Start the server from the Vox menu bar icon."
echo ""
