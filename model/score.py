"""Phase 4: score the 2026 board — distributions, markets, edge, attribution, comps.

Pipeline: fit the winning spec (ordinal LogisticAT alpha=4, 5-tier merged-STAR target)
on all 13 labeled classes; isotonic calibrators fit on LOCO out-of-fold predictions;
100 cluster-bootstrap refits (resampling draft classes) give probability intervals.
P(STAR) is split into ALL_STAR/ELITE at display time by the slot-conditioned historical
share. Markets: actual 2026 slot AND consensus board rank as pseudo-pick, both via the
slot prior. Attribution: exact coefficient x standardized-value contributions (ordinal
model — no SHAP needed). Comps: k=5 nearest neighbors in z-scored feature space.

Run: python model/score.py -> data/processed/board_2026.parquet + model/artifacts/
"""

import sys
import warnings
from pathlib import Path

import joblib
import mord
import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore", message="X does not have valid feature names")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "model"))
sys.path.insert(0, str(ROOT / "pipeline"))
from common import TIERS, TIERS5, UTILITY, FEATURES, value_grade  # noqa: E402
from resolve import norm  # noqa: E402

PROCESSED = ROOT / "data" / "processed"
ARTIFACTS = ROOT / "model" / "artifacts"
CLASSES = list(range(2009, 2022))
N_BOOT = 100
UTIL5 = np.array([UTILITY[t] if t != "STAR" else 0 for t in TIERS5])  # STAR handled via split


def load_all():
    f = pd.read_parquet(PROCESSED / "features.parquet")
    labels = pd.read_parquet(PROCESSED / "labels.parquet")
    drafted = f[~f.undrafted].merge(
        labels[~labels.undrafted][["bref_id", "draft_year", "tier"]],
        on=["bref_id", "draft_year"], how="left")
    und = f[f.undrafted].merge(
        labels[labels.undrafted][["bt_pid", "draft_year", "tier"]],
        on=["bt_pid", "draft_year"], how="left")
    return pd.concat([drafted, und], ignore_index=True)


def prep_X(df, med=None):
    X = df[FEATURES].to_numpy(float)
    if med is None:
        med = np.nanmedian(X, axis=0)
    return np.where(np.isnan(X), med, X), med


def fit_final(train):
    X, med = prep_X(train)
    y = train.tier.map(lambda t: TIERS5.index("STAR" if t in ("ALL_STAR", "ELITE") else t)).to_numpy()
    sc = StandardScaler().fit(X)
    model = mord.LogisticAT(alpha=4.0).fit(sc.transform(X), y)

    # LOCO OOF for isotonic calibrators
    oof = np.full((len(train), 5), np.nan)
    for held in CLASSES:
        tr = (train.draft_year != held).to_numpy()
        sc_f = StandardScaler().fit(X[tr])
        m = mord.LogisticAT(alpha=4.0).fit(sc_f.transform(X[tr]), y[tr])
        oof[~tr] = m.predict_proba(sc_f.transform(X[~tr]))
    cals = [IsotonicRegression(out_of_bounds="clip", y_min=1e-4, y_max=1)
            .fit(oof[:, k], (y == k).astype(float)) for k in range(5)]

    boots = []
    rng = np.random.default_rng(7)
    for _ in range(N_BOOT):
        cls = rng.choice(CLASSES, size=len(CLASSES), replace=True)
        idx = np.concatenate([np.flatnonzero((train.draft_year == c).to_numpy()) for c in cls])
        sc_b = StandardScaler().fit(X[idx])
        boots.append((sc_b, mord.LogisticAT(alpha=4.0).fit(sc_b.transform(X[idx]), y[idx])))
    return model, sc, med, cals, boots


def calibrated(p_raw, cals):
    p = np.column_stack([c.transform(p_raw[:, k]) for k, c in enumerate(cals)])
    return p / p.sum(axis=1, keepdims=True)


def star_split_ratio(prior):
    """P(ELITE | STAR) by pick, from the slot prior."""
    star = prior.ALL_STAR + prior.ELITE
    return (prior.ELITE / star.clip(lower=1e-9)).clip(0.05, 0.8)


def attribution(model, sc, X_row, top_n=8):
    """Exact latent-score contributions: coef * standardized value.
    Returns [[feature, contribution, z], ...] — z lets the API phrase what is TRUE
    about the player (value sign) separately from which way it PUSHES (contribution
    sign); they differ on negative-coefficient features like recruiting pedigree."""
    z = (X_row - sc.mean_) / sc.scale_
    contrib = model.coef_ * z
    order = np.argsort(-np.abs(contrib))
    out = []
    for i in order[:top_n]:
        if abs(contrib[i]) < 0.05:
            break
        out.append([FEATURES[i], round(float(contrib[i]), 3), round(float(z[i]), 3)])
    return out


if __name__ == "__main__":
    df = load_all()
    train = df[df.draft_year.isin(CLASSES) & df.eligible & df.tier.notna()].copy()
    model, sc, med, cals, boots = fit_final(train)
    print(f"final model fit on {len(train)} rows; {N_BOOT} bootstrap refits done")

    prior = pd.read_parquet(PROCESSED / "slot_prior.parquet").set_index("pick")
    elite_share = star_split_ratio(prior)

    # ---- 2026 board rows: all drafted (incl. out-of-coverage) + consensus-undrafted D1
    drafts26 = pd.read_parquet(PROCESSED / "draft_results.parquet").query("draft_year == 2026")
    feats26 = df[df.draft_year == 2026].copy()
    cons = pd.read_parquet(PROCESSED / "consensus_2026.parquet")
    cons_rank = dict(zip(cons.player_name.map(norm), cons["rank"]))

    board = drafts26[["pick", "player_name", "bref_id", "college", "team"]].copy()
    board["nname"] = board.player_name.map(norm)
    und26 = feats26[feats26.undrafted][["player_name", "bt_pid"]].copy()
    und26["nname"] = und26.player_name.map(norm)
    board = pd.concat([board, und26.assign(pick=np.nan)], ignore_index=True)
    board["consensus_rank"] = board.nname.map(cons_rank)

    feats26["nname"] = feats26.player_name.map(norm)
    fmap = feats26.drop_duplicates("nname").set_index("nname")
    board = board.join(fmap[["bt_pid", "eligible", "pos", "team", "sample_blend"] + FEATURES]
                       .rename(columns={"team": "college_team"}), on="nname", rsuffix="_f")

    scored = board[board.eligible == True].copy()  # noqa: E712
    X26, _ = prep_X(scored, med)
    p_raw = model.predict_proba(sc.transform(X26))
    p_cal = calibrated(p_raw, cals)

    boot_p = np.stack([calibrated(m.predict_proba(s.transform(X26)), cals) for s, m in boots])
    lo, hi = np.percentile(boot_p, 2.5, axis=0), np.percentile(boot_p, 97.5, axis=0)

    # split STAR into AS/ELITE by slot-conditioned share (undrafted -> pick 0 row)
    pseudo = scored.pick.fillna(0).clip(upper=60).astype(int)
    r = elite_share.loc[pseudo].to_numpy()
    p6 = np.column_stack([p_cal[:, :4], p_cal[:, 4] * (1 - r), p_cal[:, 4] * r])

    util6 = np.array([UTILITY[t] for t in TIERS])
    scored["ev_model"] = p6 @ util6
    for i, t in enumerate(TIERS):
        scored[f"p_{t}"] = p6[:, i]
    scored["p_STAR"], scored["p_STAR_lo"], scored["p_STAR_hi"] = p_cal[:, 4], lo[:, 4], hi[:, 4]

    # markets: actual slot + consensus rank as pseudo-pick (rank>60 -> undrafted row)
    slot_p = prior.loc[scored.pick.fillna(0).clip(upper=60).astype(int), TIERS].to_numpy()
    crank = scored.consensus_rank.where(scored.consensus_rank <= 60, 0).fillna(0).astype(int)
    cons_p = prior.loc[crank, TIERS].to_numpy()
    scored["ev_slot"] = slot_p @ util6
    scored["ev_consensus"] = np.where(scored.consensus_rank.notna(), cons_p @ util6, np.nan)
    scored["edge_slot"] = scored.ev_model - scored.ev_slot
    scored["edge_consensus"] = scored.ev_model - scored.ev_consensus
    scored["star_tail_model"] = p6[:, 4] + p6[:, 5]
    scored["star_tail_slot"] = slot_p[:, 4] + slot_p[:, 5]
    scored["star_flag"] = (scored.star_tail_model - scored.star_tail_slot).abs() > 0.05

    import json as _json
    scored["why"] = [_json.dumps(attribution(model, sc, X26[i])) for i in range(len(scored))]

    # comps: k=5 nearest historical players — position-gated, outcome-weighted
    # (display only: weights = |ordinal coefficients|, so similarity lives in
    # career-relevant space; same broad position group required)
    Xh, _ = prep_X(train, med)
    Zh, Z26 = sc.transform(Xh), sc.transform(X26)
    w = np.sqrt(np.abs(model.coef_))
    tinfo = train.reset_index(drop=True)
    comps = []
    for i in range(len(Z26)):
        same_pos = (tinfo.pos == scored.pos.iloc[i]).to_numpy()
        d = np.linalg.norm((Zh - Z26[i]) * w, axis=1)
        d[~same_pos] = np.inf
        # players who entered the draft pool twice have two season-rows; a comp
        # list must be five DIFFERENT players, not the same guy's two seasons
        near, seen = [], set()
        for j in np.argsort(d):
            if not np.isfinite(d[j]):
                break
            name = str(tinfo.player_name[j]).lower()
            if name in seen:
                continue
            seen.add(name)
            near.append(j)
            if len(near) == 5:
                break
        comps.append(" | ".join(f"{tinfo.player_name[j]} ({tinfo.tier[j]})" for j in near))
    scored["comps"] = comps

    out = pd.concat([scored, board[board.eligible != True]], ignore_index=True)  # noqa: E712
    out["coverage"] = np.where(out.ev_model.notna(), "model",
                               np.where(out.bt_pid.notna(), "insufficient_sample",
                                        "outside_coverage"))
    out = out.drop(columns=["nname"]).sort_values(
        "ev_model", ascending=False, na_position="last")
    out.to_parquet(PROCESSED / "board_2026.parquet")

    ARTIFACTS.mkdir(exist_ok=True)
    joblib.dump({"model": model, "scaler": sc, "median": med, "calibrators": cals,
                 "features": FEATURES, "boots": boots}, ARTIFACTS / "final_model.joblib")

    # historical value grades for the report/app
    hist = pd.read_parquet(PROCESSED / "labels.parquet")
    hist = hist[~hist.undrafted & hist.pick.notna()].copy()
    hist["slot_ev"] = prior.loc[hist.pick.clip(upper=60).astype(int), TIERS].to_numpy() @ util6
    hist["realized"] = hist.tier.map(UTILITY)
    hist["shortfall"] = hist.realized - hist.slot_ev
    hist["value_grade"] = hist.shortfall.map(value_grade)
    hist.to_parquet(PROCESSED / "historical_outcomes.parquet")

    print(f"\nboard: {len(out)} rows | coverage: {out.coverage.value_counts().to_dict()}")
    cols = ["pick", "player_name", "ev_model", "ev_slot", "edge_slot", "p_STAR", "why"]
    print("\n=== top-10 by model EV ===")
    print(out.head(10)[cols[:-1]].round(2).to_string(index=False))
    print("\n=== biggest UNDERDRAFTED (model >> slot) ===")
    print(out.nlargest(8, "edge_slot")[cols[:-1]].round(2).to_string(index=False))
    print("\n=== biggest OVERDRAFTED (slot >> model) ===")
    print(out.nsmallest(8, "edge_slot")[cols[:-1]].round(2).to_string(index=False))
