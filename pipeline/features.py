"""Phase 3: training/scoring feature matrix from college final season + career.

Reliability handling (DECISIONS.md D4):
- Empirical-Bayes shrinkage on every rate stat: rate' = (made + m*prior) / (att + m),
  m sized to each stat's stabilization speed (3P% slowest), prior = position-group mean.
- Raw volumes ride along so models can learn residual sample-size effects.
- Eligibility floor: final-season min_pct >= 40 (or ~500 MP); ineligible rows are kept
  but flagged — they get slot-prior-only treatment downstream.
- Missingness is informative: rec_score/wingspan/athleticism carry was-missing indicators;
  wingspan imputed from height within position group.

Run: python pipeline/features.py -> data/processed/features.parquet
"""

from pathlib import Path

import numpy as np
import pandas as pd

from resolve import norm

PROCESSED = Path(__file__).resolve().parent.parent / "data" / "processed"

# pseudo-attempts per rate stat (stabilization: 3P% slowest, FT%/stocks fastest)
SHRINK = {"ft_pct": ("ftm", "fta", 100), "two_pct": ("two_m", "two_a", 150),
          "three_pct": ("three_m", "three_a", 250), "rim_pct": ("rim_m", "rim_a", 100),
          "mid_pct": ("mid_m", "mid_a", 120)}

POS_MAP = {"Pure PG": "G", "Scoring PG": "G", "Combo G": "G", "Wing G": "W",
           "Wing F": "W", "Stretch 4": "W", "PF/C": "B", "C": "B"}
POWER_CONFS = {"ACC", "SEC", "B10", "B12", "P12", "BE"}
CLASS_ORD = {"Fr": 1, "So": 2, "Jr": 3, "Sr": 4}

# --- D4 extension: sub-floor final seasons blend with the last qualifying season ---
# A drafted entity may blend only if its crosswalk match is name-verified; year+pick
# matches are name-blind and can map internationals to random D1 players (Exum ->
# a Providence player), so those need per-pid manual verification below.
BLEND_ALLOWLIST = {127470.0}  # Jayden Quaintance: ASU 2025 -> Kentucky 2026, one bt_pid

# counting stats pool by summing across seasons; season-level rates/metrics pool as
# an mp_total-weighted mean (same convention as career_bpm)
BLEND_SUMS = ["gp", "mp_total", "ftm", "fta", "two_m", "two_a", "three_m", "three_a",
              "rim_m", "rim_a", "mid_m", "mid_a", "dunk_m", "dunk_a"]
BLEND_MEANS = ["min_pct", "usg", "ts", "efg", "ortg", "adjoe", "porpag", "adrtg",
               "dporpag", "bpm", "obpm", "dbpm", "ftr", "ast_pct", "tov_pct", "ast_tov",
               "orb_pct", "drb_pct", "stl_pct", "blk_pct"]
# context columns taken from the qualifying (anchor) season, the substantive sample
BLEND_ANCHOR = ["team", "conf", "role", "class_yr", "height", "birthdate", "rec_score"]


def blend_subfloor(final: pd.DataFrame, college: pd.DataFrame,
                   xw: pd.DataFrame) -> pd.DataFrame:
    """Score injury-shortened players on a minutes-weighted pool of their most
    recent qualifying season plus everything after it, instead of not at all.
    Players with no qualifying season ever are left sub-floor (D4 unchanged)."""
    verified = xw[xw.match_method.isin(["pick+name", "name"]) |
                  xw.bt_pid.isin(BLEND_ALLOWLIST)]
    ok_drafted = set(zip(verified.bt_pid, verified.draft_year))
    final["sample_blend"] = np.nan
    floor = (final.min_pct >= 40) | (final.mp_total >= 500)
    for i in final.index[~floor]:
        row = final.loc[i]
        if not row.undrafted and (row.bt_pid, row.draft_year) not in ok_drafted:
            continue
        hist = college[(college.bt_pid == row.bt_pid) & (college.season <= row.season)]
        hist = hist.loc[hist.groupby("season").mp_total.idxmax()].sort_values("season")
        qual = hist[(hist.min_pct >= 40) | (hist.mp_total >= 500)]
        if qual.empty:
            continue
        pool = hist[hist.season >= qual.season.max()]
        w = pool.mp_total.clip(lower=1)
        anchor = pool.iloc[0]
        final.loc[i, BLEND_ANCHOR] = anchor[BLEND_ANCHOR].values
        final.loc[i, BLEND_SUMS] = pool[BLEND_SUMS].fillna(0).sum().values
        final.loc[i, BLEND_MEANS] = (pool[BLEND_MEANS].mul(w, axis=0).sum() / w.sum()).values
        final.loc[i, "sample_blend"] = float(anchor.season)
    return final


def height_inches(h) -> float | None:
    try:
        ft, inch = str(h).split("-")
        return int(ft) * 12 + int(inch)
    except (ValueError, AttributeError):
        return None


def build() -> pd.DataFrame:
    college = pd.read_parquet(PROCESSED / "college_seasons.parquet")
    xw = pd.read_parquet(PROCESSED / "crosswalk.parquet")
    pool = pd.read_parquet(PROCESSED / "undrafted_pool.parquet")
    combine = pd.read_parquet(PROCESSED / "combine.parquet")

    # 2026 board scope includes consensus-top-60 D1 players who went undrafted
    cons = pd.read_parquet(PROCESSED / "consensus_2026.parquet")
    college_2026 = pd.read_parquet(PROCESSED / "college_seasons.parquet")
    college_2026 = college_2026[college_2026.season == 2026].assign(
        nname=lambda d: d.player_name.map(norm))
    drafted_2026 = set(pd.read_parquet(PROCESSED / "crosswalk.parquet")
                       .query("draft_year == 2026").player_name.map(norm))
    cons_und = cons[(cons["rank"] <= 60) & ~cons.player_name.map(norm).isin(drafted_2026)]
    cons_und = cons_und.assign(nname=cons_und.player_name.map(norm)).merge(
        college_2026[["nname", "bt_pid"]].drop_duplicates("nname"), on="nname")

    entities = pd.concat([
        xw[xw.bt_pid.notna()][["draft_year", "pick", "player_name", "bref_id",
                               "bt_pid", "bt_final_season"]].assign(undrafted=False),
        pool[pool.matched][["draft_year", "player_name", "bt_pid", "bt_final_season"]]
            .assign(pick=np.nan, bref_id=None, undrafted=True),
        cons_und[["player_name", "bt_pid"]].assign(
            draft_year=2026, bt_final_season=2026, pick=np.nan, bref_id=None, undrafted=True),
    ], ignore_index=True).drop_duplicates(["bt_pid", "draft_year"])

    # final college season row per entity (dedupe transfer duplicates on max minutes)
    college = college.assign(mp_total=college.mpg * college.gp)
    final = college.merge(entities, left_on=["bt_pid", "season"],
                          right_on=["bt_pid", "bt_final_season"], suffixes=("", "_e"))
    final = final.loc[final.groupby(["bt_pid", "draft_year"]).mp_total.idxmax()].copy()

    final = blend_subfloor(final, college, xw)

    final["pos"] = final.role.map(POS_MAP).fillna("W")
    final["height_in"] = final.height.map(height_inches)

    # EB shrinkage toward position-group means
    for rate, (made, att, m) in SHRINK.items():
        prior = final.groupby("pos").apply(
            lambda g: g[made].sum() / max(g[att].sum(), 1), include_groups=False)
        p = final.pos.map(prior)
        final[f"{rate}_shr"] = (final[made].fillna(0) + m * p) / (final[att].fillna(0) + m)

    f = pd.DataFrame({
        "bt_pid": final.bt_pid, "draft_year": final.draft_year, "pick": final.pick,
        "player_name": final.player_name_e, "bref_id": final.bref_id,
        "undrafted": final.undrafted, "team": final.team, "season": final.season,
        # priors / identity
        "age_at_draft": (pd.to_datetime(final.draft_year.astype(str) + "-06-25")
                         - pd.to_datetime(final.birthdate, errors="coerce")).dt.days / 365.25,
        "height_in": final.height_in,
        "class_ord": final.class_yr.map(CLASS_ORD).fillna(2),
        "rec_score": final.rec_score.fillna(0),
        "rec_missing": final.rec_score.isna().astype(int),
        "power_conf": final.conf.isin(POWER_CONFS).astype(int),
        # role / usage / efficiency (final season)
        "min_pct": final.min_pct, "usg": final.usg, "ts": final.ts, "efg": final.efg,
        "ortg": final.ortg, "adjoe": final.adjoe, "porpag": final.porpag,
        "adrtg": final.adrtg, "dporpag": final.dporpag,
        "bpm_c": final.bpm, "obpm_c": final.obpm, "dbpm_c": final.dbpm,
        # shrunk rates + volumes
        **{f"{r}_shr": final[f"{r}_shr"] for r in SHRINK},
        "fta_pg": final.fta / final.gp, "three_a_pg": final.three_a / final.gp,
        "ftr": final.ftr,
        "three_rate": final.three_a / (final.two_a + final.three_a).clip(lower=1),
        "rim_share": final.rim_a / final.two_a.clip(lower=1),
        "dunk_share": final.dunk_a / final.two_a.clip(lower=1),
        # playmaking / defense
        "ast_pct": final.ast_pct, "tov_pct": final.tov_pct, "ast_tov": final.ast_tov,
        "orb_pct": final.orb_pct, "drb_pct": final.drb_pct,
        "stl_pct": final.stl_pct, "blk_pct": final.blk_pct,
        "pos": final.pos, "mp_total": final.mp_total, "gp": final.gp,
        "sample_blend": final.sample_blend,
    })
    f["eligible"] = (final.min_pct >= 40) | (final.mp_total >= 500)

    # trajectory: career rows up to each entity's scored season (no leakage from
    # seasons after the draft), with the possibly-blended final row as the delta
    # endpoint so a sub-floor final season never anchors d_* on its own
    career = college[college.bt_pid.isin(final.bt_pid)]
    career = career.loc[career.groupby(["bt_pid", "season"]).mp_total.idxmax()]
    traj = []
    for _, row in final.iterrows():
        s = career[(career.bt_pid == row.bt_pid) & (career.season <= row.season)]
        s = s.sort_values("season")
        mp = s.mp_total.clip(lower=1)
        first = s.iloc[0]
        traj.append({
            "bt_pid": row.bt_pid, "draft_year": row.draft_year, "n_seasons": len(s),
            "career_bpm": (s.bpm * mp).sum() / mp.sum(),
            "d_bpm": row.bpm - first.bpm,
            "d_usg": row.usg - first.usg,
            "d_ts": row.ts - first.ts,
            "d_min_pct": row.min_pct - first.min_pct,
        })
    f = f.merge(pd.DataFrame(traj), on=["bt_pid", "draft_year"], how="left")

    # combine anthro/athleticism by name+year; informative missingness
    combine = combine.assign(nname=combine.player_name.map(norm))
    combine = combine.drop_duplicates(["nname", "draft_year"])
    f["nname"] = f.player_name.map(norm)
    f = f.merge(combine[["nname", "draft_year", "wingspan", "standing_reach",
                         "max_vertical_leap", "lane_agility_time", "three_quarter_sprint"]],
                on=["nname", "draft_year"], how="left").drop(columns="nname")
    f["combine_missing"] = f.wingspan.isna().astype(int)
    # wingspan imputed from height within position group (least-squares per group)
    for pos, g in f.groupby("pos"):
        known = g.dropna(subset=["wingspan", "height_in"])
        if len(known) > 20:
            slope, intercept = np.polyfit(known.height_in, known.wingspan, 1)
            miss = (f.pos == pos) & f.wingspan.isna() & f.height_in.notna()
            f.loc[miss, "wingspan"] = intercept + slope * f.loc[miss, "height_in"]
    f["wingspan_minus_height"] = f.wingspan - f.height_in

    # position one-hots + the two interactions the ordinal model can't invent
    for p in ["G", "W", "B"]:
        f[f"pos_{p}"] = (f.pos == p).astype(int)
    f["blk_x_big"] = f.blk_pct * f.pos_B
    f["ast_x_guard"] = f.ast_pct * f.pos_G

    return f


if __name__ == "__main__":
    f = build()
    f.to_parquet(PROCESSED / "features.parquet")
    labeled = f[f.draft_year.between(2009, 2021)]
    print(f"features: {len(f)} rows ({f.undrafted.sum()} undrafted), "
          f"{f.eligible.mean():.1%} eligible")
    print(f"training-era rows: {len(labeled)}; age coverage "
          f"{f.age_at_draft.notna().mean():.1%}; combine present {1 - f.combine_missing.mean():.1%}")
    assert f.groupby(['bt_pid', 'draft_year']).size().max() == 1, "entity duplication"
