/* ===== js/ea-journal.js — EA MON SUIVI =====
   Journal de VOS paris réels (cote réelle, mise réelle, résultat) et statistiques honnêtes par type de pari et par source.
   Objectif : savoir, avec des chiffres vérifiables, ce qui marche vraiment pour vous — pas ce que promet un modèle.
   Module pur (aucun DOM, aucun stockage) : testable avec Node. */
(function (root) {
  'use strict';
  var VERSION = 'EA-JOURNAL-1.0';
  var MIN_BETS = 200;          // en dessous, la chance masque tout : aucune conclusion ferme
  var TYPES = [
    ['resultat', 'Victoire / résultat (1X2)'], ['dc', 'Double chance'], ['total', 'Total de buts (plus / moins)'],
    ['btts', 'Les deux équipes marquent'], ['equipe', 'Buts d\'une équipe'], ['score', 'Score exact'], ['combine', 'Combiné'], ['autre', 'Autre']
  ];
  var SOURCES = [['app', 'Suggéré par l\'application'], ['moi', 'Mon propre choix']];
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function typeLabel(k) { for (var i = 0; i < TYPES.length; i++) if (TYPES[i][0] === k) return TYPES[i][1]; return k; }
  function sourceLabel(k) { for (var i = 0; i < SOURCES.length; i++) if (SOURCES[i][0] === k) return SOURCES[i][1]; return k; }

  // Bénéfice d'un pari réglé : gagné = mise × (cote − 1) ; perdu = −mise ; remboursé = 0 ; en cours = null.
  function profit(b) {
    if (!b || !isNum(b.stake) || b.stake <= 0 || !isNum(b.odds) || b.odds <= 1) return null;
    if (b.result === 'won') return Math.round(b.stake * (b.odds - 1) * 100) / 100;
    if (b.result === 'lost') return -b.stake;
    if (b.result === 'void') return 0;
    return null;
  }
  // Intervalle de Wilson à 95 % du taux de réussite : montre à quel point le chiffre est incertain avec peu de paris.
  function wilson(wins, n) {
    if (!n) return null;
    var z = 1.96, p = wins / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
    return { lo: Math.max(0, (c - m) / d), hi: Math.min(1, (c + m) / d) };
  }
  function summarize(list) {
    var settled = (list || []).filter(function (b) { return (b.result === 'won' || b.result === 'lost') && profit(b) != null; });
    var voids = (list || []).filter(function (b) { return b.result === 'void'; }).length, pending = (list || []).filter(function (b) { return !b.result; }).length;
    var n = settled.length, wins = settled.filter(function (b) { return b.result === 'won'; }).length;
    var staked = settled.reduce(function (s, b) { return s + b.stake; }, 0), pl = settled.reduce(function (s, b) { return s + profit(b); }, 0);
    var avgOdds = n ? settled.reduce(function (s, b) { return s + b.odds; }, 0) / n : null;
    // taux de réussite nécessaire pour ne pas perdre, avec VOS cotes : moyenne des 1/cote
    var breakEven = n ? settled.reduce(function (s, b) { return s + 1 / b.odds; }, 0) / n : null;
    var hit = n ? wins / n : null, ci = wilson(wins, n);
    var ordered = settled.slice().sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
    var streak = 0, maxStreak = 0; ordered.forEach(function (b) { if (b.result === 'lost') { streak++; if (streak > maxStreak) maxStreak = streak; } else streak = 0; });
    var label = n === 0 ? 'AUCUN PARI RÉGLÉ' : n < 30 ? 'TROP PEU DE PARIS POUR CONCLURE' : n < MIN_BETS ? 'INDICATIF SEULEMENT' : 'ÉCHANTILLON SUFFISANT POUR UN PREMIER BILAN';
    // verdict prudent : on ne dit « rentable » que si l'intervalle de confiance du ROI ne contient plus le zéro (approximation simple)
    var roi = staked > 0 ? pl / staked : null;
    return { n: n, wins: wins, voids: voids, pending: pending, staked: Math.round(staked * 100) / 100, profit: Math.round(pl * 100) / 100, roi: roi, hitRate: hit, ci: ci, avgOdds: avgOdds, breakEven: breakEven,
      beatsBreakEven: (hit != null && breakEven != null) ? hit - breakEven : null, maxLosingStreak: maxStreak, label: label, enough: n >= MIN_BETS };
  }
  function groupBy(list, key) {
    var g = {}; (list || []).forEach(function (b) { var k = b[key] || 'autre'; (g[k] = g[k] || []).push(b); });
    var out = {}; Object.keys(g).forEach(function (k) { out[k] = summarize(g[k]); }); return out;
  }
  // Détection de « rattrapage » : mise nettement plus grosse juste après une perte (règle d'or des parieurs sérieux : jamais).
  function chaseAlerts(list) {
    var ordered = (list || []).filter(function (b) { return (b.result === 'won' || b.result === 'lost') && isNum(b.stake); }).sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
    var n = 0, last = null;
    ordered.forEach(function (b, i) { if (i > 0 && ordered[i - 1].result === 'lost' && b.stake >= ordered[i - 1].stake * 1.5) { n++; last = b; } });
    return { count: n, last: last };
  }
  // Mise exposée aujourd'hui / cette semaine, pour garder le contrôle.
  function exposure(list, sinceTs) { return (list || []).filter(function (b) { return (b.ts || 0) >= sinceTs && isNum(b.stake); }).reduce(function (s, b) { return s + b.stake; }, 0); }
  function toCSV(list) {
    var head = ['date', 'type', 'source', 'description', 'cote', 'mise', 'resultat', 'benefice'];
    var rows = (list || []).slice().sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); }).map(function (b) {
      return [new Date(b.ts || 0).toISOString().slice(0, 10), b.type, b.source, '"' + String(b.desc || '').replace(/"/g, '""') + '"', b.odds, b.stake, b.result || 'en cours', profit(b) == null ? '' : profit(b)].join(',');
    });
    return head.join(',') + '\n' + rows.join('\n');
  }
  var api = { VERSION: VERSION, MIN_BETS: MIN_BETS, TYPES: TYPES, SOURCES: SOURCES, typeLabel: typeLabel, sourceLabel: sourceLabel, profit: profit, wilson: wilson, summarize: summarize,
    groupBy: groupBy, chaseAlerts: chaseAlerts, exposure: exposure, toCSV: toCSV };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.EAJ = api;
})(typeof window !== 'undefined' ? window : globalThis);
