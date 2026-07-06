# The Second Round

**A quant-style NBA Draft intelligence product.** Fair-value tier probabilities for draft
prospects, compared against the market (draft slot + consensus boards) to find who was
overdrafted, who was underdrafted — and why. Plus a scout-notes layer (free-text notes →
LLM extraction → capped Bayesian updates), a draft-day availability war room, and
Fan / Front-office / Scout viewing lenses.

## Headline results (2009–2021 backtest, leave-one-class-out)

- **The market beats the model on average** (log loss 1.129 vs 1.266) — stated up front,
  because pretending otherwise would poison everything downstream.
- **At the extremes of disagreement the model wins**: its top-40 out-of-sample favorites
  realized **+5.3 utility above their draft-slot price** (permutation p < 0.0002); its
  top-40 fades realized −2.1 below (p < 0.0002).
- **The market is least efficient in picks 31–45** — the only region where the model's
  out-of-sample log loss beats the slot prior. Bane, Kyle Anderson, and Brunson country.
- A 25/75 model-market blend beats the market alone (1.124 vs 1.129): the box score still
  carries signal the league underweights.

![OOF calibration](report/figs/calibration_oof.png)

Full write-up: [report/memo.md](report/memo.md) (front-office memo + technical appendix),
rendered in-app at `/methodology`. Every modeling decision and its rationale:
[DECISIONS.md](DECISIONS.md).

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

Model, board, scout-notes layer, war room, and app are built and verified locally.
Remaining: report + public deployment.

## Running locally

Prereqs: Python 3.11+, Node 20+. All data sources are free; the only spend is
pennies of Claude API usage for live note extraction (optional — a keyword
fallback runs without a key).

```bash
# 1. Python environment
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt        # (Scripts -> bin on mac/linux)

# 2. Data pipeline (one-time, ~15 min: polite rate-limited scraping, disk-cached)
.venv/Scripts/python pipeline/pull.py                # all sources -> parquet
.venv/Scripts/python pipeline/resolve.py             # entity crosswalk (99.8%)
.venv/Scripts/python pipeline/labels.py              # outcome tiers + spot-check
.venv/Scripts/python pipeline/features.py            # feature matrix w/ EB shrinkage
.venv/Scripts/python pipeline/headshots.py           # ESPN headshots (best-effort)

# 3. Model
.venv/Scripts/python model/prior.py                  # slot-implied market prior
.venv/Scripts/python model/train.py                  # LOCO-CV shootout + calibration
.venv/Scripts/python model/score.py                  # 2026 board + artifacts
.venv/Scripts/python model/simulate.py               # war-room availability sim
.venv/Scripts/python model/notes.py                  # Bayesian layer self-test
.venv/Scripts/python model/notes_demo.py             # seeded notes end-to-end

# 4. Serve
.venv/Scripts/python -m uvicorn api.main:app --port 8765
cd web && npm install && npm run dev                 # http://localhost:3000
```

Optional env:
- `.env` at repo root: `ANTHROPIC_API_KEY=...` enables live Claude note extraction
  (otherwise the keyword mock runs).
- `web/.env.local`: `NEXT_PUBLIC_API_URL` (defaults to `http://127.0.0.1:8765`),
  plus `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` to enable
  scout accounts (create a free Supabase project, run `supabase/schema.sql` in its
  SQL editor, enable the Email provider). Without them the app runs account-less.

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

## Deploying

See [DEPLOY.md](DEPLOY.md) — GitHub + Render + Vercel + Supabase, all free tiers,
~30–45 minutes.

## License

MIT. Built by Sahil Parikh — [portfolio](https://YOUR_LINK_HERE).
See [DECISIONS.md](DECISIONS.md) for the modeling rationale behind every choice.
