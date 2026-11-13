/* ===== js/ea-euro.js — EA EURO CONTEXT =====
   Contexte des matchs de coupe d'Europe (Ligue des champions / Europa / Conférence) :
   0. Fonctionne pour TOUS les matchs de football (championnat, coupe nationale, Europe).
   1. ROTATION probable (match important dans les jours qui suivent) — correction déclarative et plafonnée.
   2. ENJEU : 10 situations réelles (titre, maintien, derby, couperet, crise…) pondérées par leur GRAVITÉ (1 à 5) — correction déclarative et plafonnée.
   3. POIDS des matchs de la compétition PAR ÉQUIPE, avec rétrécissement (plafond 55 %), et RECADRAGE des scores de championnat par
      l'Elo, ou à défaut par le niveau du championnat (grand / bon / moyen / modeste) : une équipe en méforme dans un grand championnat
      n'est pas aussi faible qu'une équipe en forme d'un championnat modeste.
   4. VERDICT « aucune valeur » : sortie claire quand rien ne dépasse l'incertitude du modèle (ou qu'aucune cote n'est saisie).
   Module pur (aucun DOM) : testable avec Node. Aucune donnée n'est inventée : un champ vide = aucun effet. */
(function (root) {
  'use strict';
  var VERSION = 'EA-EURO-CONTEXT-1.0';
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  // Multiplicateurs sur les buts marqués (att) et encaissés (conc) de l'équipe concernée. Volontairement modestes :
  // ce sont des nudges transparents, jamais dominants (même philosophie que le curseur de fatigue de Genèse).
  var ROTATION = {
    '':        { att: 1,     conc: 1,     unc: 0,   label: 'Aucune rotation déclarée' },
    'legere':  { att: 0.985, conc: 1.010, unc: 0.5, label: 'Rotation légère probable (2-3 changements)' },
    'forte':   { att: 0.955, conc: 1.030, unc: 1.5, label: 'Grosse rotation probable (5 changements ou plus)' }
  };
  // ENJEU : situations réelles, chacune avec une GRAVITÉ de 1 à 5. L'effet appliqué = effet « maximal » × gravité / 5
  // (att / conc = écart relatif sur les buts marqués / encaissés de l'équipe ; unc = élargissement de l'incertitude en points).
  // Réglages prudents choisis, non calibrés sur historique : à recalibrer avec assez de matchs vérifiés.
  var STAKE = {
    '':            { sev: 0, att: 0,      conc: 0,     unc: 0,   label: 'Enjeu non précisé' },
    'course':      { sev: 0, att: 0,      conc: 0,     unc: 0,   label: 'Enjeu normal (aucune situation particulière)' },
    'derby':       { sev: 3, att: 0,      conc: 0,     unc: 2.5, label: 'Derby / grande rivalité (résultat moins prévisible)' },
    'europe':      { sev: 3, att: 0.015,  conc: 0,     unc: 0.5, label: 'Course à une place européenne / à la qualification' },
    'titre':       { sev: 4, att: 0.015,  conc: -0.01, unc: 0.5, label: 'Course au titre / à la 1re place' },
    'maintien':    { sev: 5, att: 0.015,  conc: 0.02,  unc: 1.5, label: 'Lutte pour le maintien, match vital' },
    'danger':      { sev: 4, att: 0.02,   conc: 0.02,  unc: 1,   label: 'Doit absolument gagner (sinon éliminé / quasi condamné)' },
    'couperet':    { sev: 5, att: 0,      conc: -0.02, unc: 1.5, label: 'Match couperet : élimination directe, barrage ou finale' },
    'crise':       { sev: 3, att: -0.02,  conc: 0.02,  unc: 1.5, label: 'Crise : série noire, entraîneur ou vestiaire sous pression' },
    'nouveau_coach':{ sev: 2, att: 0.01,  conc: 0,     unc: 2,   label: 'Premier match avec un nouvel entraîneur' },
    'qualifie':    { sev: 3, att: -0.025, conc: 0.015, unc: 1,   label: 'Objectif déjà atteint (titre, qualification ou maintien acquis)' },
    'rien':        { sev: 3, att: -0.03,  conc: 0.02,  unc: 1.5, label: 'Plus rien à jouer (milieu de tableau, fin de saison)' }
  };
  var STAKE_ORDER = ['', 'course', 'derby', 'europe', 'titre', 'maintien', 'danger', 'couperet', 'crise', 'nouveau_coach', 'qualifie', 'rien'];
  function stakeOptionLabel(k) { var s = STAKE[k]; return s ? (s.label + (s.sev ? ' — gravité ' + s.sev + '/5' : '')) : k; }
  var CAP = { attMin: 0.93, attMax: 1.03, concMin: 0.98, concMax: 1.045 };

  // side = {rotation:'', stake:''} ; renvoie les multiplicateurs combinés, plafonnés, et leur justification.
  function contextMult(side) {
    side = side || {};
    var r = ROTATION[side.rotation || ''] || ROTATION[''], s = STAKE[side.stake || ''] || STAKE[''];
    var k = (s.sev || 0) / 5, sAtt = 1 + s.att * k, sConc = 1 + s.conc * k;
    var att = clamp(r.att * sAtt, CAP.attMin, CAP.attMax), conc = clamp(r.conc * sConc, CAP.concMin, CAP.concMax);
    var notes = [];
    if (side.rotation) notes.push(r.label);
    if (side.stake && side.stake !== 'course') notes.push(s.label + ' (gravité ' + s.sev + '/5)');
    return { att: att, conc: conc, uncPts: r.unc + s.unc, notes: notes, active: att !== 1 || conc !== 1 };
  }

  // Poids des matchs de la compétition dans les buts attendus d'UNE équipe, avec rétrécissement : 55 % max, croissance lente.
  // 1 match ≈ 14 % · 2 ≈ 22 % · 4 ≈ 31 % · 8 ≈ 40 %. Peu de matchs européens (souvent 2 à 4) contre beaucoup de matchs de championnat :
  // le championnat reste la base, l'Elo / le niveau du championnat le recadrent. 0 match = 0 % (jamais de poids emprunté à l'autre équipe).
  function euroWeight(n) { return isNum(n) && n > 0 ? 0.55 * n / (n + 3) : 0; }

  /* ---------- NIVEAU DU CHAMPIONNAT → repère d'Elo, quand l'Elo réel n'est pas saisi ---------- */
  // Valeurs d'ORIENTATION (hiérarchie générale des championnats européens), pas des Elo mesurés : elles servent uniquement à recadrer
  // les scores de championnat quand l'Elo réel manque, avec une pondération réduite, et sont remplacées dès que l'Elo est saisi.
  var LEAGUE_TIERS = {
    '':   { base: null, label: 'Non précisé' },
    'T1': { base: 1800, label: 'Grand championnat (Angleterre, Espagne, Allemagne, Italie, France)' },
    'T2': { base: 1650, label: 'Bon championnat (Pays-Bas, Portugal, Belgique, Turquie, Écosse…)' },
    'T3': { base: 1550, label: 'Championnat moyen (Autriche, Suisse, Grèce, Danemark, Tchéquie, Croatie, Serbie, Norvège…)' },
    'T4': { base: 1450, label: 'Championnat modeste (Bulgarie, Israël, Chypre, Kazakhstan, Azerbaïdjan, Moldavie…)' }
  };
  var TIER_ORDER = ['', 'T1', 'T2', 'T3', 'T4'];
  var ANCHOR_APPROX = 0.50;     // poids de l'ancrage Elo quand au moins un Elo vient du niveau du championnat (contre 0,70 à 0,80 avec Elo saisis)
  // Repère d'Elo = base du championnat ± 120 selon le rang dans ce championnat (1er = +120, dernier = −120) si rang et nombre d'équipes sont saisis.
  function tierElo(tier, rank, total) {
    var t = LEAGUE_TIERS[tier || '']; if (!t || t.base == null) return null;
    var adj = (isNum(rank) && isNum(total) && total >= 4 && rank >= 1 && rank <= total) ? 120 * (1 - 2 * (rank - 1) / (total - 1)) : 0;
    return { elo: Math.round(t.base + adj), base: t.base, adj: Math.round(adj), approx: true };
  }
  // Elo saisi prioritaire ; sinon repère issu du niveau du championnat ; sinon rien (aucun recadrage inventé).
  function resolveElo(o) {
    o = o || {};
    var mA = isNum(o.eloA) ? o.eloA : null, mB = isNum(o.eloB) ? o.eloB : null;
    var tA = mA == null ? tierElo(o.tierA, o.rankA, o.totalTeams) : null, tB = mB == null ? tierElo(o.tierB, o.rankB, o.totalTeams) : null;
    var eloA = mA != null ? mA : (tA ? tA.elo : null), eloB = mB != null ? mB : (tB ? tB.elo : null);
    if (eloA == null || eloB == null) return { eloA: null, eloB: null, source: null, approx: false };
    var aApprox = mA == null, bApprox = mB == null;
    return { eloA: eloA, eloB: eloB, source: (!aApprox && !bApprox) ? 'saisi' : (aApprox && bApprox) ? 'niveau' : 'mixte', approx: aApprox || bApprox, tierInfoA: tA, tierInfoB: tB };
  }

  // Verdict global « valeur » à partir de paris portant une cote bookmaker SAISIE.
  // items : [{label, p, odds, decision, ev, edgePts, uncertaintyHalf}] (decision = sortie du moteur de valeur : NO_BET/VALUE/STRONG_VALUE/BET)
  function valueGate(items) {
    items = items || [];
    var withOdds = items.filter(function (x) { return isNum(x.odds) && x.odds > 1; });
    if (!withOdds.length) return { state: 'SANS_COTE', title: 'Valeur : impossible à juger sans cote', lines: ['Aucune cote bookmaker saisie : le modèle donne des probabilités et des cotes justes, mais ne peut pas dire s\'il existe de la valeur.', 'Saisissez la cote réelle d\'un pari (carte ou catalogue) pour obtenir edge, EV et décision.'], candidates: [] };
    var cands = withOdds.filter(function (x) { return x.decision && x.decision !== 'NO_BET' && x.decision !== 'NO_DATA'; });
    if (!cands.length) {
      var lines = withOdds.map(function (x) {
        var why = [];
        if (isNum(x.ev) && x.ev < 0) why.push('EV négative');
        else if (isNum(x.ev) && x.ev < 0.05) why.push('edge trop fin');
        if (isNum(x.uncertaintyHalf) && isNum(x.edgePts) && x.edgePts <= x.uncertaintyHalf) why.push('écart dans l\'incertitude du modèle (±' + x.uncertaintyHalf.toFixed(1) + ' pts)');
        if (isNum(x.ev) && x.ev > 0.12) why.push('écart trop grand : anomalie à vérifier');
        return x.label + ' @' + x.odds + ' : ' + (why.join(' · ') || 'contrôles du moteur non passés');
      });
      return { state: 'AUCUNE_VALEUR', title: 'Aucune valeur détectée : pas de pari', lines: lines, candidates: [] };
    }
    return { state: 'VALEUR_POSSIBLE', title: 'Valeur possible à vérifier', lines: cands.map(function (x) { return x.label + ' @' + x.odds + ' : ' + x.decision + (isNum(x.ev) ? ' · EV ' + (x.ev * 100).toFixed(1) + ' %' : ''); }), candidates: cands };
  }

  var api = { LEAGUE_TIERS: LEAGUE_TIERS, TIER_ORDER: TIER_ORDER, ANCHOR_APPROX: ANCHOR_APPROX, tierElo: tierElo, resolveElo: resolveElo, VERSION: VERSION, ROTATION: ROTATION, STAKE: STAKE, STAKE_ORDER: STAKE_ORDER, stakeOptionLabel: stakeOptionLabel, CAP: CAP, contextMult: contextMult, euroWeight: euroWeight, valueGate: valueGate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.EAE = api;
  if (root.EA) root.EA.euro = api;
})(typeof window !== 'undefined' ? window : globalThis);
