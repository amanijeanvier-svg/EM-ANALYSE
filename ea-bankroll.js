/* EA-VALUE 3.0 — BANKROLL ENGINE + SIMULATEUR. Informatif : aucun bénéfice futur n'est garanti. */
(function (g) {
  'use strict';
  if (typeof require === 'function' && typeof window === 'undefined') require('./ea-core.js');
  var EA = g.EA, C = EA.core;
  function kelly(p, odds) { if (!(p > 0 && p < 1 && odds > 1)) return 0; return Math.max(0, (p * odds - 1) / (odds - 1)); }
  // bankroll: nombre > 0 ; minStake: mise minimale du bookmaker (optionnelle)
  function suggestStake(o, cfg) {
    var b = (cfg || C.DEFAULT_CONFIG).bankroll, bank = C.num(o.bankroll), p = C.num(o.p), odds = C.num(o.odds), minStake = C.num(o.minStake);
    if (bank == null || bank <= 0) return { available: false, label: 'DATA UNAVAILABLE', reason: 'Bankroll non renseignée' };
    if (p == null || odds == null) return { available: false, label: 'DATA UNAVAILABLE', reason: 'Probabilité ou cote manquante' };
    var k = kelly(p, odds), cap = bank * b.maxStakePct, raw = bank * k * b.kellyFraction, stake = Math.min(raw, cap);
    var tooLarge = minStake != null && minStake > cap;
    var pct = stake / bank, tier = stake <= 0 ? 'AUCUNE' : pct <= b.tiers.micro + 1e-9 ? 'MICRO' : pct <= b.tiers.small + 1e-9 ? 'SMALL' : 'STANDARD';
    if (tooLarge) return { available: true, stake: 0, stakePct: 0, tier: 'AUCUNE', kelly: k, cap: cap, stakeOk: false, label: 'STAKE SIZE TOO LARGE', advice: 'NO BET / PAPER BET' };
    if (minStake != null && stake > 0 && stake < minStake) { stake = minStake; pct = stake / bank; tier = pct <= b.tiers.micro ? 'MICRO' : pct <= b.tiers.small ? 'SMALL' : 'STANDARD'; }
    return { available: true, stake: stake, stakePct: pct, tier: tier, kelly: k, cap: cap, stakeOk: true, label: stake > 0 ? 'MISE INDICATIVE' : 'PAS DE MISE (Kelly ≤ 0)', allIn: false };
  }
  function simulate(o, cfg) {
    var b = (cfg || C.DEFAULT_CONFIG).bankroll, sims = o.sims || 5000, n = o.nBets, p = o.winProb, odds = o.odds, pct = o.stakePct, bank0 = o.bankroll;
    if (![sims, n, p, odds, pct, bank0].every(C.isNum) || n < 1 || bank0 <= 0 || p < 0 || p > 1 || odds <= 1 || pct <= 0 || pct >= 1) return { available: false, label: 'DATA UNAVAILABLE', reason: 'Paramètres invalides' };
    var rng = o.seed != null ? C.mulberry32(C.hashSeed(o.seed)) : Math.random, finals = [], dds = [], streaks = [], ruin = 0, thr = bank0 * b.ruinThreshold;
    for (var s = 0; s < sims; s++) {
      var bank = bank0, peak = bank0, dd = 0, st = 0, ms = 0, ruined = false;
      for (var i = 0; i < n; i++) { var stake = bank * pct; if (rng() < p) { bank += stake * (odds - 1); st = 0; } else { bank -= stake; st++; if (st > ms) ms = st; }
        if (bank > peak) peak = bank; dd = Math.max(dd, (peak - bank) / peak); if (bank < thr) ruined = true; }
      finals.push(bank); dds.push(dd); streaks.push(ms); if (ruined) ruin++;
    }
    finals.sort(function (a, c2) { return a - c2; }); streaks.sort(function (a, c2) { return a - c2; });
    return { available: true, sims: sims, median: C.quantile(finals, 0.5), p10: C.quantile(finals, 0.1), p90: C.quantile(finals, 0.9), avgMaxDrawdown: C.mean(dds), medianLosingStreak: C.quantile(streaks, 0.5), p90LosingStreak: C.quantile(streaks, 0.9),
      riskOfRuin: ruin / sims, ruinDefinition: 'bankroll passée sous ' + Math.round(b.ruinThreshold * 100) + ' % du capital initial', negativeEV: p * odds - 1 < 0, banner: 'SIMULATION — NOT A GUARANTEE' };
  }
  EA.bankroll = { kelly: kelly, suggestStake: suggestStake, simulate: simulate };
  if (typeof module === 'object' && module.exports) module.exports = EA.bankroll;
})(typeof window !== 'undefined' ? window : global);
