"""Build the live Summer League evidence layer without changing the draft-day board."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from model.common import TIERS, UTILITY  # noqa: E402
from model.notes import GRADIENT  # noqa: E402
from pipeline.resolve import norm  # noqa: E402
from pipeline.summer import aggregate_games, pull_sl_2026  # noqa: E402

PROCESSED = ROOT / "data" / "processed"
PARAMS = ROOT / "model" / "artifacts" / "sl_params.json"

# SL spelling -> board spelling. Keep empty until the loud match report finds one.
SL_NAME_OVERRIDES: dict[str, str] = {}


def sl_update(prior: np.ndarray, z: float, m_eff: float, k: float,
              cap: float) -> tuple[np.ndarray, float]:
    # tanh saturation, not a hard clip (D22): an extreme summer keeps adding
    # weight with diminishing returns. `cap` is the asymptote, fitted by LOYO —
    # history itself says the response flattens, so the ceiling is measured.
    tilt = float(cap * np.tanh(k * z * m_eff / cap)) if cap > 0 else 0.0
    if not np.isfinite(tilt):  # a NaN here would 500 the whole board
        tilt = 0.0
    posterior = np.asarray(prior, dtype=float) * np.exp(tilt * GRADIENT)
    return posterior / posterior.sum(), tilt


def _year_z(s: pd.Series) -> pd.Series:
    sd = s.std(ddof=0)
    return ((s - s.mean()) / sd if pd.notna(sd) and sd > 0 else s * 0).clip(-2.5, 2.5)


def add_composite_z(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["prod36_z"] = out.groupby("sl_year")["prod36"].transform(_year_z)
    out["ts_z"] = out.groupby("sl_year")["ts"].transform(_year_z).fillna(0)
    out["pts36_z"] = out.groupby("sl_year")["pts36"].transform(_year_z)
    out["z"] = (0.7 * out.prod36_z + 0.3 * out.ts_z).clip(-2.5, 2.5)
    return out


def _market_key(r) -> int:
    if pd.notna(r.pick):
        return int(min(r.pick, 60))
    if pd.notna(r.consensus_rank) and r.consensus_rank <= 60:
        return int(r.consensus_rank)
    return 0


def build() -> tuple[pd.DataFrame, pd.DataFrame]:
    params = json.loads(PARAMS.read_text(encoding="utf-8"))
    board = pd.read_parquet(PROCESSED / "board_2026.parquet")
    slot = pd.read_parquet(PROCESSED / "slot_prior.parquet").set_index("pick")
    games = pull_sl_2026()
    agg = aggregate_games(games)
    if agg.empty:
        raise RuntimeError("No 2026 Summer League rows returned")

    board = board.copy()
    board["nname"] = board.player_name.map(norm)
    agg["nname"] = agg.player_name.map(
        lambda n: norm(SL_NAME_OVERRIDES.get(str(n), str(n))))
    duplicate_board = set(board.loc[board.nname.duplicated(False), "nname"])
    name_map = (board[~board.nname.isin(duplicate_board)]
                .set_index("nname").player_name.to_dict())
    agg["board_name"] = agg.nname.map(name_map)
    matched = agg[agg.board_name.notna()].copy()

    drafted = board[board.pick.notna()]
    seen_drafted = set(agg.nname) & set(drafted.nname)
    unresolved = sorted(seen_drafted - set(matched.nname))
    print(f"SL match: {len(matched)}/{len(agg)} players on the 2026 board")
    if unresolved:
        print("UNMATCHED DRAFTED SL PLAYERS:", unresolved)
    multi = matched[matched.teams > 1]
    if not multi.empty:
        print("NAME SPANS MULTIPLE SL TEAMS (check for a namesake merge):",
              sorted(multi.player_name))

    # Standardize only among matched 2026 rookies: vets and two-ways do not set
    # the rookie evidence scale.
    matched = add_composite_z(matched)
    matched["m_eff"] = matched["min"] / (matched["min"] + float(params["M0"]))
    matched["player_name"] = matched.pop("board_name")
    matched["as_of"] = pd.to_datetime(matched.as_of).dt.strftime("%Y-%m-%d")

    by_name = board.set_index("player_name")
    util = np.array([UTILITY[t] for t in TIERS])
    rows = []
    for s in matched.itertuples():
        b = by_name.loc[s.player_name]
        if b.coverage == "model":
            prior = np.array([b[f"p_{t}"] for t in TIERS], dtype=float)
            basis = "model"
            baseline_ev = float(b.ev_model)
        else:
            prior = slot.loc[_market_key(b), TIERS].to_numpy(dtype=float)
            basis = "market"
            baseline_ev = float(prior @ util)
        post, tilt = sl_update(prior, s.z, s.m_eff, params["k"], params["cap"])
        ev = float(post @ util)
        delta = ev - baseline_ev
        rows.append({
            "player_name": s.player_name,
            "tilt": tilt,
            **{f"p_{t}_sl": post[i] for i, t in enumerate(TIERS)},
            "p_STAR_sl": post[4] + post[5],
            "ev_sl": ev,
            "ev_delta": delta,
            "prior_basis": basis,
            "moved": (f"{s.min:.0f} minutes across {s.events} "
                      f"(z {s.z:+.1f}): tilt {tilt:+.2f}, EV {delta:+.1f}"),
            "as_of": s.as_of,
        })

    box = matched[[
        "player_name", "player_id", "gp", "min", "mpg", "pts_pg", "reb_pg",
        "ast_pg", "stl_pg", "blk_pg", "tov_pg", "ts", "prod36", "z", "m_eff",
        "events", "as_of",
    ]].sort_values("player_name").reset_index(drop=True)
    post = pd.DataFrame(rows).sort_values("player_name").reset_index(drop=True)
    box.to_parquet(PROCESSED / "summer_league.parquet", index=False)
    post.to_parquet(PROCESSED / "sl_posterior.parquet", index=False)

    print(post.nlargest(10, "ev_delta")[["player_name", "ev_delta", "tilt"]].to_string(index=False))
    print(f"near-saturation (>95% of cap): {(post.tilt.abs() > 0.95 * params['cap']).sum()}")
    return box, post


def _self_test() -> None:
    prior = np.array([.1, .15, .35, .25, .1, .05])
    up, t_up = sl_update(prior, 1, 1, .2, .4)
    down, _ = sl_update(prior, -1, 1, .2, .4)
    capped, tilt = sl_update(prior, 99, 1, .2, .4)
    zero, _ = sl_update(prior, 2, 0, .2, .4)
    assert up[4:].sum() > prior[4:].sum() > down[4:].sum()
    assert np.isclose(tilt, .4) and np.isclose(capped.sum(), 1)  # asymptote reached
    assert 0 < t_up < .2  # saturation already discounts a mid-size signal
    assert np.allclose(zero, prior)
    assert sl_update(prior, 99, 1, .2, 0)[1] == 0  # cap 0 -> layer inert


if __name__ == "__main__":
    _self_test()
    print("self-test passed")
    build()
