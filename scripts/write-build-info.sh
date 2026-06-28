#!/bin/bash
# Stamp the current Vox source/build identity for the API, UI, and native apps.
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION")"
COMMIT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
BUILT_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
OUT="${1:-$ROOT/build_info.json}"

mkdir -p "$(dirname "$OUT")"
cat > "$OUT" <<EOF
{
  "version": "$VERSION",
  "commit": "$COMMIT",
  "built_at": "$BUILT_AT"
}
EOF

echo "$OUT"
