/* ===== js/ea-maturity.js — EA MATURITÉ (jauges BDEEA) =====
   Les anciennes jauges mesuraient surtout le VOLUME et le TAUX DE RÉUSSITE : or le taux de réussite monte tout seul quand on joue des paris
   très probables à cote 1,18 (sans rapporter d'argent). Les mesures ci-dessous évaluent à la place :
   - la QUALITÉ DES PROBABILITÉS (score de Brier comparé au hasard « climatologique ») : les % annoncés étaient-ils honnêtes ?
   - la CALIBRATION DES COMBINÉS : probabilité annoncée du coupon contre réussite réelle ;
   - le RENDEMENT RÉEL (journal « Mon suivi » : cotes et mises réelles) ;
   Aucune valeur illustrative : sans assez de données, la mesure vaut « neutre » (50 %) et le dit. Module pur : testable avec Node. */
(function (root) {
  'use strict';
  var VERSION = 'EA-MATURITY-1.0';
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  // evals : [{p, hit}] avec hit true/false (null ignoré)
  function brierSkill(evals) {
    var v = (evals || []).filter(function (e) { return e && isNum(e.p) && (e.hit === true || e.hit === false); });
    var n = v.length; if (n < 10) return { skill: null, n: n };
    var br = v.reduce(function (s, e) { var h = e.hit ? 1 : 0; return s + (e.p - h) * (e.p - h); }, 0) / n;
    var base = v.reduce(function (s, e) { return s + (e.hit ? 1 : 0); }, 0) / n, climo = base * (1 - base);
    if (climo < 1e-9) return { skill: null, n: n };
    return { skill: 1 - br / climo, brier: br, climo: climo, baseRate: base, n: n };   // > 0 : meilleur que le hasard ; 0 : équivalent ; < 0 : pire
  }
  function skillScore(skill) { return skill == null ? 50 : clamp(50 + skill * 200, 0, 100); }
  // Tendance de qualité : compare la 2e moitié (récente) à la 1re. evals triées par temps.
  function skillTrend(evals) {
    var v = (evals || []).filter(function (e) { return e && isNum(e.p) && (e.hit === true || e.hit === false); });
    if (v.length < 30) return { score: 50, label: 'pas encore assez de recul', delta: null };
    var mid = Math.floor(v.length / 2), a = brierSkill(v.slice(0, mid)).skill, b = brierSkill(v.slice(mid)).skill;
    if (a == null || b == null) return { score: 50, label: 'pas encore assez de recul', delta: null };
    var d = b - a;
    return { score: clamp(50 + d * 200, 0, 100), label: d > 0.03 ? 'les probabilités s\'améliorent' : d < -0.03 ? 'les probabilités se dégradent : à surveiller' : 'stable', delta: d };
  }
  // combos : [{p (probabilité annoncée), won (bool)}] ; score = 100 − écart entre probabilité moyenne annoncée et réussite réelle (×400).
  function comboCalibration(combos) {
    var v = (combos || []).filter(function (c) { return c && isNum(c.p) && (c.won === true || c.won === false); });
    if (v.length < 10) return { score: 50, n: v.length, gap: null };
    var pred = v.reduce(function (s, c) { return s + c.p; }, 0) / v.length, real = v.filter(function (c) { return c.won; }).length / v.length;
    return { score: clamp(100 - Math.abs(pred - real) * 400, 0, 100), n: v.length, gap: pred - real, predicted: pred, real: real };
  }
  // bets : [{stake, odds, result}] du journal réel.
  function realRoi(bets) {
    var s = (bets || []).filter(function (b) { return (b.result === 'won' || b.result === 'lost') && isNum(b.stake) && b.stake > 0 && isNum(b.odds) && b.odds > 1; });
    if (s.length < 30) return { score: 50, n: s.length, roi: null };
    var staked = s.reduce(function (a, b) { return a + b.stake; }, 0), pl = s.reduce(function (a, b) { return a + (b.result === 'won' ? b.stake * (b.odds - 1) : -b.stake); }, 0), roi = pl / staked;
    return { score: clamp(50 + roi * 200, 0, 100), n: s.length, roi: roi };
  }
  var api = { VERSION: VERSION, brierSkill: brierSkill, skillScore: skillScore, skillTrend: skillTrend, comboCalibration: comboCalibration, realRoi: realRoi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.EAMAT = api;
})(typeof window !== 'undefined' ? window : globalThis);
