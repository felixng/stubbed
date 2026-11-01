#!/usr/bin/env bash
# Builds the press kit's downloadable media in public/press/ from real app
# assets: the iPhone screenshots in public/landing/ (landing-shots.sh), the
# stats screenshot from the last `apps/ios/scripts/dev marketing` run, and the
# iOS app icons. Renders framed and landscape images with headless Chrome.
#
#   apps/web/scripts/press-assets.sh
#
# Outputs (public/press/):
#   app-icon.png, app-icon-dark.png, app-icon-tinted.png   1024×1024
#   stubbed-logo.png, stubbed-logo-white.png                horizontal logo, transparent (light / dark backgrounds)
#   stats.jpg                                               raw stats screenshot
#   <screen>-framed.png                                     phone frame, transparent
#   <group>-landscape.jpg                                   1920×1080, brand background
#   share-card.jpg                                          the card, cut from the share screen
#   stubbed-press-kit.zip                                   everything above, plus the raw screenshots
set -euo pipefail

WEB_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IOS_DIR="$WEB_DIR/../ios"
OUT="$WEB_DIR/public/press"
LANDING="$WEB_DIR/public/landing"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || { echo "Needs Google Chrome (set CHROME=...)" >&2; exit 1; }
mkdir -p "$OUT"

shoot() { # html, png, width, height
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 \
    --force-device-scale-factor=1 --window-size="$3,$4" --screenshot="$2" "file://$1" 2>/dev/null
}

# App icons, straight from the asset catalogue.
icons="$IOS_DIR/Stubbed/Assets.xcassets/AppIcon.appiconset"
cp "$icons/AppIcon.png" "$OUT/app-icon.png"
cp "$icons/AppIcon-Dark.png" "$OUT/app-icon-dark.png"
cp "$icons/AppIcon-Tinted.png" "$OUT/app-icon-tinted.png"

# The horizontal logo: the mark before the wordmark, in the same proportions
# as components/ui/Wordmark.tsx (mark 1.05× the type size, 0.28em gap,
# weight 800, -0.045em tracking). One in label for light backgrounds, one in
# white for dark ones. PNG only: the wordmark is live type, not outlines.
for variant in "logo|#1f1210" "logo-white|#ffffff"; do
  IFS='|' read -r name colour <<<"$variant"
  cat >"$TMP/logo.html" <<EOF
<!doctype html><html><body style="margin:0;background:transparent">
<div id="render" style="display:inline-flex;align-items:center;gap:0.28em;padding:40px;font:800 400px/1 -apple-system,'SF Pro Display',system-ui,sans-serif;letter-spacing:-0.045em;color:$colour">
<img src="$WEB_DIR/public/brand/stubbed-mark.svg" style="height:420px;width:516px">stubbed</div>
</body></html>
EOF
  node "$WEB_DIR/scripts/render-png.mjs" "$TMP/logo.html" "$OUT/stubbed-$name.png"
done

# The stats screenshot, captured by MarketingUITests.testCaptureInsights.
if [ -f "$IOS_DIR/build/marketing/stats.png" ]; then
  sips -s format jpeg -s formatOptions 82 "$IOS_DIR/build/marketing/stats.png" --out "$OUT/stats.jpg" >/dev/null
fi
[ -f "$OUT/stats.jpg" ] || { echo "Missing stats.jpg: run apps/ios/scripts/dev marketing" >&2; exit 1; }

shot() { # screen name -> raw screenshot path
  case "$1" in stats) echo "$OUT/stats.jpg" ;; *) echo "$LANDING/$1.jpg" ;; esac
}

# Each screen in the landing page's phone frame, on a transparent background.
for screen in hero log share history plan stats; do
  cat >"$TMP/frame.html" <<EOF
<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:1206px;padding:34px;border-radius:18%/8.3%;background:#1c1c1e">
<img src="$(shot "$screen")" style="display:block;width:1206px;height:2622px;border-radius:15.5%/7.1%">
</div></body></html>
EOF
  shoot "$TMP/frame.html" "$TMP/$screen.png" 1274 2690
  sips -Z 1400 "$TMP/$screen.png" --out "$OUT/$screen-framed.png" >/dev/null
done

# The share card itself, cut out of the share screen (1206-wide screenshot).
sips -c 1098 1098 --cropOffset 425 54 "$LANDING/share.jpg" --out "$OUT/share-card.jpg" >/dev/null

# Landscape compositions: headline on the left, phones on the right, on the
# Footlight Coral background (docs/DESIGN.md: background, tint, glow, label).
landscape() { # name, headline, subline, screens...
  local name="$1" headline="$2" subline="$3"; shift 3
  local phones=""
  for screen in "$@"; do
    phones+="<div class=\"phone\"><img src=\"$OUT/$screen-framed.png\"></div>"
  done
  cat >"$TMP/landscape.html" <<EOF
<!doctype html><html><head><style>
  body{margin:0;width:1920px;height:1080px;overflow:hidden;font-family:-apple-system,"SF Pro Display",system-ui,sans-serif;
    background:radial-gradient(900px 700px at 80% 60%,#ffd9cc 0%,rgba(255,217,204,0) 70%),#fff9f6;color:#1f1210;
    display:flex;align-items:center;justify-content:center;gap:96px;padding:0 120px;box-sizing:border-box}
  .copy{flex:0 1 760px;min-width:0}
  .mark{display:flex;align-items:center;gap:14px;font-size:44px;font-weight:800;letter-spacing:-0.02em;margin-bottom:56px}
  .mark img{width:56px;height:56px}
  h1{font-size:92px;line-height:1.02;letter-spacing:-0.035em;font-weight:800;margin:0 0 28px}
  p{font-size:34px;line-height:1.35;color:#5e4039;margin:0;max-width:620px}
  .phones{display:flex;gap:40px;align-items:center}
  .phone img{display:block;height:880px;filter:drop-shadow(0 30px 40px rgba(31,18,16,.18))}
  .phone:nth-child(2){margin-top:120px}
</style></head><body>
<div class="copy"><div class="mark"><img src="$WEB_DIR/public/brand/stubbed-mark.svg">stubbed</div>
<h1>$headline</h1><p>$subline</p></div>
<div class="phones">$phones</div>
</body></html>
EOF
  shoot "$TMP/landscape.html" "$TMP/landscape.png" 1920 1080
  sips -s format jpeg -s formatOptions 86 "$TMP/landscape.png" --out "$OUT/$name-landscape.jpg" >/dev/null
}
landscape home-log "Every show, in one place." "Log the venue, the date, a half-star rating and your thoughts in seconds." log hero
landscape share-cards "Share the night." "Square share cards for Instagram Stories, drawn from your diary." share
landscape trip-view "Trips, recapped." "Group a weekend of shows into a trip, with its own recap card." plan history
landscape stats "Your theatre life, in numbers." "An activity calendar, year by year, your show mix and streaks." stats

# One zip with everything, including the raw screenshots.
rm -f "$OUT/stubbed-press-kit.zip"
mkdir -p "$TMP/kit/screenshots" "$TMP/kit/logo"
cp "$OUT"/app-icon*.png "$OUT"/*-landscape.jpg "$OUT"/*-framed.png "$OUT/share-card.jpg" "$TMP/kit/"
cp "$OUT"/stubbed-logo*.png "$WEB_DIR"/public/brand/stubbed-mark{,-outline}.{svg,png} "$TMP/kit/logo/"
cp "$LANDING"/{hero,log,share,history,plan}.jpg "$OUT/stats.jpg" "$TMP/kit/screenshots/"
(cd "$TMP/kit" && zip -qr "$OUT/stubbed-press-kit.zip" .)

ls -lh "$OUT" | awk 'NR>1{print $5, $9}'
