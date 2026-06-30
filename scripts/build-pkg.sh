#!/bin/bash
# Build and sign a macOS installer package for Vox app bundles.
#
# Requires:
#   KEYCHAIN_PASSWORD  — login keychain password (for productsign access)
#   APP_SIGN_PASSWORD — Apple app-specific password for notarytool
#   Developer ID Installer certificate installed in Keychain
#
# Output: assets/Vox-<version>.pkg
#
# Usage:
#   bash scripts/build-pkg.sh
set -eo pipefail
export COPYFILE_DISABLE=1

BOLD="\033[1m"
GREEN="\033[0;32m"
RED="\033[0;31m"
RESET="\033[0m"

info()    { echo -e "${BOLD}[pkg]${RESET} $*"; }
success() { echo -e "${GREEN}[pkg] ✓${RESET} $*"; }
fail()    { echo -e "${RED}[pkg] ✗${RESET} $*"; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION")"
TEAM_ID="S65X5KY399"
APPLE_ID="noelmomelo@mac.com"
INSTALLER_IDENTITY="Developer ID Installer: Noelmo Melo ($TEAM_ID)"
BUILD_TMP="/tmp/vox-pkg-$$"
PAYLOAD_ROOT="$BUILD_TMP/payload"
PKG_SCRIPTS="$BUILD_TMP/scripts"
UNSIGNED_PKG="$BUILD_TMP/Vox-unsigned.pkg"
OUTPUT_PKG="$ROOT/assets/Vox-$VERSION.pkg"
DMG="$ROOT/assets/Vox.dmg"
MOUNT_POINT=""
KEYCHAIN_UNLOCKED=false

cleanup() {
  if [[ -n "$MOUNT_POINT" ]]; then
    hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
  fi
  if $KEYCHAIN_UNLOCKED; then
    security lock-keychain ~/Library/Keychains/login.keychain-db 2>/dev/null || true
  fi
  rm -rf "$BUILD_TMP"
}
trap cleanup EXIT

[[ "$(uname)" == "Darwin" ]] || fail "Package builds require macOS."
[[ -n "$KEYCHAIN_PASSWORD" ]] || fail "KEYCHAIN_PASSWORD is not set."
[[ -n "$APP_SIGN_PASSWORD" ]] || fail "APP_SIGN_PASSWORD is not set."
[[ -f "$DMG" ]] || fail "assets/Vox.dmg not found — run bash scripts/build-apps.sh first."
[[ -f "$ROOT/build_info.json" ]] || "$ROOT/scripts/write-build-info.sh" "$ROOT/build_info.json" >/dev/null
command -v pkgbuild >/dev/null 2>&1 || fail "pkgbuild not found — install Xcode Command Line Tools."
command -v productsign >/dev/null 2>&1 || fail "productsign not found — install Xcode Command Line Tools."
xcrun --find notarytool >/dev/null 2>&1 || fail "notarytool not found — requires Xcode 13+."
security find-identity -v -p basic | grep -F "$INSTALLER_IDENTITY" >/dev/null \
  || fail "Developer ID Installer identity not found: $INSTALLER_IDENTITY"

mkdir -p "$PAYLOAD_ROOT/Applications/Vox" "$PAYLOAD_ROOT/Library/Application Support/Vox/Bootstrap" "$PKG_SCRIPTS"

info "Mounting Vox.dmg…"
MOUNT_POINT="$(mktemp -d "${TMPDIR:-/tmp}/vox-pkg-dmg.XXXXXX")"
hdiutil attach "$DMG" -nobrowse -quiet -mountpoint "$MOUNT_POINT"

[[ -d "$MOUNT_POINT/VoxHelper.app" ]] || fail "VoxHelper.app not found in Vox.dmg."
[[ -d "$MOUNT_POINT/VoxServer.app" ]] || fail "VoxServer.app not found in Vox.dmg."

info "Staging app bundles…"
ditto --norsrc "$MOUNT_POINT/VoxHelper.app" "$PAYLOAD_ROOT/Applications/Vox/VoxHelper.app"
ditto --norsrc "$MOUNT_POINT/VoxServer.app" "$PAYLOAD_ROOT/Applications/Vox/VoxServer.app"

info "Staging package bootstrap…"
ditto --norsrc "$ROOT/vox.sh" "$PAYLOAD_ROOT/Library/Application Support/Vox/Bootstrap/vox.sh"
ditto --norsrc "$ROOT/setup.sh" "$PAYLOAD_ROOT/Library/Application Support/Vox/Bootstrap/setup.sh"
ditto --norsrc "$ROOT/requirements.txt" "$PAYLOAD_ROOT/Library/Application Support/Vox/Bootstrap/requirements.txt"
ditto --norsrc "$ROOT/VERSION" "$PAYLOAD_ROOT/Library/Application Support/Vox/Bootstrap/VERSION"
ditto --norsrc "$ROOT/build_info.json" "$PAYLOAD_ROOT/Library/Application Support/Vox/Bootstrap/build_info.json"
rsync -a --delete --exclude='__pycache__/' --exclude='*.pyc' "$ROOT/api/" "$PAYLOAD_ROOT/Library/Application Support/Vox/Bootstrap/api/"
rsync -a --delete "$ROOT/ui-dist/" "$PAYLOAD_ROOT/Library/Application Support/Vox/Bootstrap/ui-dist/"
rsync -a --delete --exclude='build-apps.sh' --exclude='build-pkg.sh' --exclude='notarize.sh' "$ROOT/scripts/" "$PAYLOAD_ROOT/Library/Application Support/Vox/Bootstrap/scripts/"
mkdir -p "$PAYLOAD_ROOT/Library/Application Support/Vox/Bootstrap/voices"
ditto --norsrc "$ROOT/voices/noelmo-normal.wav" "$PAYLOAD_ROOT/Library/Application Support/Vox/Bootstrap/voices/noelmo-normal.wav"
ditto --norsrc "$ROOT/pkg-scripts/preinstall" "$PKG_SCRIPTS/preinstall"
ditto --norsrc "$ROOT/pkg-scripts/postinstall" "$PKG_SCRIPTS/postinstall"
chmod +x "$PKG_SCRIPTS/preinstall"
chmod +x "$PKG_SCRIPTS/postinstall"
dot_clean -m "$PAYLOAD_ROOT"
xattr -cr "$PAYLOAD_ROOT" "$PKG_SCRIPTS" 2>/dev/null || true

info "Verifying staged app signatures…"
codesign --verify --deep --strict "$PAYLOAD_ROOT/Applications/Vox/VoxHelper.app"
codesign --verify --deep --strict "$PAYLOAD_ROOT/Applications/Vox/VoxServer.app"
success "App signatures verified"

info "Building unsigned package…"
pkgbuild \
  --root "$PAYLOAD_ROOT" \
  --scripts "$PKG_SCRIPTS" \
  --identifier "com.melolabdev.vox.pkg" \
  --version "$VERSION" \
  --install-location "/" \
  "$UNSIGNED_PKG"

info "Signing package…"
rm -f "$OUTPUT_PKG" "$ROOT/assets/Vox.pkg"
info "Unlocking keychain…"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" ~/Library/Keychains/login.keychain-db
KEYCHAIN_UNLOCKED=true
productsign \
  --sign "$INSTALLER_IDENTITY" \
  "$UNSIGNED_PKG" \
  "$OUTPUT_PKG"
security lock-keychain ~/Library/Keychains/login.keychain-db
KEYCHAIN_UNLOCKED=false
success "Package signed"

info "Verifying package signature…"
pkgutil --check-signature "$OUTPUT_PKG"

info "Submitting package to Apple notary service…"
xcrun notarytool submit "$OUTPUT_PKG" \
  --apple-id "$APPLE_ID" \
  --team-id "$TEAM_ID" \
  --password "$APP_SIGN_PASSWORD" \
  --wait
success "Notarization approved"

info "Stapling notarization ticket…"
xcrun stapler staple "$OUTPUT_PKG"
success "Stapled"

info "Running Gatekeeper install assessment…"
spctl --assess --type install --verbose "$OUTPUT_PKG"

success "Signed and notarized package created: $OUTPUT_PKG"
