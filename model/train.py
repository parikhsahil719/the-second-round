"""Phase 3 core: leave-one-draft-class-out shootout vs the market prior.

Candidates: ordinal logistic (mord.LogisticAT, two ridge strengths) and LightGBM
multiclass, each on 6-tier and 5-tier (ALL_STAR+ELITE merged into STAR) targets.
All comparisons are scored on the collapsed 5-tier space so variants are
apples-to-apples; the winner must beat the slot-implied market prior out of sample
(the validation gate) before anything downstream gets built on it.

No class reweighting anywhere — probabilities must stay calibrated to true base rates.
Isotonic calibration is fit per class on pooled out-of-fold predictions (slightly
optimistic; documented). Run: python model/train.py
"""

import json
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore", message="X does not have valid feature names")

import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import log_loss
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "model"))
from common import TIERS, TIERS5, UTILITY, FEATURES  # noqa: E402

PROCESSED = ROOT / "data" / "processed"
FIGS = ROOT / "report" / "figs"
CLASSES = list(range(2011, 2022))


def load_training():
    f = pd.read_parquet(PROCESSED / "features.parquet")
    labels = pd.read_parquet(PROCESSED / "labels.parquet")
    drafted = f[~f.undrafted].merge(
        labels[~labels.undrafted][["bref_id", "draft_year", "tier"]],
        on=["bref_id", "draft_year"])
    und = f[f.undrafted].merge(
        labels[labels.undrafted][["bt_pid", "draft_year", "tier"]],
        on=["bt_pid", "draft_year"])
    df = pd.concat([drafted, und], ignore_index=True)
    df = df[df.draft_year.isin(CLASSES) & df.eligible].copy()
    df["y6"] = df.tier.map({t: i for i, t in enumerate(TIERS)})
    df["y5"] = df.tier.map(lambda t: TIERS5.index("STAR" if t in ("ALL_STAR", "ELITE")
                                                  else t))
    return df


def slot_prior_probs(df: pd.DataFrame, loco: bool = False) -> np.ndarray:
    """Market baseline; loco=True refits the prior without each row's own class
    (the market must not see the held-out class either — same rules as the model)."""
    import prior as prior_mod
    picks = df.pick.fillna(0).clip(upper=60).astype(int)
    if not loco:
        prior = pd.read_parquet(PROCESSED / "slot_prior.parquet").set_index("pick")
        return prior.loc[picks, TIERS].to_numpy()
    out = np.empty((len(df), 6))
    for held in df.draft_year.unique():
        grid = prior_mod.build(exclude_class=int(held)).set_index("pick")
        mask = (df.draft_year == held).to_numpy()
        out[mask] = grid.loc[picks[mask], TIERS].to_numpy()
    return out


def collapse6to5(p6: np.ndarray) -> np.ndarray:
    return np.hstack([p6[:, :4], p6[:, 4:5] + p6[:, 5:6]])


def make_models(n_classes):
    import mord
    from lightgbm import LGBMClassifier
    return {
        "ordinal_a1": ("scaled", mord.LogisticAT(alpha=1.0)),
        "ordinal_a4": ("scaled", mord.LogisticAT(alpha=4.0)),
        "lgbm": ("raw", LGBMClassifier(
            objective="multiclass", num_class=n_classes, n_estimators=120,
            learning_rate=0.03, num_leaves=7, min_child_samples=40,
            subsample=0.8, subsample_freq=1, colsample_bytree=0.6,
            reg_lambda=5.0, verbose=-1, random_state=7)),
    }


def loco_oof(df: pd.DataFrame, ycol: str, n_classes: int) -> dict[str, np.ndarray]:
    X_all = df[FEATURES].to_numpy(dtype=float)
    med = np.nanmedian(X_all, axis=0)
    oof = {name: np.full((len(df), n_classes), np.nan) for name in make_models(n_classes)}
    for held in CLASSES:
        tr, te = (df.draft_year != held).to_numpy(), (df.draft_year == held).to_numpy()
        Xtr, Xte = X_all[tr], X_all[te]
        Xtr, Xte = np.where(np.isnan(Xtr), med, Xtr), np.where(np.isnan(Xte), med, Xte)
        sc = StandardScaler().fit(Xtr)
        for name, (kind, proto) in make_models(n_classes).items():
            model = proto
            if kind == "scaled":
                model.fit(sc.transform(Xtr), df[ycol].to_numpy()[tr])
                oof[name][te] = model.predict_proba(sc.transform(Xte))
            else:
                model.fit(Xtr, df[ycol].to_numpy()[tr])
                oof[name][te] = model.predict_proba(Xte)
    return oof


def isotonic_calibrate(p: np.ndarray, y: np.ndarray) -> np.ndarray:
    out = np.empty_like(p)
    for k in range(p.shape[1]):
        out[:, k] = IsotonicRegression(out_of_bounds="clip", y_min=1e-4, y_max=1) \
            .fit_transform(p[:, k], (y == k).astype(float))
    return out / out.sum(axis=1, keepdims=True)


if __name__ == "__main__":
    df = load_training()
    y5, y6 = df.y5.to_numpy(), df.y6.to_numpy()
    print(f"training rows: {len(df)} ({df.undrafted.sum()} undrafted), "
          f"tiers: {df.tier.value_counts().reindex(TIERS).to_dict()}")

    market5 = collapse6to5(slot_prior_probs(df, loco=True))
    marginal5 = np.tile(np.bincount(y5, minlength=5) / len(y5), (len(df), 1))
    results = {"market_slot_prior": log_loss(y5, market5, labels=range(5)),
               "marginal": log_loss(y5, marginal5, labels=range(5))}

    oof_store = {}
    for variant, ycol, k in [("6tier", "y6", 6), ("5tier", "y5", 5)]:
        for name, p in loco_oof(df, ycol, k).items():
            p5 = collapse6to5(p) if k == 6 else p
            results[f"{name}_{variant}"] = log_loss(y5, p5, labels=range(5))
            oof_store[f"{name}_{variant}"] = p

    print("\n=== OOF log loss, collapsed 5-tier space (lower is better) ===")
    for name, ll in sorted(results.items(), key=lambda kv: kv[1]):
        print(f"  {name:26s} {ll:.4f}")

    model_results = {k: v for k, v in results.items() if k not in ("market_slot_prior", "marginal")}
    winner = min(model_results, key=model_results.get)
    gate = model_results[winner] < results["market_slot_prior"]
    print(f"\nwinner: {winner}  |  VALIDATION GATE "
          f"{'PASSED' if gate else 'FAILED'}: model {model_results[winner]:.4f} vs "
          f"market {results['market_slot_prior']:.4f}")

    # calibrate winner (pooled OOF), report and plot
    p_win = oof_store[winner]
    kwin = p_win.shape[1]
    ywin = y6 if kwin == 6 else y5
    p_cal = isotonic_calibrate(p_win, ywin)
    p_cal5 = collapse6to5(p_cal) if kwin == 6 else p_cal
    results[f"{winner}_calibrated"] = log_loss(y5, p_cal5, labels=range(5))
    print(f"calibrated:  {results[f'{winner}_calibrated']:.4f}")

    # edge realized: did OOF model favorites beat their market price?
    tiers_win = TIERS if kwin == 6 else TIERS5
    util = np.array([UTILITY[t] if t != "STAR" else
                     (UTILITY["ALL_STAR"] + UTILITY["ELITE"]) / 2 for t in tiers_win])
    util5 = np.array([UTILITY[t] if t != "STAR" else
                      (UTILITY["ALL_STAR"] + UTILITY["ELITE"]) / 2 for t in TIERS5])
    ev_model, ev_market = p_cal @ util, market5 @ util5
    realized = np.array([UTILITY[t] for t in df.tier])
    edge = ev_model - ev_market
    top = np.argsort(-edge)[:40]
    bot = np.argsort(edge)[:40]
    print(f"\n=== edge realized (OOF, calibrated) ===")
    print(f"  top-40 model favorites:  market EV {ev_market[top].mean():5.2f} -> realized {realized[top].mean():5.2f}")
    print(f"  bottom-40 model fades:   market EV {ev_market[bot].mean():5.2f} -> realized {realized[bot].mean():5.2f}")

    # persist
    FIGS.mkdir(parents=True, exist_ok=True)
    out = df[["player_name", "draft_year", "pick", "undrafted", "tier"]].copy()
    for i, t in enumerate(tiers_win):
        out[f"p_{t}"] = p_cal[:, i]
    out["ev_model"], out["ev_market"], out["edge"] = ev_model, ev_market, edge
    out.to_parquet(PROCESSED / "oof_predictions.parquet")
    (ROOT / "model" / "metrics.json").write_text(json.dumps(
        {**{k: round(v, 4) for k, v in results.items()}, "winner": winner,
         "gate_passed": bool(gate), "n_train": len(df)}, indent=2))

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(2, 3, figsize=(14, 8))
    for k, (ax, t) in enumerate(zip(axes.flat, tiers_win + [""] * (6 - kwin))):
        if not t:
            ax.axis("off")
            continue
        obs = (ywin == k).astype(float)
        bins = pd.qcut(p_cal[:, k], q=min(8, len(np.unique(p_cal[:, k]))), duplicates="drop")
        g = pd.DataFrame({"p": p_cal[:, k], "o": obs}).groupby(bins, observed=True).mean()
        ax.plot(g.p, g.o, "o-")
        lim = max(g.p.max(), g.o.max()) * 1.1
        ax.plot([0, lim], [0, lim], "k--", alpha=0.4)
        ax.set_title(f"{t} (n={int(obs.sum())})")
        ax.set_xlabel("predicted"), ax.set_ylabel("observed")
    fig.suptitle(f"OOF calibration — {winner} (isotonic)")
    fig.tight_layout()
    fig.savefig(FIGS / "calibration_oof.png", dpi=120)
    print(f"\nsaved: report/figs/calibration_oof.png, oof_predictions.parquet, model/metrics.json")
