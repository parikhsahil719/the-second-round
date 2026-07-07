"""Phase 2: outcome tier labels over each prospect's first 4 NBA seasons.

Quality tiers are production bands (ESPN-style), trajectory-aware via the best
2-consecutive-played-seasons stretch (PRISM-style: a rising year-3/4 peak counts fully,
injury gaps don't zero a player out). Voter accolades are display annotations only —
they never enter the label (All-NBA 3rd-team politics is noise, see DECISIONS.md D12).

Tier ladder (first match wins, computed top-down):
  ELITE    — peak-2-season MP-weighted BPM >= +3.5 (min 2500 MP in stretch),
             OR 4-yr VORP >= p98 of drafted players (the Jokic/Kawhi catch)
  ALL_STAR — peak-2-season BPM >= +2.2 (ESPN's published All-Star-level band), same MP gate
  STARTER  — >=5000 MP at >=26 mpg (minutes reveal role)
  ROTATION — >=2000 MP
  FRINGE   — >=50 G
  OOL      — everyone else (out of league / never stuck)

Annotations (not labels): all_star4/all_nba4 selections in window; late_bloom = production
band reached in seasons 5-7 by players whose window label was below it (the Brunson tag).

Labels are only final for classes 2011-2021 (4 full seasons of outcomes exist).
Run: python pipeline/labels.py  -> data/processed/labels.parquet + spot-check printout
"""

from pathlib import Path

import pandas as pd

from resolve import norm

PROCESSED = Path(__file__).resolve().parent.parent / "data" / "processed"

TIERS = ["OOL", "FRINGE", "ROTATION", "STARTER", "ALL_STAR", "ELITE"]
LABELED_CLASSES = range(2009, 2022)
ELITE_VORP_PCT = 0.98
ELITE_BPM, ALLSTAR_BPM, PEAK_MIN_MP = 3.5, 2.2, 2500


def _peak2(seasons: pd.DataFrame) -> tuple[float | None, float]:
    """Best MP-weighted BPM over 2 adjacent played seasons (or the lone season)."""
    rows = list(seasons.sort_values("season_end").itertuples())
    stretches = [rows[i:i + 2] for i in range(len(rows) - 1)] if len(rows) > 1 else [rows]
    best = (None, 0.0)
    for s in stretches:
        mp = sum(r.mp for r in s)
        if mp > 0:
            cand = (sum(r.bpm * r.mp for r in s) / mp, mp)
            if best[0] is None or cand[0] > best[0]:
                best = cand
    return best


def _aggregate(bref_id, draft_year, nba, acc) -> dict:
    """First-4-season aggregates + peak stretch + annotations for one player."""
    w = nba[(nba.bref_id == bref_id)
            & (nba.season_end >= draft_year + 1) & (nba.season_end <= draft_year + 4)]
    later = nba[(nba.bref_id == bref_id)
                & (nba.season_end >= draft_year + 5) & (nba.season_end <= draft_year + 7)]
    a = acc[(acc.bref_id == bref_id)
            & (acc.season_end >= draft_year + 1) & (acc.season_end <= draft_year + 4)]
    mp4 = w.mp.sum()
    pk_bpm, pk_mp = _peak2(w)
    late_bpm, late_mp = _peak2(later)
    wu = w.dropna(subset=["usg"]) if "usg" in w.columns else w.iloc[0:0]
    return {
        "g4": w.g.sum(), "mp4": mp4, "ws4": w.ws.sum(), "vorp4": w.vorp.sum(),
        "bpm4": (w.bpm * w.mp).sum() / mp4 if mp4 > 0 else None,
        "usg4": (wu.usg * wu.mp).sum() / wu.mp.sum() if wu.mp.sum() > 0 else None,
        "peak2_bpm": pk_bpm, "peak2_mp": pk_mp,
        "later_peak_bpm": late_bpm, "later_peak_mp": late_mp,
        "all_star4": (a.honor == "all_star").any(),
        "all_nba4": (a.honor == "all_nba").any(),
    }


def first4_outcomes() -> pd.DataFrame:
    drafts = pd.read_parquet(PROCESSED / "draft_results.parquet")
    nba, acc = _load_nba_acc()
    rows = []
    for d in drafts.itertuples():
        rows.append({
            "draft_year": d.draft_year, "pick": d.pick, "player_name": d.player_name,
            "bref_id": d.bref_id, "college": d.college,
            **_aggregate(d.bref_id, d.draft_year, nba, acc),
        })
    return pd.DataFrame(rows)


def _load_nba_acc():
    nba = pd.read_parquet(PROCESSED / "nba_seasons.parquet")
    # traded players carry a 2TM/3TM total row plus per-team rows; max-MP row is the total
    nba = nba.loc[nba.groupby(["bref_id", "season_end"])["mp"].idxmax()]
    acc = pd.read_parquet(PROCESSED / "accolades.parquet")
    return nba, acc


def assign_tiers(out: pd.DataFrame, elite_vorp: float | None = None) -> pd.DataFrame:
    labeled = out[out.draft_year.isin(LABELED_CLASSES)].copy()
    if elite_vorp is None:  # threshold is defined on the drafted population only
        elite_vorp = labeled.vorp4.quantile(ELITE_VORP_PCT)

    def band(bpm, mp):
        if bpm is not None and mp >= PEAK_MIN_MP:
            if bpm >= ELITE_BPM:
                return "ELITE"
            if bpm >= ALLSTAR_BPM:
                return "ALL_STAR"
        return None

    def tier(r) -> str:
        b = band(r.peak2_bpm, r.peak2_mp)
        if b == "ELITE" or r.vorp4 >= elite_vorp:
            return "ELITE"
        if b == "ALL_STAR":
            return "ALL_STAR"
        if r.mp4 >= 5000 and (r.mp4 / r.g4) >= 26:
            return "STARTER"
        if r.mp4 >= 2000:
            return "ROTATION"
        if r.g4 >= 50:
            return "FRINGE"
        return "OOL"

    labeled["tier"] = labeled.apply(tier, axis=1)
    # the Brunson tag: band reached in years 5-7, shown only when above the window label
    labeled["late_bloom"] = labeled.apply(
        lambda r: (band(r.later_peak_bpm, r.later_peak_mp)
                   if band(r.later_peak_bpm, r.later_peak_mp) is not None
                   and TIERS.index(band(r.later_peak_bpm, r.later_peak_mp)) > TIERS.index(r.tier)
                   else None), axis=1)
    labeled.attrs["elite_vorp"] = elite_vorp
    return labeled


def label_undrafted() -> pd.DataFrame:
    """Undrafted combine invitees: name-join to NBA outcomes; no NBA rows -> OOL.

    ponytail: name-based join; ambiguous duplicate names are dropped with a count.
    """
    pool = pd.read_parquet(PROCESSED / "undrafted_pool.parquet")
    pool = pool[pool.draft_year.isin(LABELED_CLASSES) & pool.matched]
    nba, acc = _load_nba_acc()
    nba = nba.assign(nname=nba.player_name.map(norm))

    rows, ambiguous = [], 0
    for p in pool.itertuples():
        cand = nba[(nba.nname == norm(p.player_name))
                   & (nba.season_end >= p.draft_year + 1)
                   & (nba.season_end <= p.draft_year + 4)]
        if cand.bref_id.nunique() > 1:
            ambiguous += 1
            continue
        bref_id = cand.bref_id.iloc[0] if len(cand) else None
        rows.append({
            "draft_year": p.draft_year, "pick": None, "player_name": p.player_name,
            "bref_id": bref_id, "college": None, "bt_pid": p.bt_pid,
            **_aggregate(bref_id, p.draft_year, nba, acc),
        })
    if ambiguous:
        print(f"undrafted: dropped {ambiguous} ambiguous name matches")
    return pd.DataFrame(rows)


SPOT_CHECK = [
    (2009, "Stephen Curry", "ELITE"), (2009, "James Harden", "ELITE"),
    (2009, "Hasheem Thabeet", "FRINGE/ROTATION"), (2010, "Paul George", "ELITE/ALL_STAR"),
    (2011, "Kyrie Irving", "ELITE"), (2011, "Kawhi Leonard", "ELITE"),
    (2011, "Jimmy Butler", "ALL_STAR"), (2011, "Klay Thompson", "ALL_STAR"),
    (2012, "Anthony Davis", "ELITE"), (2012, "Andre Drummond", "STARTER (politics evicted)"),
    (2013, "Giannis Antetokounmpo", "ELITE"), (2013, "Anthony Bennett", "FRINGE"),
    (2014, "Nikola Jokic", "ELITE"), (2014, "Joel Embiid", "ELITE (healthy stretch)"),
    (2014, "Andrew Wiggins", "STARTER"), (2015, "Karl-Anthony Towns", "ELITE"),
    (2016, "Ben Simmons", "ELITE"), (2016, "Pascal Siakam", "ALL_STAR"),
    (2017, "Jayson Tatum", "ELITE"), (2017, "Bam Adebayo", "ELITE (caught pre-accolade)"),
    (2017, "Donovan Mitchell", "ALL_STAR/ELITE"), (2018, "Luka Doncic", "ELITE"),
    (2018, "Shai Gilgeous-Alexander", "ELITE (the market's miss, caught)"),
    (2018, "Kevin Knox", "ROTATION"), (2019, "Ja Morant", "ELITE"),
    (2019, "Zion Williamson", "ELITE (per-minute monster)"),
    (2020, "Anthony Edwards", "ALL_STAR (BPM undersold; annotated All-NBA)"),
    (2020, "Tyrese Haliburton", "ELITE"), (2020, "Desmond Bane", "ALL_STAR/STARTER"),
    (2021, "Evan Mobley", "ELITE"), (2021, "Cade Cunningham", "ALL_STAR/STARTER"),
    (2021, "Scottie Barnes", "ALL_STAR"), (2018, "Jalen Brunson", "STARTER + late_bloom"),
]


if __name__ == "__main__":
    out = first4_outcomes()
    labeled = assign_tiers(out)
    labeled["undrafted"] = False
    print(f"elite VORP threshold (p{ELITE_VORP_PCT:.0%} of drafted "
          f"{min(LABELED_CLASSES)}-{max(LABELED_CLASSES)}): {labeled.attrs['elite_vorp']:.1f}")

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
    print("late_bloom tags:  ", both.late_bloom.value_counts(dropna=True).to_dict())

    print("\n=== ELITE list ===")
    for r in labeled[labeled.tier == "ELITE"].sort_values("vorp4", ascending=False).itertuples():
        print(f"  {r.draft_year} {r.player_name:26s} pk2bpm={r.peak2_bpm:5.1f} vorp4={r.vorp4:5.1f}")

    print("\n=== spot check ===")
    nnames = both.player_name.map(norm)
    for yr, name, expect in SPOT_CHECK:
        row = both[(both.draft_year == yr) & (nnames == norm(name))]
        if row.empty:
            print(f"  MISSING  {yr} {name}")
            continue
        r = row.iloc[0]
        pk = f"{r.peak2_bpm:5.1f}" if pd.notna(r.peak2_bpm) else "  n/a"
        lb = f" late_bloom={r.late_bloom}" if pd.notna(r.late_bloom) else ""
        print(f"  {r.tier:9s} {yr} {name:26s} pk2bpm={pk} vorp4={r.vorp4:5.1f}{lb}  expected: {expect}")
