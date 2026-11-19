#!/usr/bin/env python3
"""
Build data.js (what the game loads) from data/prompts.json (what you edit).

Where each answer's rarity (% of players who'd say it) comes from, best first:
  1. "pct" written by hand in prompts.json (always wins)
  2. Research norms: CSV files dropped into data/norms/ (see README "Real rarity data")
  3. wordfreq estimate: a model fitted on the hand-written answers that maps how
     common a word is in everyday English (Zipf frequency) to how often players say it

Also prints a sanity report: hand-written answers whose rarity tier disagrees a lot
with what the norms or wordfreq suggest, so you can double-check them.

Usage:
  pip install wordfreq
  python scripts/build_data.py            # writes data.js
  python scripts/build_data.py --check    # report only, writes nothing
"""
import argparse, csv, glob, json, math, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "prompts.json")
OUT = os.path.join(ROOT, "data.js")
NORMS_DIR = os.path.join(ROOT, "data", "norms")

TIER_EDGES = [0.2, 1, 5, 15]  # krillion < 0.2 < deep < 1 < rare < 5 < schooler < 15 < plankton
TIER_NAMES = ["krillion", "deep", "rare", "schooler", "plankton"]
PCT_MIN, PCT_MAX = 0.02, 30.0

# Column names we recognise in norms CSVs (case-insensitive). Banks & Connell (2022)
# and most category-production norms use some variant of these.
COLS = {
    "category": ["category", "cat", "category_name"],
    "response": ["response", "exemplar", "item", "concept", "word", "member"],
    "first": ["first_rank_frequency", "first_rank", "frf", "first_rank_freq"],
    "count": ["production_frequency", "prod_freq", "frequency", "count", "n", "pf"],
    "participants": ["n_participants", "participants", "total_participants", "n_subjects"],
}


def norm(s):
    s = unicodedata.normalize("NFD", str(s).lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = re.sub(r"^(the|a|an) ", "", s)
    return re.sub(r"\s+", " ", s).strip()


def tier(pct):
    for name, edge in zip(TIER_NAMES, TIER_EDGES):
        if pct < edge:
            return name
    return TIER_NAMES[-1]


def pick(header, key):
    low = {h.lower().strip(): h for h in header}
    for cand in COLS[key]:
        if cand in low:
            return low[cand]
    return None


def load_norms():
    """Return {category: {response: share_percent}} from every CSV in data/norms/.

    Krillion asks for ONE answer, so the best signal is first-rank frequency
    (how often a response was named first). If a file only has production
    frequency (named at any point in 60 s), shares are normalised to sum to 100,
    which over-weights long tails a little but keeps the ordering right.
    """
    out = {}
    for path in sorted(glob.glob(os.path.join(NORMS_DIR, "*.csv"))):
        with open(path, newline="", encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
        if not rows:
            continue
        h = rows[0].keys()
        c_cat, c_resp = pick(h, "category"), pick(h, "response")
        c_val = pick(h, "first") or pick(h, "count")
        if not (c_cat and c_resp and c_val):
            print(f"  ! skipped {os.path.basename(path)}: need category, response and a frequency column", file=sys.stderr)
            continue
        counts = {}
        for r in rows:
            try:
                v = float(r[c_val] or 0)
            except ValueError:
                continue
            cat, resp = norm(r[c_cat]), norm(r[c_resp])
            counts.setdefault(cat, {}).setdefault(resp, 0.0)
            counts[cat][resp] += v
        for cat, d in counts.items():
            total = sum(d.values()) or 1
            out.setdefault(cat, {}).update({k: 100 * v / total for k, v in d.items()})
        print(f"  loaded norms: {os.path.basename(path)} ({len(counts)} categories, using '{c_val}')")
    return out


def zipf(name, aliases):
    from wordfreq import zipf_frequency
    return max(zipf_frequency(n, "en") for n in [name, *aliases])


def fit(points):
    """Least squares: log10(pct) = a + b * zipf."""
    n = len(points)
    mx = sum(x for x, _ in points) / n
    my = sum(y for _, y in points) / n
    sxx = sum((x - mx) ** 2 for x, _ in points) or 1
    b = sum((x - mx) * (y - my) for x, y in points) / sxx
    a = my - b * mx
    ss_res = sum((y - (a + b * x)) ** 2 for x, y in points)
    ss_tot = sum((y - my) ** 2 for _, y in points) or 1
    return a, b, 1 - ss_res / ss_tot


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only; don't write data.js")
    args = ap.parse_args()

    try:
        import wordfreq  # noqa: F401
    except ImportError:
        sys.exit("wordfreq is missing: pip install wordfreq")

    prompts = json.load(open(SRC, encoding="utf-8"))
    norms = load_norms()

    # Fit wordfreq -> rarity on hand-written answers that have a real word frequency.
    pts = []
    for p in prompts:
        for a in p["answers"]:
            if a.get("pct") and not a.get("clever"):
                z = zipf(a["name"], a.get("aliases", []))
                if z > 0:
                    pts.append((z, math.log10(a["pct"])))
    a0, b0, r2 = fit(pts)
    print(f"  wordfreq model: log10(pct) = {a0:.2f} + {b0:.2f} * zipf   (R² = {r2:.2f}, n = {len(pts)})")

    sources = {"hand": 0, "norms": 0, "wordfreq": 0}
    disagreements = []
    for p in prompts:
        cat = norm(p.get("norms_category") or "")
        cat_norms = norms.get(cat, {})
        for a in p["answers"]:
            keys = [norm(a["name"]), *map(norm, a.get("aliases", []))]
            from_norms = max((cat_norms[k] for k in keys if k in cat_norms), default=None)
            z = zipf(a["name"], a.get("aliases", []))
            from_wf = min(PCT_MAX, max(PCT_MIN, 10 ** (a0 + b0 * z))) if z > 0 else PCT_MIN

            if a.get("pct"):
                sources["hand"] += 1
                other, label = (from_norms, "norms") if from_norms is not None else (from_wf, "wordfreq")
                gap = abs(TIER_NAMES.index(tier(a["pct"])) - TIER_NAMES.index(tier(other)))
                if not a.get("clever") and gap >= (2 if label == "norms" else 3):
                    disagreements.append((p["id"], a["name"], a["pct"], label, other))
            elif from_norms is not None:
                a["pct"], a["source"] = round(max(PCT_MIN, from_norms), 3), "norms"
                sources["norms"] += 1
            else:
                a["pct"], a["source"] = round(from_wf, 3), "wordfreq"
                sources["wordfreq"] += 1

    print(f"  rarity sources: {sources['hand']} hand-written, {sources['norms']} from norms, {sources['wordfreq']} estimated by wordfreq")
    for p in prompts:
        for a in p["answers"]:
            if a.get("source"):
                print(f"    + {p['id']}: {a['name']} -> {a['pct']}% [{tier(a['pct'])}] via {a['source']}")
    if disagreements:
        print(f"\n  Worth a second look ({len(disagreements)} hand-written answers far from the data):")
        for pid, name, pct, label, other in disagreements:
            print(f"    ? {pid}: {name} is {pct}% [{tier(pct)}] by hand, {label} says {other:.2f}% [{tier(other)}]")

    if args.check:
        return
    rows = []
    for p in prompts:
        ans = []
        for a in p["answers"]:
            item = [a["name"], a["pct"]]
            if a.get("aliases") or a.get("clever"):
                item.append(a.get("aliases", []))
            if a.get("clever"):
                item.append("clever")
            ans.append(json.dumps(item, ensure_ascii=False))
        rows.append(f'  {{ id: {json.dumps(p["id"])}, text: {json.dumps(p["text"])}, answers: [\n    '
                    + ",\n    ".join(ans) + "\n  ]}")
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// GENERATED by scripts/build_data.py from data/prompts.json. Edit that file, not this one.\n"
                "// Each answer: [displayName, percentOfPlayers, aliases?, flag?]. flag \"clever\" = Too Clever trap.\n"
                "const PROMPTS = [\n" + ",\n".join(rows) + "\n];\n\n"
                'if (typeof module !== "undefined") module.exports = { PROMPTS };\n')
    print(f"\n  wrote {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
