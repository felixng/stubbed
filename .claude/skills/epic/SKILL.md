---
name: epic
description: Build a whole Stubbed epic end to end, one pull request per sub-issue, merging each when green, then publishing a TestFlight build. Use when the owner asks to "build epic #N".
---

# Build an epic

The owner asked you to build this epic, which means: build every ready sub-issue, merge each when green, and ship. The owner authorised all of this (2026-10-28), including merging to `main` (which deploys the web app to production through Vercel), applying migrations to the hosted database, and uploading to TestFlight.

Don't stop to ask mid-run: when something needs the owner, record it and move on, as below.

## 1. Read the epic

- `gh issue view <epic>` for the goal.
- Its open sub-issues, in the owner's order: `gh api repos/felixng/stubbed/issues/<epic>/sub_issues --jq '.[] | select(.state=="open") | .number'`.

## 2. For each sub-issue, in order

**Skip it, and note why, when** it's labelled `needs-decision` or `inbox`, it isn't labelled `ready`, or the part you'd build needs the owner's hands (`needs-human`: accounts, signing for a new target, Meta or Apple setup). Comment on the issue: "Skipped while building the epic: <reason>." Then carry on with the next one.

**Otherwise build it** following the `next` skill (`.claude/skills/next/SKILL.md`), sections "Build" 1–5. First check for an earlier, interrupted run: if a branch for this issue already exists on GitHub (`git ls-remote --heads origin "issue-<number>-*"`), check it out, merge the latest `origin/main` into it, and carry on from there instead of starting again. Otherwise branch from the latest `origin/main`. Commit and push as you go, so an interruption loses little. Then follow the CLAUDE.md files, run the repo's checks (web, database, and `apps/ios/scripts/dev build` and `test` whenever `apps/ios` changes), and open a pull request whose body starts `Closes #<number>`. If the issue is too big for one pull request, split it into sub-issues of this epic, in order, and build the first.

**Merge it when green:**
1. Wait for GitHub's checks: `gh pr checks <pr> --watch --fail-fast`. If one fails, fix it on the same branch and wait again. After two failed fixes, stop the epic (step 4).
2. iOS is not in GitHub's checks: for any pull request touching `apps/ios`, `apps/ios/scripts/dev build` and `apps/ios/scripts/dev test` must have passed on the final commit.
3. **Migrations:** if the pull request adds files under `supabase/migrations`, apply them to the hosted database before merging: `supabase db push --db-url "$HOSTED_DB_URL"` from the repo root. It needs no `supabase link`, so it works in a fresh worktree; `HOSTED_DB_URL` is the hosted Postgres connection string, set in `.claude/settings.local.json`. Never print it. Run it with `--dry-run` first and check the list. First read each new migration. If it drops a table or column, deletes rows, or rewrites existing data in a way that can't be undone, don't push it: label the pull request `needs-human`, comment why, and stop the epic. If the push fails, don't merge; stop the epic.
4. Merge: `gh pr merge <pr> --squash --delete-branch`. Then `git checkout main && git pull --ff-only`.
5. Check the production deploy: `gh api repos/felixng/stubbed/commits/main/status --jq .state` until it's `success` or `failure` (Vercel reports here; allow 10 minutes). On `failure`, stop the epic. Vercel keeps the previous deployment live.

## 3. Ship iOS

When every buildable sub-issue is merged and any merged pull request in this run touched `apps/ios`, upload one TestFlight build: `apps/ios/scripts/dev archive` from the repo root (Release, hosted Supabase; build number from the time). If it fails, record it and stop the epic.

## 4. Finish

- **Done:** every sub-issue is closed. Close the epic.
- **Not done:** anything is left: skipped issues, a stopped run, a held migration. Leave the epic open.

Either way, comment one summary on the epic:

```
Epic run, <date>
Merged: #<pr> (closes #<issue>) …
TestFlight: uploaded build <number> / not needed / failed: <why>
Needs you: #<issue>: <what and why> …
```

## Never

- Push to `main` directly, force-push, or rewrite history.
- Run `supabase db reset` or anything else against the hosted database except `supabase db push --db-url "$HOSTED_DB_URL"`.
- Change `.claude/skills/epic/`, `.github/workflows/` or secrets as part of a run. If one of those needs changing, say so in the summary.
- Merge a pull request with failing checks, or one you didn't open in this run.
- Start work outside this epic.
