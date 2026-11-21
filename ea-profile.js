/* ===== js/ea-profile.js — EA PROFIL DE RISQUE =====
   L'application ne décide plus à votre place d'être prudente. VOUS choisissez le profil ; EA donne alors, pour chaque marché, la ligne
   qui correspond à ce profil — au lieu de toujours choisir la ligne la plus probable (donc la plus éloignée de ce que le match annonce :
   « moins de 5,5 buts » pour un match à 4,2 buts attendus ; doubles chances à cote 1,18).
   Profil = fourchette de probabilité du MODÈLE (la cote juste = 1 / p est indicative, jamais une cote bookmaker).
   Audace ne veut pas dire meilleure précision : à probabilité plus basse, on perd plus souvent. Seul le journal « Mon suivi » dit ce qui rapporte.
   Module pur (aucun DOM) : testable avec Node. */
(function (root) {
  'use strict';
  var VERSION = 'EA-PROFILE-1.0';
  var PROFILES = {
    prudent:        { label: 'Prudent',        icon: '🛡️', lo: 0.78, hi: 0.95, center: 0.85, fair: 'cote juste ≈ 1,05 à 1,30' },
    equilibre:      { label: 'Équilibré',      icon: '⚖️', lo: 0.62, hi: 0.78, center: 0.70, fair: 'cote juste ≈ 1,30 à 1,60' },
    audacieux:      { label: 'Audacieux',      icon: '🔥', lo: 0.48, hi: 0.62, center: 0.55, fair: 'cote juste ≈ 1,60 à 2,10' },
    tres_audacieux: { label: 'Très audacieux', icon: '🚀', lo: 0.30, hi: 0.48, center: 0.40, fair: 'cote juste ≈ 2,10 à 3,30' }
  };
  var ORDER = ['prudent', 'equilibre', 'audacieux', 'tres_audacieux'];
  var DEFAULT = 'audacieux';
  var DIRECTION_BONUS = 0.03;   // nudge de cohérence de direction (3 points de probabilité)
  var BOOK_MARGIN = 0.94;   // marge type d'un bookmaker (≈ 6 %) : sert UNIQUEMENT aux cotes estimées, toujours signalées comme telles

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function norm(profile) { return PROFILES[profile] ? profile : DEFAULT; }

  // Choisit, parmi des candidats {p,...}, celui dont la probabilité est dans la fourchette du profil et la plus proche de son centre.
  // Aucun candidat dans la fourchette : le plus proche du centre (jamais « le plus probable » par défaut).
  // bonus(c) (optionnel) : nombre ≥ 0 retiré à la distance d'un candidat pour départager des paris de probabilité presque égale en faveur de
  // celui qui va dans le SENS du match (ex. plus de buts pour un match à 4,2 buts attendus) : cohérence avec ce que l'analyse annonce.
  function pick(cands, profile, getP, bonus) {
    var P = PROFILES[norm(profile)], g = getP || function (c) { return c.p; };
    var list = (cands || []).filter(function (c) { return isNum(g(c)); });
    if (!list.length) return null;
    var dist = function (c) { return Math.abs(g(c) - P.center) - (bonus ? (bonus(c) || 0) : 0); };
    var inBand = list.filter(function (c) { return g(c) >= P.lo && g(c) <= P.hi; });
    var pool = inBand.length ? inBand : list;
    return pool.slice().sort(function (a, b) { return dist(a) - dist(b); })[0];
  }
  // Cohérence de direction OBLIGATOIRE : si des candidats vont dans le sens du match (preferFn), on choisit parmi eux ; sinon parmi tous.
  // Ex. match à 4,2 buts attendus : seulement des « plus de » ; l'application ne propose plus « moins de 5,5 » ni « moins de 3,5 » pour un match ouvert.
  function pickAligned(cands, profile, preferFn) {
    if (!preferFn) return pick(cands, profile);
    var aligned = (cands || []).filter(preferFn);
    return pick(aligned.length ? aligned : cands, profile);
  }
  // Sens du match d'après les buts attendus : « over » (ouvert), « under » (fermé) ou null (équilibré : aucune préférence).
  function direction(mu) { return !isNum(mu) ? null : mu >= 2.9 ? 'over' : mu <= 2.5 ? 'under' : null; }
  function bttsDirection(mu) { return !isNum(mu) ? null : mu >= 2.9 ? 'yes' : mu <= 2.3 ? 'no' : null; }
  // Classe les candidats par proximité au centre du profil (les plus « dans l'esprit » du profil d'abord).
  function rank(cands, profile, getP) {
    var P = PROFILES[norm(profile)], g = getP || function (c) { return c.p; };
    return (cands || []).filter(function (c) { return isNum(g(c)); }).sort(function (a, b) { return Math.abs(g(a) - P.center) - Math.abs(g(b) - P.center); });
  }
  function inBand(p, profile) { var P = PROFILES[norm(profile)]; return isNum(p) && p >= P.lo && p <= P.hi; }

  /* ---------- coupons par cote cible ---------- */
  // La cote d'une jambe : cote bookmaker saisie, sinon cote ESTIMÉE = marge type / probabilité (signalée « estimée »).
  function legOdds(l) {
    if (isNum(l.cote) && l.cote > 1 && l.oddsSource === 'bookmaker') return { odds: l.cote, estimated: false };
    return { odds: Math.max(1.01, BOOK_MARGIN / l.p), estimated: true };
  }
  /* perMatch : [{matchKey, options:[{p, label, ...}]}] ; target : cote totale visée (2, 3, 5, 10…).
     Cherche les coupons de 2 à maxLegs jambes (UNE par match, au moins 2 matchs) dont la cote totale tombe dans [target×0,92 ; target×1,45]
     et renvoie celui de plus forte probabilité conjointe, à égalité celui qui a le moins de jambes.
     Principe : pour une même cote totale, MOINS de jambes plus audacieuses battent beaucoup de jambes prudentes, car chaque jambe
     ajoute sa marge de bookmaker (6 %) et son risque d'erreur. */
  function targetCombo(perMatch, target, opts) {
    opts = opts || {};
    var maxLegs = opts.maxLegs || 4, topN = opts.topN || 5, lo = target * 0.92, hi = target * 1.45, best = null;
    var matches = (perMatch || []).map(function (m) {
      var opt = (m.options || []).filter(function (o) { return isNum(o.p) && o.p > 0.02 && o.p < 0.96; }).map(function (o) { var lo2 = legOdds(o); return Object.assign({}, o, { _odds: lo2.odds, _est: lo2.estimated, matchKey: m.matchKey }); });
      // on garde, par match, les options les plus utiles pour une cote cible : un éventail de probabilités
      opt.sort(function (a, b) { return b.p - a.p; });
      var keep = [], step = Math.max(1, Math.floor(opt.length / topN));
      for (var i = 0; i < opt.length && keep.length < topN; i += step) keep.push(opt[i]);
      return { matchKey: m.matchKey, options: keep };
    }).filter(function (m) { return m.options.length; });
    if (matches.length < 2) return null;
    function rec(startIdx, chosen, odds, p) {
      if (chosen.length >= 2 && odds >= lo && odds <= hi) {
        if (!best || p > best.joint + 1e-12 || (Math.abs(p - best.joint) <= 1e-12 && chosen.length < best.legs.length)) best = { legs: chosen.slice(), odds: odds, joint: p };
      }
      if (chosen.length >= maxLegs || odds > hi) return;
      for (var i = startIdx; i < matches.length; i++) {
        for (var j = 0; j < matches[i].options.length; j++) {
          var o = matches[i].options[j]; chosen.push(o);
          rec(i + 1, chosen, odds * o._odds, p * o.p);
          chosen.pop();
        }
      }
    }
    rec(0, [], 1, 1);
    if (!best) return null;
    best.estimated = best.legs.some(function (l) { return l._est; });
    best.target = target;
    best.ev = best.joint * best.odds - 1;      // espérance par unité misée si les probabilités du modèle sont justes ET si les cotes sont celles affichées
    return best;
  }

  var api = { pickAligned: pickAligned, direction: direction, bttsDirection: bttsDirection, VERSION: VERSION, PROFILES: PROFILES, ORDER: ORDER, DEFAULT: DEFAULT, BOOK_MARGIN: BOOK_MARGIN, DIRECTION_BONUS: DIRECTION_BONUS, norm: norm, pick: pick, rank: rank, inBand: inBand, legOdds: legOdds, targetCombo: targetCombo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.EAP = api;
})(typeof window !== 'undefined' ? window : globalThis);
