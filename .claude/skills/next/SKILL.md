---
name: next
description: Pick the next Stubbed issue that's ready and build it, end to end, into one pull request. Use when the owner says "next", "work on the next one", or names an issue to build.
---

# Build the next issue

Work on one issue per run.

## Pick

- If the owner named an issue, use it.
- Otherwise follow the owner's order, which lives on the board, not in labels:
  1. An open issue labelled `P0` (urgent) goes first, if it's `ready`.
  2. Otherwise read the epics in the order the owner dragged them on the "Stubbed roadmap" board (top first):
     `gh api graphql -f query='{ user(login:"felixng"){ projectV2(number:1){ items(first:100, orderBy:{field:POSITION, direction:ASC}){ nodes{ content{ ... on Issue { number title state labels(first:5){ nodes{ name } } } } } } } } }'`, keeping open issues labelled `epic`.
  3. Take the first epic that has a sub-issue labelled `ready` (and not `in-progress`, `needs-decision` or `needs-human` for the part you'd build). Within the epic, follow its sub-issue order, top first: `gh api repos/felixng/stubbed/issues/<epic>/sub_issues --jq '.[] | select(.state=="open") | .number'`.
- Reading the board needs project access (`read:project`). If the session doesn't have it, ask the owner which epic is next instead of guessing.
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
