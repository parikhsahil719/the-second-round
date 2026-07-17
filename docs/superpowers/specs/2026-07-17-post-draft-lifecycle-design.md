# Post-draft lifecycle: frozen snapshot, live Bayesian layer, pre-registered grading

Status: designed 2026-07-17, not yet scheduled for build. The pre-registered grading
rule (section 4) is a commitment and should be published on the site before the
2026-27 NBA season opens. Everything else is the north star for the multi-year product.

## 1. The three-layer player record

Every drafted player carries three things that never contaminate each other:

**Layer 0, the frozen draft-night snapshot.** The final pre-draft run becomes
immutable the moment the draft happens. It is the artifact that gets graded, forever.
Nothing that happens after the draft touches it.

**Layer 1, the live outlook.** A post-draft evidence layer that updates the player's
tier probabilities as real NBA minutes and production arrive, seasons 1 through 4.
This is the Summer League layer (D22) generalized, not a new model: same posterior
machinery, bigger evidence stream. See section 3.

**Layer 2, the private scout overlay.** Notes and structured inputs (flags,
conviction levels) belong to the account that wrote them. They re-sort that
account's own board and render as "your adjusted view" next to the model's number.
They never enter the shared model (D2 stays intact: the model cannot copy off the
room). After year 4 a scout's deviations from the model are themselves gradeable.

## 2. The annual cycle

- **November:** intake the new class. Universe = RSCI top-100 + statistical screens
  on the signals the model already values + names on public boards. Boards are used
  only as a roster check so nobody is missed, never as a feature. The net is
  deliberately wide (a few hundred players) so inclusion itself carries no market
  signal.
- **November to June:** weekly scheduled re-score as college games accumulate.
  Nothing is frozen yet; pre-draft probabilities are allowed to move. Scouts can
  write notes from day one.
- **Draft night:** the last run freezes into the Layer-0 snapshot. A new dropdown
  year is born.
- **July:** Summer League layer runs as it does today.
- **Each NBA season through year 4:** Layer 1 updates on a schedule (weekly is
  enough; NBA rates move slowly and the data is free via nba_api / Basketball
  Reference).
- **Summer after season 4:** the realized tier is stamped by the pre-registered rule
  and the class page becomes a finished calibration receipt.

## 3. Layer 1 is a Bayesian update of the existing model's values

The draft-day tier distribution is the prior and stays the prior for all four years.
What gets built is not a replacement model but a likelihood: how much observed NBA
evidence should tilt each tier's probability. This is exactly the D22 architecture:

    posterior ∝ prior × exp(tilt × GRADIENT)

with the tilt driven by a minutes-weighted production z-score and saturated by a
fitted cap. Three things change relative to Summer League:

1. **Evidence per season, cumulative.** Each NBA season contributes its own
   z-score with its own effective-minutes weight. Low minutes stay weak evidence
   automatically (the m_eff term), which handles the year-1 problem that low
   minutes on a deep team is an opportunity signal, not a skill signal.
2. **The cap grows with cumulative evidence.** Summer League's cap is small because
   ten July games should never swamp four years of college data. Three NBA seasons
   should swamp them. Season-indexed parameters (k_s, cap_s for s = 1..4) are
   fitted leave-one-year-out on the 2009-2021 classes' actual trajectories, the
   same way sl_params.json was fitted. History decides how fast the prior dies.
3. **Upgrade path.** If the single-axis tilt proves too coarse by year 2-3, the
   principled successor is an empirical trajectory likelihood
   P(seasons 1..s stats | eventual tier) estimated from the same 2009-2021
   trajectories. Same prior, richer likelihood. This is deferred until the tilt
   version measurably fails; it may never be needed.

The draft model itself is never retrained mid-window and never sees NBA data.
Its next retraining event is the normal one: a new labeled class entering the
training set once its 4-year window closes.

## 4. The pre-registered grading rule

The realized tier for the 2026 class and beyond is computed by the exact ladder
already used to label the training data (pipeline/labels.py), with every constant
frozen now, before a single 2026-class NBA game is played:

| Tier | Rule (first match wins, top down) |
|---|---|
| ELITE | best 2-consecutive-season MP-weighted BPM >= +3.5 with >= 2,500 MP in the stretch, OR 4-year VORP >= 10.03 |
| ALL_STAR | same peak-2 stretch BPM >= +2.2, same 2,500 MP gate |
| STARTER | >= 5,000 MP over the window at >= 26 minutes per game |
| ROTATION | >= 2,000 MP |
| FRINGE | >= 50 games |
| OOL | everyone else |

Frozen details that would otherwise drift:

- **The ELITE VORP threshold is frozen at 10.03**, the 98th percentile of 4-year
  VORP among the 780 drafted players in the 2009-2021 training classes. It is NOT
  recomputed as new classes finish; recomputing would let the grading curve move
  after the forecast was made.
- The window is NBA seasons ending draft_year+1 through draft_year+4. Voter
  accolades never enter the label (D12). Late-bloom tags (seasons 5-7) remain
  display annotations only.
- Source stats are Basketball Reference BPM / VORP / MP / G, traded players
  resolved to their combined-total row, identical to the training pipeline.

This table is published on the site before the 2026-27 season opener. The model
does not get to grade itself on a curve.

## 5. Interim display: the "on pace" tier

Years 1-3 the archive shows the Layer-1 probabilities plus a provisional tier,
clearly badged: the grading ladder applied to a pro-rated window (counting stats
scaled to 4 years linearly, peak-2 BPM taken as-is once the 2,500 MP gate is met).
The badge copy makes it unmistakable that this is tracking, not a verdict. Year 4
replaces it with the official stamp.

## 6. The class dropdown

One entry per draft class. Each class page has three states:

1. **Pre-draft (Nov-June):** the living board, weekly refresh, "last updated" stamp.
2. **In-window (years 0-4):** frozen draft-night board side by side with the live
   outlook and on-pace tags. "What we said" never moves; "where he stands" does.
3. **Graded (year 4+):** forecast vs realized tier for every player, the calibration
   receipt. 2026 is the inaugural entry and reaches this state in summer 2030.

## 7. Scout overlay mechanics (Layer 2)

- Free-text notes stay as they are today (D19, D21).
- New structured input: a per-player conviction (agree / higher / lower, or a tier
  pick) that re-sorts only that account's board and shows the delta vs the model.
- Stored per account, never aggregated across accounts, never fed to any model.
- At grading time the account gets a private scorecard: everywhere you overrode the
  model, who was right.

## 8. Non-goals

- No consensus boards, mock ranks, or scout opinions as model features, ever (D2).
- No retraining or re-scoring of a frozen snapshot for any reason. A pipeline bug
  discovered post-freeze is disclosed as an erratum next to the frozen board, not
  silently fixed.
- No public leaderboard of scouts' scorecards (private by default; sharing is the
  scout's choice).
- Daily refresh cadence: not needed pre-draft (college rates move slowly) and not
  needed post-draft. Weekly everywhere.

## 9. Build order, when the time comes

1. Publish the grading rule page (cheap, do before 2026-27 opener).
2. Class dropdown with the frozen 2026 board (the archive skeleton).
3. NBA Layer-1 updater (research project: fit k_s / cap_s LOYO on 2009-2021).
4. On-pace tags + player-page "then vs now" view.
5. Structured scout conviction + private scorecard.
