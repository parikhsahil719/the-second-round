"""Phase 1 pullers: every source → data/processed/*.parquet.

Run: python pipeline/pull.py
Idempotent — raw responses are disk-cached, so re-runs are free.
"""

import io
import json
import re
from pathlib import Path

import pandas as pd
from bs4 import BeautifulSoup

from fetch import get, uncomment

PROCESSED = Path(__file__).resolve().parent.parent / "data" / "processed"
PROCESSED.mkdir(parents=True, exist_ok=True)

# Empirically verified against Cooper Flagg / Kon Knueppel / Ace Bailey 2025 rows.
BARTTORVIK_COLS = [
    "player_name", "team", "conf", "gp", "min_pct", "ortg", "usg", "efg", "ts",
    "orb_pct", "drb_pct", "ast_pct", "tov_pct", "ftm", "fta", "ft_pct",
    "two_m", "two_a", "two_pct", "three_m", "three_a", "three_pct",
    "blk_pct", "stl_pct", "ftr", "class_yr", "height", "jersey",
    "porpag", "adjoe", "pfr", "season", "bt_pid", "hometown",
    "rec_score",  # recruiting percentile-ish score, 100 = consensus #1, NaN = unranked
    "ast_tov", "rim_m", "rim_a", "mid_m", "mid_a", "rim_pct", "mid_pct",
    "dunk_m", "dunk_a", "dunk_pct", "pick", "drtg", "adrtg", "dporpag", "stops",
    "bpm", "obpm", "dbpm", "gbpm", "mpg", "ogbpm", "dgbpm",
    "oreb_pg", "dreb_pg", "treb_pg", "ast_pg", "stl_pg", "blk_pg", "pts_pg",
    "role", "col65", "birthdate",
]

SEASONS = range(2009, 2027)  # college seasons 2008-09 .. 2025-26 (Barttorvik starts 2008)


def pull_barttorvik() -> pd.DataFrame:
    frames = []
    for yr in SEASONS:
        text = get(f"https://barttorvik.com/getadvstats.php?year={yr}&csv=1", f"barttorvik/{yr}.csv")
        df = pd.read_csv(io.StringIO(text), header=None)
        # some seasons ship extra trailing columns; keep the 67 we mapped
        df = df.iloc[:, : len(BARTTORVIK_COLS)]
        df.columns = BARTTORVIK_COLS[: df.shape[1]]
        frames.append(df)
    out = pd.concat(frames, ignore_index=True)
    str_cols = {"player_name", "team", "conf", "class_yr", "height", "jersey",
                "hometown", "role", "birthdate"}
    for c in out.columns:
        out[c] = out[c].astype("string") if c in str_cols else pd.to_numeric(out[c], errors="coerce")
    # sanity: known picks must be present
    ingram = out[(out.season == 2016) & (out.player_name == "Brandon Ingram")]
    assert not ingram.empty and ingram.iloc[0]["pick"] == 2, "Barttorvik pick column drifted"
    out.to_parquet(PROCESSED / "college_seasons.parquet")
    return out


def _bref_player_id(cell) -> str | None:
    a = cell.find("a")
    if a and "/players/" in a.get("href", ""):
        return a["href"].split("/")[-1].removesuffix(".html")
    return None


def pull_bref_drafts() -> pd.DataFrame:
    rows = []
    for yr in range(2009, 2027):
        html = get(f"https://www.basketball-reference.com/draft/NBA_{yr}.html", f"bref/draft_{yr}.html")
        soup = BeautifulSoup(html, "lxml")
        table = soup.find("table", id="stats")
        for tr in table.find("tbody").find_all("tr"):
            if "class" in tr.attrs and "thead" in tr["class"]:
                continue
            cells = {td["data-stat"]: td for td in tr.find_all(["td", "th"])}
            if "player" not in cells or not cells["player"].get_text(strip=True):
                continue
            rows.append({
                "draft_year": yr,
                "pick": int(cells["pick_overall"].get_text()) if cells["pick_overall"].get_text() else None,
                "team": cells["team_id"].get_text(strip=True),
                "player_name": cells["player"].get_text(strip=True),
                "bref_id": _bref_player_id(cells["player"]),
                "college": cells["college_name"].get_text(strip=True) or None,
            })
    out = pd.DataFrame(rows)
    out.to_parquet(PROCESSED / "draft_results.parquet")
    return out


def pull_bref_nba_seasons() -> pd.DataFrame:
    """Every NBA player-season 2011-12 .. 2025-26 from the league Advanced pages.

    One page per season covers every player — no per-player scraping needed.
    """
    rows = []
    for end_yr in range(2010, 2027):
        html = get(f"https://www.basketball-reference.com/leagues/NBA_{end_yr}_advanced.html",
                   f"bref/advanced_{end_yr}.html")
        soup = BeautifulSoup(uncomment(html), "lxml")
        table = soup.find("table", id="advanced")
        for tr in table.find("tbody").find_all("tr"):
            cells = {td.get("data-stat"): td for td in tr.find_all(["td", "th"])}
            if "name_display" not in cells and "player" not in cells:
                continue
            name_cell = cells.get("name_display") or cells.get("player")
            name = name_cell.get_text(strip=True)
            if not name or name == "Player" or not name_cell.find("a"):
                continue  # header rows and the League Average summary row
            def num(stat):
                c = cells.get(stat)
                t = c.get_text(strip=True) if c else ""
                return float(t) if t not in ("", None) else None
            team_cell = cells.get("team_name_abbr") or cells.get("team_id")
            rows.append({
                "season_end": end_yr,
                "player_name": name,
                "bref_id": _bref_player_id(name_cell),
                "team": team_cell.get_text(strip=True) if team_cell else None,
                "g": num("games"), "mp": num("mp"),
                "ws": num("ws"), "bpm": num("bpm"), "vorp": num("vorp"),
            })
    out = pd.DataFrame(rows)
    assert out.bref_id.notna().all(), "advanced pages must carry player links"
    out.to_parquet(PROCESSED / "nba_seasons.parquet")
    return out


def pull_bref_accolades() -> pd.DataFrame:
    rows = []
    # All-NBA teams: one page, all years
    html = get("https://www.basketball-reference.com/awards/all_league.html", "bref/all_league.html")
    soup = BeautifulSoup(uncomment(html), "lxml")
    table = soup.find("table", id="awards_all_league")
    for tr in table.find("tbody").find_all("tr"):
        cells = tr.find_all(["th", "td"])
        season = cells[0].get_text(strip=True)  # e.g. "2024-25"
        if not season or len(cells) < 5:
            continue
        end_yr = int(season[:4]) + 1
        if end_yr < 2010 or "ABA" in tr.get_text():
            continue
        for td in cells:
            pid = _bref_player_id(td)
            if pid:
                rows.append({"season_end": end_yr, "bref_id": pid, "honor": "all_nba"})
    # All-Star rosters: one page per year. From 2025 the game is a mini-tournament
    # and the main page carries only the final's two squads; semifinal rosters live
    # on per-game pages linked from it. The Rising Stars squad plays in the
    # tournament without being All-Stars, so its tables are excluded by name.
    NOT_ALL_STARS = ("candace", "rising")
    for end_yr in range(2010, 2027):
        html = get(f"https://www.basketball-reference.com/allstar/NBA_{end_yr}.html",
                   f"bref/allstar_{end_yr}.html")
        pages = [html]
        # pin game links to this season (pages elsewhere in the nav link other years')
        for path in sorted(set(re.findall(rf'href="(/allstar/{end_yr}\d+NBA\.html)"', html))):
            pages.append(get(f"https://www.basketball-reference.com{path}",
                             f"bref/{path.rsplit('/', 1)[-1]}"))
        seen = set()
        for page in pages:
            soup = BeautifulSoup(uncomment(page), "lxml")
            for table in soup.find_all("table"):
                tid = (table.get("id") or "").lower()
                if any(k in tid for k in NOT_ALL_STARS):
                    continue
                for a in table.select("a[href*='/players/']"):
                    pid = a["href"].split("/")[-1].removesuffix(".html")
                    if pid not in seen:
                        seen.add(pid)
                        rows.append({"season_end": end_yr, "bref_id": pid, "honor": "all_star"})
    out = pd.DataFrame(rows).drop_duplicates()
    out.to_parquet(PROCESSED / "accolades.parquet")
    return out


def pull_combine() -> pd.DataFrame:
    from nba_api.stats.endpoints import DraftCombineStats

    # season_all_time="2018-19" holds the May 2018 combine, i.e. the 2018 draft class
    frames = []
    for yr in range(2009, 2027):
        season = f"{yr}-{str(yr + 1)[-2:]}"
        cache = PROCESSED.parent / "raw" / "combine" / f"{season}.json"
        if cache.exists():
            df = pd.DataFrame(json.loads(cache.read_text(encoding="utf-8")))
        else:
            dc = DraftCombineStats(season_all_time=season)
            df = dc.get_data_frames()[0]
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(df.to_json(orient="records"), encoding="utf-8")
            import time
            time.sleep(1.5)
        df["combine_season"] = season
        df["draft_year"] = yr
        frames.append(df)
    out = pd.concat(frames, ignore_index=True)
    keep = ["draft_year", "PLAYER_NAME", "POSITION", "HEIGHT_WO_SHOES", "WEIGHT", "WINGSPAN",
            "STANDING_REACH", "STANDING_VERTICAL_LEAP", "MAX_VERTICAL_LEAP",
            "LANE_AGILITY_TIME", "THREE_QUARTER_SPRINT"]
    out = out[[c for c in keep if c in out.columns]]
    out.columns = [c.lower() for c in out.columns]
    out.to_parquet(PROCESSED / "combine.parquet")
    return out


def pull_rsci() -> pd.DataFrame:
    rows = []
    for yr in range(2004, 2026):
        html = get(f"https://www.basketball-reference.com/awards/recruit_rankings_{yr}.html",
                   f"bref/rsci_{yr}.html")
        soup = BeautifulSoup(uncomment(html), "lxml")
        table = soup.find("table")
        for tr in table.find("tbody").find_all("tr"):
            cells = {td.get("data-stat"): td for td in tr.find_all(["td", "th"])}
            name_cell = cells.get("player")
            if not name_cell or not name_cell.get_text(strip=True):
                continue
            rank_txt = cells.get("rank").get_text(strip=True) if cells.get("rank") else ""
            college_cell = cells.get("college_name") or cells.get("colleges")
            rows.append({
                "recruit_year": yr,
                "rsci_rank": int(rank_txt) if rank_txt.isdigit() else None,
                "player_name": name_cell.get_text(strip=True),
                "bref_id": _bref_player_id(name_cell),
                "college": college_cell.get_text(strip=True) if college_cell else None,
            })
    out = pd.DataFrame(rows)
    out.to_parquet(PROCESSED / "rsci.parquet")
    return out


def pull_consensus_2026() -> pd.DataFrame:
    html = get("https://www.rookiescale.com/2026-consensus-board/", "consensus/rookiescale_2026.html")
    df = pd.read_html(io.StringIO(html))[0]
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    df = df.rename(columns={"prospect": "player_name", "pre-draft_team": "pre_draft_team"})
    df["source"] = "rookiescale"
    df = df.sort_values("rank")
    df.to_parquet(PROCESSED / "consensus_2026.parquet")
    return df


if __name__ == "__main__":
    for fn in [pull_barttorvik, pull_bref_drafts, pull_bref_nba_seasons,
               pull_bref_accolades, pull_combine, pull_rsci, pull_consensus_2026]:
        df = fn()
        print(f"{fn.__name__}: {len(df)} rows -> ok")
    print("ALL PULLS COMPLETE")
