// Launch Radar (radar-8): renders window.RADAR into the board, the detail view, the audit
// tabs and the model panel. No network, no framework: the data script beside the page is
// the whole dataset, and every number on the page comes from it.
(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) return;

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toFixed(0);
  }
  function dollars(n) {
    if (n === null || n === undefined) return '—';
    var sign = n < 0 ? '−$' : '$';
    return sign + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function ageText(days) {
    if (days === null || days === undefined) return '—';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }
  function verdictPill(v) { return '<span class="v ' + v + '">' + v + '</span>'; }
  function fx(n) { return '×' + n.toFixed(2); }
  function pc(n) { return Math.round(n * 100) + '%'; }

  /* ---------- The what-if scenario: deposit, drop share, T-bill. ---------- */
  // The board's stored economics are the base scenario ($1,000, 10%, 4%) — the same
  // numbers board.json carries. Any other scenario re-nets each row live from the
  // implied value, TVL, hold and hours, with the FARM threshold scaled to the deposit
  // (1% of it: $10 on $1,000, $50 on $5,000, $250 on $25,000) and THIN at $0.
  var econ = R.model.economics;
  function scenario() {
    return {
      deposit: parseFloat($('wi-deposit').value) || econ.position_usd,
      share: parseFloat($('wi-share').value),
      rate: parseFloat($('wi-rate').value),
    };
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  function econFor(r, sc) {
    if (sc.deposit === econ.position_usd && sc.share === econ.airdrop_share && sc.rate === econ.tbill_annual_rate) {
      return { slice: r.slice_usd, cost: r.farm_cost_usd, net: r.net_per_1000_usd, perHour: r.net_per_hour_usd, verdict: r.verdict };
    }
    // Non-base scenarios re-net with the SAME round2 sequence model.ts farmMath applies
    // (cost, slice, net, per-hour, each rounded in turn), so a what-if recompute agrees
    // to the cent with what the model would produce for that scenario — not just the
    // base scenario, which returns the stored board fields verbatim above.
    var weeks = Math.ceil(r.hold_days / 7);
    var cost = round2(econ.setup_gas_usd + econ.weekly_gas_usd * weeks + sc.deposit * sc.rate * (r.hold_days / 365));
    var slice = round2(sc.share * r.implied_value_usd * (sc.deposit / Math.max(1, r.tvl_usd)));
    var net = round2(slice - cost);
    var perHour = round2(net / r.hands_on_hours);
    var verdict = net >= sc.deposit * 0.01 ? 'FARM' : net >= 0 ? 'THIN' : 'SKIP';
    return { slice: slice, cost: cost, net: net, perHour: perHour, verdict: verdict };
  }
  function whatifNote() {
    var sc = scenario();
    var counts = { FARM: 0, THIN: 0, SKIP: 0 };
    R.rows.forEach(function (r) { counts[econFor(r, sc).verdict]++; });
    $('whatif-note').textContent = 'What-if: $' + sc.deposit.toLocaleString('en-US') + ' · ' +
      Math.round(sc.share * 100) + '% drop share · ' + Math.round(sc.rate * 100) + '% T-bill — ' +
      counts.FARM + ' FARM, ' + counts.THIN + ' THIN, ' + counts.SKIP + ' SKIP (FARM at 1% of the deposit net). Farm plans stay written for the base scenario.';
  }

  /* ---------- The proof strip: the FULL model's tests, above the fold. ---------- */
  $('asof').textContent = R.as_of;
  var curve = R.curve;
  var val = R.validation;
  $('k-comps').innerHTML = curve.comparables + '<small>traded tokens</small>';
  $('k-slope').innerHTML = curve.slope.toFixed(3) + ' + ' + curve.quadratic.toFixed(3) + 'x²<small>log-log slope + curve, R² ' + curve.r_squared.toFixed(3) + '</small>';
  $('k-loo').innerHTML = fx(val.loo.median_miss_x) + '<small>n=' + val.loo.tested + ' · full model</small>';
  $('k-b25').innerHTML = fx(val.blind2025.median_miss_x) + '<small>blind, ' + val.blind2025.tested + ' tokens since 2025</small>';
  $('k-b24').innerHTML = fx(val.blind2024.median_miss_x) + '<small>blind, ' + val.blind2024.tested + ' tokens since 2024</small>';
  $('k-cv').innerHTML = fx(val.cv_median_miss_x) + '<small>20× 5-fold · full model</small>';

  // What the multipliers cost and earn, from the data — honest in both directions.
  // A test where the full model misses MORE than the curve alone is a cost; where it
  // misses less, an earning. The sentence names both, never only the flattering half.
  function deltaLabel(full, alone, label) {
    var d = Math.abs(full - alone).toFixed(2);
    if (full > alone) return 'cost ' + d + '× on ' + label;
    if (full < alone) return 'earn ' + d + '× on ' + label;
    return 'match on ' + label;
  }
  var scopeBits = [
    deltaLabel(val.loo.median_miss_x, val.loo_curve.median_miss_x, 'leave-one-out'),
    deltaLabel(val.blind2025.median_miss_x, val.blind2025_curve.median_miss_x, 'blind 2025'),
    deltaLabel(val.blind2024.median_miss_x, val.blind2024_curve.median_miss_x, 'blind 2024'),
    deltaLabel(val.cv_median_miss_x, val.cv_curve_median_miss_x, 'repeated 5-fold'),
    deltaLabel(val.heldoutA.median_miss_x, val.heldoutA_curve.median_miss_x, 'held-out split A'),
    deltaLabel(val.heldoutB.median_miss_x, val.heldoutB_curve.median_miss_x, 'held-out split B'),
    deltaLabel(val.walkforward.median_miss_x, val.walkforward_curve.median_miss_x, 'walk-forward'),
  ];
  $('proof-scope').innerHTML = '<b>These are the deployed model&rsquo;s numbers</b> — every test prices the quadratic curve &times; growth &times; chains. ' +
    'Curve alone: LOO ' + fx(val.loo_curve.median_miss_x) + ', blind 2025 ' + fx(val.blind2025_curve.median_miss_x) +
    ', blind 2024 ' + fx(val.blind2024_curve.median_miss_x) + ', CV ' + fx(val.cv_curve_median_miss_x) +
    ', walk-forward ' + fx(val.walkforward_curve.median_miss_x) +
    ' — the multipliers ' + scopeBits.join('; ') + '.';

  // The launch-odds model, held out twice, with the board's odds range and the
  // family-held-out check on leave-one-out.
  var odds = R.odds;
  $('proof-odds').innerHTML = '<b>Launch odds, fitted separately</b> (logistic on age + category, ' + odds.trained_on +
    ' protocols): held-out accuracy ' + pc(odds.holdout_a_accuracy) + ' vs ' + pc(odds.holdout_a_base) + ' base rate, and ' +
    pc(odds.holdout_b_accuracy) + ' vs ' + pc(odds.holdout_b_base) + ' on a second split. Board odds: median ' + pc(odds.board_median) +
    ' (P25&ndash;P75 ' + pc(odds.board_p25) + '&ndash;' + pc(odds.board_p75) + ', P10&ndash;P90 ' + pc(odds.board_p10) + '&ndash;' + pc(odds.board_p90) +
    '). Held out twice more on the value model: ' + fx(val.heldoutA.median_miss_x) + ' and ' + fx(val.heldoutB.median_miss_x) +
    ' (n=' + val.heldoutA.tested + ' each); leave-one-family-out ' + fx(val.familyLoo.median_miss_x) + '.';

  // The dropped variants, in one sentence with their numbers: the ones with a
  // leave-one-out edge that another test does not confirm are named as noise; the
  // rest miss worse on the head-to-head or match it. A variant that beat the deployed
  // model on every test would be named honestly instead of hidden — none does here.
  var dropped = val.dropped;
  // Each variant is classified against its OWN baseline: the bare quadratic against
  // the pooled line (the curve family it would replace), the rest against the
  // deployed model. The model panel's table carries each variant's note with its
  // baseline named.
  function baselineOf(d) {
    return d.baseline === 'curve'
      ? { loo: val.loo_curve.median_miss_x, b25: val.blind2025_curve.median_miss_x, b24: val.blind2024_curve.median_miss_x, cv: val.cv_curve_median_miss_x }
      : { loo: val.loo.median_miss_x, b25: val.blind2025.median_miss_x, b24: val.blind2024.median_miss_x, cv: val.cv_median_miss_x };
  }
  var beats = dropped.filter(function (d) { var b = baselineOf(d); return d.loo_median_miss_x < b.loo && d.blind2025_median_miss_x < b.b25 && d.blind2024_median_miss_x < b.b24 && d.cv_median_miss_x <= b.cv; });
  var edged = dropped.filter(function (d) { var b = baselineOf(d); return d.loo_median_miss_x < b.loo && !(d.blind2025_median_miss_x < b.b25 && d.blind2024_median_miss_x < b.b24 && d.cv_median_miss_x <= b.cv); });
  var tied = dropped.filter(function (d) { var b = baselineOf(d); return d.loo_median_miss_x === b.loo && d.blind2025_median_miss_x === b.b25 && d.blind2024_median_miss_x === b.b24 && d.cv_median_miss_x === b.cv; });
  var rest = dropped.filter(function (d) { return beats.indexOf(d) < 0 && edged.indexOf(d) < 0 && tied.indexOf(d) < 0; });
  var worse = rest.filter(function (d) { var b = baselineOf(d); return d.loo_median_miss_x > b.loo; });
  var tiedLoo = rest.filter(function (d) { var b = baselineOf(d); return d.loo_median_miss_x === b.loo; });
  var shortName = function (d) {
    return d.name.replace('Fitted ', '').replace('All three fitted together', 'all three together').replace('Quadratic curve, with multipliers', 'quadratic × multipliers')
      .replace('Relative momentum (comparables median)', 'relative momentum').replace('Relative momentum (all-protocol median)', 'relative momentum (all)')
      .replace('Relative momentum + sector multipliers', 'relative + sector').replace('Sector multipliers, ridge ', 'sector ×')
      .replace('Growth weight halved (0.25)', 'growth halved')
      .replace('No growth multiplier', 'no-growth').replace('No chains multiplier', 'no-chains')
      .replace('Quadratic curve, no growth multiplier', 'quadratic, no growth')
      .replace('Quadratic curve, no chains multiplier', 'quadratic, no chains').replace('Quadratic curve, maturity only', 'quadratic, maturity only')
      .replace('k-NN k=8, distance-weighted', 'k-NN k=8').replace('k-NN k=12, distance-weighted', 'k-NN k=12')
      .replace('Median regression on the log-log curve', 'median regression').replace('Ensemble: curve + k-NN 50/50', 'ensemble 50/50')
      .replace('Per-category curves, shrinkage k=5', 'per-category curves').replace('One-per-ticker comps fit', 'one-per-ticker');
  };
  // The tests a variant LOSES (not ties, not wins), named from its own numbers.
  function lostTests(d) {
    var b = baselineOf(d);
    var out = [];
    if (d.blind2025_median_miss_x > b.b25) out.push('blind 2025');
    if (d.blind2024_median_miss_x > b.b24) out.push('blind 2024');
    if (d.cv_median_miss_x > b.cv) out.push('repeated 5-fold');
    return out;
  }
  // The edged clause names each variant's baseline: the bare quadratic edges the
  // POOLED LINE, the rest edge the DEPLOYED MODEL. A single "edge it" would conflate
  // the two baselines and mislead a careful reader.
  var edgedFull = edged.filter(function (d) { return d.baseline !== 'curve'; });
  var edgedCurve = edged.filter(function (d) { return d.baseline === 'curve'; });
  var edgeParts = [];
  if (edgedFull.length) edgeParts.push(edgedFull.map(shortName).join(', ') +
    (edgedFull.length === 1 ? ' edges' : ' edge') + ' it on leave-one-out');
  if (edgedCurve.length) edgeParts.push(edgedCurve.map(shortName).join(', ') +
    (edgedCurve.length === 1 ? ' edges' : ' edge') + ' the pooled line');
  var edgedBit = edgeParts.length ? edgeParts.join('; ') + ' — none wins on every test, so none ships' : '';
  var tiedBit = tied.length ? tied.map(shortName).join(', ') + (tied.length === 1 ? ' matches' : ' match') + ' it on every test' : '';
  // Variants that tie the head-to-head, grouped by the tests they lose, so two
  // variants with the same record share one clause instead of repeating it. The
  // strip names the first lost test only; the model panel's table carries them all.
  var tiedGroups = {};
  tiedLoo.forEach(function (d) { var k = lostTests(d)[0] || 'no test'; (tiedGroups[k] = tiedGroups[k] || []).push(d); });
  var tiedLooBit = Object.keys(tiedGroups).map(function (k) {
    var g = tiedGroups[k];
    return g.map(shortName).join(' and ') + (g.length === 1 ? ' ties' : ' tie') + ' it but lose' + (g.length === 1 ? 's' : '') + ' ' + k;
  }).join('; ');
  var beatsBit = beats.length
    ? ' Variants that beat their baseline on every test are flagged in the model panel: ' + beats.map(function (d) { return shortName(d) + ' ' + fx(d.loo_median_miss_x) + ' / ' + fx(d.cv_median_miss_x) + ' (vs ' + (d.baseline === 'curve' ? 'the pooled line' : 'the deployed model') + ')'; }).join('; ') + '.'
    : '';
  var dropParts = [];
  if (worse.length) dropParts.push(worse.length + ' miss worse on the head-to-head');
  if (tiedLooBit) dropParts.push(tiedLooBit);
  if (edgedBit) dropParts.push(edgedBit);
  if (tiedBit) dropParts.push(tiedBit);
  $('proof-dropped').innerHTML = '<b>' + dropped.length + ' richer fits were tried and dropped</b> — ' + dropParts.join('; ') + '. ' + beatsBit +
    (beats.length ? '' : 'Nothing richer beats the model that ships on every test, so it stays simple and says so.');
  $('audit').innerHTML = '<b>' + R.snapshot_size + ' protocols</b> in the snapshot — <b>' + R.board_size + ' ranked</b> below (the whole ' +
    R.watchlist_size + '-protocol watchlist plus ' + R.early_size + ' early finds), <b>' + R.aside_size + ' set aside</b> with a reason each, ' +
    '<b>' + R.traded_size + ' already trading</b>. Verdicts per $1,000: <b>' + R.verdict_counts.FARM + ' FARM</b>, ' +
    R.verdict_counts.THIN + ' THIN, ' + R.verdict_counts.SKIP + ' SKIP. ' +
    'Snapshot integrity: ' + R.integrity.missing_change_7d + ' missing 7-day change, ' + R.integrity.missing_listed_at + ' missing listed date, ' +
    R.integrity.missing_category + ' missing category, ' + R.integrity.missing_tvl + ' missing TVL.';

  /* ---------- The board: filters, sorts, and the value-band bar. ---------- */
  var logMin = Infinity, logMax = -Infinity;
  R.rows.forEach(function (r) {
    logMin = Math.min(logMin, Math.log10(Math.max(1, r.band_low_usd)));
    logMax = Math.max(logMax, Math.log10(Math.max(1, r.band_high_usd)));
  });
  function bandBar(r) {
    var lo = ((Math.log10(Math.max(1, r.band_low_usd)) - logMin) / (logMax - logMin)) * 100;
    var hi = ((Math.log10(Math.max(1, r.band_high_usd)) - logMin) / (logMax - logMin)) * 100;
    var at = ((Math.log10(Math.max(1, r.implied_value_usd)) - logMin) / (logMax - logMin)) * 100;
    return '<div class="bar"><span class="band" style="left:' + lo.toFixed(1) + '%;width:' + Math.max(hi - lo, 1).toFixed(1) + '%"></span>' +
      '<span class="mark" style="left:' + at.toFixed(1) + '%"></span></div>' +
      '<span class="band-label">' + money(r.band_low_usd) + ' – ' + money(r.band_high_usd) + '</span>';
  }
  function chainsShort(chains, n) {
    if (!chains.length) return '—';
    if (chains.length <= n) return esc(chains.join(', '));
    return esc(chains.slice(0, n).join(', ')) + ' +' + (chains.length - n) + ' more';
  }

  var SORTS = {
    implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
    net1k: function (a, b) { return b.view.net - a.view.net; },
    perhour: function (a, b) { return b.view.perHour - a.view.perHour; },
    slice: function (a, b) { return b.view.slice - a.view.slice; },
    tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
    growth: function (a, b) { return (b.change_7d === null ? -1e9 : b.change_7d) - (a.change_7d === null ? -1e9 : a.change_7d); },
    age: function (a, b) { return (b.age_days === null ? -1 : b.age_days) - (a.age_days === null ? -1 : a.age_days); },
    odds: function (a, b) { return b.launch_odds - a.launch_odds; },
    name: function (a, b) { return a.name.localeCompare(b.name); },
  };

  function fillSelect(sel, values) {
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });
  }
  var cats = Array.from(new Set(R.rows.map(function (r) { return r.category; }).filter(Boolean))).sort();
  var chs = Array.from(new Set(R.rows.reduce(function (acc, r) { return acc.concat(r.chains); }, []))).sort();
  fillSelect($('category'), cats);
  fillSelect($('chain'), chs);

  var selectedSlug = null;
  function visibleRows() {
    var q = $('q').value.trim().toLowerCase();
    var cat = $('category').value, ch = $('chain').value, ver = $('verdict').value;
    var wl = $('watchonly').checked;
    var sc = scenario();
    var rows = R.rows.map(function (r) { return Object.assign({ view: econFor(r, sc) }, r); }).filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      if (cat !== 'all' && r.category !== cat) return false;
      if (ch !== 'all' && r.chains.indexOf(ch) < 0) return false;
      if (ver !== 'all' && r.view.verdict !== ver) return false;
      if (wl && !r.watchlist) return false;
      return true;
    });
    rows.sort(SORTS[$('sort').value] || SORTS.implied);
    return rows;
  }

  function renderBoard() {
    var rows = visibleRows();
    whatifNote();
    var dep = scenario().deposit;
    var depLabel = dep >= 1000 ? '$' + (dep / 1000) + 'K' : '$' + dep;
    $('row-count').textContent = '— ' + rows.length + ' of ' + R.rows.length + ' rows';
    $('empty').hidden = rows.length > 0;
    var html = rows.map(function (r) {
      var g = r.change_7d === null ? '—' : '<span class="' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + pct(r.change_7d) + '</span>';
      var netCls = r.view.net >= 0 ? 'pos' : 'neg';
      var phCls = r.view.perHour >= 0 ? 'pos' : 'neg';
      return '<tr data-slug="' + esc(r.slug) + '"' + (r.slug === selectedSlug ? ' class="sel"' : '') + '>' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span><span class="sub">' + esc(r.slug) + (r.watchlist ? ' · <span class="wl">watchlist</span>' : '') + ' · <span class="odds">odds ' + pc(r.launch_odds) + '</span></span></td>' +
        '<td class="verdict-cell">' + verdictPill(r.view.verdict) +
        '<span class="net"><span class="' + netCls + '">' + dollars(r.view.net) + '</span> <small>net / ' + depLabel + '</small></span>' +
        '<span class="net"><span class="' + phCls + '">' + dollars(r.view.perHour) + '</span> <small>/ hour</small></span></td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>' +
        '<td class="bandcol">' + bandBar(r) + '</td>' +
        '<td class="num">' + dollars(r.view.slice) + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + g + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td></tr>';
    }).join('');
    $('board-body').innerHTML = html;
  }
  ['q', 'category', 'chain', 'verdict', 'sort', 'wi-deposit', 'wi-share', 'wi-rate'].forEach(function (id) {
    $(id).addEventListener('input', renderBoard);
  });
  $('watchonly').addEventListener('change', renderBoard);
  $('clear').addEventListener('click', function () {
    $('q').value = ''; $('category').value = 'all'; $('chain').value = 'all';
    $('verdict').value = 'all'; $('watchonly').checked = false; $('sort').value = 'implied';
    $('wi-deposit').value = '1000'; $('wi-share').value = '0.1'; $('wi-rate').value = '0.04';
    renderBoard();
  });
  $('board-body').addEventListener('click', function (e) {
    var tr = e.target.closest('tr');
    if (tr) showDetail(tr.getAttribute('data-slug'));
  });

  /* ---------- Tabs: the board, the set-aside audit, the traded set. ---------- */
  $('tab-board-n').textContent = '(' + R.board_size + ')';
  $('tab-aside-n').textContent = '(' + R.aside_size + ')';
  $('tab-traded-n').textContent = '(' + R.traded_size + ')';
  $('tabs').addEventListener('click', function (e) {
    var btn = e.target.closest('.tab');
    if (!btn) return;
    var tab = btn.getAttribute('data-tab');
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('on', t === btn); });
    ['board', 'aside', 'traded'].forEach(function (t) { $('pane-' + t).hidden = t !== tab; });
  });

  $('aside-n').textContent = R.aside_size;
  var reasonCounts = {};
  R.aside.forEach(function (r) { reasonCounts[r.reason] = (reasonCounts[r.reason] || 0) + 1; });
  $('aside-reasons').textContent = Object.keys(reasonCounts).sort(function (a, b) { return reasonCounts[b] - reasonCounts[a]; })
    .map(function (k) { return k + ': ' + reasonCounts[k]; }).join(' · ');
  $('aside-body').innerHTML = R.aside.map(function (r) {
    return '<tr><td><span class="name">' + esc(r.name) + '</span><span class="sub">' + esc(r.slug) + '</span></td>' +
      '<td>' + esc(r.category || '—') + '</td><td>' + chainsShort(r.chains, 2) + '</td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + pct(r.change_7d) + '</td>' +
      '<td class="num">' + ageText(r.age_days) + '</td><td class="wrap">' + esc(r.reason) + '</td></tr>';
  }).join('');

  $('traded-n').textContent = R.traded_size;
  $('comp-n').textContent = R.curve.comparables;
  $('traded-body').innerHTML = R.traded.map(function (r) {
    return '<tr><td><span class="name">' + esc(r.name) + '</span><span class="sub">' + esc(r.slug) + '</span></td>' +
      '<td>' + esc(r.category || '—') + '</td><td>' + chainsShort(r.chains, 2) + '</td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + money(r.mcap_usd) + '</td>' +
      '<td class="num">' + pct(r.change_7d) + '</td></tr>';
  }).join('');

  /* ---------- Detail view: one protocol's working, economics and plan. ---------- */
  function kv(label, value) { return '<div><dt>' + label + '</dt><dd>' + value + '</dd></div>'; }
  function miniRow(label, value) { return '<tr><th>' + label + '</th><td class="num">' + value + '</td></tr>'; }
  function showDetail(slug) {
    var r = R.rows.find(function (x) { return x.slug === slug; });
    if (!r) return;
    selectedSlug = slug;
    document.querySelectorAll('#board-body tr').forEach(function (tr) {
      tr.classList.toggle('sel', tr.getAttribute('data-slug') === slug);
    });
    var sc = scenario();
    var v = econFor(r, sc);
    var depLabel = sc.deposit >= 1000 ? '$' + (sc.deposit / 1000) + 'K' : '$' + sc.deposit;
    $('d-rank').textContent = r.rank;
    $('d-cat').innerHTML = esc(r.category || 'no category') + ' · ' + chainsShort(r.chains, 3);
    $('d-name').textContent = r.name + (r.watchlist ? ' ★ watchlist' : '');
    $('d-stats').innerHTML =
      kv('Implied value', money(r.implied_value_usd)) +
      kv('Value band', money(r.band_low_usd) + ' – ' + money(r.band_high_usd)) +
      kv('TVL', money(r.tvl_usd)) +
      kv('7-day growth', pct(r.change_7d)) +
      kv('Age, no token', ageText(r.age_days)) +
      kv('Launch odds', pc(r.launch_odds) + ' <small style="font-size:0.72rem;font-weight:400">peers&rsquo; record</small>') +
      kv('Verdict', verdictPill(v.verdict) + ' <span class="nb">' + dollars(v.net) + '</span>') +
      kv('Slice', dollars(v.slice)) +
      kv('Net per hour', '<span class="nb">' + dollars(v.perHour) + '</span>') +
      kv('Hold', r.hold_days + ' days') +
      kv('Hands-on time', r.hands_on_hours + ' h');
    $('d-model').innerHTML =
      miniRow('Curve base: 10^(' + curve.intercept.toFixed(3) + ' + ' + curve.slope.toFixed(3) + ' · log10 TVL + ' + curve.quadratic.toFixed(3) + ' · (log10 TVL)²)', money(r.base_value_usd)) +
      miniRow('Growth ×' + r.growth_multiplier.toFixed(3) + ' (7d ' + pct(r.change_7d) + ', clamped, half weight)', '×' + r.growth_multiplier.toFixed(3)) +
      miniRow('Chains ×' + r.chain_multiplier.toFixed(3) + ' (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ')', '×' + r.chain_multiplier.toFixed(3)) +
      miniRow('Maturity: no multiplier in radar-8 — the quadratic curve prices age better without it', '—') +
      miniRow('Implied value', '<b>' + money(r.implied_value_usd) + '</b>') +
      miniRow('Launch odds (peers&rsquo; record: 1 minus the fitted peer token rate)', pc(r.launch_odds)) +
      miniRow('Band (÷ and × ' + R.band_median_miss_x.toFixed(2) + ', the full model&rsquo;s LOO median miss)', '<span class="nb">' + money(r.band_low_usd) + ' – ' + money(r.band_high_usd) + '</span>');
    var e = R.model.economics;
    $('d-econ').innerHTML =
      miniRow('Scenario: ' + depLabel + ' deposit, ' + Math.round(sc.share * 100) + '% drop share, ' + Math.round(sc.rate * 100) + '% T-bill', '') +
      miniRow('Slice: ' + Math.round(sc.share * 100) + '% of implied, pro-rata by TVL, on ' + depLabel, dollars(v.slice)) +
      miniRow('Expected slice at ' + pc(r.launch_odds) + ' launch odds', dollars(v.slice * r.launch_odds)) +
      miniRow('Cost: $' + e.setup_gas_usd + ' setup + $' + e.weekly_gas_usd + '/week gas + ' + Math.round(sc.rate * 100) + '% forgone yield', dollars(v.cost)) +
      miniRow('Net per ' + depLabel, '<b class="nb">' + dollars(v.net) + '</b>') +
      miniRow('Net per hands-on hour (' + r.hands_on_hours + ' h over ' + r.hold_days + ' days)', '<span class="nb">' + dollars(v.perHour) + '</span>') +
      miniRow('Verdict: FARM at 1% of the deposit net, THIN at $0+, SKIP below $0', verdictPill(v.verdict));
    $('d-steps').innerHTML = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    $('detail').hidden = false;
  }
  $('d-close').addEventListener('click', function () {
    $('detail').hidden = true;
    selectedSlug = null;
    document.querySelectorAll('#board-body tr.sel').forEach(function (tr) { tr.classList.remove('sel'); });
  });

  /* ---------- The model panel: fit table, dropped variants, scatter. ---------- */
  $('fit-line').textContent = 'log10(mcap) = ' + curve.intercept.toFixed(3) + ' + ' + curve.slope.toFixed(3) + ' × log10(TVL) + ' + curve.quadratic.toFixed(3) + ' × (log10 TVL)², R² ' +
    curve.r_squared.toFixed(3) + ' over ' + curve.comparables + ' traded tokens';
  $('fit-table').innerHTML =
    miniRow('Comparables', curve.comparables + ' traded tokens with market cap above zero') +
    miniRow('Curve', 'log10(mcap) = ' + curve.intercept.toFixed(3) + ' + ' + curve.slope.toFixed(3) + ' × log10(TVL) + ' + curve.quadratic.toFixed(3) + ' × (log10 TVL)² — the quadratic term bends the line gently upward; its vertex sits far below the data range, so the curve never turns down') +
    miniRow('R²', curve.r_squared.toFixed(3)) +
    miniRow('Leave-one-out median miss — FULL MODEL', '×' + val.loo.median_miss_x.toFixed(2) + ' — within 2× on ' + Math.round(val.loo.within_2x * 100) + '% of tokens, within 3× on ' + Math.round(val.loo.within_3x * 100) + '%') +
    miniRow('Leave-one-out median miss — curve alone', '×' + val.loo_curve.median_miss_x.toFixed(2) + ' — within 2× on ' + Math.round(val.loo_curve.within_2x * 100) + '%, within 3× on ' + Math.round(val.loo_curve.within_3x * 100) + '%') +
    miniRow('Blind 2025 — full model / curve alone', '×' + val.blind2025.median_miss_x.toFixed(2) + ' / ×' + val.blind2025_curve.median_miss_x.toFixed(2) + ' on ' + val.blind2025.tested + ' tokens listed after 2025') +
    miniRow('Blind 2024 — full model / curve alone', '×' + val.blind2024.median_miss_x.toFixed(2) + ' / ×' + val.blind2024_curve.median_miss_x.toFixed(2) + ' on ' + val.blind2024.tested + ' tokens listed after 2024') +
    miniRow('Repeated 5-fold CV — full model', '×' + val.cv_median_miss_x.toFixed(2) + ', mean of 20 per-repeat medians (pooled median ×' + val.cv_pooled_median_miss_x.toFixed(2) + ')') +
    miniRow('Repeated 5-fold CV — curve alone', '×' + val.cv_curve_median_miss_x.toFixed(2) + ', mean of 20 per-repeat medians (pooled median ×' + val.cv_curve_pooled_median_miss_x.toFixed(2) + ')') +
    miniRow('Held out, split A — full model / curve alone', '×' + val.heldoutA.median_miss_x.toFixed(2) + ' / ×' + val.heldoutA_curve.median_miss_x.toFixed(2) + ' on ' + val.heldoutA.tested + ' held-out tokens (independent 80/20 split)') +
    miniRow('Held out, split B — full model / curve alone', '×' + val.heldoutB.median_miss_x.toFixed(2) + ' / ×' + val.heldoutB_curve.median_miss_x.toFixed(2) + ' on ' + val.heldoutB.tested + ' held-out tokens (second independent split)') +
    miniRow('Leave-one-family-out — full model', '×' + val.familyLoo.median_miss_x.toFixed(2) + ' on ' + val.familyLoo.tested + ' tokens — related protocols do not flatter leave-one-out') +
    miniRow('Walk-forward — full model / curve alone', '×' + val.walkforward.median_miss_x.toFixed(2) + ' / ×' + val.walkforward_curve.median_miss_x.toFixed(2) + ' on ' + val.walkforward.tested + ' dated tokens, chronological expanding window (full-model chunks ×' + val.walkforward.chunks.join(', ×') + ')') +
    miniRow('Value band', 'implied ÷ and × ' + R.band_median_miss_x.toFixed(2) + ' — the full model&rsquo;s leave-one-out median miss');
  var od = R.odds;
  $('odds-table').innerHTML =
    miniRow('Model', 'Logistic on log age + category, predicting whether a protocol records a token — fitted separately from the value model') +
    miniRow('Trained on', od.trained_on + ' protocols with a listed date (' + pc(od.traded_share) + ' record a token)') +
    miniRow('Hold-out A accuracy', pc(od.holdout_a_accuracy) + ' vs ' + pc(od.holdout_a_base) + ' base rate (n=' + od.holdout_a_n + ')') +
    miniRow('Hold-out B accuracy', pc(od.holdout_b_accuracy) + ' vs ' + pc(od.holdout_b_base) + ' base rate (n=' + od.holdout_b_n + ', second independent split)') +
    miniRow('Age coefficient', '+' + od.age_coefficient.toFixed(3) + ' — older protocols are more likely to record a token, so launch odds (1 minus the fitted rate) fall with age') +
    miniRow('Board odds', 'median ' + pc(od.board_median) + ', P25–P75 ' + pc(od.board_p25) + '–' + pc(od.board_p75) + ', P10–P90 ' + pc(od.board_p10) + '–' + pc(od.board_p90)) +
    miniRow('Odds-weighted ranking (tested, not shipped)', val.odds_ranking.map(function (o) { return o.test + ' (n=' + o.n + '): Spearman ' + o.spearman_raw.toFixed(3) + ' raw vs ' + o.spearman_weighted.toFixed(3) + ' weighted, top-10 ' + Math.round(o.top10_raw * 100) + '% vs ' + Math.round(o.top10_weighted * 100) + '%, top-20 ' + Math.round(o.top20_raw * 100) + '% vs ' + Math.round(o.top20_weighted * 100) + '%'; }).join('; ') + ' — the weighting does not rank better, so the board ranks by raw launch value');
  $('odds-cal').textContent = 'Calibration, hold-out A quintiles (mean predicted token rate vs observed share): ' +
    od.calibration.map(function (b) { return pc(b.predicted) + ' vs ' + pc(b.observed) + ' (n=' + b.n + ')'; }).join(' · ') +
    '. The odds are the peers\u2019 record — a signal for the expected slice, never a forecast that a token will launch.';
  $('drop-table').innerHTML = '<tr><th>Variant tried</th><th class="num">Leave-one-out</th><th class="num">Blind 2025 / 2024</th><th class="num">5-fold CV</th><th>Why it lost</th></tr>' +
    val.dropped.map(function (d) {
      return '<tr><td>' + esc(d.name) + '</td><td class="num">×' + d.loo_median_miss_x.toFixed(2) + '</td><td class="num">×' + d.blind2025_median_miss_x.toFixed(2) + ' / ×' + d.blind2024_median_miss_x.toFixed(2) + '</td><td class="num">×' + d.cv_median_miss_x.toFixed(2) + '</td><td>' + esc(d.note) + '</td></tr>';
    }).join('');
  $('best-hour').textContent = 'Best net per hands-on hour: ' + R.best_per_hour.name + ' at ' + dollars(R.best_per_hour.net_per_hour_usd) +
    '/h; best on the watchlist: ' + R.best_per_hour_watchlist.name + ' at ' + dollars(R.best_per_hour_watchlist.net_per_hour_usd) + '/h.';

  $('econ-notes').innerHTML = [
    'Airdrop pool: ' + Math.round(econ.airdrop_share * 100) + '% of the implied value, shared pro-rata by TVL among depositors.',
    'Slice priced at the snapshot\'s TVL — the protocol as it stands today. TVL is not projected forward: if it grows during the hold the slice overstates (dilution); if it shrinks it understates (concentration).',
    'Position: $' + econ.position_usd.toLocaleString('en-US') + ' of capital; setup gas $' + econ.setup_gas_usd + ', weekly gas $' + econ.weekly_gas_usd + '.',
    'Forgone yield: ' + Math.round(econ.tbill_annual_rate * 100) + '% a year on the position while it sits in the farm.',
    'Hands-on time: ' + econ.setup_minutes + ' min setup, ' + econ.weekly_minutes + ' min a week, ' + econ.claim_minutes + ' min to claim.',
    'Verdict: FARM at $' + (econ.position_usd * 0.01) + ' net or more (1% of the deposit), THIN at $0 or more, SKIP below $0.',
    'What-if controls re-net every row live: deposit $1,000 / $5,000 / $25,000, drop share 5% / 10% / 20%, T-bill 0% / 4% / 8%. The FARM threshold scales to 1% of the deposit; the farm plans stay written for the base scenario.',
    'Launch odds weight the expected slice in the detail view (odds × slice) — the verdict still nets the full slice, because the odds are a signal, not a discount.',
  ].map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');

  /* The scatter: traded tokens against the fitted curve, with the backtest band. */
  (function scatter() {
    var W = 560, H = 340, padL = 46, padB = 34, padT = 10, padR = 10;
    var xs = R.comps.map(function (c) { return c[0]; });
    var ys = R.comps.map(function (c) { return c[1]; });
    var x0 = Math.floor(Math.min.apply(null, xs)), x1 = Math.ceil(Math.max.apply(null, xs));
    var y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
    var X = function (x) { return padL + ((x - x0) / (x1 - x0)) * (W - padL - padR); };
    var Y = function (y) { return H - padB - ((y - y0) / (y1 - y0)) * (H - padT - padB); };
    var band = Math.log10(R.band_median_miss_x);
    var parts = [];
    parts.push('<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img">');
    for (var gx = x0; gx <= x1; gx++) {
      parts.push('<line x1="' + X(gx).toFixed(1) + '" y1="' + padT + '" x2="' + X(gx).toFixed(1) + '" y2="' + (H - padB) + '" stroke="#2a3140" stroke-width="1"/>');
      parts.push('<text x="' + X(gx).toFixed(1) + '" y="' + (H - 10) + '" font-size="10" fill="#6b7280" text-anchor="middle">10^' + gx + '</text>');
    }
    for (var gy = y0; gy <= y1; gy++) {
      parts.push('<line x1="' + padL + '" y1="' + Y(gy).toFixed(1) + '" x2="' + (W - padR) + '" y2="' + Y(gy).toFixed(1) + '" stroke="#2a3140" stroke-width="1"/>');
      parts.push('<text x="' + (padL - 6) + '" y="' + (Y(gy) + 3).toFixed(1) + '" font-size="10" fill="#6b7280" text-anchor="end">10^' + gy + '</text>');
    }
    var curveTop = [], curveBot = [];
    for (var i = 0; i <= 20; i++) {
      var x = x0 + ((x1 - x0) * i) / 20;
      var y = curve.intercept + curve.slope * x + curve.quadratic * x * x;
      curveTop.push(X(x).toFixed(1) + ',' + Y(y + band).toFixed(1));
      curveBot.push(X(x).toFixed(1) + ',' + Y(y - band).toFixed(1));
    }
    parts.push('<polygon points="' + curveTop.join(' ') + ' ' + curveBot.reverse().join(' ') + '" fill="rgba(242,179,61,0.14)"/>');
    parts.push('<polyline points="' + curveTop.map(function (pt, k) {
      var x = x0 + ((x1 - x0) * k) / 20;
      return X(x).toFixed(1) + ',' + Y(curve.intercept + curve.slope * x + curve.quadratic * x * x).toFixed(1);
    }).join(' ') + '" fill="none" stroke="#f2b33d" stroke-width="2" stroke-dasharray="6,4"/>');
    R.comps.forEach(function (c) {
      parts.push('<circle cx="' + X(c[0]).toFixed(1) + '" cy="' + Y(c[1]).toFixed(1) + '" r="3" fill="#f2b33d" fill-opacity="0.55"/>');
    });
    parts.push('<text x="' + ((W + padL - padR) / 2) + '" y="' + (H - 22) + '" font-size="10" fill="#9aa3b2" text-anchor="middle">log10 TVL (USD)</text>');
    parts.push('<text x="12" y="' + ((H - padB + padT) / 2) + '" font-size="10" fill="#9aa3b2" text-anchor="middle" transform="rotate(-90 12 ' + ((H - padB + padT) / 2) + ')">log10 market cap (USD)</text>');
    parts.push('</svg>');
    $('scatter').innerHTML = parts.join('');
  })();

  renderBoard();
})();
