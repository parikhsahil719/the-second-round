# Labeling robustness study

Each variant fully relabels the same careers; the market prior and model
are refit leave-one-class-out under that definition. Log losses are only
comparable WITHIN a variant (different labels = different targets).

| variant | market LL | model LL | H1 market wins avg | top-40 edge (p) | bottom-40 edge (p) | 31-45 model edge |
|---|---|---|---|---|---|---|
| v0_current | 1.1289 | 1.2216 | yes | +5.39 (p=0.0000) | -2.37 (p=0.0000) | -0.0233 |
| v1_avg4 | 1.1321 | 1.2242 | yes | +3.96 (p=0.0009) | -2.38 (p=0.0000) | -0.0206 |
| v2_usage | 1.1043 | 1.1969 | yes | +4.85 (p=0.0000) | -2.35 (p=0.0000) | -0.0322 |
| v3_accolade | 1.0966 | 1.1932 | yes | +1.51 (p=0.0792) | -1.53 (p=0.0051) | -0.0124 |

## Tier populations

| variant | OOL | FRINGE | ROTATION | STARTER | ALL_STAR | ELITE |
|---|---|---|---|---|---|---|
| v0_current | 297 | 135 | 281 | 89 | 24 | 21 |
| v1_avg4 | 297 | 135 | 280 | 90 | 24 | 21 |
| v2_usage | 297 | 135 | 288 | 94 | 15 | 18 |
| v3_accolade | 297 | 135 | 289 | 94 | 11 | 21 |

## Where notable careers land

| player | v0_current | v1_avg4 | v2_usage | v3_accolade |
|---|---|---|---|---|
| Mikal Bridges | ALL_STAR | STARTER | STARTER | STARTER |
| Otto Porter Jr. | ALL_STAR | ALL_STAR | ROTATION | ROTATION |
| Andre Drummond | STARTER | STARTER | STARTER | ELITE |
| Jalen Brunson | ROTATION | ROTATION | ROTATION | ROTATION |
| James Harden | ELITE | ELITE | ELITE | ELITE |
| Draymond Green | ELITE | ELITE | ROTATION | ELITE |
| Desmond Bane | ALL_STAR | ALL_STAR | ALL_STAR | STARTER |
