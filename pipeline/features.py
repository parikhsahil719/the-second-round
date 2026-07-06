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

    entities = pd.concat([
        xw[xw.bt_pid.notna()][["draft_year", "pick", "player_name", "bref_id",
                               "bt_pid", "bt_final_season"]].assign(undrafted=False),
        pool[pool.matched][["draft_year", "player_name", "bt_pid", "bt_final_season"]]
            .assign(pick=np.nan, bref_id=None, undrafted=True),
    ], ignore_index=True)

    # final college season row per entity (dedupe transfer duplicates on max minutes)
    college = college.assign(mp_total=college.mpg * college.gp)
    final = college.merge(entities, left_on=["bt_pid", "season"],
                          right_on=["bt_pid", "bt_final_season"], suffixes=("", "_e"))
    final = final.loc[final.groupby(["bt_pid", "draft_year"]).mp_total.idxmax()].copy()

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
    })
    f["eligible"] = (final.min_pct >= 40) | (final.mp_total >= 500)

    # trajectory: career rows for the same pid up to the final season
    career = college[college.bt_pid.isin(final.bt_pid)]
    career = career.loc[career.groupby(["bt_pid", "season"]).mp_total.idxmax()]
    traj = []
    for pid, seasons in career.groupby("bt_pid"):
        s = seasons.sort_values("season")
        mp = s.mp_total.clip(lower=1)
        traj.append({
            "bt_pid": pid, "n_seasons": len(s),
            "career_bpm": (s.bpm * mp).sum() / mp.sum(),
            "d_bpm": s.bpm.iloc[-1] - s.bpm.iloc[0],
            "d_usg": s.usg.iloc[-1] - s.usg.iloc[0],
            "d_ts": s.ts.iloc[-1] - s.ts.iloc[0],
            "d_min_pct": s.min_pct.iloc[-1] - s.min_pct.iloc[0],
        })
    f = f.merge(pd.DataFrame(traj), on="bt_pid", how="left")

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
    labeled = f[f.draft_year.between(2011, 2021)]
    print(f"features: {len(f)} rows ({f.undrafted.sum()} undrafted), "
          f"{f.eligible.mean():.1%} eligible")
    print(f"training-era rows: {len(labeled)}; age coverage "
          f"{f.age_at_draft.notna().mean():.1%}; combine present {1 - f.combine_missing.mean():.1%}")
    assert f.groupby(['bt_pid', 'draft_year']).size().max() == 1, "entity duplication"
