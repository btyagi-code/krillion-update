// Core game logic: no DOM here, so it can be unit-tested with Node.

const TIERS = [
  { key: "krillion", name: "One in a Krillion", pts: 100, max: 0.2, emoji: "💎" },
  { key: "deep",     name: "Deep Cut",          pts: 85,  max: 1,   emoji: "🦑" },
  { key: "rare",     name: "Rare",              pts: 60,  max: 5,   emoji: "🐙" },
  { key: "schooler", name: "Schooler",          pts: 30,  max: 15,  emoji: "🐟" },
  { key: "plankton", name: "Plankton",          pts: 10,  max: Infinity, emoji: "🦠" },
];
const CLEVER = { key: "clever", name: "Too Clever", pts: 15, emoji: "🤡" };
const MISS = { key: "miss", name: "Not on the list", pts: 0, emoji: "🫧" };

function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\+/g, " plus ").replace(/#/g, " sharp ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/^(the|a|an) /, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// How many typos we forgive, based on length. Short words get none,
// so "Io" can't be reached by typing "Ia".
function allowedTypos(len) {
  if (len <= 4) return 0;
  if (len <= 7) return 1;
  if (len <= 12) return 2;
  return 3;
}

function tierFor(answer) {
  if (answer.clever) return CLEVER;
  return TIERS.find(t => answer.pct < t.max);
}

function expand(prompt) {
  return prompt.answers.map(([name, pct, aliases = [], flag]) => ({
    name, pct, clever: flag === "clever",
    keys: [name, ...aliases].map(normalize),
  }));
}

/**
 * Match a guess against a prompt's answers.
 * Returns { status: "exact"|"typo"|"vague"|"none", answer?, options? }
 *
 * Anti-"James method" rules: a fuzzy match must
 *   1. compare against the WHOLE answer, never a prefix or a single word of it,
 *   2. share the first letter,
 *   3. be the single best candidate (ties are refused as ambiguous).
 * A guess that equals just one word of a multi-word answer is "vague":
 * the player is told to be more specific instead of being upgraded.
 */
function matchGuess(prompt, guess) {
  const g = normalize(guess);
  if (!g) return { status: "none" };
  const answers = expand(prompt);

  for (const a of answers) if (a.keys.includes(g)) return { status: "exact", answer: a };

  const vague = answers.filter(a => a.keys.some(k => k.includes(" ") && k.split(" ").includes(g)));
  if (vague.length) return { status: "vague", options: vague.map(a => a.name) };

  const tol = allowedTypos(g.length);
  if (tol === 0) return { status: "none" };
  const typo = typoMatch(answers, g, tol);
  if (typo) return typo;
  return phoneticMatch(answers, g);
}

function typoMatch(answers, g, tol) {
  let best = null, bestD = Infinity, tie = false;
  for (const a of answers) {
    for (const k of a.keys) {
      if (k[0] !== g[0]) continue;
      if (Math.abs(k.length - g.length) > tol) continue;
      const d = levenshtein(g, k);
      if (d > tol) continue;
      if (d < bestD) { best = a; bestD = d; tie = false; }
      else if (d === bestD && best !== a) tie = true;
    }
  }
  if (!best) return null;
  if (tie) return { status: "vague", options: [] };
  return { status: "typo", answer: best };
}

/**
 * Sound-alike fallback (Double Metaphone), for niche words people can say but not spell:
 * "kosmoseratops" -> Kosmoceratops. Same anti-exploit guards as typos, plus:
 *   - guess must be 5+ letters and within 70–140% of the answer's length,
 *   - the full phonetic code must match exactly (not a prefix),
 *   - exactly one answer may match.
 */
const dm = (typeof require !== "undefined" ? require("./vendor/double-metaphone.js") : window).doubleMetaphone;
// First letters that can make the same sound (c/k, ph/f, x/z...).
const SOUND_GROUPS = ["ckq", "fp", "sz", "cs", "xz", "jg", "iye", "vw", "ou"];
const sameStartSound = (a, b) => a[0] === b[0] || SOUND_GROUPS.some(s => s.includes(a[0]) && s.includes(b[0]));

function phoneticMatch(answers, g) {
  if (g.length < 6) return { status: "none" };
  const flat = g.replace(/ /g, "");
  const codes = new Set(dm(flat).filter(c => c && c.length >= 4));
  if (!codes.size) return { status: "none" };
  const hits = answers.filter(a => a.keys.some(k => {
    const kf = k.replace(/ /g, "");
    if (kf.length < 7 || !sameStartSound(flat, kf)) return false;
    const r = flat.length / kf.length;
    if (r < 0.75 || r > 1.33) return false;
    // Sounds alike is not enough on its own: spelling must also be in the neighbourhood.
    if (levenshtein(flat, kf) > Math.ceil(kf.length * 0.35)) return false;
    return dm(kf).some(c => codes.has(c));
  }));
  if (hits.length === 1) return { status: "typo", answer: hits[0], phonetic: true };
  if (hits.length > 1) return { status: "vague", options: [] };
  return { status: "none" };
}

// Deterministic daily pick: same 7 prompts for everyone on a given date.
function hashStr(s) {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function dailyPrompts(prompts, dateKey, count = 7) {
  return shuffled(prompts, mulberry32(hashStr("krill:" + dateKey))).slice(0, count);
}
function randomPrompts(prompts, count = 7) {
  return shuffled(prompts, Math.random).slice(0, count);
}

// 700 max points -> Challenger Deep (~10,935 m). Gentle curve so early points feel big.
function depthFor(score) {
  const f = Math.max(0, Math.min(1, score / 700));
  return Math.round(10935 * Math.pow(f, 1.25));
}
const ZONES = [
  { name: "Sunlight Zone", until: 200 },
  { name: "Twilight Zone", until: 1000 },
  { name: "Midnight Zone", until: 4000 },
  { name: "Abyssal Zone", until: 6000 },
  { name: "Hadal Zone", until: Infinity },
];
const zoneFor = m => ZONES.find(z => m < z.until).name;

function rarestAnswers(prompt, n = 3) {
  return expand(prompt).filter(a => !a.clever).sort((x, y) => x.pct - y.pct).slice(0, n);
}

const api = { TIERS, CLEVER, MISS, normalize, levenshtein, matchGuess, tierFor, dailyPrompts,
  randomPrompts, depthFor, zoneFor, rarestAnswers, expand };
if (typeof module !== "undefined") module.exports = api;
else window.KrillLogic = api;
