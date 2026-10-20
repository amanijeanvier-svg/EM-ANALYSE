/* ===== js/ea-markets.js — EA GENESE MARKETS =====
   Catalogue complet des marchés football calculé par Genèse à partir d'UNE SEULE distribution de scores
   (matrice cohérente), règlement des marchés après le match, et aide à la construction des combinés.
   Module pur (aucun accès au DOM, au stockage ni à `index.html`) : testable seul avec Node.
   - Les probabilités viennent de la matrice de scores (Monte-Carlo / Dixon-Coles de Genèse), jamais d'un tirage aléatoire.
   - Le 1X2 final (modèle + tendances + recalibration), le BTTS et les lignes de buts sont imposés à la matrice par
     ajustement proportionnel itératif (IPF) : toutes les probabilités d'événements liés en découlent donc exactement.
   - Cote juste = 1 / probabilité. Ce n'est JAMAIS une cote bookmaker. */
(function (root) {
  'use strict';
  var VERSION = 'EA-MARKETS-1.0';
  var LINES = [0.5, 1.5, 2.5, 3.5, 4.5];
  var TEAM_LINES = [0.5, 1.5];
  var GRID = 9;                       // scores 0..8, comme simulateMonteCarloMatrix
  var LEG_MAX_P = 0.93;               // au-delà : cote quasi nulle, aucune information pour un combiné
  var EXTREME_LO = 0.03, EXTREME_HI = 0.97;

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function r4(x) { return Math.round(x * 10000) / 10000; }

  /* ---------- distribution de scores ---------- */
  function normalize(rows) {
    var s = 0, i; for (i = 0; i < rows.length; i++) s += rows[i].p;
    return rows.map(function (c) { return { a: c.a, b: c.b, p: c.p / (s || 1) }; });
  }
  // Complète la grille 0..8 x 0..8 (cellules jamais tirées = masse nulle, que l'ajustement ne pourrait pas relever).
  function toGrid(matrix, eps) {
    var map = {}, a, b;
    (matrix || []).forEach(function (c) { map[c.a + '-' + c.b] = (map[c.a + '-' + c.b] || 0) + c.p; });
    var rows = [];
    for (a = 0; a < GRID; a++) for (b = 0; b < GRID; b++) rows.push({ a: a, b: b, p: (map[a + '-' + b] || 0) + (eps || 0) });
    return normalize(rows);
  }
  function probOf(m, pred) { var s = 0, i; for (i = 0; i < m.length; i++) if (pred(m[i].a, m[i].b)) s += m[i].p; return s; }
  var P1 = function (a, b) { return a > b; }, PX = function (a, b) { return a === b; }, P2 = function (a, b) { return a < b; };
  function clsOf(a, b) { return a > b ? 'A' : a < b ? 'B' : 'draw'; }

  /* ---------- ajustement proportionnel itératif ---------- */
  // constraints : { kind:'multi', classes:[{id,pred,target}] } (partition) | { kind:'bin', id, pred, target }
  function fit(matrix, constraints, opts) {
    opts = opts || {};
    var maxIter = opts.maxIter || 400, tol = opts.tol || 1e-7;
    var m = toGrid(matrix, 1e-7), it, errs;
    function err() {
      var e = [];
      constraints.forEach(function (c) {
        if (c.kind === 'multi') c.classes.forEach(function (k) { e.push({ id: k.id, err: Math.abs(probOf(m, k.pred) - k.target) }); });
        else e.push({ id: c.id, err: Math.abs(probOf(m, c.pred) - c.target) });
      });
      return e;
    }
    for (it = 0; it < maxIter; it++) {
      constraints.forEach(function (c) {
        var i;
        if (c.kind === 'multi') {
          var cur = c.classes.map(function (k) { return probOf(m, k.pred); }), tsum = c.classes.reduce(function (s, k) { return s + k.target; }, 0) || 1;
          for (i = 0; i < m.length; i++) {
            for (var j = 0; j < c.classes.length; j++) if (c.classes[j].pred(m[i].a, m[i].b)) { if (cur[j] > 0) m[i].p *= (c.classes[j].target / tsum) / cur[j]; break; }
          }
        } else {
          var t = clamp(c.target, 0.002, 0.998), p = probOf(m, c.pred);
          if (p <= 0 || p >= 1) return;
          for (i = 0; i < m.length; i++) m[i].p *= c.pred(m[i].a, m[i].b) ? t / p : (1 - t) / (1 - p);
        }
        m = normalize(m);
      });
      errs = err();
      if (errs.every(function (e) { return e.err < tol; })) break;
    }
    errs = err();
    return { matrix: m, iterations: it, maxErr: errs.reduce(function (s, e) { return Math.max(s, e.err); }, 0), errors: errs };
  }

  /* ---------- événements ---------- */
  function evKey(ev) {
    if (!ev) return 'none';
    switch (ev.type) {
      case 'result1x2': return '1x2:' + ev.outcome;
      case 'resultDC': return 'dc:' + (ev.outcomes || []).slice().sort().join(',');
      case 'goalsLine': return 'gl:' + ev.op + ':' + ev.line;
      case 'btts': return 'btts:' + ev.side;
      case 'teamGoals': return 'tg:' + ev.team + ':' + ev.op + ':' + ev.line;
      case 'statLine': return 'st:' + ev.stat + ':' + ev.op + ':' + ev.line;
      default: return JSON.stringify(ev);
    }
  }
  // Test d'un événement sur un score (a = équipe A / domicile, b = équipe B / extérieur) ; null si non vérifiable.
  function evaluate(ev, a, b, stats) {
    if (!ev || a == null || b == null || !isFinite(a) || !isFinite(b)) return null;
    switch (ev.type) {
      case 'result1x2': return clsOf(a, b) === ev.outcome;
      case 'resultDC': return (ev.outcomes || []).indexOf(clsOf(a, b)) >= 0;
      case 'goalsLine': return ev.op === 'over' ? a + b > ev.line : a + b < ev.line;
      case 'btts': return ev.side === 'yes' ? (a >= 1 && b >= 1) : !(a >= 1 && b >= 1);
      case 'teamGoals': { var g = ev.team === 'A' ? a : b; return ev.op === 'over' ? g > ev.line : g < ev.line; }
      case 'statLine': {
        if (!stats || stats[ev.stat] == null || isNaN(stats[ev.stat])) return null;
        return ev.op === 'over' ? stats[ev.stat] > ev.line : stats[ev.stat] < ev.line;
      }
      default: return null;
    }
  }
  function predOf(ev) {   // prédicat sur un score pour les événements issus de la matrice de buts
    switch (ev.type) {
      case 'result1x2': return ev.outcome === 'A' ? P1 : ev.outcome === 'B' ? P2 : PX;
      case 'resultDC': return function (a, b) { return ev.outcomes.indexOf(clsOf(a, b)) >= 0; };
      case 'goalsLine': return ev.op === 'over' ? function (a, b) { return a + b > ev.line; } : function (a, b) { return a + b < ev.line; };
      case 'btts': return ev.side === 'yes' ? function (a, b) { return a >= 1 && b >= 1; } : function (a, b) { return !(a >= 1 && b >= 1); };
      case 'teamGoals': return function (a, b) { var g = ev.team === 'A' ? a : b; return ev.op === 'over' ? g > ev.line : g < ev.line; };
      default: return null;
    }
  }

  /* ---------- Poisson pour les marchés statistiques (corners / tirs cadrés / cartons) ---------- */
  function poissonOver(mean, line) {
    if (!(mean > 0)) return null;
    var k, p = Math.exp(-mean), cdf = 0, kmax = Math.floor(line);
    for (k = 0; k <= kmax; k++) { cdf += p; p *= mean / (k + 1); }
    return clamp(1 - cdf, 0, 1);
  }

  /* ---------- catalogue ---------- */
  function fmtLine(l) { return String(l); }
  function entry(id, family, label, p, ev, extra) {
    var e = { id: id, family: family, label: label, p: r4(clamp(p, 0, 1)), fair: p > 0 ? Math.round(100 / p) / 100 : null, eval: ev, marketType: marketTypeOf(ev),
      reliability: 'model', extreme: p < EXTREME_LO || p > EXTREME_HI, bookOdds: null, oddsSource: null, edgePts: null, ev: null };
    if (extra) for (var k in extra) e[k] = extra[k];
    return e;
  }
  function marketTypeOf(ev) {
    if (!ev) return 'non_classe';
    switch (ev.type) {
      case 'btts': return 'btts'; case 'resultDC': return 'double_chance'; case 'result1x2': return '1x2';
      case 'goalsLine': return 'over_under'; case 'teamGoals': return 'buts_equipe';
      case 'statLine': return ev.stat === 'corners' ? 'stat_corners' : ev.stat === 'shots' ? 'stat_shots' : ev.stat === 'cards' ? 'stat_cards' : 'non_classe';
      default: return 'non_classe';
    }
  }

  /* Construit le catalogue.
     o.matrix        : [{a,b,p}] matrice de scores de Genèse (obligatoire)
     o.nameA/nameB   : noms affichés
     o.final         : {pHome,pDraw,pAway} 1X2 final de Genèse (modèle + tendances) — imposé à la matrice
     o.bttsYes       : P(BTTS oui) final (tendances incluses), optionnel
     o.overs         : {"0.5":p,"1.5":p,...} P(plus de L buts) finale (tendances incluses), optionnel
     o.overrides     : [{eval,p}] paris retenus recalibrés par le suivi réel : leur probabilité est imposée à la distribution,
                       de sorte que l'événement lié (complément, double chance...) reste cohérent
     o.stats         : {corners:{a,b}, shots:{a,b}, cards:{a,b}} moyennes saisies (null/absent si indisponible) */
  function buildCatalog(o) {
    var A = o.nameA || 'A', B = o.nameB || 'B';
    var base = toGrid(o.matrix, 0);
    var f = o.final || {};
    var raw1 = probOf(base, P1), rawX = probOf(base, PX), raw2 = probOf(base, P2);
    var tgt = { A: isNum(f.pHome) ? f.pHome : raw1, draw: isNum(f.pDraw) ? f.pDraw : rawX, B: isNum(f.pAway) ? f.pAway : raw2 };
    var bin = {};   // clé -> {id,pred,target}
    var overrides = (o.overrides || []).filter(function (x) { return x && x.eval && isNum(x.p); });
    // cibles de base : lignes de buts et BTTS
    LINES.forEach(function (L) {
      var t = o.overs && isNum(o.overs[L]) ? o.overs[L] : probOf(base, function (a, b) { return a + b > L; });
      bin['gl:' + L] = { kind: 'bin', id: 'over' + L, pred: function (a, b) { return a + b > L; }, target: t };
    });
    bin['btts'] = { kind: 'bin', id: 'btts', pred: predOf({ type: 'btts', side: 'yes' }), target: isNum(o.bttsYes) ? o.bttsYes : probOf(base, predOf({ type: 'btts', side: 'yes' })) };
    // Un seul pari de résultat (le principal) impose le triplet 1X2 : une double chance « de remplissage » recalibrée à part
    // contredirait P(1)+P(X) ; elle est donc dérivée de la distribution finale (recalDropped), jamais imposée.
    var resultDone = false, dropped = [];
    overrides.forEach(function (x) {
      var ev = x.eval, p = x.p;
      if (ev.type === 'result1x2' || ev.type === 'resultDC') {
        if (resultDone) { dropped.push(evKey(ev)); return; }
        resultDone = true;
        var members = ev.type === 'result1x2' ? [ev.outcome] : ev.outcomes, tp = clamp(p, 0.01, 0.97);
        var others = ['A', 'draw', 'B'].filter(function (k) { return members.indexOf(k) < 0; });
        var sm = members.reduce(function (s, k) { return s + tgt[k]; }, 0), so = others.reduce(function (s, k) { return s + tgt[k]; }, 0);
        members.forEach(function (k) { tgt[k] = sm > 0 ? tgt[k] * tp / sm : tp / members.length; });
        others.forEach(function (k) { tgt[k] = so > 0 ? tgt[k] * (1 - tp) / so : (1 - tp) / Math.max(1, others.length); });
      } else if (ev.type === 'goalsLine' && ev.line >= 0.5 && ev.line <= 4.5 && bin['gl:' + ev.line]) {
        bin['gl:' + ev.line].target = ev.op === 'over' ? p : 1 - p;
      } else if (ev.type === 'btts') {
        bin['btts'].target = ev.side === 'yes' ? p : 1 - p;
      }
    });
    var cons = [{ kind: 'multi', classes: [{ id: '1', pred: P1, target: tgt.A }, { id: 'X', pred: PX, target: tgt.draw }, { id: '2', pred: P2, target: tgt.B }] }];
    Object.keys(bin).forEach(function (k) { cons.push(bin[k]); });
    var res = fit(base, cons, { maxIter: 500, tol: 1e-7 });
    var M = res.matrix;
    var P = function (ev) { return probOf(M, predOf(ev)); };
    var out = [];
    // A. résultat
    out.push(entry('1x2:home', '1X2', 'Victoire ' + A + ' (1)', probOf(M, P1), { type: 'result1x2', outcome: 'A' }));
    out.push(entry('1x2:draw', '1X2', 'Match nul (X)', probOf(M, PX), { type: 'result1x2', outcome: 'draw' }));
    out.push(entry('1x2:away', '1X2', 'Victoire ' + B + ' (2)', probOf(M, P2), { type: 'result1x2', outcome: 'B' }));
    out.push(entry('dc:1x', 'DC', A + ' ou nul (1X)', P({ type: 'resultDC', outcomes: ['A', 'draw'] }), { type: 'resultDC', outcomes: ['A', 'draw'] }));
    out.push(entry('dc:x2', 'DC', 'Nul ou ' + B + ' (X2)', P({ type: 'resultDC', outcomes: ['draw', 'B'] }), { type: 'resultDC', outcomes: ['draw', 'B'] }));
    out.push(entry('dc:12', 'DC', A + ' ou ' + B + ' (12)', P({ type: 'resultDC', outcomes: ['A', 'B'] }), { type: 'resultDC', outcomes: ['A', 'B'] }));
    // B. total de buts
    LINES.forEach(function (L) {
      var ov = P({ type: 'goalsLine', op: 'over', line: L }), un = P({ type: 'goalsLine', op: 'under', line: L });
      out.push(entry('tot:over:' + L, 'TOTAL', 'Plus de ' + fmtLine(L) + ' buts', ov, { type: 'goalsLine', op: 'over', line: L }));
      out.push(entry('tot:under:' + L, 'TOTAL', 'Moins de ' + fmtLine(L) + ' buts', un, { type: 'goalsLine', op: 'under', line: L }));
    });
    // C. buts par équipe
    [['A', A, 'home'], ['B', B, 'away']].forEach(function (t) {
      TEAM_LINES.forEach(function (L) {
        var evO = { type: 'teamGoals', team: t[0], op: 'over', line: L }, evU = { type: 'teamGoals', team: t[0], op: 'under', line: L };
        out.push(entry('team:' + t[2] + ':over:' + L, 'TEAM', t[1] + ' : plus de ' + fmtLine(L) + (L < 1 ? ' but' : ' buts'), P(evO), evO));
        out.push(entry('team:' + t[2] + ':under:' + L, 'TEAM', t[1] + ' : moins de ' + fmtLine(L) + (L < 1 ? ' but' : ' buts'), P(evU), evU));
      });
    });
    // D. BTTS
    out.push(entry('btts:yes', 'BTTS', 'Les deux équipes marquent : oui', P({ type: 'btts', side: 'yes' }), { type: 'btts', side: 'yes' }));
    out.push(entry('btts:no', 'BTTS', 'Les deux équipes marquent : non', P({ type: 'btts', side: 'no' }), { type: 'btts', side: 'no' }));
    // E. marchés statistiques : uniquement si des moyennes ont réellement été saisies
    var unavailable = [];
    [['corners', 'corners', 'corners', 6.5], ['shots', 'tirs cadrés', 'tirs cadrés (cumulés)', 5.5], ['cards', 'cartons', 'cartons', 3.5]].forEach(function (s) {
      var st = o.stats && o.stats[s[0]];
      if (!st || !isNum(st.a) || !isNum(st.b)) { unavailable.push({ family: 'STAT', market: s[1], reason: 'moyennes de ' + s[1] + ' non saisies pour les deux équipes : marché non calculable de façon fiable' }); return; }
      var total = st.a + st.b, base0 = Math.max(s[3], Math.floor(total) - 0.5), lines = [base0 - 1, base0, base0 + 1].filter(function (l) { return l >= s[3] - 1 && l > 0; });
      lines.forEach(function (L) {
        var po = poissonOver(total, L); if (po == null) return;
        out.push(entry('stat:' + s[0] + ':over:' + L, 'STAT', 'Plus de ' + L + ' ' + s[2], po, { type: 'statLine', stat: s[0], op: 'over', line: L }, { reliability: 'stat', note: 'Poisson sur la somme des moyennes saisies, sans variance observée : fiabilité limitée' }));
        out.push(entry('stat:' + s[0] + ':under:' + L, 'STAT', 'Moins de ' + L + ' ' + s[2], 1 - po, { type: 'statLine', stat: s[0], op: 'under', line: L }, { reliability: 'stat', note: 'Poisson sur la somme des moyennes saisies, sans variance observée : fiabilité limitée' }));
      });
    });
    return { markets: out, unavailable: unavailable, fit: { iterations: res.iterations, maxErr: res.maxErr, recalDropped: dropped }, matrix: M, version: VERSION };
  }

  // Contrôle de cohérence mathématique du catalogue (aucune correction : il signale seulement).
  function audit(markets) {
    var by = {}, issues = [], tol = 0.0021;
    markets.forEach(function (m) { by[m.id] = m; });
    function chk(name, ok, detail) { if (!ok) issues.push(name + (detail ? ' (' + detail + ')' : '')); }
    markets.forEach(function (m) { chk('p hors [0,1] : ' + m.id, m.p >= 0 && m.p <= 1); });
    var s = by['1x2:home'].p + by['1x2:draw'].p + by['1x2:away'].p;
    chk('1+X+2 ≠ 100 %', Math.abs(s - 1) < tol, s.toFixed(4));
    chk('1X ≠ P(1)+P(X)', Math.abs(by['dc:1x'].p - (by['1x2:home'].p + by['1x2:draw'].p)) < tol);
    chk('X2 ≠ P(X)+P(2)', Math.abs(by['dc:x2'].p - (by['1x2:draw'].p + by['1x2:away'].p)) < tol);
    chk('12 ≠ P(1)+P(2)', Math.abs(by['dc:12'].p - (by['1x2:home'].p + by['1x2:away'].p)) < tol);
    LINES.forEach(function (L) { chk('Over+Under ≠ 100 % ligne ' + L, Math.abs(by['tot:over:' + L].p + by['tot:under:' + L].p - 1) < tol); });
    for (var i = 1; i < LINES.length; i++) chk('P(plus de ' + LINES[i] + ') > P(plus de ' + LINES[i - 1] + ')', by['tot:over:' + LINES[i]].p <= by['tot:over:' + LINES[i - 1]].p + 1e-9);
    ['home', 'away'].forEach(function (t) { TEAM_LINES.forEach(function (L) { chk('Over+Under équipe ' + t + ' ' + L, Math.abs(by['team:' + t + ':over:' + L].p + by['team:' + t + ':under:' + L].p - 1) < tol); }); });
    chk('BTTS oui+non ≠ 100 %', Math.abs(by['btts:yes'].p + by['btts:no'].p - 1) < tol);
    // lien buts équipes / BTTS : P(BTTS oui) ≤ min(P(A>0.5), P(B>0.5))
    chk('BTTS oui > P(équipe marque)', by['btts:yes'].p <= Math.min(by['team:home:over:0.5'].p, by['team:away:over:0.5'].p) + 1e-9);
    chk('Over 0.5 < P(au moins une équipe marque)', by['tot:over:0.5'].p + 1e-9 >= Math.max(by['team:home:over:0.5'].p, by['team:away:over:0.5'].p));
    return { ok: issues.length === 0, issues: issues };
  }

  /* ---------- cotes bookmaker (jamais mélangées avec la cote juste) ---------- */
  // odds1x2 : {home,draw,away} saisis par l'utilisateur ; entered : {evKey: cote} saisies sur les cartes ou le catalogue.
  function oddsFor(ev, odds1x2, entered) {
    var k = evKey(ev);
    if (entered && isNum(entered[k]) && entered[k] > 1) return { cote: entered[k], source: 'bookmaker' };
    if (odds1x2 && ev) {
      var o = { A: odds1x2.home, B: odds1x2.away, draw: odds1x2.draw };
      if (ev.type === 'result1x2' && o[ev.outcome] > 1) return { cote: o[ev.outcome], source: 'bookmaker' };
      if (ev.type === 'resultDC' && ev.outcomes.length === 2) {
        var o1 = o[ev.outcomes[0]], o2 = o[ev.outcomes[1]];
        if (o1 > 1 && o2 > 1) return { cote: Math.round(100 / (1 / o1 + 1 / o2)) / 100, source: 'bookmaker' };
      }
    }
    return null;
  }
  function attachOdds(markets, odds1x2, entered) {
    markets.forEach(function (m) {
      var o = oddsFor(m.eval, odds1x2, entered);
      if (o) { m.bookOdds = o.cote; m.oddsSource = o.source; m.edgePts = Math.round((m.p - 1 / o.cote) * 1000) / 10; m.ev = Math.round((m.p * o.cote - 1) * 1000) / 1000; }
      else { m.bookOdds = null; m.oddsSource = null; m.edgePts = null; m.ev = null; }
    });
    return markets;
  }

  /* ---------- règlement ---------- */
  function settle(markets, a, b, stats) {
    var out = {};
    (markets || []).forEach(function (m) { out[m.id] = evaluate(m.eval, a, b, stats); });
    return out;
  }

  /* ---------- combinés ---------- */
  var BANDS = {
    faible: { wanted: 4, lo: 0.75, hi: LEG_MAX_P, wlo: 0.68, whi: LEG_MAX_P },
    modere: { wanted: 5, lo: 0.55, hi: 0.75, wlo: 0.50, whi: 0.80 },
    eleve:  { wanted: 4, lo: 0.35, hi: 0.55, wlo: 0.30, whi: 0.60 }
  };
  function inBand(risk, p, widened) {
    var b = BANDS[risk]; if (!b || !isNum(p)) return false;
    var lo = widened ? b.wlo : b.lo, hi = widened ? b.whi : b.hi;
    return p >= lo && (risk === 'faible' ? p <= hi : p < hi) && p <= LEG_MAX_P;
  }
  // Limites de données d'un enregistrement Genèse, déduites du profil enregistré (ishikawa) — jamais inventées.
  function dataLimits(rec) {
    var L = [], i = rec && rec.ishikawa;
    if (!i) return ['profil de qualité des données non enregistré (ancienne analyse)'];
    if (!i.histo) L.push('séries de forme / domicile-extérieur incomplètes');
    if (!i.h2h) L.push('pas de face-à-face');
    if (!i.classement) L.push('classement non saisi');
    if (!i.force) L.push('Elo non saisi');
    if (!i.avancees) L.push('pas de xG / tirs');
    if (!i.marche) L.push('pas de cotes bookmaker 1/N/2');
    return L;
  }
  function hasNoData(rec) { var i = rec && rec.ishikawa; return !!i && !i.histo && !i.h2h && !i.classement && !i.force && !i.avancees; }
  function dedupeKey(l) { return evKey(l.eval); }

  // Jambes candidates d'un enregistrement : paris retenus + catalogue (marchés « model » seulement), sans doublon d'événement.
  function poolFromRecord(rec, helpers) {
    helpers = helpers || {};
    var seen = {}, pool = [];
    function add(src, id, label, p, ev, extra) {
      if (!isNum(p) || !ev) return;
      var k = evKey(ev); if (seen[k]) return; seen[k] = 1;
      var o = oddsFor(ev, rec.odds, extra && extra.entered);
      var cote = o ? o.cote : (p > 0 ? 1 / p : null);
      pool.push({ matchKey: rec.id, nameA: rec.nameA, nameB: rec.nameB, id: id, label: label, p: p, eval: ev, marketType: (helpers.marketType ? helpers.marketType(ev) : marketTypeOf(ev)), source: src,
        cote: cote, oddsSource: o ? o.source : 'interne', recTs: rec.timestamp, reliability: (extra && extra.reliability) || 'model' });
    }
    (rec.bets || []).forEach(function (b, i) {
      var entered = {}; if (isNum(b.odds) && b.odds > 1 && b.eval) entered[evKey(b.eval)] = b.odds;
      add('pari retenu', 'bet:' + i, b.label, b.p, b.eval, { entered: entered, reliability: (b.eval && b.eval.type === 'statLine') ? 'stat' : 'model' });
    });
    (rec.markets || []).forEach(function (m) {
      if (m.reliability !== 'model' || m.extreme) return;
      var entered = {}; if (isNum(m.bookOdds) && m.bookOdds > 1 && m.oddsSource === 'bookmaker') entered[evKey(m.eval)] = m.bookOdds;
      add('catalogue', m.id, m.label, m.p, m.eval, { entered: entered });
    });
    return pool;
  }
  function jointProb(legs) { return legs.reduce(function (acc, l) { return acc * l.p; }, 1); }
  function totalOdds(legs) {
    var allBook = legs.every(function (l) { return l.oddsSource === 'bookmaker'; }), anyBook = legs.some(function (l) { return l.oddsSource === 'bookmaker'; });
    return { odds: legs.reduce(function (acc, l) { return acc * (l.cote != null ? l.cote : (l.p > 0 ? 1 / l.p : 1)); }, 1), provenance: allBook ? 'bookmaker' : anyBook ? 'mixte' : 'modele' };
  }

  function probEval(matrix, ev) { var pr = predOf(ev); return pr ? probOf(matrix, pr) : null; }
  var api = { probEval: probEval, VERSION: VERSION, LINES: LINES, TEAM_LINES: TEAM_LINES, LEG_MAX_P: LEG_MAX_P, BANDS: BANDS, fit: fit, toGrid: toGrid, probOf: probOf, buildCatalog: buildCatalog, audit: audit,
    attachOdds: attachOdds, oddsFor: oddsFor, evKey: evKey, evaluate: evaluate, settle: settle, marketTypeOf: marketTypeOf, inBand: inBand, dataLimits: dataLimits, hasNoData: hasNoData,
    poolFromRecord: poolFromRecord, jointProb: jointProb, totalOdds: totalOdds, poissonOver: poissonOver };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.EAM = api;
  if (root.EA) root.EA.markets = api;
})(typeof window !== 'undefined' ? window : globalThis);
