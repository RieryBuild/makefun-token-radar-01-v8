// Launch Radar (radar-8): the sealed snapshot in, the ranked board and its dashboard out.
//
//   node main.ts [--input <snapshot.json|directory>] [--output <directory>]
//
// Reads the sealed snapshot, fits the launch curve to the snapshot's own traded tokens
// and tests the FULL deployed model out of sample (lib/model.ts), scores every pre-token
// protocol, audits the rest of the snapshot, and writes: board.json (the ranked board),
// data.js (the dashboard's dataset), dashboard/ and screenshots/ copied verbatim, and
// dossier.json (the dossier buildDossier writes for them). Standard library only, no
// network, no randomness: the same snapshot always yields the same bytes.
//
// Every path is resolved off this file, never off the working directory: the grader runs
// `node /bot/main.ts` with the container's cwd at `/`, and a cwd-relative copy would fail
// there. Input and output follow the kit's contract: --input / MAKEFUN_INPUT_DIR / /input,
// and --output / MAKEFUN_OUTPUT_DIR / /output.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import { MODEL_VERSION, PARAMS, boardProblem, buildAll, dataScript, parseSnapshot } from './lib/model.ts';

/** This file's own directory: dashboard/ and screenshots/ live beside it. */
const SELF_DIR = fileURLToPath(new URL('.', import.meta.url));

/** The gate's caps (reference/gate.json), as the dossier library takes them. */
const DOSSIER_TEXT_BYTES = 65_536;
const SHOT_LIMIT = { max: 4, max_bytes: 524_288 };
const DASH_LIMIT = { max_files: 400, max_bytes: 4_194_304 };
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** The value after `--name`, or `fallback` when the flag is absent. */
function flag(name: string, fallback: string): string {
  const args = process.argv.slice(2);
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < args.length) return args[i + 1]!;
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

/** Copy one directory's regular files (flat, dot-names skipped) into `to`. */
function copyFlat(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

function main(): void {
  const inputArg = flag('input', process.env.MAKEFUN_INPUT_DIR ?? '/input');
  const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
  if (!existsSync(inputFile)) {
    process.stderr.write(`launch radar: no snapshot at ${inputFile}\n`);
    process.exit(2);
  }
  const outDir = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

  const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
  const { board, dash } = buildAll(snapshot, PARAMS);

  const problem = boardProblem(board, snapshot);
  if (problem !== null) throw new Error(`board rejected: ${problem}`);
  if (board.length < 100) throw new Error(`board rejected: ${board.length} rows is below the 100-row floor`);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`, 'utf8');
  writeFileSync(join(outDir, 'data.js'), dataScript(dash), 'utf8');
  const dashFiles = copyFlat(join(SELF_DIR, 'dashboard'), join(outDir, 'dashboard'));
  const shots = copyFlat(join(SELF_DIR, 'screenshots'), join(outDir, 'screenshots'));
  if (shots.length < 3) {
    process.stderr.write(`launch radar: screenshots/ holds ${shots.length} image(s): hand in 3 or 4\n`);
    process.exit(1);
  }
  for (const name of shots) {
    if (!SHOT_NAME.test(name)) {
      process.stderr.write(`launch radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
      process.exit(1);
    }
  }

  // The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
  const dossier = buildDossier(outDir, {
    text_max_bytes: DOSSIER_TEXT_BYTES,
    screenshots: SHOT_LIMIT,
    dashboard: DASH_LIMIT,
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier, 'utf8');

  const c = dash.curve;
  const v = dash.validation;
  const o = dash.odds;
  const top = board[0]!;
  const lines = [
    `launch radar ${MODEL_VERSION}: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist`,
    `board ${board.length} rows (${dash.watchlist_size} watchlist + ${dash.early_size} early), ${dash.aside_size} set aside with reasons, ${dash.traded_size} trading`,
    `curve log10(mcap) = ${c.intercept.toFixed(3)} + ${c.slope.toFixed(3)}*log10(TVL) + ${c.quadratic.toFixed(3)}*log10(TVL)^2, R2 ${c.r_squared.toFixed(3)} over ${c.comparables} comparables`,
    `FULL MODEL leave-one-out median miss x${v.loo.median_miss_x} (within 2x ${(v.loo.within_2x * 100).toFixed(0)}%, within 3x ${(v.loo.within_3x * 100).toFixed(0)}%); blind 2025 x${v.blind2025.median_miss_x} (n=${v.blind2025.tested}); blind 2024 x${v.blind2024.median_miss_x} (n=${v.blind2024.tested}); repeated 5-fold CV x${v.cv_median_miss_x} (pooled x${v.cv_pooled_median_miss_x})`,
    `curve alone: LOO x${v.loo_curve.median_miss_x}; blind 2025 x${v.blind2025_curve.median_miss_x}; blind 2024 x${v.blind2024_curve.median_miss_x}; CV x${v.cv_curve_median_miss_x} (pooled x${v.cv_curve_pooled_median_miss_x})`,
    `walk-forward (chronological, 5 chunks): full model x${v.walkforward.median_miss_x} (n=${v.walkforward.tested}, chunks ${v.walkforward.chunks.map((m) => `x${m}`).join(', ')}); curve alone x${v.walkforward_curve.median_miss_x} (chunks ${v.walkforward_curve.chunks.map((m) => `x${m}`).join(', ')})`,
    `odds ranking (Spearman vs realized mcap, raw vs odds-weighted): ${v.odds_ranking.map((o) => `${o.test} n=${o.n} ${o.spearman_raw} vs ${o.spearman_weighted}, top-10 ${o.top10_raw} vs ${o.top10_weighted}, top-20 ${o.top20_raw} vs ${o.top20_weighted}`).join('; ')}`,
    `held out twice: split A x${v.heldoutA.median_miss_x} (n=${v.heldoutA.tested}, curve alone x${v.heldoutA_curve.median_miss_x}); split B x${v.heldoutB.median_miss_x} (n=${v.heldoutB.tested}, curve alone x${v.heldoutB_curve.median_miss_x}); leave-one-family-out x${v.familyLoo.median_miss_x} (n=${v.familyLoo.tested})`,
    `launch odds (logistic, age + category, trained on ${o.trained_on}): hold-out A ${(o.holdout_a_accuracy * 100).toFixed(1)}% vs base ${(o.holdout_a_base * 100).toFixed(1)}% (n=${o.holdout_a_n}); hold-out B ${(o.holdout_b_accuracy * 100).toFixed(1)}% vs base ${(o.holdout_b_base * 100).toFixed(1)}% (n=${o.holdout_b_n}); board odds median ${(o.board_median * 100).toFixed(0)}% (P25-P75 ${(o.board_p25 * 100).toFixed(0)}-${(o.board_p75 * 100).toFixed(0)}%, P10-P90 ${(o.board_p10 * 100).toFixed(0)}-${(o.board_p90 * 100).toFixed(0)}%)`,
    `dropped variants (LOO / blind 2025 / blind 2024 / CV, each vs its own baseline): ${v.dropped.map((d) => `${d.name} x${d.loo_median_miss_x} / x${d.blind2025_median_miss_x} / x${d.blind2024_median_miss_x} / x${d.cv_median_miss_x}`).join('; ')}`,
    `integrity: ${dash.integrity.protocols} protocols, ${dash.integrity.missing_change_7d} missing 7d change, ${dash.integrity.missing_listed_at} missing listed date, ${dash.integrity.missing_category} missing category, ${dash.integrity.missing_tvl} missing TVL`,
    `verdicts per $1,000: ${dash.verdict_counts.FARM} FARM, ${dash.verdict_counts.THIN} THIN, ${dash.verdict_counts.SKIP} SKIP; value band x${dash.band_median_miss_x}`,
    `best net per hands-on hour: ${dash.best_per_hour.name} $${dash.best_per_hour.net_per_hour_usd}/h; watchlist best: ${dash.best_per_hour_watchlist.name} $${dash.best_per_hour_watchlist.net_per_hour_usd}/h`,
    `top: ${top.name} at $${top.implied_value_usd.toLocaleString('en-US')} implied, rank 1 of ${board.length}`,
    `wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, dashboard/ (${dashFiles.length} files), screenshots/ (${shots.length} images), dossier.json (${dossier.length} bytes)`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
