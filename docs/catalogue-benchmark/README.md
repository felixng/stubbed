# Catalogue benchmarks

## London held show types (#450, 2026-11-08)

Shows London Theatre gives no category for are held as `unknown_show_type`. These files show what the
model-assisted type step would do with them.

| File | What it is |
|---|---|
| `london-held-titles.json` | The 310 held titles at a venue (from 313 events), exported from a rolled-back identity pass on hosted data. Each row has only what the model is sent: title, venue name, first and last dates, plus the keys to store answers. |
| `london-show-type-answers.json` | Every answer from [run 42513782100](https://github.com/felixng/stubbed/actions/runs/42513782100): `claude-haiku-5-5`, prompt version 1, title only for all 310 titles, then web search for the 113 that came back unsure or below 0.80. |
| `london-show-types-sample.csv` | **100 sampled answers to check by hand** (a deterministic sample by title hash). Fill in `correct_type` (blank means the answer is right) and `notes`. `would_publish_as` is `(held)` when the final answer isn't confident. |

To re-run: workflow "Catalogue crawl", input `show_types: benchmark` (spends, capped by `CRAWL_TYPE_SPEND_USD`,
default $2) or `show_types: dry-run` (no model calls).

### Cost

| Pass | Calls | Input tokens | Output tokens | Searches | Cost |
|---|---|---|---|---|---|
| Title only | 310 | 196,185 | 5,203 | 0 | $0.02 |
| Web search (unsure only) | 113 | 1,661,103 | 40,066 | 113 | $1.32 |
| **Total** | | | | | **$1.34** |

### Answers

- Title only: 197 of 310 confident (at least 0.80), 113 unsure or below 0.80.
- Web search: 75 of those 113 became confident; 38 stay unsure.
- Final: 272 titles would publish (44 musical, 81 play, 24 opera, 29 dance, 22 comedy, 16 stand-up, 37 concert,
  19 other); 38 stay held.

### Rolled-back dry run on hosted data

[Run 42514195298](https://github.com/felixng/stubbed/actions/runs/42514195298) did all of this in one
transaction, then rolled it back: apply the migration, switch London publication on, publish every London
extraction, load the answers, publish again.

| | Before answers | With answers |
|---|---|---|
| Held as `unknown_show_type` | 313 | **36** |
| Linked events | 152 | 402 |
| `plausible_show_requires_resolution` | 222 | 239 |
| `uncorroborated_exact_show` | 195 | 206 |

- **247 new shows** would be created from suggestions: 78 play, 41 musical, 33 concert, 27 dance, 19 comedy,
  19 other, 18 opera, 12 stand-up. 174 came from the title-only answer, 73 from web search. 250 events link
  to them.
- About 28 confident titles still wait, by design. Once one suggested show exists, a similar title elsewhere goes
  to review (`plausible_show_requires_resolution`, +17). The same title at a different venue needs
  corroboration (`uncorroborated_exact_show`, +11).

### Hand check of the sample (2026-11-08)

Checked by Claude from its own knowledge, with a web search for four titles it wasn't sure of. Not yet checked
by the owner. Corrections are in `correct_type`; borderline calls are in `notes`.

- **89 of the 100 would publish; 82 of those have the right type: 92% accurate.** The 11 held rows don't publish.
- **The 7 wrong ones:**
  - *Don Quixote*, the RSC play, answered dance.
  - *Like Water for Chocolate*, the Wheeldon ballet, answered musical.
  - *The Secret Diary of Adrian Mole*, the musical, answered play.
  - *Go Your Own Way*, a tribute concert, answered musical.
  - *West End Musical Christmas*, a concert, answered musical.
  - *Unbelievable*, a magic show, answered play.
  - *Chrishell Stause: Up Close and Personal*, a talk, answered stand-up.
- **The pattern:** a title shared by another kind of work (the novel, the ballet or the musical), and song
  compilations or tribute nights called musicals.
- **8 debatable calls are counted as right:** comic plays as comedy or play, and one-person shows. Counting
  them all wrong would give 83%.

Any wrong answers can be reverted by provenance (`crawl_revert_show_type_suggestions`).
