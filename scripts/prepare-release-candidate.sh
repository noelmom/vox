#!/bin/bash
# Prepare local, non-publishing Sparkle release evidence from a staged package.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="${1:-}"
BUILD="${2:-}"
PREVIOUS_BUILD="${3:-}"
PACKAGE="${4:-}"
URL="${5:-}"
NOTES="${6:-}"
CHANNEL="${7:-stable}"
PUBLISHED_AT="${8:-}"
EXISTING_APPCAST="${9:-}"

fail() { echo "candidate: $*" >&2; exit 1; }
[[ -n "$VERSION" && -n "$BUILD" && -n "$PREVIOUS_BUILD" && -n "$PACKAGE" && -n "$URL" && -n "$NOTES" && -n "$PUBLISHED_AT" ]] || fail "usage: $0 VERSION BUILD PREVIOUS_BUILD PACKAGE URL NOTES [stable|beta] PUBLISHED_AT [EXISTING_APPCAST]"
[[ "$CHANNEL" == "stable" || "$CHANNEL" == "beta" ]] || fail "channel must be stable or beta"
[[ -f "$PACKAGE" ]] || fail "staged package not found: $PACKAGE"
[[ -f "$NOTES" ]] || fail "release notes not found: $NOTES"
[[ -z "$EXISTING_APPCAST" || -f "$EXISTING_APPCAST" ]] || fail "existing appcast not found: $EXISTING_APPCAST"
[[ -z "$(git -C "$ROOT" status --porcelain)" ]] || fail "working tree is dirty"

# Candidate evidence must begin with the exact signed, stapled package that
# will later be uploaded. This remains read-only and never installs anything.
bash "$ROOT/scripts/verify-package-candidate.sh" "$PACKAGE"

EVIDENCE="$ROOT/.release-candidates/${VERSION}-${BUILD}"
[[ ! -e "$EVIDENCE" ]] || fail "candidate evidence already exists: $EVIDENCE"
mkdir -p "$EVIDENCE"
cp "$NOTES" "$EVIDENCE/release-notes.md"
cp "$PACKAGE" "$EVIDENCE/$(basename "$PACKAGE")"

existing_args=()
[[ -n "$EXISTING_APPCAST" ]] && existing_args=(--existing-appcast "$EXISTING_APPCAST")
python3 "$ROOT/scripts/appcast.py" render \
  --version "$VERSION" --build "$BUILD" --previous-build "$PREVIOUS_BUILD" \
  --channel "$CHANNEL" --package "$EVIDENCE/$(basename "$PACKAGE")" \
  --url "$URL" --notes "$EVIDENCE/release-notes.md" \
  --published-at "$PUBLISHED_AT" --output "$EVIDENCE/appcast.xml" "${existing_args[@]}"
python3 "$ROOT/scripts/appcast.py" verify \
  --appcast "$EVIDENCE/appcast.xml" --package "$EVIDENCE/$(basename "$PACKAGE")" \
  --channel "$CHANNEL" --previous-build "$PREVIOUS_BUILD" --verify-signature

SHA256="$(shasum -a 256 "$EVIDENCE/$(basename "$PACKAGE")" | awk '{print $1}')"
read -r APPCAST_SIGNATURE APPCAST_LENGTH < <(python3 - "$EVIDENCE/appcast.xml" "$BUILD" <<'PY'
import sys
from xml.etree import ElementTree as ET

sparkle = "http://www.andymatuschak.org/xml-namespaces/sparkle"
root = ET.parse(sys.argv[1]).getroot()
for item in root.findall("./channel/item"):
    if item.findtext(f"{{{sparkle}}}version") == sys.argv[2]:
        enclosure = item.find("enclosure")
        if enclosure is None:
            raise SystemExit("candidate: missing generated enclosure")
        print(enclosure.get(f"{{{sparkle}}}edSignature", ""), enclosure.get("length", ""))
        break
else:
    raise SystemExit("candidate: generated build missing from appcast")
PY
)
[[ -n "$APPCAST_SIGNATURE" && "$APPCAST_LENGTH" =~ ^[0-9]+$ ]] || fail "generated appcast metadata is incomplete"
cat > "$EVIDENCE/provenance.txt" <<EOF
version=$VERSION
build=$BUILD
previous_build=$PREVIOUS_BUILD
channel=$CHANNEL
published_at=$PUBLISHED_AT
package_url=$URL
package_sha256=$SHA256
appcast_signature=$APPCAST_SIGNATURE
appcast_length=$APPCAST_LENGTH
source_commit=$(git -C "$ROOT" rev-parse HEAD)
sparkle_version=$(grep -A6 '"identity" : "sparkle"' "$ROOT/Package.resolved" | grep '"version"' | tr -d ' ,"' | cut -d: -f2)
EOF
echo "Candidate evidence written to $EVIDENCE (not published)."
