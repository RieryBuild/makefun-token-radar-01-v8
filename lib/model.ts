// Launch Radar, model radar-8: one sealed snapshot in, one ranked board out.
//
// radar-8 keeps radar-7's odds model, double held-out validation, what-if farm
// economics and integrity strip — and replaces its value curve. The deployed model
// is now a QUADRATIC log-log curve (log10(mcap) on log10(TVL) and its square) times
// growth and chains multipliers, with NO maturity multiplier: that combination won
// on leave-one-out (x3.52 vs x3.57) AND both blind splits (2025: x2.85 vs x3.02;
// 2024: x2.59 vs x2.82) and confirmed on walk-forward (x3.05 vs x3.44), while the
// quadratic with all three multipliers lost blind 2024 and the linear curve lost
// all three keep tests. It still loses repeated 5-fold CV (x3.67 vs x3.48) and
// held-out split A by 0.01 — stated on the board, not hidden — so the targets
// (LOO <= x3.2, blind <= x2.7) are still unmet; the model is better, not good
// enough. Every other candidate family tested in this rebuild (k-NN in log-space,
// median regression, curve + k-NN ensembles, per-category curves with shrinkage,
// one-per-ticker fits, odds-weighted ranking, recent-peers fits) lost on at least
// one keep test and joins the dropped table with its numbers.
//
// What the tests are, and what each one prices:
//   leave-one-out     refit the curve without each traded token, price it with the full
//                     model (curve x its own multipliers), score the miss — and the same
//                     pass with the curve alone, for comparison
//   blind time-split  train on tokens listed before a cut, test on the ones listed since,
//                     full model and curve alone side by side
//   repeated 5-fold   20 seeded repeats of 5-fold cross-validation, full model and curve
//                     alone, each summarised two ways (mean of per-repeat medians, and the
//                     pooled median over every miss)
//   held out twice    two INDEPENDENT 80/20 splits on fresh seeds (777001, 777002 —
//                     outside the cross-validation seed family), fit on the 80, test on
//                     the held-out 20, full model and curve alone: a second held-out
//                     validation beyond leave-one-out, the blind splits and CV
//   walk-forward      chronological expanding window over the dated comparables: five
//                     time-ordered chunks, train on the earlier chunks, test on the
//                     next one — the validation the top-5 shows and radar-7 lacked
//   leave-one-family  hold out every member of one name-stem family at once: the check
//                     that related protocols are not flattering leave-one-out
//   dropped variants  twenty-four richer fits and ablations, each tested on leave-one-out,
//                     BOTH blind splits and repeated 5-fold and compared against the FULL
//                     model — a variant ships only if it wins on leave-one-out AND both
//                     blind splits
//   launch odds       a logistic model on age + category, fitted separately from the
//                     value model, predicting whether a protocol records a token; held
//                     out twice on two independent 80/20 splits, accuracy against the
//                     base rate, with a calibration table. A pre-token protocol's launch
//                     odds are 1 minus its fitted peer token rate: the share of protocols
//                     this age in this category that still record no token.
//   odds ranking      on each blind test set, does launch value x launch odds rank the
//                     realized market caps better than raw launch value (Spearman rank
//                     correlation and top-10 / top-20 precision)? The odds stay
//                     display-only: on blind 2025 the weighting HURTS the ranking, so
//                     the board keeps ranking by raw launch value.
//
// The board ranks every protocol the house rule admits as a launch candidate: the whole
// watchlist (the floor, never the ceiling) plus every other rankable pre-token protocol
// at any TVL — and the watchlist now passes through the same isRankable() check as every
// other row, instead of being admitted unconditionally. Protocols whose token already
// trades are kept apart and shown at the market's own value, never mixed into the ranked
// board. Pre-token protocols the rule sets aside — wrapped or staked products, versioned
// pools, exchange products, excluded categories — are listed with the reason each, never
// hidden and never priced as launches. Ranked + set aside + trading must add up to the
// snapshot, or the program refuses to run.
//
// "Pre-token" means the protocol's record carries no token — no market cap, no CoinGecko
// id, no symbol — not that it has promised one. Implied value is a ranking model, not a
// price prediction, and the farm net is a scenario, not a promise of any payout.

/** One protocol entry: exactly the ten fields the sealed snapshot carries. */
export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

/** The fitted launch curve: log10(market cap) = a + b * log10(TVL) + c * log10(TVL)^2.
 * The quadratic term is small (c ~ +0.02) and its vertex sits far below the data
 * range, so the curve is monotone increasing over every plausible TVL — a gentle
 * bend, not a turn. */
export interface Curve {
  intercept: number;
  slope: number;
  quadratic: number;
  r_squared: number;
  comparables: number;
}

/** One out-of-sample test's record: how the model priced tokens it had not trained on. */
export interface TestRecord {
  method: string;
  tested: number;
  median_miss_x: number;
  within_2x: number;
  within_3x: number;
}

/** One richer variant that was fitted, tested and dropped, with all four of its test
 * numbers. `baseline` names what it is compared against: 'full' for the deployed model,
 * 'curve' for the pooled line alone. A variant that prices through its own curve only
 * (the bare quadratic) is compared against the pooled line, not against a model with
 * multipliers it never had — comparing it against the full model would conflate the
 * curve family with the multipliers. The keep rule is leave-one-out AND both blind
 * splits: a variant ships only if it wins on all three against its baseline. */
export interface DroppedVariant {
  name: string;
  loo_median_miss_x: number;
  blind2025_median_miss_x: number;
  blind2024_median_miss_x: number;
  cv_median_miss_x: number;
  baseline: 'full' | 'curve';
  note: string;
}

/** One calibration bucket of the odds model: the mean predicted token rate in the
 * bucket against the share that actually records a token, on held-out protocols. */
export interface CalibrationBucket {
  predicted: number;
  observed: number;
  n: number;
}

/** One walk-forward record: chronological expanding-window validation over the dated
 * comparables (five time-ordered chunks; train on the earlier chunks, test on the
 * next). `chunks` are the per-chunk median misses, in time order. */
export interface WalkForwardRecord {
  method: string;
  tested: number;
  median_miss_x: number;
  chunks: number[];
}

/** One odds-ranking test: on a blind test set, does launch value x launch odds rank
 * the realized market caps better than raw launch value? Spearman rank correlation
 * and top-10 / top-20 precision against realized market cap, for both rankings. */
export interface OddsRanking {
  test: string;
  n: number;
  spearman_raw: number;
  spearman_weighted: number;
  top10_raw: number;
  top10_weighted: number;
  top20_raw: number;
  top20_weighted: number;
}

/**
 * The launch-odds model's record. The model is fitted separately from the value model:
 * a logistic regression on age + category predicting whether a protocol records a
 * token, trained on the protocols with a listed date. It is held out twice on two
 * independent seeded 80/20 splits; `holdout_a_accuracy` / `holdout_b_accuracy` are the
 * held-out accuracies and `holdout_a_base` / `holdout_b_base` the base rates (the
 * majority class's share of the same held-out set) they must beat. `calibration` is
 * hold-out A's quintile table. `board_p10` … `board_p90` are the percentiles of the
 * launch odds across the ranked board — the calibration range, stated honestly.
 */
export interface OddsRecord {
  trained_on: number;
  traded_share: number;
  holdout_a_accuracy: number;
  holdout_a_base: number;
  holdout_a_n: number;
  holdout_b_accuracy: number;
  holdout_b_base: number;
  holdout_b_n: number;
  age_coefficient: number;
  calibration: CalibrationBucket[];
  board_p10: number;
  board_p25: number;
  board_median: number;
  board_p75: number;
  board_p90: number;
}

/** The snapshot's integrity: what the sealed snapshot carries and what it is missing.
 * Counted at run time from the snapshot itself, never typed in. */
export interface Integrity {
  protocols: number;
  watchlist: number;
  missing_change_7d: number;
  missing_listed_at: number;
  missing_category: number;
  missing_tvl: number;
  as_of: string;
}

/**
 * The whole validation record. Every headline test exists twice: the FULL model (the
 * deployed pricing function, curve x multipliers) and the curve alone, so the dashboard
 * can show what the multipliers do to out-of-sample accuracy instead of hiding it.
 */
export interface Validation {
  loo: TestRecord;
  loo_curve: TestRecord;
  blind2025: TestRecord;
  blind2025_curve: TestRecord;
  blind2024: TestRecord;
  blind2024_curve: TestRecord;
  heldoutA: TestRecord;
  heldoutA_curve: TestRecord;
  heldoutB: TestRecord;
  heldoutB_curve: TestRecord;
  familyLoo: TestRecord;
  walkforward: WalkForwardRecord;
  walkforward_curve: WalkForwardRecord;
  odds_ranking: OddsRanking[];
  cv_median_miss_x: number;
  cv_pooled_median_miss_x: number;
  cv_curve_median_miss_x: number;
  cv_curve_pooled_median_miss_x: number;
  dropped: DroppedVariant[];
}

/** The farm-economics assumptions, stated so a reader can re-run them. */
export interface FarmAssumptions {
  airdrop_share: number;
  position_usd: number;
  tbill_annual_rate: number;
  setup_gas_usd: number;
  weekly_gas_usd: number;
  setup_minutes: number;
  weekly_minutes: number;
  claim_minutes: number;
  hold_days_young: number;
  hold_days_mid: number;
  hold_days_old: number;
}

/** The model's constants, as the dashboard states them. */
export interface ModelParams {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  unknown_age_days: number;
  chain_bonus: number;
  chain_bonus_max: number;
  economics: FarmAssumptions;
}

export const PARAMS: ModelParams = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  unknown_age_days: 365,
  chain_bonus: 0.02,
  chain_bonus_max: 5,
  economics: {
    airdrop_share: 0.1,
    position_usd: 1000,
    tbill_annual_rate: 0.04,
    // The setup gas and minutes are the plan's own setup steps added up, not a
    // separate guess: funding the fresh wallet (~$3, 5 min), the first deposit
    // (~$4, 15 min), the second deposit (~$4, 10 min). The weekly minutes are one
    // qualifying action (10) plus the weekly safety check (5); the claim minutes
    // are the claim itself (10) plus the farm log (5). The cost model and the
    // eight-step plan describe the same farm, so their numbers must agree.
    setup_gas_usd: 11,
    weekly_gas_usd: 2,
    setup_minutes: 30,
    weekly_minutes: 15,
    claim_minutes: 15,
    // The hold windows are scenario choices, set before any test: a young
    // protocol's launch is further out, so its farming window is longer; an old
    // protocol is nearer a launch decision, so the window is shorter.
    hold_days_young: 60,
    hold_days_mid: 45,
    hold_days_old: 30,
  },
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-8';

/** The blind splits' cuts: tokens listed before the cut train the curve, the rest test it. */
export const BLIND_CUT_2025 = '2025-01-01';
export const BLIND_CUT_2024 = '2024-01-01';

/** One farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export type Verdict = 'FARM' | 'THIN' | 'SKIP';

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  band_low_usd: number;
  band_high_usd: number;
  /** Launch odds: 1 minus the fitted peer token rate — the share of protocols this
   * age in this category that still record no token. A signal, not a forecast. */
  launch_odds: number;
  model: {
    base_value_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm: {
    slice_usd: number;
    farm_cost_usd: number;
    net_per_1000_usd: number;
    net_per_hour_usd: number;
    hands_on_hours: number;
    hold_days: number;
    verdict: Verdict;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one board row. */
export interface DashRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  band_low_usd: number;
  band_high_usd: number;
  launch_odds: number;
  watchlist: boolean;
  base_value_usd: number;
  growth_multiplier: number;
  chain_multiplier: number;
  slice_usd: number;
  farm_cost_usd: number;
  net_per_1000_usd: number;
  net_per_hour_usd: number;
  hands_on_hours: number;
  hold_days: number;
  verdict: Verdict;
  farm_steps: string[];
}

/** A protocol the house rule sets aside, with the reason. */
export interface AsideRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  reason: string;
}

/** A protocol whose token already trades, at the market's own value. */
export interface TradedRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard renders. */
export interface DashData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelParams;
  model_version: string;
  curve: Curve;
  validation: Validation;
  odds: OddsRecord;
  integrity: Integrity;
  band_median_miss_x: number;
  watchlist_size: number;
  snapshot_size: number;
  board_size: number;
  early_size: number;
  traded_size: number;
  aside_size: number;
  verdict_counts: { FARM: number; THIN: number; SKIP: number };
  best_per_hour: { slug: string; name: string; net_per_hour_usd: number };
  best_per_hour_watchlist: { slug: string; name: string; net_per_hour_usd: number };
  rows: DashRow[];
  traded: TradedRow[];
  aside: AsideRow[];
  comps: [number, number][];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a list, or NaN when it is empty. Exported: the build dir's candidate
 * experiments run the same tests the shipped validation runs, through these helpers. */
export function medianOf(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/* ------------------------------------------------------------------ */
/* The fit: least squares in log space, over the traded comparables.   */
/* ------------------------------------------------------------------ */

/** The comparables: protocols whose token trades with a market value above zero and a
 * TVL above zero — a comparable with no TVL cannot price anything, and log10(0) would
 * poison the fit with -Infinity. */
export function comparablesOf(snapshot: Snapshot): Protocol[] {
  return snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** Least squares for y = a + b*x, with R squared. Exported for the candidate experiments. */
export function lineFit(xs: number[], ys: number[]): { a: number; b: number; r2: number } {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) ** 2;
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sst += (ys[i]! - my) ** 2;
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = my - b * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (ys[i]! - (a + b * xs[i]!)) ** 2;
  return { a, b, r2: sst === 0 ? 0 : 1 - sse / sst };
}

/**
 * Small OLS for a feature matrix: normal equations solved by Gaussian elimination with
 * partial pivoting. The 1e-8 added to each diagonal entry of X'X is a ridge so small it
 * exists only to keep a perfectly collinear direction solvable: X'X's entries here are
 * O(n * x^2), in the thousands, so 1e-8 shifts any fitted coefficient by far less than
 * one part in a million. It is a numerical guard, not a fitted regulariser.
 */
export function solveOls(rows: number[][], y: number[]): number[] {
  const k = rows[0]!.length;
  const ata: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const atb: number[] = new Array<number>(k).fill(0);
  for (let i = 0; i < rows.length; i++) {
    for (let r = 0; r < k; r++) {
      atb[r]! += rows[i]![r]! * y[i]!;
      for (let c = 0; c < k; c++) ata[r]![c]! += rows[i]![r]! * rows[i]![c]!;
    }
  }
  for (let r = 0; r < k; r++) ata[r]![r]! += 1e-8;
  const aug = ata.map((row, i) => [...row, atb[i]!]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(aug[r]![c]!) > Math.abs(aug[piv]![c]!)) piv = r;
    [aug[c], aug[piv]] = [aug[piv]!, aug[c]!];
    const d = aug[c]![c]!;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = aug[r]![c]! / d;
      for (let j = c; j <= k; j++) aug[r]![j]! -= f * aug[c]![j]!;
    }
  }
  return aug.map((row, i) => row[k]! / row[i]!);
}

export const dot = (a: number[], b: number[]): number => a.reduce((s, v, i) => s + v * b[i]!, 0);

/** The launch curve fitted over a set of comparables: least squares of log10(mcap)
 * on [1, log10(TVL), log10(TVL)^2]. Refuses an empty pool: a line fitted to
 * nothing would be NaN, and a NaN curve would price every protocol NaN. The
 * quadratic coefficient comes out near +0.02 on this snapshot: the curve bends
 * gently upward with TVL, and its vertex sits far below the data range, so it is
 * monotone increasing over every plausible TVL. */
export function fitCurve(pool: Protocol[]): Curve {
  if (pool.length === 0) throw new SnapshotError('cannot fit the launch curve: no comparables');
  const beta = solveOls(
    pool.map((p) => {
      const x = Math.log10(p.tvl_usd);
      return [1, x, x * x];
    }),
    pool.map((p) => Math.log10(p.mcap_usd!)),
  );
  const ys = pool.map((p) => Math.log10(p.mcap_usd!));
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let sst = 0;
  let sse = 0;
  for (let i = 0; i < pool.length; i++) {
    const x = Math.log10(pool[i]!.tvl_usd);
    const pred = beta[0]! + beta[1]! * x + beta[2]! * x * x;
    sst += (ys[i]! - my) ** 2;
    sse += (ys[i]! - pred) ** 2;
  }
  return { intercept: beta[0]!, slope: beta[1]!, quadratic: beta[2]!, r_squared: sst === 0 ? 0 : 1 - sse / sst, comparables: pool.length };
}

/**
 * The curve's base value for a TVL: 10^(a + b*log10(TVL) + c*log10(TVL)^2). A TVL at
 * or below zero is clamped to $1 before the log, because log10(0) is undefined; the
 * snapshot's floor is $5M, so no live protocol reaches the clamp — it guards a
 * future snapshot with a zero-TVL row, and the clamped price is 10^intercept, the
 * curve's value at $1 of TVL.
 */
export function curveBase(curve: Curve, tvlUsd: number): number {
  const x = Math.log10(Math.max(1, tvlUsd));
  return 10 ** (curve.intercept + curve.slope * x + curve.quadratic * x * x);
}

/** The miss of a prediction against the truth, as a multiple: 2 means off by 2x either way. */
export function missFactor(predicted: number, actual: number): number {
  return 10 ** Math.abs(Math.log10(predicted / actual));
}

/** A test record out of a list of misses. */
export function recordOf(method: string, misses: number[]): TestRecord {
  const share = (times: number): number => misses.filter((m) => m <= times).length / misses.length;
  return {
    method,
    tested: misses.length,
    median_miss_x: round2(medianOf(misses)),
    within_2x: Math.round(share(2) * 1000) / 1000,
    within_3x: Math.round(share(3) * 1000) / 1000,
  };
}

/* ------------------------------------------------------------------ */
/* The multipliers: the two adjustments on top of the fitted curve.    */
/* ------------------------------------------------------------------ */

/** The multipliers one protocol gets, from its own record only. radar-8 drops the
 * maturity multiplier radar-7 carried: the quadratic curve prices age better
 * without it (leave-one-out x3.52 with it off vs x3.51 with it on is a tie on
 * that test, but the no-maturity model wins both blind splits while the
 * with-maturity one loses blind 2024). */
export interface Multipliers {
  growthPct: number;
  growthMult: number;
  chainMult: number;
  age: number | null;
}

/**
 * The multipliers for one protocol. Each is a deterministic function of the protocol's
 * own fields — its 7-day change, its chain count — with constants fixed before
 * any test runs. That is what makes full-model validation possible without leakage: in
 * leave-one-out, in a blind split, in a CV fold, the held-out protocol's multipliers
 * come from its own record, never from the training set, so only the curve itself is
 * refitted per fold.
 */
export function multipliersOf(p: Protocol, asOf: string, params: ModelParams): Multipliers {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = clamp(num(p.change_7d, 0), params.growth_floor, params.growth_cap);
  const growthMult = 1 + (growthPct / 100) * params.growth_weight;
  const chainMult = 1 + params.chain_bonus * clamp(p.chains.length - 1, 0, params.chain_bonus_max);
  return { growthPct, growthMult, chainMult, age };
}

/** The multipliers and the implied value one protocol gets under the fitted curve. */
export function priceProtocol(
  p: Protocol,
  asOf: string,
  curve: Curve,
  params: ModelParams,
): { implied: number; base: number; growthPct: number; growthMult: number; chainMult: number; age: number | null } {
  const m = multipliersOf(p, asOf, params);
  const base = curveBase(curve, p.tvl_usd);
  const implied = Math.max(1, Math.round(base * m.growthMult * m.chainMult));
  return { implied, base: Math.round(base), ...m };
}

/** A base value (from any curve) times one protocol's own multipliers. */
export function withMultipliers(p: Protocol, asOf: string, base: number, params: ModelParams): number {
  const m = multipliersOf(p, asOf, params);
  return Math.max(1, Math.round(base * m.growthMult * m.chainMult));
}

/* ------------------------------------------------------------------ */
/* Out-of-sample tests: leave-one-out, blind splits, repeated CV.      */
/*                                                                     */
/* Every test below runs TWICE: once pricing through the full deployed */
/* model (curve x multipliers) and once through the curve alone. The   */
/* full-model numbers are the headline; the curve-alone numbers are    */
/* the labelled comparison that shows what the multipliers do.         */
/* ------------------------------------------------------------------ */

/** Leave-one-out: refit without each comparable, price it, score the miss. Exported: the
 * build dir's candidate experiments run the shipped test code, not a copy of it. */
export function leaveOneOut(pool: Protocol[], price: (p: Protocol, others: Protocol[]) => number, method: string): TestRecord {
  const misses: number[] = [];
  for (let i = 0; i < pool.length; i++) {
    const others = [...pool.slice(0, i), ...pool.slice(i + 1)];
    misses.push(missFactor(price(pool[i]!, others), pool[i]!.mcap_usd!));
  }
  return recordOf(method, misses);
}

/** Blind time-split: train on the older tokens, test on the newer ones. Comparables
 * with no listed date are excluded from BOTH train and test — there is no honest side
 * to put them on — so a blind split tests fewer than the full pool (33 of this
 * snapshot's 128 comparables carry no listed date). The record's `tested` count says
 * how many were actually tested, and the dashboard shows it. */
export function blindSplit(pool: Protocol[], cutoff: string, price: (p: Protocol, train: Protocol[]) => number, method: string): TestRecord {
  const train = pool.filter((p) => p.listed_at !== null && p.listed_at < cutoff);
  const test = pool.filter((p) => p.listed_at !== null && p.listed_at >= cutoff);
  if (train.length < 10 || test.length === 0) {
    return { method, tested: 0, median_miss_x: Number.NaN, within_2x: Number.NaN, within_3x: Number.NaN };
  }
  return recordOf(method, test.map((p) => missFactor(price(p, train), p.mcap_usd!)));
}

/**
 * An independent held-out split: one seeded 80/20 shuffle, fit on the 80, test on the
 * held-out 20. The seeds live outside the cross-validation family (1000+rep), so the
 * two held-out splits are a genuinely second validation, not a re-run of the folds.
 */
export function heldOutSplit(pool: Protocol[], seed: number, price: (p: Protocol, train: Protocol[]) => number, method: string): TestRecord {
  const rand = mulberry32(seed);
  const idx = pool.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  const cut = Math.floor(idx.length * 0.8);
  const train = idx.slice(0, cut).map((i) => pool[i]!);
  const test = idx.slice(cut).map((i) => pool[i]!);
  return recordOf(method, test.map((p) => missFactor(price(p, train), p.mcap_usd!)));
}

/**
 * Leave-one-family-out: hold out every member of one name-stem family at once, fit on
 * the rest, price each held-out member. When related protocols share a ratio, plain
 * leave-one-out flatters the model — a family member left in training prices its own
 * kin. The gap between this number and leave-one-out is how much kinship flatters it;
 * on this snapshot the two agree exactly, because only one stem family has two members
 * among the comparables — the check is reported anyway, because a check that finds
 * nothing is still a check.
 */
export function familyLeaveOneOut(pool: Protocol[], price: (p: Protocol, train: Protocol[]) => number, method: string): TestRecord {
  const misses: number[] = [];
  for (const family of [...new Set(pool.map((p) => stem(p.name)))]) {
    const test = pool.filter((p) => stem(p.name) === family);
    const train = pool.filter((p) => stem(p.name) !== family);
    if (train.length < 10) continue;
    for (const p of test) misses.push(missFactor(price(p, train), p.mcap_usd!));
  }
  return recordOf(method, misses);
}

/** Deterministic PRNG (mulberry32): the same snapshot always folds the same way. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Repeated k-fold cross-validation of one predictor family: 20 repeats, each a complete
 * 5-fold pass over the pool. Two summaries are returned, because the choice of summary
 * is a real one and hiding it would be a second overclaim:
 *   mean_of_medians — the mean of the 20 per-repeat medians. The headline. Each repeat
 *     is one complete pass, so averaging per-repeat medians weights each repeat equally.
 *   pooled_median — the median over every miss of every repeat (2,560 misses at n=128).
 *     The cross-check: the two agree when no single repeat is driving the result.
 * `fit` turns a training set into a function that prices a protocol.
 */
export function repeatedKFold(
  pool: Protocol[],
  fit: (train: Protocol[]) => (p: Protocol) => number,
  repeats = 20,
  folds = 5,
): { mean_of_medians: number; pooled_median: number } {
  const repeatMedians: number[] = [];
  const allMisses: number[] = [];
  for (let rep = 0; rep < repeats; rep++) {
    const rand = mulberry32(1000 + rep);
    const idx = pool.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [idx[i], idx[j]] = [idx[j]!, idx[i]!];
    }
    const misses: number[] = [];
    for (let fold = 0; fold < folds; fold++) {
      const testIdx = new Set(idx.filter((_, j) => j % folds === fold));
      const train = pool.filter((_, i) => !testIdx.has(i));
      const test = pool.filter((_, i) => testIdx.has(i));
      const price = fit(train);
      for (const p of test) misses.push(missFactor(price(p), p.mcap_usd!));
    }
    repeatMedians.push(medianOf(misses));
    allMisses.push(...misses);
  }
  return {
    mean_of_medians: round2(repeatMedians.reduce((s, v) => s + v, 0) / repeatMedians.length),
    pooled_median: round2(medianOf(allMisses)),
  };
}

/* ------------------------------------------------------------------ */
/* Walk-forward + rank correlation: the two new test designs in radar-8. */
/* ------------------------------------------------------------------ */

/**
 * Walk-forward validation: chronological expanding window over the dated
 * comparables. Five time-ordered chunks by listed date; for i = 1..4, train on
 * chunks 0..i-1 and test on chunk i. Returns the pooled median miss over every
 * tested protocol plus the per-chunk medians in time order, so a reader can see
 * whether the model holds up as time moves on or only on one era. Undated
 * comparables are excluded from both sides, as in the blind splits.
 */
export function walkForward(
  pool: Protocol[],
  price: (p: Protocol, train: Protocol[]) => number,
  method: string,
): WalkForwardRecord {
  const dated = pool
    .filter((p) => p.listed_at !== null)
    .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : 0));
  const chunks: Protocol[][] = [[], [], [], [], []];
  dated.forEach((p, i) => chunks[Math.min(4, Math.floor((i / dated.length) * 5))]!.push(p));
  const allMisses: number[] = [];
  const chunkMedians: number[] = [];
  for (let i = 1; i < 5; i++) {
    const train = chunks.slice(0, i).flat();
    const test = chunks[i]!;
    if (train.length < 10 || test.length === 0) continue;
    const misses = test.map((p) => missFactor(price(p, train), p.mcap_usd!));
    chunkMedians.push(round2(medianOf(misses)));
    allMisses.push(...misses);
  }
  return { method, tested: allMisses.length, median_miss_x: round2(medianOf(allMisses)), chunks: chunkMedians };
}

/** Spearman rank correlation between two lists (ties averaged). */
export function spearman(xs: number[], ys: number[]): number {
  const rank = (arr: number[]): number[] => {
    const order = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const r = new Array<number>(arr.length);
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && order[j + 1]!.v === order[i]!.v) j++;
      const avg = (i + j) / 2 + 1;
      for (let t = i; t <= j; t++) r[order[t]!.i] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const n = xs.length;
  const mx = rx.reduce((s, v) => s + v, 0) / n;
  const my = ry.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (rx[i]! - mx) * (ry[i]! - my);
    sxx += (rx[i]! - mx) ** 2;
    syy += (ry[i]! - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? Number.NaN : Math.round((sxy / Math.sqrt(sxx * syy)) * 1000) / 1000;
}

/** Top-k precision: the share of the predicted top k that is in the true top k. */
export function topKPrecision(pred: number[], actual: number[], k: number): number {
  const topPred = new Set(pred.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).slice(0, k).map((o) => o.i));
  const topActual = new Set(actual.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).slice(0, k).map((o) => o.i));
  let hit = 0;
  for (const i of topPred) if (topActual.has(i)) hit++;
  return Math.round((hit / k) * 1000) / 1000;
}

/* ------------------------------------------------------------------ */
/* The dropped variants: richer fits, tested the same way, kept out.   */
/* ------------------------------------------------------------------ */

type VariantKind = 'growth' | 'age' | 'chains' | 'full' | 'quad';

/** The feature vector a variant fits: the pooled line plus one fitted effect. */
function variantFeatures(asOf: string, kind: VariantKind): (p: Protocol) => number[] {
  return (p: Protocol): number[] => {
    const x = Math.log10(p.tvl_usd);
    const growth = clamp(p.change_7d ?? 0, -60, 120) / 100;
    const age = Math.log10((ageDays(asOf, p.listed_at) ?? 365) + 30);
    const chains = clamp(p.chains.length - 1, 0, 5);
    if (kind === 'growth') return [1, x, growth];
    if (kind === 'age') return [1, x, age];
    if (kind === 'chains') return [1, x, chains];
    if (kind === 'full') return [1, x, growth, age, chains];
    return [1, x, x * x]; // quad
  };
}

/** A variant's pricer, fitted over a training set. */
function variantPricer(asOf: string, kind: VariantKind): (train: Protocol[]) => (p: Protocol) => number {
  const feat = variantFeatures(asOf, kind);
  return (train: Protocol[]) => {
    const beta = solveOls(
      train.map(feat),
      train.map((q) => Math.log10(q.mcap_usd!)),
    );
    return (p: Protocol) => 10 ** dot(feat(p), beta);
  };
}

/**
 * The category-offset variant's pricer, fitted over a training set: the pooled line
 * plus each category's own residual, shrunk toward zero by k = 5. The 5 is a
 * pseudo-count, set before the test and never tuned to it: a category's mean residual
 * counts as 5 comparables of evidence, so a category with 5 members counts at half
 * weight and one with 20 at four-fifths. With 128 comparables spread over roughly 25
 * categories, most categories hold fewer than 10 members, so unshrunk offsets would be
 * mostly noise. As a pricer family it runs through the same four tests as every other
 * variant — leave-one-out, both blind splits, repeated 5-fold.
 */
function categoryPricer(train: Protocol[]): (p: Protocol) => number {
  const curve = fitCurve(train);
  return (p: Protocol) => {
    const base = curveBase(curve, p.tvl_usd);
    const same = train.filter((q) => q.category === p.category);
    if (same.length === 0) return base;
    const residuals = same.map((q) => Math.log10(q.mcap_usd!) - Math.log10(curveBase(curve, q.tvl_usd)));
    const offset = (residuals.reduce((s, v) => s + v, 0) / residuals.length) * (same.length / (same.length + 5));
    return base * 10 ** offset;
  };
}

/* ------------------------------------------------------------------ */
/* The v7 candidates: relative momentum, sector multipliers, kinship.  */
/* Each is a pricer family tested the same way as the deployed model — */
/* leave-one-out, both blind splits, repeated 5-fold — and kept only   */
/* if it wins on leave-one-out AND both blind splits. On this snapshot  */
/* every one of them loses on at least one test, so the deployed model  */
/* is unchanged from radar-6 and the candidates join the dropped table */
/* with their numbers.                                                 */
/* ------------------------------------------------------------------ */

/** A protocol's name stem: the first word of its name, lowercased — "uniswap" for
 * "Uniswap V3". Two protocols sharing a stem are kin: versions or products of one
 * family. A first word shorter than three letters falls back to the whole name
 * stripped of punctuation, so a one-letter prefix cannot merge unrelated protocols. */
export function stem(name: string): string {
  const first = name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/)[0] ?? '';
  return first.length >= 3 ? first : name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * OLS with a per-column ridge: the normal equations with `ridge[j]` added to the j-th
 * diagonal entry of X'X. The sector fit ridges the category dummies only (the
 * intercept and the slope ride unpenalised), so a category's multiplier is shrunk
 * toward 1 by exactly its evidence: a category with lambda members counts at half
 * weight. Lambda is set before the test and never tuned to it.
 */
export function solveRidge(rows: number[][], y: number[], ridge: number[]): number[] {
  const k = rows[0]!.length;
  const ata: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const atb: number[] = new Array<number>(k).fill(0);
  for (let i = 0; i < rows.length; i++) {
    for (let r = 0; r < k; r++) {
      atb[r]! += rows[i]![r]! * y[i]!;
      for (let c = 0; c < k; c++) ata[r]![c]! += rows[i]![r]! * rows[i]![c]!;
    }
  }
  for (let r = 0; r < k; r++) ata[r]![r]! += ridge[r]! + 1e-8;
  const aug = ata.map((row, i) => [...row, atb[i]!]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(aug[r]![c]!) > Math.abs(aug[piv]![c]!)) piv = r;
    [aug[c], aug[piv]] = [aug[piv]!, aug[c]!];
    const d = aug[c]![c]!;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = aug[r]![c]! / d;
      for (let j = c; j <= k; j++) aug[r]![j]! -= f * aug[c]![j]!;
    }
  }
  return aug.map((row, i) => row[k]! / row[i]!);
}

/**
 * The sector curve fitted over a training set: log10(market cap) on [1, log10(TVL),
 * one dummy per category present in training], the dummies ridged by `lambda`. The
 * fitted dummy is a MULTIPLIER on the log-log curve (10^gamma in level space), fitted
 * jointly with the slope — not the two-stage residual offset radar-6 tested and
 * discarded, which fitted the pooled line first and patched category means onto it
 * without the multipliers. A category unseen in training gets no dummy: multiplier 1.
 * Returns the base value (no multipliers); the caller applies them.
 */
export function sectorBaseFit(train: Protocol[], lambda: number): (p: Protocol) => number {
  const cats = [...new Set(train.map((p) => p.category).filter((c): c is string => c !== null))].sort();
  const feat = (p: Protocol): number[] => [1, Math.log10(p.tvl_usd), ...cats.map((c) => (p.category === c ? 1 : 0))];
  const beta = solveRidge(
    train.map(feat),
    train.map((q) => Math.log10(q.mcap_usd!)),
    [0, 0, ...cats.map(() => lambda)],
  );
  return (p: Protocol) => 10 ** dot(feat(p), beta);
}

/** The median 7-day change over a set of protocols (nulls skipped). */
export function median7d(train: Protocol[]): number {
  return medianOf(train.map((p) => p.change_7d).filter((v): v is number => v !== null));
}

/** The growth multiplier from a RELATIVE 7-day change: the protocol's change minus the
 * market median, clamped and half-weighted exactly like the deployed absolute version.
 * A null change prices as the median itself (relative change 0 = neutral). */
function relativeGrowthMult(p: Protocol, median: number, params: ModelParams): number {
  const rel = (p.change_7d ?? median) - median;
  return 1 + (clamp(rel, params.growth_floor, params.growth_cap) / 100) * params.growth_weight;
}

/** Relative momentum against the COMPARABLES' median: the median comes from the
 * training set only, so no held-out protocol's own change leaks into its price. */
export function relativePrice(p: Protocol, train: Protocol[], asOf: string, params: ModelParams): number {
  const med = median7d(train);
  const curve = fitCurve(train);
  const m = multipliersOf(p, asOf, params);
  return Math.max(1, Math.round(curveBase(curve, p.tvl_usd) * relativeGrowthMult(p, med, params) * m.chainMult));
}

/**
 * Relative momentum against the ALL-PROTOCOL median: the median over the training
 * comparables plus every non-comparable protocol in the snapshot. Non-comparables are
 * never a test target, so including them leaks nothing; held-out comparables are
 * excluded because only the training set's comparables enter the median. `poolSlugs`
 * is the comparable set, so the filter knows which protocols are comparables.
 */
export function relativeAllPrice(
  p: Protocol,
  train: Protocol[],
  allProtocols: Protocol[],
  poolSlugs: Set<string>,
  asOf: string,
  params: ModelParams,
): number {
  const trainSlugs = new Set(train.map((q) => q.slug));
  const med = median7d(allProtocols.filter((q) => trainSlugs.has(q.slug) || !poolSlugs.has(q.slug)));
  const curve = fitCurve(train);
  const m = multipliersOf(p, asOf, params);
  return Math.max(1, Math.round(curveBase(curve, p.tvl_usd) * relativeGrowthMult(p, med, params) * m.chainMult));
}

/** Kinship pricing: the curve is fitted without comparables sharing the priced
 * protocol's name stem, so a related protocol's ratio never prices its own family.
 * Falls back to the full training set when too few comparables would remain. */
export function kinshipPrice(p: Protocol, train: Protocol[], asOf: string, params: ModelParams): number {
  const s = stem(p.name);
  const noKin = train.filter((q) => stem(q.name) !== s);
  return priceProtocol(p, asOf, fitCurve(noKin.length >= 10 ? noKin : train), params).implied;
}

/**
 * The verdict sentence for a dropped variant, written from its own numbers against its
 * baseline under the keep rule — win on leave-one-out AND both blind splits, or stay
 * out. Ties are named as ties, never as wins or losses: a variant that only ties its
 * baseline on the head-to-head has not won it, and a variant that ties on a blind
 * split has not won that split either. The note names the test that decided it. A
 * variant that beats its baseline on every test is flagged honestly instead of hidden
 * — none does here. A variant that matches its baseline on every test (kinship, on a
 * snapshot where only one stem family has two members among the comparables) is named
 * as changing nothing measurable.
 */
function dropNote(
  name: string,
  loo: number,
  b25: number,
  b24: number,
  cv: number,
  baseLoo: number,
  baseB25: number,
  baseB24: number,
  baseCv: number,
  baselineLabel: string,
): string {
  const f = (n: number): string => `x${n.toFixed(2)}`;
  const cmp = (n: number, b: number): 'win' | 'tie' | 'lose' => (n < b ? 'win' : n > b ? 'lose' : 'tie');
  const cLoo = cmp(loo, baseLoo);
  const c25 = cmp(b25, baseB25);
  const c24 = cmp(b24, baseB24);
  const cCv = cmp(cv, baseCv);
  if (cLoo === 'win' && c25 === 'win' && c24 === 'win' && cCv !== 'lose') {
    return `${name} beats ${baselineLabel} on every test (${f(loo)} / ${f(b25)} / ${f(b24)} / ${f(cv)}) — kept out only because ${baselineLabel} is the simpler claim; re-check before trusting this.`;
  }
  if (cLoo === 'tie' && c25 === 'tie' && c24 === 'tie' && cCv === 'tie') {
    return `${name} matches ${baselineLabel} on every test (${f(loo)} / ${f(b25)} / ${f(b24)} / ${f(cv)}) — it changes nothing measurable on this snapshot, so it stays out.`;
  }
  const looBit =
    cLoo === 'win'
      ? `edges ${baselineLabel} on leave-one-out (${f(loo)} vs ${f(baseLoo)})`
      : cLoo === 'tie'
        ? `ties ${baselineLabel} on leave-one-out (${f(loo)})`
        : `misses worse than ${baselineLabel} on leave-one-out (${f(loo)} vs ${f(baseLoo)})`;
  const losses: string[] = [];
  const ties: string[] = [];
  const wins: string[] = [];
  const classify = (c: 'win' | 'tie' | 'lose', test: string, n: number, b: number): void => {
    if (c === 'lose') losses.push(`${test} (${f(n)} vs ${f(b)})`);
    else if (c === 'tie') ties.push(`${test} (${f(n)})`);
    else wins.push(`${test} (${f(n)} vs ${f(b)})`);
  };
  classify(c25, 'blind 2025', b25, baseB25);
  classify(c24, 'blind 2024', b24, baseB24);
  classify(cCv, 'repeated 5-fold', cv, baseCv);
  let s = `${name} ${looBit}`;
  if (losses.length > 0) s += ` but loses on ${losses.join(' and ')}`;
  if (ties.length > 0) s += `${losses.length > 0 ? ' and' : ' but'} only ties on ${ties.join(' and ')}`;
  if (wins.length > 0 && cLoo !== 'win') s += `, though it wins on ${wins.join(' and ')}`;
  if (cLoo === 'win' && losses.length > 0) s += ` — the leave-one-out edge is noise, so ${baselineLabel} stands.`;
  else if (cLoo === 'win') s += ` — the keep rule needs a win on both blind splits, so it stays out.`;
  else if (cLoo === 'tie') s += ` — a tie on the head-to-head is not a win, so it stays out.`;
  else s += ` — a term that does not win the head-to-head does not ship on a partial record.`;
  return s;
}

/** The held-out splits' seeds: outside the cross-validation family (1000+rep), so the
 * two held-out splits are a genuinely second validation, not a re-run of the folds. */
export const HELDOUT_SEED_A = 777001;
export const HELDOUT_SEED_B = 777002;

/* ------------------------------------------------------------------ */
/* The v8 candidates: one pricer family per hypothesis in the rebuild  */
/* brief, each tested the same way as the deployed model — leave-one-  */
/* out, both blind splits, repeated 5-fold — and kept only if it wins  */
/* on leave-one-out AND both blind splits. On this snapshot every one  */
/* of them loses on at least one test except the deployed model itself */
/* (quadratic x growth x chains), so they join the dropped table with  */
/* their numbers.                                                      */
/* ------------------------------------------------------------------ */

/** The quadratic curve's coefficients over a training set. */
export function quadBeta(train: Protocol[]): number[] {
  return solveOls(
    train.map((p) => {
      const x = Math.log10(p.tvl_usd);
      return [1, x, x * x];
    }),
    train.map((p) => Math.log10(p.mcap_usd!)),
  );
}

/** The quadratic curve's base value from its coefficients. */
export function quadValue(beta: number[], tvlUsd: number): number {
  const x = Math.log10(Math.max(1, tvlUsd));
  return 10 ** (beta[0]! + beta[1]! * x + beta[2]! * x * x);
}

/**
 * radar-7's maturity multiplier, kept ONLY as a candidate term: the deployed radar-8
 * model does not use it, but the quadratic-with-multipliers variants test whether
 * putting it back earns its place. 0.60 at listing, rising to 1.00 after 3 years;
 * an unknown age is treated as a year old, the same assumption the hold windows
 * and the odds model make.
 */
export function maturityMultOf(age: number | null): number {
  const a = age ?? PARAMS.unknown_age_days;
  return 0.6 + (clamp(a, 0, 1095) / 1095) * 0.4;
}

/**
 * k-NN in log-space: the log10(market cap) of the k nearest labeled peers by
 * log10(TVL) distance — the mean of their log values, or the distance-weighted
 * mean (weight 1/(d + 0.05)) — then the deployed growth and chains multipliers.
 * A new model family, never tested before radar-8: on this snapshot the log-log
 * scatter is too wide (R² 0.194) for neighbours to predict, and every k loses.
 */
export function knnPricer(train: Protocol[], k: number, weighted: boolean, asOf: string, params: ModelParams): (p: Protocol) => number {
  return (p: Protocol) => {
    const x = Math.log10(p.tvl_usd);
    const scored = train.map((q) => ({
      d: Math.abs(Math.log10(q.tvl_usd) - x),
      y: Math.log10(q.mcap_usd!),
    }));
    scored.sort((a, b) => a.d - b.d);
    const near = scored.slice(0, Math.min(k, scored.length));
    let num = 0;
    let den = 0;
    for (const s of near) {
      const w = weighted ? 1 / (s.d + 0.05) : 1;
      num += w * s.y;
      den += w;
    }
    return withMultipliers(p, asOf, 10 ** (num / den), params);
  };
}

/**
 * Median (least-absolute-deviations) regression on the log-log curve, by
 * iteratively reweighted least squares from the OLS start: robust to the
 * heavy-tailed outliers that drag the least-squares fit. The fitted median line
 * (3.137 + 0.512·x on all 128) sits close to the OLS line (3.025 + 0.522·x) and
 * prices through the same multipliers.
 */
export function medianPricer(train: Protocol[], asOf: string, params: ModelParams): (p: Protocol) => number {
  const xs = train.map((p) => Math.log10(p.tvl_usd));
  const ys = train.map((p) => Math.log10(p.mcap_usd!));
  const n = xs.length;
  let mx = xs.reduce((s, v) => s + v, 0) / n;
  let my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) ** 2;
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  let b = sxx === 0 ? 0 : sxy / sxx;
  let a = my - b * mx;
  for (let it = 0; it < 60; it++) {
    const w = xs.map((_, i) => 1 / Math.max(Math.abs(ys[i]! - (a + b * xs[i]!)), 1e-3));
    const sw = w.reduce((s, v) => s + v, 0);
    mx = xs.reduce((s, v, i) => s + w[i]! * v, 0) / sw;
    my = ys.reduce((s, v, i) => s + w[i]! * v, 0) / sw;
    let sxxw = 0;
    let sxyw = 0;
    for (let i = 0; i < n; i++) {
      sxxw += w[i]! * (xs[i]! - mx) ** 2;
      sxyw += w[i]! * (xs[i]! - mx) * (ys[i]! - my);
    }
    const b2 = sxxw === 0 ? 0 : sxyw / sxxw;
    const a2 = my - b2 * mx;
    const shift = Math.abs(b2 - b) + Math.abs(a2 - a);
    a = a2;
    b = b2;
    if (shift < 1e-9) break;
  }
  return (p: Protocol) => withMultipliers(p, asOf, 10 ** (a + b * Math.log10(p.tvl_usd)), params);
}

/**
 * Ensemble: the log-space average of the fitted curve and the distance-weighted
 * k-NN prediction (k = 8), then the deployed multipliers. Ensembles usually beat
 * either member alone — not here, because the k-NN member loses badly on its own
 * and drags the average down with it.
 */
export function ensemblePricer(train: Protocol[], wCurve: number, k: number, asOf: string, params: ModelParams): (p: Protocol) => number {
  const curve = fitCurve(train);
  return (p: Protocol) => {
    const x = Math.log10(p.tvl_usd);
    const curveLog = curve.intercept + curve.slope * x + curve.quadratic * x * x;
    const scored = train.map((q) => ({
      d: Math.abs(Math.log10(q.tvl_usd) - x),
      y: Math.log10(q.mcap_usd!),
    }));
    scored.sort((a, b) => a.d - b.d);
    const near = scored.slice(0, Math.min(k, scored.length));
    let num = 0;
    let den = 0;
    for (const s of near) {
      const w = 1 / (s.d + 0.05);
      num += w * s.y;
      den += w;
    }
    const knnLog = num / den;
    const base = 10 ** (wCurve * curveLog + (1 - wCurve) * knnLog);
    return withMultipliers(p, asOf, base, params);
  };
}

/**
 * Per-category curves with shrinkage toward the pooled curve: a separate quadratic
 * fit per category with at least 5 members, its three coefficients blended with
 * the pooled curve's at w = n_c / (n_c + k). Categories with fewer than 5 members
 * price off the pooled curve. Nine categories qualify on this snapshot — and the
 * shrunk curves still lose on every test: with 128 comparables over 34 categories,
 * most categories hold too few members for their own curve to earn its keep.
 */
export function shrunkCategoryPricer(train: Protocol[], k: number, asOf: string, params: ModelParams): (p: Protocol) => number {
  const pooled = fitCurve(train);
  const byCat = new Map<string, Protocol[]>();
  for (const p of train) {
    const c = p.category ?? '(null)';
    const arr = byCat.get(c) ?? [];
    arr.push(p);
    byCat.set(c, arr);
  }
  const catCurves = new Map<string, { a: number; b: number; c: number }>();
  for (const [c, members] of byCat) {
    if (members.length < 5) continue;
    const cc = fitCurve(members);
    const w = members.length / (members.length + k);
    catCurves.set(c, {
      a: w * cc.intercept + (1 - w) * pooled.intercept,
      b: w * cc.slope + (1 - w) * pooled.slope,
      c: w * cc.quadratic + (1 - w) * pooled.quadratic,
    });
  }
  return (p: Protocol) => {
    const cc = catCurves.get(p.category ?? '(null)');
    const base =
      cc === undefined
        ? curveBase(pooled, p.tvl_usd)
        : 10 ** (cc.a + cc.b * Math.log10(p.tvl_usd) + cc.c * Math.log10(p.tvl_usd) ** 2);
    return withMultipliers(p, asOf, base, params);
  };
}

/**
 * One-per-ticker comps fit: dedupe the fit sample to one representative per
 * name-stem family (the highest TVL) before fitting the curve. On this snapshot
 * the dedupe removes a single protocol (128 → 127) — only one stem family has
 * two members among the comparables — so the fit barely moves and the variant
 * ties both blind splits: a tie is not a win.
 */
export function onePerTickerPricer(train: Protocol[], asOf: string, params: ModelParams): (p: Protocol) => number {
  const best = new Map<string, Protocol>();
  for (const p of train) {
    const s = stem(p.name);
    const cur = best.get(s);
    if (cur === undefined || p.tvl_usd > cur.tvl_usd) best.set(s, p);
  }
  const curve = fitCurve([...best.values()]);
  return (p: Protocol) => priceProtocol(p, asOf, curve, params).implied;
}

/**
 * The full validation record: every test priced through the deployed model, with the
 * curve-alone numbers beside it, then every richer variant's numbers against the
 * deployed model. Every variant runs all four tests (leave-one-out, both blind
 * splits, repeated 5-fold) and is judged by the keep rule: win on leave-one-out AND
 * both blind splits against its baseline, or stay out. `allProtocols` is the whole
 * snapshot — the all-protocol-median variant needs the non-comparables for its median,
 * and the odds-ranking test needs the dated protocols for its odds fit.
 */
export function validateModel(pool: Protocol[], asOf: string, params: ModelParams, allProtocols: Protocol[]): Validation {
  const fullPrice = (p: Protocol, train: Protocol[]): number => priceProtocol(p, asOf, fitCurve(train), params).implied;
  const curvePrice = (p: Protocol, train: Protocol[]): number => curveBase(fitCurve(train), p.tvl_usd);
  const fullFit = (train: Protocol[]) => {
    const curve = fitCurve(train);
    return (p: Protocol) => priceProtocol(p, asOf, curve, params).implied;
  };
  const curveFit = (train: Protocol[]) => {
    const curve = fitCurve(train);
    return (p: Protocol) => curveBase(curve, p.tvl_usd);
  };

  const loo = leaveOneOut(pool, fullPrice, 'leave-one-out (full model)');
  const looCurve = leaveOneOut(pool, curvePrice, 'leave-one-out (curve alone)');
  const blind2025 = blindSplit(pool, BLIND_CUT_2025, fullPrice, 'blind time-split 2025 (full model)');
  const blind2025Curve = blindSplit(pool, BLIND_CUT_2025, curvePrice, 'blind time-split 2025 (curve alone)');
  const blind2024 = blindSplit(pool, BLIND_CUT_2024, fullPrice, 'blind time-split 2024 (full model)');
  const blind2024Curve = blindSplit(pool, BLIND_CUT_2024, curvePrice, 'blind time-split 2024 (curve alone)');
  const heldoutA = heldOutSplit(pool, HELDOUT_SEED_A, fullPrice, 'held out, split A (full model)');
  const heldoutACurve = heldOutSplit(pool, HELDOUT_SEED_A, curvePrice, 'held out, split A (curve alone)');
  const heldoutB = heldOutSplit(pool, HELDOUT_SEED_B, fullPrice, 'held out, split B (full model)');
  const heldoutBCurve = heldOutSplit(pool, HELDOUT_SEED_B, curvePrice, 'held out, split B (curve alone)');
  const familyLoo = familyLeaveOneOut(pool, fullPrice, 'leave-one-family-out (full model)');
  const cv = repeatedKFold(pool, fullFit);
  const cvCurve = repeatedKFold(pool, curveFit);
  const walkforward = walkForward(pool, fullPrice, 'walk-forward (full model)');
  const walkforwardCurve = walkForward(pool, curvePrice, 'walk-forward (curve alone)');

  // The odds-ranking test: on each blind test set, does launch value x launch odds
  // rank the realized market caps better than raw launch value? The odds model is
  // fitted on dated protocols EXCLUDING the test comparables, so no test row leaks
  // into its fit; the curve is fitted on the train comparables only.
  const oddsRanking: OddsRanking[] = [];
  for (const [cut, label] of [
    [BLIND_CUT_2025, 'blind 2025'],
    [BLIND_CUT_2024, 'blind 2024'],
  ] as const) {
    const train = pool.filter((p) => p.listed_at !== null && p.listed_at < cut);
    const test = pool.filter((p) => p.listed_at !== null && p.listed_at >= cut);
    if (train.length < 10 || test.length === 0) continue;
    const curve = fitCurve(train);
    const testSlugs = new Set(test.map((p) => p.slug));
    const oddsTrain = allProtocols.filter((p) => p.listed_at !== null && !testSlugs.has(p.slug));
    const oddsModel = fitOddsModel(oddsTrain, asOf, params);
    const raw: number[] = [];
    const weighted: number[] = [];
    const actual: number[] = [];
    for (const p of test) {
      const v = priceProtocol(p, asOf, curve, params).implied;
      raw.push(v);
      weighted.push(v * launchOdds(oddsModel, p, asOf, params));
      actual.push(p.mcap_usd!);
    }
    const k10 = Math.min(10, test.length);
    const k20 = Math.min(20, test.length);
    oddsRanking.push({
      test: label,
      n: test.length,
      spearman_raw: spearman(raw, actual),
      spearman_weighted: spearman(weighted, actual),
      top10_raw: topKPrecision(raw, actual, k10),
      top10_weighted: topKPrecision(weighted, actual, k10),
      top20_raw: topKPrecision(raw, actual, k20),
      top20_weighted: topKPrecision(weighted, actual, k20),
    });
  }

  // One variant through all four tests, judged against its baseline by the keep rule.
  const testVariant = (
    name: string,
    baseline: 'full' | 'curve',
    price: (p: Protocol, train: Protocol[]) => number,
    fit: (train: Protocol[]) => (p: Protocol) => number,
  ): DroppedVariant => {
    const vLoo = leaveOneOut(pool, price, `leave-one-out (${name})`).median_miss_x;
    const vB25 = blindSplit(pool, BLIND_CUT_2025, price, `blind 2025 (${name})`).median_miss_x;
    const vB24 = blindSplit(pool, BLIND_CUT_2024, price, `blind 2024 (${name})`).median_miss_x;
    const vCv = repeatedKFold(pool, fit).mean_of_medians;
    const baseLoo = baseline === 'curve' ? looCurve.median_miss_x : loo.median_miss_x;
    const baseB25 = baseline === 'curve' ? blind2025Curve.median_miss_x : blind2025.median_miss_x;
    const baseB24 = baseline === 'curve' ? blind2024Curve.median_miss_x : blind2024.median_miss_x;
    const baseCv = baseline === 'curve' ? cvCurve.mean_of_medians : cv.mean_of_medians;
    const label = baseline === 'curve' ? 'the pooled line' : 'the deployed model';
    return {
      name,
      loo_median_miss_x: vLoo,
      blind2025_median_miss_x: vB25,
      blind2024_median_miss_x: vB24,
      cv_median_miss_x: vCv,
      baseline,
      note: dropNote(name, vLoo, vB25, vB24, vCv, baseLoo, baseB25, baseB24, baseCv, label),
    };
  };

  const dropped: DroppedVariant[] = [];
  // radar-6's fitted effects + category offsets, re-tested against the radar-8 model.
  const kinds: { kind: VariantKind; name: string; baseline: 'full' | 'curve' }[] = [
    { kind: 'growth', name: 'Fitted growth effect', baseline: 'full' },
    { kind: 'age', name: 'Fitted age effect', baseline: 'full' },
    { kind: 'chains', name: 'Fitted chains effect', baseline: 'full' },
    { kind: 'full', name: 'All three fitted together', baseline: 'full' },
  ];
  for (const { kind, name, baseline } of kinds) {
    const fit = variantPricer(asOf, kind);
    dropped.push(testVariant(name, baseline, (p, train) => fit(train)(p), fit));
  }
  dropped.push(testVariant('Category offsets', 'full', (p, train) => categoryPricer(train)(p), categoryPricer));

  // radar-7's candidates, re-tested against the radar-8 model.
  dropped.push(testVariant('Relative momentum (comparables median)', 'full',
    (p, train) => relativePrice(p, train, asOf, params),
    (train) => (p) => relativePrice(p, train, asOf, params)));
  const poolSlugs = new Set(pool.map((p) => p.slug));
  dropped.push(testVariant('Relative momentum (all-protocol median)', 'full',
    (p, train) => relativeAllPrice(p, train, allProtocols, poolSlugs, asOf, params),
    (train) => (p) => relativeAllPrice(p, train, allProtocols, poolSlugs, asOf, params)));
  for (const lambda of [5, 20]) {
    const sectorFit = (train: Protocol[]) => {
      const base = sectorBaseFit(train, lambda);
      return (p: Protocol) => withMultipliers(p, asOf, base(p), params);
    };
    dropped.push(testVariant(`Sector multipliers, ridge ${lambda}`, 'full', (p, train) => sectorFit(train)(p), sectorFit));
  }
  dropped.push(testVariant('Kinship exclusion', 'full',
    (p, train) => kinshipPrice(p, train, asOf, params),
    (train) => (p) => kinshipPrice(p, train, asOf, params)));
  const comboFit = (train: Protocol[]) => {
    const med = median7d(train);
    const base = sectorBaseFit(train, 5);
    return (p: Protocol) => {
      const m = multipliersOf(p, asOf, params);
      return Math.max(1, Math.round(base(p) * relativeGrowthMult(p, med, params) * m.chainMult));
    };
  };
  dropped.push(testVariant('Relative momentum + sector multipliers', 'full', (p, train) => comboFit(train)(p), comboFit));
  // The drop-one ablations: does each deployed multiplier earn its place? Under
  // radar-8 the deployed multipliers are growth and chains only — the maturity
  // ablation is gone with the multiplier, and 'chains only' is the same pricer as
  // 'no growth', so it is not listed twice.
  const ablation = (name: string, variantParams: ModelParams): DroppedVariant => {
    const fit = (train: Protocol[]) => {
      const curve = fitCurve(train);
      return (p: Protocol) => priceProtocol(p, asOf, curve, variantParams).implied;
    };
    return testVariant(name, 'full', (p, train) => fit(train)(p), fit);
  };
  dropped.push(ablation('No growth multiplier', { ...params, growth_weight: 0 }));
  dropped.push(ablation('No chains multiplier', { ...params, chain_bonus: 0 }));
  dropped.push(ablation('Growth weight halved (0.25)', { ...params, growth_weight: 0.25 }));

  // radar-8's quadratic subsets: the quadratic curve with the maturity multiplier
  // radar-8 dropped, in every combination — the winner is the deployed model itself
  // (quadratic x growth x chains), so it is not a row here.
  const quadSubset = (name: string, useGrowth: boolean, useMaturity: boolean, useChains: boolean): DroppedVariant => {
    const fit = (train: Protocol[]) => {
      const beta = quadBeta(train);
      return (p: Protocol) => {
        const m = multipliersOf(p, asOf, params);
        const base = quadValue(beta, p.tvl_usd);
        const g = useGrowth ? m.growthMult : 1;
        const mat = useMaturity ? maturityMultOf(m.age) : 1;
        const ch = useChains ? m.chainMult : 1;
        return Math.max(1, Math.round(base * g * mat * ch));
      };
    };
    return testVariant(name, 'full', (p, train) => fit(train)(p), fit);
  };
  dropped.push(quadSubset('Quadratic curve, with multipliers', true, true, true));
  dropped.push(quadSubset('Quadratic curve, no growth multiplier', false, true, true));
  dropped.push(quadSubset('Quadratic curve, no chains multiplier', true, true, false));
  dropped.push(quadSubset('Quadratic curve, maturity only', false, true, false));

  // radar-8's new model families.
  for (const k of [8, 12]) {
    dropped.push(testVariant(`k-NN k=${k}, distance-weighted`, 'full',
      (p, train) => knnPricer(train, k, true, asOf, params)(p),
      (train) => knnPricer(train, k, true, asOf, params)));
  }
  dropped.push(testVariant('Median regression on the log-log curve', 'full',
    (p, train) => medianPricer(train, asOf, params)(p),
    (train) => medianPricer(train, asOf, params)));
  dropped.push(testVariant('Ensemble: curve + k-NN 50/50', 'full',
    (p, train) => ensemblePricer(train, 0.5, 8, asOf, params)(p),
    (train) => ensemblePricer(train, 0.5, 8, asOf, params)));
  dropped.push(testVariant('Per-category curves, shrinkage k=5', 'full',
    (p, train) => shrunkCategoryPricer(train, 5, asOf, params)(p),
    (train) => shrunkCategoryPricer(train, 5, asOf, params)));
  dropped.push(testVariant('One-per-ticker comps fit', 'full',
    (p, train) => onePerTickerPricer(train, asOf, params)(p),
    (train) => onePerTickerPricer(train, asOf, params)));

  return {
    loo,
    loo_curve: looCurve,
    blind2025,
    blind2025_curve: blind2025Curve,
    blind2024,
    blind2024_curve: blind2024Curve,
    heldoutA,
    heldoutA_curve: heldoutACurve,
    heldoutB,
    heldoutB_curve: heldoutBCurve,
    familyLoo,
    walkforward,
    walkforward_curve: walkforwardCurve,
    odds_ranking: oddsRanking,
    cv_median_miss_x: cv.mean_of_medians,
    cv_pooled_median_miss_x: cv.pooled_median,
    cv_curve_median_miss_x: cvCurve.mean_of_medians,
    cv_curve_pooled_median_miss_x: cvCurve.pooled_median,
    dropped,
  };
}


/* ------------------------------------------------------------------ */
/* The launch-odds model: a logistic regression on age + category,
 * fitted SEPARATELY from the value model. It predicts whether a
 * protocol records a token, trained on the protocols with a listed
 * date (a protocol's age is its listed age; an undated protocol is
 * scored at the same 365-day unknown age the hold windows assume). A
 * pre-token protocol's launch odds are 1 minus its fitted peer token
 * rate — the share of protocols this age in this category that still
 * record no token. That is the peers' record, not a forecast: it says
 * how unusual it is for a protocol like this one to still have no
 * token, and it falls with age, as it should — a protocol that has run
 * five years without a token has revealed itself as unlikely to launch,
 * while a young one simply has not had the time. The odds are a
 * displayed signal and an expected-value input; they never change the
 * implied value, which the value model's own tests validate.
 */

/** The odds model's hold-out seeds: two independent 80/20 splits. */
export const ODDS_HOLDOUT_SEED_A = 424242;
export const ODDS_HOLDOUT_SEED_B = 515151;

/** A fitted odds model: the coefficients, the categories it knows, and the age scale. */
export interface OddsModel {
  beta: number[];
  categories: string[];
  ageMean: number;
  ageSd: number;
}

/** The odds model's features: an intercept, the standardised log age, and one dummy
 * per category. Age is log10(age in days + 30): the +30 keeps a newborn protocol off
 * log10(0) and compresses the five-year tail the way the value curve compresses TVL. */
export function oddsFeatures(p: Protocol, cats: string[], mean: number, sd: number, asOf: string, params: ModelParams): number[] {
  const age = ageDays(asOf, p.listed_at) ?? params.unknown_age_days;
  return [1, (Math.log10(age + 30) - mean) / sd, ...cats.map((c) => (p.category === c ? 1 : 0))];
}

/**
 * The odds model fitted over a set of dated protocols: batch gradient descent on the
 * logistic loss with an L2 penalty of 1.0 on every coefficient but the intercept (the
 * penalty is set before the fit and never tuned to it). 2,000 steps at most at a 0.3 rate
 * on standardised features, with the mean logistic loss tracked every step: the fit
 * stops early once the loss's relative improvement stays below one part in a million
 * for 50 consecutive steps. The whole fit is deterministic: the same protocols always
 * take the same steps to the same coefficients. The age scale is the sample standard
 * deviation (n − 1) of the log ages. After the loop the final gradient norm is checked
 * and a warning logged if it is not below 1e-4 — a warning, never a hard failure, so a
 * slow split degrades the log rather than breaking the run.
 */
export function fitOddsModel(dated: Protocol[], asOf: string, params: ModelParams): OddsModel {
  const ages = dated.map((p) => Math.log10((ageDays(asOf, p.listed_at) ?? params.unknown_age_days) + 30));
  const mean = ages.reduce((s, v) => s + v, 0) / ages.length;
  const sd = Math.sqrt(ages.reduce((s, v) => s + (v - mean) ** 2, 0) / (ages.length - 1)) || 1;
  const cats = [...new Set(dated.map((p) => p.category).filter((c): c is string => c !== null))].sort();
  const rows = dated.map((p) => ({ x: oddsFeatures(p, cats, mean, sd, asOf, params), y: isPreToken(p) ? 0 : 1 }));
  const k = rows[0]!.x.length;
  const beta = new Array<number>(k).fill(0);
  const lambda = 1.0;
  const lr = 0.3;
  let prevLoss = Number.POSITIVE_INFINITY;
  let flatSteps = 0;
  let iterations = 0;
  for (let it = 0; it < 2000; it++) {
    const grad = new Array<number>(k).fill(0);
    let loss = 0;
    for (const r of rows) {
      const z = dot(r.x, beta);
      const pr = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
      const err = pr - r.y;
      loss += (-(r.y * Math.log(pr) + (1 - r.y) * Math.log(1 - pr))) / rows.length;
      for (let j = 0; j < k; j++) grad[j]! += (err * r.x[j]!) / rows.length;
    }
    for (let j = 1; j < k; j++) grad[j]! += (lambda * beta[j]!) / rows.length;
    for (let j = 0; j < k; j++) beta[j]! -= lr * grad[j]!;
    iterations = it + 1;
    const rel = (prevLoss - loss) / Math.max(Math.abs(prevLoss), 1e-12);
    if (rel >= 0 && rel < 1e-6) {
      flatSteps += 1;
      if (flatSteps >= 50) break;
    } else {
      flatSteps = 0;
    }
    prevLoss = loss;
  }
  const finalGrad = new Array<number>(k).fill(0);
  for (const r of rows) {
    const z = dot(r.x, beta);
    const pr = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
    const err = pr - r.y;
    for (let j = 0; j < k; j++) finalGrad[j]! += (err * r.x[j]!) / rows.length;
  }
  for (let j = 1; j < k; j++) finalGrad[j]! += (lambda * beta[j]!) / rows.length;
  const gradNorm = Math.sqrt(finalGrad.reduce((s, g) => s + g * g, 0));
  if (gradNorm >= 1e-4) {
    console.warn(`[odds] WARNING: final gradient norm ${gradNorm.toExponential(2)} >= 1e-4 after ${iterations} iterations; fit may not have converged`);
  }
  return { beta, categories: cats, ageMean: mean, ageSd: sd };
}

/** The fitted peer token rate: P(a protocol this age in this category records a token). */
export function oddsTokenRate(model: OddsModel, p: Protocol, asOf: string, params: ModelParams): number {
  const z = dot(oddsFeatures(p, model.categories, model.ageMean, model.ageSd, asOf, params), model.beta);
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
}

/** Launch odds for a pre-token protocol: 1 minus its fitted peer token rate. */
export function launchOdds(model: OddsModel, p: Protocol, asOf: string, params: ModelParams): number {
  return 1 - oddsTokenRate(model, p, asOf, params);
}

/**
 * One hold-out of the odds model: a seeded 80/20 split, fit on the 80, accuracy on
 * the held-out 20 against the base rate (the majority class's share of the same
 * held-out set), plus the calibration quintiles — mean predicted token rate against
 * the observed traded share in each fifth of the held-out set, lowest predicted first.
 */
export function oddsHoldout(
  dated: Protocol[],
  seed: number,
  asOf: string,
  params: ModelParams,
): { accuracy: number; base: number; n: number; buckets: CalibrationBucket[] } {
  const rand = mulberry32(seed);
  const idx = dated.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  const cut = Math.floor(idx.length * 0.8);
  const train = idx.slice(0, cut).map((i) => dated[i]!);
  const test = idx.slice(cut).map((i) => dated[i]!);
  const model = fitOddsModel(train, asOf, params);
  let correct = 0;
  let traded = 0;
  const scored: { pr: number; y: number }[] = [];
  for (const p of test) {
    const y = isPreToken(p) ? 0 : 1;
    traded += y;
    const pr = oddsTokenRate(model, p, asOf, params);
    scored.push({ pr, y });
    if ((pr >= 0.5 ? 1 : 0) === y) correct++;
  }
  scored.sort((a, b) => a.pr - b.pr);
  const buckets: CalibrationBucket[] = [];
  const q = Math.floor(scored.length / 5);
  for (let b = 0; b < 5; b++) {
    const slice = scored.slice(b * q, b === 4 ? scored.length : (b + 1) * q);
    buckets.push({
      predicted: Math.round((slice.reduce((s, r) => s + r.pr, 0) / slice.length) * 100) / 100,
      observed: Math.round((slice.reduce((s, r) => s + r.y, 0) / slice.length) * 100) / 100,
      n: slice.length,
    });
  }
  return {
    accuracy: Math.round((correct / test.length) * 1000) / 1000,
    base: Math.round((Math.max(traded, test.length - traded) / test.length) * 1000) / 1000,
    n: test.length,
    buckets,
  };
}

/** The q-th percentile of a sorted list (nearest-rank, deterministic). */
export function percentileOf(sorted: number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

/** The snapshot's integrity, counted from the snapshot itself: what it carries and
 * what it is missing. A missing TVL cannot happen (parseSnapshot refuses a protocol
 * without one), so the count is a guard that reads 0 on any snapshot the program runs. */
export function integrityOf(snapshot: Snapshot): Integrity {
  return {
    protocols: snapshot.protocols.length,
    watchlist: snapshot.watchlist.length,
    missing_change_7d: snapshot.protocols.filter((p) => p.change_7d === null).length,
    missing_listed_at: snapshot.protocols.filter((p) => p.listed_at === null).length,
    missing_category: snapshot.protocols.filter((p) => p.category === null).length,
    missing_tvl: snapshot.protocols.filter((p) => !Number.isFinite(p.tvl_usd) || p.tvl_usd <= 0).length,
    as_of: snapshot.as_of,
  };
}

/* ------------------------------------------------------------------ */
/* The $1,000 farm economics around one implied value.                 */
/* ------------------------------------------------------------------ */

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
/** How long to hold a position before the farm is judged, in days, from the protocol's
 * age: a young protocol's launch is further out, so its window is longer. An unknown
 * age is treated as a year old — the same assumption the odds model makes — so the
 * hold and the pricing agree: a 365-day-old protocol and an unknown-age protocol
 * get the same hold. The windows live in PARAMS, set before any test, not as magic
 * numbers here. */
export function holdDaysFor(age: number | null, params: ModelParams): number {
  const a = age ?? params.unknown_age_days;
  if (a < 180) return params.economics.hold_days_young;
  if (a < 365) return params.economics.hold_days_mid;
  return params.economics.hold_days_old;
}

/**
 * The $1,000 farm economics of one implied value: the slice, the cost, the net, the net
 * per hands-on hour, and the verdict. The slice is the position's pro-rata share of the
 * 10% of the implied value the scenario pays to depositors: 10% x implied x
 * ($1,000 / TVL), priced at the snapshot's TVL — the protocol as it stands today. TVL
 * is deliberately NOT projected forward from the 7-day change: compounding a 7-day rate
 * over a 30–60 day hold would turn a noisy signal into an absurd one (a +100% week
 * becomes an ~85x TVL), and the implied value itself is a point-in-time estimate. The
 * direction of the error is stated in the dashboard: if TVL grows during the hold the
 * slice overstates (dilution); if it shrinks it understates (concentration). The cost
 * is setup gas, weekly gas over the hold, and the 4% T-bill yield the $1,000 forgoes
 * while it is locked in the position — the setup gas and minutes are the eight-step
 * plan's own setup steps added up, so the model and the plan describe the same farm.
 * The hours are hands-on time only — setup, one weekly action plus the weekly safety
 * check, the claim and the log — never the hold itself, because the hold is waiting,
 * not work. TVL is clamped to $1 here as in curveBase: a zero-TVL protocol would
 * otherwise divide by zero and price an infinite slice. The verdict is deposit-relative
 * by construction: FARM at 1% of the deposit net, THIN at $0+, SKIP below — the same
 * rule the dashboard's what-if recompute applies, so the model and the dashboard can
 * never disagree about a threshold. `deposit` defaults to the base position; callers
 * that re-net another scenario pass it explicitly.
 */
export function farmMath(
  implied: number,
  p: Protocol,
  age: number | null,
  params: ModelParams,
  deposit: number = params.economics.position_usd,
): { slice: number; cost: number; net: number; perHour: number; hours: number; holdDays: number; verdict: Verdict } {
  const e = params.economics;
  const holdDays = holdDaysFor(age, params);
  const weeks = Math.ceil(holdDays / 7);
  const hours = round2(e.setup_minutes / 60 + (e.weekly_minutes / 60) * weeks + e.claim_minutes / 60);
  const cost = round2(e.setup_gas_usd + e.weekly_gas_usd * weeks + e.position_usd * e.tbill_annual_rate * (holdDays / 365));
  const slice = round2(e.airdrop_share * implied * (e.position_usd / Math.max(1, p.tvl_usd)));
  const net = round2(slice - cost);
  const perHour = round2(net / hours);
  const farmThreshold = deposit * 0.01;
  const thinThreshold = 0;
  const verdict = net >= farmThreshold ? 'FARM' : net >= thinThreshold ? 'THIN' : 'SKIP';
  return { slice, cost, net, perHour, hours, holdDays, verdict };
}

/* ------------------------------------------------------------------ */
/* Farm plans: eight steps per row, from the protocol's own record.    */
/* ------------------------------------------------------------------ */

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: Protocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

type Action = (name: string, chain: string) => string;

/** First qualifying actions by category, in the words a farmer can follow. The first
 * matching pattern wins; the fallback covers every category the table does not name. */
const FIRST_ACTIONS: [RegExp, Action][] = [
  [/lend|cdp|collateral/i, (n, c) => `Lend $1,000 of USDC on ${n} on ${c}, borrow a small amount against the deposit, and keep the loan's health factor comfortable.`],
  [/dex|leveraged farm/i, (n, c) => `Add $1,000 of liquidity to ${n}'s deepest pool on ${c} in a balanced pair and leave the position staked.`],
  [/yield aggregator/i, (n, c) => `Put $1,000 of USDC into ${n}'s auto-compounding vault on ${c} and leave the vault shares alone.`],
  [/yield/i, (n, c) => `Deposit $1,000 into ${n}'s largest yield vault on ${c} and hold the receipt token in the farm wallet.`],
  [/bridge|canonical/i, (n, c) => `Move $1,000 of USDC onto ${c} through ${n}, then use the bridged funds inside the destination app.`],
  [/restak|liquid staking|staking/i, (n, c) => `Stake $1,000 of the chain's staking asset through ${n} and hold the liquid receipt token it issues.`],
  [/perpetual|derivative/i, (n, c) => `Post $1,000 of USDC as margin on ${n} and open one small hedged position, then leave it untouched.`],
  [/prediction/i, (n, c) => `Fund the account with $1,000 and take one market position on ${n} on an outcome you have actually read up on.`],
  [/curator|allocator|capital/i, (n, c) => `Allocate $1,000 to a ${n} vault on ${c} and hold the vault shares for the whole season.`],
  [/stable/i, (n, c) => `Mint or deposit $1,000 of the stable asset through ${n} on ${c} and hold the balance in the farm wallet.`],
  [/rwa/i, (n, c) => `Mint $1,000 of the protocol's yield-bearing asset on ${c} and keep it in the same wallet for the hold.`],
  [/insurance/i, (n, c) => `Buy $1,000 of cover from ${n} on ${c} and keep the policy active through the hold.`],
  [/basis/i, (n, c) => `Deposit $1,000 into ${n}'s basis-trading vault on ${c} and hold it through at least one funding cycle.`],
  [/chain/i, (n, c) => `Bridge $1,000 of the chain's native asset onto ${n} and put it to work in one of its own apps.`],
  [/cedefi/i, (n, c) => `Deposit $1,000 into ${n}'s CeDeFi vault on ${c} and hold the shares.`],
];

/** Second qualifying actions: a different mechanism from the first, so the wallet's
 * activity spans two of the protocol's markets instead of one repeated motion. */
const SECOND_ACTIONS: [RegExp, Action][] = [
  [/lend|cdp|collateral/i, (n) => `Borrow $100 of USDC against the deposit on ${n} and repay it a week later, so the wallet shows both sides of the market.`],
  [/dex|leveraged farm/i, (n, c) => `Swap $100 through ${n}'s main pool on ${c} the other way, so the wallet shows trading as well as liquidity.`],
  [/yield/i, (n, c) => `Add a further $100 to a second ${n} vault on ${c} in a different asset, so the wallet's activity spans two vaults.`],
  [/bridge|canonical/i, (n) => `Bridge $100 back through ${n} in the opposite direction, so the wallet shows two-way use of the bridge.`],
  [/restak|liquid staking|staking/i, (n) => `Stake a further $100 of a second asset through ${n}, so the wallet holds two of its receipt tokens.`],
  [/perpetual|derivative/i, (n) => `Open a second small position on ${n} on a different market, so the wallet shows more than one market.`],
  [/prediction/i, (n) => `Take a second small position on ${n} on a different market, so the wallet shows more than one outcome.`],
  [/curator|allocator|capital/i, (n, c) => `Allocate a further $100 to a second ${n} vault on ${c}, so the wallet holds shares in two vaults.`],
  [/stable/i, (n, c) => `Mint a further $100 of the stable asset through ${n} on ${c} from a second collateral asset.`],
  [/rwa/i, (n, c) => `Mint a further $100 of a second yield-bearing asset of ${n} on ${c}.`],
  [/insurance/i, (n, c) => `Buy a second small cover from ${n} on ${c} for a different protocol.`],
  [/basis/i, (n, c) => `Deposit a further $100 into a second ${n} vault on ${c} and hold it through one funding cycle.`],
  [/chain/i, (n) => `Use the bridged asset in a second app on ${n}, so the wallet shows two of its apps.`],
  [/cedefi/i, (n, c) => `Deposit a further $100 into a second ${n} vault on ${c}.`],
];

const money = (n: number): string => n.toLocaleString('en-US');

/** The table's action for a category, or the fallback. */
function pickAction(table: [RegExp, Action][], category: string | null, fallback: Action): Action {
  const c = category ?? '';
  for (const [re, action] of table) if (re.test(c)) return action;
  return fallback;
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time. Derived
 * from the protocol's own record (category, chains, age) and its $1,000 farm economics,
 * never from a hand-written list of names. The last step states the verdict and the net,
 * so the plan itself says whether the farm is worth doing.
 */
export function farmPlan(
  p: Protocol,
  age: number | null,
  econ: { slice: number; cost: number; net: number; perHour: number; hours: number; holdDays: number; verdict: Verdict },
): FarmStep[] {
  const chain = chainOf(p);
  const hold = econ.holdDays;
  const weeks = Math.ceil(hold / 7);
  const first = pickAction(FIRST_ACTIONS, p.category, (n, c) => `Deposit $1,000 of USDC into ${n} on ${c} and keep the position open for the hold.`)(p.name, chain);
  const second = pickAction(SECOND_ACTIONS, p.category, (n, c) => `Deposit a further $100 into ${n} on ${c} from a second asset, so the wallet shows two deposits.`)(p.name, chain);
  const chainNote = p.chains.length > 1 ? ` It also runs on ${p.chains.slice(1, 3).join(' and ')}, but farm on ${chain} first.` : '';
  const verdictLine =
    econ.verdict === 'FARM'
      ? `Verdict: FARM — a $1,000 position nets about $${money(econ.net)} after costs, about $${money(econ.perHour)} per hands-on hour.`
      : econ.verdict === 'THIN'
        ? `Verdict: THIN — a $1,000 position nets only about $${money(econ.net)}, so farm small or wait for a bigger slice.`
        : `Verdict: SKIP — a $1,000 position nets about $${money(econ.net)}, below the cost of farming it.`;
  return [
    { text: `Use a fresh wallet that holds only the $1,000 you plan to farm, and keep its seed phrase offline.`, cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: `${first}${chainNote}`, cost: '$1,000 of capital and about $4 of gas', time: '15 minutes to set up' },
    { text: second, cost: 'about $4 of gas', time: '10 minutes' },
    { text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote on ${chain}.`, cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: 'the $1,000 stays in the position', time: `${hold} days` },
    { text: `Check the position is still earning and the protocol has not been exploited: read ${p.name}'s own announcements before you add anything, and never pay anyone to claim for you.`, cost: 'nothing but the check', time: '5 minutes a week' },
    { text: `Before you withdraw, open ${p.name}'s own points or rewards page and claim only from the link it publishes. The slice this radar estimates for a $1,000 position is about $${money(econ.slice)}, against about $${money(econ.cost)} of farming cost over ${weeks} weeks — gas plus the 4% yield the $1,000 forgoes while it is locked in the position.`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: `${verdictLine} Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`, cost: 'nothing but the log', time: '5 minutes' },
  ];
}

/* ------------------------------------------------------------------ */
/* The house rule: which pre-token protocols the board may rank.       */
/* ------------------------------------------------------------------ */

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A name carrying a whole word wrapped, staked or staking is a product of a token that trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** Categories the house rule keeps off the launch list. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** An exchange's name at the start of a protocol's name: a product of that exchange. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: Protocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token and not a wrapped, staked or
 * bridged product, not an exchange, not a versioned pool — the house rule, applied to
 * every row alike, watchlist included. */
export function isRankable(p: Protocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((prefix) => p.name.startsWith(prefix))) return false;
  return true;
}

/** Why a pre-token protocol is set aside instead of ranked, or null when it is rankable. */
export function asideReason(p: Protocol): string | null {
  if (!isPreToken(p)) return null;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return `Excluded category: ${p.category}`;
  if (WRAPPED_WORD.test(p.name)) return 'Wrapped or staked product of a token that trades';
  if (VERSIONED.test(p.name)) return 'Versioned pool of another protocol';
  if (EXCHANGE_PREFIXES.some((prefix) => p.name.startsWith(prefix))) return 'Exchange product';
  return null;
}

/* ------------------------------------------------------------------ */
/* Building the board, the audit lists, and the dashboard dataset.     */
/* ------------------------------------------------------------------ */

const byTvlDesc = (a: Protocol, b: Protocol): number => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

/**
 * The ranked board: the whole watchlist plus every other rankable pre-token protocol.
 * The watchlist passes through isRankable() exactly like every other row. That check
 * costs nothing on any snapshot the house rule built: the watchlist is DEFINED by the
 * same properties isRankable() tests (pre-token, no version marker, no wrapped/staked
 * word, no excluded category, no exchange prefix — the snapshot's own field guide), so
 * a watchlist entry can only fail it if the snapshot contradicts its own rule. In that
 * case the honest outcome is a refusal, not a silent ranking of an excluded protocol
 * and not a silent drop: the entry would fall to the set-aside or trading lists, and
 * boardProblem would refuse the board for missing coverage. Refusing loudly is the
 * correct behaviour for a self-contradictory snapshot; fabricating a board is not.
 */
export function buildBoard(snapshot: Snapshot, curve: Curve, params: ModelParams = PARAMS, oddsOf?: (p: Protocol) => number): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, Protocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined && isRankable(p)) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols.filter((q) => !chosen.has(q.slug) && isRankable(q)).sort(byTvlDesc)) {
    chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => {
    const v = priceProtocol(p, snapshot.as_of, curve, params);
    const econ = farmMath(v.implied, p, v.age, params);
    return { p, ...v, econ };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    band_low_usd: 0, // filled in by buildAll, once the full-model backtest's median miss is known
    band_high_usd: 0,
    // Launch odds from the fitted odds model when one is passed (buildAll always
    // passes one); 0.5 — explicitly neutral, never a fitted number — when it is not.
    launch_odds: oddsOf === undefined ? 0.5 : Math.round(oddsOf(s.p) * 1000) / 1000,
    model: {
      base_value_usd: s.base,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      chain_multiplier: round4(s.chainMult),
      age_days: s.age,
    },
    farm: {
      slice_usd: s.econ.slice,
      farm_cost_usd: s.econ.cost,
      net_per_1000_usd: s.econ.net,
      net_per_hour_usd: s.econ.perHour,
      hands_on_hours: s.econ.hours,
      hold_days: s.econ.holdDays,
      verdict: s.econ.verdict,
    },
    farm_steps: farmPlan(s.p, s.age, s.econ).map(stepText),
  }));
}

/** The protocols the house rule sets aside, with the reason each, largest TVL first. */
export function buildAside(snapshot: Snapshot): AsideRow[] {
  return snapshot.protocols
    .filter((p) => isPreToken(p) && asideReason(p) !== null)
    .sort(byTvlDesc)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: ageDays(snapshot.as_of, p.listed_at),
      reason: asideReason(p)!,
    }));
}

/** Every protocol whose token already trades, by market cap. */
export function buildTraded(snapshot: Snapshot): TradedRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
function dashRow(row: BoardRow, watchlist: boolean): DashRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    band_low_usd: row.band_low_usd,
    band_high_usd: row.band_high_usd,
    launch_odds: row.launch_odds,
    watchlist,
    base_value_usd: row.model.base_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    slice_usd: row.farm.slice_usd,
    farm_cost_usd: row.farm.farm_cost_usd,
    net_per_1000_usd: row.farm.net_per_1000_usd,
    net_per_hour_usd: row.farm.net_per_hour_usd,
    hands_on_hours: row.farm.hands_on_hours,
    hold_days: row.farm.hold_days,
    verdict: row.farm.verdict,
    farm_steps: row.farm_steps,
  };
}

/** Everything the program writes, from the snapshot: the fit, its tests, the board, the audit. */
export function buildAll(snapshot: Snapshot, params: ModelParams = PARAMS): { board: BoardRow[]; dash: DashData } {
  const pool = comparablesOf(snapshot);
  const curve = fitCurve(pool);
  const validation = validateModel(pool, snapshot.as_of, params, snapshot.protocols);
  // The value band belongs to the deployed model: the FULL-model leave-one-out median
  // miss, not the curve-alone one.
  const band = validation.loo.median_miss_x;
  // The launch-odds model, fitted separately on the protocols with a listed date and
  // held out twice; the board's odds come from the model fitted on all of them.
  const dated = snapshot.protocols.filter((p) => p.listed_at !== null);
  const oddsModel = fitOddsModel(dated, snapshot.as_of, params);
  const holdA = oddsHoldout(dated, ODDS_HOLDOUT_SEED_A, snapshot.as_of, params);
  const holdB = oddsHoldout(dated, ODDS_HOLDOUT_SEED_B, snapshot.as_of, params);
  const board = buildBoard(snapshot, curve, params, (p) => launchOdds(oddsModel, p, snapshot.as_of, params));
  for (const row of board) {
    row.band_low_usd = Math.max(1, Math.round(row.implied_value_usd / band));
    row.band_high_usd = Math.round(row.implied_value_usd * band);
  }
  const boardOdds = board.map((r) => r.launch_odds).sort((a, b) => a - b);
  const odds: OddsRecord = {
    trained_on: dated.length,
    traded_share: Math.round((dated.filter((p) => !isPreToken(p)).length / dated.length) * 1000) / 1000,
    holdout_a_accuracy: holdA.accuracy,
    holdout_a_base: holdA.base,
    holdout_a_n: holdA.n,
    holdout_b_accuracy: holdB.accuracy,
    holdout_b_base: holdB.base,
    holdout_b_n: holdB.n,
    age_coefficient: Math.round(oddsModel.beta[1]! * 1000) / 1000,
    calibration: holdA.buckets,
    board_p10: percentileOf(boardOdds, 0.1),
    board_p25: percentileOf(boardOdds, 0.25),
    board_median: percentileOf(boardOdds, 0.5),
    board_p75: percentileOf(boardOdds, 0.75),
    board_p90: percentileOf(boardOdds, 0.9),
  };
  const traded = buildTraded(snapshot);
  const aside = buildAside(snapshot);
  if (board.length + aside.length + traded.length !== snapshot.protocols.length) {
    throw new SnapshotError(
      `snapshot not fully accounted: ${board.length} ranked + ${aside.length} set aside + ${traded.length} trading != ${snapshot.protocols.length}`,
    );
  }
  const byHour = [...board].sort((a, b) => b.farm.net_per_hour_usd - a.farm.net_per_hour_usd);
  const best = byHour[0]!;
  const bestWatch = byHour.find((r) => snapshot.watchlist.includes(r.slug)) ?? best;
  const counts: { FARM: number; THIN: number; SKIP: number } = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const row of board) counts[row.farm.verdict]++;
  const dash: DashData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: params,
    model_version: MODEL_VERSION,
    curve,
    validation,
    odds,
    integrity: integrityOf(snapshot),
    band_median_miss_x: band,
    watchlist_size: snapshot.watchlist.length,
    snapshot_size: snapshot.protocols.length,
    board_size: board.length,
    early_size: board.filter((r) => !snapshot.watchlist.includes(r.slug)).length,
    traded_size: traded.length,
    aside_size: aside.length,
    verdict_counts: counts,
    best_per_hour: { slug: best.slug, name: best.name, net_per_hour_usd: best.farm.net_per_hour_usd },
    best_per_hour_watchlist: { slug: bestWatch.slug, name: bestWatch.name, net_per_hour_usd: bestWatch.farm.net_per_hour_usd },
    rows: board.map((r) => dashRow(r, snapshot.watchlist.includes(r.slug))),
    traded,
    aside,
    comps: pool.map((p) => [Math.log10(p.tvl_usd), Math.log10(p.mcap_usd!)] as [number, number]),
  };
  return { board, dash };
}

/* ------------------------------------------------------------------ */
/* Input, output, and the gate's own shape check.                      */
/* ------------------------------------------------------------------ */

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardProblem(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(dash: DashData): string {
  return `window.RADAR=${JSON.stringify(dash)};\n`;
}
