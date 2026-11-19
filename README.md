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
| "How do they expect us to pick something niche *and* spell it?" | **Typo forgiveness scales with word length:** 0 typos for words up to 4 letters, 1 for 5–7, 2 for 8–12, 3 beyond that. |
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

## Files

- `index.html`, `style.css`, `app.js`: UI
- `logic.js`: matching, anti-exploit rules, tiers, daily seed, depth (no DOM, so it's testable)
- `data.js`: 17 prompts with about 25 answers each. Add more here.
- `test.js`: run `node test.js`

## Ideas for next

- Real crowd-sourced rarity (a tiny backend that counts answers per day)
- Review queue for appealed answers
- Puffer Party style multiplayer
