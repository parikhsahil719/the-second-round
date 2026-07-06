# The Second Round

**A quant-style NBA Draft intelligence model.** Fair-value tier probabilities for draft
prospects, compared against the market (draft slot + consensus boards) to find who was
overdrafted, who was underdrafted — and why. Plus a scout-notes layer: free-text scouting
observations are extracted into a fixed rubric and Bayesian-update the statistical prior.

Built on the framework a quant uses for any prediction market:

1. **Define the tradeable event** — six career tiers over a player's first 4 NBA seasons:
   Out of League / Fringe / Rotation / Starter / All-Star / Elite
2. **Convert the market to implied probability** — historical tier rates by draft slot,
   applied to both actual slots and consensus board ranks
3. **Build a base-rate prior** — age, size, class, production, competition level
4. **Add signal features** — research-backed college signals with empirical-Bayes shrinkage
5. **Model the full distribution** — calibrated tier probabilities with bootstrap intervals,
   never a single score
6. **Update with new evidence** — scout notes → LLM extraction → capped likelihood ratios →
   Bayesian posterior
7. **Compare fair value to market** — EV edge + star-tail disagreement flags
8. **Backtest and calibrate** — leave-one-draft-class-out CV on the 2011–2021 classes

## Status

🚧 Phase 0 complete — all data sources spiked and verified. Next: Phase 1 (acquisition + entity resolution).

## Repo layout

```
data/       raw cache (gitignored) + processed parquet
pipeline/   scrapers, cleaning, entity resolution, labeling, features
model/      training, calibration, bootstrap, slot base rates, bayes update, comps
api/        FastAPI: /board, /player/{id}, /notes
web/        Next.js app
notebooks/  EDA, backtest, calibration plots
report/     methodology writeup + final 2026 board
```

## Data sources (all free)

Barttorvik/T-Rank, Basketball-Reference, nba_api (combine), CBBpy/ESPN,
RSCI (via Sports-Reference), Rookie Scale + NBADraft.net consensus boards.
Raw scraped tables are **not** redistributed in this repo — the pipeline
rebuilds them, politely rate-limited and cached.

## License

MIT. See [DECISIONS.md](DECISIONS.md) for the modeling rationale behind every choice.
