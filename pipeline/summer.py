"""NBA Summer League box scores: immutable history plus a daily 2026 pull.

The NBA Stats endpoint uses calendar-year season strings for Summer League
(`2026`, not `2026-27`). A 2026-07-14 probe found California in league 13,
Vegas in 15, Salt Lake City in 16, and no current Orlando event in 14. The
historical grid below contains only league/year pairs that returned rows.

Run once for calibration: python pipeline/summer.py --history
Run for the live feed:     python pipeline/summer.py
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "sl"
PROCESSED = ROOT / "data" / "processed"

LEAGUES = {
    "13": "California Classic",
    "14": "Orlando",
    "15": "Las Vegas",
    "16": "Salt Lake City",
}
LIVE_LEAGUES = ("13", "14", "15", "16")
HISTORY_YEARS = {
    "13": (2018, 2019, 2021, 2022, 2023, 2024, 2025),
    "14": (2010, 2012, 2013, 2014, 2015, 2016, 2017),
    "15": (2010, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019,
           2021, 2022, 2023, 2024, 2025),
    "16": (2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025),
}


def _cache_path(league_id: str, year: int, live: bool) -> Path:
    if live:
        return RAW / "live" / f"{league_id}_{year}_{date.today():%Y%m%d}.json"
    return RAW / f"{league_id}_{year}.json"


def pull_sl_season(league_id: str, year: int, live: bool = False) -> pd.DataFrame:
    """Pull one player-game table, cached forever historically and daily live."""
    cache = _cache_path(league_id, year, live)
    if cache.exists():
        return pd.DataFrame(json.loads(cache.read_text(encoding="utf-8")))

    from nba_api.stats.endpoints import LeagueGameFinder

    error: Exception | None = None
    for attempt in range(2):
        try:
            df = LeagueGameFinder(
                player_or_team_abbreviation="P",
                league_id_nullable=league_id,
                season_nullable=str(year),
                timeout=30,
            ).get_data_frames()[0]
            break
        except Exception as exc:  # NBA Stats occasionally drops a connection
            error = exc
            if attempt == 0:
                time.sleep(1.5)
    else:
        raise RuntimeError(f"Summer League pull failed: {league_id}/{year}") from error

    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(df.to_json(orient="records"), encoding="utf-8")
    time.sleep(1.5)  # pace every uncached hit; stats.nba.com throttles bursts
    return df


def _tag(df: pd.DataFrame, league_id: str, year: int) -> pd.DataFrame:
    if df.empty:
        return df
    out = df.copy()
    out["event"] = LEAGUES[league_id]
    out["sl_year"] = year
    return out


def _dedup(frames: list[pd.DataFrame]) -> pd.DataFrame:
    frames = [f for f in frames if not f.empty]
    if not frames:
        return pd.DataFrame()
    return (pd.concat(frames, ignore_index=True)
            .drop_duplicates(["GAME_ID", "PLAYER_ID"])
            .sort_values(["GAME_DATE", "GAME_ID", "PLAYER_ID"])
            .reset_index(drop=True))


def pull_sl_history() -> pd.DataFrame:
    frames = []
    for league_id, years in HISTORY_YEARS.items():
        for year in years:
            frames.append(_tag(pull_sl_season(league_id, year), league_id, year))
    games = _dedup(frames)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    games.to_parquet(PROCESSED / "sl_history_games.parquet", index=False)
    return games


def pull_sl_2026() -> pd.DataFrame:
    frames = []
    for league_id in LIVE_LEAGUES:
        frames.append(_tag(pull_sl_season(league_id, 2026, live=True), league_id, 2026))
    games = _dedup(frames)
    if not games.empty:
        dates = pd.to_datetime(games.GAME_DATE)
        assert dates.dt.year.eq(2026).all() and dates.dt.month.eq(7).all(), \
            "NBA Stats returned non-July-2026 rows for season=2026"
    return games


def aggregate_games(games: pd.DataFrame) -> pd.DataFrame:
    """One row per player/year, including the production composite inputs."""
    if games.empty:
        return pd.DataFrame()
    d = games.rename(columns=str.lower).copy()
    numeric = ["min", "pts", "fga", "fta", "reb", "ast", "stl", "blk", "tov"]
    d[numeric] = d[numeric].apply(pd.to_numeric, errors="coerce").fillna(0)
    # Identity is (year, name), not player_id: NBA Stats hands some SL players two
    # ids (a temporary invitee id plus the official one), splitting one player into
    # two rows. Name-merging never double-counts a game (dedup is per GAME_ID), and
    # `teams` flags the rare cross-team namesake for the match report.
    keys = ["sl_year", "player_name"]
    sums = d.groupby(keys, as_index=False)[numeric].sum()
    meta = d.groupby(keys, as_index=False).agg(
        player_id=("player_id", "first"),
        gp=("game_id", "nunique"),
        events=("event", lambda x: " + ".join(sorted(set(x)))),
        teams=("team_abbreviation", "nunique"),
        as_of=("game_date", "max"),
    )
    out = meta.merge(sums, on=keys)
    # Zero recorded minutes is a DNP, not evidence — and a NaN z would otherwise
    # poison the calibration grid search and the live posterior.
    out = out[out["min"] > 0].copy()
    out["prod36"] = (out.pts + 1.5 * out.ast + 1.2 * out.reb + 2 * out.stl
                     + 2 * out.blk - 1.2 * out.tov) / out["min"] * 36
    out["pts36"] = out.pts / out["min"] * 36
    denom = 2 * (out.fga + 0.44 * out.fta)
    out["ts"] = np.where(denom > 0, out.pts / denom, np.nan)
    for stat in ("min", "pts", "reb", "ast", "stl", "blk", "tov"):
        out[f"{stat}_pg" if stat != "min" else "mpg"] = out[stat] / out.gp.clip(lower=1)
    return out.sort_values(["sl_year", "player_name"]).reset_index(drop=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--history", action="store_true")
    args = parser.parse_args()
    result = pull_sl_history() if args.history else pull_sl_2026()
    print(f"{len(result)} player-game rows")
    if not result.empty:
        print(result.groupby(["sl_year", "event"]).GAME_ID.nunique().to_string())
