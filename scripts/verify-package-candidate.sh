#!/bin/bash
# Read-only inspection for a signed Vox installer candidate. Never installs it.
set -euo pipefail

PACKAGE="${1:-}"
fail() { echo "package-verify: $*" >&2; exit 1; }
[[ -n "$PACKAGE" && -f "$PACKAGE" ]] || fail "usage: $0 /path/to/Vox-x.y.z.pkg"
command -v pkgutil >/dev/null 2>&1 || fail "pkgutil is required on macOS"

payload="$(pkgutil --payload-files "$PACKAGE")"
require_path() {
  grep -Fxq "$1" <<<"$payload" || fail "missing payload path: $1"
}
reject_path() {
  if grep -Fq "$1" <<<"$payload"; then
    fail "protected runtime data must not be packaged: $1"
  fi
}

require_path "Applications/Vox/VoxHelper.app/Contents/Info.plist"
require_path "Applications/Vox/VoxServer.app/Contents/Info.plist"
require_path "Applications/Vox/VoxHelper.app/Contents/Frameworks/Sparkle.framework/Versions/A/Sparkle"
require_path "Library/Application Support/Vox/Bootstrap/vox.sh"
require_path "Library/Application Support/Vox/Bootstrap/scripts/update.sh"
require_path "Library/Application Support/Vox/Bootstrap/scripts/prepare-release-candidate.sh"
reject_path "Library/Application Support/Vox/voices/"
reject_path "Library/Application Support/Vox/outputs/"
reject_path "Library/Application Support/Vox/data/"
reject_path "Library/Application Support/Vox/input/"
reject_path "Library/Application Support/Vox/.env"

while IFS= read -r path; do
  [[ -n "$path" ]] || continue
  case "$path" in
    Applications/Vox/VoxHelper.app/*|Applications/Vox/VoxServer.app/*) ;;
    "Library/Application Support/Vox/Bootstrap/vox.sh"|\
    "Library/Application Support/Vox/Bootstrap/setup.sh"|\
    "Library/Application Support/Vox/Bootstrap/requirements.txt"|\
    "Library/Application Support/Vox/Bootstrap/VERSION"|\
    "Library/Application Support/Vox/Bootstrap/build_info.json"|\
    "Library/Application Support/Vox/Bootstrap/api/"*|\
    "Library/Application Support/Vox/Bootstrap/ui-dist/"*|\
    "Library/Application Support/Vox/Bootstrap/scripts/"*|\
    "Library/Application Support/Vox/Bootstrap/voices/noelmo-demo.wav") ;;
    *) fail "unexpected package payload path: $path" ;;
  esac
  case "$path" in
    */.env|*/.env.*|*/.git/*|*/.DS_Store|*/__pycache__/*|*.pyc|*.pyo|\
    */node_modules/*|*/.pytest_cache/*|*/.mypy_cache/*|*/.ci/*|\
    */working-poc/*|*.pem|*.key|*.p12|*.mobileprovision|*.sqlite)
      fail "development, cache, or secret material must not be packaged: $path" ;;
  esac
done <<<"$payload"

pkgutil --check-signature "$PACKAGE"
if command -v spctl >/dev/null 2>&1; then
  spctl --assess --type install --verbose "$PACKAGE"
fi
xcrun stapler validate "$PACKAGE"

echo "package-verify: payload, signature, stapling, and protected-data boundaries passed"
