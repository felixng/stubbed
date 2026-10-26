---
name: idea
description: File the owner's idea, bug, improvement or change of direction for Stubbed. Use whenever the owner shares one, however short ("import", "trips should show a map", "we're dropping labels"), often typed on a phone. Turns it into a detailed GitHub issue, or updates the product docs when it's a change of direction.
---

# Capture an idea

The owner sends ideas as they think of them, often one line, often on the street. Your job is to turn each one into something an agent can build, or into an update to the docs, with as little of the owner's time as possible.

GitHub issues on `felixng/stubbed` are the one list of work. The owner doesn't file issues by hand except as a backup (the "Quick idea" form, labelled `inbox`; the `triage` skill picks those up).

## 1. Work out what it is

- **Work item:** a feature, improvement, bug or polish. Goes to a GitHub issue.
- **Direction:** a change to what Stubbed is, who it's for, its principles or priorities ("solo first matters less now", "drop labels"). Goes to the docs (step 5), and may also create or change issues.
- **Several at once:** split them. One issue per thing that could ship on its own.

## 2. Gather context before asking anything

Read enough to answer your own questions:
- `PRODUCT.md`, and the brief when the Google Drive connector is available (`read_file_content`, id `1NdEgeTRMkKQ5TL87Urwpe7WG9fcrejPsZKsmrO2Enak`).
- The code the idea touches, on web (`apps/web`), iOS (`apps/ios`) and in `supabase/`, so the issue can name files and say what happens today.
- Existing issues: `gh issue list --state all --search "<keywords>"`. If one already covers it, add the new detail as a comment on that issue instead of filing a duplicate, and tell the owner which one.
- `docs/DECISIONS.md` for anything already decided.

## 3. Ask only what you can't work out

The owner is probably on a phone. Ask at most three questions, in one message, and only when the answer changes what gets built. Make them quick to answer: numbered, each with short lettered options and your recommendation first, so "1a 2b" is a full reply. Don't ask about things the code, the docs or a sensible default already answer.

If the owner says "just file it", or doesn't answer, file it anyway: put the questions under **Open questions** and label it `needs-decision`.

## 4. File the issue

Title: what changes, in plain words, sentence case (for example "Import past shows from a Mezzanine diary"). Prefix `[iOS]` only when the work is iOS-only.

Body, in this order, with these bold labels (skip a section only when it really has nothing):

```
**Idea (owner, YYYY-MM-DD):** the owner's words, quoted as given.

**Problem:** who has it and why it matters, tied to PRODUCT.md's users and principles.

**Today:** what happens now, with file paths.

**Proposed change:**
- concrete bullets for web, iOS and the database, as relevant
- rules go in Postgres (root CLAUDE.md), so both apps match

**Done when:** acceptance criteria someone can check, including tests.

**Out of scope:** what this deliberately leaves out.

**Open questions:** anything the owner still has to decide. Leave out when none.

**Size:** S (under a day for an agent), M (a few days), L (split it into smaller issues instead). **Areas:** web, iOS, database.

---
_Filed by Claude Code from the owner's idea._
```

Labels:
- Status: `ready` when an agent could build it now; `needs-decision` when there are open questions or it needs a product call; `needs-human` when part of it needs the owner's hands (accounts, devices, Apple or Meta setup).
- Priority: no label. The owner orders epics by dragging them on the board, and issues by their order within each epic. Add `P0` only when the owner says something is urgent; it jumps the queue.
- Area: `web`, `ios`, `database`, as many as apply.
- `claude-task` when an agent can do all of it.

Create with `gh issue create --title ... --body-file ... --label ...`. Labels are the source of truth for status and priority. The "Stubbed roadmap" project adds new issues by itself, so don't touch it (sessions usually lack project access).

**Every issue belongs to exactly one epic**, as a GitHub sub-issue. Epics are what the owner prioritises, so each one is a single outcome small enough to rank against the others, usually one to four issues. List them with `gh issue list --label epic --state open`.
- Attach the issue to the epic that fits: `gh api -X POST repos/felixng/stubbed/issues/<epic>/sub_issues -F sub_issue_id=<id>`, where `<id>` comes from `gh api repos/felixng/stubbed/issues/<number> --jq .id` (not the issue number).
- If no epic fits, create one named after the outcome (`Epic: Lists`, label `epic`, a one-paragraph goal), even if it holds only this issue. A new epic lands at the bottom of the board, so tell the owner to drag it into place.
- If an epic grows past about five issues or two outcomes, suggest splitting it to the owner.
- Mention the epic in your reply: "Filed #131 under Epic: Stats (#165)".

## 5. Direction changes

The owner has said you can decide which docs to update. Keep each fact in one place:
- **The brief** (Google Doc) holds what Stubbed is and why. Edit it when the Google Docs connector is available; otherwise tell the owner the section and the new wording.
- **`PRODUCT.md`** mirrors the brief's users, positioning, principles and constraints.
- **`CLAUDE.md` files** hold working agreements and how to build things.
- **`docs/DECISIONS.md`** gets a dated entry: what changed, and why in the owner's words.

Then look through open issues for anything the change affects. Comment on them, relabel them, or close them with the reason.

Commit doc changes on a branch named `direction/<short-slug>` and open a pull request, so the owner sees the diff before it lands.

## 6. Reply briefly

One or two lines per item: the issue link and title, its status and epic, and anything the owner has to do. For example: "Filed #131 Stats page · ready · Epic: Stats (#165)." No summaries of the issue body; the owner can open it.

## If GitHub isn't reachable

Check `gh auth status` first. If it fails, write the issue body in your reply, ready to paste into the "Quick idea" form, and say that it wasn't filed.
