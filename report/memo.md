# The Second Round: the 2026 draft, priced fairly

**To:** Front office
**From:** Sahil Parikh
**Re:** What the 2026 draft market missed, and how much to trust the model that says so
**Date:** July 2026 (information cutoff: draft night, June 23)

---

## The one-paragraph version

We built a fair-value model that prices every college prospect using only pre-draft
information. It never sees draft slots, mock drafts, or consensus boards. We then compared
its prices to where players actually went. Out of sample, across the 2009 to 2021 classes,
**the market beats the model on average**. That is the honest headline, and it should
raise, not lower, your confidence in what follows: **at the extremes of disagreement, the
model is significantly right.** Its loudest 40 historical favorites returned +5.3 value
points above their draft-slot price (permutation p < 0.0002). Its loudest 40 fades
returned 2.1 points below (p < 0.0002). The recommendation is not to re-rank the board. It
is this: when the model disagrees loudly with the room, schedule the extra film session.

## The 2026 calls

**The model wanted more.** Cam Boozer (pick 3) is the loudest call in the class: a 93%
chance (range 81 to 99%) of at least All-Star-level production in his first four seasons,
driven by historic offensive production at age 18.9. His statistical family (Zion, Blake
Griffin, Harden) is precisely the cohort where production said star, tools said prove it,
and production won. Caleb Wilson (pick 4, 62% star), Christian Anderson Jr. (pick 18, +8.3
edge), and Allen Graves (pick 19, +8.3) follow. The latter two sit exactly in the model's
proven sweet spot, covered below.

**The model would have passed.** Mikel Brown Jr. (pick 6) is the loudest fade: an 8% star
chance (range 3 to 25%). He is a lead guard whose assist profile does not match the job
description, from the statistical family of Fultz, Dennis Smith Jr., and Sexton. The
late-first fades (Stirtz 16, Karaban 29, Thornton 31) share one signature: fine
production, posted by 22-year-olds against teenagers. Age adjustment is the most reliable
finding in draft analytics, and the market pays a known-quantity premium against it every
June.

## Where the market is soft

Decomposing model-versus-market accuracy by pick region, out of sample:

| Region | Who wins | Gap (log loss) |
|---|---|---|
| Lottery (1-14) | Market, decisively | +0.17 |
| Picks 15-30 | Market | +0.09 |
| **Picks 31-45** | **Model** | **-0.07** |
| Picks 46-60 | Market, slightly | +0.06 |
| Undrafted | Market | +0.12 |

The market's edge is largest exactly where its private information is deepest: the
lottery, with its medicals, workouts, and agent intel on one-and-done freshmen. It is
negative in the early second round, the region where teams spend the least diligence per
pick, and where Bane (30), Kyle Anderson (30), and Brunson (33) actually came from. When
this model pounds the table between picks 18 and 45, history says listen.

## What "bust" means here, precisely

Every historical outcome carries two independent judgments. The first is an absolute
**tier**: what the player became (Out of League, Fringe, Rotation, Starter, All-Star
level, or Elite), defined by production bands over the first four seasons, with voter
accolades excluded. The second is a market-relative **value grade**: realized value
minus what the slot promised. Anthony Bennett (Fringe at #1, shortfall 11.6) grades Bust.
Andrew Wiggins (Starter at #1, shortfall 4.6) grades Underdelivered, which is a
disappointment but never a bust; he returned two-thirds of slot value. Jalen Brunson
(Rotation at #33, shortfall 0.1) graded **Delivered**: the rookie-window promise of pick
33 was met almost exactly. His later All-NBA leap is a retention story, not a drafting
one, and it carries the late-bloom annotation instead.

## The scout layer: evidence, not veto

Free-text scouting notes are read by a language model against a fixed 12-trait rubric,
each trait scored with a confidence, and the result updates the statistical prior through
Bayes' rule. Two design guarantees hold. Subjective traits (motor, feel) carry the
smallest weights, and the total update is capped, so no single note, however glowing, can
move the extreme tiers more than about 2.2 times. In practice a rave note on a weak
statistical profile moves it modestly (Stirtz: star chance 3% to 5%), while the same
machinery applied to injury context partially rehabilitates a fade (Brown: 8% to 11%). The
model supplies the base rates. The scout supplies what cameras and box scores cannot see.
The math keeps both honest.

## What we would do with pick N

The availability simulator runs the draft 10,000 times, with noise calibrated on how far
2026 players actually slid from consensus and fat tails to price real medical falls. It
turns the board into a war room. Standing at pick 9, Boozer is gone in more than 99.9% of
worlds, Ament is there in 43%, and Anderson is there in 99%. The operating procedure:
identify the highest-EV names with meaningful availability, and pre-schedule the
disagreement reviews before draft week, not during it.

## Limitations, stated plainly

Coverage is NCAA Division 1 only; internationals and alternative pathways (roughly 15 to
20% of first-rounders) are outside it and shown at market prices. The model has a
box-score ceiling: no tracking, on/off, or medical data, all of which are paywalled, and
this is most of why the lottery gap exists. Star tiers rest on 45 training examples, which
is why every probability ships with a bootstrap interval. Scout-note weights are designer
priors, fittable once real notes accumulate. The availability simulation knows nothing of
team needs. The four-season window ends where the rookie contract does; late bloomers are
annotated, not relabeled.

---

# Technical appendix

**Event definition.** Six ordinal tiers over a player's first four NBA seasons. Quality
tiers use production bands: ELITE means the best two consecutive played seasons reach an
MP-weighted BPM of +3.5 or better (minimum 2,500 minutes in the stretch), or four-year
VORP at or above the 98th percentile of drafted players. ALL_STAR level means peak-two BPM
of +2.2 or better (ESPN's published band). Role tiers use minutes: Starter is 5,000+
minutes at 26+ per game, Rotation is 2,000+ minutes, Fringe is 50+ games. Voter accolades
are display annotations only.

**Data.** Barttorvik (college player-seasons 2008 to 2026, 86k rows), Basketball-Reference
(drafts, league-wide advanced seasons, accolades, RSCI), nba_api (combine anthro), Rookie
Scale (2026 consensus), ESPN (headshots and play-by-play verification). Entity resolution
matched 865 of 867 drafted college players (99.8%); the two misses never played D1.

**Training universe.** Draft classes 2009 to 2021: drafted D1 players plus combine-invited
undrafted players (fixing survivorship bias at the bottom), 847 rows after the eligibility
floor. That floor requires final-season minutes of at least 40% of team minutes; below it,
players receive the market prior only, with an insufficient-sample badge.

**Features (56).** Age at draft, anthropometrics (with position-conditioned wingspan
imputation and informative-missingness indicators), recruiting percentile, per-100
production with empirical-Bayes shrinkage (every rate padded toward its position-group
mean with pseudo-attempts sized to that stat's stabilization speed, heavy for 3P%, light
for FT% and stocks), volumes, trajectory deltas, rim and dunk shares, and position
interactions. Market information (slots, boards) is excluded by construction: fair value
must be computed blind to the price it is judged against.

**Model.** Ordinal logistic regression (LogisticAT, alpha 4, five-tier merged-STAR target)
beat LightGBM and six-tier variants under leave-one-draft-class-out cross-validation; with
n = 847 this is logistic-regression country. Isotonic calibration is fit per class on
out-of-fold predictions. P(STAR) is split into All-Star and Elite at display time by the
slot-conditioned historical share. Uncertainty comes from 100 cluster-bootstrap refits
(resampling classes), giving per-tier intervals.

**Market prior.** Historical tier rates by pick, pooled across neighboring picks with a
Laplace kernel, Dirichlet-smoothed toward the drafted marginal, and isotone-constrained
across picks (top tiers non-increasing). Wherever it serves as the baseline it is refit
leave-one-class-out, because the market must not see the held-out class either.

**Validation.** Out-of-fold log loss in the five-tier space: market prior 1.129, model
1.266 (1.220 calibrated), marginal 1.419. The gate "beat the market on average" fails, and
fails structurally: the verdict is unchanged by adding classes, and the learning curve
slope is about 0.008 per class. The blend test shows the model still carries real signal:
25% model plus 75% market improves the market to 1.124. Edge realized (out of fold,
calibrated): the top 40 favorites returned +5.33 value above market price (permutation
p < 0.0002), the top 40 fades 2.07 below (p < 0.0002). Calibration curves are tight for
the four large tiers and honest but wide for STAR (n = 45).

**Labeling robustness.** The tier definition is a choice, so we tested it. Four full
relabelings of the same 847 careers (current peak-two bands; four-year average bands with
count-matched cutoffs; usage-gated stars requiring at least league-average creation
burden; accolade-defined stars), each with the market prior and model refit
leave-one-class-out under that definition. Every variant reaches the same verdicts: the
market wins on average, and picks 31 to 45 stay its inefficient region. The edge at the
extremes survives all production-based definitions (+4.0 to +5.4 value, p < 0.001) but
collapses under accolade labels (+1.5, p = 0.08). That collapse is the point: the model
finds players who produce value the market missed, not future vote-getters, and
selections follow the narrative information the model is built to ignore. The variants
also show what gating stars on usage costs: it demotes prime Draymond Green to a rotation
label, and accolade labels rank Andre Drummond above Mikal Bridges. Full table:
report/robustness.md.

**Attribution and comps.** Per-player contributions are exact (coefficient times
standardized value), phrased by value sign with push direction shown separately. An
unranked recruit reads "Unheralded recruit" with a positive push, because the model
learned that profile overdelivers. Comps are the five nearest neighbors, position-gated,
with distance weighted by coefficient magnitude (career-relevant similarity), and are
display-only. Each comp carries three annotations that keep value and role honestly
separate: a star for a real All-Star selection inside the window, a role archetype from
peak-stretch usage (Engine at 24%+, Co-star at 20%+, Connector below, shown for
starter-or-better outcomes), and a late-bloom flag for careers that kept climbing after
the window (Jalen Brunson reads Rotation, later Elite).

**Scout notes.** A 12-trait rubric with scores from -2 to +2, scaled by extraction
confidence. Per-trait log-tilt strengths run 0.08 to 0.15 (subjective traits lowest),
likelihood ratios follow a tier gradient, and total log tilt is capped at 0.8. Extraction
uses Claude Haiku with forced structured output, coerced and schema-validated, with a
keyword fallback when no key is present. Persistent books combine latest-per-trait under
the same cap.

**Availability simulation.** The draft is modeled as a noisy rank race: board value equals
consensus rank plus Student-t(4) noise with sigma(rank) = 0.5 + 0.1 times rank, calibrated
to the 2026 consensus-versus-actual slide dispersion (simulated 3.9 versus actual 4.8 mean
absolute slide). Fat tails price real falls of 10 to 20 picks; the minimum probability the
simulation assigns to any actual 2026 outcome is 0.2%. Ten thousand simulations, no
team-need modeling.

**Summer League as evidence.** After the draft, July box scores update the board the
same way scout notes do: as bounded evidence on top of the frozen draft-day call, never
a re-run of the model. How much weight a summer can carry was measured, not guessed.
Across 585 drafted rookies from the 2010 to 2021 Summer Leagues, adding a
minutes-weighted production signal to the draft-slot baseline improved held-out
prediction of career outcomes (leave-one-year-out log-likelihood -676.1 versus -685.9),
and rookies in the top tenth of summer production went on to clearly better careers
than the bottom tenth. The response saturates rather than stopping at a hard cap: each
extra hot game adds less than the one before, with the saturation level itself fitted
from history, which says the effect flattens right around the weight of one maxed-out
scout note. Even the very best summers earn humility: among the top 5 percent of
summer performances since 2010, one in five players still ended up a fringe NBA player
or worse. Small samples shrink toward no effect, and skipping Summer League counts as
no evidence at all. The numbers on the board are the updated view, dated; the draft-day
call stays on the record in the repository, and this memo's results are all draft-day
results.

**Reproducibility.** Every number in this memo regenerates from the public repository:
pipeline (scrape, crosswalk, labels, features) and model (prior, train, score, simulate),
one command each, all sources free, raw scrapes cached and never redistributed.

---

*Built by Sahil Parikh (linkedin.com/in/sahilparikh719). Code: github.com/parikhsahil719/the-second-round.*
