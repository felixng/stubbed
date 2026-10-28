#!/usr/bin/env bash
# Set up the autopilot on this Mac. Run it once, in Terminal, as the owner:
#
#   scripts/autopilot/install.sh
#
# It asks for things only the owner can give: a Supabase login (browser)
# and the hosted database password (saved to the Keychain, never printed).
# Run it again after scripts/autopilot changes on main, to update the copy
# launchd uses. To stop the autopilot:
#   launchctl bootout gui/$(id -u)/app.getstubbed.autopilot
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SUPPORT="$HOME/Library/Application Support/stubbed-autopilot"
CLONE="$SUPPORT/stubbed"
LOGS="$HOME/Library/Logs/stubbed-autopilot"
LABEL="app.getstubbed.autopilot"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PROJECT_REF="tvjkuzyrqsikpmryqymy"
mkdir -p "$SUPPORT" "$LOGS" "$HOME/Library/LaunchAgents"

echo "1/5 Checking GitHub and Claude Code"
gh auth status 2>&1 | grep -q "'project'" || { echo "GitHub login needs project access: gh auth refresh -s project"; exit 1; }
command -v claude >/dev/null || { echo "Claude Code isn't installed"; exit 1; }

echo "2/5 The autopilot's own clone"
[ -d "$CLONE/.git" ] || git clone -q https://github.com/felixng/stubbed.git "$CLONE"

echo "3/5 Linking the clone to the hosted Supabase project"
if ! security find-generic-password -s stubbed-supabase-db >/dev/null 2>&1; then
  echo "Enter the hosted database password (Supabase dashboard → Project Settings → Database). It goes to the Keychain only."
  security add-generic-password -U -s stubbed-supabase-db -a postgres -w
fi
supabase projects list >/dev/null 2>&1 || supabase login
(cd "$CLONE" && SUPABASE_DB_PASSWORD="$(security find-generic-password -s stubbed-supabase-db -w)" supabase link --project-ref "$PROJECT_REF")

echo "4/5 Installing the scripts launchd runs"
cp "$HERE/run.sh" "$HERE/status.sh" "$SUPPORT/"
chmod +x "$SUPPORT/run.sh" "$SUPPORT/status.sh"

echo "5/5 Scheduling every 30 minutes"
cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$SUPPORT/run.sh</string></array>
  <key>StartInterval</key><integer>1800</integer>
  <key>StandardOutPath</key><string>$LOGS/launchd.log</string>
  <key>StandardErrorPath</key><string>$LOGS/launchd.log</string>
</dict>
</plist>
EOF
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Done. Drag an epic to \"Ready for Claude\" on the board; it's picked up within 30 minutes."
echo "Logs: $LOGS"
