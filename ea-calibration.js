/* EA-VALUE 3.0 — CALIBRATION PAR TRANCHES + LEAGUE PROFILE.
   Affichage et mesure uniquement : aucune probabilité n'est recalibrée sur un petit échantillon.
   Les paliers d'échantillon sont configurables (cfg.sampleLevels, en nombre d'observations). */
(function (g) {
  'use strict';
  if (typeof require === 'function' && typeof window === 'undefined') require('./ea-core.js');
  var EA = g.EA, C = EA.core;
  var EDGES = [0, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 1.0001];
  var NAMES = ['0–50 %', '50–55 %', '55–60 %', '60–65 %', '65–70 %', '70–75 %', '75–80 %', '80–85 %', '85–90 %', '90 % +'];
  var LEVELS = [{ min: 500, label: 'Solide' }, { min: 300, label: 'Bon' }, { min: 100, label: 'Modéré' }, { min: 50, label: 'Faible' }, { min: 0, label: 'Très faible' }];
  function sampleLevel(n, levels) {
    var L = (levels || LEVELS).slice().sort(function (a, b) { return b.min - a.min; });
    for (var i = 0; i < L.length; i++) if (n >= L[i].min) return L[i].label;
    return 'Très faible';
  }
  function wilson(k, n) { if (!n) return null; var z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)]; }
  function settled(rs) { return (rs || []).filter(function (r) { return r && r.result && r.result.outcome !== 'void' && C.num(r.pModel) != null && r.pModel >= 0 && r.pModel <= 1; }); }

  function buckets(records, levels) {
    var s = settled(records), out = NAMES.map(function (nm, i) { return { name: nm, lo: EDGES[i], n: 0, wins: 0, sumP: 0 }; });
    s.forEach(function (r) { for (var i = 0; i < NAMES.length; i++) if (r.pModel >= EDGES[i] && r.pModel < EDGES[i + 1]) { var b = out[i]; b.n++; b.sumP += r.pModel; if (r.result.outcome === 'won') b.wins++; break; } });
    out.forEach(function (b) {
      b.level = sampleLevel(b.n, levels);
      if (!b.n) { b.text = b.name + ' — aucune observation'; return; }
      b.meanP = b.sumP / b.n; b.freq = b.wins / b.n; b.error = b.freq - b.meanP; b.ci = wilson(b.wins, b.n);
      b.text = b.name + ' — calibration ' + b.level.toLowerCase() + ' : ' + (b.n < 50 ? 'seulement ' : '') + b.n + ' observation' + (b.n > 1 ? 's' : '');
      b.reliable = b.n >= 100;                       // en dessous : affichage seul, jamais de conclusion
    });
    var n = s.length, brier = n ? s.reduce(function (a, r) { var y = r.result.outcome === 'won' ? 1 : 0; return a + Math.pow(r.pModel - y, 2); }, 0) / n : null;
    var ll = n ? s.reduce(function (a, r) { var p = Math.min(1 - 1e-4, Math.max(1e-4, r.pModel)), y = r.result.outcome === 'won'; return a - Math.log(y ? p : 1 - p); }, 0) / n : null;
    var ece = n ? out.reduce(function (a, b) { return b.n ? a + b.n / n * Math.abs(b.error) : a; }, 0) : null;
    return { buckets: out, n: n, level: sampleLevel(n, levels), brier: brier, logLoss: ll, ece: ece, insufficient: n < 50 };
  }

  // Profil par compétition : mesures de scores seulement si les scores ont été saisis ; rien n'est inventé.
  function leagueProfiles(records, cfg, levels) {
    var by = {}, minN = (cfg && cfg.minSample && cfg.minSample.competitionStats) || 30;
    (records || []).forEach(function (r) { var k = (r.sport || '?') + ' / ' + (r.competition || '—'); (by[k] = by[k] || []).push(r); });
    var out = {};
    Object.keys(by).forEach(function (k) {
      var rs = by[k], s = settled(rs), st = EA.memory && EA.memory.stats ? EA.memory.stats(rs, cfg) : {}, sc = s.filter(function (r) { return r.result.score; }).map(function (r) { return r.result.score; });
      var P = { key: k, predictions: rs.length, settled: s.length, scores: sc.length, level: sampleLevel(s.length, levels), enough: s.length >= minN, roi: st.roi == null ? null : st.roi, clvAvg: st.clvAvg == null ? null : st.clvAvg, brier: st.brier == null ? null : st.brier, markets: {} };
      var mk = {}; s.forEach(function (r) { var m = String(r.market || '?'); (mk[m] = mk[m] || []).push(r); });
      Object.keys(mk).forEach(function (m) { var a = mk[m], w = a.filter(function (r) { return r.result.outcome === 'won'; }).length; P.markets[m] = { n: a.length, hit: w / a.length, meanP: a.reduce(function (x, r) { return x + r.pModel; }, 0) / a.length, level: sampleLevel(a.length, levels) }; });
      if (sc.length >= minN) {
        var tot = sc.map(function (x) { return x.a + x.b; });
        P.avgTotal = C.mean(tot); P.variance = C.mean(tot.map(function (t) { return Math.pow(t - P.avgTotal, 2); })); P.homeWinPct = sc.filter(function (x) { return x.a > x.b; }).length / sc.length; P.avgHomeMargin = C.mean(sc.map(function (x) { return x.a - x.b; }));
        if (/^football/.test(k)) { P.bttsPct = sc.filter(function (x) { return x.a > 0 && x.b > 0; }).length / sc.length; P.over25Pct = tot.filter(function (t) { return t > 2.5; }).length / sc.length; }
      }
      P.note = P.enough ? 'profil exploitable' : 'ÉCHANTILLON INSUFFISANT : aucune pondération par compétition';
      out[k] = P;
    });
    return out;
  }
  EA.calibration = { buckets: buckets, leagueProfiles: leagueProfiles, sampleLevel: sampleLevel, wilson: wilson, EDGES: EDGES, NAMES: NAMES, LEVELS: LEVELS };
  if (typeof module === 'object' && module.exports) module.exports = EA.calibration;
})(typeof window !== 'undefined' ? window : global);
