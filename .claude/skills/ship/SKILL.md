---
name: ship
description: Ship a Stubbed pull request that's ready - merge it when checks are green, apply its migrations to the hosted database, close the issue, close the epic if that was the last piece, and publish a TestFlight build when the epic is complete. Use when the owner says "merge", "ship it", "merge and run the migration", or names a pull request to land.
---

# Ship a pull request

The owner asking to merge or ship a pull request authorises everything below for that pull request: merging to `main` (which deploys the web app to production through Vercel), applying its migrations to the hosted database, closing issues, and uploading to TestFlight when the epic completes. Same authority as the `epic` skill (2026-10-28). Don't ask again for each step; stop only where this file says to.

This is the single-pull-request version of `epic`. If the owner wants a whole epic built, use `epic` instead.

## 1. Pick the pull request

Use the one the owner named. Otherwise the pull request you opened most recently in this session. If neither is clear, ask. Read it first: `gh pr view <pr> --json title,body,state,mergeable,headRefName,closingIssuesReferences,files`.

Stop and say why if it is closed, is a draft, or is labelled `needs-human` or `needs-decision`.

## 2. Make it mergeable

- **Conflicts** (`mergeable` is `CONFLICTING`): check out its branch, merge the latest `origin/main`, resolve, run the repo's checks for what changed, and push. Resolve by reading both sides; keep both when two entries were added in the same place (`docs/DECISIONS.md` often). Before committing, make sure no `<<<<<<<`, `=======` or `>>>>>>>` lines remain (`grep -rn -E '^(<<<<<<<|=======|>>>>>>>)'` over the files you touched). Don't chain the commit after an edit command with `&&` unless you've checked the edit worked.
- **Green:** `gh pr checks <pr> --watch --fail-fast`. If a check fails, fix it on the same branch and wait again. After two failed fixes, stop and tell the owner.
- **iOS** is not in GitHub's checks. If the pull request touches `apps/ios`, `apps/ios/scripts/dev build` and `apps/ios/scripts/dev test` must have passed on the final commit.
- Never merge with a failing check or unresolved review request.

## 3. Read the migrations, then merge

If the pull request adds files under `supabase/migrations`, read each new one before merging. If it drops a table or column, deletes rows, or rewrites existing data in a way that can't be undone, **don't** merge or push it: label the pull request `needs-human`, comment why, and stop.

Merge: `gh pr merge <pr> --squash --delete-branch`.

`gh` may print `fatal: 'main' is already used by worktree` after the merge. That is the local branch cleanup failing, not the merge. Confirm with `gh pr view <pr> --json state`. Then `git fetch origin main`.

## 4. Apply the migrations

Only if the pull request added migrations. After the merge, from the repo root:

1. If `supabase migration list --linked` says the project isn't linked (a fresh worktree), run `supabase link --project-ref "$(cat "$(git worktree list --porcelain | awk 'NR==1{print $2}')/supabase/.temp/project-ref")"`. The project ref is in `supabase/.temp/project-ref` in the main checkout (the first entry of `git worktree list`), and the password is in `SUPABASE_DB_PASSWORD`.
2. `supabase db push --dry-run` and check the list. It may include migrations from other merged pull requests that were never pushed. Those are fine to apply, but say so in the summary.
3. `supabase db push --yes`.
4. Verify with one read-only query that the change is in place (the new function exists, the backfill ran), and report what you saw.

The order matters: merging first means production web briefly runs new code against the old schema while Vercel deploys. That is fine for additive migrations (new tables, columns, functions), which is what we write. If the new web code **requires** the schema (it calls a function that doesn't exist yet) and the migration is slow or the deploy is fast, push the migration first and say you did.

If the push fails, don't retry blindly. Report the error without credentials, leave the pull request merged, and tell the owner the migration is pending.

Never run `supabase db reset` or anything else that writes to the hosted database except `supabase db push`. Data fixes (such as merging duplicate venues) are separate: list what you'd change and wait for the owner's go-ahead.

## 5. Check the production deploy

`gh api repos/felixng/stubbed/commits/main/status --jq .state` until it is `success` or `failure` (Vercel reports here; allow 10 minutes). On `failure`, tell the owner. Vercel keeps the previous deployment live.

## 6. Close out the issues

- The pull request body starts `Closes #<n>`, so GitHub closes the issue on merge. Check with `gh issue view <n> --json state`; if it's still open, close it with a comment linking the pull request.
- Don't close an issue whose "Done when" isn't met by the pull request. If part needs the owner (a hosted data fix, an account step), leave it open and say what's left.
- Remove `in-progress` if it's still on the issue.

## 7. Close the epic if that was the last piece

Find the epic: the issue's parent (`gh api repos/felixng/stubbed/issues/<n>/parent --jq .number`, if it has one).

- List what's still open: `gh api repos/felixng/stubbed/issues/<epic>/sub_issues --jq '.[] | select(.state=="open") | .number'`.
- **Any open:** leave the epic open. Say how many remain.
- **None open:** close the epic with a comment in the `epic` skill's summary format:

```
Epic complete, <date>
Merged: #<pr> (closes #<issue>) …
TestFlight: uploaded build <number> / not needed / failed: <why>
Needs you: nothing / <what>
```

Include the earlier pull requests too: `gh pr list --state merged --search "<issue numbers>"`.

## 8. TestFlight when the epic is complete

Only when the epic just closed. Did any of its merged pull requests touch `apps/ios`? Check each: `gh pr view <pr> --json files --jq '.files[].path' | grep -q '^apps/ios/'`.

- **Yes:** from the repo root on an up-to-date `main`, run `apps/ios/scripts/dev archive` (Release, hosted Supabase; build number from the time). It needs the owner's Apple account in Xcode, which the owner has authorised for this. If it fails, don't retry in a loop: record the reason in the epic comment and tell the owner.
- **No:** say "TestFlight: not needed" in the epic comment.

Don't upload a build for a single pull request that didn't complete its epic.

## 9. Report

Reply with a few lines:

- the pull request, merged or why not
- migrations applied (names) or none
- issues closed, and the epic if it closed
- TestFlight build number, or not needed
- anything left for the owner

## Never

- Push to `main` directly, force-push, or rewrite history.
- Merge a pull request with failing checks, or push a destructive migration.
- Change `.github/workflows/` or secrets as part of shipping.
- Run data fixes against the hosted database without the owner's go-ahead.
- Print database URLs, passwords or tokens.
