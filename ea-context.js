/* EA-VALUE 3.0 — CONTEXT ENGINE + EARLY SEASON ENGINE.
   UNKNOWN est une vraie valeur : information manquante, jamais convertie en NORMAL / AUCUNE ABSENCE / FATIGUE FAIBLE. */
(function (g) {
  'use strict';
  if (typeof require === 'function' && typeof window === 'undefined') require('./ea-core.js');
  var EA = g.EA, C = EA.core;

  var LEVELS = ['green', 'yellow', 'orange', 'red', 'unknown'];
  var EMOJI = { green: '🟢', yellow: '🟡', orange: '🟠', red: '🔴', unknown: '⚪' };
  var LABELS = {
    effectif: { green: 'Aucun absent connu', yellow: '1 joueur important absent', orange: '2 joueurs importants absents', red: 'Plusieurs joueurs importants absents', unknown: 'Effectif : information manquante' },
    fatigue: { green: 'Repos normal', yellow: 'Match récent', orange: 'Enchaînement important', red: 'Très rapproché / back-to-back', unknown: 'FATIGUE : INCONNUE' },
    rotation: { green: 'Stable', yellow: 'Quelques changements', orange: 'Beaucoup de changements', red: 'Très incertaine', unknown: 'Rotation : information manquante' }
  };
  function level(v) { return LEVELS.indexOf(v) >= 0 ? v : 'unknown'; }

  // ---------- IMPACT JOUEUR (interne : statistiques ; interface : FAIBLE/MOYEN/FORT/TRÈS FORT/INCONNU) ----------
  // Part de la production de l'équipe. Seuils configurables et PROVISOIRES (non validés).
  var IMPACT_THRESHOLDS = { faible: 0.05, moyen: 0.10, fort: 0.18 };
  function playerImpact(p, team, thresholds) {
    var th = thresholds || IMPACT_THRESHOLDS;
    if (!p || !team) return { level: 'INCONNU', share: null, reason: 'IMPACT JOUEUR INCONNU (statistiques indisponibles)' };
    // Basket : points + passes + rebonds ; football : buts + passes décisives
    var parts = [], total = [];
    function add(a, b, w) { a = C.num(a); b = C.num(b); if (a != null && b != null && b > 0) { parts.push(a / b * w); total.push(w); } }
    add(p.ppg, team.ppg, 1); add(p.apg, team.apg, 1); add(p.rpg, team.rpg, 1);
    add(p.goals, team.goals, 1); add(p.assists, team.assists, 1);
    if (!parts.length) return { level: 'INCONNU', share: null, reason: 'IMPACT JOUEUR INCONNU (statistiques indisponibles)' };
    var share = C.mean(parts), lvl = share < th.faible ? 'FAIBLE' : share < th.moyen ? 'MOYEN' : share < th.fort ? 'FORT' : 'TRÈS FORT';
    return { level: lvl, share: share, reason: 'Absence importante — impact estimé ' + lvl + ' (≈' + Math.round(share * 100) + ' % de la production de l\'équipe)' };
  }
  var ORDER = ['FAIBLE', 'MOYEN', 'FORT', 'TRÈS FORT'];

  // effectif : {level, players:[{name, ppg, apg, rpg, goals, assists}], team:{...}}
  function assessEffectif(input, cfg) {
    input = input || {}; var lv = level(input.level);
    var players = Array.isArray(input.players) ? input.players : [];
    if (lv === 'unknown' && !players.length) return { level: 'unknown', emoji: EMOJI.unknown, label: LABELS.effectif.unknown, impact: 'INCONNU', known: false, absorbedShare: null, uncertaintyPts: 2, explanation: 'Information manquante : l\'incertitude est augmentée, aucune valeur « aucune absence » n\'est supposée.' };
    if (lv === 'unknown' && players.length) lv = players.length === 1 ? 'yellow' : players.length === 2 ? 'orange' : 'red';
    if (lv === 'green') return { level: 'green', emoji: EMOJI.green, label: LABELS.effectif.green, impact: 'AUCUN', known: true, absorbedShare: 0, uncertaintyPts: 0, explanation: 'Aucun absent connu déclaré.' };
    var impacts = players.map(function (p) { return Object.assign({ name: p.name || 'Joueur' }, playerImpact(p, input.team)); });
    var known = impacts.length > 0 && impacts.every(function (i) { return i.share != null; });
    var impact = 'INCONNU', share = null;
    if (known) { share = impacts.reduce(function (s, i) { return s + i.share; }, 0); impact = share < IMPACT_THRESHOLDS.faible ? 'FAIBLE' : share < IMPACT_THRESHOLDS.moyen ? 'MOYEN' : share < IMPACT_THRESHOLDS.fort ? 'FORT' : 'TRÈS FORT'; }
    return { level: lv, emoji: EMOJI[lv], label: LABELS.effectif[lv], impact: impact, known: true, impactKnown: known, impacts: impacts, productionShareLost: share,
      uncertaintyPts: known ? 1 : 3,
      explanation: known ? 'Absence(s) importante(s) — impact estimé ' + impact + ' d\'après les statistiques fournies.' : 'IMPACT JOUEUR INCONNU : aucune correction chiffrée n\'est appliquée, l\'incertitude est augmentée.' };
  }

  // Part de production perdue appliquée au modèle : uniquement si l'impact est calculé. absorption = part NON compensée (PROVISOIRE, configurable).
  function absencePenalty(eff, absorption) {
    if (!eff || eff.productionShareLost == null) return { multiplier: 1, applied: false, reason: 'IMPACT JOUEUR INCONNU : aucune correction' };
    var a = C.isNum(absorption) ? absorption : 0.15;
    return { multiplier: 1 - eff.productionShareLost * a, applied: true, absorption: a, provisional: true, reason: 'Part de production perdue × ' + a + ' (coefficient PROVISOIRE)' };
  }

  // ---------- FATIGUE ----------
  function daysBetween(a, b) { return (Date.parse(b) - Date.parse(a)) / 86400000; }
  // schedule : {matchDate:'YYYY-MM-DD', previousDates:['YYYY-MM-DD',...], extraTime:bool, travelKm:number|null}
  function fatigueFromSchedule(s) {
    if (!s || !s.matchDate || !Array.isArray(s.previousDates) || !s.previousDates.length) return null;
    var md = s.matchDate, prev = s.previousDates.filter(function (d) { return isFinite(Date.parse(d)) && Date.parse(d) < Date.parse(md); }).sort();
    if (!prev.length) return null;
    var last = prev[prev.length - 1], rest = Math.floor(daysBetween(last, md));
    var m7 = prev.filter(function (d) { return daysBetween(d, md) <= 7; }).length, m14 = prev.filter(function (d) { return daysBetween(d, md) <= 14; }).length;
    var score = 0;
    if (rest <= 1) score += 45; else if (rest === 2) score += 30; else if (rest === 3) score += 18; else if (rest === 4) score += 8; else if (rest <= 6) score += 3;
    score += C.clamp(m7 - 1, 0, 4) * 11; score += C.clamp(m14 - 2, 0, 6) * 5; if (s.extraTime) score += 10;
    return { restDays: rest, matches7d: m7, matches14d: m14, backToBack: rest <= 1, travelKm: C.num(s.travelKm), score: C.clamp(Math.round(score), 0, 100) };
  }
  function assessFatigue(input) {
    input = input || {}; var calc = fatigueFromSchedule(input.schedule);
    var lv = level(input.level);
    if (calc) { lv = calc.backToBack ? 'red' : calc.score >= 55 ? 'orange' : calc.score >= 25 ? 'yellow' : 'green'; }
    if (lv === 'unknown') return { level: 'unknown', emoji: EMOJI.unknown, label: LABELS.fatigue.unknown, known: false, score: null, calc: null, uncertaintyPts: 1.5 };
    return { level: lv, emoji: EMOJI[lv], label: LABELS.fatigue[lv], known: true, score: calc ? calc.score : null, calc: calc, calendarBased: !!calc, uncertaintyPts: calc ? 0 : 0.5 };
  }
  // Correction plafonnée et faible ; seulement quand un score calculé existe
  function fatigueMultiplier(score, maxPenalty) {
    if (!C.isNum(score)) return 1; var m = C.isNum(maxPenalty) ? maxPenalty : 0.025; return 1 - m * C.clamp(score, 0, 100) / 100;
  }

  // ---------- ROTATION / COMPOSITION ----------
  function assessRotation(input) {
    input = input || {}; var lv = level(input.level);
    var lineup = input.lineupConfirmed === true ? true : input.lineupConfirmed === false ? false : null;
    var known = lv !== 'unknown';
    return { level: lv, emoji: EMOJI[lv], label: LABELS.rotation[lv], known: known, lineupConfirmed: lineup,
      lineupLabel: lineup === true ? 'Composition confirmée' : 'LINEUP NOT CONFIRMED', uncertaintyPts: (known ? 0 : 1.5) + (lineup === true ? 0 : 1) };
  }

  // ---------- CONTEXT QUALITY (0-100) — ce n'est PAS une probabilité de victoire ----------
  var CQ_WEIGHTS = { data: 1, effectif: 1, fatigue: 1, rotation: 1, lineup: 1, freshness: 1 };
  var FRESH_SCORE = { GREEN: 100, YELLOW: 60, RED: 20, UNKNOWN: 0 };
  function contextQuality(p, weights) {
    var w = weights || CQ_WEIGHTS, parts = {};
    parts.data = C.isNum(p.dataQuality) ? C.clamp(p.dataQuality, 0, 100) : 0;
    parts.effectif = p.effectif && p.effectif.known ? (p.effectif.impact === 'INCONNU' ? 50 : 100) : 0;
    parts.fatigue = p.fatigue && p.fatigue.known ? 100 : 0;
    parts.rotation = p.rotation && p.rotation.known ? 100 : 0;
    parts.lineup = p.rotation && p.rotation.lineupConfirmed === true ? 100 : 0;
    parts.freshness = FRESH_SCORE[p.freshnessStatus || 'UNKNOWN'] || 0;
    var sw = 0, s = 0; for (var k in parts) { sw += w[k]; s += parts[k] * w[k]; }
    var score = Math.round(s / sw);
    var extra = ['effectif', 'fatigue', 'rotation'].reduce(function (a, k) { return a + ((p[k] && p[k].uncertaintyPts) || 0); }, 0);
    return { score: score, parts: parts, extraUncertaintyPts: C.round(extra, 1), notProbability: true, note: 'Qualité des informations disponibles, PAS une probabilité de victoire.' };
  }

  // ---------- EARLY SEASON ENGINE ----------
  // input : {sport, gamesPlayed, priorAvailable, squadStability:'stable'|'changed'|'unknown', dataQuality}
  function earlySeason(input, cfg) {
    var conf = (cfg && cfg.earlySeason) || C.DEFAULT_CONFIG.earlySeason, sp = input.sport === 'basketball' ? 'basketball' : 'football', c = conf[sp];
    var n = C.num(input.gamesPlayed);
    if (n == null || n < 0) return { mode: null, wCurrent: null, wPrior: null, reliability: null, label: 'INSUFFICIENT DATA', weightsStatus: 'PROVISIONAL WEIGHTS', unknown: true };
    var prior = input.priorAvailable === true, squad = input.squadStability;
    var wCur = prior ? n / (n + c.k) : 1, wPrior = 1 - wCur;
    var sampleScore = n / (n + c.k), historyScore = prior ? 1 : 0, squadScore = squad === 'stable' ? 1 : squad === 'changed' ? 0.4 : 0;
    var dq = C.isNum(input.dataQuality) ? C.clamp(input.dataQuality, 0, 100) / 100 : 0;
    var reliability = Math.round(100 * (0.4 * sampleScore + 0.3 * historyScore + 0.2 * squadScore + 0.1 * dq));
    var lvl = function (x, lo, hi) { return x < lo ? 'faible' : x < hi ? 'moyen' : 'bon'; };
    return { mode: n < c.threshold, gamesPlayed: n, wCurrent: C.round(wCur, 3), wPrior: C.round(wPrior, 3), reliability: reliability,
      details: { echantillon: lvl(sampleScore, 0.4, 0.65), historique: prior ? 'bon' : 'indisponible', effectif: squad === 'stable' ? 'stable' : squad === 'changed' ? 'modifié' : 'inconnu',
        incertitude: reliability < 45 ? 'élevée' : reliability < 70 ? 'moyenne' : 'faible' },
      weightsStatus: 'PROVISIONAL WEIGHTS', notProbability: true,
      label: n < c.threshold ? 'EARLY SEASON MODE' : 'SAISON ÉTABLIE',
      extraUncertaintyPts: C.round((1 - reliability / 100) * 4, 1) };
  }
  function blend(current, prior, wCurrent) {
    var a = C.num(current), b = C.num(prior);
    if (a == null && b == null) return null; if (a == null) return b; if (b == null) return a;
    var w = C.isNum(wCurrent) ? C.clamp(wCurrent, 0, 1) : 1; return a * w + b * (1 - w);
  }

  EA.context = { LEVELS: LEVELS, EMOJI: EMOJI, LABELS: LABELS, IMPACT_THRESHOLDS: IMPACT_THRESHOLDS, playerImpact: playerImpact, assessEffectif: assessEffectif,
    absencePenalty: absencePenalty, fatigueFromSchedule: fatigueFromSchedule, assessFatigue: assessFatigue, fatigueMultiplier: fatigueMultiplier,
    assessRotation: assessRotation, contextQuality: contextQuality, earlySeason: earlySeason, blend: blend };
  if (typeof module === 'object' && module.exports) module.exports = EA.context;
})(typeof window !== 'undefined' ? window : global);
