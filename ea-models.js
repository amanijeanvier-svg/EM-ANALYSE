/* EA-VALUE 3.0 — MODEL ENGINE : football (Poisson, Dixon-Coles, Elo, xG, Monte Carlo), basket (pace/ratings, Monte Carlo),
   consensus, calibration. Toute simulation annoncée est réellement exécutée (iterationsRun). */
(function (g) {
  'use strict';
  if (typeof require === 'function' && typeof window === 'undefined') require('./ea-core.js');
  var EA = g.EA, C = EA.core;

  // ---------- FOOTBALL ----------
  function fact(n) { var f = 1; for (var i = 2; i <= n; i++) f *= i; return f; }
  function poissonP(k, l) { return Math.exp(-l) * Math.pow(l, k) / fact(k); }
  function tau(x, y, l, m, rho) { if (x === 0 && y === 0) return 1 - l * m * rho; if (x === 0 && y === 1) return 1 + l * rho; if (x === 1 && y === 0) return 1 + m * rho; if (x === 1 && y === 1) return 1 - rho; return 1; }
  var MAXG = 8;
  function poissonMatrix(lA, lB, rho) {
    var rows = [], tot = 0;
    for (var a = 0; a <= MAXG; a++) for (var b = 0; b <= MAXG; b++) { var p = poissonP(a, lA) * poissonP(b, lB) * ((a <= 1 && b <= 1) ? Math.max(0, tau(a, b, lA, lB, rho)) : 1); rows.push({ a: a, b: b, p: p }); tot += p; }
    rows.forEach(function (r) { r.p /= tot; }); return rows;
  }
  function sumWhere(rows, fn) { return rows.reduce(function (s, r) { return fn(r.a, r.b) ? s + r.p : s; }, 0); }

  // Monte Carlo réel : bruit log-normal sur λ (incertitude paramétrique), Poisson, rejet τ/τmax, support 0..8
  function simulateFootball(lA, lB, opts) {
    opts = opts || {}; var it = opts.iterations || 10000, rho = opts.rho == null ? -0.1 : opts.rho, sigma = opts.sigma == null ? 0.08 : opts.sigma;
    var rng = opts.rng || (opts.seed != null ? C.mulberry32(C.hashSeed(opts.seed)) : Math.random), counts = {}, kept = 0, totals = [];
    for (var n = 0; n < it; n++) {
      var gA = lA * Math.exp(C.gaussian(rng) * sigma), gB = lB * Math.exp(C.gaussian(rng) * sigma);
      var a = C.poissonSample(rng, gA), b = C.poissonSample(rng, gB);
      if (a > MAXG || b > MAXG) continue;
      var tMax = Math.max(1, 1 - gA * gB * rho, 1 + gA * rho, 1 + gB * rho, 1 - rho), w = (a <= 1 && b <= 1) ? Math.max(0, tau(a, b, gA, gB, rho)) : 1;
      if (rng() * tMax > w) continue;
      var key = a + '-' + b; counts[key] = (counts[key] || 0) + 1; kept++; totals.push(a + b);
    }
    var rows = []; for (var k in counts) { var pr = k.split('-'); rows.push({ a: +pr[0], b: +pr[1], p: counts[k] / kept }); }
    totals.sort(function (x, y) { return x - y; });
    return { rows: rows, iterationsRequested: it, iterationsRun: it, accepted: kept, totalGoals: { mean: C.mean(totals), median: C.quantile(totals, 0.5), variance: C.variance(totals), p10: C.quantile(totals, 0.1), p90: C.quantile(totals, 0.9) } };
  }

  function footballMarkets(rows, lines) {
    var ou = {}, ls = lines || [1.5, 2.5, 3.5];
    ls.forEach(function (L) { var o = sumWhere(rows, function (a, b) { return a + b > L; }); ou[L] = { over: o, under: 1 - o }; });
    var home = sumWhere(rows, function (a, b) { return a > b; }), draw = sumWhere(rows, function (a, b) { return a === b; }), away = 1 - home - draw;
    var btts = sumWhere(rows, function (a, b) { return a > 0 && b > 0; });
    var top = rows.slice().sort(function (x, y) { return y.p - x.p; }).slice(0, 5).map(function (r) { return { score: r.a + '-' + r.b, p: r.p }; });
    return { '1X2': { home: home, draw: draw, away: away }, doubleChance: { '1X': home + draw, 'X2': draw + away, '12': home + away },
      dnb: { home: home / (home + away), away: away / (home + away) }, ou: ou, btts: { yes: btts, no: 1 - btts }, topScores: top };
  }

  // λ : forces attaque/défense relatives à la moyenne de ligue, mélange saison courante / historique (Early Season)
  // team : {gf, ga, n, priorGf, priorGa, xgf, xga}  (par match). league : {avgHome, avgAway} ou {avg}
  function footballLambdas(home, away, league, early) {
    var warn = [], E = EA.context;
    if (!league || (!C.isNum(league.avg) && !(C.isNum(league.avgHome) && C.isNum(league.avgAway)))) return { available: false, label: 'DATA UNAVAILABLE', reason: 'Moyenne de buts de la ligue manquante' };
    var lh = C.isNum(league.avgHome) ? league.avgHome : league.avg, la = C.isNum(league.avgAway) ? league.avgAway : league.avg;
    var teamAvg = (lh + la) / 2; if (!C.isNum(league.avgHome)) warn.push('Avantage domicile inconnu : aucun avantage appliqué (incertitude accrue)');
    function w(t) { var n = C.num(t.n); if (n == null) return 1; var k = early && early.k != null ? early.k : C.DEFAULT_CONFIG.earlySeason.football.k; return n / (n + k); }
    function strength(t, keyF, keyA, priorF, priorA, useXg) {
      var wc = t._w;
      var gf = useXg && C.num(t.xgf) != null ? t.xgf : t.gf, ga = useXg && C.num(t.xga) != null ? t.xga : t.ga;
      var att = E.blend(gf, t[priorF], wc), def = E.blend(ga, t[priorA], wc);
      return { att: att, def: def };
    }
    home = Object.assign({}, home); away = Object.assign({}, away);
    home._w = C.num(home.priorGf) == null && C.num(home.priorGa) == null ? 1 : w(home); away._w = C.num(away.priorGf) == null && C.num(away.priorGa) == null ? 1 : w(away);
    var useXg = C.num(home.xgf) != null && C.num(home.xga) != null && C.num(away.xgf) != null && C.num(away.xga) != null;
    var H = strength(home, 'gf', 'ga', 'priorGf', 'priorGa', useXg), A = strength(away, 'gf', 'ga', 'priorGf', 'priorGa', useXg);
    if (H.att == null || H.def == null || A.att == null || A.def == null) return { available: false, label: 'DATA UNAVAILABLE', reason: 'Buts marqués/encaissés par match manquants' };
    var lamH = lh * (H.att / teamAvg) * (A.def / teamAvg), lamA = la * (A.att / teamAvg) * (H.def / teamAvg);
    if (!(lamH > 0) || !(lamA > 0)) return { available: false, label: 'INSUFFICIENT DATA', reason: 'λ non positif' };
    return { available: true, lambdaHome: lamH, lambdaAway: lamA, usedXg: useXg, warnings: warn, weights: { home: home._w, away: away._w },
      parts: { lh: lh, la: la, teamAvg: teamAvg, hAtt: H.att, hDef: H.def, aAtt: A.att, aDef: A.def } };
  }

  function eloProbabilities(eH, eA, homeAdv) {
    eH = C.num(eH); eA = C.num(eA); if (eH == null || eA == null) return null;
    var adv = C.isNum(homeAdv) ? homeAdv : 60, exp = 1 / (1 + Math.pow(10, -((eH + adv) - eA) / 400));
    var pd = C.clamp(0.30 - Math.abs(2 * exp - 1) * 0.20, 0.06, 0.30);
    return { home: exp * (1 - pd), draw: pd, away: (1 - exp) * (1 - pd), drawIsHeuristic: true };
  }

  // ---------- BASKETBALL ----------
  // team : {pace, ortg, drtg, n, priorPace, priorOrtg, priorDrtg}. league : {pace, ortg}. homeAdvPts : null si inconnu.
  function basketExpectations(home, away, league, o) {
    o = o || {}; var E = EA.context, early = o.early, wc = early && early.wCurrent != null ? early.wCurrent : 1;
    function val(t, k) { var pr = t['prior' + k[0].toUpperCase() + k.slice(1)]; return E.blend(t[k], pr, C.num(pr) == null ? 1 : wc); }
    var pH = val(home, 'pace'), pA = val(away, 'pace'), oH = val(home, 'ortg'), oA = val(away, 'ortg'), dH = val(home, 'drtg'), dA = val(away, 'drtg');
    if ([pH, pA, oH, oA, dH, dA].some(function (x) { return x == null; })) return { available: false, label: 'DATA UNAVAILABLE', reason: 'Pace / ORtg / DRtg manquants pour au moins une équipe' };
    var lgO = C.num(league && league.ortg), lgP = C.num(league && league.pace), warn = [];
    if (lgO == null) { lgO = (oH + oA + dH + dA) / 4; warn.push('Moyenne de ligue ORtg absente : approximée par la moyenne des deux équipes'); }
    var pace = lgP != null ? pH * pA / lgP : (pH + pA) / 2; if (lgP == null) warn.push('Pace de ligue absente : moyenne simple des deux équipes');
    var eoH = oH + dA - lgO, eoA = oA + dH - lgO;
    var homeAdv = C.num(o.homeAdvPts); if (homeAdv == null) warn.push('Avantage domicile inconnu : 0 appliqué (incertitude accrue)');
    var ptsH = eoH * pace / 100 + (homeAdv || 0) / 2, ptsA = eoA * pace / 100 - (homeAdv || 0) / 2;
    return { available: true, expectedPace: pace, expectedOffRatingHome: eoH, expectedOffRatingAway: eoA, expectedDefRatingHome: eoA, expectedDefRatingAway: eoH,
      expectedPointsHome: ptsH, expectedPointsAway: ptsA, expectedMargin: ptsH - ptsA, expectedTotal: ptsH + ptsA, warnings: warn };
  }
  function estimateSd(values) { var v = (values || []).map(C.num).filter(function (x) { return x != null; }); if (v.length < 10) return null; return Math.sqrt(C.variance(v)); }

  function simulateBasketball(exp, opts) {
    opts = opts || {}; var it = opts.iterations || 10000, cfg = (opts.config || C.DEFAULT_CONFIG).basketSd;
    var sdM = C.num(opts.sdMargin), sdT = C.num(opts.sdTotal), prov = false;
    if (sdM == null) { sdM = cfg.margin; prov = true; } if (sdT == null) { sdT = cfg.total; prov = true; }
    var rng = opts.rng || (opts.seed != null ? C.mulberry32(C.hashSeed(opts.seed)) : Math.random);
    var margins = new Array(it), totals = new Array(it), win = 0, cover = 0, over = 0, sl = C.num(opts.spreadLine), tl = C.num(opts.totalLine);
    for (var i = 0; i < it; i++) {
      var m = exp.expectedMargin + C.gaussian(rng) * sdM, t = exp.expectedTotal + C.gaussian(rng) * sdT;
      margins[i] = m; totals[i] = t; if (m > 0) win++; if (sl != null && m + sl > 0) cover++; if (tl != null && t > tl) over++;
    }
    var sm = margins.slice().sort(function (a, b) { return a - b; }), st = totals.slice().sort(function (a, b) { return a - b; });
    return { iterationsRequested: it, iterationsRun: it, sdMargin: sdM, sdTotal: sdT, sdProvisional: prov,
      pHome: win / it, pAway: 1 - win / it, pSpreadCover: sl != null ? cover / it : null, pOver: tl != null ? over / it : null, pUnder: tl != null ? 1 - over / it : null,
      margin: { mean: C.mean(margins), median: C.quantile(sm, 0.5), variance: C.variance(margins), p10: C.quantile(sm, 0.1), p90: C.quantile(sm, 0.9) },
      total: { mean: C.mean(totals), median: C.quantile(st, 0.5), variance: C.variance(totals), p10: C.quantile(st, 0.1), p90: C.quantile(st, 0.9) } };
  }

  // ---------- CONSENSUS ----------
  // models : [{id, name, status, p, perf:{n, brier}, health:'HEALTHY'|..|'DISABLED'}]  p = probabilité du même événement
  function consensus(models, cfg) {
    var conf = cfg || C.DEFAULT_CONFIG, minN = conf.minSample.weights, act = (models || []).filter(function (m) { return C.isNum(m.p) && m.status !== 'UNAVAILABLE' && m.health !== 'DISABLED' && m.health !== 'DEGRADED'; });
    var excluded = (models || []).filter(function (m) { return act.indexOf(m) < 0; }).map(function (m) { return { id: m.id, reason: (m.health === 'DISABLED' || m.health === 'DEGRADED') ? 'MODEL DEGRADED' : 'UNAVAILABLE' }; });
    if (!act.length) return { p: null, label: 'DATA UNAVAILABLE', excluded: excluded };
    var calibrated = act.every(function (m) { return m.perf && m.perf.n >= minN && C.isNum(m.perf.brier) && m.perf.brier > 0; });
    var ws = act.map(function (m) { return calibrated ? 1 / m.perf.brier : 1; }), sw = ws.reduce(function (a, b) { return a + b; }, 0);
    var p = act.reduce(function (s, m, i) { return s + m.p * ws[i] / sw; }, 0);
    var ps = act.map(function (m) { return m.p; }), spread = (Math.max.apply(null, ps) - Math.min.apply(null, ps)) * 100, st = conf.stability;
    return { p: p, spreadPts: spread, models: act.map(function (m, i) { return { id: m.id, p: m.p, weight: ws[i] / sw }; }), excluded: excluded,
      weightsLabel: calibrated ? 'WEIGHTED BY OUT-OF-SAMPLE BRIER' : 'MODEL WEIGHTS NOT YET CALIBRATED',
      stability: act.length < 2 ? 'Inconnue' : spread < st.stableSpreadPts ? 'Stable' : spread < st.mediumSpreadPts ? 'Moyenne' : 'Instable',
      agreementPct: act.length < 2 ? null : Math.round(Math.max(0, 100 - spread * 5)) };
  }

  // ---------- CALIBRATION ----------
  // obs : [{p, hit}] ; p ∈ [0,1], hit booléen
  function calibration(obs) {
    var v = (obs || []).filter(function (o) { return C.isNum(o.p) && o.p >= 0 && o.p <= 1 && (o.hit === true || o.hit === false); });
    var n = v.length; if (!n) return { n: 0, label: 'INSUFFICIENT DATA', brier: null, logLoss: null, ece: null, buckets: bucketsEmpty() };
    var brier = 0, ll = 0, buckets = bucketsEmpty();
    v.forEach(function (o) { var y = o.hit ? 1 : 0; brier += (o.p - y) * (o.p - y); var q = C.clamp(o.p, 1e-4, 1 - 1e-4); ll += -(y ? Math.log(q) : Math.log(1 - q));
      var bi = Math.min(9, Math.floor(o.p * 10)); buckets[bi].n++; buckets[bi].sumP += o.p; buckets[bi].hits += y; });
    var ece = 0; buckets.forEach(function (b) { if (b.n) { b.meanP = b.sumP / b.n; b.freq = b.hits / b.n; ece += b.n / n * Math.abs(b.meanP - b.freq); } else { b.meanP = null; b.freq = null; } });
    return { n: n, brier: brier / n, logLoss: ll / n, ece: ece, buckets: buckets, label: n < C.DEFAULT_CONFIG.minSample.calibration ? 'SAMPLE TOO SMALL' : 'OK' };
  }
  function bucketsEmpty() { var b = []; for (var i = 0; i < 10; i++) b.push({ range: (i * 10) + '–' + (i * 10 + 10) + '%', n: 0, sumP: 0, hits: 0, meanP: null, freq: null }); return b; }

  EA.models = { poissonP: poissonP, tau: tau, poissonMatrix: poissonMatrix, sumWhere: sumWhere, simulateFootball: simulateFootball, footballMarkets: footballMarkets,
    footballLambdas: footballLambdas, eloProbabilities: eloProbabilities, basketExpectations: basketExpectations, estimateSd: estimateSd, simulateBasketball: simulateBasketball,
    consensus: consensus, calibration: calibration };
  if (typeof module === 'object' && module.exports) module.exports = EA.models;
})(typeof window !== 'undefined' ? window : global);
