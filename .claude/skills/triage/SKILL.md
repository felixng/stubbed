---
name: triage
description: Turn rough Stubbed issues into ready-to-build ones. Use when the owner says "triage", or asks to tidy, sort or go through the inbox or backlog. Expands issues labelled `inbox` (filed by hand from GitHub as a backup when Claude wasn't available) into the full format the `idea` skill uses.
---

# Triage the inbox

1. List them: `gh issue list --label inbox --state open --json number,title,body,createdAt`.
2. For each, follow the `idea` skill (`.claude/skills/idea/SKILL.md`) steps 1–4. The issue's title and body are the owner's idea. Rewrite the existing issue in place with `gh issue edit` (keep the owner's words under **Idea**) rather than filing a new one. If it duplicates another issue, close it with a link to that one.
3. Collect every question into one message at the end, grouped by issue number, in the `idea` skill's quick-answer style. Don't stop to ask per issue.
4. Remove `inbox` from each issue you've handled, and add `ready` or `needs-decision`.
5. Reply with one line per issue: number, title, status, priority. Then the questions.

When asked to triage the whole backlog, do the same for every open issue without a status label (`ready`, `needs-decision`, `in-progress`), and flag issues that look stale against `PRODUCT.md` or the current code; suggest closing them rather than closing them yourself.
