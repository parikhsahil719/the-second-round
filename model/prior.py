"""Slot-implied market prior: historical tier rates by draft pick, smoothed.

Every drafted player 2011-2021 (ALL pipelines — college, international, Ignite;
see DECISIONS.md D11) contributes to his pick's base rates. Smoothing: a Laplace
kernel over pick distance pools neighboring picks (pick 14 borrows from 12-16),
plus a Dirichlet pseudo-count toward the drafted marginal. Pick 0 = undrafted pool.

Run: python model/prior.py -> data/processed/slot_prior.parquet
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))

PROCESSED = Path(__file__).resolve().parent.parent / "data" / "processed"
TIERS = ["OOL", "FRINGE", "ROTATION", "STARTER", "ALL_STAR", "ELITE"]
KERNEL_SCALE = 4.0   # picks; how far a slot borrows evidence
DIRICHLET = 3.0      # pseudo-players toward the drafted marginal


def build(exclude_class: int | None = None) -> pd.DataFrame:
    """Slot prior from labeled classes; exclude_class supports leave-one-class-out."""
    labels = pd.read_parquet(PROCESSED / "labels.parquet")
    if exclude_class is not None:
        labels = labels[labels.draft_year != exclude_class]
    drafted = labels[~labels.undrafted & labels.pick.notna()]
    onehot = pd.get_dummies(drafted.tier)[TIERS].to_numpy(dtype=float)
    picks = drafted.pick.to_numpy(dtype=float)
    marginal = onehot.mean(axis=0)

    rows = []
    for p in range(1, 61):
        w = np.exp(-np.abs(picks - p) / KERNEL_SCALE)
        counts = w @ onehot + DIRICHLET * marginal
        rows.append({"pick": p, **dict(zip(TIERS, counts / counts.sum()))})

    # markets pick in value order: enforce monotonicity across picks per tier
    # (top tiers decrease, bottom tiers increase, ROTATION is the residual hump)
    from sklearn.isotonic import IsotonicRegression
    grid = pd.DataFrame(rows)
    for t, inc in [("ELITE", False), ("ALL_STAR", False), ("STARTER", False),
                   ("FRINGE", True), ("OOL", True)]:
        grid[t] = IsotonicRegression(increasing=inc).fit_transform(grid.pick, grid[t])
    grid["ROTATION"] = (1 - grid[["ELITE", "ALL_STAR", "STARTER", "FRINGE", "OOL"]]
                        .sum(axis=1)).clip(lower=0.01)
    grid[TIERS] = grid[TIERS].div(grid[TIERS].sum(axis=1), axis=0)
    rows = grid.to_dict("records")

    und = labels[labels.undrafted]
    und_counts = pd.get_dummies(und.tier).reindex(columns=TIERS, fill_value=0).sum().to_numpy(dtype=float)
    und_counts = und_counts + DIRICHLET * np.array([1, 0, 0, 0, 0, 0])  # prior mass to OOL, not stars
    rows.append({"pick": 0, **dict(zip(TIERS, und_counts / und_counts.sum()))})

    return pd.DataFrame(rows)


if __name__ == "__main__":
    prior = build()
    prior.to_parquet(PROCESSED / "slot_prior.parquet")
    show = prior.set_index("pick").loc[[1, 3, 5, 10, 15, 20, 30, 40, 55, 0]]
    print("slot prior (rows must sum to 1):")
    print((show * 100).round(1).to_string())
    assert np.allclose(prior[TIERS].sum(axis=1), 1)
    # monotone sanity: P(ELITE) at pick 1 must dominate pick 30
    assert prior.set_index("pick").ELITE[1] > 3 * prior.set_index("pick").ELITE[30]
