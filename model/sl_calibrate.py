"""Fit Summer League tilt strength and minutes shrinkage on labeled draft classes."""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from model.common import TIERS  # noqa: E402
from model.notes import GRADIENT  # noqa: E402
from model.prior import build as build_prior  # noqa: E402
from model.summer import add_composite_z, sl_update  # noqa: E402
from pipeline.resolve import norm  # noqa: E402
from pipeline.summer import aggregate_games  # noqa: E402

PROCESSED = ROOT / "data" / "processed"
ARTIFACT = ROOT / "model" / "artifacts" / "sl_params.json"


def calibration_rows() -> pd.DataFrame:
    games = pd.read_parquet(PROCESSED / "sl_history_games.parquet")
    sl = aggregate_games(games)
    labels = pd.read_parquet(PROCESSED / "labels.parquet").query("draft_year <= 2021").copy()
    labels["nname"] = labels.player_name.map(norm)
    collisions = labels.duplicated(["draft_year", "nname"], keep=False)
    print(f"duplicate-name label collisions dropped: {collisions.sum()}")
    labels = labels[~collisions]
    sl["nname"] = sl.player_name.map(norm)
    out = sl.merge(
        labels[["draft_year", "nname", "player_name", "pick", "undrafted", "tier"]],
        left_on=["sl_year", "nname"], right_on=["draft_year", "nname"],
        how="inner", suffixes=("_sl", ""),
    )
    out = add_composite_z(out)

    # Each player's slot prior excludes his draft class, so the baseline itself
    # never sees the held year's outcomes.
    prior_cols = [f"prior_{t}" for t in TIERS]
    for col in prior_cols:
        out[col] = np.nan
    for year, idx in out.groupby("sl_year").groups.items():
        prior = build_prior(exclude_class=int(year)).set_index("pick")
        keys = out.loc[idx, "pick"].where(~out.loc[idx, "undrafted"], 0).fillna(0)
        keys = keys.clip(upper=60).astype(int)
        out.loc[idx, prior_cols] = prior.loc[keys, TIERS].to_numpy()
    dropped = out.z.isna().sum()
    if dropped:
        print(f"NaN-z rows dropped: {dropped}")
    return out[out.z.notna()].reset_index(drop=True)


CANDIDATES = [(round(k, 3), m0) for k in np.arange(0, .401, .01)
              for m0 in (25, 50, 75, 100, 150, 200, 300)]


def log_likelihood(df: pd.DataFrame, k: float, m0: float, zcol: str = "z") -> float:
    priors = df[[f"prior_{t}" for t in TIERS]].to_numpy(float)
    y = df.tier.map(TIERS.index).to_numpy()
    m_eff = df["min"].to_numpy() / (df["min"].to_numpy() + m0)
    cap = min(.4, 2 * k)
    tilt = np.clip(k * df[zcol].to_numpy(float) * m_eff, -cap, cap)
    post = priors * np.exp(np.outer(tilt, GRADIENT))
    post /= post.sum(axis=1, keepdims=True)
    return float(np.log(np.clip(post[np.arange(len(df)), y], 1e-12, 1)).sum())


def loyo(df: pd.DataFrame, zcol: str = "z") -> tuple[float, float]:
    """Held-out log-likelihood: refit (k, M0) with each SL year left out, score it
    on that year. The honest measure of whether SL adds signal beyond the slot."""
    with_sl = without = 0.0
    for year in sorted(df.sl_year.unique()):
        train, held = df[df.sl_year != year], df[df.sl_year == year]
        k, m0 = max(CANDIDATES, key=lambda c: log_likelihood(train, *c, zcol=zcol))
        with_sl += log_likelihood(held, k, m0, zcol=zcol)
        without += log_likelihood(held, 0, 100, zcol=zcol)
    return with_sl, without


def fit(df: pd.DataFrame) -> dict:
    loyo_with, loyo_without = loyo(df)
    if loyo_with > loyo_without:
        k, m0 = max(CANDIDATES, key=lambda c: log_likelihood(df, *c))
    else:
        k, m0 = 0.0, 100  # no held-out signal -> the layer ships inert
    return {
        "k": k,
        "M0": m0,
        "cap": min(.4, 2 * k),
        "loyo_ll_with": loyo_with,
        "loyo_ll_without": loyo_without,
        "n": len(df),
        "years": sorted(int(y) for y in df.sl_year.unique()),
        "fit_date": date.today().isoformat(),
    }


if __name__ == "__main__":
    rows = calibration_rows()
    params = fit(rows)
    rows["m_eff"] = rows["min"] / (rows["min"] + params["M0"])
    rows.to_parquet(PROCESSED / "sl_history.parquet", index=False)
    ARTIFACT.parent.mkdir(exist_ok=True)
    ARTIFACT.write_text(json.dumps(params, indent=2) + "\n", encoding="utf-8")

    prior = np.array([.1, .15, .35, .25, .1, .05])
    assert sl_update(prior, 2, 0, params["k"], params["cap"])[1] == 0
    if params["cap"]:
        assert sl_update(prior, 99, 1, params["k"], params["cap"])[1] == params["cap"]

    print(json.dumps(params, indent=2))
    print("\nrows by year:\n", rows.groupby("sl_year").size().to_string())
    q10, q90 = rows.z.quantile([.1, .9])
    print("\ndirectional sanity (realized tier index):")
    print(rows.assign(tier_i=rows.tier.map(TIERS.index))
          .groupby(pd.cut(rows.z, [-np.inf, q10, q90, np.inf], labels=["bottom", "middle", "top"]))
          .tier_i.agg(["mean", "count"]).to_string())
    pts_with, pts_without = loyo(rows, zcol="pts36_z")
    print(f"\nrobustness, pts-only z: LOYO {pts_with:.1f} vs slot-only {pts_without:.1f} "
          f"(composite: {params['loyo_ll_with']:.1f} vs {params['loyo_ll_without']:.1f})")
