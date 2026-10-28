#!/usr/bin/env bash
# Move an issue to a column of the "Stubbed roadmap" board, or print the
# column it's in. Used by the autopilot and the `epic` skill.
#
#   scripts/autopilot/status.sh 163                 Print #163's column
#   scripts/autopilot/status.sh 163 "In review"     Move #163 to In review
#
# Columns: Todo, Ready for Claude, In Progress, In review, Done.
# Needs a GitHub login with project access (gh auth refresh -s project).
set -euo pipefail

OWNER="felixng"
REPO="stubbed"
PROJECT=1
number="$1"
want="${2:-}"

item=$(gh api graphql -f query='query($owner: String!, $repo: String!, $n: Int!) {
  repository(owner: $owner, name: $repo) { issue(number: $n) {
    projectItems(first: 10) { nodes { id project { number }
      fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } } } } } } }' \
  -f owner="$OWNER" -f repo="$REPO" -F n="$number" \
  --jq ".data.repository.issue.projectItems.nodes[] | select(.project.number == $PROJECT) | \"\(.id)\t\(.fieldValueByName.name // \"\")\"")
[ -n "$item" ] || { echo "#$number isn't on the board" >&2; exit 1; }
item_id="${item%%$'\t'*}"

if [ -z "$want" ]; then
  echo "${item#*$'\t'}"
  exit 0
fi

field=$(gh api graphql -f query='query($owner: String!, $p: Int!) {
  user(login: $owner) { projectV2(number: $p) { id
    field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } } } } }' \
  -f owner="$OWNER" -F p="$PROJECT" \
  --jq ".data.user.projectV2 | \"\(.id)\t\(.field.id)\t\(.field.options[] | select(.name == \"$want\") | .id)\"")
IFS=$'\t' read -r project_id field_id option_id <<<"$field"
[ -n "${option_id:-}" ] || { echo "No column called \"$want\"" >&2; exit 1; }

gh api graphql -f query='mutation($p: ID!, $i: ID!, $f: ID!, $o: String!) {
  updateProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $f, value: { singleSelectOptionId: $o } }) { projectV2Item { id } } }' \
  -f p="$project_id" -f i="$item_id" -f f="$field_id" -f o="$option_id" >/dev/null
echo "#$number → $want"
