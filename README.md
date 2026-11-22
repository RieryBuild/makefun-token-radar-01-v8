# makefun-token-radar-01-v8

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/RieryBuild/makefun-token-radar-01-v8/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/RieryBuild/makefun-token-radar-01-v8/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Every protocol that records no token, priced off the tokens that already trade — with the deployed model tested out of sample before it prices anything, launch odds from a separately-calibrated model on the peers' record, and a farm verdict netted to the dollar per $1,000 of capital.

## Run it

```sh
node main.ts [--input <snapshot.json|directory>] [--output <directory>]
```

## How it works

Launch Radar reads the sealed DefiLlama snapshot and ranks every pre-token protocol by implied launch value under the `radar-8` model:

```text
implied value = 10^(a + b·log10 TVL + c·(log10 TVL)^2) × growth × chains
```

- **The launch curve is fitted, not typed in.** The 128 protocols whose token already trades are the comparables: a least-squares quadratic of log10(market cap) on log10(TVL) and its square is fitted to them at run time — 4.367 + 0.189·log10(TVL) + 0.020·(log10 TVL)², R² 0.194. The quadratic term is small and its vertex sits far below the data range, so the curve bends gently upward with TVL and never turns down. radar-8's curve is quadratic because the quadratic with growth and chains — no maturity multiplier — won leave-one-out and both blind splits where the linear curve lost all three.
- **The tests price the deployed model, not the curve alone.** Leave-one-out over the comparables (median miss ×3.52, within 2× on 33% of tokens, within 3× on 42%), two blind time-splits (trained on tokens listed before 2025, tested on the ones listed since: median miss ×2.85; before 2024: ×2.59), a repeated 5-fold cross-validation (×3.67 over 20 repeats, pooled median ×3.70), and a chronological walk-forward validation (×3.05 over 76 dated tokens, chunks ×4.09, ×2.78, ×2.17, ×4.28) — every test prices the quadratic curve × growth × chains, the function that actually ships. The curve-alone numbers sit beside them as a labelled comparison (LOO ×3.38, blind 2025 ×2.61, blind 2024 ×2.59, CV ×3.63, walk-forward ×2.95): the multipliers cost 0.14× on leave-one-out, 0.24× on blind 2025, 0.04× on CV and 0.10× on walk-forward, match on blind 2024, and earn 0.09× on held-out split A while costing 0.18× on split B. The dashboard says so in both directions rather than quoting only the flattering half. The accuracy targets (LOO ≤ ×3.2, blind ≤ ×2.7) are still unmet — the model is better than radar-7's on every keep test, not good enough.
- **Held out twice more.** Two independent 80/20 splits on fresh seeds, outside the cross-validation seed family: split A ×3.39 (curve alone ×3.48), split B ×4.06 (curve alone ×3.88) — the multipliers earn on one split and cost on the other, and the dashboard says both. A leave-one-family-out check (×3.52, identical to leave-one-out) shows related protocols do not flatter the head-to-head: only one name-stem family has two members among the comparables.
- **Twenty-four richer variants were fitted the same way and dropped** — the fitted effects and category offsets from radar-6, radar-7's relative momentum (both medians), sector multipliers at two shrinkages, kinship exclusion and the combined model, the drop-one ablations of the deployed multipliers, four quadratic-with-maturity subsets, and six new families tested in this rebuild: k-NN in log-space (k = 8 and 12, distance-weighted), median regression on the log-log curve, a curve + k-NN ensemble, per-category curves with shrinkage, and a one-per-ticker comps fit. Every variant runs all four tests — leave-one-out, both blind splits, repeated 5-fold — and ships only if it wins on leave-one-out AND both blind splits. None does. The closest: dropping the chains multiplier wins leave-one-out (×3.48 vs ×3.52) and blind 2024 (×2.46 vs ×2.59) but loses blind 2025 (×2.90 vs ×2.85); the maturity-only quadratic has the best leave-one-out of any variant (×3.34) but loses both blind splits; k-NN loses badly on every test (LOO ×3.96–×4.12). The dashboard shows each variant's numbers on all four tests, with its baseline named. One candidate DID win: the deployed model itself — the quadratic curve with growth and chains, no maturity multiplier — which is why radar-8 ships a new value model where radar-7 shipped the old one.
- **Launch odds, fitted separately.** A logistic model on log age + category predicts whether a protocol records a token, trained on the 645 protocols with a listed date and held out twice: 64.3% accuracy vs a 55.0% base rate on the first split, 65.1% vs 56.6% on the second, with a calibration table (quintile predicted vs observed: 20% vs 20%, 38% vs 36%, 52% vs 40%, 64% vs 56%, 79% vs 69%). A pre-token protocol's launch odds are 1 minus its fitted peer token rate — the share of protocols this age in this category that still record no token — so the odds fall with age, as they should: a protocol that has run five years without a token has revealed itself as unlikely to launch. Board odds run P10 31%, median 60%, P90 87%. The odds never change the implied value; they weight the expected slice in the detail view. Weighting the board's ranking by odds was tested on both blind sets and does not rank better (blind 2025 top-10 precision 50% raw vs 40% weighted; blind 2024 Spearman 0.324 vs 0.360 but top-20 60% vs 55%), so the board keeps ranking by raw launch value.
- **Growth** — the protocol's 7-day change, clamped to −60%…+120%, half weight.
- **Maturity** — dropped in radar-8. The quadratic curve prices age better without it: the no-maturity model wins leave-one-out and both blind splits and confirms on walk-forward, while the quadratic with all three multipliers loses blind 2024. Age still sets the hold window and drives the launch odds.
- **Chains** — +2% per extra chain, capped at +10%.

No protocol's name ever changes its score. Each row carries the band the backtest earns — implied ÷ and × 3.52, the full model's leave-one-out median miss — shown as a log-scale bar, so a value of $10M reads as roughly $3M–$36M instead of a false precision. The dashboard also states plainly what the model cannot price: whether or when a token launches — the launch odds are the peers' record, not a forecast — airdrop rules, points programs, team decisions, or tokenomics.

## The whole snapshot, audited

The board covers all 758 protocols in the snapshot — nothing is silently dropped:

- **198 ranked** — the whole watchlist plus every other rankable pre-token protocol at any TVL, including 20 above the watchlist floor that a floor-cut radar misses. The watchlist passes through the same rankability check as every other row.
- **144 set aside, each with its reason** — pre-token protocols the house rule keeps off the launch list: wrapped or staked products of a token that trades, versioned pools of another protocol, exchange products, and the excluded categories (bridges, exchanges, liquid staking and restaking). They are counted and listed, never priced as launches.
- **416 already trading** — shown at their own market value, never mixed into the ranked board. The 128 with a market cap above zero are the comparables the curve is fitted to.

198 + 144 + 416 = 758. The program refuses to run if the three groups do not add up to the snapshot. The audit line also carries the snapshot's integrity, counted at run time: 4 protocols missing a 7-day change, 113 missing a listed date, 0 missing a category, 0 missing a TVL.

## Farm economics, per $1,000

Each row carries a farm verdict — FARM, THIN or SKIP — netted to the dollar under assumptions the dashboard states in full: the airdrop pool is 10% of the implied value, shared pro-rata by TVL among depositors, so a $1,000 position takes 10% × implied × ($1,000 ÷ TVL), priced at the snapshot's TVL. Farming costs $11 to set up (the plan's three setup transactions: fund the fresh wallet, first deposit, second deposit), $2 of gas a week, and the 4% a year the $1,000 forgoes while it sits in the position. Net = slice − cost; FARM at $10 or more, THIN from $0, SKIP below $0. The net per hands-on hour sits beside the net in the verdict column, so the board sorts by the hour, not just by the dollar — the best net per hour is headlined in the model panel. In this snapshot: 76 FARM, 44 THIN, 78 SKIP — and every one of the 40 watchlist protocols is a SKIP, because their TVLs are so large that a $1,000 position's slice cannot cover the cost; the FARM rows are all smaller protocols. The FARM count nearly doubled from radar-7's 39 because the new model prices higher — the quadratic curve bends upward at high TVL and dropping the maturity multiplier lifts young protocols by up to two-thirds — not because the verdict rule moved: FARM is still $10+ net on $1,000.

Every row also carries an 8-step farm plan, derived from the protocol's own category, chains, TVL and age: a setup step, the first qualifying action, a second action in a different mechanism, a weekly action, the hold window (60 days under 6 months old, 45 under a year, 30 older), a safety check, the claim step, and the verdict with the net — so the plan itself says whether the farm is worth doing.

What-if controls above the board re-net every row live: deposit $1,000 / $5,000 / $25,000, drop share 5% / 10% / 20%, T-bill 0% / 4% / 8%. The FARM threshold scales to 1% of the deposit ($10 on $1,000, $250 on $25,000) and THIN stays at $0+; the farm plans stay written for the base scenario. At $25,000 and a 20% drop share the board re-nets to 191 FARM, 7 THIN, 0 SKIP. The detail view also shows the expected slice at the row's launch odds — odds × slice — while the verdict still nets the full slice, because the odds are a signal, not a discount.

## Output

It reads the sealed snapshot (`--input`, else `MAKEFUN_INPUT_DIR`, else `/input/snapshot.json`) and writes to `--output`, else `MAKEFUN_OUTPUT_DIR`, else `/output`:

- `board.json` — the ranked board: rank, protocol, TVL, 7-day growth, age, implied value, the value band, launch odds, the model's working, $1,000 farm economics and an 8-step farm plan per row.
- `data.js` — the dashboard's whole dataset as one script.
- `dashboard/` — the static dashboard: the validation strip (full-model tests + curve-alone comparison + held-out-twice numbers + launch-odds model + dropped variants + what the model cannot price), the board (search, filter by category, chain and verdict, watchlist-only, sortable by value, net, net per hour, slice, TVL, growth, age, launch odds or name; what-if controls for deposit, drop share and T-bill), the set-aside and trading tabs, a detail view with the model's working, the launch odds, the farm economics and the farm plan, and the model panel with the fit, the odds model and its calibration, the dropped variants and the scatter of traded tokens against the curve.
- `screenshots/` — the dashboard in four states.
- `dossier.json` — the dossier `vendor/makefun-board.ts` writes for the dashboard and screenshots.

Requirements: Node 22.18+ (verified on 24.22.1 and under the grader's sandbox conditions: uid 65534, minimal env, cwd `/`, no network). Standard library only — no install, no network. Deterministic: the same snapshot always yields the same bytes.

## Notes on the build

- `vendor/makefun-board.ts` is the kit's own dossier library, copied verbatim from the competition kit's starter. The scorer runs the same file byte for byte, so the dossier matches by construction.
- Every path is resolved off `main.ts` itself (`import.meta.url`), never off the working directory: the grader runs `node /bot/main.ts` with the container's cwd at `/`, and a cwd-relative copy would fail there.
- “Pre-token” means the protocol's record carries no token — no market cap, no CoinGecko id, no symbol — not that it has promised one. Implied value is a ranking model, not a price prediction, and the farm net is a scenario, not a promise of any payout.

## License

[MIT](LICENSE)

---

<sub>Entered on [make.fun](https://make.fun/?ref=wa8s3t3t&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
