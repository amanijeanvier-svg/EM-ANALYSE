/* EA-VALUE 3.0 — RISK ENGINE (exposition, drawdown, séries de pertes, anti-martingale) + BACKTEST DES RÈGLES V3.
   Le moteur ne fait que PLAFONNER ou RÉDUIRE une mise : jamais d'augmentation après une perte, jamais de martingale. */
(function (g) {
  'use strict';
  if (typeof require === 'function' && typeof window === 'undefined') require('./ea-core.js');
  var EA = g.EA, C = EA.core;
  var CFG = { maxStakePct: 0.02, maxExposurePct: 0.08, ddReducePct: 0.20, ddReduceFactor: 0.5, streakReduce: 5 };
  function settledStaked(rs) { return (rs || []).filter(function (r) { return r.result && r.result.stake && r.result.profit != null; }).sort(function (a, b) { return a.result.settledAt - b.result.settledAt; }); }
  function assess(o) {
    var c = Object.assign({}, CFG, o.cfg || {}), bank = C.num(o.bankroll), flags = [], proposed = C.num(o.proposed);
    if (bank == null || !(bank > 0) || proposed == null) return { stake: null, flags: ['DATA UNAVAILABLE : bankroll ou mise inconnue'], level: 'INCONNU' };
    var open = (o.records || []).filter(function (r) { return !r.result && C.num(r.plannedStake) != null; }), exposure = open.reduce(function (s, r) { return s + r.plannedStake; }, 0);
    var st = settledStaked(o.records), cum = 0, peak = 0, dd = 0, streak = 0;
    st.forEach(function (r) { cum += r.result.profit; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); });
    for (var i = st.length - 1; i >= 0 && st[i].result.outcome === 'lost'; i--) streak++;
    var stake = Math.min(proposed, bank * c.maxStakePct);
    if (stake < proposed) flags.push('Mise plafonnée à ' + (c.maxStakePct * 100).toFixed(0) + ' % de la bankroll');
    var room = Math.max(0, bank * c.maxExposurePct - exposure);
    if (stake > room) { stake = room; flags.push('Exposition totale plafonnée à ' + (c.maxExposurePct * 100).toFixed(0) + ' % (' + exposure.toFixed(2) + ' déjà engagés)'); }
    if (dd / bank >= c.ddReducePct) { stake *= c.ddReduceFactor; flags.push('Drawdown ≥ ' + (c.ddReducePct * 100).toFixed(0) + ' % : mise réduite de moitié'); }
    if (streak >= c.streakReduce) { stake *= c.ddReduceFactor; flags.push('Série de ' + streak + ' pertes : mise réduite (aucun rattrapage)'); }
    var last = st.length ? st[st.length - 1] : null;
    if (last && last.result.outcome === 'lost' && stake > last.result.stake) { stake = last.result.stake; flags.push('Pas d\'augmentation de mise après une perte (anti-martingale)'); }
    stake = Math.max(0, Math.floor(stake * 100) / 100);
    return { stake: stake, proposed: proposed, exposure: exposure, drawdown: dd, drawdownPct: dd / bank, lossStreak: streak, flags: flags, level: stake <= 0 ? 'BLOQUÉ' : flags.length ? 'RÉDUIT' : 'NORMAL' };
  }

  // Backtest des règles V3 : séparation temporelle 60/20/20, aucune règle ajustée sur la période de test.
  function seg(rs) {
    var n = rs.length, u = rs.filter(function (r) { return r.result.profitUnits != null; }), won = rs.filter(function (r) { return r.result.outcome === 'won'; }).length, cum = 0, peak = 0, dd = 0, gp = 0, gl = 0;
    u.forEach(function (r) { var x = r.result.profitUnits; cum += x; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); if (x > 0) gp += x; else gl -= x; });
    var clv = rs.map(function (r) { return EA.memory.clv(r.odds, r.closingOdds); }).filter(Boolean);
    return { n: n, hit: n ? won / n : null, roi: u.length ? cum / u.length : null, profit: cum, meanEV: n ? rs.reduce(function (s, r) { return s + (r.ev || 0); }, 0) / n : null, maxDD: dd, profitFactor: gl > 0 ? gp / gl : null, clv: clv.length ? clv.reduce(function (s, x) { return s + x.clvProbPts; }, 0) / clv.length : null, small: n < 30 };
  }
  function rulesBacktest(records, rules) {
    var R = Object.assign({ minEV: 0.05, minDQ: 60 }, rules || {}), all = (records || []).filter(function (r) { return r.result && r.result.outcome !== 'void' && C.num(r.odds) > 1; }).sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
    var n = all.length, a = Math.floor(n * 0.6), b = Math.floor(n * 0.8), parts = { training: all.slice(0, a), validation: all.slice(a, b), test: all.slice(b) };
    var sel = function (r) { return r.decision === 'BET' && (r.ev || 0) >= R.minEV && r.dataQuality && C.num(r.dataQuality.score) != null && r.dataQuality.score >= R.minDQ; };
    var out = { rules: R, total: n, parts: {}, note: 'Règles fixées a priori (non optimisées sur ces données) ; la période de test n\'influence aucune règle.' };
    Object.keys(parts).forEach(function (k) { out.parts[k] = { all: seg(parts[k]), v3: seg(parts[k].filter(sel)), singles: seg(parts[k].filter(function (r) { return r.type !== 'combo'; })), combos: seg(parts[k].filter(function (r) { return r.type === 'combo'; })) }; });
    out.insufficient = n < 60;
    return out;
  }
  EA.risk = { assess: assess, rulesBacktest: rulesBacktest, CFG: CFG };
  if (typeof module === 'object' && module.exports) module.exports = EA.risk;
})(typeof window !== 'undefined' ? window : global);
