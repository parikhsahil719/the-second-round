"""Phase 5: the scout-notes Bayesian layer — rubric, likelihood ratios, posterior.

A note becomes evidence: each rubric trait scored -2..+2 (vs. slot expectation) with a
confidence 0..1. Each trait carries a strength k (its max per-step log-likelihood tilt);
subjective traits (motor, IQ) get the smallest k. The likelihood ratio for tier j is
exp(k * score * confidence * g_j) where g is a linear tier gradient (-1 at OOL .. +1 at
ELITE) — positive evidence shifts mass upward, negative downward. The TOTAL note effect
is capped in log space so no single note can tilt the extreme tiers more than ~2.2x.

These k values are hand-calibrated designer priors, documented as such (DECISIONS.md D7),
fittable once real notes accumulate. Low-confidence extractions attenuate toward LR=1 —
the same shrinkage philosophy as the stat features.

Run: python model/notes.py  (self-test: directional assertions + cap check)
"""

import numpy as np

TIERS = ["OOL", "FRINGE", "ROTATION", "STARTER", "ALL_STAR", "ELITE"]

# trait -> k (max per-step log-tilt). Skills > physical > makeup/context.
RUBRIC = {
    "shooting": 0.15, "handle_creation": 0.15, "passing_feel": 0.15,
    "finishing": 0.15, "perimeter_defense": 0.15, "rim_protection": 0.15,
    "frame_length": 0.12, "athleticism": 0.12,
    "motor_compete": 0.08, "basketball_iq": 0.08,
    "role_translatability": 0.10, "age_relative_polish": 0.10,
}

TOTAL_CAP = 0.8  # max |sum of k*s*c| in log space -> extreme-tier tilt <= e^0.8 ~ 2.2x
GRADIENT = np.linspace(-1.0, 1.0, len(TIERS))  # OOL .. ELITE


def update(prior: np.ndarray, trait_scores: dict) -> tuple[np.ndarray, float]:
    """Bayesian update of a 6-tier prior with rubric evidence.

    trait_scores: {trait: (score -2..2, confidence 0..1)}
    Returns (posterior, applied_log_tilt).
    """
    tilt = sum(RUBRIC[t] * float(np.clip(s, -2, 2)) * float(np.clip(c, 0, 1))
               for t, (s, c) in trait_scores.items() if t in RUBRIC)
    tilt = float(np.clip(tilt, -TOTAL_CAP, TOTAL_CAP))
    posterior = np.asarray(prior, dtype=float) * np.exp(tilt * GRADIENT)
    return posterior / posterior.sum(), tilt


if __name__ == "__main__":
    prior = np.array([0.05, 0.10, 0.40, 0.30, 0.10, 0.05])

    strong_pos = {t: (2, 0.9) for t in ["shooting", "passing_feel", "basketball_iq"]}
    strong_neg = {t: (-2, 0.9) for t in ["shooting", "perimeter_defense", "motor_compete"]}
    weak_pos = {t: (2, 0.15) for t in ["shooting", "passing_feel", "basketball_iq"]}

    post_pos, tilt_pos = update(prior, strong_pos)
    post_neg, tilt_neg = update(prior, strong_neg)
    post_weak, _ = update(prior, weak_pos)
    everything = {t: (2, 1.0) for t in RUBRIC}
    post_max, tilt_max = update(prior, everything)

    star = lambda p: p[4] + p[5]  # noqa: E731
    assert star(post_pos) > star(prior) and post_pos[0] < prior[0], "positive must shift up"
    assert star(post_neg) < star(prior) and post_neg[0] > prior[0], "negative must shift down"
    assert abs(star(post_weak) - star(prior)) < abs(star(post_pos) - star(prior)), \
        "low confidence must attenuate"
    assert tilt_max == TOTAL_CAP, "cap must bind on an everything-note"
    assert all(abs(update(prior, {t: (2, 1.0)})[1]) <= 0.31 for t in RUBRIC), \
        "single trait stays modest"

    print("self-test passed")
    print(f"prior:           {np.round(prior, 3)}  P(STAR)={star(prior):.3f}")
    print(f"strong positive: {np.round(post_pos, 3)}  P(STAR)={star(post_pos):.3f} (tilt {tilt_pos:+.2f})")
    print(f"strong negative: {np.round(post_neg, 3)}  P(STAR)={star(post_neg):.3f} (tilt {tilt_neg:+.2f})")
    print(f"capped maximum:  {np.round(post_max, 3)}  P(STAR)={star(post_max):.3f} (tilt {tilt_max:+.2f})")
