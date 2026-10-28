---
name: epic
description: Build a whole Stubbed epic end to end, one pull request per sub-issue, merging each when green, then publishing a TestFlight build. Used by the autopilot (scripts/autopilot/run.sh) when the owner drags an epic to "Ready for Claude" on the roadmap board; also when the owner asks to "build epic #N".
---

# Build an epic

The owner moved this epic to "Ready for Claude", which means: build every ready sub-issue, merge each when green, and ship. The owner authorised all of this (2026-10-28), including merging to `main` (which deploys the web app to production through Vercel), applying migrations to the hosted database, and uploading to TestFlight.

You're usually running unattended. Nobody can answer questions, so never wait for input: when something needs the owner, record it and move on, as below.

Move the epic between board columns with `scripts/autopilot/status.sh <number> "<column>"`.

## 1. Read the epic

- `gh issue view <epic>` for the goal.
- Its open sub-issues, in the owner's order: `gh api repos/felixng/stubbed/issues/<epic>/sub_issues --jq '.[] | select(.state=="open") | .number'`.

## 2. For each sub-issue, in order

**Skip it, and note why, when** it's labelled `needs-decision` or `inbox`, it isn't labelled `ready`, or the part you'd build needs the owner's hands (`needs-human`: accounts, signing for a new target, Meta or Apple setup). Comment on the issue: "Skipped by the autopilot: <reason>." Then carry on with the next one.

**Otherwise build it** following the `next` skill (`.claude/skills/next/SKILL.md`), sections "Build" 1–5: branch from the latest `origin/main`, follow the CLAUDE.md files, run the repo's checks (web, database, and `apps/ios/scripts/dev build` and `test` whenever `apps/ios` changes), and open a pull request whose body starts `Closes #<number>`. If the issue is too big for one pull request, split it into sub-issues of this epic, in order, and build the first.

**Merge it when green:**
1. Wait for GitHub's checks: `gh pr checks <pr> --watch --fail-fast`. If one fails, fix it on the same branch and wait again. After two failed fixes, stop the epic (step 4).
2. iOS is not in GitHub's checks: for any pull request touching `apps/ios`, `apps/ios/scripts/dev build` and `apps/ios/scripts/dev test` must have passed on the final commit.
3. **Migrations:** if the pull request adds files under `supabase/migrations`, apply them to the hosted database before merging: `supabase db push` from the repo root (the clone is linked; the password is in `SUPABASE_DB_PASSWORD`). First read each new migration. If it drops a table or column, deletes rows, or rewrites existing data in a way that can't be undone, don't push it: label the pull request `needs-human`, comment why, and stop the epic. If the push fails, don't merge; stop the epic.
4. Merge: `gh pr merge <pr> --squash --delete-branch`. Then `git checkout main && git pull --ff-only`.
5. Check the production deploy: `gh api repos/felixng/stubbed/commits/main/status --jq .state` until it's `success` or `failure` (Vercel reports here; allow 10 minutes). On `failure`, stop the epic. Vercel keeps the previous deployment live.

## 3. Ship iOS

When every buildable sub-issue is merged and any merged pull request in this run touched `apps/ios`, upload one TestFlight build: `apps/ios/scripts/dev archive` from the repo root (Release, hosted Supabase; build number from the time). If it fails, record it and stop the epic.

## 4. Finish

- **Done:** every sub-issue is closed. Move the epic to Done (`status.sh <epic> "Done"`) and close it.
- **In review:** anything is left: skipped issues, a stopped run, a held migration. Move the epic to "In review".

Either way, comment one summary on the epic:

```
Autopilot run, <date>
Merged: #<pr> (closes #<issue>) …
TestFlight: uploaded build <number> / not needed / failed: <why>
Needs you: #<issue>: <what and why> …
```

## Never

- Push to `main` directly, force-push, or rewrite history.
- Run `supabase db reset` or anything else against the hosted database except `supabase db push`.
- Change `scripts/autopilot/`, `.claude/skills/epic/`, `.github/workflows/` or secrets as part of a run. If one of those needs changing, say so in the summary.
- Merge a pull request with failing checks, or one you didn't open in this run.
- Start work outside this epic.
