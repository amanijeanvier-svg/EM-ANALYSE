/* EA DATABASE INTELLIGENCE (S50–S99) : anti-leakage, qualité, baseline, équipe vs ligue, horizons temporels, matchup, conflit,
   stabilité, pipeline de décision (VALUE/CHECK/NO BET/BLOCKED), priorités, overfitting, évolution contrôlée, santé, statut système, tendance.
   Principe : jamais de donnée inventée ; en cas de doute → CHECK / NO BET / BLOCKED. */
(function (g) {
  'use strict';
  var EA = g.EA = g.EA || {}; if (!EA.database) return;
  var D = EA.database, N = D.norm;
  var CFG = { K: 20, bands: [{ min: 80, label: 'EXCELLENTE' }, { min: 60, label: 'SOLIDE' }, { min: 40, label: 'MOYENNE' }, { min: 20, label: 'LIMITÉE' }, { min: 0, label: 'INSUFFISANTE' }], conflictNoBet: 55, conflictCaution: 30, stabilityNoBet: 40, stabilityCaution: 65, minEV: 0.05, minEdgePts: 2, dqNoBet: 40, dqCaution: 60, mid: 20, form: 10, recent: 5, medals: ['🥇 PRIORITÉ 1', '🥈 PRIORITÉ 2', '🥉 PRIORITÉ 3'] };
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function band(s) { for (var i = 0; i < CFG.bands.length; i++) if (s >= CFG.bands[i].min) return CFG.bands[i].label; return 'INSUFFISANTE'; }

  // S50-51 : reconstruction « avant ce match » + contrôle de fuite
  function strictMatches(store, o) { var f = { sport: o.sport, before: o.before || today(), strict: !o.live }, ms = store.played(f), all = store.played({ sport: o.sport, before: f.before }); return { matches: ms, excludedApprox: all.length - ms.length }; }
  function leakageCheck(ms, cutoff, live) { var v = ms.filter(function (m) { return !m.date || (!live && m.dateApprox) || m.date >= cutoff; }).map(function (m) { return m.id || m.date; }); return { status: v.length ? 'BLOCKED' : 'SAFE', icon: v.length ? '🔴 BLOCKED' : '🟢 SAFE', cutoff: cutoff, used: ms.length, approxUsed: ms.filter(function (m) { return m.dateApprox; }).length, live: !!live, violations: v.slice(0, 10) }; }

  // S52 : qualité de la base
  function dataQuality(store, f) {
    var all = store.played(f), n = all.length, meta = store.meta(), q = meta.quarantined || 0, dup = meta.duplicates || 0; if (!n) return { score: 0, band: 'INSUFFISANTE', n: 0, dims: {}, note: 'Aucune donnée.' };
    var last = all[n - 1].date, days = (Date.parse(today()) - Date.parse(last)) / 864e5, cov = function (k) { return all.filter(function (m) { return D.statTotal(m, k) != null; }).length / n; };
    var teams = {}, seasons = {}, comps = {}; all.forEach(function (m) { [['h', m.home], ['a', m.away]].forEach(function (p) { var t = teams[N(p[1])] = teams[N(p[1])] || { h: 0, a: 0 }; t[p[0]]++; }); seasons[m.season] = 1; comps[m.competition] = 1; });
    var tk = Object.keys(teams), both = tk.filter(function (t) { return teams[t].h >= 5 && teams[t].a >= 5; }).length, rec = all.filter(function (m) { return (Date.parse(today()) - Date.parse(m.date)) / 864e5 <= 60; }).length, approx = all.filter(function (m) { return m.dateApprox; }).length;
    var half = Math.floor(n / 2), o25 = function (a) { return a.length ? a.filter(function (m) { return m.hs + m.as > 2.5; }).length / a.length : null; }, p1 = o25(all.slice(0, half)), p2 = o25(all.slice(half));
    var dims = { sample: 100 * Math.min(1, Math.log10(1 + n) / Math.log10(301)), freshness: 100 * clamp(1 - (days - 14) / 351, 0, 1), completeness: 100 * (cov('corners') + cov('sot') + cov('shots')) / 3,
      diversity: 50 * Math.min(1, tk.length / 20) + 50 * Math.min(1, Object.keys(seasons).length / 3), consistency: 100 * (1 - (q + dup) / (n + q + dup)), coverage: tk.length ? 100 * both / tk.length : 0, recent: 100 * Math.min(1, rec / 20),
      stability: n >= 20 && p1 != null ? 100 * (1 - Math.min(1, Math.abs(p1 - p2) / 0.25)) : 0, provenance: 100 * (1 - approx / n) };
    var W = { sample: .2, freshness: .1, completeness: .15, diversity: .1, consistency: .15, coverage: .1, recent: .05, stability: .05, provenance: .1 }, s = 0; Object.keys(W).forEach(function (k) { s += W[k] * dims[k]; });
    var out = { score: Math.round(s), band: band(s), n: n, dims: dims, lastMatch: last };
    if (n < 30) { out.band = out.score >= 20 ? 'LIMITÉE' : 'INSUFFISANTE'; out.note = 'N = ' + n + ' : INSUFFICIENT SAMPLE, aucune précision affichée.'; } return out;
  }

  // S55-56 : équipe vs baseline du championnat
  function pair(name, t, l) { if (!t || !l || !t.n || !l.n || t.pct == null || l.pct == null) return { name: name, unknown: true }; var d = (t.pct - l.pct) * 100; return { name: name, team: t, league: l, diffPts: d, shrunkPts: d * t.n / (t.n + CFG.K), level: t.level }; }
  function avgPair(name, t, l, ratio) { if (!t || !l || t.avg == null || l.avg == null || !l.avg) return { name: name, unknown: true }; var r = t.avg / l.avg; return { name: name, team: t, league: l, ratio: r, shrunkRatio: 1 + (r - 1) * t.n / (t.n + CFG.K), n: t.n }; }
  function teamVsLeague(store, team, f) {
    var L = store.league(f), T = store.team(team, f), G = T.global; if (!L.n || !G.n) return { items: [], unknown: true, note: 'Données insuffisantes.' };
    var win = { k: L.result.home.k + L.result.away.k, n: 2 * L.n }; win.pct = win.k / win.n; var tw = { k: G.W, n: G.n, pct: G.W / G.n, level: G.level }, tl = { k: G.L, n: G.n, pct: G.L / G.n, level: G.level };
    var items = [pair('Victoires', tw, win), pair('Nuls', { k: G.D, n: G.n, pct: G.D / G.n, level: G.level }, L.result.draw), pair('Défaites', tl, win)];
    if (L.btts) { items.push(pair('BTTS', G.btts, L.btts.yes), pair('Over 1.5', G.over[1.5], L.totals[1.5].over), pair('Over 2.5', G.over[2.5], L.totals[2.5].over), pair('Under 2.5', G.under[2.5], L.totals[2.5].under)); }
    var half = { avg: L.goals.avg == null ? null : L.goals.avg / 2 }; items.push(avgPair('Buts marqués / match (attaque)', G.gf, half), avgPair('Buts encaissés / match (défense)', G.ga, half));
    if (L.corners) [['Corners produits', G.corners.for, L.corners.total, 'c'], ['Corners concédés', G.corners.against, L.corners.total], ['Tirs', G.shots.for, L.shots.total], ['Tirs cadrés', G.sot.for, L.sot.total]].forEach(function (x) { items.push(avgPair(x[0], x[1], { avg: x[2].avg == null ? null : x[2].avg / 2 })); });
    return { team: team, n: G.n, items: items, note: 'Écart shrinké selon N : une petite série ne domine pas la baseline.' };
  }

  // S54 : horizons temporels + shrinkage emboîté (long terme → saison → 20 → 10 → 5)
  function horizons(tv, test, flags) {
    var K = CFG.K * (flags && (flags.coachChange || flags.squadChange || flags.newCompetition) ? 0.5 : 1), rate = function (a) { var k = a.filter(test).length; return { k: k, n: a.length, pct: a.length ? k / a.length : null }; };
    if (!tv.length) return { available: false };
    var ss = tv[tv.length - 1].m.season, n = tv.length, out = { rates: {}, weights: {} }, long = rate(tv).pct, seg = [['older', tv.slice(0, Math.max(0, n - CFG.mid))], ['mid', tv.slice(Math.max(0, n - CFG.mid), Math.max(0, n - CFG.form))], ['form', tv.slice(Math.max(0, n - CFG.form), Math.max(0, n - CFG.recent))], ['recent', tv.slice(Math.max(0, n - CFG.recent))]], est = null;
    out.rates.long = rate(tv); out.rates.season = rate(tv.filter(function (t) { return t.m.season === ss; })); out.rates.mid = rate(tv.slice(-CFG.mid)); out.rates.form = rate(tv.slice(-CFG.form)); out.rates.recent = rate(tv.slice(-CFG.recent));
    seg.forEach(function (h) { var r = rate(h[1]); if (!r.n) return; if (est == null) { est = r.pct; out.weights[h[0]] = 1; } else { out.weights[h[0]] = r.n / (r.n + K); est = (r.k + est * K) / (r.n + K); } });   // segments NON chevauchants : aucune donnée comptée deux fois
    var gap = Math.abs(est - long), rr = out.rates.recent;
    return Object.assign(out, { available: true, estimate: est, recencySignal: gap < 0.04 ? 'faible' : gap < 0.1 ? 'moyen' : 'fort', note: 'PLUS RÉCENT ≠ TOUJOURS PLUS IMPORTANT : ' + rr.k + '/' + rr.n + ' récents pèsent ' + ((out.weights.recent || 0) * 100).toFixed(0) + ' % face à la base.', flagsApplied: K !== CFG.K });
  }

  // S57-58 : matchup + conflit
  function matchup(store, o, cons) {
    var f = { sport: o.sport, competition: o.competition, before: o.before, strict: !o.live }, L = store.league(f), out = { strong: [], medium: [], weak: [], insufficient: [], contradictions: [], expected: null };
    if (!cons || !cons.available) { out.insufficient.push('Base insuffisante pour ce contexte'); return out; }
    var base = cons.signals.filter(function (s) { return s.name === 'League baseline'; })[0], b = base ? base.p : 0.5;
    cons.signals.forEach(function (s) { if (s.name === 'League baseline') return; var d = s.p - b, item = { name: s.name, delta: d * 100, n: s.n, dir: d >= 0 ? '+' : '−' };
      if (s.n != null && s.w < 0.2) out.insufficient.push(s.name + ' (N=' + s.n + ')'); else if (Math.abs(d) >= .08 && s.w >= .4) out.strong.push(item); else if (Math.abs(d) >= .04) out.medium.push(item); else out.weak.push(item); });
    var sm = out.strong.concat(out.medium); for (var i = 0; i < sm.length; i++) for (var j = i + 1; j < sm.length; j++) if (sm[i].dir !== sm[j].dir) out.contradictions.push(sm[i].name + ' ' + sm[i].dir + ' ≠ ' + sm[j].name + ' ' + sm[j].dir);
    if (o.sport !== 'basketball' && L.n >= 20 && L.goalsHome.avg != null) {
      var H = store.team(o.home, f).home, A = store.team(o.away, f).away, sh = function (r, n) { return 1 + (r - 1) * n / (n + CFG.K); };
      if (H.gf.avg != null && A.gf.avg != null && L.goalsHome.avg && L.goalsAway.avg) { var ah = sh(H.gf.avg / L.goalsHome.avg, H.n), dh = sh(H.ga.avg / L.goalsAway.avg, H.n), aa = sh(A.gf.avg / L.goalsAway.avg, A.n), da = sh(A.ga.avg / L.goalsHome.avg, A.n);
        out.expected = { home: L.goalsHome.avg * ah * da, away: L.goalsAway.avg * aa * dh, leagueTotal: L.goals.avg, n: [H.n, A.n] }; out.expected.total = out.expected.home + out.expected.away; } }
    return out;
  }
  function conflictScore(cons, mu) {
    if (!cons || !cons.available) return { score: null, label: 'inconnu' }; var s = cons.signals.filter(function (x) { return x.w >= 0.2; }); if (s.length < 2) return { score: 0, label: 'faible (peu de sources)' };
    var sw = s.reduce(function (a, x) { return a + x.w; }, 0), m = s.reduce(function (a, x) { return a + x.w * x.p; }, 0) / sw, dev = s.reduce(function (a, x) { return a + x.w * Math.abs(x.p - m); }, 0) / sw;
    var sc = Math.round(clamp(100 * dev / 0.10 + (mu && mu.contradictions.length ? 20 : 0), 0, 100)); return { score: sc, label: sc >= CFG.conflictNoBet ? 'fort' : sc >= CFG.conflictCaution ? 'modéré' : 'faible' };
  }

  // S65 : stabilité sous perturbations raisonnables
  function stabilityTest(ms, o) {
    var base = D.consensus(ms, o), ps = [], run = function (list, c) { var r = D.consensus(list, o, Object.assign({}, D.CFG, c || {})); if (r.available) ps.push(r.p); };
    if (!base.available) return { available: false }; run(ms, { priorN: D.CFG.priorN * 0.5 }); run(ms, { priorN: D.CFG.priorN * 2 }); run(ms, { recentN: 3 }); run(ms, { recentN: 8 });
    [0, 3, 6].forEach(function (off) { run(ms.filter(function (m, i) { return i % 10 !== off; })); }); if (o.modelP != null) { var nm = D.consensus(ms, Object.assign({}, o, { modelP: null })); if (nm.available) ps.push(nm.p); }
    ps.push(base.p); var range = Math.max.apply(null, ps) - Math.min.apply(null, ps), st = Math.round(100 * (1 - Math.min(1, range / 0.12)));
    return { available: true, range: range, stability: st, label: st >= 70 ? 'élevée' : st >= 40 ? 'moyenne' : 'faible', variants: ps.length };
  }

  // S60-64, S69-70, S96-97, S99 : pipeline de décision
  function confidence(f) {
    var vals = Object.keys(f).map(function (k) { return f[k]; }), mean = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length, mn = Math.min.apply(null, vals);
    return { score: Math.floor(Math.min(mean, mn + 25)), factors: f, note: 'Plafonnée à (facteur le plus faible + 25) : aucun facteur seul ne crée la confiance.' };
  }
  function analyze(store, o) {
    var V = EA.value, tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10), cutoff = o.before || (o.live ? tomorrow : today()), A = Object.assign({}, o, { before: cutoff }), sm = strictMatches(store, A), leak = leakageCheck(sm.matches, cutoff, o.live), dq = dataQuality(store, { sport: o.sport, competition: o.competition, before: cutoff, strict: !o.live });
    var R = { input: A, leak: leak, excludedApprox: sm.excludedApprox, dq: dq, reasons: [], why: [], risks: [] };
    if (leak.status === 'BLOCKED') { R.decision = 'BLOCKED'; R.reasons.push('DATA LEAKAGE : données postérieures ou sans date fiable'); return R; }
    var cons = D.consensus(sm.matches, A); R.cons = cons; if (!cons.available) { R.decision = 'NO BET'; R.reasons.push('Marché mal couvert : ' + cons.reason); return R; }
    var mu = matchup(store, A, cons), cf = conflictScore(cons, mu), stb = stabilityTest(sm.matches, A); R.matchup = mu; R.conflict = cf; R.stability = stb;
    var pFinal = cons.p, price = null; R.probabilities = { model: o.modelP == null ? null : o.modelP, adjusted: cons.p, final: pFinal, impliedRaw: null, normalized: null, overround: null, source: 'EA DATABASE + modèle (shrinkage)' };
    if (o.odds > 1) { R.probabilities.impliedRaw = 1 / o.odds; var mk = V && o.oddsOther && o.oddsOther.length ? V.marketFromOdds([o.odds].concat(o.oddsOther)) : null; if (mk) { R.probabilities.normalized = mk.fairProbs[0]; R.probabilities.overround = mk.marginPct; } price = V ? V.valueLine(pFinal, o.odds) : null; }
    R.fairOdds = 1 / pFinal; var half = cons.uncertaintyHalfPts; R.uncertainty = cons.signals.length >= 2 ? { halfPts: half, note: '± ' + half + ' pts (intervalle de proportion, indicatif)' } : { halfPts: null, note: 'incertitude non quantifiée' };
    var mkp = R.probabilities.normalized != null ? R.probabilities.normalized : R.probabilities.impliedRaw; R.edgePts = mkp == null ? null : (pFinal - mkp) * 100; R.ev = o.odds > 1 ? pFinal * o.odds - 1 : null; R.evLow = o.odds > 1 && half != null ? (pFinal - half / 100) * o.odds - 1 : null; R.minOdds = (1 + CFG.minEV) / pFinal;
    R.confidence = confidence({ dataQuality: dq.score, sample: clamp(dq.n / 3, 0, 100), stability: stb.available ? stb.stability : 0, agreement: cf.score == null ? 0 : 100 - cf.score, market: o.odds > 1 ? (R.probabilities.normalized != null ? 100 : 60) : 20, uncertainty: half == null ? 0 : clamp(100 - half * 4, 0, 100), freshness: dq.dims.freshness || 0 });
    var d, r = R.reasons;
    if (!(o.odds > 1)) { d = 'NO BET'; r.push('Cote absente ou invalide'); }
    else if (dq.score < CFG.dqNoBet) { d = 'NO BET'; r.push('Données insuffisantes (qualité ' + dq.band + ')'); }
    else if (cf.score >= CFG.conflictNoBet) { d = 'NO BET'; r.push('Contradiction importante entre les sources (conflit ' + cf.score + '/100) : signal insuffisamment cohérent'); }
    else if (stb.available && stb.stability < CFG.stabilityNoBet) { d = 'NO BET'; r.push('Instabilité élevée du signal (' + stb.stability + '/100)'); }
    else if (R.ev < CFG.minEV || R.edgePts < CFG.minEdgePts) { d = R.ev > 0 ? 'CHECK' : 'NO BET'; r.push(R.ev > 0 ? 'Avantage trop faible (EV ' + (R.ev * 100).toFixed(1) + ' %) : à surveiller' : 'EV insuffisant / cote insuffisante (cote juste ' + R.fairOdds.toFixed(2) + ', cote minimale ' + R.minOdds.toFixed(2) + ')'); }
    else if (R.evLow != null && R.evLow <= 0) { d = 'CHECK'; r.push('EV négatif une fois l\'incertitude retirée'); }
    else if (cf.score >= CFG.conflictCaution || dq.score < CFG.dqCaution || (stb.available && stb.stability < CFG.stabilityCaution)) { d = 'CHECK'; r.push('Prudence : conflit ' + cf.label + ', qualité ' + dq.band + ', stabilité ' + (stb.available ? stb.label : '?')); }
    else { d = 'VALUE'; r.push('EV ' + (R.ev * 100).toFixed(1) + ' %, edge ' + R.edgePts.toFixed(1) + ' pts, sources cohérentes, qualité ' + dq.band); }
    R.decision = d;
    mu.strong.forEach(function (s) { R.why.push(s.name + ' : ' + (s.dir === '+' ? '+' : '') + s.delta.toFixed(1) + ' pts vs baseline (N=' + s.n + ')'); }); if (dq.score >= CFG.dqCaution) R.why.push('Qualité des données ' + dq.band + ' (N=' + dq.n + ')'); if (stb.available && stb.stability >= 70) R.why.push('Stabilité élevée (' + stb.stability + '/100)'); if (R.ev > CFG.minEV) R.why.push('Cote ' + o.odds + ' supérieure à la cote cible ' + R.minOdds.toFixed(2));
    mu.contradictions.forEach(function (c) { R.risks.push('Contradiction : ' + c); }); mu.insufficient.forEach(function (c) { R.risks.push('Données insuffisantes : ' + c); }); if (cf.score >= CFG.conflictCaution) R.risks.push('Conflit ' + cf.label + ' (' + cf.score + '/100)'); if (o.sport !== 'basketball' && R.probabilities.overround == null) R.risks.push('Marge du bookmaker non retirée (probabilité implicite brute)');
    return R;
  }
  function priorities(list) {
    var ok = (list || []).filter(function (r) { return r.decision === 'VALUE'; }).map(function (r) { return { r: r, score: 0.3 * (r.evLow == null ? r.ev : r.evLow) * 100 + 0.2 * r.edgePts + 0.2 * r.confidence.score / 10 + 0.15 * (r.stability.stability || 0) / 10 + 0.15 * r.dq.score / 10 - 0.1 * (r.conflict.score || 0) / 10 }; });
    ok.sort(function (a, b) { return b.score - a.score; }); return ok.slice(0, 3).map(function (x, i) { return { medal: CFG.medals[i], score: x.score, result: x.r }; });
  }

  // S98 : surveillance (tendance), S77 : overfitting
  function trendShift(store, f) {
    var ms = store.played(f), out = []; if (ms.length < 70) return { items: [], note: 'N = ' + ms.length + ' : surveillance impossible (minimum 70).' };
    var hist = ms.slice(0, -20), rec = ms.slice(-20), tests = { 'Over 2.5': function (m) { return m.hs + m.as > 2.5; }, BTTS: function (m) { return m.hs > 0 && m.as > 0; }, 'Victoire domicile': function (m) { return m.hs > m.as; } };
    Object.keys(tests).forEach(function (k) { var p1 = hist.filter(tests[k]).length / hist.length, p2 = rec.filter(tests[k]).length / rec.length, p = ms.filter(tests[k]).length / ms.length, z = (p2 - p1) / Math.sqrt(Math.max(1e-9, p * (1 - p) * (1 / hist.length + 1 / rec.length)));
      out.push({ metric: k, hist: p1, recent: p2, nHist: hist.length, nRecent: rec.length, z: z, shift: Math.abs(z) >= 2 && Math.abs(p2 - p1) >= 0.10 }); });
    return { items: out, note: 'TREND SHIFT ≠ tendance permanente : à confirmer sur plusieurs périodes.' };
  }
  function overfitting(bt, records, params) {
    var a = [], parts = bt && bt.parts; if (!parts || bt.insufficient) return { risk: false, alerts: [], note: 'Échantillon insuffisant pour juger.' };
    var tr = parts.training.v3, te = parts.test.v3; if (tr.roi != null && te.roi != null && tr.roi > 0.05 && te.roi < 0) a.push('Excellent historique (ROI ' + (tr.roi * 100).toFixed(1) + ' %) mais mauvais test (' + (te.roi * 100).toFixed(1) + ' %)');
    if (bt.total < 100) a.push('Échantillon faible (' + bt.total + ' paris)'); if ((params || 0) > bt.total / 10) a.push('Trop de paramètres (' + params + ') pour ' + bt.total + ' paris');
    var rs = (records || []).filter(function (r) { return r.result && r.result.profitUnits > 0 && r.type !== 'combo'; }), tot = rs.reduce(function (s, r) { return s + r.result.profitUnits; }, 0);
    if (tot > 0 && rs.length >= 10) { var byC = {}, byM = {}; rs.forEach(function (r) { byC[r.competition || '?'] = (byC[r.competition || '?'] || 0) + r.result.profitUnits; var m = new Date(r.createdAt || 0).toISOString().slice(0, 7); byM[m] = (byM[m] || 0) + r.result.profitUnits; });
      if (Math.max.apply(null, Object.keys(byC).map(function (k) { return byC[k]; })) / tot > 0.7 && Object.keys(byC).length > 1) a.push('Performance concentrée sur une seule compétition'); if (Math.max.apply(null, Object.keys(byM).map(function (k) { return byM[k]; })) / tot > 0.6 && Object.keys(byM).length > 1) a.push('Performance concentrée sur une petite période'); }
    return { risk: a.length > 0, alerts: a, label: a.length ? '⚠️ OVERFITTING RISK' : 'aucun signe détecté' };
  }

  // S73 : évolution contrôlée (test hors échantillon, adoption ou ROLLBACK)
  function evolve(records, oldFn, newFn, o) {
    var c = Object.assign({ minN: 100, margin: 0.002, oosShare: 0.4 }, o || {}), rs = (records || []).filter(function (r) { return r.result && r.result.outcome !== 'void' && r.pModel != null; }).sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
    if (rs.length < c.minN) return { decision: 'INSUFFICIENT', n: rs.length, note: 'Moins de ' + c.minN + ' observations : aucune adoption possible, version actuelle conservée.' };
    var oos = rs.slice(Math.floor(rs.length * (1 - c.oosShare))), br = function (fn) { return oos.reduce(function (s, r) { return s + Math.pow(fn(r.pModel) - (r.result.outcome === 'won' ? 1 : 0), 2); }, 0) / oos.length; }, bo = br(oldFn), bn = br(newFn), adopt = bn < bo - c.margin;
    return { decision: adopt ? 'ADOPT' : 'ROLLBACK', n: rs.length, oosN: oos.length, brierOld: bo, brierNew: bn, note: adopt ? 'Nouvelle version meilleure hors échantillon.' : 'Pas d\'amélioration hors échantillon : retour à la version précédente.' };
  }

  // S74, S87 : santé des moteurs et statut système (aucun 🟢 simulé)
  function modelHealth(records) {
    var by = {}; (records || []).forEach(function (r) { if (r.type === 'combo' || !r.result || r.result.outcome === 'void' || r.pModel == null) return; var k = (r.sport || '?') + '/' + r.market; (by[k] = by[k] || []).push(r); });
    return Object.keys(by).map(function (k) { var a = by[k].sort(function (x, y) { return (x.createdAt || 0) - (y.createdAt || 0); }), n = a.length, br = function (s) { return s.reduce(function (t, r) { return t + Math.pow(r.pModel - (r.result.outcome === 'won' ? 1 : 0), 2); }, 0) / s.length; }, hit = a.filter(function (r) { return r.result.outcome === 'won'; }).length / n, mp = a.reduce(function (t, r) { return t + r.pModel; }, 0) / n;
      var all = br(a), rec = br(a.slice(-30)), gap = Math.abs(hit - mp), st = n < 30 ? 'INSUFFICIENT DATA' : (all > 0.26 || gap > 0.15) ? 'DEGRADED' : (all <= 0.24 && gap <= 0.08 && rec <= all + 0.03) ? 'HEALTHY' : 'MONITOR';
      return { key: k, n: n, status: st, icon: { HEALTHY: '🟢', MONITOR: '🟡', DEGRADED: '🔴', 'INSUFFICIENT DATA': '⚪' }[st], brier: all, brierRecent: rec, gap: gap, version: a[n - 1].modelVersion || '?', lastUpdate: new Date(a[n - 1].createdAt || 0).toISOString().slice(0, 10) }; });
  }
  function systemStatus(store, records, bt) {
    var m = store.meta(), dq = dataQuality(store, {}), mh = modelHealth(records), settled = (records || []).filter(function (r) { return r.result && r.result.outcome !== 'void'; }).length, pm = EA.market ? EA.market.perf(records) : {}, doc = Object.keys(pm).filter(function (k) { return pm[k].documented; }).length;
    var qr = m.matches ? (m.quarantined + m.duplicates) / (m.matches + m.quarantined + m.duplicates) : 0, row = function (n, ic, d) { return { name: n, icon: ic, detail: d }; };
    return [row('DATABASE', m.state === 'READY' ? '🟢' : '⚪', m.state === 'READY' ? m.matches + ' matchs' : 'vide'), row('DATA QUALITY', dq.band === 'EXCELLENTE' || dq.band === 'SOLIDE' ? '🟢' : dq.band === 'MOYENNE' ? '🟡' : '⚪', dq.band + ' (' + dq.score + '/100)'),
      row('MODELS', mh.some(function (x) { return x.status === 'DEGRADED'; }) ? '🔴' : mh.some(function (x) { return x.status === 'HEALTHY'; }) ? '🟢' : mh.length ? '🟡' : '⚪', mh.length ? mh.length + ' marché(s) suivis' : 'aucune mesure'), row('MARKETS', doc ? '🟢' : '⚪', doc + ' marché(s) documenté(s) (≥ 30)'),
      row('CALIBRATION', settled >= 100 ? '🟢' : settled >= 30 ? '🟡' : '⚪', settled + ' résultat(s) réglé(s)'), row('LEARNING', settled > 0 ? '🟢' : '⚪', settled > 0 ? 'post-match actif' : 'aucun résultat'), row('INTEGRITY', qr === 0 ? '🟢' : qr < 0.2 ? '🟡' : '🔴', m.quarantined + ' quarantaine · ' + m.duplicates + ' doublon(s) probable(s)'),
      row('WALK-FORWARD', bt && !bt.insufficient ? '🟢' : '⚪', bt && !bt.insufficient ? bt.total + ' paris' : 'échantillon insuffisant (< 60)'), row('AUTO-UPDATE', '🟡', 'mise à jour locale incrémentale ; aucune API connectée')];
  }

  // S94 : interfaces prêtes pour une API future (aucune connexion simulée)
  var api = { provider: 'NONE (MANUAL / LOCAL)',
    importData: function (rows) { return D.createStore(g.localStorage).upsert(rows); }, updateData: function (rows) { return EA.dbui ? EA.dbui.store().upsert(rows) : null; }, validateData: function (rows) { var r = (rows || []).map(D.normalize); return { total: r.length, invalid: r.filter(function (x) { return x.bad; }).length, issues: r.map(function (x) { return x.issues; }) }; },
    normalizeData: function (rows) { return (rows || []).map(function (x) { return D.normalize(x).match; }); }, rebuildDatabase: function (sources) { return EA.dbui ? EA.dbui.store().initialize(sources || (EA.dbui.sources && EA.dbui.sources())) : null; },
    updateModels: function (records) { return { market: EA.market ? EA.market.perf(records) : null, health: modelHealth(records) }; }, settleMatch: function (row) { return api.updateData([row]); } };
  EA.dbintel = { CFG: CFG, strictMatches: strictMatches, leakageCheck: leakageCheck, dataQuality: dataQuality, teamVsLeague: teamVsLeague, horizons: horizons, matchup: matchup, conflictScore: conflictScore, stabilityTest: stabilityTest, analyze: analyze, priorities: priorities, confidence: confidence,
    trendShift: trendShift, overfitting: overfitting, evolve: evolve, modelHealth: modelHealth, systemStatus: systemStatus, api: api };
  if (typeof module === 'object' && module.exports) module.exports = EA.dbintel;
})(typeof window !== 'undefined' ? window : global);
