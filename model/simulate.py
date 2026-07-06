"""War-room availability simulator: Monte Carlo the draft from the consensus board.

Model: each simulation draws a private 'board value' per player = consensus rank +
noise whose spread grows with rank (uncertainty is larger deep in the draft), then
the draft takes players in board-value order. Noise dispersion is calibrated so the
simulated |actual pick - consensus rank| spread matches what the 2026 draft actually
did. No team-need modeling (no free data; teams mostly draft best-available), stated
as a limitation.

Run: python model/simulate.py -> data/processed/availability.parquet
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "model"))

PROCESSED = ROOT / "data" / "processed"
N_SIMS = 10_000
N_PICKS = 60


def calibrate(board: pd.DataFrame) -> tuple[float, float]:
    """Fit noise scale sigma(rank) = a + b*rank on observed |pick - consensus rank|.

    For a rank-order race with Gaussian noise, E|pick - rank| is roughly proportional
    to sigma; we scan (a, b) on a small grid and keep the best match of mean absolute
    slide in three rank bands. ponytail: grid search over 2 params, exact enough.
    """
    obs = board.dropna(subset=["consensus_rank", "pick"])
    bands = [(1, 15), (16, 35), (36, 60)]
    target = [obs[(obs.consensus_rank >= lo) & (obs.consensus_rank <= hi)]
              .eval("abs(pick - consensus_rank)").mean() for lo, hi in bands]

    ranks = board.consensus_rank.to_numpy(float)
    best, best_err = (1.0, 0.1), np.inf
    rng = np.random.default_rng(7)
    for a in [0.5, 1.0, 2.0, 3.0, 4.0, 5.0]:
        for b in [0.02, 0.05, 0.10, 0.15, 0.20, 0.30, 0.40]:
            sims = _simulate(ranks, a, b, 400, rng)
            err = 0.0
            for (lo, hi), t in zip(bands, target):
                m = (ranks >= lo) & (ranks <= hi)
                sim_pick = np.where(sims[:, m] <= N_PICKS, sims[:, m], N_PICKS + 8)
                err += abs(np.abs(sim_pick - ranks[m]).mean() - t)
            if err < best_err:
                best, best_err = (a, b), err
    return best


def _simulate(ranks: np.ndarray, a: float, b: float, n_sims: int,
              rng: np.random.Generator) -> np.ndarray:
    """Returns (n_sims, n_players) matrix of simulated pick numbers (1-based order)."""
    sigma = a + b * ranks
    values = ranks[None, :] + rng.normal(0, 1, (n_sims, len(ranks))) * sigma[None, :]
    order = np.argsort(values, axis=1)
    picks = np.empty_like(order)
    rows = np.arange(n_sims)[:, None]
    picks[rows, order] = np.arange(1, len(ranks) + 1)[None, :]
    return picks


if __name__ == "__main__":
    board = pd.read_parquet(PROCESSED / "board_2026.parquet")
    board = board[board.consensus_rank.notna()].reset_index(drop=True)

    a, b = calibrate(board)
    print(f"calibrated noise: sigma(rank) = {a} + {b}*rank")

    rng = np.random.default_rng(42)
    picks = _simulate(board.consensus_rank.to_numpy(float), a, b, N_SIMS, rng)

    # P(available when pick p is on the clock) = P(sim pick >= p)
    avail = np.stack([(picks >= p).mean(axis=0) for p in range(1, N_PICKS + 1)], axis=1)
    out = pd.DataFrame(avail, columns=[f"avail_{p}" for p in range(1, N_PICKS + 1)])
    out.insert(0, "player_name", board.player_name)
    out.insert(1, "consensus_rank", board.consensus_rank)
    out.insert(2, "actual_pick", board.pick)
    out.to_parquet(PROCESSED / "availability.parquet")

    # validation: simulated vs actual slide dispersion
    obs = board.dropna(subset=["pick"])
    obs_slide = (obs.pick - obs.consensus_rank).abs().mean()
    m = board.pick.notna().to_numpy()
    sim_slide = np.abs(np.minimum(picks[:, m], N_PICKS + 8) -
                       board.consensus_rank.to_numpy(float)[m]).mean()
    print(f"mean |slide|: actual {obs_slide:.2f}, simulated {sim_slide:.2f}")

    # eyeball: availability of notable names at pick 9
    for name in ["Cameron Boozer", "Christian Anderson Jr.", "Nate Ament"]:
        row = out[out.player_name == name]
        if len(row):
            print(f"P(available at pick 9) {name}: {row.iloc[0]['avail_9']:.0%}")
