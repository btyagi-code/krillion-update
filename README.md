# 🦐 Krillion Update

A fan remix of [Krillion.io](https://krillion.io/), the daily rare-answer game. You get seven prompts, and the rarer your answer, the deeper you sink. This version keeps the core game and changes the things players complain about most.

> Unofficial fan project. Not affiliated with krillion.io. The answer rarity percentages are hand-estimated, not real player data.

## Play

No build step. Open `index.html` in a browser, or turn on GitHub Pages:
**Settings → Pages → Deploy from branch → `main` / root**.

## What players wanted changed, and what this version does

| Player complaint | Change |
|---|---|
| The 25-second timer is stressful | **Pace picker:** Classic 25s, Chill 45s, or Zen (no timer). Only Classic daily dives count toward your streak. |
| Autocorrect confirmations eat the clock | **The clock pauses for up to 5 seconds** while you confirm a spelling fix. It's a grace period, not a free break. |
| "How do they expect us to pick something niche *and* spell it?" | **Typo forgiveness scales with word length:** 0 typos for words up to 4 letters, 1 for 5–7, 2 for 8–12, 3 beyond that. **Sound-alike matching** (Double Metaphone) also catches spellings like *kosmoseratops*, but only when the spelling is close too: tested against the 5,000 most common English words, it dropped false matches from 412 to 5, and every match still asks you to confirm. |
| The "James method" (typing a common first name that autocorrects to a rare answer) | **Whole-answer matching only:** a fuzzy match must share the first letter, compare against the *full* answer, and be the only best candidate. Typing one word of a multi-word answer gets "be more specific", never a free upgrade. |
| "Too Clever" feels like a hidden trap | **Explained when you hit it**, with how many divers picked the same "rare" answer. |
| Valid answers get rejected | **A miss doesn't end your turn.** Try again, or flag the answer. Flags are saved to an appeals list (`localStorage` key `ku:appeals`). |
| "What should I have said?" | **Post-dive review** lists the deepest answers for every prompt. |

## Scoring

| Tier | Share of players | Points |
|---|---|---|
| 💎 One in a Krillion | < 0.2% | 100 |
| 🦑 Deep Cut | < 1% | 85 |
| 🐙 Rare | < 5% | 60 |
| 🐟 Schooler | < 15% | 30 |
| 🦠 Plankton | ≥ 15% | 10 |
| 🤡 Too Clever | the "trying to be rare" answer | 15 |

The total maps onto real ocean zones, from the Sunlight Zone down to the Hadal Zone. A perfect 700 reaches Challenger Deep at 10,935 m.

## Real rarity data

Answers live in `data/prompts.json`. Run the build script to regenerate `data.js`:

```bash
pip install wordfreq
python scripts/build_data.py           # writes data.js
python scripts/build_data.py --check   # report only
```

Each answer's rarity comes from, in order:

1. **`pct` you write by hand** (always wins).
2. **Research norms.** Drop CSVs into `data/norms/` and set `norms_category` on a prompt. The script reads columns like `category`, `response`, and `first_rank_frequency` (or `production_frequency`). Good sources:
   - Banks & Connell (2022): 117 categories, UK. Data: https://osf.io/jgcu6/
   - Van Overschelde, Rawson & Dunlosky (2004): US update of Battig & Montague (1969)
3. **A wordfreq estimate** for anything else. A model fitted on the hand-written answers maps how common a word is in English to how often players name it. It's rough (R² ≈ 0.33) and only fills gaps. To add an answer, put `{"name": "Sapodilla", "pct": null}` in `prompts.json` and rebuild.

The script also lists hand-written numbers that disagree strongly with the data, so you can recheck them.

## Files

- `index.html`, `style.css`, `app.js`: UI
- `logic.js`: matching, anti-exploit rules, tiers, daily seed, depth (no DOM, so it's testable)
- `data/prompts.json`: 17 prompts with about 27 answers each. **Edit this one.**
- `data.js`: generated from the JSON by `scripts/build_data.py`
- `vendor/double-metaphone.js`: sound-alike matching ([words/double-metaphone](https://github.com/words/double-metaphone), MIT)
- `test.js`: run `node test.js`

## Ideas for next

- A Wikidata answer-list generator, so fewer valid answers get rejected
- Real crowd-sourced rarity (a tiny backend that counts answers per day)
- Review queue for appealed answers
- Puffer Party style multiplayer
