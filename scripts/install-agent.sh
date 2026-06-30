#!/bin/bash
# Install the Vox server LaunchAgent.
# Installs VoxServer.app from assets/Vox.dmg to /Applications/Vox.
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/install-log.sh"
setup_install_log "scripts/install-agent.sh"

APP_SUPPORT="$HOME/Library/Application Support/Vox"
APP_DIR="/Applications/Vox"
VENV="$APP_SUPPORT/venv"
AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_DST="$AGENTS_DIR/com.noelmom.vox.plist"
LOG_DIR="$HOME/Library/Logs/Vox"
LABEL="com.noelmom.vox"
LEGACY_LABEL="com.melolabdev.vox"
LEGACY_PLIST="$AGENTS_DIR/$LEGACY_LABEL.plist"
DMG="$ROOT/assets/Vox.dmg"
MOUNT_POINT=""
PKG_MODE=false
FORCE_APP=false
NO_RELOAD=false

for arg in "$@"; do
  case "$arg" in
    --pkg-mode) PKG_MODE=true ;;
    --force-app) FORCE_APP=true ;;
    --no-reload) NO_RELOAD=true ;;
    *) echo "[vox] Unknown argument: $arg"; exit 1 ;;
  esac
done

run_admin() {
  if [[ "$EUID" -eq 0 ]]; then
    "$@"
  elif [[ -t 0 ]]; then
    sudo "$@"
  else
    sudo -n "$@" 2>/dev/null || {
      echo "[vox] x Admin permission required to update $APP_DIR. Run this command in Terminal so macOS can ask for your password."
      exit 1
    }
  fi
}

app_version() {
  [[ -f "$1/Contents/Info.plist" ]] || return 0
  /usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "$1/Contents/Info.plist" 2>/dev/null || true
}

app_build_commit() {
  [[ -f "$1/Contents/Info.plist" ]] || return 0
  /usr/libexec/PlistBuddy -c "Print VoxBuildCommit" "$1/Contents/Info.plist" 2>/dev/null || true
}

echo "[vox] Installing server LaunchAgent..."

[[ -f "$VENV/bin/python3" ]] || { echo "[vox] x Venv not found — run bash vox.sh install first."; exit 1; }
if ! $PKG_MODE; then
  [[ -f "$DMG" ]] || { echo "[vox] x Vox.dmg not found — run bash scripts/build-apps.sh first."; exit 1; }
fi

# ── Ensure directories ────────────────────────────────────────────────────────
install_step 1 5 "Preparing server directories"
mkdir -p "$AGENTS_DIR" "$LOG_DIR" "$APP_SUPPORT"/{api,ui-dist,scripts,voices,outputs,data,input/processed}
UID_VAL=$(id -u)
if [[ -f "$LEGACY_PLIST" ]]; then
  echo "[vox] Removing legacy LaunchAgent: $LEGACY_LABEL"
  launchctl stop "gui/$UID_VAL/$LEGACY_LABEL" 2>/dev/null || true
  launchctl unload "$LEGACY_PLIST" 2>/dev/null || true
  rm -f "$LEGACY_PLIST"
fi

# ── Sync server code and UI ───────────────────────────────────────────────────
install_step 2 5 "Syncing server code and web UI"
echo "[vox] Syncing server code to Application Support..."
rsync -a --delete "$ROOT/api/"      "$APP_SUPPORT/api/"
rsync -a --delete "$ROOT/ui-dist/"  "$APP_SUPPORT/ui-dist/"
[[ -f "$ROOT/VERSION" ]] && ditto --norsrc "$ROOT/VERSION" "$APP_SUPPORT/VERSION"
[[ -f "$ROOT/build_info.json" ]] && ditto --norsrc "$ROOT/build_info.json" "$APP_SUPPORT/build_info.json"

# ── Write production run.sh ───────────────────────────────────────────────────
install_step 3 5 "Writing server control scripts"
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
PID_FILE="$APP_SUPPORT/vox-server.pid"

if [[ -f "$PID_FILE" ]]; then
    old_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
        echo "[vox] Server already running with PID $old_pid — exiting." >&2
        exit 0
    fi
    rm -f "$PID_FILE"
fi

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

echo $$ > "$PID_FILE"
cleanup_pid() {
    if [[ "$(cat "$PID_FILE" 2>/dev/null || true)" == "$$" ]]; then
        rm -f "$PID_FILE"
    fi
}
trap cleanup_pid EXIT

cd "$APP_SUPPORT"
exec "$VENV/bin/uvicorn" api.main:app --host "$HOST" --port "$PORT" --no-access-log
RUNSCRIPT
chmod +x "$APP_SUPPORT/scripts/run.sh"

cat > "$APP_SUPPORT/scripts/uninstall.sh" <<RUNSCRIPT
#!/bin/bash
set -e
exec /bin/bash "$ROOT/vox.sh" uninstall --yes "\$@"
RUNSCRIPT
chmod +x "$APP_SUPPORT/scripts/uninstall.sh"

cat > "$APP_SUPPORT/scripts/update.sh" <<RUNSCRIPT
#!/bin/bash
set -e
exec /bin/bash "$ROOT/vox.sh" update --yes "\$@"
RUNSCRIPT
chmod +x "$APP_SUPPORT/scripts/update.sh"

if $PKG_MODE; then
  install_step 4 5 "Using packaged VoxServer.app"
  echo "[vox] Using packaged VoxServer.app at $APP_DIR/VoxServer.app..."
  [[ -d "$APP_DIR/VoxServer.app" ]] || { echo "[vox] x VoxServer.app not found at $APP_DIR/VoxServer.app"; exit 1; }
else
  # ── Install VoxServer.app from DMG ─────────────────────────────────────────
  install_step 4 5 "Installing VoxServer.app"
  echo "[vox] Installing VoxServer.app from Vox.dmg..."
  MOUNT_POINT="$(mktemp -d "${TMPDIR:-/tmp}/vox-dmg-server.XXXXXX")"
  cleanup_dmg_mount() {
    hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
    rmdir "$MOUNT_POINT" 2>/dev/null || true
  }
  trap cleanup_dmg_mount EXIT
  hdiutil attach "$DMG" -nobrowse -quiet -mountpoint "$MOUNT_POINT"

  INSTALLED_APP="$APP_DIR/VoxServer.app"
  BUNDLED_APP="$MOUNT_POINT/VoxServer.app"
  INSTALLED_VERSION="$(app_version "$INSTALLED_APP")"
  BUNDLED_VERSION="$(app_version "$BUNDLED_APP")"
  INSTALLED_BUILD="$(app_build_commit "$INSTALLED_APP")"
  BUNDLED_BUILD="$(app_build_commit "$BUNDLED_APP")"

  if ! $FORCE_APP \
    && [[ -n "$INSTALLED_VERSION" && -n "$BUNDLED_VERSION" && "$INSTALLED_VERSION" == "$BUNDLED_VERSION" ]] \
    && [[ -z "$BUNDLED_BUILD" || "$INSTALLED_BUILD" == "$BUNDLED_BUILD" ]]; then
    echo "[vox] VoxServer.app already at v$INSTALLED_VERSION — skipping app replacement."
  else
    if $FORCE_APP; then
      echo "[vox] Force installing VoxServer.app..."
    elif [[ -n "$INSTALLED_BUILD" && -n "$BUNDLED_BUILD" && "$INSTALLED_BUILD" != "$BUNDLED_BUILD" ]]; then
      echo "[vox] Updating VoxServer.app build $INSTALLED_BUILD → $BUNDLED_BUILD..."
    elif [[ -n "$INSTALLED_VERSION" && -n "$BUNDLED_VERSION" ]]; then
      echo "[vox] Updating VoxServer.app v$INSTALLED_VERSION → v$BUNDLED_VERSION..."
    else
      echo "[vox] Installing VoxServer.app..."
    fi
    launchctl stop "gui/$UID_VAL/$LABEL" 2>/dev/null || true
    sleep 1
    launchctl unload "$PLIST_DST" 2>/dev/null || true
    run_admin mkdir -p "$APP_DIR"
    if [[ -d "$INSTALLED_APP" ]]; then
      xattr -cr "$INSTALLED_APP" 2>/dev/null || true
    fi
    run_admin rm -rf "$INSTALLED_APP"
    run_admin ditto "$BUNDLED_APP" "$INSTALLED_APP"
    chown -R "$USER":staff "$INSTALLED_APP" 2>/dev/null || true
  fi

  cleanup_dmg_mount
  trap - EXIT
fi

[[ -x "$APP_DIR/VoxServer.app/Contents/MacOS/vox-server" ]] || {
  echo "[vox] x VoxServer.app is missing its executable at $APP_DIR/VoxServer.app/Contents/MacOS/vox-server"
  exit 1
}

# ── Write LaunchAgent plist ───────────────────────────────────────────────────
install_step 5 5 "Installing server LaunchAgent"
cat > "$PLIST_DST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$APP_DIR/VoxServer.app/Contents/MacOS/vox-server</string>
  </array>
  <key>WorkingDirectory</key><string>$APP_SUPPORT</string>
  <key>StandardOutPath</key><string>$LOG_DIR/vox.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/vox-error.log</string>
  <key>RunAtLoad</key><true/>
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
if $NO_RELOAD; then
  echo "[vox] --no-reload set; LaunchAgent plist updated but not reloaded."
else
  launchctl stop "gui/$UID_VAL/$LABEL" 2>/dev/null || true
  sleep 1
  launchctl unload "$PLIST_DST" 2>/dev/null || true
  launchctl load "$PLIST_DST"
fi

echo ""
echo "[vox] Server LaunchAgent installed."
echo "  Start:   launchctl kickstart gui/\$(id -u)/$LABEL"
echo "  Stop:    launchctl stop gui/\$(id -u)/$LABEL"
echo "  Logs:    tail -f $LOG_DIR/vox.log"
echo "  NOTE: Start the server from the Vox menu bar icon."
echo ""
