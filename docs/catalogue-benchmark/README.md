# Catalogue benchmarks

## London held show types (#450, 2026-11-08)

Shows London Theatre gives no category for are held as `unknown_show_type`. These files show what the
model-assisted type step would do with them.

| File | What it is |
|---|---|
| `london-held-titles.json` | The 310 held titles at a venue (from 313 events), exported from a rolled-back identity pass on hosted data. Each row has only what the model is sent: title, venue name, first and last dates, plus the keys to store answers. |
| `london-show-type-answers.json` | **Prompt v2** answers ([run 42515940783](https://github.com/felixng/stubbed/actions/runs/42515940783)): `claude-haiku-5-5`, with circus added, and told to judge the production rather than the title. Title only for all 310 titles, then web search for the 109 that came back unsure or below 0.80. |
| `london-show-type-answers-v1.json` | Prompt v1 answers ([run 42513782100](https://github.com/felixng/stubbed/actions/runs/42513782100)), kept for comparison. |
| `london-show-types-sample.csv` | **100 sampled v2 answers, hand-checked** (the same rows as v1: a deterministic sample by title hash). `correct_type` is filled where an answer is wrong; `notes` holds borderline calls and v1-to-v2 changes. `would_publish_as` is `(held)` when the final answer isn't confident. |

To re-run: workflow "Catalogue crawl", input `show_types: benchmark` (spends, capped by `CRAWL_TYPE_SPEND_USD`,
default $2) or `show_types: dry-run` (no model calls).

### Cost

| Pass | v1 calls | v1 cost | v2 calls | v2 input / output tokens | v2 searches | v2 cost |
|---|---|---|---|---|---|---|
| Title only | 310 | $0.02 | 310 | 263,455 / 5,202 | 0 | $0.03 |
| Web search (unsure only) | 113 | $1.32 | 109 | 1,644,226 / 39,889 | 109 | $1.27 |
| **Total** | | **$1.34** | | | | **$1.30** |

### Answers

| | v1 | v2 |
|---|---|---|
| Confident from the title alone | 197 | 201 |
| Made confident by web search | 75 of 113 | 79 of 109 |
| Would publish | 272 | **280** |
| Still held | 38 | **30** |

v2 by type: 37 musical, 77 play, 25 opera, 25 dance, 22 comedy, 12 stand-up, 51 concert, 6 circus, 25 other.

### Rolled-back dry run on hosted data

Each run did all of this in one transaction, then rolled it back: apply the migration, switch London publication
on, publish every London extraction, load the answers, publish again.
v1 is [run 42514195298](https://github.com/felixng/stubbed/actions/runs/42514195298); v2 is
[run 42517121146](https://github.com/felixng/stubbed/actions/runs/42517121146).

| | No answers | v1 answers | v2 answers |
|---|---|---|---|
| Held as `unknown_show_type` | 313 | 36 | **28** |
| Linked events | 152 | 402 | 409 |
| New shows from suggestions | 0 | 247 | **254** |
| `plausible_show_requires_resolution` | 222 | 239 | 240 |
| `uncorroborated_exact_show` | 195 | 206 | 206 |

- **v2's new shows by type:** 74 play, 37 musical, 45 concert, 22 dance, 19 comedy, 24 other, 20 opera, 8 stand-up,
  5 circus.
- **Where they came from:** 179 from the title-only answer, 75 from web search. 257 events link to them.
- **About 26 confident titles still wait, by design.** Once one suggested show exists, a similar title elsewhere
  goes to review. The same title at a different venue needs corroboration.

### Hand check of the sample (2026-11-08)

Checked by Claude from its own knowledge, with a web search for five titles it wasn't sure of. Not yet checked by
the owner.

| | v1 | v2 |
|---|---|---|
| Sampled answers that would publish | 89 | 94 |
| Right | 82 (**92%**) | 88 (**94%**) |
| Debatable, counted right | 8 | 12 |
| Right if every debatable call is wrong | 83% | 81% |

- **v2 fixed 3:** the celebrity talk (now other), the magic show *Unbelievable* (now other) and *West End Musical
  Christmas* (now concert). Circus now types *360 ALLSTARS* and *Return of the GODZ*.
- **4 errors remain:**
  - *Don Quixote*, the RSC play, now answered musical.
  - *Like Water for Chocolate*, the Royal Opera House ballet, still answered musical despite the venue hint.
  - *The Secret Diary of Adrian Mole*, the musical, answered play.
  - *Go Your Own Way*, a tribute concert, answered musical.
- **2 new errors:**
  - *So Are We: León & Lightfoot*, the ROH dance programme, answered concert (v1 was right).
  - *The Mongol Khan*, a play that v1 held, published as opera.
- **New debatable calls:**
  - Trevor Ashley's drag cabaret, answered concert (the prompt says drag is other).
  - A fundraising gala, answered concert.
  - *La Clique*, answered circus.
- **What's left is mostly well-known titles** that are also another kind of work. A short list of known productions
  (or a deterministic venue rule: Royal Opera House means opera or dance) would fix more than prompting.

Any wrong answers can be reverted by provenance (`crawl_revert_show_type_suggestions`).
