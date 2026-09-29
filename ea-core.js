/* EA-VALUE 3.0 — CORE : version, configuration, utilitaires, fraîcheur, registre des modèles.
   Aucune donnée fabriquée : une valeur absente reste null/UNKNOWN et n'est jamais remplacée par « normal ». */
(function (g) {
  'use strict';
  var EA = g.EA = g.EA || {};
  var VERSION = 'EA-VALUE-3.0.0';

  // Tous les coefficients sont configurables. provisional:true = non validés sur données historiques.
  var DEFAULT_CONFIG = {
    provisional: true,
    earlySeason: { football: { threshold: 8, k: 10 }, basketball: { threshold: 15, k: 20 } },
    freshness: { greenHours: 24, yellowHours: 72 },
    mc: { default: 10000, fast: 2000, options: [1000, 5000, 10000, 50000] },
    basketSd: { margin: 12, total: 18, provisional: true },
    value: { minEV: 0.05, anomalyEV: 0.12, highProb: 0.70, minDataQuality: 60, minContextQuality: 60 },
    stability: { stableSpreadPts: 5, mediumSpreadPts: 10 },
    minSample: { competitionStats: 10, calibration: 30, backtest: 30, weights: 30 },
    health: {
      brier: { caution: 0.25, degraded: 0.27, disabled: 0.30 },
      ece: { caution: 0.08, degraded: 0.12, disabled: 0.18 },
      clvPts: { caution: 0, degraded: -2, disabled: -5 },
      minN: 30
    },
    bankroll: { kellyFraction: 0.25, maxStakePct: 0.02, tiers: { micro: 0.0025, small: 0.005, standard: 0.01 }, ruinThreshold: 0.2 },
    shockPts: 3
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function merge(base, over) {
    var out = clone(base);
    (function rec(a, b) { for (var k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') rec(a[k], b[k]); else a[k] = b[k]; } })(out, over || {});
    return out;
  }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function num(x) { if (x === null || x === undefined || x === '') return null; var n = Number(x); return isFinite(n) ? n : null; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function safeDiv(a, b) { return (isNum(a) && isNum(b) && b !== 0) ? a / b : null; }
  function round(v, d) { if (!isNum(v)) return null; var m = Math.pow(10, d == null ? 2 : d); return Math.round(v * m) / m; }
  function mean(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }
  function variance(a) { if (a.length < 2) return null; var m = mean(a); return a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1); }
  function quantile(sorted, q) { if (!sorted.length) return null; var pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos); return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo); }

  // RNG déterministe (reproductibilité et tests)
  function hashSeed(str) { var h = 2166136261; str = String(str); for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gaussian(rng) { var u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function poissonSample(rng, lambda) { if (!(lambda > 0)) return 0; var L = Math.exp(-lambda), k = 0, p = 1; do { k++; p *= rng(); } while (p > L); return k - 1; }

  // Fraîcheur des données : GREEN RECENT / YELLOW AGING / RED STALE / UNKNOWN si pas de timestamp
  function freshness(ts, now, cfg) {
    var c = (cfg && cfg.freshness) || DEFAULT_CONFIG.freshness;
    var t = ts instanceof Date ? ts.getTime() : (isNum(ts) ? ts : Date.parse(ts));
    if (!isFinite(t)) return { status: 'UNKNOWN', color: 'grey', label: 'INCONNUE', ageHours: null };
    var n = now instanceof Date ? now.getTime() : (isNum(now) ? now : Date.now());
    var age = Math.max(0, (n - t) / 3600000);
    if (age <= c.greenHours) return { status: 'GREEN', color: 'green', label: 'RÉCENTE', ageHours: age };
    if (age <= c.yellowHours) return { status: 'YELLOW', color: 'yellow', label: 'VIEILLISSANTE', ageHours: age };
    return { status: 'RED', color: 'red', label: 'PÉRIMÉE', ageHours: age };
  }

  // Donnée tracée : valeur + source + timestamp + qualité + confiance
  function datum(value, meta) {
    meta = meta || {};
    var v = (value === undefined || value === '') ? null : value;
    return { value: v, source: meta.source || 'saisie utilisateur', timestamp: meta.timestamp || null,
      quality: meta.quality == null ? (v == null ? 0 : null) : meta.quality, confidence: meta.confidence == null ? null : meta.confidence,
      available: v != null, label: v == null ? 'DATA UNAVAILABLE' : null };
  }

  // Registre des modèles : ne jamais afficher actif un modèle inexistant
  var MODEL_STATUS = [
    { id: 'poisson', name: 'Poisson', sport: 'football', status: 'IMPLEMENTED', note: 'Matrice de scores 0–8 normalisée' },
    { id: 'dixon-coles', name: 'Dixon-Coles', sport: 'football', status: 'IMPLEMENTED', note: 'Correction τ sur 0-0/1-0/0-1/1-1, ρ configurable (pas estimé par maximum de vraisemblance)' },
    { id: 'elo', name: 'Elo', sport: 'football', status: 'PARTIAL', note: 'Probabilité de victoire Elo ; la probabilité de nul est une heuristique non calibrée' },
    { id: 'xg', name: 'xG', sport: 'football', status: 'PARTIAL', note: 'Actif seulement si xG/xGA par match sont fournis, sinon UNAVAILABLE' },
    { id: 'monte-carlo-fb', name: 'Monte Carlo football', sport: 'football', status: 'IMPLEMENTED', note: 'Simulation réellement exécutée (rejet τ/τmax), nombre de tirages configurable' },
    { id: 'bk-ratings', name: 'Basket ratings/pace', sport: 'basketball', status: 'IMPLEMENTED', note: 'Pace, ORtg, DRtg → points et marge attendus' },
    { id: 'monte-carlo-bk', name: 'Monte Carlo basket', sport: 'basketball', status: 'PARTIAL', note: 'Écarts-types provisoires tant que non estimés sur des matchs fournis' },
    { id: 'market', name: 'Benchmark marché', sport: 'both', status: 'IMPLEMENTED', note: 'Dévigage proportionnel ; n\'entre jamais dans P_MODEL' },
    { id: 'auto-discovery', name: 'Auto Discovery', sport: 'both', status: 'EXPERIMENTAL', note: 'Analyse exploratoire, aucun effet sur la production' },
    { id: 'player-impact', name: 'Impact joueur', sport: 'both', status: 'PARTIAL', note: 'Calculé seulement si les statistiques du joueur sont fournies, sinon INCONNU' }
  ];

  EA.core = { VERSION: VERSION, DEFAULT_CONFIG: DEFAULT_CONFIG, MODEL_STATUS: MODEL_STATUS, clone: clone, merge: merge, isNum: isNum, num: num, clamp: clamp,
    safeDiv: safeDiv, round: round, mean: mean, variance: variance, quantile: quantile, hashSeed: hashSeed, mulberry32: mulberry32, gaussian: gaussian,
    poissonSample: poissonSample, freshness: freshness, datum: datum };
  if (typeof module === 'object' && module.exports) module.exports = EA.core;
})(typeof window !== 'undefined' ? window : global);
