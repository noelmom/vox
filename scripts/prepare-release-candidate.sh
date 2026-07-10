#!/bin/bash
# Prepare local, non-publishing Sparkle release evidence from a staged package.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:-}"
BUILD="${2:-}"
PREVIOUS_BUILD="${3:-}"
PACKAGE="${4:-}"
URL="${5:-}"
NOTES="${6:-}"
CHANNEL="${7:-stable}"
PUBLISHED_AT="${8:-}"

fail() { echo "candidate: $*" >&2; exit 1; }
[[ -n "$VERSION" && -n "$BUILD" && -n "$PREVIOUS_BUILD" && -n "$PACKAGE" && -n "$URL" && -n "$NOTES" && -n "$PUBLISHED_AT" ]] || fail "usage: $0 VERSION BUILD PREVIOUS_BUILD PACKAGE URL NOTES [stable|beta] PUBLISHED_AT"
[[ "$CHANNEL" == "stable" || "$CHANNEL" == "beta" ]] || fail "channel must be stable or beta"
[[ -f "$PACKAGE" ]] || fail "staged package not found: $PACKAGE"
[[ -f "$NOTES" ]] || fail "release notes not found: $NOTES"
[[ -z "$(git -C "$ROOT" status --porcelain)" ]] || fail "working tree is dirty"

EVIDENCE="$ROOT/.release-candidates/${VERSION}-${BUILD}"
mkdir -p "$EVIDENCE"
cp "$NOTES" "$EVIDENCE/release-notes.md"
cp "$PACKAGE" "$EVIDENCE/$(basename "$PACKAGE")"

python3 "$ROOT/scripts/appcast.py" render \
  --version "$VERSION" --build "$BUILD" --previous-build "$PREVIOUS_BUILD" \
  --channel "$CHANNEL" --package "$EVIDENCE/$(basename "$PACKAGE")" \
  --url "$URL" --notes "$EVIDENCE/release-notes.md" \
  --published-at "$PUBLISHED_AT" --output "$EVIDENCE/appcast.xml"
python3 "$ROOT/scripts/appcast.py" verify \
  --appcast "$EVIDENCE/appcast.xml" --package "$EVIDENCE/$(basename "$PACKAGE")" \
  --channel "$CHANNEL" --previous-build "$PREVIOUS_BUILD" --verify-signature

SHA256="$(shasum -a 256 "$EVIDENCE/$(basename "$PACKAGE")" | awk '{print $1}')"
cat > "$EVIDENCE/provenance.txt" <<EOF
version=$VERSION
build=$BUILD
previous_build=$PREVIOUS_BUILD
channel=$CHANNEL
published_at=$PUBLISHED_AT
package_url=$URL
package_sha256=$SHA256
source_commit=$(git -C "$ROOT" rev-parse HEAD)
sparkle_version=$(grep -A6 '"identity" : "sparkle"' "$ROOT/Package.resolved" | grep '"version"' | tr -d ' ,"' | cut -d: -f2)
EOF
echo "Candidate evidence written to $EVIDENCE (not published)."
