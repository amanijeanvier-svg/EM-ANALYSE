/* EA-VALUE 3.0 — MARKET PERFORMANCE + POIDS PAR MARCHÉ (adaptation progressive et bornée).
   Un marché n'est jamais supprimé : son poids reste dans [0,70 ; 1,05] et ne bouge qu'à partir de 100 observations. */
(function (g) {
  'use strict';
  if (typeof require === 'function' && typeof window === 'undefined') { require('./ea-core.js'); require('./ea-models.js'); require('./ea-memory.js'); require('./ea-calibration.js'); }
  var EA = g.EA, C = EA.core;
  var CFG = { minDocumented: 30, minWeightN: 100, shrink: 200, k: 1.5, wMin: 0.70, wMax: 1.05 };
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function perf(records, cfg) {
    var c = Object.assign({}, CFG, cfg || {}), by = {};
    (records || []).forEach(function (r) { if (r.type === 'combo' || !r.result || r.result.outcome === 'void' || C.num(r.pModel) == null) return; var k = (r.sport || '?') + '/' + (r.market || '?'); (by[k] = by[k] || []).push(r); });
    var out = {};
    Object.keys(by).forEach(function (k) {
      var a = by[k], n = a.length, won = a.filter(function (r) { return r.result.outcome === 'won'; }).length, u = a.filter(function (r) { return r.result.profitUnits != null; });
      var clv = a.map(function (r) { return EA.memory.clv(r.odds, r.closingOdds); }).filter(Boolean), meanP = a.reduce(function (s, r) { return s + r.pModel; }, 0) / n, hit = won / n, gap = hit - meanP;
      var X = { key: k, n: n, won: won, lost: n - won, hit: hit, meanP: meanP, gap: gap, roi: u.length ? u.reduce(function (s, r) { return s + r.result.profitUnits; }, 0) / u.length : null,
        meanEV: a.reduce(function (s, r) { return s + (r.ev || 0); }, 0) / n, clv: clv.length ? clv.reduce(function (s, x) { return s + x.clvProbPts; }, 0) / clv.length : null,
        brier: a.reduce(function (s, r) { return s + Math.pow(r.pModel - (r.result.outcome === 'won' ? 1 : 0), 2); }, 0) / n, level: EA.calibration.sampleLevel(n), documented: n >= c.minDocumented };
      if (n < c.minWeightN) { X.weight = 1; X.reason = 'poids inchangé (moins de ' + c.minWeightN + ' observations)'; }
      else { X.weight = Math.round(clamp(1 + clamp(gap * c.k * n / (n + c.shrink), -(1 - c.wMin), c.wMax - 1), c.wMin, c.wMax) * 1000) / 1000; X.reason = X.weight < 1 ? 'probabilités annoncées surestimées : prudence accrue (exigence d\'EV relevée)' : X.weight > 1 ? 'marché bien calibré : léger assouplissement' : 'neutre'; }
      out[k] = X;
    });
    return out;
  }
  function weightMap(records, cfg) { var p = perf(records, cfg), m = {}; Object.keys(p).forEach(function (k) { m[k] = p[k].weight; }); return m; }
  EA.market = { perf: perf, weightMap: weightMap, CFG: CFG };
  if (typeof module === 'object' && module.exports) module.exports = EA.market;
})(typeof window !== 'undefined' ? window : global);
