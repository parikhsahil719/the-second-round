"""End-to-end scout-notes demo: seed notes -> extraction -> posterior vs board prior.

Run: python model/notes_demo.py            (all seeded notes, live LLM if key present)
     python model/notes_demo.py "Name"     (one player)
Writes data/processed/seed_note_results.json for the app to serve as precomputed examples.
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import TIERS  # noqa: E402
from extract import extract  # noqa: E402
from notes import update  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PROCESSED = ROOT / "data" / "processed"

if __name__ == "__main__":
    board = pd.read_parquet(PROCESSED / "board_2026.parquet")
    seeds = json.loads((ROOT / "data" / "seed_notes.json").read_text(encoding="utf-8"))
    only = " ".join(sys.argv[1:]) or None

    results = []
    for s in seeds:
        if only and s["player_name"] != only:
            continue
        row = board[board.player_name == s["player_name"]]
        if row.empty or pd.isna(row.iloc[0].p_OOL):
            print(f"skip {s['player_name']} (not model-scored)")
            continue
        r = row.iloc[0]
        prior = np.array([r[f"p_{t}"] for t in TIERS])
        traits, mode = extract(s["note"])
        posterior, tilt = update(prior, {t["trait"]: (t["score"], t["confidence"])
                                         for t in traits})
        star_pre, star_post = prior[4] + prior[5], posterior[4] + posterior[5]
        results.append({**s, "extraction_mode": mode, "traits": traits,
                        "prior": prior.round(4).tolist(),
                        "posterior": posterior.round(4).tolist(),
                        "tilt": round(tilt, 3),
                        "p_star_prior": round(float(star_pre), 4),
                        "p_star_posterior": round(float(star_post), 4)})
        summary = ", ".join(f"{t['trait']}{t['score']:+d}" for t in traits)
        print(f"{s['player_name']:24s} [{mode}] tilt {tilt:+.2f}  "
              f"P(STAR) {star_pre:.2f} -> {star_post:.2f}  ({len(traits)} traits: {summary})")

    out = PROCESSED / "seed_note_results.json"
    out.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\nsaved {len(results)} results -> {out}")
