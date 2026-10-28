#!/usr/bin/env bash
# The autopilot: launchd runs this every 30 minutes on the owner's Mac.
# It takes the top epic in the "Ready for Claude" column of the Stubbed
# roadmap board, moves it to In Progress, and lets Claude Code build it
# unattended with the `epic` skill (one PR per sub-issue, merged when
# green, then a TestFlight build). Installed by scripts/autopilot/install.sh.
#
# Works in its own clone, so it never touches the owner's checkout.
# Logs: ~/Library/Logs/stubbed-autopilot/
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
SUPPORT="$HOME/Library/Application Support/stubbed-autopilot"
CLONE="$SUPPORT/stubbed"
LOGS="$HOME/Library/Logs/stubbed-autopilot"
LOCK="$SUPPORT/lock"
STATUS="$SUPPORT/status.sh"
mkdir -p "$SUPPORT" "$LOGS"

log() { echo "$(date '+%F %T') $*" >>"$LOGS/autopilot.log"; }

# One epic at a time: an epic can take longer than the interval.
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -f "$LOCK/pid" ] && kill -0 "$(cat "$LOCK/pid")" 2>/dev/null; then
    exit 0
  fi
  rm -rf "$LOCK" && mkdir "$LOCK"
fi
echo $$ >"$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT

# The top epic in "Ready for Claude", in the board's order.
epic=$(gh api graphql -f query='{ user(login: "felixng") { projectV2(number: 1) {
  items(first: 100, orderBy: { field: POSITION, direction: ASC }) { nodes {
    fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
    content { ... on Issue { number state labels(first: 10) { nodes { name } } } } } } } } }' \
  --jq '[.data.user.projectV2.items.nodes[]
    | select(.fieldValueByName.name == "Ready for Claude") | .content
    | select(.state == "OPEN") | select([.labels.nodes[].name] | index("epic")) | .number][0] // empty') \
  || { log "couldn't read the board"; exit 0; }
[ -n "$epic" ] || exit 0

log "epic #$epic: picked up"
"$STATUS" "$epic" "In Progress" >/dev/null

# A fresh main in the autopilot's own clone. Ignored files (node_modules,
# DerivedData, supabase/.temp with the hosted project link) are kept.
cd "$CLONE"
git fetch -q origin
git checkout -q -B main origin/main
git reset -q --hard origin/main
git clean -qfd
(pnpm install --frozen-lockfile >/dev/null 2>&1) || log "epic #$epic: pnpm install failed"

# Lets `supabase db push` reach the hosted database without a prompt.
SUPABASE_DB_PASSWORD="$(security find-generic-password -s stubbed-supabase-db -w 2>/dev/null || true)"
export SUPABASE_DB_PASSWORD

run_log="$LOGS/epic-$epic-$(date +%Y%m%d-%H%M).log"
allowed=(
  Read Edit Write Glob Grep Skill TodoWrite
  "Bash(git:*)" "Bash(gh:*)" "Bash(pnpm:*)" "Bash(npx:*)" "Bash(node:*)" "Bash(supabase:*)"
  "Bash(scripts/dev:*)" "Bash(./scripts/dev:*)" "Bash(apps/ios/scripts/dev:*)"
  "Bash(scripts/autopilot/status.sh:*)" "Bash(xcrun:*)" "Bash(xcodebuild:*)" "Bash(sips:*)"
  "Bash(ls:*)" "Bash(cat:*)" "Bash(head:*)" "Bash(tail:*)" "Bash(grep:*)" "Bash(find:*)"
  "Bash(sed:*)" "Bash(awk:*)" "Bash(wc:*)" "Bash(sort:*)" "Bash(diff:*)" "Bash(mkdir:*)"
  "Bash(cp:*)" "Bash(mv:*)" "Bash(touch:*)" "Bash(echo:*)" "Bash(date:*)" "Bash(python3:*)"
)
denied=(
  "Bash(git push --force:*)" "Bash(git push -f:*)" "Bash(git push origin main:*)"
  "Bash(git push origin HEAD:main:*)" "Bash(supabase db reset:*)" "Bash(gh repo delete:*)"
  "Bash(gh release:*)" "Bash(rm -rf:*)"
)
log "epic #$epic: Claude started (log: $run_log)"
caffeinate -i claude -p "Build epic #$epic with the epic skill (.claude/skills/epic/SKILL.md). You're running unattended from the autopilot on the owner's Mac: nobody can answer questions, so follow the skill's rules for anything that needs the owner." \
  --permission-mode acceptEdits --allowedTools "${allowed[@]}" --disallowedTools "${denied[@]}" \
  >"$run_log" 2>&1 || log "epic #$epic: Claude exited with an error"

# Never lose work: anything left uncommitted or unpushed goes to its
# branch on GitHub, since the next run starts from a fresh main.
branch=$(git branch --show-current)
if [ -n "$branch" ] && [ "$branch" != "main" ]; then
  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git -c user.name="Felix" -c user.email="felixng@users.noreply.github.com" \
      commit -q -m "WIP: autopilot run on epic #$epic stopped here" || true
  fi
  git push -q -u origin "$branch" 2>/dev/null && log "epic #$epic: saved work on $branch"
fi

# The skill moves the epic to Done or In review. If Claude hit the usage
# limit, put the epic back to be retried; if it stopped for another
# reason, hand it to the owner.
now=$("$STATUS" "$epic" 2>/dev/null || true)
if [ "$now" = "In Progress" ] && grep -qiE "hit your (session|usage|weekly) limit|usage limit" "$run_log"; then
  "$STATUS" "$epic" "Ready for Claude" >/dev/null
  gh issue comment "$epic" --repo felixng/stubbed --body "The autopilot hit the Claude usage limit, so it paused. ${branch:+Work so far is saved on \`$branch\`. }It's back in Ready for Claude and will carry on in a later run, once the limit resets." >/dev/null
  log "epic #$epic: usage limit, back to Ready for Claude"
elif [ "$now" = "In Progress" ]; then
  "$STATUS" "$epic" "In review" >/dev/null
  gh issue comment "$epic" --repo felixng/stubbed --body "The autopilot stopped before finishing this epic, so it's back with you. The run's log is on the Mac: \`$run_log\`." >/dev/null
  log "epic #$epic: stopped early, moved to In review"
else
  log "epic #$epic: finished, now in $now"
fi
