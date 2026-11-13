/* ===== js/ea-basket.js — EA BASKET : PROJECTION DE LA MARGE (en POINTS) =====
   Remplace les corrections multiplicatives héritées du football (± 18 à 60 % des points, indices saturés) qui produisaient des
   scores démesurés (ex. 149-80, 99 % de victoire pour un match de NBA).
   Principe (modèle classique des marges au basket) :
     1. BASE : points attendus de chaque équipe issus des données saisies (forme, domicile/extérieur, face-à-face, défense adverse).
        Leur écart est la marge OBSERVÉE.
     2. RÉGRESSION VERS LA MOYENNE : la marge observée est rétrécie selon la taille de l'échantillon, vers un a priori fondé sur
        le classement et l'Elo (0 si on n'en a pas). Fiabilité = n / (n + 7) (bruit d'un match ≈ 12 pts, écart réel entre équipes ≈ 4,5 pts).
     3. AVANTAGE DU TERRAIN (+2 pts) sauf terrain neutre, et enjeu en points (± 1 pt).
     4. PLAFOND DOUX de la marge (≈ ±25 pts) : même les plus gros écarts réels de NBA restent dans cette zone.
   Le TOTAL de points est conservé tel qu'issu des données : seule la répartition entre les deux équipes change.
   Les corrections forme / face-à-face / défense ne sont PAS rajoutées : elles sont déjà dans la base (pas de double comptage).
   Coefficients PROVISOIRES, à valider sur historique. Module pur (aucun DOM) : testable avec Node. */
(function (root) {
  'use strict';
  var VERSION = 'EA-BASKET-1.0';
  var CFG = {
    kReliability: 7,         // fiabilité = n / (n + k)
    priorNetRange: 8,        // classement : de +8 (1er) à −8 (dernier) points de marge nette par rapport à la moyenne
    eloPtsPer400: 15,        // écart Elo de 400 → +15 pts de marge (≈ 90 % de victoires)
    hca: 2.0,                // avantage du terrain, en points de marge
    enjeuPts: 1.0,           // enjeu (indice -1..1) → ± 1 pt de marge
    marginCap: 25,           // plafond doux (tanh) de la marge
    minPts: 60
  };
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  // Marge a priori issue du classement (rangs) : linéaire entre +range et −range.
  function classementPrior(o) {
    if (!isNum(o.rankA) || !isNum(o.rankB)) return null;
    var T = isNum(o.totalTeams) && o.totalTeams >= 4 ? o.totalTeams : Math.max(o.rankA, o.rankB, 12);
    var net = function (r) { return CFG.priorNetRange * (1 - 2 * (clamp(r, 1, T) - 1) / (T - 1)); };
    return net(o.rankA) - net(o.rankB);
  }
  function eloPrior(o) {
    if (!isNum(o.eloA) || !isNum(o.eloB)) return null;
    return clamp((o.eloA - o.eloB) / 400 * CFG.eloPtsPer400, -CFG.marginCap, CFG.marginCap);
  }
  function reliability(n) { return n > 0 ? n / (n + CFG.kReliability) : 0; }
  function softCap(m) { return CFG.marginCap * Math.tanh(m / CFG.marginCap); }

  /* o : { ptsA, ptsB (base), nA, nB (matchs réellement saisis), rankA, rankB, totalTeams, eloA, eloB,
           enjeuIdx (-1..1, déjà amorti en coupe/Europe), neutral (bool) } */
  function project(o) {
    var total = o.ptsA + o.ptsB, obs = o.ptsA - o.ptsB;
    var n = Math.min(isNum(o.nA) ? o.nA : 0, isNum(o.nB) ? o.nB : 0);
    var rel = reliability(n);
    var pc = classementPrior(o), pe = eloPrior(o), priors = [pc, pe].filter(isNum);
    var prior = priors.length ? priors.reduce(function (a, b) { return a + b; }, 0) / priors.length : 0;
    var shrunk = rel * obs + (1 - rel) * prior;
    var hca = o.neutral ? 0 : CFG.hca;
    var enj = clamp(isNum(o.enjeuIdx) ? o.enjeuIdx : 0, -1, 1) * CFG.enjeuPts;
    var raw = shrunk + hca + enj, margin = softCap(raw);
    return {
      ptsA: Math.max(CFG.minPts, (total + margin) / 2), ptsB: Math.max(CFG.minPts, (total - margin) / 2), total: total, margin: margin,
      parts: { observed: obs, reliability: rel, n: n, prior: prior, priorClassement: pc, priorElo: pe, shrunk: shrunk, hca: hca, enjeu: enj, raw: raw, capped: Math.abs(raw) > Math.abs(margin) + 1e-9 }
    };
  }
  // Plafond doux final (après blessures, fatigue, cumul…) : conserve le total, borne la marge.
  function capFinal(ptsA, ptsB) {
    var total = ptsA + ptsB, m = softCap(ptsA - ptsB);
    return { ptsA: Math.max(CFG.minPts, (total + m) / 2), ptsB: Math.max(CFG.minPts, (total - m) / 2) };
  }
  // Valeur « neutre » d'une équipe sans données : celle d'un match typique de l'AUTRE équipe (moyenne marqués/encaissés),
  // jamais un chiffre arbitraire qui crée un faux écart.
  function neutralPoints(pairsForTeam, fallback) {
    var p = (pairsForTeam || []).filter(function (x) { return x && isNum(x[0]) && isNum(x[1]); });
    if (!p.length) return fallback;
    var f = p.reduce(function (s, x) { return s + x[0]; }, 0) / p.length, a = p.reduce(function (s, x) { return s + x[1]; }, 0) / p.length;
    return (f + a) / 2;
  }

  var api = { VERSION: VERSION, CFG: CFG, project: project, capFinal: capFinal, reliability: reliability, classementPrior: classementPrior, eloPrior: eloPrior, softCap: softCap, neutralPoints: neutralPoints };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.EAB = api;
})(typeof window !== 'undefined' ? window : globalThis);
