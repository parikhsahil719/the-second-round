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
import unicodedata
from pathlib import Path
from urllib.parse import quote

import numpy as np
import pandas as pd
import requests
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "model"))
sys.path.insert(0, str(ROOT / "pipeline"))
from common import TIERS, UTILITY  # noqa: E402

PROCESSED = ROOT / "data" / "processed"
PER_IP_DAILY = 10
GLOBAL_MONTHLY = 2000
USAGE_FILE = ROOT / "api" / "usage.json"

app = FastAPI(title="The Second Round")
# Browsers may call this API only from our own origins (prod domain, Vercel
# deployments of this project, local dev). No cookies are involved, so this is
# defense-in-depth: it stops third-party pages from spending visitors' demo
# caps or hammering the auth endpoints from inside their browsers.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://thesecondround.dev",
        "https://www.thesecondround.dev",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"^https://the-second-round[a-z0-9.-]*\.vercel\.app$",
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
)

# feature -> (phrase when it helps, phrase when it hurts). Fallback: prettified name.
TRANSLATE = {
    "porpag": ("Elite offensive production for the level", "Offensive production below the bar"),
    "bpm_c": ("Big overall college impact", "Overall college impact underwhelms"),
    "obpm_c": ("Strong offensive impact numbers", "Offensive impact numbers lag"),
    "dbpm_c": ("Real defensive impact on tape... and in the data", "Defensive impact doesn't show up"),
    "age_at_draft": ("Old for the class, so production gets an age discount", "Young for the class, and time is on his side"),
    "class_ord": ("Upperclassman, and seniors must dominate to project", "Produced as an underclassman"),
    "rec_score": ("Blue-chip pedigree backs the profile", "Unheralded recruit, so pedigree doesn't vouch for him"),
    "ts": ("Efficient scorer", "Efficiency concerns: points come expensively"),
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
    "stl_pct": ("Ball-hawk instincts, and steals travel to the NBA", "Doesn't create defensive events"),
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
    "gp": ("Full season of games", "Short season, small sample"),
    "n_seasons": ("Multi-year college résumé", "One college season to judge"),
    "dporpag": ("Defensive value stacks up", "Defensive value is minimal"),
}


# Is MORE of this stat a good-sounding thing? +1 yes, -1 no. Features whose phrasing
# is neutral (role/style descriptions) are simply absent. Used to catch bullets whose
# tone fights their arrow.
VALENCE = {
    "porpag": 1, "bpm_c": 1, "obpm_c": 1, "dbpm_c": 1, "career_bpm": 1, "d_bpm": 1,
    "ts": 1, "efg": 1, "ft_pct_shr": 1, "three_pct_shr": 1, "two_pct_shr": 1,
    "rim_pct_shr": 1, "ast_pct": 1, "ast_tov": 1, "ast_x_guard": 1, "stl_pct": 1,
    "blk_pct": 1, "blk_x_big": 1, "orb_pct": 1, "drb_pct": 1, "height_in": 1,
    "wingspan": 1, "wingspan_minus_height": 1, "min_pct": 1, "adjoe": 1, "dporpag": 1,
    "mp_total": 1, "gp": 1, "rec_score": 1, "d_usg": 1, "max_vertical_leap": 1,
    "standing_reach": 1,
    "tov_pct": -1, "age_at_draft": -1, "adrtg": -1, "lane_agility_time": -1,
    "three_quarter_sprint": -1, "rec_missing": -1, "combine_missing": -1,
}

# Replacement phrasing for bullets where the fact sounds good but the model pushes
# down (or the reverse). Same (hi, lo) shape as TRANSLATE, keyed by z-sign; only used
# when tone and push disagree, so the sentence explains its own arrow.
CONTRARIAN = {
    "tov_pct": (
        "Turnover-prone, but that's the tax on heavy creation, and history forgives it",
        "Takes care of the ball, maybe too well: ultra-safe play historically reads conservative, not creative"),
    "ts": (
        "Ultra-efficient scorer, a college stat that historically flatters more than it projects",
        "Efficiency concerns, though history is kinder to imperfect volume scorers than the stat suggests"),
    "orb_pct": (
        "Crashes the offensive glass, real value on the margins, though history reads it as a role-player trait more than a star signal",
        "Trades the offensive glass for getting back in transition, a trade that has historically paid off for perimeter players"),
    "min_pct": (
        "Trusted with huge minutes, a workhorse profile that has historically topped out lower",
        "Didn't need big minutes to make his mark, common for young players on deep rosters"),
    "rec_score": (
        "Blue-chip pedigree, though history says hype without matching production disappoints",
        "Unheralded recruit who produced anyway, the classic profile the market misses"),
    "d_bpm": (
        "Big year-over-year leap, though history trusts players who arrived good over late climbers",
        "Production arrived early and held, which history likes more than a late climb"),
    "ast_pct": (
        "Big assist volume, mostly already credited through his decision-making numbers",
        "Assist numbers light for the role, which matters less once decision-making is counted"),
    "ast_x_guard": (
        "Lead-guard assist volume, mostly already credited through his playmaking numbers",
        "Assist rate light for a lead guard, softened by the rest of his playmaking profile"),
}


def translate_why(why_json: str) -> list[dict]:
    """Phrase describes what's TRUE (value z-sign); contribution says which way it pushes.
    They differ on negative-coefficient features: an unranked recruit reads 'Unheralded
    recruit' with a positive push, because that profile historically overdelivers.
    When the phrase's tone and the push disagree (a good-sounding fact with a down
    arrow), swap in CONTRARIAN wording that carries the tension itself."""
    out = []
    for item in json.loads(why_json or "[]"):
        feat, contrib, z = (item + [None])[:3] if len(item) < 3 else item
        sign = z if z is not None else contrib
        hi, lo = TRANSLATE.get(feat, (None, None))
        phrase = (hi if sign > 0 else lo) or \
            f"{'High' if sign > 0 else 'Low'} {feat.replace('_', ' ')}"
        tone = VALENCE.get(feat, 0) * (1 if sign > 0 else -1)
        push = 1 if contrib > 0 else -1
        if tone and tone != push:
            chi, clo = CONTRARIAN.get(feat, (None, None))
            swapped = chi if sign > 0 else clo
            phrase = swapped or phrase + (
                ", yet that profile has historically overdelivered" if push > 0
                else ", yet that profile has historically underdelivered")
        out.append({"text": phrase, "feature": feat, "contribution": contrib})
    return out


def slugify(name: str) -> str:
    # transliterate accents first (López -> lopez), so diacritics don't leave
    # holes in the URL (karim-l-pez)
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")


def _logit(p: float) -> float:
    c = min(max(p, 1e-3), 1 - 1e-3)
    return float(np.log(c / (1 - c)))


def _sigmoid(x: float) -> float:
    return float(1 / (1 + np.exp(-x)))


def load_board() -> pd.DataFrame:
    b = pd.read_parquet(PROCESSED / "board_2026.parquet")
    b["slug"] = b.player_name.map(slugify)
    # The parquet IS the draft-day board (frozen since commit 7efaa03; the SL fold
    # below is in-memory only). Capture the draft-day call before folding so the
    # receipt survives next to the updated numbers.
    b["draft_ev"] = b.ev_model
    b["draft_rank"] = b.ev_model.rank(ascending=False, method="min")
    # Summer League overlay (D22): the board IS the current view. Posterior tiers,
    # EV, and edges replace the draft-day numbers wherever SL evidence exists (the
    # draft-day call stays in git history and the memo), and the interval endpoints
    # shift by the same logit displacement as the point estimate — the BookBar rule:
    # the model's uncertainty tilted by the evidence, never a fabricated interval.
    if SL_POST is not None:
        for name, s in SL_POST[SL_POST.prior_basis == "model"].iterrows():
            hit = b.index[b.player_name == name]
            if hit.empty:
                continue
            i = hit[0]
            d = _logit(float(s.p_STAR_sl)) - _logit(float(b.at[i, "p_STAR"]))
            for t in TIERS:
                b.at[i, f"p_{t}"] = float(s[f"p_{t}_sl"])
            b.at[i, "p_STAR"] = float(s.p_STAR_sl)
            b.at[i, "p_STAR_lo"] = _sigmoid(_logit(float(b.at[i, "p_STAR_lo"])) + d)
            b.at[i, "p_STAR_hi"] = _sigmoid(_logit(float(b.at[i, "p_STAR_hi"])) + d)
            b.at[i, "ev_model"] = float(s.ev_sl)
            if pd.notna(b.at[i, "ev_slot"]):
                b.at[i, "edge_slot"] = float(s.ev_sl) - float(b.at[i, "ev_slot"])
            if pd.notna(b.at[i, "ev_consensus"]):
                b.at[i, "edge_consensus"] = float(s.ev_sl) - float(b.at[i, "ev_consensus"])
        b = b.sort_values("ev_model", ascending=False, na_position="last",
                          kind="stable", ignore_index=True)
    # model's rank in this class (by valuation, among scored players); chips derive
    # from this rank, so they too follow the updated EV
    b["model_rank"] = b.ev_model.rank(ascending=False, method="min")
    return b


def rank_chip(model_rank, pick) -> str:
    """A steal fell below the model's rank; a reach went above it. Nobody can be a
    steal at pick 1 by definition. Threshold scales with pick (rank noise grows late).

    Undrafted players have no pick, so STEAL/REACH (which grade draft position) don't
    apply. Instead: the ones the model would have drafted are SLEEPERs; the rest are
    just UNDRAFTED. Same threshold, measured against an effective pick of 61."""
    if model_rank is None or (isinstance(model_rank, float) and np.isnan(model_rank)):
        return "N/A"
    if pick is None:
        gap = 61 - model_rank
        return "SLEEPER" if gap >= max(3, round(0.2 * 61)) else "UNDRAFTED"
    threshold = max(3, round(0.2 * pick))
    gap = pick - model_rank
    return "STEAL" if gap >= threshold else ("REACH" if gap <= -threshold else "FAIR")


# "plays like Dejounte Murray", "shades of prime Manu", "a poor man's Hart and Smart"
COMP_TRIGGER = re.compile(
    r"(?i)(?:plays like|moves like|reminds me of|shades of|similar to|comps? to|"
    r"a (?:poor|rich) man'?s)\s+")
COMP_FILLER = re.compile(r"(?i)^(?:(?:a|an|the|young|prime|peak|vintage)\s+)+")
COMP_NAME = re.compile(r"^[A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,2}")

# comp name -> outcome metadata. The star distinguishes "produced at All-Star level"
# from "was actually selected"; the archetype says HOW he produced it (creation
# burden in his peak stretch, designer cutoffs per DECISIONS D20); late_bloom flags
# careers that kept climbing after the four-year window (the Brunson tag).


def _archetype(tier, usg) -> str | None:
    if tier not in ("STARTER", "ALL_STAR", "ELITE") or pd.isna(usg):
        return None
    return "Engine" if usg >= 24 else ("Co-star" if usg >= 20 else "Connector")


_labels = pd.read_parquet(PROCESSED / "labels.parquet")
COMP_META = {str(n).lower(): {"tier": t, "all_star": bool(a),
                              "archetype": _archetype(t, u),
                              "late_bloom": None if pd.isna(lb) else lb}
             for n, t, a, u, lb in zip(_labels.player_name, _labels.tier,
                                       _labels.all_star4, _labels.peak2_usg,
                                       _labels.late_bloom)
             if pd.notna(t)}
del _labels


def extract_comps(note: str) -> list[dict]:
    """Player comps the scout name-dropped, with the historical tier when the name
    is in our labeled classes. Annotation only: comps never touch the posterior,
    because the note's traits already carry the evidence and a name-drop would
    double-count it."""
    # ponytail: regex on common comp phrasings; move into the LLM extraction schema
    # if scouts phrase comps too creatively for it
    names: list[str] = []
    for m in COMP_TRIGGER.finditer(note):
        # a trigger can introduce a list: "plays like Hart and Smart, or prime Tony Allen"
        tail = note[m.end():m.end() + 100]
        for chunk in re.split(r"\s*(?:,|\band\b|\bor\b|&|/)\s*", tail):
            chunk = COMP_FILLER.sub("", chunk.strip())
            if not chunk:
                continue  # ", or" and friends produce empty chunks between names
            nm = COMP_NAME.match(chunk)
            if not nm:
                break  # the list ended; stop at the first non-name chunk
            name = nm.group(0).rstrip(".,;:!?")
            if name.lower() not in {n.lower() for n in names}:
                names.append(name)
    out = []
    for n in names[:5]:
        meta = COMP_META.get(n.lower(), {})
        out.append({"name": n, "tier": meta.get("tier"),
                    "all_star": meta.get("all_star", False),
                    "archetype": meta.get("archetype"),
                    "late_bloom": meta.get("late_bloom")})
    return out


def market_prior(r) -> tuple[np.ndarray, str] | None:
    """The market's tier distribution for a player the model can't score: what his
    actual slot (post-draft) or consensus rank (pre-draft) historically becomes.
    Returns (distribution, basis) or None when neither anchor exists."""
    if pd.notna(r.pick):
        key, basis = int(min(r.pick, 60)), "slot"
    elif pd.notna(r.consensus_rank) and r.consensus_rank <= 60:
        key, basis = int(r.consensus_rank), "consensus"
    elif pd.notna(r.consensus_rank):
        key, basis = 0, "undrafted"  # ranked outside 60: undrafted-pool base rates
    else:
        return None
    return SLOT_PRIOR.loc[key, list(TIERS)].to_numpy(dtype=float), basis


def note_prior(r) -> np.ndarray | None:
    """Notes stack on live SL evidence, then the model, then the market."""
    if SL_POST is not None and r.player_name in SL_POST.index:
        s = SL_POST.loc[r.player_name]
        return np.array([float(s[f"p_{t}_sl"]) for t in TIERS])
    if r.coverage == "model":
        return np.array([float(getattr(r, f"p_{t}")) for t in TIERS])
    mp = market_prior(r)
    return None if mp is None else mp[0]


def your_view(r, posterior: np.ndarray) -> dict:
    """The scout-vs-baseline comparison: turn a posterior into the user's EV, where
    that EV would rank in this class (against everyone else's model EV), and the chip
    that rank implies. The baseline is the model where it speaks, the market where it
    abstains (ev_model null, ev_market set) — never the market graded against itself."""
    util = np.array([UTILITY[t] for t in TIERS])
    ev_user = float(posterior @ util)
    others = BOARD.loc[BOARD.slug != r.slug, "ev_model"].dropna()
    your_rank = int((others > ev_user).sum()) + 1
    pick = None if pd.isna(r.pick) else int(r.pick)
    mp = None if r.coverage == "model" else market_prior(r)
    return {
        "ev_model": None if pd.isna(r.ev_model) else round(float(r.ev_model), 2),
        "ev_market": None if mp is None else round(float(mp[0] @ util), 2),
        "ev_user": round(ev_user, 2),
        "model_rank": None if pd.isna(r.model_rank) else int(r.model_rank),
        "your_rank": your_rank,
        "model_chip": rank_chip(r.model_rank, pick),
        "your_chip": rank_chip(your_rank, pick),
    }


# loaded before the board: load_board() folds the SL posterior into it
SL_POST = pd.read_parquet(PROCESSED / "sl_posterior.parquet").set_index("player_name") \
    if (PROCESSED / "sl_posterior.parquet").exists() else None
SL_BOX = pd.read_parquet(PROCESSED / "summer_league.parquet").set_index("player_name") \
    if (PROCESSED / "summer_league.parquet").exists() else None
BOARD = load_board()
# pick (1-60, 0 = undrafted pool) -> historical 6-tier distribution; the market's
# base rates, used for war-room pricing and as the notes prior for non-model players
SLOT_PRIOR = pd.read_parquet(PROCESSED / "slot_prior.parquet").set_index("pick")
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
         "team": None if pd.isna(r.team) else r.team,  # NBA team that drafted him
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
            "chip": rank_chip(r.model_rank, None if pd.isna(r.pick) else int(r.pick)),
            "star_flag": bool(r.star_flag),
            "age": None if pd.isna(r.age_at_draft) else round(float(r.age_at_draft), 1),
            "model_rank": None if pd.isna(r.model_rank) else int(r.model_rank),
            # the draft-day call, frozen: what the model said before any SL evidence
            "draft_rank": None if pd.isna(r.draft_rank) else int(r.draft_rank),
            "draft_ev": None if pd.isna(r.draft_ev) else round(float(r.draft_ev), 2),
            # anchor season of a minutes-weighted blend, for players whose final
            # college season was too small on its own (D4 extension)
            "sample_blend": None if pd.isna(r.sample_blend) else int(r.sample_blend),
            "why_pos": [w["text"] for w in translate_why(r.why) if w["contribution"] > 0][:2],
            "why_neg": [w["text"] for w in translate_why(r.why) if w["contribution"] < 0][:2],
        })
    else:
        # the market's answer for players the model can't score: shown as a labeled
        # prior, never compared against the market itself (no edge, no chip)
        mp = market_prior(r)
        if mp is not None:
            dist, basis = mp
            util = np.array([UTILITY[t] for t in TIERS])
            d.update({
                "market_tiers": {t: round(float(p), 4) for t, p in zip(TIERS, dist)},
                "ev_market": round(float(dist @ util), 2),
                "market_basis": basis,
            })
    if SL_POST is not None and SL_BOX is not None and r.player_name in SL_POST.index \
            and r.player_name in SL_BOX.index:
        s, b = SL_POST.loc[r.player_name], SL_BOX.loc[r.player_name]
        d["sl"] = {
            "as_of": str(s.as_of),
            "tilt": round(float(s.tilt), 3),
            "tiers": {t: round(float(s[f"p_{t}_sl"]), 4) for t in TIERS},
            "p_star": round(float(s.p_STAR_sl), 4),
            "ev": round(float(s.ev_sl), 2),
            "ev_delta": round(float(s.ev_delta), 2),
            "prior_basis": s.prior_basis,
            "moved": s.moved,
            "box": {
                "gp": int(b.gp),
                "mpg": round(float(b.mpg), 1),
                "pts": round(float(b.pts_pg), 1),
                "reb": round(float(b.reb_pg), 1),
                "ast": round(float(b.ast_pg), 1),
                "ts": round(float(b.ts), 3),
            },
        }
    return d


# GET for humans, HEAD for uptime monitors (they ping with HEAD by default)
@app.api_route("/", methods=["GET", "HEAD"])
def index():
    return {
        "service": "The Second Round API",
        "endpoints": ["/board", "/player/{slug}", "/warroom/{pick}", "/notes (POST)",
                      "/posterior (POST)", "/memo"],
        "app": "this is the data API; the app itself runs separately (see README)",
    }


@app.get("/memo")
def memo():
    from fastapi.responses import PlainTextResponse
    path = ROOT / "report" / "memo.md"
    if not path.exists():
        raise HTTPException(404, "memo not written yet")
    return PlainTextResponse(path.read_text(encoding="utf-8"))


@app.get("/board")
def board():
    rows = [public_row(r) for r in BOARD.itertuples()]
    sl_as_of = None if SL_POST is None or SL_POST.empty else str(SL_POST.as_of.max())
    return {"rows": rows, "tiers": TIERS, "sl_as_of": sl_as_of}


@app.get("/player/{slug}")
def player(slug: str):
    hit = BOARD[BOARD.slug == slug]
    if hit.empty:
        raise HTTPException(404, "unknown player")
    r = hit.iloc[0]
    d = public_row(r)
    if r.coverage == "model":
        d["why"] = translate_why(r.why)
        # SL isn't a model feature, so it can't appear in the attribution — but it
        # moved the price, so it leads the list as its own line (D22)
        if "sl" in d and d["sl"]["prior_basis"] == "model":
            s, b = SL_POST.loc[r.player_name], SL_BOX.loc[r.player_name]
            up = float(s.tilt) >= 0
            d["why"].insert(0, {
                "text": (f"Summer League {'strengthened the case' if up else 'raised questions'}: "
                         f"{float(b['min']):.0f}{' productive' if up else ' quiet'} minutes "
                         f"across {b.events}"),
                "feature": "summer_league",
                "contribution": round(float(s.tilt), 2),
            })
        # defensive dedupe: a comp list is five DIFFERENT players even if a stale
        # artifact slips a repeated season-row through
        comps, seen = [], set()
        for c in (r.comps or "").split(" | "):
            if "(" not in c:
                continue
            name = c.rsplit(" (", 1)[0]
            if name.lower() in seen:
                continue
            seen.add(name.lower())
            meta = COMP_META.get(name.lower(), {})
            comps.append({"name": name, "tier": c.rsplit(" (", 1)[1].rstrip(")"),
                          "all_star": meta.get("all_star", False),
                          "archetype": meta.get("archetype"),
                          "late_bloom": meta.get("late_bloom")})
        d["comps"] = comps
    d["seed_notes"] = [s for s in SEEDS if s["player_name"] == r.player_name]
    return d


@app.get("/warroom/{pick}")
def warroom(pick: int):
    """Standing at pick N: availability %, plus value measured against THIS pick's price.

    The chip answers the on-the-clock question: is taking him at pick N good value?
    surplus = model valuation - what pick N historically returns."""
    if AVAIL is None:
        raise HTTPException(503, "availability simulation not built")
    if not 1 <= pick <= 60:
        raise HTTPException(400, "pick must be 1-60")

    util = np.array([UTILITY[t] for t in TIERS])
    pick_price = float(SLOT_PRIOR.loc[pick, list(TIERS)].to_numpy() @ util)

    def value_chip(surplus):
        if surplus is None:
            return "N/A"
        return "STEAL" if surplus > 2 else ("REACH" if surplus < -2 else "FAIR")

    col = f"avail_{pick}"
    rows = []
    by_name = BOARD.set_index("player_name")
    for a in AVAIL.itertuples():
        avail = float(getattr(a, col))
        if avail < 0.01:
            continue
        b = by_name.loc[a.player_name] if a.player_name in by_name.index else None
        ev = None if b is None or pd.isna(b.get("ev_model")) else round(float(b.ev_model), 2)
        surplus = None if ev is None else round(ev - pick_price, 1)
        rows.append({
            "player_name": a.player_name,
            "slug": b.slug if b is not None else None,
            "headshot_url": HEADSHOTS.get(a.player_name),
            "consensus_rank": int(a.consensus_rank),
            "actual_pick": None if pd.isna(a.actual_pick) else int(a.actual_pick),
            "availability": round(avail, 3),
            "ev_model": ev,
            "p_star": None if b is None or pd.isna(b.get("p_STAR")) else round(float(b.p_STAR), 3),
            "surplus": surplus,
            "chip": value_chip(surplus),
        })
    rows.sort(key=lambda r: (-(r["ev_model"] or -1), r["consensus_rank"]))
    return {"pick": pick, "pick_price": round(pick_price, 1), "players": rows,
            "note": "Availability from 10,000 draft simulations calibrated on consensus-vs-actual slide; no team-need modeling."}


class TraitsIn(BaseModel):
    slug: str
    traits: list[dict]


def _clean_traits(traits: list[dict]) -> dict:
    clean = {}
    for t in traits[:24]:
        try:
            clean[str(t["trait"])] = (int(t["score"]), float(t["confidence"]))
        except (KeyError, TypeError, ValueError):
            continue
    return clean


def _posterior_payload(r, traits: list[dict]) -> dict:
    """Shared /posterior body: prior (model or market), capped update, user's view."""
    from notes import update
    prior = note_prior(r)
    if prior is None:
        raise HTTPException(404, "player has no prior to update")
    post, tilt = update(prior, _clean_traits(traits))
    return {"tilt": round(tilt, 3),
            "prior": {t: round(float(p), 4) for t, p in zip(TIERS, prior)},
            "posterior": {t: round(float(p), 4) for t, p in zip(TIERS, post)},
            "view": your_view(r, post)}


@app.post("/posterior")
def posterior_from_traits(body: TraitsIn):
    """Recompute a posterior from an explicit trait set (saved scout book); no LLM, no caps."""
    hit = BOARD[BOARD.slug == body.slug]
    if hit.empty:
        raise HTTPException(404, "unknown player")
    return _posterior_payload(hit.iloc[0], body.traits)


class TraitsBatchIn(BaseModel):
    items: list[TraitsIn]


@app.post("/posteriors")
def posteriors_batch(body: TraitsBatchIn):
    """Batch of /posterior for hydrating the scout's board in one round trip."""
    if len(body.items) > 100:
        raise HTTPException(400, "too many items (100 max)")
    out = {}
    for item in body.items:
        hit = BOARD[BOARD.slug == item.slug]
        if hit.empty:
            continue
        try:
            out[item.slug] = _posterior_payload(hit.iloc[0], item.traits)
        except HTTPException:
            continue  # no prior for this player; the board just shows its default
    return {"results": out}


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
        raise HTTPException(429, "demo capacity reached this month; bring your own API key")
    if u["ips"].get(ip, 0) >= PER_IP_DAILY:
        raise HTTPException(429, "daily demo limit reached; bring your own API key")
    u["month_count"] += 1
    u["ips"][ip] = u["ips"].get(ip, 0) + 1
    USAGE_FILE.write_text(json.dumps(u))


def _client_ip(request: Request) -> str:
    """Behind Render's proxy the trustworthy client IP is the RIGHTMOST entry in
    X-Forwarded-For: that's the one Render's edge appends from the actual
    connection. Leading entries arrive from the client and are spoofable; trusting
    the first would let anyone rotate fake IPs straight past the per-IP limits."""
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[-1].strip()
    return request.client.host if request.client else "?"


@app.post("/notes")
def notes(body: NoteIn, request: Request):
    if len(body.note) > 4000:
        raise HTTPException(400, "note too long (4000 chars max)")
    hit = BOARD[BOARD.slug == body.slug]
    if hit.empty:
        raise HTTPException(404, "unknown player")
    r = hit.iloc[0]
    prior = note_prior(r)
    if prior is None:
        raise HTTPException(404, "player has no prior to update")

    _check_caps(_client_ip(request), bool(body.api_key))

    import os
    from extract import extract_llm, extract_mock, _load_env
    from notes import update
    _load_env()
    # BYO key is passed per-call only; it must never touch shared process state
    key = body.api_key or os.environ.get("ANTHROPIC_API_KEY")
    try:
        traits = extract_llm(body.note, api_key=body.api_key) if key \
            else extract_mock(body.note)
        mode = "llm" if key else "mock"
    except Exception:
        traits, mode = extract_mock(body.note), "mock_fallback"

    posterior, tilt = update(prior, {t["trait"]: (t["score"], t["confidence"])
                                     for t in traits})
    return {"mode": mode, "traits": traits, "tilt": round(tilt, 3),
            "comps": extract_comps(body.note),
            "prior": {t: round(float(p), 4) for t, p in zip(TIERS, prior)},
            "posterior": {t: round(float(p), 4) for t, p in zip(TIERS, posterior)},
            "view": your_view(r, posterior)}


# ---- Auth proxy -------------------------------------------------------------
# Modern-login posture: the browser sends identifier + password HERE, resolution
# of username -> email happens server-side (service-role RPC), and the browser
# only ever learns success or failure. Email actions answer identically whether
# or not an account exists, so nothing can be enumerated.

def _supabase_env() -> tuple[str, str, str]:
    import os
    from extract import _load_env
    _load_env()
    url = os.environ.get("SUPABASE_URL")
    anon = os.environ.get("SUPABASE_ANON_KEY")
    svc = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and anon and svc):
        raise HTTPException(503, "auth proxy not configured")
    return url.rstrip("/"), anon, svc


def _resolve_email(identifier: str) -> str | None:
    identifier = identifier.strip()
    if "@" in identifier:
        return identifier
    url, _anon, svc = _supabase_env()
    r = requests.post(
        f"{url}/rest/v1/rpc/email_for_username",
        headers={"apikey": svc, "Authorization": f"Bearer {svc}"},
        json={"uname": identifier}, timeout=10)
    if r.ok and r.json():
        return r.json()
    return None


# ponytail: in-memory per-IP limiter; single Render instance today, move to a
# shared store if this ever scales horizontally. Keys are "bucket:ip" so the
# sign-in, email, and username-check budgets don't eat each other.
_AUTH_HITS: dict[str, list[float]] = {}


def _auth_rate_limit(key: str, limit: int = 10, window: int = 300):
    now = time.time()
    # Bounded memory: once the map is big, drop buckets idle past any window, so
    # months of uptime (or an IP-rotating crawler) can't grow it without limit.
    if len(_AUTH_HITS) > 5000:
        stale = [k for k, v in _AUTH_HITS.items() if not v or now - v[-1] > 3600]
        for k in stale:
            _AUTH_HITS.pop(k, None)
    hits = [t for t in _AUTH_HITS.get(key, []) if now - t < window]
    if len(hits) >= limit:
        raise HTTPException(429, "Too many attempts. Wait a few minutes and try again.")
    hits.append(now)
    _AUTH_HITS[key] = hits


class SignInBody(BaseModel):
    identifier: str
    password: str


@app.post("/auth/signin")
def auth_signin(body: SignInBody, request: Request):
    _auth_rate_limit(f"si:{_client_ip(request)}")
    url, anon, _svc = _supabase_env()
    invalid = HTTPException(401, "Invalid email/username or password.")
    email = _resolve_email(body.identifier)
    if not email:
        raise invalid
    r = requests.post(
        f"{url}/auth/v1/token?grant_type=password",
        headers={"apikey": anon},
        json={"email": email, "password": body.password}, timeout=10)
    if r.status_code != 200:
        try:
            msg = r.json().get("error_description") or r.json().get("msg") or ""
        except ValueError:
            msg = ""
        if "confirm" in msg.lower():
            raise HTTPException(403, "Email not confirmed yet. Check your inbox, or resend the confirmation below.")
        raise invalid
    s = r.json()
    return {"access_token": s["access_token"], "refresh_token": s["refresh_token"]}


EMAIL_ACTIONS = {"reset": "/auth/v1/recover", "magic": "/auth/v1/otp", "confirm": "/auth/v1/resend"}


class AuthEmailBody(BaseModel):
    identifier: str
    action: str
    redirect_to: str | None = None


@app.post("/auth/email")
def auth_email(body: AuthEmailBody, request: Request):
    """Reset / magic-link / resend-confirmation. The answer is the same whether an
    account exists or not; GoTrue validates redirect_to against the allowlist."""
    _auth_rate_limit(f"em:{_client_ip(request)}", limit=5)
    if body.action not in EMAIL_ACTIONS:
        raise HTTPException(400, "unknown action")
    url, anon, _svc = _supabase_env()
    generic = {"ok": True,
               "message": "If an account matches, an email is on its way. Check your inbox."}
    email = _resolve_email(body.identifier)
    if not email:
        return generic
    payload: dict = {"email": email}
    if body.action == "confirm":
        payload["type"] = "signup"
    if body.action == "magic":
        payload["create_user"] = False  # magic links sign in existing users; signup is the form's job
    endpoint = f"{url}{EMAIL_ACTIONS[body.action]}"
    if body.redirect_to:
        endpoint += f"?redirect_to={quote(body.redirect_to, safe='')}"
    requests.post(endpoint, headers={"apikey": anon}, json=payload, timeout=10)
    return generic


class UsernameCheck(BaseModel):
    username: str


@app.post("/auth/username-check")
def username_check(body: UsernameCheck, request: Request):
    """Signup-time availability so taken names are rejected up front instead of
    silently suffixed. Disclosing that a username EXISTS is inherent to any signup
    form; the email behind it stays server-side."""
    _auth_rate_limit(f"chk:{_client_ip(request)}", limit=20)
    url, _anon, svc = _supabase_env()
    # ilike with wildcards escaped = case-insensitive equality
    pat = body.username.strip().replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
    r = requests.get(
        f"{url}/rest/v1/profiles",
        headers={"apikey": svc, "Authorization": f"Bearer {svc}"},
        params={"select": "user_id", "username": f"ilike.{pat}", "limit": "1"},
        timeout=10)
    taken = r.ok and len(r.json()) > 0
    return {"available": not taken}
