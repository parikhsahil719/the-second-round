"""The Second Round API: board, player one-pagers, live scout-note updates.

Endpoints:
  GET  /board           full 2026 board (chips, tier probs, edges, coverage)
  GET  /player/{slug}   one-pager: distribution, markets, translated why, comps, seed notes
  POST /notes           {slug, note, api_key?} -> extraction + posterior (rate-capped)

Rate protection on /notes: per-IP daily limit + global monthly cap on the demo key
(both waived when the caller brings their own key). Counters persist to a local json.

Run: uvicorn api.main:app --reload  (from repo root)
"""

import json
import re
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "model"))
sys.path.insert(0, str(ROOT / "pipeline"))
from common import TIERS  # noqa: E402

PROCESSED = ROOT / "data" / "processed"
PER_IP_DAILY = 10
GLOBAL_MONTHLY = 2000
USAGE_FILE = ROOT / "api" / "usage.json"

app = FastAPI(title="The Second Round")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"])

# feature -> (phrase when it helps, phrase when it hurts). Fallback: prettified name.
TRANSLATE = {
    "porpag": ("Elite offensive production for the level", "Offensive production below the bar"),
    "bpm_c": ("Big overall college impact", "Overall college impact underwhelms"),
    "obpm_c": ("Strong offensive impact numbers", "Offensive impact numbers lag"),
    "dbpm_c": ("Real defensive impact on tape... and in the data", "Defensive impact doesn't show up"),
    "age_at_draft": ("Old for the class — production gets an age discount", "Young for the class — time is on his side"),
    "class_ord": ("Upperclassman — seniors must dominate to project", "Produced as an underclassman"),
    "rec_score": ("Blue-chip pedigree backs the profile", "Unheralded recruit — pedigree doesn't vouch for him"),
    "ts": ("Efficient scorer", "Efficiency concerns — points come expensively"),
    "efg": ("Strong shot-making efficiency", "Shot-making efficiency below par"),
    "usg": ("Carried a heavy offensive load", "Modest offensive role"),
    "min_pct": ("Trusted with big minutes", "Couldn't stay on the floor"),
    "ft_pct_shr": ("Free-throw stroke projects the jumper", "Free-throw stroke is a shooting red flag"),
    "three_pct_shr": ("Made threes at volume", "Three-ball hasn't fallen"),
    "three_rate": ("Lets it fly from deep", "Reluctant three-point shooter"),
    "two_pct_shr": ("Finishes twos efficiently", "Struggles to convert inside the arc"),
    "rim_pct_shr": ("Elite finisher at the rim", "Finishing at the rim is a problem"),
    "rim_share": ("Lives at the rim", "Settles away from the rim"),
    "dunk_share": ("Plays above the rim", "Rarely plays above the rim"),
    "ast_pct": ("Real playmaking chops", "Assist numbers light for the role"),
    "ast_x_guard": ("Runs an offense like a lead guard should", "Assist rate light for a lead guard"),
    "tov_pct": ("Turnover-prone", "Takes care of the ball"),
    "ast_tov": ("Clean decision-making in the numbers", "Decision-making numbers are messy"),
    "stl_pct": ("Ball-hawk instincts — steals travel to the NBA", "Doesn't create defensive events"),
    "blk_pct": ("Shot-blocking presence", "No rim deterrence"),
    "blk_x_big": ("Protects the rim like a big should", "A big who doesn't protect the rim"),
    "orb_pct": ("Attacks the offensive glass", "Absent on the offensive glass"),
    "drb_pct": ("Cleans the defensive glass", "Weak defensive rebounder"),
    "height_in": ("Positional size", "Undersized for the role"),
    "wingspan_minus_height": ("Length beyond his height", "Short arms for his height"),
    "wingspan": ("NBA-caliber length", "Length is ordinary"),
    "career_bpm": ("Produced across his whole college career", "Career production is thin"),
    "d_bpm": ("Clear year-over-year improvement", "Development flatlined"),
    "d_usg": ("Took on a bigger role and kept producing", "Role never grew"),
    "mp_total": ("Big body of work", "Small sample of college minutes"),
    "adjoe": ("Drove an efficient offense", "Offense sputtered with him on the floor"),
    "adrtg": ("Defense leaked with him out there", "Anchored a strong defense"),
    "lane_agility_time": ("Heavy feet in agility testing", "Quick feet in agility testing"),
    "three_quarter_sprint": ("Slow in the open floor", "Real speed in the open floor"),
    "rec_missing": ("No recruiting pedigree on record", "Carried a recruiting ranking"),
    "combine_missing": ("Skipped combine measurement", "Measured at the combine"),
    "gp": ("Full season of games", "Short season — small sample"),
    "n_seasons": ("Multi-year college résumé", "One college season to judge"),
    "dporpag": ("Defensive value stacks up", "Defensive value is minimal"),
}


def translate_why(why_json: str) -> list[dict]:
    """Phrase describes what's TRUE (value z-sign); contribution says which way it pushes.
    They differ on negative-coefficient features: an unranked recruit reads 'Unheralded
    recruit' with a positive push, because that profile historically overdelivers."""
    out = []
    for item in json.loads(why_json or "[]"):
        feat, contrib, z = (item + [None])[:3] if len(item) < 3 else item
        sign = z if z is not None else contrib
        hi, lo = TRANSLATE.get(feat, (None, None))
        phrase = (hi if sign > 0 else lo) or \
            f"{'High' if sign > 0 else 'Low'} {feat.replace('_', ' ')}"
        out.append({"text": phrase, "feature": feat, "contribution": contrib})
    return out


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def chip(edge) -> str:
    if edge is None or (isinstance(edge, float) and np.isnan(edge)):
        return "N/A"
    return "BUY" if edge > 2 else ("FADE" if edge < -2 else "HOLD")


def load_board() -> pd.DataFrame:
    b = pd.read_parquet(PROCESSED / "board_2026.parquet")
    b["slug"] = b.player_name.map(slugify)
    return b


BOARD = load_board()
SEEDS = json.loads((PROCESSED / "seed_note_results.json").read_text(encoding="utf-8")) \
    if (PROCESSED / "seed_note_results.json").exists() else []

AVAIL = pd.read_parquet(PROCESSED / "availability.parquet") \
    if (PROCESSED / "availability.parquet").exists() else None
if (PROCESSED / "headshots.parquet").exists():
    _hs = pd.read_parquet(PROCESSED / "headshots.parquet")
    HEADSHOTS = dict(zip(_hs.player_name, _hs.headshot_url))
else:
    HEADSHOTS = {}


def public_row(r) -> dict:
    d = {"slug": r.slug, "player_name": r.player_name,
         "college": None if pd.isna(r.college) else r.college,
         "headshot_url": HEADSHOTS.get(r.player_name),
         "pick": None if pd.isna(r.pick) else int(r.pick),
         "consensus_rank": None if pd.isna(r.consensus_rank) else int(r.consensus_rank),
         "coverage": r.coverage, "pos": None if pd.isna(r.pos) else r.pos}
    if r.coverage == "model":
        d.update({
            "tiers": {t: round(float(getattr(r, f"p_{t}")), 4) for t in TIERS},
            "p_star": round(float(r.p_STAR), 4),
            "p_star_lo": round(float(r.p_STAR_lo), 4),
            "p_star_hi": round(float(r.p_STAR_hi), 4),
            "ev_model": round(float(r.ev_model), 2),
            "ev_slot": round(float(r.ev_slot), 2),
            "ev_consensus": None if pd.isna(r.ev_consensus) else round(float(r.ev_consensus), 2),
            "edge_slot": None if pd.isna(r.edge_slot) else round(float(r.edge_slot), 2),
            "edge_consensus": None if pd.isna(r.edge_consensus) else round(float(r.edge_consensus), 2),
            "chip": chip(None if pd.isna(r.edge_slot) else float(r.edge_slot)),
            "star_flag": bool(r.star_flag),
            "age": None if pd.isna(r.age_at_draft) else round(float(r.age_at_draft), 1),
            "why_pos": [w["text"] for w in translate_why(r.why) if w["contribution"] > 0][:2],
            "why_neg": [w["text"] for w in translate_why(r.why) if w["contribution"] < 0][:2],
        })
    return d


@app.get("/board")
def board():
    rows = [public_row(r) for r in BOARD.itertuples()]
    return {"rows": rows, "tiers": TIERS}


@app.get("/player/{slug}")
def player(slug: str):
    hit = BOARD[BOARD.slug == slug]
    if hit.empty:
        raise HTTPException(404, "unknown player")
    r = hit.iloc[0]
    d = public_row(r)
    if r.coverage == "model":
        d["why"] = translate_why(r.why)
        d["comps"] = [{"name": c.rsplit(" (", 1)[0], "tier": c.rsplit(" (", 1)[1].rstrip(")")}
                      for c in (r.comps or "").split(" | ") if "(" in c]
    d["seed_notes"] = [s for s in SEEDS if s["player_name"] == r.player_name]
    return d


@app.get("/warroom/{pick}")
def warroom(pick: int):
    """Standing at pick N: availability % and model view for every relevant player."""
    if AVAIL is None:
        raise HTTPException(503, "availability simulation not built")
    if not 1 <= pick <= 60:
        raise HTTPException(400, "pick must be 1-60")
    col = f"avail_{pick}"
    rows = []
    by_name = BOARD.set_index("player_name")
    for a in AVAIL.itertuples():
        avail = float(getattr(a, col))
        if avail < 0.01:
            continue
        b = by_name.loc[a.player_name] if a.player_name in by_name.index else None
        rows.append({
            "player_name": a.player_name,
            "slug": b.slug if b is not None else None,
            "headshot_url": HEADSHOTS.get(a.player_name),
            "consensus_rank": int(a.consensus_rank),
            "actual_pick": None if pd.isna(a.actual_pick) else int(a.actual_pick),
            "availability": round(avail, 3),
            "ev_model": None if b is None or pd.isna(b.get("ev_model")) else round(float(b.ev_model), 2),
            "p_star": None if b is None or pd.isna(b.get("p_STAR")) else round(float(b.p_STAR), 3),
            "chip": chip(None if b is None or pd.isna(b.get("edge_slot")) else float(b.edge_slot)),
        })
    rows.sort(key=lambda r: (-(r["ev_model"] or -1), r["consensus_rank"]))
    return {"pick": pick, "players": rows,
            "note": "Availability from 10,000 draft simulations calibrated on consensus-vs-actual slide; no team-need modeling."}


class TraitsIn(BaseModel):
    slug: str
    traits: list[dict]


@app.post("/posterior")
def posterior_from_traits(body: TraitsIn):
    """Recompute a posterior from an explicit trait set (saved scout book) — no LLM, no caps."""
    hit = BOARD[BOARD.slug == body.slug]
    if hit.empty or hit.iloc[0].coverage != "model":
        raise HTTPException(404, "player not model-scored")
    r = hit.iloc[0]
    from notes import update
    prior = np.array([float(getattr(r, f"p_{t}")) for t in TIERS])
    clean = {}
    for t in body.traits[:24]:
        try:
            clean[str(t["trait"])] = (int(t["score"]), float(t["confidence"]))
        except (KeyError, TypeError, ValueError):
            continue
    post, tilt = update(prior, clean)
    return {"tilt": round(tilt, 3),
            "prior": {t: round(float(p), 4) for t, p in zip(TIERS, prior)},
            "posterior": {t: round(float(p), 4) for t, p in zip(TIERS, post)}}


class NoteIn(BaseModel):
    slug: str
    note: str
    api_key: str | None = None


def _usage() -> dict:
    if USAGE_FILE.exists():
        return json.loads(USAGE_FILE.read_text())
    return {}


def _check_caps(ip: str, byo: bool):
    if byo:
        return
    u = _usage()
    day, month = time.strftime("%Y-%m-%d"), time.strftime("%Y-%m")
    if u.get("month") != month:
        u = {"month": month, "month_count": 0, "day": day, "ips": {}}
    if u.get("day") != day:
        u["day"], u["ips"] = day, {}
    if u["month_count"] >= GLOBAL_MONTHLY:
        raise HTTPException(429, "demo capacity reached this month — bring your own API key")
    if u["ips"].get(ip, 0) >= PER_IP_DAILY:
        raise HTTPException(429, "daily demo limit reached — bring your own API key")
    u["month_count"] += 1
    u["ips"][ip] = u["ips"].get(ip, 0) + 1
    USAGE_FILE.write_text(json.dumps(u))


@app.post("/notes")
def notes(body: NoteIn, request: Request):
    if len(body.note) > 2000:
        raise HTTPException(400, "note too long (2000 chars max)")
    hit = BOARD[BOARD.slug == body.slug]
    if hit.empty or hit.iloc[0].coverage != "model":
        raise HTTPException(404, "player not model-scored")
    r = hit.iloc[0]

    _check_caps(request.client.host if request.client else "?", bool(body.api_key))

    import os
    from extract import extract_llm, extract_mock, _load_env
    from notes import update
    _load_env()
    if body.api_key:
        os.environ["ANTHROPIC_API_KEY"] = body.api_key
    try:
        traits = extract_llm(body.note) if os.environ.get("ANTHROPIC_API_KEY") \
            else extract_mock(body.note)
        mode = "llm" if os.environ.get("ANTHROPIC_API_KEY") else "mock"
    except Exception:
        traits, mode = extract_mock(body.note), "mock_fallback"

    prior = np.array([float(getattr(r, f"p_{t}")) for t in TIERS])
    posterior, tilt = update(prior, {t["trait"]: (t["score"], t["confidence"])
                                     for t in traits})
    return {"mode": mode, "traits": traits, "tilt": round(tilt, 3),
            "prior": {t: round(float(p), 4) for t, p in zip(TIERS, prior)},
            "posterior": {t: round(float(p), 4) for t, p in zip(TIERS, posterior)}}
