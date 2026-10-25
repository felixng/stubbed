---
name: next
description: Pick the next Stubbed issue that's ready and build it, end to end, into one pull request. Use when the owner says "next", "work on the next one", or names an issue to build.
---

# Build the next issue

Work on one issue per run.

## Pick

- If the owner named an issue, use it.
- Otherwise list issues labelled `ready` without `in-progress` or `needs-decision`: `gh issue list --label ready --state open --json number,title,labels,createdAt`. Rank them by their epic's priority label first (the owner prioritises epics: `P0`, then `P1`, then `P2`, then unlabelled), then by the issue's own priority, then oldest first. Find an issue's epic with `gh api repos/felixng/stubbed/issues/<number>/parent --jq .number`. Labels are the source of truth; the "Stubbed roadmap" project only displays them.
- Tell the owner which one you picked, in one line, and carry on.

Skip an issue and say why if it has open questions, needs the owner's hands (`needs-human`) for the part you'd build, or is too big for one pull request. For a big one, propose how to split it.

## Build

1. Label it `in-progress` and comment "Picked up by Claude Code."
2. Branch from the latest `main`: `issue-<number>-<short-slug>`.
3. Follow the root `CLAUDE.md` and the app's own (`apps/web/CLAUDE.md`, `apps/ios/CLAUDE.md`), including logging choices in `docs/DECISIONS.md`.
4. Check the work the way the repo does:
   - web: `pnpm lint`, `pnpm typecheck`, `pnpm test`
   - database: the pgTAP tests in `supabase/tests`
   - iOS: `scripts/dev build` and `scripts/dev test` in `apps/ios`. For UI changes, take screenshots with `scripts/dev run` or a UI test.
5. Small commits; then push and open a pull request whose body starts with `Closes #<number>`, says what changed, and attaches screenshots for UI changes.
6. Swap `in-progress` for nothing (the pull request now tracks it) and comment the pull request link on the issue.

If you get stuck on a product question, stop and ask instead of guessing: comment the question on the issue, label it `needs-decision`, remove `in-progress`, and tell the owner.

When the pull request is open, reply with its link and one line on anything the owner should check.
