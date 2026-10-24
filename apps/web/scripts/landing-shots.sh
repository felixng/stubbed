#!/usr/bin/env bash
# Copies the landing page's screenshots from the last `apps/ios/scripts/dev
# marketing` run into public/landing/ as JPEGs, at full size (1206×2622);
# next/image serves smaller copies.
set -euo pipefail

WEB_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SHOTS="$WEB_DIR/../ios/build/marketing"
OUT="$WEB_DIR/public/landing"

mkdir -p "$OUT"
for name in hero log share history plan; do
  [ -f "$SHOTS/$name.png" ] || { echo "Missing $SHOTS/$name.png: run apps/ios/scripts/dev marketing" >&2; exit 1; }
  sips -s format jpeg -s formatOptions 82 "$SHOTS/$name.png" --out "$OUT/$name.jpg" >/dev/null
  echo "$OUT/$name.jpg"
done
