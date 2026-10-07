/* EA FINAL LAYER (S99–S155) : FINAL DECISION GATE, niveau de risque, sizing branché, confiance globale, rapport multi-marchés + combiné,
   performance réelle, mémoire de patterns d'erreurs, dérive, registre des moteurs (vérité du code), couches, contrôle final réel, pipeline d'ajout de match, API-ready. */
(function (g) {
  'use strict';
  var EA = g.EA = g.EA || {}; if (!EA.database || !EA.dbintel) return;
  var D = EA.database, I = EA.dbintel, N = D.norm;
  var MK0 = { 'over:1.5': 'Over 1.5', 'over:2.5': 'Over 2.5', 'over:3.5': 'Over 3.5', btts_yes: 'BTTS Oui', btts_no: 'BTTS Non', home_win: 'Victoire domicile', draw: 'Nul', away_win: 'Victoire extérieur', home_or_draw: 'Domicile ou nul', away_or_draw: 'Extérieur ou nul', home_or_away: 'Pas de nul' };
  function labelOf(k) { if (MK0[k]) return MK0[k]; var m = /^(over|under):([\d.]+)$/.exec(k); if (m) return (m[1] === 'over' ? 'Over ' : 'Under ') + m[2]; m = /^(home|away)_margin_gte:(\d+)$/.exec(k); if (m) return 'Victoire ' + (m[1] === 'home' ? 'domicile' : 'extérieur') + ' par ' + m[2] + '+'; m = /^(corners|sot|shots|cards)_(over|under):([\d.]+)$/.exec(k); if (m) return ({ corners: 'Corners', sot: 'Tirs cadrés', shots: 'Tirs', cards: 'Cartons' })[m[1]] + ' ' + (m[2] === 'over' ? 'Over ' : 'Under ') + m[3]; return k; }
  var MK = typeof Proxy === 'function' ? new Proxy(MK0, { get: function (t, k) { return typeof k === 'string' ? labelOf(k) : t[k]; } }) : MK0;
  function proKey(sport, mk) { var m = /^(over|under):([\d.]+)$/.exec(mk); return (sport || 'football') + '/' + (m ? 'ou:' + m[2] : /^btts/.test(mk) ? 'btts' : '1X2'); }

  function riskLevel(R) {
    if (!R.cons || !R.cons.available) return { level: 'EXTREME', points: 9, why: ['marché non estimable'] };
    var p = 0, w = [], u = R.uncertainty && R.uncertainty.halfPts, add = function (n, t) { p += n; w.push(t); };
    if (u == null) add(2, 'incertitude non quantifiée'); else if (u > 10) add(2, 'incertitude ±' + u + ' pts'); else if (u > 6) add(1, 'incertitude ±' + u + ' pts');
    var cs = R.conflict && R.conflict.score; if (cs >= 55) add(3, 'conflit fort'); else if (cs >= 30) add(1, 'conflit modéré');
    if (R.dq.score < 40) add(2, 'qualité faible'); else if (R.dq.score < 60) add(1, 'qualité moyenne');
    var st = R.stability && R.stability.available ? R.stability.stability : null; if (st == null) add(1, 'stabilité inconnue'); else if (st < 40) add(2, 'instabilité'); else if (st < 65) add(1, 'stabilité moyenne');
    if (R.edgePts != null && R.edgePts < 2) add(1, 'edge faible'); if (R.probabilities && R.probabilities.overround == null) add(1, 'marge bookmaker non retirée');
    var lv = p <= 1 ? 'LOW' : p <= 3 ? 'MEDIUM' : p <= 5 ? 'HIGH' : 'EXTREME';
    if ((u == null || u > 8) && lv === 'LOW') { lv = 'MEDIUM'; w.push('EV élevé ≠ risque faible quand l\'incertitude est grande'); }
    return { level: lv, points: p, why: w };
  }
  function gate(R, o) {
    var c = [], add = function (id, label, ok, level, detail) { c.push({ id: id, label: label, ok: ok, level: level, detail: detail || '' }); }, dq = R.dq, has = R.cons && R.cons.available, ev = R.ev, stb = R.stability && R.stability.available ? R.stability : null, cf = R.conflict, odds = o.odds > 1;
    add('valid', 'Données valides', dq.n > 0 && (!dq.dims || dq.dims.consistency == null || dq.dims.consistency >= 60), 'critical', 'N=' + dq.n);
    add('enough', 'Données suffisantes', dq.n >= 30 && dq.score >= I.CFG.dqNoBet, 'critical', 'qualité ' + dq.band + ' · N=' + dq.n);
    add('leak', 'Aucune fuite de données futures', R.leak.status === 'SAFE', 'critical', R.leak.icon);
    add('model', 'Modèle réellement disponible', o.modelP != null, 'caution', o.modelP != null ? 'modèle + base' : 'aucun modèle fourni : estimation issue de la base seule');
    add('market', 'Marché réellement disponible', !!has, 'critical', has ? '' : (R.cons && R.cons.reason) || 'marché mal couvert');
    add('odds', 'Cote valide', odds, 'critical', odds ? 'cote ' + o.odds : 'Cote absente ou invalide');
    add('edge', 'Edge suffisant', ev == null ? null : R.edgePts >= I.CFG.minEdgePts, ev != null && ev <= 0 ? 'critical' : 'caution', ev == null ? 'non évalué' : 'edge ' + R.edgePts.toFixed(1) + ' pts');
    add('ev', 'EV suffisant', ev == null ? null : ev >= I.CFG.minEV && (R.evLow == null || R.evLow > 0), ev != null && ev <= 0 ? 'critical' : 'caution', ev == null ? 'non évalué' : 'EV ' + (ev * 100).toFixed(1) + ' %' + (R.evLow != null ? ' (après incertitude ' + (R.evLow * 100).toFixed(1) + ' %)' : '') + ' · cote juste ' + R.fairOdds.toFixed(2) + ', cote minimale ' + R.minOdds.toFixed(2));
    add('stab', 'Stabilité acceptable', stb ? stb.stability >= I.CFG.stabilityCaution : null, stb && stb.stability < I.CFG.stabilityNoBet ? 'critical' : 'caution', stb ? stb.stability + '/100' : 'non évalué');
    add('conf', 'Contradiction acceptable', cf && cf.score != null ? cf.score < I.CFG.conflictCaution : null, cf && cf.score >= I.CFG.conflictNoBet ? 'critical' : 'caution', cf && cf.score != null ? 'conflit ' + cf.label + ' (' + cf.score + '/100)' : 'non évalué');
    add('unc', 'Incertitude acceptable', R.uncertainty ? (R.uncertainty.halfPts != null && R.uncertainty.halfPts <= 10) : null, 'caution', R.uncertainty ? R.uncertainty.note : 'non évalué');
    var rk = R.risk; add('risk', 'Risque acceptable', rk ? rk.level === 'LOW' || rk.level === 'MEDIUM' : null, rk && rk.level === 'EXTREME' ? 'critical' : 'caution', rk ? rk.level : 'non évalué');
    add('corr', 'Corrélation acceptable (combiné)', o.correlationOk === undefined ? null : !!o.correlationOk, 'critical', o.correlationOk === undefined ? 'sans objet (pari simple)' : '');
    return c;
  }
  function analyzeFull(store, o, ctx) {
    ctx = ctx || {}; var R = I.analyze(store, o), recs = ctx.records || [], A = R.input;
    var mh = I.modelHealth(recs).filter(function (x) { return x.key === proKey(o.sport, o.market); })[0], hist = mh && mh.status !== 'INSUFFICIENT DATA' ? ({ HEALTHY: 90, MONITOR: 60, DEGRADED: 20 })[mh.status] : null;
    var factors = R.confidence ? Object.assign({}, R.confidence.factors) : null, unavailable = ['Qualité du contexte (aucune donnée de contexte dans la base)'];
    if (factors) { factors.oddsAvailability = o.odds > 1 ? 100 : 0; if (hist != null) factors.modelHistory = hist; else unavailable.push('Historique du modèle sur ce marché (échantillon insuffisant)'); R.confidence = I.confidence(factors); R.confidence.unavailable = unavailable;
      if (ctx.overfit) { R.confidence.score = Math.max(0, R.confidence.score - 15); R.confidence.note += ' · ⚠️ OVERFITTING RISK : −15.'; } }
    R.risk = riskLevel(R); R.checks = gate(R, o);
    var crit = R.checks.filter(function (x) { return x.ok === false && x.level === 'critical'; }), cau = R.checks.filter(function (x) { return x.ok === false && x.level === 'caution'; });
    if (crit.length) { R.decision = crit.some(function (x) { return x.id === 'leak'; }) ? 'BLOCKED' : 'NO BET'; R.reasons = crit.map(function (x) { return x.label + ' : ' + x.detail; }); }
    else if (cau.length) { R.decision = 'CHECK'; R.reasons = cau.map(function (x) { return x.label + ' : ' + x.detail; }); }
    else { R.decision = 'VALUE'; R.reasons = ['Tous les contrôles du FINAL DECISION GATE sont satisfaits']; }
    R.sizing = { available: false, label: 'POSITION SIZE NOT AVAILABLE', reason: R.decision === 'VALUE' ? 'bankroll non renseignée' : 'aucune mise recommandée sans décision VALUE' };
    if (R.decision === 'VALUE' && ctx.bankroll > 0 && EA.bankroll && EA.core) { try { var sg = EA.bankroll.suggestStake({ bankroll: ctx.bankroll, p: R.probabilities.final - (R.uncertainty.halfPts || 0) / 100, odds: o.odds, minStake: ctx.minStake }, EA.core.DEFAULT_CONFIG);
      if (sg && sg.available) { var as = EA.risk ? EA.risk.assess({ bankroll: ctx.bankroll, proposed: sg.stake, records: recs }) : { stake: sg.stake, flags: [] }; R.sizing = { available: true, stake: as.stake, flags: as.flags || [], note: 'Plafonnée par le Risk Engine ; une mise n\'est jamais une garantie de profit.' }; } else R.sizing.reason = 'méthode de sizing non applicable à cette probabilité'; } catch (e) { R.sizing.reason = 'erreur de calcul : ' + e.message; } }
    var P = function (n, l, ok) { return { n: n, label: l, status: ok === true ? 'ok' : ok === false ? 'échec' : 'n/a' }; }, sg2 = R.cons && R.cons.signals || [], hasS = function (nm) { return sg2.some(function (s) { return s.name.indexOf(nm) === 0; }); };
    R.pipeline = [P(1, 'Données internes', R.dq.n > 0), P(2, 'Qualité', !!R.dq.band), P(3, 'Baseline', hasS('League')), P(4, 'Profils des équipes', hasS('Team season')), P(5, 'Forme', hasS('Team recent')), P(6, 'Matchup', !!R.matchup), P(7, 'Probabilités', !!R.probabilities), P(8, 'Fair odds', R.fairOdds != null), P(9, 'Comparaison aux cotes', o.odds > 1), P(10, 'Edge et EV', R.ev != null), P(11, 'Stabilité', !!(R.stability && R.stability.available)), P(12, 'Contradictions', !!(R.conflict && R.conflict.score != null)), P(13, 'Incertitude', !!R.uncertainty), P(14, 'Risque', !!R.risk), P(15, 'Corrélation', o.correlationOk === undefined ? null : !!o.correlationOk), P(16, 'FINAL DECISION GATE', true)];
    R.gateLabel = R.decision === 'NO BET' ? '🚫 NO BET' : R.decision; return R;
  }
  function legOf(R, o) { var m = R.input.market, mm = /^(over|under):([\d.]+)$/.exec(m), sel = mm ? ['ou:' + mm[2], mm[1]] : m === 'btts_yes' ? ['btts', 'yes'] : m === 'btts_no' ? ['btts', 'no'] : m === 'home_win' ? ['1X2', 'home'] : m === 'away_win' ? ['1X2', 'away'] : m === 'draw' ? ['1X2', 'draw'] : ['dc', m];
    return { matchKey: N(o.home) + '|' + N(o.away), label: o.home + ' – ' + o.away, market: sel[0], selection: sel[1], p: R.probabilities.final, odds: o.odds, value: { status: 'OK', ev: R.ev }, uncertaintyHalfPts: R.uncertainty.halfPts || 0, decision: 'BET', dataQuality: R.dq.score, dbConflict: false }; }
  // S116 : rapport multi-marchés (analyse indépendante de chaque marché) + meilleures opportunités + combiné
  function report(store, input, lines, ctx) {
    var list = (lines && lines.length ? lines : ['over:1.5', 'over:2.5', 'over:3.5', 'btts_yes', 'home_win', 'draw', 'away_win'].map(function (m) { return { market: m }; })), res = list.map(function (l) { return analyzeFull(store, Object.assign({}, input, { market: l.market, odds: l.odds, oddsOther: l.oddsOther, modelP: l.modelP }), ctx); });
    var pr = I.priorities(res), value = res.filter(function (r) { return r.decision === 'VALUE'; }), combo = null;
    if (value.length >= 2) { var legs = value.map(function (r) { return legOf(r, input); }); combo = EA.parlay ? EA.parlay.optimize(legs, {}) : null; }
    var note; if (!value.length) note = 'NO BET : aucun marché ne possède un avantage statistique suffisamment robuste.';
    else { var best = pr[0].result, oth = res.filter(function (r) { return r !== best && r.decision !== 'VALUE'; }); note = (MK[best.input.market] || best.input.market) + ' retenu' + (oth.length ? ' plutôt que ' + oth.slice(0, 3).map(function (r) { return (MK[r.input.market] || r.input.market) + ' (' + ((r.checks.filter(function (x) { return x.ok === false; })[0] || {}).label || 'moins solide') + ')'; }).join(', ') : '') + ' : confiance ' + best.confidence.score + '/100, stabilité ' + (best.stability.stability == null ? '?' : best.stability.stability) + '/100.'; }
    return { input: input, results: res, priorities: pr, combo: combo && combo.status === 'BET' ? combo : null, comboText: combo && combo.status === 'BET' ? '🔥 COMBINÉ RENTABLE' : '❌ Aucun combiné suffisamment solide.', choiceNote: note, freshness: res[0] && res[0].dq && res[0].dq.lastMatch || null };
  }

  // S118 : performance réelle (pertes comprises) ; S119 : résultats séparés des prédictions
  function performance(records, decisions) {
    var rows = []; (records || []).forEach(function (r) { if (r.result && r.result.outcome !== 'void') rows.push({ won: r.result.outcome === 'won', odds: r.odds, p: r.pModel, ev: r.ev, u: r.result.profitUnits, t: r.createdAt || 0, closing: r.closingOdds, src: 'pro' }); });
    (decisions || []).forEach(function (d) { if (d.result && d.result.outcome !== 'void') rows.push({ won: d.result.outcome === 'won', odds: d.prediction.odds, p: d.prediction.p, ev: d.prediction.ev, u: d.result.profitUnits, t: d.prediction.createdAt, src: 'db' }); });
    rows.sort(function (a, b) { return a.t - b.t; }); var n = rows.length; if (!n) return { n: 0, note: 'Aucun résultat réglé : aucune performance mesurable.' };
    var won = rows.filter(function (r) { return r.won; }).length, u = rows.filter(function (r) { return r.u != null; }), cum = 0, peak = 0, dd = 0, streak = 0, ms = 0, loss = 0; u.forEach(function (r) { cum += r.u; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); if (r.u < 0) loss += r.u; });
    rows.forEach(function (r) { if (!r.won) { streak++; ms = Math.max(ms, streak); } else streak = 0; });
    var cal = EA.calibration ? EA.calibration.buckets(rows.filter(function (r) { return r.p != null; }).map(function (r) { return { pModel: r.p, result: { outcome: r.won ? 'won' : 'lost' } }; })) : null, clv = rows.map(function (r) { return r.closing ? EA.memory.clv(r.odds, r.closing) : null; }).filter(Boolean);
    return { n: n, won: won, lost: n - won, hit: won / n, roi: u.length ? cum / u.length : null, profit: cum, totalLoss: loss, maxLosingStreak: ms, drawdown: dd, meanEV: rows.reduce(function (s, r) { return s + (r.ev || 0); }, 0) / n, brier: cal ? cal.brier : null, ece: cal ? cal.ece : null, clv: clv.length ? clv.reduce(function (s, x) { return s + x.clvProbPts; }, 0) / clv.length : 'UNAVAILABLE', level: EA.calibration ? EA.calibration.sampleLevel(n) : '?', note: 'PERFORMANCE HISTORIQUE ≠ GARANTIE FUTURE.' };
  }
  // S126 : patterns d'erreurs (jamais un résultat isolé)
  function errorPatterns(records) {
    var by = {}, out = { errors: [], patterns: [] }; (records || []).forEach(function (r) { if (r.type === 'combo' || !r.result || r.result.outcome === 'void' || r.pModel == null) return; var k = (r.sport || '?') + '/' + r.market; (by[k] = by[k] || []).push(r); });
    Object.keys(by).forEach(function (k) { var a = by[k], lost = a.filter(function (r) { return r.result.outcome === 'lost'; }), cats = {};
      lost.forEach(function (r) { var an = EA.postmortem ? EA.postmortem.analyze(r) : null, cat = an ? an.category : 'inconnu'; cats[cat] = (cats[cat] || 0) + 1; out.errors.push({ marche: k, championnat: r.competition || 'UNKNOWN', modele: r.modelVersion || 'UNKNOWN', prediction: r.pModel, resultat: 'perdu', ecart: r.pModel, contexte: cat, date: new Date(r.createdAt || 0).toISOString().slice(0, 10) }); });
      Object.keys(cats).forEach(function (c) { var share = cats[c] / lost.length; out.patterns.push({ marche: k, categorie: c, count: cats[c], n: a.length, share: share, pattern: a.length >= 30 && cats[c] >= 3 && share >= 0.4, note: a.length < 30 ? 'échantillon insuffisant : observation, pas un pattern' : cats[c] < 3 ? 'erreur isolée' : share >= 0.4 ? 'PATTERN d\'erreurs répété' : 'non dominant' }); }); });
    return out;
  }
  // S127 : dérive de distribution
  function drift(store, f, records) {
    var ms = store.played(f), out = []; var cont = function (name, get) { var v = ms.map(get).filter(function (x) { return x != null; }); if (v.length < 40) return; var h = v.slice(0, -20), r = v.slice(-20), m = function (a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; }, sd = function (a) { var mu = m(a); return Math.sqrt(a.reduce(function (s, x) { return s + Math.pow(x - mu, 2); }, 0) / Math.max(1, a.length - 1)); };
      var se = Math.sqrt(Math.pow(sd(h), 2) / h.length + Math.pow(sd(r), 2) / r.length), z = se ? (m(r) - m(h)) / se : 0; out.push({ metric: name, hist: m(h), recent: m(r), nHist: h.length, nRecent: r.length, z: z, shift: Math.abs(z) >= 2.5 }); };
    cont('Buts / match', function (x) { return x.hs + x.as; }); cont('Corners / match', function (x) { return x.stats.corners_h != null && x.stats.corners_a != null ? x.stats.corners_h + x.stats.corners_a : null; }); cont('Tirs cadrés / match', function (x) { return x.stats.sot_h != null && x.stats.sot_a != null ? x.stats.sot_h + x.stats.sot_a : null; }); cont('Tirs / match', function (x) { return x.stats.shots_h != null && x.stats.shots_a != null ? x.stats.shots_h + x.stats.shots_a : null; });
    cont('Victoire domicile (0/1)', function (x) { return x.hs > x.as ? 1 : 0; }); cont('BTTS (0/1)', function (x) { return x.hs > 0 && x.as > 0 ? 1 : 0; }); cont('Over 2.5 (0/1)', function (x) { return x.hs + x.as > 2.5 ? 1 : 0; });
    var cal = I.modelHealth(records || []).filter(function (x) { return x.n >= 60 && x.brierRecent > x.brier + 0.03; }).map(function (x) { return { metric: 'Calibration ' + x.key, hist: x.brier, recent: x.brierRecent, shift: true }; });
    return { items: out.concat(cal), label: '⚠️ DISTRIBUTION SHIFT', note: 'Un changement récent n\'est jamais considéré comme permanent ; à confirmer sur plusieurs périodes.' };
  }

  // S101/S102 : couches identifiables + registre des moteurs (vérité du code)
  function fn(o, n) { return !!(o && typeof o[n] === 'function'); }
  function layers() {
    var L = [['DATA LAYER', EA.database, ['parseCSV', 'fromLegacy', 'fromMemory']], ['DATABASE LAYER', EA.database, ['createStore']], ['VALIDATION LAYER', EA.database, ['normalize']], ['FEATURE ENGINE', EA.database, ['aggregate', 'teamView']], ['BASELINE ENGINE', EA.dbintel, ['teamVsLeague']], ['TEAM ENGINE', EA.dbintel, ['dataQuality']], ['FORM ENGINE', EA.dbintel, ['horizons']], ['MATCHUP ENGINE', EA.dbintel, ['matchup', 'conflictScore']],
      ['MODEL ENGINE', EA.models, ['poissonP', 'simulateFootball']], ['MARKET ENGINE', EA.value, ['marketFromOdds']], ['VALUE ENGINE', EA.value, ['valueLine', 'decide']], ['UNCERTAINTY ENGINE', EA.dbintel, ['stabilityTest']], ['RISK ENGINE', EA.risk, ['assess']], ['DECISION ENGINE', EA.dbfinal, ['analyzeFull']], ['COMBINATION ENGINE', EA.parlay, ['optimize', 'pairJoint']], ['LEARNING ENGINE', EA.postmortem, ['analyze', 'errorMemory']], ['MONITORING ENGINE', EA.dbintel, ['trendShift', 'modelHealth']]];
    return L.map(function (x) { var miss = x[2].filter(function (f) { return !fn(x[1], f); }); return { layer: x[0], status: miss.length ? 'UNAVAILABLE' : 'ACTIVE', detail: x[2].join(', ') + (miss.length ? ' · manquant : ' + miss.join(', ') : '') }; });
  }
  function registry(store, records) {
    var xg = store ? store.played({}).filter(function (m) { return m.stats.xg_h != null; }).length : 0, nSet = (records || []).filter(function (r) { return r.result && r.result.outcome !== 'void'; }).length, E = [];
    var add = function (n, s, d) { E.push({ engine: n, status: s, detail: d }); };
    add('Poisson (buts)', fn(EA.models, 'poissonP') ? 'ACTIVE' : 'UNAVAILABLE', 'EA.models.poissonP'); add('Dixon-Coles (correction scores faibles)', fn(EA.models, 'tau') ? 'ACTIVE' : 'UNAVAILABLE', 'EA.models.tau');
    add('Monte Carlo football', fn(EA.models, 'simulateFootball') ? 'ACTIVE' : 'UNAVAILABLE', 'EA.models.simulateFootball'); add('Monte Carlo basket', EA.bk2 ? 'ACTIVE' : 'UNAVAILABLE', 'distribution unique (ea-bk2)');
    add('Elo', fn(EA.models, 'eloProbabilities') ? 'PARTIAL' : 'UNAVAILABLE', 'calcul réel mais ratings à saisir (aucun Elo historisé dans la base)'); add('xG', xg >= 30 ? 'ACTIVE' : xg ? 'INSUFFICIENT DATA' : 'PARTIAL', xg ? xg + ' match(s) avec xG en base' : 'moteur compatible (saisie manuelle) ; 0 match avec xG en base');
    add('Consensus base + modèle', 'ACTIVE', 'EA.database.consensus (shrinkage)'); add('Corners / tirs / tirs cadrés', 'PARTIAL', 'statistiques descriptives de la base, pas de modèle prédictif dédié'); add('Cartons / fautes / mi-temps', 'UNAVAILABLE', 'aucune donnée ni modèle');
    add('Calibration par tranches', nSet >= 30 ? 'ACTIVE' : 'INSUFFICIENT DATA', nSet + ' résultat(s) réglé(s)'); add('Walk-forward / backtest des règles', nSet >= 60 ? 'ACTIVE' : 'INSUFFICIENT DATA', nSet + ' résultat(s) (minimum 60)'); add('Combiné (corrélation provisoire)', fn(EA.parlay, 'optimize') ? 'PARTIAL' : 'UNAVAILABLE', 'coefficients de corrélation non estimés sur données');
    add('IA prédictive / apprentissage automatique', 'UNAVAILABLE', 'règles statistiques déterministes ; aucun apprentissage automatique'); add('Fournisseur API de données', 'UNAVAILABLE', 'MANUAL / LOCAL DATABASE uniquement');
    return E;
  }
  // S114 : pipeline d'ajout d'un match (aucune étape ignorée)
  function addMatch(store, row, ctx) {
    var steps = [], s = function (n, d, ok) { steps.push({ step: n, detail: d, ok: ok !== false }); }, nm = D.normalize(row); s('INPUT', (row.home || '?') + ' – ' + (row.away || '?') + ' · ' + (row.date || 'date ?'));
    s('VALIDATION', nm.issues.length ? nm.issues.map(function (i) { return i.code; }).join(', ') : 'aucune anomalie', !nm.bad); if (nm.bad) { var r0 = store.upsert([row]); s('DEDUPLICATION', 'non applicable'); s('DATABASE INSERT', 'REJETÉ → quarantaine', false); return { steps: steps, ready: false, result: r0 }; }
    var before = store.meta().matches, res = store.upsert([row]); s('DEDUPLICATION', res.duplicates ? 'DUPLICATE CANDIDATE : non inséré' : 'aucun doublon'); s('DATABASE INSERT', res.added ? 'inséré' : res.updated ? 'mis à jour' : res.duplicates ? 'ignoré' : 'déjà présent identique', true);
    var f = { sport: nm.match.sport, competition: nm.match.competition }, L = store.league(f); s('AGGREGATES UPDATE', 'caches de ' + (nm.match.competition || '—') + ' recalculés'); s('BASELINE UPDATE', 'baseline : N=' + L.n); var th = store.team(nm.match.home, f), ta = store.team(nm.match.away, f);
    s('TEAM PROFILE UPDATE', nm.match.home + ' N=' + th.n + ' · ' + nm.match.away + ' N=' + ta.n); s('FORM UPDATE', 'forme ' + (th.global.form || '—') + ' / ' + (ta.global.form || '—')); var rec = (ctx && ctx.records) || [];
    s('MODEL UPDATE', rec.length && EA.market ? Object.keys(EA.market.perf(rec)).length + ' marché(s) recalculé(s)' : 'N/A (aucun résultat réglé)'); s('CALIBRATION UPDATE', rec.length && EA.calibration ? EA.calibration.buckets(rec).n + ' observation(s)' : 'N/A (aucun résultat réglé)'); s('READY', '🟢 prêt'); return { steps: steps, ready: true, result: res, before: before };
  }
  // S120 : contrôle final RÉEL (exécute les moteurs sur un jeu synthétique, jamais d'✓ simulé)
  function selfCheck(opts) {
    var mem = function () { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = v; }, removeItem: function (k) { delete d[k]; } }; }, out = [], chk = function (n, f) { var ok, dt; try { var r = f(); ok = r === true || (r && r.ok); dt = r && r.detail || ''; } catch (e) { ok = false; dt = 'erreur : ' + e.message; } out.push({ name: n, status: ok === null ? '⚪' : ok ? '✓' : '✗', detail: dt }); };
    var seed = 3, rnd = function () { return (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648; }, rows = [], T = ['A', 'B', 'C', 'D', 'E', 'F'];
    for (var i = 0; i < 90; i++) { var h = T[i % 6], a = T[(i + 1 + (i % 4)) % 6]; if (h === a) a = T[(i + 3) % 6]; rows.push({ sport: 'football', competition: 'TEST', date: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10), home: h, away: a, hs: Math.floor(rnd() * 4), as: Math.floor(rnd() * 3), corners_h: 4 + Math.floor(rnd() * 5), corners_a: 3 + Math.floor(rnd() * 4), sot_h: 2 + Math.floor(rnd() * 4), sot_a: 1 + Math.floor(rnd() * 3), shots_h: 9 + Math.floor(rnd() * 5), shots_a: 7 + Math.floor(rnd() * 5) }); }
    var db = D.createStore(mem()), init = db.initialize([{ rows: rows.concat([{ date: null, home: 'X', away: 'Y' }, rows[0]]) }]), f = { sport: 'football', competition: 'TEST' }, an;
    chk('DATABASE', function () { return { ok: db.meta().state === 'READY', detail: db.meta().matches + ' matchs' }; }); chk('IMPORT', function () { return D.parseCSV('date;home;away;hs;as\n2026-01-01;A;B;1;0').length === 1; });
    chk('CHRONOLOGY', function () { var p = db.played({}); return p.every(function (m, i) { return !i || p[i - 1].date <= m.date; }); }); chk('VALIDATION', function () { return db.quarantine().length >= 1; }); chk('DEDUPLICATION', function () { return db.meta().matches === 90; });
    chk('QUALITY', function () { return I.dataQuality(db, f).score > 0; }); chk('BASELINES', function () { return db.league(f).totals[2.5].over.n === 90; }); chk('TEAMS', function () { return db.team('A', f).global.n > 0; }); chk('FORM', function () { return I.horizons(db.played({ team: 'A' }).map(function (m) { return D.teamView(m, 'A'); }), function (t) { return t.gf + t.ga > 2.5; }).available; });
    chk('MATCHUPS', function () { an = analyzeFull(db, { sport: 'football', competition: 'TEST', home: 'A', away: 'B', market: 'over:2.5', modelP: 0.5, odds: 2.4, before: '2027-01-01' }, {}); return !!an.matchup; }); chk('MARKETS', function () { return an.probabilities && an.probabilities.final > 0; });
    chk('VALUE', function () { return an.fairOdds > 1 && an.ev != null; }); chk('UNCERTAINTY', function () { return an.uncertainty && an.uncertainty.note.length > 0; }); chk('RISK', function () { return ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'].indexOf(an.risk.level) >= 0; });
    chk('NO BET', function () { return analyzeFull(db, { sport: 'football', competition: 'TEST', home: 'A', away: 'B', market: 'over:2.5', before: '2027-01-01' }, {}).decision === 'NO BET'; }); chk('CORRELATION', function () { return EA.parlay.pairJoint({ market: 'ou:2.5', selection: 'over', p: .6 }, { market: 'btts', selection: 'yes', p: .6 }, { rho: EA.parlay.DEFAULTS.rho }).joint > 0.36; });
    chk('COMBINÉ', function () { return EA.parlay.optimize([]).status === 'NO_BET'; }); chk('LEARNING', function () { return EA.postmortem.analyze({ result: { outcome: 'lost' }, pModel: .6, odds: 1.9, market: 'btts', selection: 'yes' }).category.length > 0; });
    chk('BACKTEST', function () { return EA.risk.rulesBacktest([]).insufficient === true; }); chk('WALK-FORWARD', function () { return typeof EA.memory.walkForward === 'function'; }); chk('ANTI-OVERFITTING', function () { return I.overfitting({ insufficient: false, total: 40, parts: { training: { v3: { roi: .2 } }, test: { v3: { roi: -.1 } } } }, []).risk; });
    out.push({ name: 'MOBILE', status: '⚪', detail: 'non vérifiable depuis l\'application (test navigateur externe : tests/ui-mobile.js)' }); chk('OFFLINE', function () { return { ok: EA.dbintel.api.provider.indexOf('NONE') === 0, detail: 'aucune requête réseau : base 100 % locale' }; }); out.push({ name: 'REGRESSION', status: '⚪', detail: 'non vérifiable depuis l\'application (suite de tests exécutée hors application)' });
    return out;
  }
  var api = I.api; api.deduplicateData = function (rows) { var seen = {}, dup = 0, uniq = []; (rows || []).forEach(function (r) { var m = D.normalize(r).match, k = m.id || JSON.stringify(r); if (seen[k]) dup++; else { seen[k] = 1; uniq.push(r); } }); return { unique: uniq, duplicates: dup }; };
  api.updateDatabase = function (rows) { return api.updateData(rows); }; api.runAnalysis = function (input, line, ctx) { return analyzeFull(EA.dbui.store(), Object.assign({}, input, line), ctx); };
  EA.dbfinal = { legOf: legOf, labelOf: labelOf, analyzeFull: analyzeFull, gate: gate, riskLevel: riskLevel, report: report, performance: performance, errorPatterns: errorPatterns, drift: drift, layers: layers, registry: registry, addMatch: addMatch, selfCheck: selfCheck, MK: MK };
  if (typeof module === 'object' && module.exports) module.exports = EA.dbfinal;
})(typeof window !== 'undefined' ? window : global);
