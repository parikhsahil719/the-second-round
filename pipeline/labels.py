"""Phase 2: outcome tier labels over each prospect's first 4 NBA seasons.

Tier ladder (first match wins, computed top-down):
  ELITE    — All-NBA selection in window, OR 4-yr VORP in the top 2% of drafted players
             (catches pre-accolade superstars: Jokic and Kawhi were Elite before voters noticed)
  ALL_STAR — All-Star selection in window
  STARTER  — >=5000 MP at >=26 mpg (minutes reveal role; quality flows upward via accolades)
  ROTATION — >=2000 MP
  FRINGE   — >=50 G
  OOL      — everyone else (out of league / never stuck)

Labels are only final for classes 2011-2021 (4 full seasons of outcomes exist).
Run: python pipeline/labels.py  -> data/processed/labels.parquet + spot-check printout
"""

from pathlib import Path

import pandas as pd

from resolve import norm

PROCESSED = Path(__file__).resolve().parent.parent / "data" / "processed"

TIERS = ["OOL", "FRINGE", "ROTATION", "STARTER", "ALL_STAR", "ELITE"]
LABELED_CLASSES = range(2011, 2022)
ELITE_VORP_PCT = 0.98


def first4_outcomes() -> pd.DataFrame:
    """Aggregate every drafted player's first-4-season NBA stats + accolades."""
    drafts = pd.read_parquet(PROCESSED / "draft_results.parquet")
    nba = pd.read_parquet(PROCESSED / "nba_seasons.parquet")
    acc = pd.read_parquet(PROCESSED / "accolades.parquet")

    # traded players carry a 2TM/3TM total row plus per-team rows; max-MP row is the total
    nba = nba.loc[nba.groupby(["bref_id", "season_end"])["mp"].idxmax()]

    rows = []
    for d in drafts.itertuples():
        window = nba[(nba.bref_id == d.bref_id)
                     & (nba.season_end >= d.draft_year + 1)
                     & (nba.season_end <= d.draft_year + 4)]
        a = acc[(acc.bref_id == d.bref_id)
                & (acc.season_end >= d.draft_year + 1)
                & (acc.season_end <= d.draft_year + 4)]
        mp4 = window.mp.sum()
        rows.append({
            "draft_year": d.draft_year, "pick": d.pick, "player_name": d.player_name,
            "bref_id": d.bref_id, "college": d.college,
            "g4": window.g.sum(), "mp4": mp4, "ws4": window.ws.sum(),
            "vorp4": window.vorp.sum(),
            # MP-weighted BPM (plain mean would overweight cup-of-coffee seasons)
            "bpm4": (window.bpm * window.mp).sum() / mp4 if mp4 > 0 else None,
            "all_star4": (a.honor == "all_star").any(),
            "all_nba4": (a.honor == "all_nba").any(),
        })
    return pd.DataFrame(rows)


def assign_tiers(out: pd.DataFrame, elite_vorp: float | None = None) -> pd.DataFrame:
    labeled = out[out.draft_year.isin(LABELED_CLASSES)].copy()
    if elite_vorp is None:  # threshold is defined on the drafted population only
        elite_vorp = labeled.vorp4.quantile(ELITE_VORP_PCT)

    def tier(r) -> str:
        if r.all_nba4 or r.vorp4 >= elite_vorp:
            return "ELITE"
        if r.all_star4:
            return "ALL_STAR"
        if r.mp4 >= 5000 and (r.mp4 / r.g4) >= 26:
            return "STARTER"
        if r.mp4 >= 2000:
            return "ROTATION"
        if r.g4 >= 50:
            return "FRINGE"
        return "OOL"

    labeled["tier"] = labeled.apply(tier, axis=1)
    labeled.attrs["elite_vorp"] = elite_vorp
    return labeled


SPOT_CHECK = [
    # (draft_year, player, what basketball sense expects)
    (2011, "Kyrie Irving", "ELITE"), (2011, "Kawhi Leonard", "ELITE (via VORP, pre-accolade)"),
    (2011, "Jimmy Butler", "ALL_STAR"), (2011, "Isaiah Thomas", "STARTER"),
    (2011, "Jan Vesely", "FRINGE/OOL"), (2012, "Anthony Davis", "ELITE"),
    (2012, "Damian Lillard", "ELITE/ALL_STAR"), (2012, "Draymond Green", "ELITE/ALL_STAR"),
    (2012, "Thomas Robinson", "ROTATION/FRINGE"), (2013, "Giannis Antetokounmpo", "ELITE"),
    (2013, "Rudy Gobert", "ELITE/ALL_STAR"), (2013, "CJ McCollum", "STARTER"),
    (2013, "Anthony Bennett", "FRINGE"), (2014, "Nikola Jokic", "ELITE (via VORP)"),
    (2014, "Joel Embiid", "ELITE/ALL_STAR"), (2014, "Andrew Wiggins", "STARTER"),
    (2014, "Zach LaVine", "STARTER/ROTATION"), (2015, "Karl-Anthony Towns", "ELITE/ALL_STAR"),
    (2015, "Devin Booker", "STARTER/ALL_STAR"), (2015, "Frank Kaminsky", "ROTATION"),
    (2016, "Ben Simmons", "ALL_STAR"), (2016, "Brandon Ingram", "STARTER"),
    (2017, "Jayson Tatum", "ELITE/ALL_STAR"), (2017, "Donovan Mitchell", "ALL_STAR"),
    (2017, "Markelle Fultz", "ROTATION/FRINGE"), (2018, "Luka Doncic", "ELITE"),
    (2018, "Trae Young", "ELITE/ALL_STAR"), (2018, "Kevin Knox", "ROTATION/FRINGE"),
    (2019, "Ja Morant", "ALL_STAR/ELITE"), (2019, "Zion Williamson", "ALL_STAR"),
    (2020, "Anthony Edwards", "ALL_STAR"), (2020, "Tyrese Haliburton", "ALL_STAR/ELITE"),
    (2020, "Desmond Bane", "STARTER"), (2021, "Evan Mobley", "ALL_STAR/STARTER"),
    (2021, "Scottie Barnes", "ALL_STAR"),
]


def label_undrafted() -> pd.DataFrame:
    """Undrafted combine invitees: name-join to NBA outcomes; no NBA rows -> OOL.

    ponytail: name-based join; ambiguous duplicate names are dropped with a count.
    """
    pool = pd.read_parquet(PROCESSED / "undrafted_pool.parquet")
    pool = pool[pool.draft_year.isin(LABELED_CLASSES) & pool.matched]
    nba = pd.read_parquet(PROCESSED / "nba_seasons.parquet")
    nba = nba.loc[nba.groupby(["bref_id", "season_end"])["mp"].idxmax()]
    nba["nname"] = nba.player_name.map(norm)
    acc = pd.read_parquet(PROCESSED / "accolades.parquet")

    rows, ambiguous = [], 0
    for p in pool.itertuples():
        cand = nba[(nba.nname == norm(p.player_name))
                   & (nba.season_end >= p.draft_year + 1)
                   & (nba.season_end <= p.draft_year + 4)]
        if cand.bref_id.nunique() > 1:
            ambiguous += 1
            continue
        mp4 = cand.mp.sum()
        bref_id = cand.bref_id.iloc[0] if len(cand) else None
        a = acc[(acc.bref_id == bref_id)
                & (acc.season_end >= p.draft_year + 1)
                & (acc.season_end <= p.draft_year + 4)] if bref_id else acc.iloc[0:0]
        rows.append({
            "draft_year": p.draft_year, "pick": None, "player_name": p.player_name,
            "bref_id": bref_id, "college": None,
            "bt_pid": p.bt_pid,
            "g4": cand.g.sum(), "mp4": mp4, "ws4": cand.ws.sum(), "vorp4": cand.vorp.sum(),
            "bpm4": (cand.bpm * cand.mp).sum() / mp4 if mp4 > 0 else None,
            "all_star4": (a.honor == "all_star").any(), "all_nba4": (a.honor == "all_nba").any(),
        })
    if ambiguous:
        print(f"undrafted: dropped {ambiguous} ambiguous name matches")
    return pd.DataFrame(rows)


if __name__ == "__main__":
    out = first4_outcomes()
    labeled = assign_tiers(out)
    labeled["undrafted"] = False
    print(f"elite VORP threshold (p{ELITE_VORP_PCT:.0%} of drafted 2011-21): "
          f"{labeled.attrs['elite_vorp']:.1f}")

    undrafted = assign_tiers(label_undrafted(), elite_vorp=labeled.attrs["elite_vorp"])
    undrafted["undrafted"] = True
    print("\n=== undrafted pool tiers ===")
    print(undrafted.tier.value_counts().reindex(TIERS).fillna(0).astype(int).to_dict())

    both = pd.concat([labeled, undrafted], ignore_index=True)
    both.to_parquet(PROCESSED / "labels.parquet")

    print("\n=== tier counts per class (drafted only) ===")
    counts = labeled.pivot_table(index="draft_year", columns="tier", aggfunc="size", fill_value=0)
    print(counts[[t for t in TIERS if t in counts.columns]].to_string())
    print("\ndrafted totals:  ", labeled.tier.value_counts().reindex(TIERS).fillna(0).astype(int).to_dict())
    print("training universe:", both.tier.value_counts().reindex(TIERS).fillna(0).astype(int).to_dict())

    print("\n=== spot check (~35 known careers) ===")
    nnames = labeled.player_name.map(norm)
    for yr, name, expect in SPOT_CHECK:
        row = labeled[(labeled.draft_year == yr) & (nnames == norm(name))]
        if row.empty:
            print(f"  MISSING  {yr} {name}")
            continue
        r = row.iloc[0]
        print(f"  {r.tier:9s} {yr} {name:26s} g4={r.g4:4.0f} mp4={r.mp4:6.0f} "
              f"vorp4={r.vorp4:5.1f} AS={r.all_star4} AN={r.all_nba4}  expected: {expect}")
