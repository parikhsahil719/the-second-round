"""Best-effort ESPN headshot resolution for the 2026 board.

For each school on the board: list its 2025-26 season athlete ids (ESPN core API),
fetch athlete details, and name-match against our players. Headshot URL is
deterministic from the athlete id. Misses fall back to initials avatars in the UI,
so partial coverage is fine. All responses disk-cached.

Run: python pipeline/headshots.py -> data/processed/headshots.parquet
"""

import json
import re
import sys
import time
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from resolve import norm

ROOT = Path(__file__).resolve().parent.parent
PROCESSED = ROOT / "data" / "processed"
CACHE = ROOT / "data" / "raw" / "espn"
CACHE.mkdir(parents=True, exist_ok=True)
CORE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball"

# barttorvik team name -> ESPN team displayName fragment, for the non-obvious ones
TEAM_ALIASES = {"north carolina": "north carolina tar heels", "unc": "north carolina tar heels",
                "uconn": "uconn huskies", "nc state": "nc state", "usc": "usc trojans",
                "smu": "smu", "byu": "byu", "vcu": "vcu", "lsu": "lsu", "ucla": "ucla",
                "connecticut": "uconn huskies", "iowa st": "iowa state cyclones",
                "ohio st": "ohio state buckeyes"}


def get_json(url: str, cache_name: str) -> dict:
    f = CACHE / cache_name
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    f.write_text(r.text, encoding="utf-8")
    time.sleep(0.15)
    return r.json()


def espn_team_ids() -> dict[str, str]:
    data = get_json(
        "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=500",
        "teams.json")
    out = {}
    for t in data["sports"][0]["leagues"][0]["teams"]:
        team = t["team"]
        for key in {team["displayName"], team["location"], team.get("shortDisplayName", ""),
                    team.get("abbreviation", "")}:
            if key:
                out[norm(key)] = team["id"]
    return out


def resolve_team(bt_name: str, teams: dict[str, str]) -> str | None:
    n = norm(bt_name)
    n = TEAM_ALIASES.get(n, n)
    if n in teams:
        return teams[n]
    hits = [tid for key, tid in teams.items() if n in key or key in n]
    return hits[0] if len(set(hits)) == 1 else None


if __name__ == "__main__":
    board = pd.read_parquet(PROCESSED / "board_2026.parquet")
    board["school"] = board.college_team.fillna(board.college)
    teams = espn_team_ids()

    rows, missed_teams = [], set()
    for school, grp in board[board.school.notna()].groupby("school"):
        tid = resolve_team(school, teams)
        if tid is None:
            missed_teams.add(school)
            continue
        listing = get_json(f"{CORE}/seasons/2026/teams/{tid}/athletes?limit=50",
                           f"team_{tid}_athletes.json")
        ids = [re.search(r"athletes/(\d+)", i["$ref"]).group(1)
               for i in listing.get("items", [])]
        wanted = {norm(p): p for p in grp.player_name}
        for aid in ids:
            if not wanted:
                break
            try:
                a = get_json(f"{CORE}/seasons/2026/athletes/{aid}", f"athlete_{aid}.json")
            except requests.HTTPError:
                continue
            n = norm(a.get("displayName", ""))
            if n in wanted:
                rows.append({
                    "player_name": wanted.pop(n), "espn_id": aid,
                    "headshot_url": (a.get("headshot") or {}).get(
                        "href",
                        f"https://a.espncdn.com/i/headshots/mens-college-basketball/players/full/{aid}.png"),
                })
    out = pd.DataFrame(rows)
    out.to_parquet(PROCESSED / "headshots.parquet")
    print(f"matched {len(out)}/{len(board)} board players to ESPN headshots")
    if missed_teams:
        print(f"unresolved schools: {sorted(missed_teams)}")
