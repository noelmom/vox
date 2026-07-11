#!/bin/bash
# Notarize and staple assets/Vox.dmg.
#
# Requires:
#   APP_SIGN_PASSWORD — Apple app-specific password for notarytool
#
# Called automatically by build-apps.sh — can also be run standalone
# if the DMG is already built and signed but not yet notarized.
#
# Usage:
#   bash scripts/notarize.sh
set -eo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
RED="\033[0;31m"
RESET="\033[0m"

info()    { echo -e "${BOLD}[notarize]${RESET} $*"; }
success() { echo -e "${GREEN}[notarize] ✓${RESET} $*"; }
fail()    { echo -e "${RED}[notarize] ✗${RESET} $*"; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DMG="$ROOT/assets/Vox.dmg"
APPLE_ID="noelmomelo@mac.com"
TEAM_ID="S65X5KY399"

# ── Preflight ─────────────────────────────────────────────────────────────────
[[ -n "$APP_SIGN_PASSWORD" ]] || fail "APP_SIGN_PASSWORD is not set."
[[ -f "$DMG" ]]               || fail "Vox.dmg not found at $DMG — run build-apps.sh first."
xcrun --find notarytool &>/dev/null || fail "notarytool not found — requires Xcode 13+."

# ── Submit ────────────────────────────────────────────────────────────────────
info "Submitting Vox.dmg to Apple notary service (this takes a few minutes)…"
xcrun notarytool submit "$DMG" \
  --apple-id "$APPLE_ID" \
  --team-id  "$TEAM_ID" \
  --password "$APP_SIGN_PASSWORD" \
  --wait
success "Notarization approved"

# ── Staple ────────────────────────────────────────────────────────────────────
info "Stapling ticket to Vox.dmg…"
xcrun stapler staple "$DMG"
success "Stapled"

# ── Verify ────────────────────────────────────────────────────────────────────
info "Verifying…"
spctl --assess --type open --context context:primary-signature --verbose "$DMG"
success "Gatekeeper check passed"

echo ""
echo -e "${GREEN}${BOLD}Vox.dmg is signed and notarized locally.${RESET}"
echo ""
echo "  Install:  bash vox.sh install"
echo "  Update:   bash vox.sh update"
echo ""
