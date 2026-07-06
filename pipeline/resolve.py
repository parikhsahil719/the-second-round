"""Entity resolution: crosswalk B-Ref draftees <-> Barttorvik college careers.

Match ladder (strongest first):
  1. (draft_year, pick) exact against Barttorvik's backfilled pick column
  2. (pick, normalized name) against any Barttorvik season
  3. normalized name + final college season <= draft year
  4. MANUAL_OVERRIDES

Run: python pipeline/resolve.py  -> data/processed/crosswalk.parquet + coverage report
"""

import re
import unicodedata
from pathlib import Path

import pandas as pd

PROCESSED = Path(__file__).resolve().parent.parent / "data" / "processed"

# bref_id -> barttorvik pid, for stragglers the ladder can't reach (filled as found)
MANUAL_OVERRIDES: dict[str, int] = {}

# B-Ref name -> Barttorvik name, nicknames the normalizer can't bridge
NAME_ALIASES = {
    "maurice harkless": "moe harkless",
    "jeff taylor": "jeffery taylor",
    "devyn marble": "roy devyn marble",
    "kay felder": "kahlil felder",
    "wes iwundu": "wesley iwundu",
    "mo bamba": "mohamed bamba",
    "nic claxton": "nicolas claxton",
    "bones hyland": "nahshon hyland",
    "cam thomas": "cameron thomas",
    "gg jackson": "gregory jackson",
    "cam boozer": "cameron boozer",
}


def norm(name: str) -> str:
    s = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode()
    s = re.sub(r"[.,'’-]", "", s.lower())
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return NAME_ALIASES.get(s, s)


def build_crosswalk() -> pd.DataFrame:
    drafts = pd.read_parquet(PROCESSED / "draft_results.parquet")
    college = pd.read_parquet(PROCESSED / "college_seasons.parquet")
    college["nname"] = college.player_name.map(norm)

    rows = []
    for d in drafts.itertuples():
        if d.pick is None or pd.isna(d.pick):
            continue
        match, method = None, None

        # 1. exact (season==draft_year, pick)
        hit = college[(college.season == d.draft_year) & (college.pick == d.pick)]
        if len(hit) == 1:
            match, method = hit.iloc[0], "year+pick"

        # 2. pick + name anywhere (redshirts, early declares who sat)
        if match is None:
            hit = college[(college.pick == d.pick) & (college.nname == norm(d.player_name))]
            if len(hit):
                match, method = hit.sort_values("season").iloc[-1], "pick+name"

        # 3. name + latest season <= draft year
        if match is None:
            hit = college[(college.nname == norm(d.player_name)) & (college.season <= d.draft_year)]
            if len(hit):
                match, method = hit.sort_values("season").iloc[-1], "name"

        # 4. manual
        if match is None and d.bref_id in MANUAL_OVERRIDES:
            hit = college[college.bt_pid == MANUAL_OVERRIDES[d.bref_id]]
            if len(hit):
                match, method = hit.sort_values("season").iloc[-1], "manual"

        rows.append({
            "draft_year": d.draft_year, "pick": d.pick, "player_name": d.player_name,
            "bref_id": d.bref_id, "college": d.college,
            "bt_pid": match.bt_pid if match is not None else None,
            "bt_final_season": match.season if match is not None else None,
            "bt_team": match.team if match is not None else None,
            "match_method": method,
        })
    return pd.DataFrame(rows)


def undrafted_pool() -> pd.DataFrame:
    """Combine invitees who went undrafted: the 'market said maybe, then said no' pool."""
    combine = pd.read_parquet(PROCESSED / "combine.parquet")
    drafts = pd.read_parquet(PROCESSED / "draft_results.parquet")
    college = pd.read_parquet(PROCESSED / "college_seasons.parquet")
    college["nname"] = college.player_name.map(norm)

    drafted_names = set(drafts.player_name.map(norm) + "|" + drafts.draft_year.astype(str))
    rows = []
    for c in combine.itertuples():
        key = norm(c.player_name) + "|" + str(c.draft_year)
        if key in drafted_names:
            continue
        hit = college[(college.nname == norm(c.player_name)) & (college.season == c.draft_year)]
        rows.append({
            "draft_year": c.draft_year, "player_name": c.player_name,
            "bt_pid": hit.iloc[0].bt_pid if len(hit) == 1 else None,
            "bt_final_season": c.draft_year if len(hit) == 1 else None,
            "matched": len(hit) == 1,
        })
    return pd.DataFrame(rows)


if __name__ == "__main__":
    xw = build_crosswalk()
    xw.to_parquet(PROCESSED / "crosswalk.parquet")

    d1 = xw[xw.college.notna()]  # B-Ref college set => played US college ball
    print("=== drafted-player crosswalk coverage (players with a College listed) ===")
    for yr, grp in d1.groupby("draft_year"):
        matched = grp.bt_pid.notna().sum()
        print(f"  {yr}: {matched}/{len(grp)} matched ({matched/len(grp):.0%})")
    total = d1.bt_pid.notna().sum()
    print(f"  TOTAL: {total}/{len(d1)} = {total/len(d1):.1%}")
    print("\n  by method:", d1.match_method.value_counts(dropna=False).to_dict())

    unmatched = d1[d1.bt_pid.isna()]
    if len(unmatched):
        print("\n  UNMATCHED:")
        print(unmatched[["draft_year", "pick", "player_name", "college"]].to_string(index=False))

    up = undrafted_pool()
    up.to_parquet(PROCESSED / "undrafted_pool.parquet")
    print(f"\n=== undrafted combine invitees ===")
    print(f"  {len(up)} players, {up.matched.sum()} matched to Barttorvik ({up.matched.mean():.0%})")
