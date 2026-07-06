# DECISIONS.md — the modeling rationale, in interview-ready language

Every non-obvious choice in this project, why it was made, and what the alternative was.
⭐ = concepts worth being able to whiteboard cold.

## D1. The tradeable event: six ordinal tiers over first 4 NBA seasons ⭐

**Choice:** Out of League / Fringe / Rotation / Starter / All-Star / Elite, measured over a
player's rookie-scale window (first 4 seasons).

**Why:** A quant defines the event before touching data. Tiers (a) produce a full probability
distribution per player instead of one score, (b) match how front offices actually talk, and
(c) make calibration testable ("of players we gave 12% All-Star odds, ~12% should make one").
The 4-season window is the rookie contract — the exact horizon a drafting team is buying.

**Alternative rejected:** predicting a continuous metric (peak BPM/EPM). A regression wants to
collapse to a point estimate; you'd need quantile machinery to recover the distribution that
tiers give you for free.

## D2. Market independence: the model never sees draft slot or consensus boards ⭐

**Choice:** Zero draft-market information in the feature set.

**Why:** Published work shows adding draft position improves raw accuracy — but then your
"edge vs the market" is contaminated: you trained on the thing you're grading. Fair value
must be computed blind, then compared to the market. RSCI recruiting rank stays IN because it
is fixed years before the draft market forms and carries tools/athleticism signal the box
score misses (research: significant alone, mostly subsumed by college production, residual
value concentrated in top-20 ranks and freshmen).

## D3. Signal selection is research-backed, and the exclusions are deliberate

FT% over college 3P% as the shooting projector (3P% is small-sample noise at college volumes;
FT% + 3PA rate carry the signal). STL% predicts sticking in the league; BLK% predicts high-end
outcomes. Age at draft is the strongest single conditioner. Excluded on purpose: March/tournament
narratives, game-to-game consistency metrics, team W-L, raw unadjusted counting stats.

## D4. Reliability: empirical-Bayes shrinkage with stat-specific padding ⭐

**Choice:** Every rate stat is padded toward its position-group mean with pseudo-attempts
sized to that stat's stabilization speed (heavy for 3P%, light for FT%/STL%/BLK%); padding
influence decays as the real sample grows. Raw volumes ride along as features.

**Why:** A freshman's 38% on 70 threes is not a senior's 38% on 500. This is the same
padding-that-decays approach used inside NBA analytics departments. Below ~40% of team
minutes in the final season, a player gets the slot prior only and an "insufficient sample"
badge — the model refuses to fake confidence.

## D5. Model: ordinal logistic baseline vs LightGBM challenger, CV decides ⭐

Leave-one-draft-class-out CV (train on 10 classes, predict the held-out class, rotate) is the
honest design — random K-fold would leak same-class context. Isotonic calibration on
out-of-fold predictions. ~100 bootstrap refits give intervals on the tier probabilities
("All-Star: 12% [7–18%]") — with ~15 Elite examples in the training data, point probabilities
would overstate precision.

## D6. Edge metric: EV gap + star-tail callout

Tier utilities are surplus-value shaped (convex: stars are worth far more than a linear step).
EV gap gives one sortable number; the separate P(All-Star+) column preserves the
boom-bust vs safe-floor distinction that EV erases. Computed against BOTH markets — consensus
boards (what scouts said) and actual slot (what teams paid).

## D7. Scout notes are evidence, not vibes

12-trait rubric, each trait −2..+2 vs slot expectation. Each score maps to a capped likelihood
ratio over tiers; Bayesian update produces the posterior shown beside the stats prior.
The LRs are hand-calibrated designer priors — documented as such, fittable once real notes
accumulate. Subjective traits (motor, IQ) get the smallest caps. Low-confidence extractions
attenuate toward LR=1 (no update): same shrinkage philosophy as D4.

---

*Log continues as phases complete.*
