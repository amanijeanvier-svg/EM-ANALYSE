/* EA BASKETBALL ENGINE V2 — distribution centrale unique + Monte Carlo + garde-fous de cohérence.
   Toutes les probabilités (victoire, handicap, total, total équipe, marge, fourchettes de score) sont comptées
   sur les MÊMES simulations. Aucune prédiction codée en dur. Coefficients dans CONFIG (provisional:true). */
(function (g) {
  'use strict';
  var EA = g.EA = g.EA || {};

  var CONFIG = {
    provisional: true,
    iterations: { default: 10000, options: [1000, 5000, 10000, 50000] },
    // bruit du générateur de scores (repris du moteur historique, désormais nommé et configurable)
    sd: { team: 8.5, teamMissingExtra: 14, pace: 6, modelErr: 4, earlyMult: 1.10, scoreFloor: 45 },
    // shrinkage début de saison : marge attendue × n / (n + k), n = plus petit échantillon (plancher 1)
    early: { maxGames: 3, k: 6 },
    // pts de marge par unité d'écart de force (Elo/classement/H2H) — remplace l'ancien « nudge » hors distribution
    strengthMarginPts: 2.2,
    // filtre des probabilités extrêmes
    ext: { verify: 0.95, second: 0.98, extreme: 0.99, ceiling: 0.99, stressSdMult: 1.25, stressShrink: 0.85, warnDrop: 0.05 },
    consistency: { tol: 0.08, sdTol: 0.25, ladder: [0.5, 5.5, 10.5, 15.5, 20.5] },
    // stats de comptage (rebonds, passes) : variance = moyenne × dispersion ; erreur relative sur la moyenne
    count: { dispersion: 1.3, meanErrPct: 0.06, meanErrPctLowData: 0.12 },
    market: { reviewGapPts: 15, valueEdgePts: 3 },
    calibration: { minN: 30, bucketMinN: 5, overconfidentGap: 0.10 }
  };

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function merge(base, over) { var o = JSON.parse(JSON.stringify(base)); (function rec(a, b) { for (var k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') rec(a[k], b[k]); else a[k] = b[k]; } })(o, over || {}); return o; }
  function gauss(rng) { var u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function phi(z) { // Φ(z) — Abramowitz-Stegun 7.1.26
    var s = z < 0 ? -1 : 1, x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return 0.5 * (1 + s * y);
  }
  function probit(p) { var lo = -8, hi = 8, i, mid; for (i = 0; i < 60; i++) { mid = (lo + hi) / 2; if (phi(mid) < p) lo = mid; else hi = mid; } return (lo + hi) / 2; }
  function laplace(count, n) { return (count + 1) / (n + 2); } // jamais exactement 0 ou 1 sur un échantillon fini
  function quantile(sorted, q) { if (!sorted.length) return null; var i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
  function meanOf(a) { var s = 0, i; for (i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : null; }
  function sdOf(a) { var m = meanOf(a), s = 0, i; if (a.length < 2) return null; for (i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return Math.sqrt(s / (a.length - 1)); }

  // ---------- 1. Early season + shrinkage ----------
  function earlyState(nA, nB, cfg) {
    cfg = cfg || CONFIG;
    var n = Math.min(isNum(nA) ? nA : 0, isNum(nB) ? nB : 0), mode = n <= cfg.early.maxGames;
    var neff = Math.max(1, n), factor = mode ? neff / (neff + cfg.early.k) : 1;
    return { mode: mode, sample: n, factor: factor, label: mode ? 'EARLY SEASON — SAMPLE SIZE : LOW — UNCERTAINTY : HIGH' : null };
  }
  // Rétrécit la MARGE attendue vers 0 (référence de ligue), conserve le total attendu.
  function shrinkExpected(ptsA, ptsB, early) {
    var tot = ptsA + ptsB, mar = (ptsA - ptsB) * (early.mode ? early.factor : 1);
    return { ptsA: (tot + mar) / 2, ptsB: (tot - mar) / 2 };
  }

  // ---------- 2. Simulation jointe ----------
  function simulate(ptsA, ptsB, o) {
    o = o || {}; var cfg = o.config || CONFIG, it = o.iterations || cfg.iterations.default, rng = o.rng || Math.random;
    var dc = clamp(isNum(o.dataConfidence) ? o.dataConfidence : 0.5, 0, 1), sm = isNum(o.sigmaMult) ? o.sigmaMult : 1;
    var sigma = (cfg.sd.team + cfg.sd.teamMissingExtra * (1 - dc)) * sm, paceSd = cfg.sd.pace * sm, errSd = cfg.sd.modelErr * sm;
    var a = new Int16Array(it), b = new Int16Array(it), i, pace, err, xa, xb, ra, rb;
    for (i = 0; i < it; i++) {
      pace = gauss(rng) * paceSd; err = gauss(rng) * errSd / 2; // rythme commun + erreur du modèle sur l'écart
      xa = Math.max(cfg.sd.scoreFloor, ptsA + pace + err + gauss(rng) * sigma);
      xb = Math.max(cfg.sd.scoreFloor, ptsB + pace - err + gauss(rng) * sigma);
      ra = Math.round(xa); rb = Math.round(xb);
      if (ra === rb) { if (xa >= xb) ra++; else rb++; } // pas de nul en basket (prolongation)
      a[i] = ra; b[i] = rb;
    }
    return { a: a, b: b, n: it, sigma: sigma, paceSd: paceSd, errSd: errSd };
  }
  function toPairs(sim) { var out = new Array(sim.n), i; for (i = 0; i < sim.n; i++) out[i] = { a: sim.a[i], b: sim.b[i] }; return out; }

  // ---------- 3. Marchés = comptages sur la même distribution ----------
  function marketFns(sim) {
    var n = sim.n, a = sim.a, b = sim.b;
    function count(fn) { var c = 0, i; for (i = 0; i < n; i++) if (fn(a[i], b[i])) c++; return c; }
    return {
      n: n,
      winA: function () { return laplace(count(function (x, y) { return x > y; }), n); },
      winB: function () { return laplace(count(function (x, y) { return y > x; }), n); },
      rawWinA: function () { return count(function (x, y) { return x > y; }) / n; },
      // handicap appliqué à A : A + line > B (ligne en .5 → pas de push)
      spreadA: function (line) { return laplace(count(function (x, y) { return x + line > y; }), n); },
      totalOver: function (line) { return laplace(count(function (x, y) { return x + y > line; }), n); },
      teamOver: function (team, line) { return laplace(count(function (x, y) { return (team === 'A' ? x : y) > line; }), n); },
      marginAbove: function (h) { return laplace(count(function (x, y) { return x - y > h; }), n); }, // P(A gagne de plus de h)
      exactScore: function (sa, sb) { return count(function (x, y) { return x === sa && y === sb; }) / n; },
      scoreRanges: function (width, top) {
        width = width || 4; var map = {}, i, k, ka, kb, rows = [];
        for (i = 0; i < n; i++) { ka = Math.floor(a[i] / width) * width; kb = Math.floor(b[i] / width) * width; k = ka + '|' + kb; map[k] = (map[k] || 0) + 1; }
        for (k in map) { var p = k.split('|'); rows.push({ aLo: +p[0], aHi: +p[0] + width - 1, bLo: +p[1], bHi: +p[1] + width - 1, p: map[k] / n }); }
        rows.sort(function (x, y) { return y.p - x.p; }); return rows.slice(0, top || 5);
      },
      marginBrackets: function () {
        var d = {}, i, m, s, br, k, out = [];
        for (i = 0; i < n; i++) { m = a[i] - b[i]; s = m > 0 ? 'A' : 'B'; m = Math.abs(m); br = m <= 5 ? '1-5' : m <= 10 ? '6-10' : m <= 15 ? '11-15' : m <= 20 ? '16-20' : '21+'; k = s + '|' + br; d[k] = (d[k] || 0) + 1; }
        for (k in d) out.push({ side: k.split('|')[0], bracket: k.split('|')[1], p: d[k] / n });
        out.sort(function (x, y) { return y.p - x.p; }); return out;
      },
      stats: function () {
        var m = new Array(n), t = new Array(n), i; for (i = 0; i < n; i++) { m[i] = a[i] - b[i]; t[i] = a[i] + b[i]; }
        var sm = m.slice().sort(function (x, y) { return x - y; }), st = t.slice().sort(function (x, y) { return x - y; });
        function d(v, s) { return { mean: meanOf(v), median: quantile(s, 0.5), sd: sdOf(v), variance: Math.pow(sdOf(v) || 0, 2), p5: quantile(s, 0.05), p10: quantile(s, 0.1), p25: quantile(s, 0.25), p75: quantile(s, 0.75), p90: quantile(s, 0.9), p95: quantile(s, 0.95) }; }
        var ma = Array.prototype.slice.call(a), mb = Array.prototype.slice.call(b);
        return { margin: d(m, sm), total: d(t, st), pointsA: { mean: meanOf(ma), sd: sdOf(ma) }, pointsB: { mean: meanOf(mb), sd: sdOf(mb) } };
      }
    };
  }

  // ---------- 4. Filtre des probabilités extrêmes ----------
  // p : probabilité de l'événement retenu ; stressP : recalcul indépendant (analytique, prudent) ; certain : événement mathématiquement certain
  function extremeFilter(p, stressP, o) {
    o = o || {}; var cfg = o.config || CONFIG, e = cfg.ext, side = Math.max(p, 1 - p), flags = [], level = 'OK', disp = p, raw = p;
    if (o.certain === true) return { raw: raw, p: p, level: 'CERTAIN', flags: ['événement mathématiquement certain'], blocked: false };
    if (side >= 1) { flags.push('100 % BLOQUÉ (événement sportif non certain)'); level = 'BLOCKED'; }
    if (side > e.verify) { level = level === 'BLOCKED' ? level : 'VERIFY'; flags.push('P > ' + Math.round(e.verify * 100) + ' % : données à vérifier'); }
    if (side > e.second) { level = level === 'BLOCKED' ? level : 'SECOND CHECK'; flags.push('P > ' + Math.round(e.second * 100) + ' % : seconde vérification'); }
    if (side > e.extreme) { level = level === 'BLOCKED' ? level : 'EXTREME CONFIDENCE — VERIFY MODEL'; flags.push('EXTREME CONFIDENCE — VERIFY MODEL'); }
    if (isNum(stressP)) {
      var sSide = p >= 0.5 ? stressP : 1 - stressP;
      if (side > e.second && (side - Math.max(sSide, 1 - sSide)) > e.warnDrop && ((p >= 0.5) === (stressP >= 0.5))) flags.push('MODEL WARNING : recalcul indépendant à ' + (Math.max(sSide, 1 - sSide) * 100).toFixed(1) + ' %');
      if (side > e.extreme) { disp = p >= 0.5 ? Math.min(p, stressP) : Math.max(p, stressP); }
    }
    disp = p >= 0.5 ? Math.min(disp, e.ceiling) : Math.max(disp, 1 - e.ceiling);
    if (disp !== raw) flags.push('probabilité affichée ramenée à ' + (disp * 100).toFixed(1) + ' % (recalcul indépendant / plafond de sécurité)');
    return { raw: raw, p: disp, level: level, flags: flags, blocked: level === 'BLOCKED', altered: disp !== raw };
  }
  // recalcul analytique indépendant : moyenne rétrécie, écart-type gonflé (config.ext)
  function stressMargin(mean, sd, cfg) { var e = (cfg || CONFIG).ext; return phi((mean * e.stressShrink) / (sd * e.stressSdMult)); } // P(A gagne)

  // ---------- 5. Cohérence entre marchés ----------
  // displayed : {winA, spreads:[{line,p}], totals:[{line,p}]} — valeurs telles qu'AFFICHÉES à l'utilisateur
  function consistency(sim, displayed, o) {
    var cfg = (o && o.config) || CONFIG, c = cfg.consistency, fn = marketFns(sim), st = fn.stats(), issues = [], checks = [];
    var winSim = fn.winA();
    // 1. probabilité affichée = probabilité de la distribution
    if (displayed && isNum(displayed.winA)) {
      var d1 = Math.abs(displayed.winA - winSim); checks.push({ name: 'victoire affichée = simulation', ok: d1 <= c.tol, gapPts: d1 * 100 });
      if (d1 > c.tol) issues.push('PROBABILITY INCONSISTENCY : victoire affichée ' + (displayed.winA * 100).toFixed(1) + ' % vs simulation ' + (winSim * 100).toFixed(1) + ' %');
    }
    // 2. échelle de handicaps monotone décroissante
    var prev = 1, mono = true, ladder = c.ladder.map(function (h) { var p = fn.marginAbove(h); if (p > prev + 1e-9) mono = false; prev = p; return { line: h, p: p }; });
    checks.push({ name: 'échelle de marges monotone', ok: mono }); if (!mono) issues.push('PROBABILITY INCONSISTENCY : échelle de marges non monotone');
    // 3. σ implicite de la victoire vs σ de la distribution (cas « victoire 99,7 % mais -20,5 à 63 % »)
    var mu = st.margin.mean, sd = st.margin.sd, pw = clamp(winSim, 1e-6, 1 - 1e-6);
    if (isNum(mu) && isNum(sd) && Math.abs(mu) > 0.5 && sd > 0) {
      var z = probit(mu >= 0 ? pw : 1 - pw), impl = z !== 0 ? Math.abs(mu) / Math.abs(z) : null, okS = impl == null || Math.abs(impl - sd) / sd <= c.sdTol;
      checks.push({ name: 'σ implicite de la victoire ≈ σ de la marge', ok: okS, implied: impl, actual: sd });
      if (!okS) issues.push('PROBABILITY INCONSISTENCY : σ implicite ' + (impl == null ? '—' : impl.toFixed(1)) + ' vs σ simulé ' + sd.toFixed(1));
    }
    // 4. handicaps / totaux affichés vs simulation
    (displayed && displayed.spreads || []).forEach(function (s) { var d = Math.abs(s.p - fn.spreadA(s.line)); checks.push({ name: 'handicap ' + s.line, ok: d <= c.tol }); if (d > c.tol) issues.push('PROBABILITY INCONSISTENCY : handicap ' + s.line + ' affiché ≠ simulation'); });
    (displayed && displayed.totals || []).forEach(function (s) { var d = Math.abs(s.p - fn.totalOver(s.line)); checks.push({ name: 'total ' + s.line, ok: d <= c.tol }); if (d > c.tol) issues.push('PROBABILITY INCONSISTENCY : total ' + s.line + ' affiché ≠ simulation'); });
    return { ok: issues.length === 0, issues: issues, checks: checks, ladder: ladder };
  }

  // ---------- 6. Incertitude du modèle ----------
  function uncertainty(o) {
    o = o || {}; var pts = 0, why = [];
    var n = o.sample;
    if (!isNum(n) || n <= 3) { pts += 2; why.push('échantillon très faible'); } else if (n <= 8) { pts += 1; why.push('échantillon faible'); }
    if (o.earlyMode) { pts += 1; why.push('début de saison'); }
    if (isNum(o.dataConfidence)) { if (o.dataConfidence < 0.35) { pts += 2; why.push('données très incomplètes'); } else if (o.dataConfidence < 0.6) { pts += 1; why.push('données partielles'); } }
    if (o.oneSided) { pts += 2; why.push('une équipe sans donnée propre'); }
    if (o.absencesUnknown) { pts += 1; why.push('absents / lineup inconnus ou douteux'); }
    if (o.contradictory) { pts += 1; why.push('signaux contradictoires (marge vs Elo/classement)'); }
    if (!o.calibrated) { pts += 1; why.push('modèle non calibré'); }
    if (o.marketDivergence) { pts += 1; why.push('écart modèle-marché'); }
    if (o.extreme) { pts += 1; why.push('probabilité extrême détectée'); }
    return { points: pts, level: pts <= 1 ? 'LOW' : pts <= 3 ? 'MEDIUM' : pts <= 5 ? 'HIGH' : 'VERY HIGH', reasons: why };
  }

  // ---------- 7. Marché = benchmark ----------
  function marketCompare(pModel, oddsSelf, oddsOther, o) {
    var cfg = (o && o.config) || CONFIG, m = cfg.market;
    if (!isNum(oddsSelf) || oddsSelf <= 1 || !isNum(oddsOther) || oddsOther <= 1) return { available: false, verdict: 'UNCERTAIN', note: 'cotes des deux équipes non saisies' };
    var i1 = 1 / oddsSelf, i2 = 1 / oddsOther, over = i1 + i2 - 1, fair = i1 / (i1 + i2), gap = (pModel - fair) * 100, ev = pModel * oddsSelf - 1, review = Math.abs(gap) >= m.reviewGapPts;
    var uLevel = o && o.uncertainty, verdict = review ? 'UNCERTAIN' : (gap >= m.valueEdgePts && ev > 0 && uLevel !== 'HIGH' && uLevel !== 'VERY HIGH') ? 'VALUE' : (gap <= 0 || ev <= 0) ? 'NO VALUE' : 'UNCERTAIN';
    return { available: true, marketImpliedRaw: i1, marketFair: fair, overroundPct: over * 100, edgePts: gap, ev: ev, review: review, flag: review ? 'MODEL-MARKET DIVERGENCE — MODEL REVIEW REQUIRED (' + (gap >= 0 ? '+' : '') + gap.toFixed(1) + ' pts)' : null, verdict: verdict };
  }

  // ---------- 8. Rebonds / passes : distribution surdispersée avec erreur sur la moyenne ----------
  function countDistribution(mean, o) {
    o = o || {}; var cfg = o.config || CONFIG, it = o.iterations || cfg.iterations.default, rng = o.rng || Math.random, c = cfg.count;
    var errPct = o.lowData ? c.meanErrPctLowData : c.meanErrPct, vals = new Float32Array(it), i, mu, sd;
    for (i = 0; i < it; i++) { mu = mean * (1 + gauss(rng) * errPct); sd = Math.sqrt(Math.max(1e-6, mu * c.dispersion)); vals[i] = Math.max(0, Math.round(mu + gauss(rng) * sd)); }
    return { vals: vals, n: it, mean: mean, sd: sdOf(Array.prototype.slice.call(vals)) };
  }
  function countLineMarket(mean, minLine, unit, o) {
    o = o || {}; var cfg = o.config || CONFIG, dist = countDistribution(mean, o), base = Math.max(minLine, Math.floor(mean) - 0.5), best = null, k;
    [base, base + 1, base + 2].forEach(function (line) {
      var over = 0, i; for (i = 0; i < dist.n; i++) if (dist.vals[i] > line) over++;
      var pOver = laplace(over, dist.n), pick = pOver >= 1 - pOver ? 'over' : 'under', p = pick === 'over' ? pOver : 1 - pOver;
      var sp = phi((mean - line) / (dist.sd * cfg.ext.stressSdMult)), stress = pick === 'over' ? 1 - sp : sp;
      var f = extremeFilter(p, stress, { config: cfg });
      var cand = { label: (pick === 'over' ? 'Plus de ' : 'Moins de ') + line + ' ' + unit, p: f.p, rawP: p, ext: f, eval: { type: 'goalsLine', op: pick, line: line }, iterationsRun: dist.n };
      if (!best || cand.p > best.p) best = cand;
    });
    return best;
  }

  // ---------- 9. Calibration ----------
  function calibrationCheck(obs, o) {
    var cfg = (o && o.config) || CONFIG, v = (obs || []).filter(function (x) { return isNum(x.p) && x.p >= 0 && x.p <= 1 && typeof x.hit === 'boolean'; }), n = v.length;
    if (n < cfg.calibration.minN) return { n: n, status: 'INSUFFICIENT DATA', overconfident: null, note: 'calibration impossible sous ' + cfg.calibration.minN + ' résultats' };
    var buckets = [], i, brier = 0, ll = 0, ece = 0;
    for (i = 0; i < 10; i++) buckets.push({ range: i * 10 + '–' + (i * 10 + 10) + '%', n: 0, sp: 0, hits: 0 });
    v.forEach(function (x) { var y = x.hit ? 1 : 0, q = clamp(x.p, 1e-4, 1 - 1e-4), b = buckets[Math.min(9, Math.floor(x.p * 10))]; brier += (x.p - y) * (x.p - y); ll += -(y ? Math.log(q) : Math.log(1 - q)); b.n++; b.sp += x.p; b.hits += y; });
    var over = false;
    buckets.forEach(function (b) { if (b.n) { b.meanP = b.sp / b.n; b.freq = b.hits / b.n; ece += b.n / n * Math.abs(b.meanP - b.freq); if (b.n >= cfg.calibration.bucketMinN && b.meanP - b.freq > cfg.calibration.overconfidentGap) over = true; } });
    return { n: n, status: over ? 'MODEL OVERCONFIDENT' : 'OK', overconfident: over, brier: brier / n, logLoss: ll / n, ece: ece, buckets: buckets };
  }

  // ---------- 10. Audit avant affichage ----------
  function audit(a) {
    var checks = [], invalid = false, warn = false;
    function add(name, ok, sev, msg) { checks.push({ name: name, ok: ok, msg: ok ? null : msg }); if (!ok) { if (sev === 'invalid') invalid = true; else warn = true; } }
    add('DATA CHECK', isNum(a.dataConfidence) && a.dataConfidence >= 0.25, 'warn', 'données insuffisantes');
    add('MODEL CHECK', isNum(a.ptsA) && isNum(a.ptsB) && a.ptsA > 30 && a.ptsB > 30 && a.ptsA < 200 && a.ptsB < 200, 'invalid', 'points attendus hors plage plausible');
    add('DISTRIBUTION CHECK', a.iterationsRun === a.iterationsRequested && isNum(a.sdMargin) && a.sdMargin > 0 && !isNaN(a.meanMargin), 'invalid', 'distribution invalide ou simulations non exécutées');
    add('PROBABILITY CHECK', isNum(a.winA) && isNum(a.winB) && a.winA >= 0 && a.winA <= 1 && Math.abs(a.winA + a.winB - 1) < 1e-6, 'invalid', 'probabilités hors [0,1] ou somme ≠ 1');
    add('MARKET CHECK', !a.market || !a.market.review, 'warn', a.market && a.market.flag);
    add('CONSISTENCY CHECK', !a.consistency || a.consistency.ok, 'warn', a.consistency && a.consistency.issues.join(' ; '));
    add('EXTREME PROBABILITY CHECK', !a.extremes || a.extremes.every(function (e) { return e.level === 'OK' || e.level === 'VERIFY' || e.level === 'CERTAIN'; }), 'warn', 'probabilité extrême détectée');
    return { status: invalid ? 'ANALYSIS INVALID' : warn ? 'MODEL WARNING' : 'OK', checks: checks };
  }

  // ---------- 11. Analyse complète ----------
  function analyze(inp) {
    var cfg = merge(CONFIG, inp.config), it = inp.iterations || cfg.iterations.default, nA = inp.sampleA, nB = inp.sampleB;
    var early = earlyState(nA, nB, cfg), raw = { ptsA: inp.ptsA, ptsB: inp.ptsB };
    var pa = inp.ptsA, pb = inp.ptsB;
    if (isNum(inp.strengthGap) && inp.strengthGap !== 0) { var shift = inp.strengthGap * cfg.strengthMarginPts / 2; pa += shift; pb -= shift; } // écart de force injecté DANS la distribution
    var sh = shrinkExpected(pa, pb, early); pa = sh.ptsA; pb = sh.ptsB;
    var sm = (isNum(inp.sigmaMult) ? inp.sigmaMult : 1) * (early.mode ? cfg.sd.earlyMult : 1);
    var sim = simulate(pa, pb, { config: cfg, iterations: it, rng: inp.rng, dataConfidence: inp.dataConfidence, sigmaMult: sm });
    var fn = marketFns(sim), st = fn.stats(), mu = st.margin.mean, sd = st.margin.sd;
    var pWinA = fn.winA(), fA = extremeFilter(pWinA, stressMargin(mu, sd, cfg), { config: cfg }), fB = extremeFilter(1 - pWinA, 1 - stressMargin(mu, sd, cfg), { config: cfg });
    var winA = fA.p, winB = 1 - winA;
    var displayed = { winA: winA, spreads: [], totals: [] };
    var lines = { spread: inp.spreadLine, total: inp.totalLine, teamTotalA: inp.teamTotalLineA, teamTotalB: inp.teamTotalLineB }, mk = {};
    if (isNum(lines.spread)) { var ps = fn.spreadA(lines.spread), fs = extremeFilter(ps, phi(((mu + lines.spread) * cfg.ext.stressShrink) / (sd * cfg.ext.stressSdMult)), { config: cfg }); mk.spreadA = { line: lines.spread, p: fs.p, ext: fs }; displayed.spreads.push({ line: lines.spread, p: ps }); }
    if (isNum(lines.total)) { var po = fn.totalOver(lines.total), tsd = st.total.sd, fo = extremeFilter(po, 1 - phi((lines.total - st.total.mean) / (tsd * cfg.ext.stressSdMult)), { config: cfg }); mk.total = { line: lines.total, over: fo.p, under: 1 - fo.p, ext: fo }; displayed.totals.push({ line: lines.total, p: po }); }
    if (isNum(lines.teamTotalA)) mk.teamTotalA = { line: lines.teamTotalA, over: fn.teamOver('A', lines.teamTotalA) };
    if (isNum(lines.teamTotalB)) mk.teamTotalB = { line: lines.teamTotalB, over: fn.teamOver('B', lines.teamTotalB) };
    var cons = consistency(sim, { winA: pWinA, spreads: displayed.spreads, totals: displayed.totals }, { config: cfg });
    var ranges = fn.scoreRanges(4, 5), extremes = [fA, fB].concat(mk.spreadA ? [mk.spreadA.ext] : [], mk.total ? [mk.total.ext] : []);
    var anyExtreme = extremes.some(function (e) { return e.level !== 'OK'; });
    var marketRes = (isNum(inp.oddsA) && isNum(inp.oddsB)) ? marketCompare(winA, inp.oddsA, inp.oddsB, { config: cfg }) : null;
    var unc = uncertainty({ sample: early.sample, earlyMode: early.mode, dataConfidence: inp.dataConfidence, oneSided: inp.oneSided, absencesUnknown: inp.absencesUnknown, contradictory: isNum(inp.eloSign) && inp.eloSign !== 0 && Math.sign(inp.eloSign) !== Math.sign(mu), calibrated: inp.calibrated === true, marketDivergence: !!(marketRes && marketRes.review), extreme: anyExtreme });
    var aud = audit({ dataConfidence: inp.dataConfidence, ptsA: pa, ptsB: pb, iterationsRun: sim.n, iterationsRequested: it, sdMargin: sd, meanMargin: mu, winA: winA, winB: winB, market: marketRes, consistency: cons, extremes: extremes });
    var decision = decide(aud, unc, marketRes);
    return {
      version: 'EA-BK2', provisional: cfg.provisional, config: cfg,
      early: early, expected: { A: pa, B: pb, total: pa + pb, margin: pa - pb, raw: raw },
      simulation: { iterationsRequested: it, iterationsRun: sim.n, sigma: sim.sigma, paceSd: sim.paceSd },
      probabilities: { winA: winA, winB: winB, winAraw: pWinA, filterA: fA, filterB: fB },
      distribution: { margin: st.margin, total: st.total, pointsA: st.pointsA, pointsB: st.pointsB, scoreRanges: ranges, mostLikelyRange: ranges[0] || null },
      markets: mk, market: marketRes, uncertainty: unc, consistency: cons, audit: aud, decision: decision,
      fn: fn, sim: sim, pairs: function () { return toPairs(sim); }
    };
  }
  function decide(aud, unc, mkt) {
    if (aud.status === 'ANALYSIS INVALID') return 'NO BET';
    if (unc.level === 'VERY HIGH') return 'NO BET';
    if (mkt && mkt.available) { if (mkt.verdict === 'VALUE' && aud.status === 'OK') return 'BET'; if (mkt.verdict === 'NO VALUE') return 'NO BET'; return 'CHECK'; }
    return 'CHECK';
  }


  // ---------- 12. Affichage (format §24 du cahier des charges) ----------
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pct(p) { return (p * 100).toFixed(1) + '%'; }
  function qualityLabel(dc) { return dc >= 0.7 ? 'HIGH' : dc >= 0.4 ? 'MEDIUM' : 'LOW'; }
  function half(x) { return Math.round(x - 0.5) + 0.5; }
  function badge(f) { return f && f.level && f.level !== 'OK' ? ' <span class="bk2-flag">' + esc(f.level) + '</span>' : ''; }
  function renderPanel(v2, ctx) {
    var A = esc(ctx.nameA), B = esc(ctx.nameB), fn = v2.fn, e = v2.expected, d = v2.distribution, pr = v2.probabilities, u = v2.uncertainty, au = ctx.audit || v2.audit, i;
    var favA = e.margin >= 0, fav = favA ? A : B, rows = [];
    function row(label, p, f) { return '<div class="bk2-r"><span>' + label + '</span><b>' + pct(p) + '</b>' + badge(f) + '</div>'; }
    function guard(p) { return extremeFilter(p, null, { config: v2.config }); }
    var out = '<div class="bk2-card"><div class="bk2-title">EA BASKETBALL ANALYSIS</div><div class="bk2-vs">' + A + ' <i>vs</i> ' + B + '</div>' +
      '<div class="bk2-grid"><span>DATA QUALITY</span><b>' + qualityLabel(ctx.dataConfidence) + '</b><span>SAMPLE</span><b>' + (isNum(v2.early.sample) ? v2.early.sample : 0) + ' match(s)</b><span>EARLY SEASON</span><b>' + (v2.early.mode ? 'YES' : 'NO') + '</b></div>' +
      (v2.early.mode ? '<div class="bk2-warn">' + esc(v2.early.label) + ' · marge attendue rétrécie ×' + v2.early.factor.toFixed(2) + ' (coefficient configurable, provisoire)</div>' : '');
    out += '<div class="bk2-sec">PROJECTION</div><div class="bk2-grid"><span>' + A + '</span><b>' + e.A.toFixed(1) + ' pts</b><span>' + B + '</span><b>' + e.B.toFixed(1) + ' pts</b><span>Expected Total</span><b>' + e.total.toFixed(1) + '</b><span>Expected Margin</span><b>' + (e.margin >= 0 ? '+' : '') + e.margin.toFixed(1) + ' ' + fav + '</b>' +
      '<span>Marge (P10–P90)</span><b>' + d.margin.p10.toFixed(0) + ' à ' + d.margin.p90.toFixed(0) + '</b><span>Total (P10–P90)</span><b>' + d.total.p10.toFixed(0) + ' à ' + d.total.p90.toFixed(0) + '</b></div>';
    if (d.mostLikelyRange) out += '<div class="bk2-note">MOST LIKELY SCORE RANGE : ' + A + ' ' + d.mostLikelyRange.aLo + '–' + d.mostLikelyRange.aHi + ' / ' + B + ' ' + d.mostLikelyRange.bLo + '–' + d.mostLikelyRange.bHi + ' (' + pct(d.mostLikelyRange.p) + ' — un score exact reste peu probable)</div>';
    out += '<div class="bk2-note">Monte Carlo : ' + v2.simulation.iterationsRun.toLocaleString('fr-FR') + ' simulations réellement exécutées · σ marge ' + d.margin.sd.toFixed(1) + ' · σ total ' + d.total.sd.toFixed(1) + ' · coefficients PROVISOIRES</div>';
    out += '<div class="bk2-sec">WIN PROBABILITY</div>' + row(A, pr.winA, pr.filterA) + row(B, pr.winB, pr.filterB);
    out += '<div class="bk2-sec">MARKETS (même distribution)</div><div class="bk2-sub">Handicap ' + fav + '</div>';
    [2.5, 5.5, 10.5, 15.5, 20.5].forEach(function (h) { var p = favA ? fn.spreadA(-h) : 1 - fn.spreadA(h); out += row(fav + ' −' + h, guard(p).p, guard(p)); });
    out += '<div class="bk2-sub">Total points</div>'; var t0 = half(e.total);
    [-10, -5, 0, 5, 10].forEach(function (dl) { var L = t0 + dl, p = fn.totalOver(L); out += row('Plus de ' + L, guard(p).p, guard(p)); });
    out += '<div class="bk2-sub">Total équipe</div>';
    [['A', A, e.A], ['B', B, e.B]].forEach(function (t) { var L = half(t[2]); out += row(t[1] + ' plus de ' + L, guard(fn.teamOver(t[0], L)).p); });
    out += '<div class="bk2-sec">UNCERTAINTY</div><div class="bk2-grid"><span>MODEL UNCERTAINTY</span><b class="bk2-u-' + u.level.replace(' ', '') + '">' + u.level + '</b></div><div class="bk2-note">Confiance du modèle ≠ probabilité de l\'événement. ' + (u.reasons.length ? esc(u.reasons.join(' · ')) : '') + '</div>';
    out += '<div class="bk2-sec">MODEL VS MARKET</div><div class="bk2-odds"><label>Cote ' + A + '<input type="number" step="0.01" min="1.01" id="bk2OddsA" inputmode="decimal"></label><label>Cote ' + B + '<input type="number" step="0.01" min="1.01" id="bk2OddsB" inputmode="decimal"></label></div><div id="bk2MarketOut" class="bk2-note">Saisir les deux cotes pour comparer (le marché sert de benchmark, jamais de vérité).</div>';
    out += '<div class="bk2-sec">DECISION</div><div id="bk2Decision" class="bk2-dec bk2-d-' + v2.decision.replace(' ', '') + '">' + v2.decision + '</div>';
    var why = [];
    why.push('Projection ' + e.A.toFixed(1) + ' – ' + e.B.toFixed(1) + ' : marge attendue ' + (e.margin >= 0 ? '+' : '') + e.margin.toFixed(1) + ' pour ' + fav + ', calculée depuis vos données.');
    if (isNum(e.raw.ptsA) && (Math.abs(e.raw.ptsA - e.A) > 0.05 || Math.abs(e.raw.ptsB - e.B) > 0.05)) why.push('Projection brute ' + e.raw.ptsA.toFixed(1) + ' – ' + e.raw.ptsB.toFixed(1) + ' ajustée (écart de force / rétrécissement début de saison).');
    why.push('σ marge ' + d.margin.sd.toFixed(1) + ' pts : la variance du basket est intégrée, pas seulement l\'écart moyen.');
    why.push('Toutes les probabilités viennent des mêmes ' + v2.simulation.iterationsRun.toLocaleString('fr-FR') + ' simulations.');
    if (ctx.dataConfidence < 0.6) why.push('Données partielles : la dispersion du modèle est élargie en conséquence.');
    out += '<div class="bk2-sec">WHY</div><ul class="bk2-ul">' + why.slice(0, 5).map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>';
    var risks = u.reasons.slice(); if (au.status !== 'OK') au.checks.forEach(function (c) { if (!c.ok && c.msg) risks.push(c.name + ' : ' + c.msg); });
    out += '<div class="bk2-sec">RISKS</div><ul class="bk2-ul">' + (risks.length ? risks.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') : '<li>Aucun risque majeur détecté par l\'audit (lineup et blessures restent à vérifier).</li>') + '</ul>';
    out += '<div class="bk2-sec">AUDIT · ' + au.status + '</div><div class="bk2-audit">' + au.checks.map(function (c) { return '<span class="' + (c.ok ? 'ok' : 'ko') + '">' + (c.ok ? '✓ ' : '⚠ ') + c.name + '</span>'; }).join('') + '</div></div>';
    return out;
  }
  function bindPanel(root, v2, ctx) {
    var a = root.querySelector('#bk2OddsA'), b = root.querySelector('#bk2OddsB'), o = root.querySelector('#bk2MarketOut'), dEl = root.querySelector('#bk2Decision');
    if (!a || !b || !o || !dEl) return;
    function upd() {
      var oa = parseFloat(a.value), ob = parseFloat(b.value), pa = v2.probabilities.winA, pb = v2.probabilities.winB, opt = { config: v2.config, uncertainty: v2.uncertainty.level };
      var rA = marketCompare(pa, oa, ob, opt), rB = marketCompare(pb, ob, oa, opt);
      if (!rA.available) { o.textContent = rA.note; return; }
      var useA = rA.edgePts >= rB.edgePts, r = useA ? rA : rB, pm = useA ? pa : pb, nm = useA ? ctx.nameA : ctx.nameB;
      var aud = ctx.audit || v2.audit, unc = uncertainty({ sample: v2.early.sample, earlyMode: v2.early.mode, dataConfidence: ctx.dataConfidence, oneSided: ctx.oneSided, absencesUnknown: ctx.absencesUnknown, contradictory: false, calibrated: false, marketDivergence: r.review, extreme: false });
      var dec = decide(aud, unc, r);
      o.innerHTML = 'Côté le plus favorable : <b>' + esc(nm) + '</b><br>MODEL : <b>' + pct(pm) + '</b> · MARKET (sans marge) : <b>' + pct(r.marketFair) + '</b> · EDGE : <b>' + (r.edgePts >= 0 ? '+' : '') + r.edgePts.toFixed(1) + ' pts</b> · marge bookmaker ' + r.overroundPct.toFixed(1) + '% · EV ' + (r.ev * 100).toFixed(1) + '% · <b>' + r.verdict + '</b>' + (r.flag ? '<br><span class="bk2-flag">' + esc(r.flag) + '</span>' : '');
      dEl.textContent = dec; dEl.className = 'bk2-dec bk2-d-' + dec.replace(' ', '');
    }
    a.addEventListener('input', upd); b.addEventListener('input', upd);
  }

  EA.bk2 = { CONFIG: CONFIG, analyze: analyze, simulate: simulate, marketFns: marketFns, toPairs: toPairs, earlyState: earlyState, shrinkExpected: shrinkExpected,
    extremeFilter: extremeFilter, consistency: consistency, uncertainty: uncertainty, marketCompare: marketCompare, countDistribution: countDistribution,
    countLineMarket: countLineMarket, calibrationCheck: calibrationCheck, audit: audit, renderPanel: renderPanel, bindPanel: bindPanel, decide: decide, phi: phi, probit: probit, laplace: laplace, stressMargin: stressMargin };
  if (typeof module === 'object' && module.exports) module.exports = EA.bk2;
})(typeof globalThis !== 'undefined' ? globalThis : this);
