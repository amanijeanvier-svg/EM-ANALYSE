/* EA-VALUE 3.0 — PRE-MATCH SNAPSHOT (immuable, versionné) + COMBINÉS (enregistrement) + SIMPLES vs COMBINÉS.
   Le snapshot est inclus dans le hash de la prédiction : toute modification a posteriori est détectable. */
(function (g) {
  'use strict';
  if (typeof require === 'function' && typeof window === 'undefined') { require('./ea-core.js'); require('./ea-calibration.js'); }
  var EA = g.EA, C = EA.core;
  function build(res, idx, input, combo, now) {
    var t = C.isNum(now) ? now : Date.now(), pick = res && res.markets && res.markets[idx], inp = null;
    try { inp = input ? JSON.parse(JSON.stringify(input)) : null; } catch (e) { inp = null; }
    var com = ''; try { com = JSON.stringify(res.commentary || ''); if (com.length > 2000) com = com.slice(0, 2000) + '…'; } catch (e) { com = ''; }
    return { savedAt: new Date(t).toISOString(), engineVersion: C.VERSION, input: inp,
      markets: ((res && res.markets) || []).map(function (m) { return { market: m.market, selection: m.selection, p: m.p, odds: m.odds == null ? null : m.odds, edgePts: m.odds > 1 ? Math.round((m.p - 1 / m.odds) * 1000) / 10 : null, ev: m.value && m.value.ev != null ? m.value.ev : null, decision: m.decision && m.decision.decision || null, uncertaintyHalfPts: m.uncertaintyHalfPts == null ? null : m.uncertaintyHalfPts }; }),
      selection: pick ? { market: pick.market, selection: pick.selection } : null, dataQuality: res && res.dataQuality ? res.dataQuality.score : null, commentary: com,
      combo: combo && combo.status === 'BET' ? { legs: combo.legs.map(function (l) { return l.label + ' · ' + l.market + ' ' + l.selection + ' @ ' + l.odds; }), odds: combo.odds, pJoint: combo.pJoint, ev: combo.ev } : null };
  }
  // Un combiné est enregistré comme un pari (type 'combo') : réglable, hashé, mais exclu des statistiques des paris simples.
  function toRecord(r, now) {
    var t = C.isNum(now) ? now : Date.now(), d = new Date(t).toISOString().slice(0, 10);
    return { type: 'combo', sport: 'multi', competition: '—', home: 'Combiné', away: r.legs.length + ' sélections', matchDate: d, matchKey: 'combo|' + t, market: 'combo', selection: r.legs.map(function (l) { return l.label + ' ' + l.market + ' ' + l.selection; }).join(' + '),
      odds: Math.round(r.odds * 100) / 100, pModel: r.pJoint, ev: r.ev, decision: 'BET', legCount: r.legs.length,
      legs: r.legs.map(function (l) { return { label: l.label, market: l.market, selection: l.selection, odds: l.odds, p: l.p }; }), dataQuality: { score: r.dataQuality },
      snapshot: { savedAt: new Date(t).toISOString(), engineVersion: C.VERSION, combo: { odds: r.odds, pJoint: r.pJoint, pJointLow: r.pJointLow, ev: r.ev, evLow: r.evLow, minOdds: r.minOdds, correlationNotes: r.correlationNotes } } };
  }
  function seg(rs) {
    var s = rs.filter(function (r) { return r.result && r.result.outcome !== 'void'; }), n = s.length, w = s.filter(function (r) { return r.result.outcome === 'won'; }).length;
    var u = s.filter(function (r) { return r.result.profitUnits != null; }), roi = u.length ? u.reduce(function (a, r) { return a + r.result.profitUnits; }, 0) / u.length : null;
    return { n: n, won: w, lost: n - w, hitRate: n ? w / n : null, roi: roi, avgOdds: n ? s.reduce(function (a, r) { return a + (r.odds || 0); }, 0) / n : null, meanEV: n ? s.reduce(function (a, r) { return a + (r.ev || 0); }, 0) / n : null,
      meanP: n ? s.reduce(function (a, r) { return a + (r.pModel || 0); }, 0) / n : null, avgLegs: n && s[0].legCount ? s.reduce(function (a, r) { return a + (r.legCount || 1); }, 0) / n : null, level: EA.calibration.sampleLevel(n) };
  }
  function simplesVsCombos(records, opts) {
    var o = Object.assign({ minN: 30, roiGap: 0.05 }, opts || {}), all = records || [];
    var S = seg(all.filter(function (r) { return r.type !== 'combo'; })), K = seg(all.filter(function (r) { return r.type === 'combo'; }));
    var v, code;
    if (S.n < o.minN || K.n < o.minN) { code = 'INSUFFISANT'; v = 'Échantillon insuffisant (simples ' + S.n + ', combinés ' + K.n + ' ; minimum ' + o.minN + ' chacun) : aucune conclusion.'; }
    else if (S.roi != null && K.roi != null && K.roi <= S.roi - o.roiGap) { code = 'COMBINES_MOINS_BONS'; v = 'Les combinés sont durablement moins performants que les simples (ROI ' + (K.roi * 100).toFixed(1) + ' % vs ' + (S.roi * 100).toFixed(1) + ' %) : privilégier le pari simple.'; }
    else if (S.roi != null && K.roi != null && K.roi >= S.roi + o.roiGap) { code = 'COMBINES_MEILLEURS'; v = 'Les combinés font mieux que les simples sur cet échantillon (à confirmer avec davantage de données).'; }
    else { code = 'PAS_DE_DIFFERENCE'; v = 'Pas de différence concluante entre simples et combinés.'; }
    return { simples: S, combos: K, code: code, verdict: v };
  }
  EA.snapshot = { build: build, toRecord: toRecord, simplesVsCombos: simplesVsCombos };
  if (typeof module === 'object' && module.exports) module.exports = EA.snapshot;
})(typeof window !== 'undefined' ? window : global);
