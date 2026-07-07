"""Labeling robustness study: do the headline claims survive alternative outcome
definitions?

Variants (each fully relabels the same careers, then the WHOLE evaluation reruns
under that definition -- market prior rebuilt per fold, model refit per fold):

  v0_current   peak-2-consecutive-season MP-weighted BPM bands (production)
  v1_avg4      4-year MP-weighted BPM instead of the peak stretch, cutoffs
               count-matched to v0 so tier populations stay comparable
  v2_usage     v0 bands, but ALL_STAR/ELITE additionally require above-league-
               average creation burden (4-yr MP-weighted USG% >= 20); demoted
               players fall through the minutes ladder
  v3_accolade  ELITE = All-NBA selection in window, ALL_STAR = All-Star selection
               (what "role players aren't All-Stars" looks like taken literally)

Scored per variant, never across variants: log losses are not comparable across
different label definitions (different targets). The question is whether each
HEADLINE CLAIM survives within each definition:
  H1  market beats model on average (pooled OOF log loss)
  H2  model wins at the extremes of disagreement (top/bottom-40 realized value)
  H3  picks 31-45 are the market's inefficient region

Run: python model/robustness.py  -> report/robustness.md + stdout
"""

import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore", message="X does not have valid feature names")

import numpy as np
import pandas as pd
from sklearn.metrics import log_loss
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "model"))
import prior as prior_mod  # noqa: E402
from common import FEATURES, TIERS, UTILITY  # noqa: E402
from train import CLASSES, collapse6to5, isotonic_calibrate  # noqa: E402

PROCESSED = ROOT / "data" / "processed"
USG_GATE = 20.0  # league-average usage; stars must carry at least an average load
PEAK_MIN_MP = 2500
TRACK = ["Mikal Bridges", "Otto Porter Jr.", "Andre Drummond", "Jalen Brunson",
         "James Harden", "Draymond Green", "Nikola Jokic", "Desmond Bane"]
BUCKETS = [(1, 10), (11, 20), (21, 30), (31, 45), (46, 60)]


def make_key(frame: pd.DataFrame) -> pd.Series:
    """Identity key that survives int/float drift between features and labels."""
    bt = pd.to_numeric(frame.bt_pid, errors="coerce").astype("Int64").astype(str)
    return pd.Series(
        np.where(frame.undrafted, "u" + bt, "d" + frame.bref_id.astype(str)),
        index=frame.index) + "_" + frame.draft_year.astype(int).astype(str)


def ladder(r) -> str:
    if r.mp4 >= 5000 and r.g4 > 0 and (r.mp4 / r.g4) >= 26:
        return "STARTER"
    if r.mp4 >= 2000:
        return "ROTATION"
    if r.g4 >= 50:
        return "FRINGE"
    return "OOL"


def build_variants(lab: pd.DataFrame) -> dict[str, pd.Series]:
    elite_vorp = lab[~lab.undrafted].vorp4.quantile(0.98)

    # v1: same band idea on the 4-year average, cutoffs count-matched to v0
    elig = (lab.mp4 >= PEAK_MIN_MP) & lab.bpm4.notna()
    n_elite = (lab.tier == "ELITE").sum()
    n_as = (lab.tier == "ALL_STAR").sum()
    vals = lab.loc[elig, "bpm4"].sort_values(ascending=False)
    elite_cut, allstar_cut = vals.iloc[n_elite - 1], vals.iloc[n_elite + n_as - 1]

    def v1(r):
        if r.mp4 >= PEAK_MIN_MP and pd.notna(r.bpm4):
            if r.bpm4 >= elite_cut or r.vorp4 >= elite_vorp:
                return "ELITE"
            if r.bpm4 >= allstar_cut:
                return "ALL_STAR"
        elif r.vorp4 >= elite_vorp:
            return "ELITE"
        return ladder(r)

    def v2(r):
        if r.tier in ("ELITE", "ALL_STAR") and not (pd.notna(r.usg4) and r.usg4 >= USG_GATE):
            return ladder(r)
        return r.tier

    def v3(r):
        if r.all_nba4:
            return "ELITE"
        if r.all_star4:
            return "ALL_STAR"
        return ladder(r)

    return {
        "v0_current": lab.tier,
        "v1_avg4": lab.apply(v1, axis=1),
        "v2_usage": lab.apply(v2, axis=1),
        "v3_accolade": lab.apply(v3, axis=1),
    }


def load_merged(lab: pd.DataFrame) -> pd.DataFrame:
    """train.load_training, but keeping the join keys so variant tiers can map on."""
    f = pd.read_parquet(PROCESSED / "features.parquet")
    drafted = f[~f.undrafted].merge(
        lab[~lab.undrafted][["bref_id", "draft_year", "player_name"]],
        on=["bref_id", "draft_year"], suffixes=("", "_l"))
    und = f[f.undrafted].merge(
        lab[lab.undrafted][["bt_pid", "draft_year", "player_name"]],
        on=["bt_pid", "draft_year"], suffixes=("", "_l"))
    df = pd.concat([drafted, und], ignore_index=True)
    df = df[df.draft_year.isin(CLASSES) & df.eligible].copy()
    df["key"] = make_key(df)
    return df


def loco_ordinal(df: pd.DataFrame, y6: np.ndarray) -> np.ndarray:
    import mord
    X_all = df[FEATURES].to_numpy(dtype=float)
    med = np.nanmedian(X_all, axis=0)
    oof = np.full((len(df), 6), np.nan)
    for held in CLASSES:
        tr, te = (df.draft_year != held).to_numpy(), (df.draft_year == held).to_numpy()
        Xtr = np.where(np.isnan(X_all[tr]), med, X_all[tr])
        Xte = np.where(np.isnan(X_all[te]), med, X_all[te])
        sc = StandardScaler().fit(Xtr)
        m = mord.LogisticAT(alpha=4.0).fit(sc.transform(Xtr), y6[tr])
        # classes absent from a fold's training data get zero probability columns
        p = np.zeros((te.sum(), 6))
        p[:, m.classes_.astype(int)] = m.predict_proba(sc.transform(Xte))
        oof[te] = p
    return oof


def market_loco(df: pd.DataFrame, var_lab: pd.DataFrame) -> np.ndarray:
    picks = df.pick.fillna(0).clip(upper=60).astype(int)
    out = np.empty((len(df), 6))
    for held in CLASSES:
        grid = prior_mod.build(exclude_class=int(held), labels=var_lab).set_index("pick")
        mask = (df.draft_year == held).to_numpy()
        out[mask] = grid.loc[picks[mask], TIERS].to_numpy()
    return out


def evaluate(name: str, df: pd.DataFrame, var_lab: pd.DataFrame) -> dict:
    tier_map = dict(zip(var_lab.key, var_lab.tier))
    tiers = df.key.map(tier_map)
    assert tiers.notna().all(), f"{tiers.isna().sum()} training rows failed to map to a tier"
    y6 = tiers.map({t: i for i, t in enumerate(TIERS)}).to_numpy()
    y5 = np.minimum(y6, 4)

    market6 = market_loco(df, var_lab)
    market5 = collapse6to5(market6)
    oof6 = loco_ordinal(df, y6)
    cal6 = isotonic_calibrate(oof6, y6)
    model5 = collapse6to5(cal6)

    ll_market = log_loss(y5, market5, labels=range(5))
    ll_model = log_loss(y5, model5, labels=range(5))

    util = np.array([UTILITY[t] for t in TIERS])
    ev_model, ev_market = cal6 @ util, market6 @ util
    realized = np.array([UTILITY[t] for t in tiers])
    edge = ev_model - ev_market
    top, bot = np.argsort(-edge)[:40], np.argsort(edge)[:40]
    diffs = realized - ev_market
    rng = np.random.default_rng(11)
    null = diffs[rng.integers(0, len(df), (10000, 40))].mean(axis=1)
    p_top = float((null >= diffs[top].mean()).mean())
    p_bot = float((null <= diffs[bot].mean()).mean())

    regions = {}
    for lo, hi in BUCKETS:
        m = df.pick.between(lo, hi).to_numpy()
        if m.sum() >= 25:
            regions[f"{lo}-{hi}"] = (log_loss(y5[m], model5[m], labels=range(5))
                                     - log_loss(y5[m], market5[m], labels=range(5)))

    counts = tiers.value_counts().reindex(TIERS).fillna(0).astype(int)
    return {"name": name, "ll_market": ll_market, "ll_model": ll_model,
            "top40": diffs[top].mean(), "p_top": p_top,
            "bot40": diffs[bot].mean(), "p_bot": p_bot,
            "regions": regions, "counts": counts,
            "tracked": {n: tier_map.get(k) for n, k in TRACK_KEYS.items() if k in tier_map}}


if __name__ == "__main__":
    lab = pd.read_parquet(PROCESSED / "labels.parquet")
    lab = lab[lab.draft_year.isin(CLASSES)].copy()
    lab["key"] = make_key(lab)
    TRACK_KEYS = {n: lab.loc[lab.player_name == n, "key"].iloc[0]
                  for n in TRACK if (lab.player_name == n).any()}

    variants = build_variants(lab)
    df = load_merged(lab)
    print(f"training rows: {len(df)}")

    results = []
    for name, tier_series in variants.items():
        var_lab = lab.copy()
        var_lab["tier"] = tier_series
        res = evaluate(name, df, var_lab)
        results.append(res)
        print(f"\n=== {name} ===")
        print(f"  counts: {res['counts'].to_dict()}")
        print(f"  H1  market {res['ll_market']:.4f} vs model {res['ll_model']:.4f}  "
              f"-> market {'beats' if res['ll_market'] < res['ll_model'] else 'LOSES TO'} model on average")
        print(f"  H2  top-40 favorites realized {res['top40']:+.2f} vs slot (p={res['p_top']:.4f}); "
              f"bottom-40 fades {res['bot40']:+.2f} (p={res['p_bot']:.4f})")
        print(f"  H3  model-minus-market log loss by pick region (negative = model better):")
        for reg, v in res["regions"].items():
            print(f"        picks {reg:6s} {v:+.4f}")
        print(f"  tracked: {res['tracked']}")

    # markdown report
    lines = ["# Labeling robustness study", "",
             "Each variant fully relabels the same careers; the market prior and model",
             "are refit leave-one-class-out under that definition. Log losses are only",
             "comparable WITHIN a variant (different labels = different targets).", ""]
    lines += ["| variant | market LL | model LL | H1 market wins avg | top-40 edge (p) | bottom-40 edge (p) | 31-45 model edge |",
              "|---|---|---|---|---|---|---|"]
    for r in results:
        reg = r["regions"].get("31-45", float("nan"))
        lines.append(
            f"| {r['name']} | {r['ll_market']:.4f} | {r['ll_model']:.4f} | "
            f"{'yes' if r['ll_market'] < r['ll_model'] else 'NO'} | "
            f"{r['top40']:+.2f} (p={r['p_top']:.4f}) | {r['bot40']:+.2f} (p={r['p_bot']:.4f}) | "
            f"{reg:+.4f} |")
    lines += ["", "## Tier populations", "",
              "| variant | " + " | ".join(TIERS) + " |", "|---|" + "---|" * 6]
    for r in results:
        lines.append(f"| {r['name']} | " + " | ".join(str(r["counts"][t]) for t in TIERS) + " |")
    lines += ["", "## Where notable careers land", "",
              "| player | " + " | ".join(v["name"] for v in results) + " |", "|---|" + "---|" * len(results)]
    for n in TRACK:
        if n in results[0]["tracked"]:
            lines.append(f"| {n} | " + " | ".join(r["tracked"][n] for r in results) + " |")
    (ROOT / "report" / "robustness.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\nsaved: report/robustness.md")
