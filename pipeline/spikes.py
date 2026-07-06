"""Phase 0 data-source spikes: prove each free source works before building on it.

Each spike fetches one small sample, caches the raw response under data/raw/spike/,
and prints the fields we care about. Run: python pipeline/spikes.py
"""

import io
import json
import time
from pathlib import Path

import pandas as pd
import requests

RAW = Path(__file__).resolve().parent.parent / "data" / "raw" / "spike"
RAW.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) second-round-draft-model (personal research)"}


def fetch(url: str, cache_name: str) -> str:
    """Polite cached GET: hits disk first, sleeps 3s after any real request."""
    cache = RAW / cache_name
    if cache.exists():
        return cache.read_text(encoding="utf-8")
    resp = requests.get(url, headers=UA, timeout=30)
    resp.raise_for_status()
    cache.write_text(resp.text, encoding="utf-8")
    time.sleep(3)
    return resp.text


def spike_barttorvik():
    """College player-season advanced stats. Undocumented but well-known CSV endpoint."""
    text = fetch("https://barttorvik.com/getadvstats.php?year=2025&csv=1", "barttorvik_2025.csv")
    df = pd.read_csv(io.StringIO(text), header=None)
    print(f"[barttorvik] 2025 season: {len(df)} player rows, {df.shape[1]} columns (header-less CSV)")
    print(f"[barttorvik] first row: {df.iloc[0].tolist()[:12]} ...")


def spike_bref_draft():
    """Draft results + basic outcome columns from Basketball-Reference."""
    text = fetch("https://www.basketball-reference.com/draft/NBA_2016.html", "bref_draft_2016.html")
    tables = pd.read_html(io.StringIO(text))
    df = tables[0]
    df.columns = [c[1] for c in df.columns]  # flatten the two-row header
    print(f"[bref draft] 2016: {len(df)} rows, columns: {df.columns.tolist()}")
    print(df[["Pk", "Player", "College", "MP", "WS", "BPM", "VORP"]].head(3).to_string(index=False))


def spike_bref_player():
    """One player page: per-season advanced table is what labels are built from."""
    text = fetch("https://www.basketball-reference.com/players/i/ingrabr01.html", "bref_ingram.html")
    tables = pd.read_html(io.StringIO(text))
    adv = [t for t in tables if "BPM" in "".join(map(str, t.columns))]
    print(f"[bref player] Brandon Ingram page: {len(tables)} tables, {len(adv)} with BPM (advanced)")


def spike_combine():
    """NBA draft combine anthro via nba_api."""
    from nba_api.stats.endpoints import DraftCombineStats

    dc = DraftCombineStats(season_all_time="2025-26")
    df = dc.get_data_frames()[0]
    (RAW / "combine_2025_26.json").write_text(json.dumps(dc.get_dict()), encoding="utf-8")
    keep = ["PLAYER_NAME", "HEIGHT_WO_SHOES", "WEIGHT", "WINGSPAN", "STANDING_REACH"]
    print(f"[combine] 2025-26: {len(df)} players, cols include {keep}")
    print(df[keep].head(3).to_string(index=False))


def spike_rsci():
    """Historical RSCI top-100 hosted by Sports-Reference CBB."""
    text = fetch("https://www.basketball-reference.com/awards/recruit_rankings_2020.html", "rsci_2020.html")
    tables = pd.read_html(io.StringIO(text))
    df = tables[0]
    print(f"[rsci] 2020 class: {len(df)} rows, columns: {[str(c) for c in df.columns][:8]}")


def spike_consensus():
    """Rookie Scale 2026 consensus board — check whether content is server-rendered."""
    text = fetch("https://www.rookiescale.com/2026-consensus-board/", "rookiescale_2026.html")
    try:
        tables = pd.read_html(io.StringIO(text))
        print(f"[consensus] rookiescale: {len(tables)} html tables, first has {len(tables[0])} rows")
        print(tables[0].head(3).to_string(index=False))
    except ValueError:
        # JS-rendered page: no <table>. Note it and fall back to NBADraft.net.
        print(f"[consensus] rookiescale: no static tables ({len(text)} bytes) — likely JS-rendered")
        text2 = fetch("https://www.nbadraft.net/nba-mock-drafts/consensus/", "nbadraftnet_consensus.html")
        tables2 = pd.read_html(io.StringIO(text2))
        print(f"[consensus] nbadraft.net fallback: {len(tables2)} tables, first has {len(tables2[0])} rows")


def spike_espn_pbp():
    """ESPN JSON API directly (feeds the rim/dunk/transition bundle).

    CBBpy 2.1.2's game-ID lookup returns empty against current ESPN, so we hit the
    same public JSON endpoints it wraps.
    """
    sb = json.loads(fetch(
        "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=20250322&limit=300",
        "espn_scoreboard_20250322.json"))
    gid = sb["events"][0]["id"]
    summ = json.loads(fetch(
        f"https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event={gid}",
        f"espn_summary_{gid}.json"))
    plays = summ.get("plays", [])
    dunks = [p for p in plays if "Dunk" in p.get("type", {}).get("text", "")]
    print(f"[espn pbp] {len(sb['events'])} games on 2025-03-22; game {gid}: {len(plays)} events, {len(dunks)} dunks")


if __name__ == "__main__":
    failures = []
    for spike in [spike_barttorvik, spike_bref_draft, spike_bref_player,
                  spike_combine, spike_rsci, spike_consensus, spike_espn_pbp]:
        print(f"\n=== {spike.__name__} ===")
        try:
            spike()
        except Exception as e:  # ponytail: spike isolation — one dead source must not hide the others
            failures.append(spike.__name__)
            print(f"FAILED: {type(e).__name__}: {e}")
    print(f"\n{'ALL SPIKES PASSED' if not failures else 'FAILURES: ' + ', '.join(failures)}")
