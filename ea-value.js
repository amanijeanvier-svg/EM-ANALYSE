/* EA-VALUE 3.0 — MARKET / VALUE / RISK / DECISION / COMMENTARY / EVIDENCE / INFORMATION SHOCK.
   Une cote n'entre JAMAIS dans P_MODEL. Probabilité élevée ≠ value. Préférer NO BET à un faux signal. */
(function (g) {
  'use strict';
  if (typeof require === 'function' && typeof window === 'undefined') require('./ea-core.js');
  var EA = g.EA, C = EA.core;

  // ---------- MARKET ----------
  function marketFromOdds(oddsList) {
    var odds = (oddsList || []).map(C.num); if (!odds.length || odds.some(function (o) { return o == null || !(o > 1); })) return null;
    var raw = odds.map(function (o) { return 1 / o; }), sum = raw.reduce(function (a, b) { return a + b; }, 0);
    return { implied: raw, overround: sum, marginPct: (sum - 1) * 100, fairProbs: raw.map(function (r) { return r / sum; }), fairOdds: raw.map(function (r) { return sum / r; }) };
  }

  // ---------- VALUE ----------
  function valueLine(pModel, odds, cfg) {
    var v = (cfg || C.DEFAULT_CONFIG).value, p = C.num(pModel), o = C.num(odds);
    if (p == null || p < 0 || p > 1) return { available: false, label: 'DATA UNAVAILABLE', reason: 'Probabilité modèle invalide' };
    var fair = p > 0 ? 1 / p : null, target = p > 0 ? (1 + v.minEV) / p : null;
    var out = { available: true, pModel: p, fairOdds: fair, targetMinimum: target, minEV: v.minEV, currentOdds: null, pMarket: null, edgePts: null, ev: null, status: 'NO_PRICE', label: 'AUCUNE COTE : value non calculable' };
    if (o == null || !(o > 1)) return out;
    out.currentOdds = o; out.pMarket = 1 / o; out.edgePts = (p - 1 / o) * 100; out.ev = p * o - 1;
    if (target != null && o < target) { out.status = 'VALUE_LOST'; out.label = 'VALUE LOST'; }
    else { out.status = 'OK'; out.label = 'PRIX ACCEPTABLE'; }
    return out;
  }

  // ---------- DECISION ----------
  // in : {mode:'VALUE'|'HIGH_PROBABILITY', value, dataQuality, contextQuality, stability, modelHealth, uncertaintyHalf, lineupConfirmed, earlyReliability, stakeOk}
  function decide(inp, cfg) {
    var conf = cfg || C.DEFAULT_CONFIG, V = conf.value, mode = inp.mode === 'HIGH_PROBABILITY' ? 'HIGH_PROBABILITY' : 'VALUE';
    var no = [], check = [], vl = inp.value;
    if (!vl || !vl.available) no.push('données insuffisantes (probabilité indisponible)');
    if (C.isNum(inp.dataQuality) && inp.dataQuality < V.minDataQuality) no.push('données insuffisantes (qualité ' + Math.round(inp.dataQuality) + '/100)');
    if (inp.dataQuality == null) no.push('données insuffisantes (qualité inconnue)');
    if (inp.modelHealth === 'DISABLED' || inp.modelHealth === 'DEGRADED') no.push('modèle instable (MODEL DEGRADED)');
    if (inp.stakeOk === false) no.push('STAKE SIZE TOO LARGE : PAPER BET');
    if (vl && vl.available) {
      if (mode === 'VALUE') {
        if (vl.currentOdds == null) no.push('cote absente : value non calculable');
        else if (vl.status === 'VALUE_LOST') no.push('cote insuffisante (VALUE LOST : ' + vl.currentOdds.toFixed(2) + ' < minimum ' + vl.targetMinimum.toFixed(2) + ')');
        else if (vl.ev < vl.minEV) no.push('EV insuffisante');
        else if (vl.ev > V.anomalyEV) check.push('EV > ' + Math.round(V.anomalyEV * 100) + ' % : anomalie possible, à vérifier avant toute décision');
      } else if (vl.pModel < V.highProb) no.push('probabilité ' + Math.round(vl.pModel * 100) + ' % sous le seuil de ' + Math.round(V.highProb * 100) + ' %');
    }
    if (C.isNum(inp.uncertaintyHalf) && inp.uncertaintyHalf > 9) check.push('incertitude large (±' + inp.uncertaintyHalf.toFixed(1) + ' pts)');
    if (inp.lineupConfirmed !== true) check.push('lineup inconnu / non confirmé');
    if (C.isNum(inp.contextQuality) && inp.contextQuality < V.minContextQuality) check.push('contexte insuffisamment connu (' + Math.round(inp.contextQuality) + '/100)');
    if (inp.stability === 'Instable') check.push('modèles instables (désaccord élevé)');
    if (C.isNum(inp.earlyReliability) && inp.earlyReliability < 45) check.push('échantillon trop petit (fiabilité début de saison ' + Math.round(inp.earlyReliability) + '/100)');
    if (inp.modelHealth === 'CAUTION') check.push('modèle sous surveillance (CAUTION)');
    var d = no.length ? 'NO BET' : check.length ? 'CHECK' : 'BET';
    var notes = mode === 'HIGH_PROBABILITY' ? ['HIGH PROBABILITY ≠ GUARANTEED', 'HIGH PROBABILITY ≠ VALUE'] : [];
    if (mode === 'HIGH_PROBABILITY' && vl && vl.available && vl.ev != null && vl.ev < 0) notes.push('Probabilité élevée mais sans value au prix actuel');
    return { decision: d, mode: mode, reasons: no.concat(check), blocking: no, cautions: check, notes: notes, signal: d === 'NO BET' && !vl ? 'NO QUALIFIED OPPORTUNITY' : d === 'NO BET' ? 'NO QUALIFIED OPPORTUNITY' : null };
  }

  // ---------- EVIDENCE LEDGER / FEATURE IMPORTANCE ----------
  function evidenceLedger(factors) {
    var f = (factors || []).filter(function (x) { return x && C.isNum(x.delta); });
    var net = f.reduce(function (s, x) { return s + x.delta; }, 0);
    return { factors: f.slice().sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); }), net: net, unit: 'pts de probabilité' };
  }
  function featureImportance(factors) {
    var f = (factors || []).filter(function (x) { return x && C.isNum(x.delta); }), tot = f.reduce(function (s, x) { return s + Math.abs(x.delta); }, 0);
    return f.map(function (x) { var share = tot > 0 ? Math.abs(x.delta) / tot : 0; return { name: x.name, share: share, bar: '█'.repeat(Math.max(1, Math.round(share * 10))), sign: x.delta >= 0 ? '+' : '−' }; }).sort(function (a, b) { return b.share - a.share; });
  }

  // ---------- INFORMATION SHOCK ----------
  function informationShock(before, after, cause, cfg) {
    var th = (cfg || C.DEFAULT_CONFIG).shockPts; if (!C.isNum(before) || !C.isNum(after)) return { isShock: false, label: null, change: null };
    var ch = (after - before) * 100;
    return { isShock: Math.abs(ch) >= th, label: Math.abs(ch) >= th ? 'INFORMATION SHOCK' : null, before: before, after: after, change: ch, cause: cause || 'cause non identifiée' };
  }
  function diffContext(a, b) {
    var out = []; if (!a || !b) return out;
    ['effectif', 'fatigue', 'rotation'].forEach(function (k) { if (a[k] !== b[k]) out.push(k + ' : ' + a[k] + ' → ' + b[k]); });
    if (a.lineupConfirmed !== b.lineupConfirmed) out.push(b.lineupConfirmed ? 'composition confirmée' : 'composition non confirmée');
    if (C.isNum(a.odds) && C.isNum(b.odds) && a.odds !== b.odds) out.push('mouvement de cote ' + a.odds + ' → ' + b.odds);
    return out;
  }

  // ---------- COMMENTARY ----------
  function commentary(a) {
    var pour = [], contre = [], risques = [], d = a.decision, ledger = (a.evidence && a.evidence.factors) || [];
    ledger.filter(function (f) { return f.delta > 0; }).slice(0, 4).forEach(function (f) { pour.push(f.name + ' (+' + f.delta.toFixed(1) + ')'); });
    ledger.filter(function (f) { return f.delta < 0; }).slice(0, 4).forEach(function (f) { contre.push(f.name + ' (' + f.delta.toFixed(1) + ')'); });
    var v = a.value;
    if (v && v.available && v.ev != null) { if (v.ev >= v.minEV) pour.push('EV ' + (v.ev * 100).toFixed(1) + ' % au prix actuel'); else contre.push('EV ' + (v.ev * 100).toFixed(1) + ' % (sous le seuil de ' + Math.round(v.minEV * 100) + ' %)'); }
    if (v && v.status === 'VALUE_LOST') contre.push('cote sous le minimum acceptable');
    if (a.modelAgreement) { if (a.stability === 'Stable') pour.push('modèles cohérents entre eux'); else if (a.stability === 'Instable') contre.push('modèles en désaccord'); }
    if (d && d.cautions) d.cautions.forEach(function (c) { risques.push(c); });
    if (d && d.blocking) d.blocking.forEach(function (c) { if (risques.indexOf(c) < 0) risques.push(c); });
    if (a.context) {
      if (!a.context.effectifKnown) risques.push('effectif : information manquante');
      if (!a.context.fatigueKnown) risques.push('FATIGUE : INCONNUE');
      if (!a.context.rotationKnown) risques.push('rotation : information manquante');
    }
    if (a.early && a.early.mode) risques.push('début de saison : coefficients PROVISIONAL WEIGHTS');
    pour = pour.slice(0, 5); contre = contre.slice(0, 5);
    var concl;
    if (!d) concl = 'Analyse incomplète : aucune décision.';
    else if (d.decision === 'BET') concl = 'Le prix, le contexte et la qualité des données sont réunis : signal exploitable, sans garantie de résultat.';
    else if (d.decision === 'CHECK') concl = 'Le modèle détecte un signal, mais ' + (d.cautions[0] || 'des informations manquent') + ' : à surveiller plutôt qu\'à considérer comme une décision forte.';
    else concl = 'NO QUALIFIED OPPORTUNITY : ' + (d.blocking[0] || 'avantage insuffisant') + '.';
    return { decision: d ? d.decision : null, signal: a.signal || null, pour: pour, contre: contre, risques: risques,
      prix: v && v.available ? { current: v.currentOdds, fair: v.fairOdds, minimum: v.targetMinimum } : null, stability: a.stability || 'Inconnue', dataQuality: a.dataQualityLabel || null, conclusion: concl };
  }
  function qualityLabel(dq) { return !C.isNum(dq) ? 'Low' : dq >= 75 ? 'High' : dq >= 55 ? 'Medium' : 'Low'; }

  EA.value = { marketFromOdds: marketFromOdds, valueLine: valueLine, decide: decide, evidenceLedger: evidenceLedger, featureImportance: featureImportance,
    informationShock: informationShock, diffContext: diffContext, commentary: commentary, qualityLabel: qualityLabel };
  if (typeof module === 'object' && module.exports) module.exports = EA.value;
})(typeof window !== 'undefined' ? window : global);
