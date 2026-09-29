/* EA-VALUE 3.0 — EA MEMORY, CLV, COMPETITION MEMORY, WALK-FORWARD BACKTEST, MODEL HEALTH, AUTO DISCOVERY.
   Une prédiction enregistrée n'est jamais modifiée : seul un bloc `result` est ajouté après le match. */
(function (g) {
  'use strict';
  if (typeof require === 'function' && typeof window === 'undefined') { require('./ea-core.js'); require('./ea-models.js'); }
  var EA = g.EA, C = EA.core;
  var KEY = 'ea_pro_memory', SCHEMA = 1;

  function frozenPart(r) { return { sport: r.sport, competition: r.competition, matchKey: r.matchKey, matchDate: r.matchDate, market: r.market, selection: r.selection, odds: r.odds, pModel: r.pModel, fairOdds: r.fairOdds, ev: r.ev, decision: r.decision, modelVersion: r.modelVersion, modelProbs: r.modelProbs, dataQuality: r.dataQuality, stability: r.stability, createdAt: r.createdAt }; }
  function hashOf(r) { return C.hashSeed(JSON.stringify(frozenPart(r))); }

  function clv(entry, closing) {
    entry = C.num(entry); closing = C.num(closing); if (entry == null || closing == null || !(entry > 1) || !(closing > 1)) return null;
    return { clvProbPts: (1 / closing - 1 / entry) * 100, oddsMovePct: (closing / entry - 1) * 100 };
  }

  function createMemory(storage, key) {
    var K = key || KEY;
    function load() { try { var raw = storage.getItem(K); if (!raw) return { schema: SCHEMA, analyses: [] }; var o = JSON.parse(raw); if (!o || !Array.isArray(o.analyses)) return { schema: SCHEMA, analyses: [] }; return o; } catch (e) { return { schema: SCHEMA, analyses: [] }; } }
    function save(o) { storage.setItem(K, JSON.stringify(o)); }
    return {
      all: function () { return load().analyses; },
      add: function (rec, now) {
        var o = load(), t = C.isNum(now) ? now : Date.now();
        var r = Object.assign({}, rec, { id: rec.id || ('a' + t.toString(36) + Math.random().toString(36).slice(2, 7)), createdAt: t, result: null });
        if (!r.matchKey) r.matchKey = [r.sport, r.competition, r.home, r.away, r.matchDate].join('|');
        r.modelVersion = r.modelVersion || C.VERSION; r.predictionHash = hashOf(r);
        o.analyses.push(r); save(o); return r;
      },
      setClosing: function (id, closingOdds) { var o = load(), r = o.analyses.find(function (x) { return x.id === id; }); if (!r) return null; if (r.closingOdds != null) return r; var c = C.num(closingOdds); if (c == null || !(c > 1)) return null; r.closingOdds = c; save(o); return r; },
      settle: function (id, outcome, o2) {
        o2 = o2 || {}; var o = load(), r = o.analyses.find(function (x) { return x.id === id; }); if (!r || r.result) return r;
        if (['won', 'lost', 'void'].indexOf(outcome) < 0) return null;
        var stake = C.num(o2.stake) != null && o2.stake > 0 ? o2.stake : null, unit = stake == null ? 1 : stake, odds = C.num(r.odds);
        var profit = outcome === 'void' ? 0 : (odds == null ? null : outcome === 'won' ? unit * (odds - 1) : -unit);
        if (C.num(o2.closingOdds) != null && r.closingOdds == null && o2.closingOdds > 1) r.closingOdds = C.num(o2.closingOdds);
        r.result = { outcome: outcome, settledAt: C.isNum(o2.now) ? o2.now : Date.now(), stake: stake, profit: profit, profitUnits: profit == null ? null : (stake == null ? profit : profit / stake),
          error: outcome === 'void' ? null : (outcome === 'won' ? 1 : 0) - r.pModel };
        save(o); return r;
      },
      remove: function (id) { var o = load(); o.analyses = o.analyses.filter(function (x) { return x.id !== id; }); save(o); },
      previous: function (matchKey, market, selection) { var l = load().analyses.filter(function (x) { return x.matchKey === matchKey && x.market === market && x.selection === selection; }); return l.length ? l[l.length - 1] : null; },
      verify: function (r) { return r.predictionHash === hashOf(r); }
    };
  }

  function settled(records) { return records.filter(function (r) { return r.result && r.result.outcome !== 'void' && C.isNum(r.pModel); }); }
  function recClv(r) { return clv(r.odds, r.closingOdds); }

  // ---------- STATISTIQUES (globales / par sport-compétition-marché) ----------
  function stats(records, cfg) {
    var minN = (cfg || C.DEFAULT_CONFIG).minSample.competitionStats, s = settled(records), n = s.length;
    var base = { N: records.length, settled: n };
    if (!n) return Object.assign(base, { label: 'SAMPLE TOO SMALL', roi: null, yield: null, profit: null, hitRate: null, brier: null, clvAvg: null, clvPositivePct: null, clvN: 0 });
    var withOdds = s.filter(function (r) { return C.num(r.odds) != null && r.odds > 1; });
    var stakeSum = withOdds.reduce(function (a, r) { return a + (r.result.stake || 1); }, 0), profit = withOdds.reduce(function (a, r) { return a + (r.result.profit || 0); }, 0);
    var c = records.map(recClv).filter(Boolean), cal = EA.models.calibration(s.map(function (r) { return { p: r.pModel, hit: r.result.outcome === 'won' }; }));
    return Object.assign(base, { label: n < minN ? 'SAMPLE TOO SMALL' : 'OK', profit: withOdds.length ? profit : null, roi: withOdds.length && stakeSum > 0 ? profit / stakeSum : null, yield: withOdds.length && stakeSum > 0 ? profit / stakeSum : null,
      hitRate: s.filter(function (r) { return r.result.outcome === 'won'; }).length / n, brier: cal.brier, logLoss: cal.logLoss, ece: cal.ece,
      clvAvg: c.length ? C.mean(c.map(function (x) { return x.clvProbPts; })) : null, clvPositivePct: c.length ? c.filter(function (x) { return x.clvProbPts > 0; }).length / c.length * 100 : null, clvN: c.length,
      clvLabel: c.length ? null : 'CLV UNAVAILABLE' });
  }
  function groupBy(records, keyFn, cfg) { var m = {}; records.forEach(function (r) { var k = keyFn(r); (m[k] = m[k] || []).push(r); }); var out = {}; Object.keys(m).forEach(function (k) { out[k] = stats(m[k], cfg); }); return out; }
  function competitionMemory(records, cfg) {
    return { bySport: groupBy(records, function (r) { return r.sport || '?'; }, cfg), byCompetition: groupBy(records, function (r) { return (r.sport || '?') + ' / ' + (r.competition || '?'); }, cfg),
      byMarket: groupBy(records, function (r) { return (r.sport || '?') + ' / ' + (r.competition || '?') + ' / ' + (r.market || '?'); }, cfg) };
  }

  // ---------- WALK-FORWARD BACKTEST ----------
  function metricsFor(seg) {
    var n = seg.length; if (!n) return { N: 0 };
    var profit = 0, cum = 0, peak = 0, dd = 0, streak = 0, maxStreak = 0, stakeSum = 0;
    seg.forEach(function (r) { var u = r.result.profitUnits; if (u == null) return; stakeSum += 1; profit += u; cum += u; if (cum > peak) peak = cum; dd = Math.max(dd, peak - cum); if (u < 0) { streak++; maxStreak = Math.max(maxStreak, streak); } else streak = 0; });
    var cal = EA.models.calibration(seg.map(function (r) { return { p: r.pModel, hit: r.result.outcome === 'won' }; })), c = seg.map(recClv).filter(Boolean);
    return { N: n, profitUnits: profit, roi: stakeSum ? profit / stakeSum : null, yield: stakeSum ? profit / stakeSum : null, maxDrawdownUnits: dd, maxLosingStreak: maxStreak, brier: cal.brier, logLoss: cal.logLoss, ece: cal.ece, calibration: cal.buckets,
      clvAvg: c.length ? C.mean(c.map(function (x) { return x.clvProbPts; })) : null };
  }
  function walkForward(records, o) {
    o = o || {}; var cfg = o.config || C.DEFAULT_CONFIG, tf = o.trainFrac == null ? 0.6 : o.trainFrac, vf = o.validFrac == null ? 0.2 : o.validFrac, excluded = [];
    var elig = settled(records).filter(function (r) {
      var ok = r.predictionHash === hashOf(r); if (!ok) { excluded.push({ id: r.id, reason: 'PREDICTION MODIFIÉE (hash invalide)' }); return false; }
      var md = Date.parse(r.matchDate); if (isFinite(md) && r.createdAt > md + 86400000) { excluded.push({ id: r.id, reason: 'LOOK-AHEAD SUSPECT (créée après le match)' }); return false; }
      return true; });
    elig.sort(function (a, b) { return (Date.parse(a.matchDate) || a.createdAt) - (Date.parse(b.matchDate) || b.createdAt) || a.createdAt - b.createdAt; });
    if (elig.length < cfg.minSample.backtest) return { label: 'INSUFFICIENT HISTORICAL DATA', N: elig.length, required: cfg.minSample.backtest, excluded: excluded };
    var i1 = Math.floor(elig.length * tf), i2 = Math.floor(elig.length * (tf + vf));
    var running = [], seen = [];
    elig.forEach(function (r) { if (seen.length >= 5) { running.push({ date: r.matchDate, priorBrier: EA.models.calibration(seen.map(function (x) { return { p: x.pModel, hit: x.result.outcome === 'won' }; })).brier }); } seen.push(r); });
    return { label: 'OK', N: elig.length, excluded: excluded, training: metricsFor(elig.slice(0, i1)), validation: metricsFor(elig.slice(i1, i2)), test: metricsFor(elig.slice(i2)), pointInTimeBrier: running,
      note: 'Aucun paramètre n\'est ajusté : les segments sont chronologiques, chaque prédiction est celle figée à l\'analyse (aucun look-ahead).' };
  }

  // ---------- MODEL HEALTH / KILL SWITCH ----------
  function worst(a, b) { var o = ['HEALTHY', 'CAUTION', 'DEGRADED', 'DISABLED']; return o.indexOf(a) >= o.indexOf(b) ? a : b; }
  function modelPerf(records) {
    var ids = {}; settled(records).forEach(function (r) { for (var k in (r.modelProbs || {})) ids[k] = 1; });
    var out = {}; Object.keys(ids).forEach(function (id) { var obs = settled(records).filter(function (r) { return C.isNum((r.modelProbs || {})[id]); }).map(function (r) { return { p: r.modelProbs[id], hit: r.result.outcome === 'won' }; }); var c = EA.models.calibration(obs); out[id] = { n: c.n, brier: c.brier, logLoss: c.logLoss, ece: c.ece }; });
    return out;
  }
  function modelHealth(records, modelId, cfg) {
    var h = (cfg || C.DEFAULT_CONFIG).health, s = settled(records).filter(function (r) { return !modelId || modelId === 'consensus' || C.isNum((r.modelProbs || {})[modelId]); });
    if (s.length < h.minN) return { state: null, emoji: '⚪', label: 'INSUFFICIENT DATA', n: s.length, required: h.minN, thresholdsProvisional: true };
    var cal = EA.models.calibration(s.map(function (r) { return { p: (modelId && modelId !== 'consensus') ? r.modelProbs[modelId] : r.pModel, hit: r.result.outcome === 'won' }; }));
    var state = 'HEALTHY', reasons = [];
    function chk(v, t, name, higherIsWorse) { if (v == null) return; var lvl = higherIsWorse ? (v >= t.disabled ? 'DISABLED' : v >= t.degraded ? 'DEGRADED' : v >= t.caution ? 'CAUTION' : 'HEALTHY') : (v <= t.disabled ? 'DISABLED' : v <= t.degraded ? 'DEGRADED' : v <= t.caution ? 'CAUTION' : 'HEALTHY'); if (lvl !== 'HEALTHY') reasons.push(name + ' ' + lvl); state = worst(state, lvl); }
    chk(cal.brier, h.brier, 'Brier', true); chk(cal.ece, h.ece, 'ECE', true);
    var c = s.map(recClv).filter(Boolean), clvAvg = c.length ? C.mean(c.map(function (x) { return x.clvProbPts; })) : null; chk(clvAvg, h.clvPts, 'CLV', false);
    var m = metricsFor(s);
    var E = { HEALTHY: '🟢', CAUTION: '🟡', DEGRADED: '🟠', DISABLED: '🔴' };
    return { state: state, emoji: E[state], label: state === 'DEGRADED' || state === 'DISABLED' ? 'MODEL DEGRADED' : state, n: s.length, brier: cal.brier, logLoss: cal.logLoss, ece: cal.ece, clvAvg: clvAvg, maxDrawdownUnits: m.maxDrawdownUnits, reasons: reasons, thresholdsProvisional: true };
  }
  // Kill switch : un modèle dégradé n'est plus pondéré automatiquement ; son historique reste intact
  function killSwitchWeight(state) { return (state === 'DEGRADED' || state === 'DISABLED') ? 0 : 1; }

  // ---------- AUTO DISCOVERY (EXPÉRIMENTAL — aucun effet sur la production) ----------
  function autoDiscovery(records, cfg) {
    var minN = (cfg || C.DEFAULT_CONFIG).minSample.calibration, s = settled(records), names = {};
    s.forEach(function (r) { for (var k in (r.features || {})) if (C.isNum(r.features[k])) names[k] = 1; });
    var out = [];
    Object.keys(names).forEach(function (k) {
      var pts = s.filter(function (r) { return C.isNum((r.features || {})[k]); }).map(function (r) { return { x: r.features[k], y: (r.result.outcome === 'won' ? 1 : 0) - r.pModel }; });
      if (pts.length < minN) { out.push({ feature: k, n: pts.length, label: 'INSUFFICIENT DATA', stage: 'EXPERIMENTAL' }); return; }
      var mx = C.mean(pts.map(function (p) { return p.x; })), my = C.mean(pts.map(function (p) { return p.y; })), sxy = 0, sxx = 0, syy = 0;
      pts.forEach(function (p) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) * (p.x - mx); syy += (p.y - my) * (p.y - my); });
      out.push({ feature: k, n: pts.length, corrWithResidual: sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null, stage: 'EXPERIMENTAL', label: 'EXPERIMENTAL — validation et test requis avant toute promotion' });
    });
    return { candidates: out.sort(function (a, b) { return Math.abs(b.corrWithResidual || 0) - Math.abs(a.corrWithResidual || 0); }), productionChanged: false, note: 'Aucun changement automatique du modèle de production.' };
  }

  EA.memory = { KEY: KEY, SCHEMA: SCHEMA, createMemory: createMemory, clv: clv, hashOf: hashOf, stats: stats, competitionMemory: competitionMemory, walkForward: walkForward,
    modelPerf: modelPerf, modelHealth: modelHealth, killSwitchWeight: killSwitchWeight, autoDiscovery: autoDiscovery, metricsFor: metricsFor };
  if (typeof module === 'object' && module.exports) module.exports = EA.memory;
})(typeof window !== 'undefined' ? window : global);
