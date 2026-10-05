/* EA-VALUE 3.0 — CORRELATION ENGINE + PARLAY OPTIMIZER (bloc unique « COMBINÉ RENTABLE »).
   « Rentable » = mathématiquement favorable selon le modèle et ses hypothèses, jamais une garantie.
   Les corrélations ci-dessous sont des valeurs PROVISOIRES (non estimées sur données) : configurables via cfg.parlay.rho. */
(function (g) {
  'use strict';
  if (typeof require === 'function' && typeof window === 'undefined') require('./ea-core.js');
  var EA = g.EA;
  var DEF = { minEV: 0.05, minJointP: 0.30, maxLegs: 4, maxPool: 12, minDataQuality: 60, maxLegHalfPts: 9, complexityPenalty: 0.01, sgpOddsHaircut: 0.93,
    rho: { 'over|btts_yes': 0.55, 'under|btts_no': 0.55, 'over|btts_no': -0.55, 'under|btts_yes': -0.55, 'win|over': 0.15, 'win|under': -0.15, 'draw|under': 0.25, 'draw|over': -0.25, 'win|btts_yes': -0.10, 'win|btts_no': 0.20, 'draw|btts_yes': 0.10, 'draw|btts_no': -0.10 } };
  function cfgOf(c) { var u = (c && c.parlay) || {}, o = {}; Object.keys(DEF).forEach(function (k) { o[k] = u[k] != null ? u[k] : DEF[k]; }); if (u.rho) { o.rho = {}; Object.keys(DEF.rho).forEach(function (k) { o.rho[k] = DEF.rho[k]; }); Object.keys(u.rho).forEach(function (k) { o.rho[k] = u.rho[k]; }); } return o; }

  // classe d'une sélection : over/under/btts_yes/btts_no/win/draw ; null = inconnue
  function kind(l) {
    var m = String(l.market || ''), s = String(l.selection || '');
    if (/^ou:/.test(m) || m === 'total') return s === 'over' ? 'over' : s === 'under' ? 'under' : null;
    if (m === 'btts') return s === 'yes' ? 'btts_yes' : s === 'no' ? 'btts_no' : null;
    if (m === '1X2') return s === 'draw' ? 'draw' : (s === 'home' || s === 'away') ? 'win' : null;
    if (m === 'ml') return 'win';
    return null;
  }
  // Probabilité jointe de deux jambes d'un même match. null = combinaison invalide (exclusive / dépendance inconnue).
  function pairJoint(a, b, cfg) {
    var ka = kind(a), kb = kind(b);
    if (a.market === b.market && a.selection !== b.selection) return { joint: null, why: 'issues exclusives du même marché' };
    if (a.market === b.market || (ka === 'win' && kb === 'win')) return { joint: null, why: 'même marché / même scénario' };
    if (ka === 'over' && kb === 'over' || ka === 'under' && kb === 'under') return { joint: null, why: 'deux totaux du même match' };
    if (!ka || !kb) return { joint: null, why: 'dépendance inconnue entre marchés du même match' };
    var rho = cfg.rho[ka + '|' + kb]; if (rho == null) rho = cfg.rho[kb + '|' + ka];
    if (rho == null) return { joint: null, why: 'dépendance inconnue (' + ka + ' / ' + kb + ')' };
    var pa = a.p, pb = b.p, j = pa * pb + rho * Math.sqrt(pa * (1 - pa) * pb * (1 - pb));
    j = Math.max(Math.max(0, pa + pb - 1), Math.min(pa, pb, j));        // bornes de Fréchet
    return { joint: j, rho: rho, indep: pa * pb };
  }
  // Évalue une combinaison. pOf(l) = p ou p pessimiste (p − incertitude)
  function joint(legs, cfg, low) {
    var groups = {}, notes = [], sgp = false;
    legs.forEach(function (l) { (groups[l.matchKey] = groups[l.matchKey] || []).push(l); });
    var p = 1;
    for (var k in groups) {
      var gp = groups[k];
      var pv = gp.map(function (l) { return Math.max(0.001, l.p - (low ? (l.uncertaintyHalfPts || 0) / 100 : 0)); });
      if (gp.length === 1) { p *= pv[0]; continue; }
      if (gp.length > 2) return { invalid: 'plus de 2 jambes dépendantes dans le même match' };
      var r = pairJoint({ market: gp[0].market, selection: gp[0].selection, p: pv[0] }, { market: gp[1].market, selection: gp[1].selection, p: pv[1] }, cfg);
      if (r.joint == null) return { invalid: r.why };
      sgp = true; p *= r.joint;
      if (!low) notes.push(gp[0].label + ' : ρ=' + r.rho.toFixed(2) + ' PROVISOIRE → ' + (r.indep * 100).toFixed(1) + ' % (indépendance) corrigé en ' + (r.joint * 100).toFixed(1) + ' %');
    }
    return { p: p, sgp: sgp, notes: notes };
  }

  function legOk(l, cfg) {
    if (!l || !(l.odds > 1) || !(l.p > 0 && l.p < 1) || !l.value || l.value.status !== 'OK') return 'cote ou prix insuffisant';
    if (l.decision !== 'BET') return 'décision individuelle ≠ BET';
    if (l.weight != null && l.weight < 1 && l.value.ev < cfg.minEV / l.weight) return 'marché historiquement peu fiable (poids ' + l.weight.toFixed(2) + ') : EV exigé ' + (cfg.minEV / l.weight * 100).toFixed(1) + ' %';
    if ((l.dataQuality == null) || l.dataQuality < cfg.minDataQuality) return 'données insuffisantes ou inconnues';
    if ((l.uncertaintyHalfPts || 0) > cfg.maxLegHalfPts) return 'incertitude trop élevée';
    return null;
  }
  function sharpe(p, o) { var sd = o * Math.sqrt(p * (1 - p)); return sd > 0 ? (p * o - 1) / sd : -Infinity; }

  function optimize(pool, config) {
    var cfg = cfgOf(config), rejected = [], elig = [];
    (pool || []).forEach(function (l) { var w = legOk(l, cfg); if (w) rejected.push({ leg: l.label + ' · ' + l.market + ' ' + l.selection, why: w }); else elig.push(l); });
    elig.sort(function (a, b) { return b.value.ev - a.value.ev; }); elig = elig.slice(0, cfg.maxPool);
    // meilleur simple (EV pessimiste ajusté du risque)
    var bestSingle = null;
    elig.forEach(function (l) { var pl = Math.max(0.001, l.p - (l.uncertaintyHalfPts || 0) / 100), s = sharpe(pl, l.odds); if (pl * l.odds - 1 > 0 && (!bestSingle || s > bestSingle.sharpe)) bestSingle = { leg: l, sharpe: s, evLow: pl * l.odds - 1 }; });
    var best = null, tested = 0, invalid = 0;
    (function rec(start, cur) {
      if (cur.length >= 2) {
        tested++;
        var hi = joint(cur, cfg, false), lo = joint(cur, cfg, true);
        if (hi.invalid || lo.invalid) invalid++;
        else {
          var o = cur.reduce(function (a, l) { return a * l.odds; }, 1) * (hi.sgp ? cfg.sgpOddsHaircut : 1);
          var ev = hi.p * o - 1, evLow = lo.p * o - 1;
          if (ev >= cfg.minEV && evLow > 0 && hi.p >= cfg.minJointP) {
            var score = evLow - cfg.complexityPenalty * (cur.length - 1);
            if (!best || score > best.score) best = { score: score, legs: cur.slice(), odds: o, p: hi.p, pLow: lo.p, ev: ev, evLow: evLow, sgp: hi.sgp, notes: hi.notes };
          }
        }
      }
      if (cur.length >= cfg.maxLegs) return;
      for (var i = start; i < elig.length; i++) { cur.push(elig[i]); rec(i + 1, cur); cur.pop(); }
    })(0, []);
    var out = { status: 'NO_BET', tested: tested, invalidCombos: invalid, eligible: elig.length, rejected: rejected, bestSingle: bestSingle,
      message: 'Aucune combinaison ne présente actuellement un avantage statistique suffisant compte tenu des probabilités calibrées, du prix, de l\'incertitude et de la corrélation.' };
    if (!best) return out;
    var dq = Math.min.apply(null, best.legs.map(function (l) { return l.dataQuality; }));
    var half = (best.p - best.pLow) * 100;
    out.status = 'BET'; out.legs = best.legs; out.odds = best.odds; out.pJoint = best.p; out.pJointLow = best.pLow; out.pMarket = 1 / best.odds; out.edgePts = (best.p - 1 / best.odds) * 100;
    out.ev = best.ev; out.evLow = best.evLow; out.minOdds = (1 + cfg.minEV) / best.p; out.dataQuality = dq; out.uncertaintyHalfPts = half; out.correlationNotes = best.notes;
    out.sameMatchWarning = best.sgp ? 'Jambes du même match : la cote réelle d\'un pari combiné du même match est souvent inférieure au produit des cotes (décote PROVISOIRE de ' + Math.round((1 - cfg.sgpOddsHaircut) * 100) + ' % appliquée). Vérifiez la cote proposée.' : null;
    out.risk = (best.pLow >= 0.45 && best.legs.length <= 2) ? 'Moyen' : (best.pLow >= 0.30 ? 'Élevé' : 'Très élevé');
    out.calibration = best.legs.some(function (l) { return /NOT YET CALIBRATED/i.test(l.weightsLabel || ''); }) ? 'non calibrée (échantillon insuffisant)' : 'calibrée';
    if (bestSingle && bestSingle.sharpe >= sharpe(best.pLow, best.odds)) { out.preferSingle = true; out.preferMessage = 'Le meilleur choix statistique est le pari simple.'; }
    return out;
  }
  EA.parlay = { optimize: optimize, pairJoint: pairJoint, joint: joint, kind: kind, DEFAULTS: DEF };
  if (typeof module === 'object' && module.exports) module.exports = EA.parlay;
})(typeof window !== 'undefined' ? window : global);
