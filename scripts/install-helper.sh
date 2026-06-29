#!/bin/bash
# Install the Vox menu bar helper as a LaunchAgent.
# Installs VoxHelper.app from assets/Vox.dmg to /Applications/Vox.
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/install-log.sh"
setup_install_log "scripts/install-helper.sh"

APP_SUPPORT="$HOME/Library/Application Support/Vox"
APP_DIR="/Applications/Vox"
VENV="$APP_SUPPORT/venv"
AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_DST="$AGENTS_DIR/com.melolabdev.vox-helper.plist"
LOG_DIR="$HOME/Library/Logs/Vox"
LABEL="com.melolabdev.vox-helper"
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
    *) echo "[vox-helper] Unknown argument: $arg"; exit 1 ;;
  esac
done

run_admin() {
  if [[ "$EUID" -eq 0 ]]; then
    "$@"
  elif [[ -t 0 ]]; then
    sudo "$@"
  else
    sudo -n "$@" 2>/dev/null || {
      echo "[vox-helper] x Admin permission required to update $APP_DIR. Run this command in Terminal so macOS can ask for your password."
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

echo "[vox-helper] Installing menu bar helper..."

if ! $PKG_MODE; then
  [[ -f "$DMG" ]] || { echo "[vox-helper] x Vox.dmg not found — run bash scripts/build-apps.sh first."; exit 1; }
fi

install_step 1 3 "Preparing helper directories"
mkdir -p "$AGENTS_DIR" "$LOG_DIR"

if $PKG_MODE; then
  install_step 2 3 "Using packaged VoxHelper.app"
  echo "[vox-helper] Using packaged VoxHelper.app at $APP_DIR/VoxHelper.app..."
  [[ -d "$APP_DIR/VoxHelper.app" ]] || { echo "[vox-helper] x VoxHelper.app not found at $APP_DIR/VoxHelper.app"; exit 1; }
else
  # ── Install VoxHelper.app from DMG ─────────────────────────────────────────
  install_step 2 3 "Installing VoxHelper.app"
  echo "[vox-helper] Installing VoxHelper.app from Vox.dmg..."
  MOUNT_POINT="$(mktemp -d "${TMPDIR:-/tmp}/vox-dmg-helper.XXXXXX")"
  cleanup_dmg_mount() {
    hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
    rmdir "$MOUNT_POINT" 2>/dev/null || true
  }
  trap cleanup_dmg_mount EXIT
  hdiutil attach "$DMG" -nobrowse -quiet -mountpoint "$MOUNT_POINT"

  INSTALLED_APP="$APP_DIR/VoxHelper.app"
  BUNDLED_APP="$MOUNT_POINT/VoxHelper.app"
  INSTALLED_VERSION="$(app_version "$INSTALLED_APP")"
  BUNDLED_VERSION="$(app_version "$BUNDLED_APP")"
  INSTALLED_BUILD="$(app_build_commit "$INSTALLED_APP")"
  BUNDLED_BUILD="$(app_build_commit "$BUNDLED_APP")"

  if ! $FORCE_APP \
    && [[ -n "$INSTALLED_VERSION" && -n "$BUNDLED_VERSION" && "$INSTALLED_VERSION" == "$BUNDLED_VERSION" ]] \
    && [[ -z "$BUNDLED_BUILD" || "$INSTALLED_BUILD" == "$BUNDLED_BUILD" ]]; then
    echo "[vox-helper] VoxHelper.app already at v$INSTALLED_VERSION — skipping app replacement."
  else
    if $FORCE_APP; then
      echo "[vox-helper] Force installing VoxHelper.app..."
    elif [[ -n "$INSTALLED_BUILD" && -n "$BUNDLED_BUILD" && "$INSTALLED_BUILD" != "$BUNDLED_BUILD" ]]; then
      echo "[vox-helper] Updating VoxHelper.app build $INSTALLED_BUILD → $BUNDLED_BUILD..."
    elif [[ -n "$INSTALLED_VERSION" && -n "$BUNDLED_VERSION" ]]; then
      echo "[vox-helper] Updating VoxHelper.app v$INSTALLED_VERSION → v$BUNDLED_VERSION..."
    else
      echo "[vox-helper] Installing VoxHelper.app..."
    fi
    # Stop the running helper before replacing the app bundle. Replacing a live
    # signed .app can leave the installed bundle in an invalid signature state.
    UID_VAL=$(id -u)
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

[[ -x "$APP_DIR/VoxHelper.app/Contents/MacOS/VoxHelper" ]] || {
  echo "[vox-helper] x VoxHelper.app is missing its executable at $APP_DIR/VoxHelper.app/Contents/MacOS/VoxHelper"
  exit 1
}

# ── Write LaunchAgent plist ───────────────────────────────────────────────────
install_step 3 3 "Installing helper LaunchAgent"
cat > "$PLIST_DST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$APP_DIR/VoxHelper.app/Contents/MacOS/VoxHelper</string>
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
if $NO_RELOAD; then
  echo "[vox-helper] --no-reload set; LaunchAgent plist updated but not reloaded."
else
  launchctl stop "gui/$UID_VAL/$LABEL" 2>/dev/null || true
  sleep 1
  launchctl unload "$PLIST_DST" 2>/dev/null || true
  launchctl load "$PLIST_DST"
fi

echo ""
echo "[vox-helper] Vox Helper installed and started."
echo "  Logs: tail -f $LOG_DIR/vox-helper.log"
echo ""
