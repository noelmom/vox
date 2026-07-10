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
  grep -Fq "$1" <<<"$payload" && fail "protected runtime data must not be packaged: $1"
}

require_path "Applications/Vox/VoxHelper.app/Contents/Info.plist"
require_path "Applications/Vox/VoxServer.app/Contents/Info.plist"
require_path "Library/Application Support/Vox/Bootstrap/vox.sh"
require_path "Library/Application Support/Vox/Bootstrap/scripts/update.sh"
require_path "Library/Application Support/Vox/Bootstrap/scripts/prepare-release-candidate.sh"
reject_path "Library/Application Support/Vox/voices/"
reject_path "Library/Application Support/Vox/outputs/"
reject_path "Library/Application Support/Vox/data/"
reject_path "Library/Application Support/Vox/input/"
reject_path "Library/Application Support/Vox/.env"

pkgutil --check-signature "$PACKAGE"
if command -v spctl >/dev/null 2>&1; then
  spctl --assess --type install --verbose "$PACKAGE"
fi
xcrun stapler validate "$PACKAGE"

echo "package-verify: payload, signature, stapling, and protected-data boundaries passed"
