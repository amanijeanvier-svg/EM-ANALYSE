/* EA-VALUE 3.0 — ORCHESTRATEUR : Data → Quality → Context → Model → Consensus → Market → Value → Risk → Decision → Commentary.
   Produit un objet d'analyse unique. Les modules restent séparés ; ce fichier ne contient aucune formule statistique propre. */
(function (g) {
  'use strict';
  if (typeof require === 'function' && typeof window === 'undefined') { ['core', 'context', 'models', 'value', 'bankroll', 'memory'].forEach(function (m) { require('./ea-' + m + '.js'); }); }
  var EA = g.EA, C = EA.core, X = EA.context, M = EA.models, V = EA.value, B = EA.bankroll;

  function erf(x) { var s = x < 0 ? -1 : 1; x = Math.abs(x); var t = 1 / (1 + 0.3275911 * x), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
  function phi(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }

  function dataQualityFrom(fields, freshStatus) {
    var have = fields.filter(function (f) { return f.ok; }).length, tot = fields.length, base = tot ? 100 * have / tot : 0;
    var mult = { GREEN: 1, YELLOW: 0.9, RED: 0.7, UNKNOWN: 0.85 }[freshStatus || 'UNKNOWN'];
    return { score: Math.round(base * mult), have: have, total: tot, missing: fields.filter(function (f) { return !f.ok; }).map(function (f) { return f.name; }), freshness: freshStatus };
  }
  function ctxSide(c, sport) {
    c = c || {}; var eff = X.assessEffectif(c.effectif), fat = X.assessFatigue(c.fatigue), rot = X.assessRotation(c.rotation);
    return { effectif: eff, fatigue: fat, rotation: rot };
  }
  function ctxMerge(h, a, dq, fresh) {
    function cq(s) { return X.contextQuality({ dataQuality: dq, effectif: s.effectif, fatigue: s.fatigue, rotation: s.rotation, freshnessStatus: fresh }); }
    var ch = cq(h), ca = cq(a);
    return { score: Math.round((ch.score + ca.score) / 2), home: ch, away: ca, extraUncertaintyPts: C.round((ch.extraUncertaintyPts + ca.extraUncertaintyPts), 1), notProbability: true };
  }

  function pickFrom(sel, rows, lines) { return sel; }
  // ---------------- FOOTBALL ----------------
  function selPredicate(market, sel) {
    if (market === '1X2') return sel === 'home' ? function (a, b) { return a > b; } : sel === 'draw' ? function (a, b) { return a === b; } : function (a, b) { return a < b; };
    if (market.indexOf('ou:') === 0) { var L = parseFloat(market.slice(3)); return sel === 'over' ? function (a, b) { return a + b > L; } : function (a, b) { return a + b < L; }; }
    if (market === 'btts') return sel === 'yes' ? function (a, b) { return a > 0 && b > 0; } : function (a, b) { return !(a > 0 && b > 0); };
    return null;
  }
  function footballOdds(inp) {
    var out = [], m = inp.markets || {}, x2 = m['1X2'];
    if (x2) { ['home', 'draw', 'away'].forEach(function (s) { out.push({ market: '1X2', selection: s, odds: C.num(x2[s]) }); }); }
    if (m.ou && C.num(m.ou.line) != null) { ['over', 'under'].forEach(function (s) { out.push({ market: 'ou:' + m.ou.line, selection: s, odds: C.num(m.ou[s]) }); }); }
    if (m.btts) { ['yes', 'no'].forEach(function (s) { out.push({ market: 'btts', selection: s, odds: C.num(m.btts[s]) }); }); }
    return out;
  }

  function analyzeFootball(inp) {
    var cfg = inp.config || C.DEFAULT_CONFIG, warnings = [], now = inp.now || Date.now();
    var hs = inp.homeStats || {}, as = inp.awayStats || {}, league = inp.league || {}, rho = inp.rho == null ? -0.1 : inp.rho;
    var fresh = C.freshness(inp.dataTimestamp, now, cfg);
    var kFb = cfg.earlySeason.football.k;
    var minN = Math.min(C.num(hs.n) == null ? Infinity : hs.n, C.num(as.n) == null ? Infinity : as.n); if (minN === Infinity) minN = null;
    var prior = C.num(hs.priorGf) != null && C.num(hs.priorGa) != null && C.num(as.priorGf) != null && C.num(as.priorGa) != null;
    var early = X.earlySeason({ sport: 'football', gamesPlayed: minN, priorAvailable: prior, squadStability: inp.squadStability, dataQuality: null }, cfg);
    var fields = [{ name: 'buts marqués (dom.)', ok: C.num(hs.gf) != null }, { name: 'buts encaissés (dom.)', ok: C.num(hs.ga) != null }, { name: 'buts marqués (ext.)', ok: C.num(as.gf) != null }, { name: 'buts encaissés (ext.)', ok: C.num(as.ga) != null },
      { name: 'matchs joués', ok: minN != null }, { name: 'moyenne de ligue', ok: C.isNum(league.avg) || (C.isNum(league.avgHome) && C.isNum(league.avgAway)) }, { name: 'domicile/extérieur ligue', ok: C.isNum(league.avgHome) && C.isNum(league.avgAway) },
      { name: 'historique saison précédente', ok: prior }, { name: 'Elo', ok: C.num(hs.elo) != null && C.num(as.elo) != null }, { name: 'xG', ok: C.num(hs.xgf) != null && C.num(as.xgf) != null }];
    var dq = dataQualityFrom(fields, fresh.status);
    var early2 = X.earlySeason({ sport: 'football', gamesPlayed: minN, priorAvailable: prior, squadStability: inp.squadStability, dataQuality: dq.score }, cfg);
    var cH = ctxSide((inp.context || {}).home), cA = ctxSide((inp.context || {}).away), cq = ctxMerge(cH, cA, dq.score, fresh.status);

    var L = M.footballLambdas(hs, as, league, { k: kFb });
    var res = { sport: 'football', version: C.VERSION, home: inp.home, away: inp.away, competition: inp.competition, matchDate: inp.matchDate, mode: inp.mode === 'HIGH_PROBABILITY' ? 'HIGH_PROBABILITY' : 'VALUE',
      dataQuality: dq, freshness: fresh, early: early2, context: { home: cH, away: cA, quality: cq }, warnings: warnings, models: [], markets: [], pick: null };
    if (!L.available) { res.unavailable = L; res.decision = { decision: 'NO BET', reasons: ['données insuffisantes : ' + L.reason], blocking: ['données insuffisantes : ' + L.reason], cautions: [], notes: [], signal: 'NO QUALIFIED OPPORTUNITY' }; res.signal = 'INSUFFICIENT DATA'; res.commentary = V.commentary({ decision: res.decision, signal: res.signal, context: {}, dataQualityLabel: V.qualityLabel(dq.score) }); return res; }
    L.warnings.forEach(function (w) { warnings.push(w); });

    // corrections de contexte : uniquement si calculées à partir de données
    var penH = X.absencePenalty(cH.effectif), penA = X.absencePenalty(cA.effectif), fH = X.fatigueMultiplier(cH.fatigue.score), fA = X.fatigueMultiplier(cA.fatigue.score);
    var lamH = L.lambdaHome * penH.multiplier * fH, lamA = L.lambdaAway * penA.multiplier * fA;
    if (cH.effectif.level !== 'green' && cH.effectif.level !== 'unknown' && !penH.applied) warnings.push('Domicile : IMPACT JOUEUR INCONNU (aucune correction)');
    if (cA.effectif.level !== 'green' && cA.effectif.level !== 'unknown' && !penA.applied) warnings.push('Extérieur : IMPACT JOUEUR INCONNU (aucune correction)');

    var it = inp.iterations || (inp.fast ? cfg.mc.fast : cfg.mc.default);
    var sigma = 0.35 * (1 - C.clamp(dq.score / 100, 0, 1)) * 0.5 + 0.05;   // incertitude paramétrique croissante quand la qualité baisse
    var sim = M.simulateFootball(lamH, lamA, { iterations: it, rho: rho, sigma: sigma, seed: inp.seed });
    var mDC = M.poissonMatrix(lamH, lamA, rho), mPo = M.poissonMatrix(lamH, lamA, 0);
    var mcM = M.footballMarkets(sim.rows, [parseFloat(((inp.markets || {}).ou || {}).line) || 2.5]);
    var xgOn = L.usedXg;
    var elo = M.eloProbabilities(hs.elo, as.elo, inp.homeAdvElo);
    res.lambdas = { home: lamH, away: lamA, base: { home: L.lambdaHome, away: L.lambdaAway }, usedXg: xgOn };
    res.simulation = { iterationsRun: sim.iterationsRun, accepted: sim.accepted, totalGoals: sim.totalGoals, seed: inp.seed == null ? null : inp.seed, sigma: sigma };
    res.modelStatus = EA.core.MODEL_STATUS.filter(function (s) { return s.sport !== 'basketball'; }).map(function (s) { var st = s.status; if (s.id === 'xg' && !xgOn) st = 'UNAVAILABLE'; if (s.id === 'elo' && !elo) st = 'UNAVAILABLE'; return Object.assign({}, s, { status: st }); });

    var odds = footballOdds(inp), health = inp.modelHealth || {}, perf = inp.modelPerf || {};
    var seen = {}; odds.forEach(function (o) { seen[o.market + '|' + o.selection] = o; });
    // sélections toujours évaluées (probabilités), cotes facultatives
    var ouLine = C.num(((inp.markets || {}).ou || {}).line) || 2.5;
    var sels = [['1X2', 'home'], ['1X2', 'draw'], ['1X2', 'away'], ['ou:' + ouLine, 'over'], ['ou:' + ouLine, 'under'], ['btts', 'yes'], ['btts', 'no']];
    var entries = sels.map(function (sl) {
      var pred = selPredicate(sl[0], sl[1]), pv = { poisson: M.sumWhere(mPo, pred), 'dixon-coles': M.sumWhere(mDC, pred), 'monte-carlo-fb': M.sumWhere(sim.rows, pred) };
      var models = [{ id: 'poisson', name: 'Poisson', status: 'IMPLEMENTED', p: pv.poisson }, { id: 'dixon-coles', name: 'Dixon-Coles', status: 'IMPLEMENTED', p: pv['dixon-coles'] }, { id: 'monte-carlo-fb', name: 'Monte Carlo', status: 'IMPLEMENTED', p: pv['monte-carlo-fb'] }];
      if (sl[0] === '1X2' && elo) models.push({ id: 'elo', name: 'Elo', status: 'PARTIAL', p: elo[sl[1]] }), pv.elo = elo[sl[1]];
      models.forEach(function (m) { m.health = (health[m.id] || {}).state || null; m.perf = perf[m.id] || null; });
      var cons = M.consensus(models, cfg), o = seen[sl[0] + '|' + sl[1]] || { odds: null };
      return { market: sl[0], selection: sl[1], modelProbs: pv, models: models, consensus: cons, p: cons.p, odds: o.odds };
    });
    // dévigage informatif du marché 1X2 (n'entre jamais dans P_MODEL)
    var x2 = (inp.markets || {})['1X2'], mk = x2 ? V.marketFromOdds([x2.home, x2.draw, x2.away]) : null;
    res.marketBenchmark = mk ? { overroundPct: mk.marginPct, fair: { home: mk.fairProbs[0], draw: mk.fairProbs[1], away: mk.fairProbs[2] } } : null;

    var spreadHalf = function (e) { return 2.5 + cq.extraUncertaintyPts + early2.extraUncertaintyPts + (e.consensus.spreadPts || 0) / 2; };
    var allLineup = cH.rotation.lineupConfirmed === true && cA.rotation.lineupConfirmed === true;
    var bankroll = C.num(inp.bankroll), minStake = C.num(inp.minStake);
    res.markets = entries.map(function (e) {
      var vl = V.valueLine(e.p, e.odds, cfg), half = spreadHalf(e);
      var st = (vl.available && vl.currentOdds != null && bankroll != null) ? B.suggestStake({ bankroll: bankroll, p: e.p, odds: e.odds, minStake: minStake }, cfg) : null;
      var d = V.decide({ mode: res.mode, value: vl, dataQuality: dq.score, contextQuality: cq.score, stability: e.consensus.stability, modelHealth: (health.consensus || {}).state || null, uncertaintyHalf: half, lineupConfirmed: allLineup, earlyReliability: early2.mode ? early2.reliability : null, stakeOk: st ? st.stakeOk : undefined }, cfg);
      return { market: e.market, selection: e.selection, p: e.p, modelProbs: e.modelProbs, odds: e.odds, value: vl, uncertaintyHalfPts: half, stability: e.consensus.stability, weightsLabel: e.consensus.weightsLabel, agreementPct: e.consensus.agreementPct, decision: d, stake: st };
    });
    finalize(res, cfg, {
      ledger: function (m) { return footballLedger(m, L, penH, penA, fH, fA, rho); }, dq: dq, cq: cq, early: early2 });
    return res;
  }

  function footballLedger(m, L, penH, penA, fH, fA, rho) {
    var pred = selPredicate(m.market, m.selection); if (!pred) return [];
    var P = function (lh, la) { return M.sumWhere(M.poissonMatrix(lh, la, rho), pred); }, pt = L.parts, steps = [], cur, prev;
    var lh0 = pt.lh, la0 = pt.la; prev = P(lh0, la0);
    var lhA = pt.lh * (pt.hAtt / pt.teamAvg), laA = pt.la * (pt.aAtt / pt.teamAvg); cur = P(lhA, laA); steps.push({ name: 'Attaque des deux équipes', delta: (cur - prev) * 100 }); prev = cur;
    cur = P(L.lambdaHome, L.lambdaAway); steps.push({ name: 'Défense des deux équipes', delta: (cur - prev) * 100 }); prev = cur;
    cur = P(L.lambdaHome * penH.multiplier, L.lambdaAway * penA.multiplier); if (penH.applied || penA.applied) steps.push({ name: 'Absences (impact calculé)', delta: (cur - prev) * 100 }); prev = cur;
    cur = P(L.lambdaHome * penH.multiplier * fH, L.lambdaAway * penA.multiplier * fA); if (fH !== 1 || fA !== 1) steps.push({ name: 'Fatigue (calendrier)', delta: (cur - prev) * 100 });
    return steps;
  }

  // ---------------- BASKETBALL ----------------
  function analyzeBasketball(inp) {
    var cfg = inp.config || C.DEFAULT_CONFIG, warnings = [], now = inp.now || Date.now(), hs = inp.homeStats || {}, as = inp.awayStats || {}, league = inp.league || {};
    var fresh = C.freshness(inp.dataTimestamp, now, cfg), health = inp.modelHealth || {}, perf = inp.modelPerf || {};
    var minN = Math.min(C.num(hs.n) == null ? Infinity : hs.n, C.num(as.n) == null ? Infinity : as.n); if (minN === Infinity) minN = null;
    var prior = ['priorPace', 'priorOrtg', 'priorDrtg'].every(function (k) { return C.num(hs[k]) != null && C.num(as[k]) != null; });
    var e0 = X.earlySeason({ sport: 'basketball', gamesPlayed: minN, priorAvailable: prior, squadStability: inp.squadStability }, cfg);
    var fields = ['pace', 'ortg', 'drtg'].reduce(function (a, k) { a.push({ name: k + ' (dom.)', ok: C.num(hs[k]) != null }, { name: k + ' (ext.)', ok: C.num(as[k]) != null }); return a; }, []);
    fields.push({ name: 'matchs joués', ok: minN != null }, { name: 'moyennes de ligue', ok: C.num(league.pace) != null && C.num(league.ortg) != null }, { name: 'avantage domicile', ok: C.num(inp.homeAdvPts) != null }, { name: 'historique précédent', ok: prior });
    var dq = dataQualityFrom(fields, fresh.status), early = X.earlySeason({ sport: 'basketball', gamesPlayed: minN, priorAvailable: prior, squadStability: inp.squadStability, dataQuality: dq.score }, cfg);
    var cH = ctxSide((inp.context || {}).home), cA = ctxSide((inp.context || {}).away), cq = ctxMerge(cH, cA, dq.score, fresh.status);
    var res = { sport: 'basketball', version: C.VERSION, home: inp.home, away: inp.away, competition: inp.competition, matchDate: inp.matchDate, mode: inp.mode === 'HIGH_PROBABILITY' ? 'HIGH_PROBABILITY' : 'VALUE',
      dataQuality: dq, freshness: fresh, early: early, context: { home: cH, away: cA, quality: cq }, warnings: warnings, markets: [], pick: null };
    var ex = M.basketExpectations(hs, as, league, { early: { wCurrent: early.wCurrent }, homeAdvPts: inp.homeAdvPts });
    if (!ex.available) { res.unavailable = ex; res.decision = { decision: 'NO BET', reasons: ['données insuffisantes : ' + ex.reason], blocking: ['données insuffisantes : ' + ex.reason], cautions: [], notes: [], signal: 'NO QUALIFIED OPPORTUNITY' }; res.signal = 'INSUFFICIENT DATA'; res.commentary = V.commentary({ decision: res.decision, signal: res.signal, context: {}, dataQualityLabel: V.qualityLabel(dq.score) }); return res; }
    ex.warnings.forEach(function (w) { warnings.push(w); });
    var penH = X.absencePenalty(cH.effectif), penA = X.absencePenalty(cA.effectif), fH = X.fatigueMultiplier(cH.fatigue.score), fA = X.fatigueMultiplier(cA.fatigue.score);
    if (cH.effectif.level !== 'green' && cH.effectif.level !== 'unknown' && !penH.applied) warnings.push('Domicile : IMPACT JOUEUR INCONNU (aucune correction)');
    if (cA.effectif.level !== 'green' && cA.effectif.level !== 'unknown' && !penA.applied) warnings.push('Extérieur : IMPACT JOUEUR INCONNU (aucune correction)');
    var adj = { expectedPointsHome: ex.expectedPointsHome * penH.multiplier * fH, expectedPointsAway: ex.expectedPointsAway * penA.multiplier * fA };
    adj.expectedMargin = adj.expectedPointsHome - adj.expectedPointsAway; adj.expectedTotal = adj.expectedPointsHome + adj.expectedPointsAway;
    var sdM = C.num(inp.sdMargin), sdT = C.num(inp.sdTotal), sdProv = sdM == null || sdT == null; sdM = sdM == null ? cfg.basketSd.margin : sdM; sdT = sdT == null ? cfg.basketSd.total : sdT;
    if (sdProv) warnings.push('Écarts-types de marge/total PROVISOIRES (non estimés sur des matchs fournis)');
    var it = inp.iterations || (inp.fast ? cfg.mc.fast : cfg.mc.default), sl = C.num(inp.spreadLine), tl = C.num(inp.totalLine);
    var sim = M.simulateBasketball(adj, { iterations: it, sdMargin: sdM, sdTotal: sdT, spreadLine: sl, totalLine: tl, seed: inp.seed, config: cfg });
    res.expectations = { pace: ex.expectedPace, ortgHome: ex.expectedOffRatingHome, ortgAway: ex.expectedOffRatingAway, drtgHome: ex.expectedDefRatingHome, drtgAway: ex.expectedDefRatingAway, pointsHome: adj.expectedPointsHome, pointsAway: adj.expectedPointsAway, margin: adj.expectedMargin, total: adj.expectedTotal };
    res.simulation = { iterationsRun: sim.iterationsRun, sdMargin: sdM, sdTotal: sdT, sdProvisional: sdProv, margin: sim.margin, total: sim.total, seed: inp.seed == null ? null : inp.seed };
    res.modelStatus = EA.core.MODEL_STATUS.filter(function (s) { return s.sport !== 'football'; });

    var an = { pHome: phi(adj.expectedMargin / sdM) };
    var mk = inp.markets || {}, ml = mk.moneyline || {}, sp = mk.spread || {}, tt = mk.total || {};
    var defs = [{ market: 'ml', selection: 'home', an: an.pHome, mc: sim.pHome, odds: ml.home }, { market: 'ml', selection: 'away', an: 1 - an.pHome, mc: sim.pAway, odds: ml.away }];
    if (sl != null) { var pc = phi((adj.expectedMargin + sl) / sdM); defs.push({ market: 'spread:' + sl, selection: 'home', an: pc, mc: sim.pSpreadCover, odds: sp.home }, { market: 'spread:' + sl, selection: 'away', an: 1 - pc, mc: 1 - sim.pSpreadCover, odds: sp.away }); }
    if (tl != null) { var po = 1 - phi((tl - adj.expectedTotal) / sdT); defs.push({ market: 'total:' + tl, selection: 'over', an: po, mc: sim.pOver, odds: tt.over }, { market: 'total:' + tl, selection: 'under', an: 1 - po, mc: sim.pUnder, odds: tt.under }); }
    var mkb = ml.home && ml.away ? V.marketFromOdds([ml.home, ml.away]) : null;
    res.marketBenchmark = mkb ? { overroundPct: mkb.marginPct, fair: { home: mkb.fairProbs[0], away: mkb.fairProbs[1] } } : null;
    var allLineup = cH.rotation.lineupConfirmed === true && cA.rotation.lineupConfirmed === true, bankroll = C.num(inp.bankroll), minStake = C.num(inp.minStake);
    res.markets = defs.map(function (d) {
      var models = [{ id: 'bk-ratings', name: 'Ratings/pace (analytique)', status: 'IMPLEMENTED', p: d.an }, { id: 'monte-carlo-bk', name: 'Monte Carlo', status: sdProv ? 'PARTIAL' : 'IMPLEMENTED', p: d.mc }];
      models.forEach(function (m) { m.health = (health[m.id] || {}).state || null; m.perf = perf[m.id] || null; });
      var cons = M.consensus(models, cfg), vl = V.valueLine(cons.p, d.odds, cfg), half = 3 + cq.extraUncertaintyPts + early.extraUncertaintyPts + (sdProv ? 1.5 : 0) + (cons.spreadPts || 0) / 2;
      var st = (vl.available && vl.currentOdds != null && bankroll != null) ? B.suggestStake({ bankroll: bankroll, p: cons.p, odds: d.odds, minStake: minStake }, cfg) : null;
      var dec = V.decide({ mode: res.mode, value: vl, dataQuality: dq.score, contextQuality: cq.score, stability: cons.stability, modelHealth: (health.consensus || {}).state || null, uncertaintyHalf: half, lineupConfirmed: allLineup, earlyReliability: early.mode ? early.reliability : null, stakeOk: st ? st.stakeOk : undefined }, cfg);
      return { market: d.market, selection: d.selection, p: cons.p, modelProbs: { 'bk-ratings': d.an, 'monte-carlo-bk': d.mc }, odds: C.num(d.odds), value: vl, uncertaintyHalfPts: half, stability: cons.stability, weightsLabel: cons.weightsLabel, agreementPct: cons.agreementPct, decision: dec, stake: st };
    });
    finalize(res, cfg, { ledger: function (m) { return basketLedger(m, ex, hs, as, league, inp, penH, penA, fH, fA, sdM, sdT, sl, tl); }, dq: dq, cq: cq, early: early });
    return res;
  }
  function basketLedger(m, ex, hs, as, league, inp, penH, penA, fH, fA, sdM, sdT, sl, tl) {
    var steps = [], prev, cur, lgO = C.num(league.ortg), lgP = C.num(league.pace);
    var prob = function (mar, tot) { if (m.market === 'ml') return m.selection === 'home' ? phi(mar / sdM) : 1 - phi(mar / sdM);
      if (m.market.indexOf('spread:') === 0) { var p = phi((mar + sl) / sdM); return m.selection === 'home' ? p : 1 - p; }
      var po = 1 - phi((tl - tot) / sdT); return m.selection === 'over' ? po : 1 - po; };
    var homeHalf = (C.num(inp.homeAdvPts) || 0) / 2;
    // neutre : points de ligue, marge nulle
    var baseTot = (lgO != null && lgP != null) ? 2 * lgO * lgP / 100 : null; if (m.market.indexOf('total:') === 0 && baseTot == null) return [];
    var margNeutral = 0, totNeutral = baseTot != null ? baseTot : ex.expectedTotal; prev = prob(margNeutral, totNeutral);
    // rythme + efficacité (sans avantage domicile)
    var oh = ex.expectedPointsHome - homeHalf, oa = ex.expectedPointsAway + homeHalf;
    cur = prob(oh - oa, oh + oa); steps.push({ name: 'Pace et efficacité (ORtg/DRtg)', delta: (cur - prev) * 100 }); prev = cur;
    if (homeHalf) { cur = prob(ex.expectedMargin, ex.expectedTotal); steps.push({ name: 'Avantage domicile', delta: (cur - prev) * 100 }); prev = cur; }
    var pH = ex.expectedPointsHome * penH.multiplier, pA = ex.expectedPointsAway * penA.multiplier;
    if (penH.applied || penA.applied) { cur = prob(pH - pA, pH + pA); steps.push({ name: 'Absences (impact calculé)', delta: (cur - prev) * 100 }); prev = cur; }
    if (fH !== 1 || fA !== 1) { var qH = pH * fH, qA = pA * fA; cur = prob(qH - qA, qH + qA); steps.push({ name: 'Fatigue (calendrier)', delta: (cur - prev) * 100 }); }
    return steps;
  }

  // ---------------- commun : choix du pick, ledger, commentaire ----------------
  function finalize(res, cfg, h) {
    var rank = { 'BET': 0, 'CHECK': 1, 'NO BET': 2 };
    var scored = res.markets.slice().sort(function (a, b) {
      var ra = rank[a.decision.decision], rb = rank[b.decision.decision]; if (ra !== rb) return ra - rb;
      if (res.mode === 'HIGH_PROBABILITY') return b.p - a.p;
      var ea = a.value.ev == null ? -9 : a.value.ev, eb = b.value.ev == null ? -9 : b.value.ev; return eb - ea; });
    var best = scored[0]; res.pick = best;
    res.decision = best.decision; res.signal = best.decision.decision === 'NO BET' ? 'NO QUALIFIED OPPORTUNITY' : (best.market + ' ' + best.selection + ' : ' + (best.p * 100).toFixed(1) + ' %' + (best.value.ev != null ? ', EV ' + (best.value.ev * 100).toFixed(1) + ' %' : ''));
    res.evidence = V.evidenceLedger(h.ledger(best)); res.featureImportance = V.featureImportance(res.evidence.factors);
    res.stability = best.stability; res.modelAgreementPct = best.agreementPct;
    res.commentary = V.commentary({ decision: best.decision, signal: res.signal, value: best.value, evidence: res.evidence, stability: best.stability, modelAgreement: best.agreementPct,
      context: { effectifKnown: res.context.home.effectif.known && res.context.away.effectif.known, fatigueKnown: res.context.home.fatigue.known && res.context.away.fatigue.known, rotationKnown: res.context.home.rotation.known && res.context.away.rotation.known },
      early: res.early, dataQualityLabel: V.qualityLabel(res.dataQuality.score) });
    res.weightsLabel = best.weightsLabel;
  }

  // Enregistrement EA Memory (prédiction figée)
  function toMemoryRecord(res, pick) {
    var p = pick || res.pick; if (!p) return null;
    return { sport: res.sport, competition: res.competition || '', home: res.home, away: res.away, matchDate: res.matchDate, market: p.market, selection: p.selection, odds: p.odds, pModel: p.p, fairOdds: p.value && p.value.fairOdds, ev: p.value && p.value.ev,
      decision: p.decision.decision, mode: res.mode, modelVersion: res.version, modelProbs: p.modelProbs, dataQuality: res.dataQuality.score, contextQuality: res.context.quality.score, stability: p.stability,
      features: (res.evidence.factors || []).reduce(function (o, f) { o[f.name] = f.delta; return o; }, {}), dataUsed: res.dataQuality.total - res.dataQuality.missing.length + '/' + res.dataQuality.total,
      contextSnapshot: { effectif: res.context.home.effectif.level + '/' + res.context.away.effectif.level, fatigue: res.context.home.fatigue.level + '/' + res.context.away.fatigue.level, rotation: res.context.home.rotation.level + '/' + res.context.away.rotation.level, lineupConfirmed: res.context.home.rotation.lineupConfirmed === true && res.context.away.rotation.lineupConfirmed === true } };
  }
  EA.engine = { analyzeFootball: analyzeFootball, analyzeBasketball: analyzeBasketball, toMemoryRecord: toMemoryRecord, phi: phi };
  if (typeof module === 'object' && module.exports) module.exports = EA.engine;
})(typeof window !== 'undefined' ? window : global);
