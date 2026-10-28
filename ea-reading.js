/* ===== js/ea-reading.js — EA LECTURE DU MATCH + FORCE DES ADVERSAIRES =====
   1. FORCE DES ADVERSAIRES PAR MATCH : au lieu d'un pourcentage global impossible à estimer, on note chaque score de la série
      avec le niveau de l'adversaire (faible / moyen / fort). Les buts marqués et encaissés sont ajustés match par match (±15 % max).
   2. LECTURE DU MATCH : classe les marchés par SOLIDITÉ (et non par valeur) :
      probabilité du modèle, puis test de résistance (que devient-elle si les buts attendus se trompent de ±15 % ?),
      concordance avec les tendances de forme, qualité des données. Donne aussi la « cote minimale conseillée » :
      en dessous, le pari ne vaut pas la peine même s'il est probable.
   Module pur (aucun DOM) : testable avec Node. Aucune donnée n'est inventée : un score non noté n'est pas ajusté. */
(function (root) {
  'use strict';
  var VERSION = 'EA-READING-1.0';
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  /* ---------- force des adversaires par match ---------- */
  var LEVELS = {
    F: { label: 'adversaire faible', emoji: '🟢', kFor: 0.85, kAg: 1.15 },   // marquer contre un faible vaut moins ; encaisser contre un faible est plus grave
    M: { label: 'adversaire moyen',  emoji: '🟡', kFor: 1,    kAg: 1 },
    T: { label: 'adversaire fort',   emoji: '🔴', kFor: 1.15, kAg: 0.85 }
  };
  var ORDER = [undefined, 'F', 'M', 'T'];
  function cycle(level) { var i = ORDER.indexOf(level || undefined); return ORDER[(i + 1) % ORDER.length]; }
  // Renvoie de nouvelles paires [marqués, encaissés] ajustées ; les scores non notés restent inchangés.
  function adjustPairs(pairs) {
    var tagged = 0, counts = { F: 0, M: 0, T: 0 };
    var out = (pairs || []).map(function (p) {
      var L = p && LEVELS[p[2]];
      if (!L) return [p[0], p[1]];
      tagged++; counts[p[2]]++;
      return [p[0] * L.kFor, p[1] * L.kAg];
    });
    return { pairs: out, tagged: tagged, n: (pairs || []).length, counts: counts };
  }

  /* ---------- probabilités de Poisson pour le test de résistance ---------- */
  function pois(l, k) { var f = 1, i; for (i = 2; i <= k; i++) f *= i; return Math.exp(-l) * Math.pow(l, k) / f; }
  function grid(la, lb) { var r = [], a, b; for (a = 0; a < 11; a++) for (b = 0; b < 11; b++) r.push({ a: a, b: b, p: pois(la, a) * pois(lb, b) }); return r; }
  function probEv(g, ev) {
    var s = 0, i, c, ok;
    for (i = 0; i < g.length; i++) {
      c = g[i];
      switch (ev.type) {
        case 'result1x2': ok = ev.outcome === 'A' ? c.a > c.b : ev.outcome === 'B' ? c.a < c.b : c.a === c.b; break;
        case 'resultDC': ok = ev.outcomes.indexOf(c.a > c.b ? 'A' : c.a < c.b ? 'B' : 'draw') >= 0; break;
        case 'goalsLine': ok = ev.op === 'over' ? c.a + c.b > ev.line : c.a + c.b < ev.line; break;
        case 'btts': ok = ev.side === 'yes' ? (c.a >= 1 && c.b >= 1) : !(c.a >= 1 && c.b >= 1); break;
        case 'teamGoals': { var gg = ev.team === 'A' ? c.a : c.b; ok = ev.op === 'over' ? gg > ev.line : gg < ev.line; break; }
        default: return null;
      }
      if (ok) s += c.p;
    }
    return s;
  }
  // Pire dérive de la probabilité si les buts attendus des deux équipes se trompent de ±pct (en combinaisons).
  function stress(ev, lamA, lamB, pct) {
    var base = probEv(grid(lamA, lamB), ev); if (base == null) return null;
    var f = [1 - pct, 1 + pct], worst = 0, i, j;
    for (i = 0; i < 2; i++) for (j = 0; j < 2; j++) { var d = probEv(grid(lamA * f[i], lamB * f[j]), ev) - base; if (d < worst) worst = d; }
    return worst;   // ≤ 0
  }

  /* ---------- lecture ---------- */
  // o.markets : catalogue [{id,family,label,p,eval,reliability,extreme,bookOdds,oddsSource}]
  // o.lamA/lamB : buts attendus finaux ; o.trend(ev,p) → {pTrend,W,parts} ou null ; o.dataQualityPct
  function read(o) {
    var STRESS = 0.15, items = [];
    (o.markets || []).forEach(function (m) {
      if (m.reliability !== 'model' || !isNum(m.p) || m.p < 0.5) return;           // jamais les marchés statistiques non fiables, ni les côtés improbables
      if (m.family === '1X2' && m.eval && m.eval.outcome === 'draw') return;       // le nul seul n'est jamais « solide »
      var worst = stress(m.eval, o.lamA, o.lamB, STRESS);
      var pRobust = clamp(m.p + (worst == null ? 0 : worst), 0, 1);
      var tr = o.trend ? o.trend(m.eval, m.p) : null, conflict = false, support = false, trendTxt = 'pas de tendance saisie sur ce marché';
      if (tr && isNum(tr.pTrend) && tr.W > 0) {
        trendTxt = 'tendances de forme : ' + Math.round(tr.pTrend * 100) + ' %';
        if (tr.W >= 0.10 && tr.pTrend < 0.40) { conflict = true; trendTxt += ' — contredisent le modèle'; }
        else if (tr.pTrend >= 0.55) { support = true; trendTxt += ' — confirment le modèle'; }
      }
      var dqLow = isNum(o.dataQualityPct) && o.dataQualityPct < 40;
      var score = pRobust - (conflict ? 0.06 : 0) - (dqLow ? 0.04 : 0) + (support ? 0.02 : 0);
      var grade = (score >= 0.72 && !conflict) ? 'SOLIDE' : (score >= 0.60 && !conflict) ? 'CORRECT' : 'FRAGILE';
      var minOdds = pRobust > 0 ? Math.round(1.05 / pRobust * 100) / 100 : null;   // cote en dessous de laquelle le pari ne paie plus, marge de 5 % comprise
      items.push({ id: m.id, family: m.family, label: m.label, eval: m.eval, p: m.p, pRobust: pRobust, drift: worst, grade: grade, score: score, trendTxt: trendTxt, conflict: conflict, support: support,
        fair: Math.round(100 / m.p) / 100, minOdds: minOdds, tooShort: m.p > 0.93, bookOdds: m.oddsSource === 'bookmaker' ? m.bookOdds : null });
    });
    // un seul marché par « famille logique » pour ne pas répéter 3 fois la même idée (ex. Plus de 1,5 / 2,5 / 0,5)
    var rank = { SOLIDE: 0, CORRECT: 1, FRAGILE: 2 };
    items.sort(function (a, b) { return rank[a.grade] - rank[b.grade] || b.score - a.score; });
    var seen = {}, top = [];
    items.forEach(function (it) {
      if (it.tooShort) return;
      var k = it.family === 'TOTAL' ? 'TOTAL:' + it.eval.op : it.family === 'TEAM' ? 'TEAM:' + it.eval.team + it.eval.op : it.family;
      if (seen[k]) return; seen[k] = 1; top.push(it);
    });
    // lecture générale en une phrase
    var tot = (o.lamA || 0) + (o.lamB || 0), notes = [];
    var m1 = (o.markets || []).filter(function (m) { return m.family === '1X2'; }), best1 = m1.reduce(function (s, m) { return Math.max(s, m.p); }, 0);
    notes.push(tot >= 2.9 ? 'Match plutôt ouvert (' + tot.toFixed(2) + ' buts attendus) : les marchés de buts sont les plus lisibles.' : tot <= 2.2 ? 'Match plutôt fermé (' + tot.toFixed(2) + ' buts attendus) : attention aux « plus de » ; « moins de » est plus lisible.' : 'Match équilibré côté buts (' + tot.toFixed(2) + ' buts attendus).');
    notes.push(best1 >= 0.55 ? 'Un favori net se dégage au résultat.' : 'Le résultat est incertain (aucune issue au-dessus de 55 %) : privilégiez les marchés de buts ou la double chance, plutôt que la victoire sèche.');
    return { top: top.slice(0, 6), all: items, notes: notes, version: VERSION };
  }

  var api = { VERSION: VERSION, LEVELS: LEVELS, cycle: cycle, adjustPairs: adjustPairs, stress: stress, probEv: probEv, grid: grid, read: read };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.EAR = api;
})(typeof window !== 'undefined' ? window : globalThis);
