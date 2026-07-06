# The Second Round — 2026 draft, priced fairly

**To:** Front office
**From:** Sahil Parikh
**Re:** What the 2026 draft market missed, and how much to trust the model that says so
**Date:** July 2026 (information cutoff: draft night, June 23)

---

## The one-paragraph version

We built a fair-value model that prices every college prospect using only pre-draft
information — no draft slots, no mock drafts, no consensus boards — and compared its prices
to where players actually went. Out of sample, across the 2009–2021 classes, **the market
beats the model on average**. That is the honest headline, and it should raise, not lower,
your confidence in what follows: **at the extremes of disagreement, the model is
significantly right.** Its loudest 40 historical favorites returned +5.3 utility points
above their draft-slot price (permutation p < 0.0002); its loudest 40 fades returned −2.1
below (p < 0.0002). The recommendation is not "re-rank the board." It is: **when this model
disagrees loudly with the room, schedule the extra film session.**

## The 2026 calls

**The model wanted more.** Cam Boozer (pick 3) is the loudest call in the class: 93% [81–99%]
probability of at least All-Star-level production in his first four seasons, driven by
historic offensive production at age 18.9. His statistical family — Zion, Blake Griffin,
Harden — is precisely the "production says star, tools say prove-it" cohort that beat this
same skepticism before. Caleb Wilson (pick 4, 62% star), Christian Anderson Jr. (pick 18,
+8.3 edge), and Allen Graves (pick 19, +8.3) follow — the latter two sitting exactly in the
model's proven sweet spot (see "where the market is soft" below).

**The model would have passed.** Mikel Brown Jr. (pick 6) is the loudest fade: 8% [3–25%]
star probability — a lead guard whose assist profile doesn't match the job description, from
the statistical family of Fultz, Dennis Smith Jr., and Sexton. The late-first fades
(Stirtz 16, Karaban 29, Thornton 31) share one signature: fine production, posted by
22-year-olds against teenagers. Age-adjustment is the most reliable finding in draft
analytics, and the market pays a known-quantity premium against it every June.

## Where the market is soft

Decomposing model-vs-market accuracy by pick region, out of sample:

| Region | Who wins | Gap (log loss) |
|---|---|---|
| Lottery (1–14) | Market, decisively | +0.17 |
| Picks 15–30 | Market | +0.09 |
| **Picks 31–45** | **Model** | **−0.07** |
| Picks 46–60 | Market, slightly | +0.06 |
| Undrafted | Market | +0.12 |

The market's edge is largest exactly where its private information is deepest (lottery:
medicals, workouts, agent intel on one-and-done freshmen). It is **negative in the early
second round** — the region where teams spend the least diligence per pick, and where Bane
(30), Kyle Anderson (30), and Brunson (33) actually came from. When this model pounds the
table between picks 18 and 45, history says listen.

## What "bust" means here, precisely

Every historical outcome carries two independent judgments: an absolute **tier** (what the
player became: Out of League / Fringe / Rotation / Starter / All-Star-level / Elite, defined
by production bands over the first four seasons, voter accolades excluded), and a
market-relative **value grade** (realized utility minus what the slot promised). Anthony
Bennett (Fringe at #1, −11.6) grades Bust. Andrew Wiggins (Starter at #1, −4.6) grades
Underdelivered — a disappointment, never a bust; he returned two-thirds of slot value.
Jalen Brunson (Rotation at #33, −0.1) **Delivered**: the rookie-window promise of pick 33
was met almost exactly, and his later All-NBA leap is a retention story, not a drafting one
(it carries the late-bloom annotation instead).

## The scout layer: evidence, not veto

Free-text scouting notes are extracted (by a language model, against a fixed 12-trait
rubric with per-trait confidence) and Bayesian-update the statistical prior. Two design
guarantees: subjective traits (motor, feel) carry the smallest weights, and the total
update is capped — no single note, however glowing, can move the extreme tiers more than
~2.2×. In practice: a rave note on a weak statistical profile moves it modestly (Stirtz:
+0.47 tilt, star probability 3% → 5%); the same machinery on an injury-context note
partially rehabilitates a fade (Brown: 8% → 11%). The model supplies the base rates; the
scout supplies what cameras and box scores can't see; the math keeps both honest.

## What we'd do with pick N

The availability simulator (10,000 draft simulations, noise calibrated on how far 2026
players actually slid from consensus, fat-tailed to price real medical/intel falls) turns
the board into a war room: standing at pick 9, Boozer is gone in >99.9% of worlds, Ament is
there in 43%, Anderson in 99%. Combined with the edge table, the operating procedure is:
identify the highest-EV names with meaningful availability, and pre-schedule the
disagreement reviews before draft week, not during it.

## Limitations, stated plainly

NCAA D1 only — internationals and alternative pathways (~15–20% of first-rounders) are
outside coverage and shown at market prices. Box-score ceiling — no tracking, on/off, or
medical data (all paywalled); this is most of why the lottery gap exists. Star tiers rest
on 45 training examples; that is why every probability ships with a bootstrap interval.
Scout-note weights are designer priors, fittable once real notes accumulate. The
availability sim knows nothing of team needs. The 4-season window ends where the rookie
contract does — late bloomers are annotated, not relabeled.

---

# Technical appendix

**Event definition.** Six ordinal tiers over a player's first four NBA seasons.
Quality tiers by production bands: ELITE = best 2-consecutive-played-seasons MP-weighted
BPM ≥ +3.5 (min 2,500 MP) or 4-yr VORP ≥ p98 of drafted players; ALL_STAR level = peak-2
BPM ≥ +2.2 (ESPN's published band). Role tiers by minutes (Starter = 5,000+ MP at 26+ mpg;
Rotation = 2,000+ MP; Fringe = 50+ G). Voter accolades are display annotations only.

**Data.** Barttorvik (college player-seasons 2008–2026, 86k rows), Basketball-Reference
(drafts, league-wide advanced seasons, accolades, RSCI), nba_api (combine anthro), Rookie
Scale (2026 consensus), ESPN (headshots, PBP verification). Entity resolution: 865/867
drafted college players matched (99.8%); the two misses never played D1.

**Training universe.** Draft classes 2009–2021: drafted D1 players plus combine-invited
undrafted players (fixes survivorship bias at the bottom), 847 rows after the eligibility
floor (final-season minutes ≥ 40% of team minutes; below it, players receive the market
prior only, with an insufficient-sample badge).

**Features (56).** Age at draft, anthro (with position-conditioned wingspan imputation and
informative-missingness indicators), recruiting percentile, per-100 production with
empirical-Bayes shrinkage — every rate padded toward its position-group mean with
pseudo-attempts sized to that stat's stabilization speed (heavy for 3P%, light for
FT%/stocks) — volumes, trajectory deltas, rim/dunk shares, position interactions. Market
information (slots, boards) is excluded by construction: fair value must be computed blind
to the price it is judged against.

**Model.** Ordinal logistic (LogisticAT, α=4, 5-tier merged-STAR target) beat LightGBM and
6-tier variants under leave-one-draft-class-out CV (n=847 is logistic-regression country).
Isotonic calibration per class on out-of-fold predictions. P(STAR) is split to
All-Star/Elite at display by the slot-conditioned historical share. Uncertainty: 100
cluster-bootstrap refits (resampling classes) give per-tier intervals.

**Market prior.** Historical tier rates by pick, Laplace-kernel-pooled across neighboring
picks, Dirichlet-smoothed toward the drafted marginal, isotone-constrained across picks
(top tiers non-increasing). Refit leave-one-class-out wherever it serves as the baseline —
the market must not see the held-out class either.

**Validation.** OOF log loss (5-tier space): market prior 1.129, model 1.266 (1.220
calibrated), marginal 1.419 — the gate "beat the market on average" fails, structurally
(unchanged by adding classes; learning-curve slope ~0.008/class). Blend test: 25% model +
75% market improves the market to 1.124 — the model carries genuinely incremental signal.
Edge realized (OOF, calibrated): top-40 favorites +5.33 utility above market price
(permutation p < 0.0002), top-40 fades −2.07 (p < 0.0002). Calibration curves: tight for
the four large tiers, honest-but-wide for STAR (n=45).

**Attribution and comps.** Exact per-player contributions (coefficient × standardized
value), phrased by value sign with push direction shown separately — an unranked recruit
reads "Unheralded recruit" with a positive push, because the model learned that profile
overdelivers. Comps: k=5 nearest neighbors, position-gated, distance weighted by
coefficient magnitude (career-relevant similarity), display-only.

**Scout notes.** 12-trait rubric, scores −2..+2 scaled by extraction confidence; per-trait
log-tilt strengths 0.08–0.15 (subjective lowest); tier-gradient likelihood ratios; total
log-tilt capped at 0.8. Extraction: Claude Haiku with forced structured output, coerced and
schema-validated, keyword fallback keyless. Persistent books combine latest-per-trait under
the same cap.

**Availability simulation.** Draft order as a noisy rank race: board value = consensus rank
+ Student-t(4) noise, σ(rank) = 0.5 + 0.1·rank, calibrated to 2026 consensus-vs-actual
slide dispersion (simulated 3.9 vs actual 4.8 mean |slide|); fat tails price real 10–20
pick falls (min probability assigned to any actual 2026 outcome: 0.2%). 10,000 simulations;
no team-need modeling.

**Reproducibility.** Every number in this memo regenerates from the public repo:
`pipeline/` (scrape → crosswalk → labels → features), `model/` (prior → train → score →
simulate), one command each, all sources free, raw scrapes cached and never redistributed.

---

*Built by Sahil Parikh — [YOUR_LINK_HERE]. Code: github.com/YOUR_GITHUB/the-second-round.*
