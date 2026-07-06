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

## D8. Undrafted training pool: combine invitees, not historical consensus boards

**Plan said:** consensus-top-75-but-undrafted players join training to fix survivorship bias.
**Implemented:** combine-invitees-who-went-undrafted instead.

**Why the swap:** historical pre-draft consensus boards (2011–2021) aren't reliably archived on
free sources — reconstructing them means Wayback Machine archaeology per year. The NBA combine
invite list is the league's own revealed top-~70 market signal, already in our nba_api pull,
identical in spirit ("market said maybe, then said no on draft night"), and exactly reproducible.

## D9. NBA outcomes from league-wide Advanced pages, not per-player pages

One B-Ref page per season (~15 pages) carries G/MP/WS/BPM/VORP for every player-season —
versus ~550 individual player pages. Same numbers, 97% fewer requests, kinder to the source.

## D10. PBP athleticism bundle came free

Barttorvik player rows already include rim/mid makes+attempts, dunk makes+attempts, and a
recruiting percentile score (verified: Flagg 100.0/pick 1, Ace Bailey 99.8, unranked NaN).
The planned ESPN play-by-play ETL for rim/dunk rates is unnecessary; transition share is the
only PBP-only feature left, and it's cut unless the model needs it.

## D12. Top tiers are production bands; voter accolades are annotations, never labels ⭐

**Choice:** ELITE = best 2-consecutive-played-seasons MP-weighted BPM >= +3.5 (min 2500 MP in
the stretch) or 4-yr VORP >= p98; ALL_STAR = peak-2 BPM >= +2.2 (ESPN's published
All-Star-level band). All-Star/All-NBA selections are shown as annotations only.

**Why:** The first hybrid rule (any All-NBA selection = Elite) put Andre Drummond (peak BPM
1.8, 3rd-team politics) a tier above Donovan Mitchell (9.5 VORP). Research consensus (ESPN's
model: SPM bands, years 2-5; PRISM: production-only eWINS, later-years weighted) keeps voter
awards out of labels entirely. The peak-2-season stretch is the PRISM trajectory insight:
it catches SGA, Bam, Zion, Embiid, and Mobley INSIDE the window — players every accolade rule
missed — while evicting the 3rd-team-politics cohort (Drummond, Cade, Klay, Siakam).

**Costs, stated plainly:** Anthony Edwards' peak-2 BPM is 2.1 — 0.1 below the published band —
so he labels STARTER with late_bloom=ELITE and All-NBA annotations. We do not bend thresholds
for single players; patches erode the mechanical integrity that makes labels defensible.
Clutch usage was researched as an alternative elite signal and rejected: clutch scoring bumps
come from taking more shots (role), not making them (skill), and clutch samples (~100
possessions/yr) are noise. Late bloomers (Brunson) are handled by the late_bloom annotation
(band reached in seasons 5-7), never by stretching the modeled window — that would cost the
2019-2021 training classes and credit drafting teams for other teams' development.

## D11. G League Ignite / OTE / international prospects: in the market, out of the model

Three different roles, handled separately. (1) **Model scoring:** excluded in v1 — no free
pace/SOS-adjusted stat source comparable to Barttorvik, and only ~10 Ignite players were ever
drafted, so there is no sample to calibrate how that production translates; scoring them would
be confident guessing. (2) **Slot base rates:** included — the market prior is about what a
draft slot historically yields regardless of pipeline, so Dyson Daniels' outcome still informs
"what pick 8 is worth." (3) **Board display:** shown with slot-implied distribution and an
explicit "outside model coverage" badge, same as zero-data cases like Shaedon Sharpe.
v2 roadmap: internationals + alternative pathways once a defensible translation layer exists.

---

*Log continues as phases complete.*
