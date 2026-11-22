/* ===== js/ea-fiche.js — EA FICHE DE MATCH =====
   Met en forme un match analysé comme une fiche : deux scores prédits, fourchette de corners, « les deux marquent » VALIDÉ par l'historique,
   vainqueur, fourchette de tirs cadrés, et les SEULES probabilités V1 / X / V2.
   - Fourchettes corners / tirs cadrés : l'estimation de l'application est retrouvée à partir de sa propre ligne (ex. « moins de 11,5 corners » à telle
     probabilité) ; la fourchette est la zone de 3 valeurs la plus probable. Aucun chiffre n'est inventé : sans donnée, « non analysé ».
   - BTTS : le pourcentage du modèle ne suffit pas. Le verdict croise le modèle avec les tendances du dossier, l'historique des deux équipes et du
     championnat dans TOUS les matchs déjà réglés du système, les confrontations directes et la fiabilité passée de l'application à ce niveau de probabilité.
   Module pur (aucun DOM, aucun stockage) : testable avec Node. */
(function (root) {
  'use strict';
  var VERSION = 'EA-FICHE-1.0';
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- Poisson : retrouver l'estimation de l'application à partir de sa ligne ---------- */
  function pmf(mean, k) { var p = Math.exp(-mean), i; for (i = 1; i <= k; i++) p *= mean / i; return p; }
  function pOver(mean, line) { var s = 0, k, kmax = Math.floor(line); for (k = 0; k <= kmax; k++) s += pmf(mean, k); return clamp(1 - s, 0, 1); }
  // P(X > ligne) = pOverTarget  →  moyenne (bissection). Null si la probabilité est trop extrême pour être informative.
  function meanFromLine(line, pOverTarget) {
    if (!isNum(line) || !isNum(pOverTarget) || pOverTarget < 0.03 || pOverTarget > 0.97) return null;
    var lo = 0.2, hi = 80, i, mid;
    for (i = 0; i < 60; i++) { mid = (lo + hi) / 2; if (pOver(mid, line) < pOverTarget) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  // Zone de `width` valeurs consécutives la plus probable (ex. 8–10 pour une moyenne de 9).
  function modalWindow(mean, width) {
    width = width || 3; var best = null, k, j, m;
    for (k = 0; k <= Math.ceil(mean * 2 + 5); k++) { m = 0; for (j = 0; j < width; j++) m += pmf(mean, k + j); if (!best || m > best.mass) best = { lo: k, hi: k + width - 1, mass: m }; }
    return best;
  }
  function statFromBets(bets, stat) {
    var b = (bets || []).filter(function (x) { return x && x.eval && x.eval.type === 'statLine' && x.eval.stat === stat && isNum(x.p); })[0];
    if (!b) return null;
    var po = b.eval.op === 'over' ? b.p : 1 - b.p, mean = meanFromLine(b.eval.line, po);
    return mean == null ? null : { mean: mean, fromLine: b.eval.line };
  }
  function statBlock(mean, fromLine) {
    if (!isNum(mean) || mean <= 0) return null;
    var w = modalWindow(mean, 3); return { mean: Math.round(mean * 10) / 10, lo: w.lo, hi: w.hi, fromLine: fromLine == null ? null : fromLine };
  }

  /* ---------- scores et 1X2 à partir des buts attendus (reconstruction des anciens matchs) ---------- */
  function scoreBoard(lamA, lamB) {
    var rho = -0.06, rows = [], a, b, s = 0, h = 0, d = 0, w = 0;
    for (a = 0; a < 10; a++) for (b = 0; b < 10; b++) {
      var p = pmf(lamA, a) * pmf(lamB, b);
      if (a === 0 && b === 0) p *= 1 - lamA * lamB * rho; else if (a === 0 && b === 1) p *= 1 + lamA * rho; else if (a === 1 && b === 0) p *= 1 + lamB * rho; else if (a === 1 && b === 1) p *= 1 - rho;
      rows.push({ a: a, b: b, p: p }); s += p;
    }
    rows.forEach(function (r) { r.p /= s; if (r.a > r.b) h += r.p; else if (r.a === r.b) d += r.p; else w += r.p; });
    rows.sort(function (x, y) { return y.p - x.p; });
    return { top: rows.slice(0, 2).map(function (r) { return { a: r.a, b: r.b }; }), probs: { h: h, d: d, a: w } };
  }

  /* ---------- fiche ---------- */
  function winnerOf(probs, nameA, nameB) {
    var m = Math.max(probs.h, probs.d, probs.a), side = m === probs.h ? 'A' : m === probs.a ? 'B' : 'draw';
    return { side: side, name: side === 'A' ? nameA : side === 'B' ? nameB : 'Match nul', net: m >= 0.5 ? 'net' : m >= 0.4 ? 'léger' : 'incertain' };
  }
  function pOf(markets, id) { var m = (markets || []).filter(function (x) { return x.id === id; })[0]; return m ? m.p : null; }
  // rec : enregistrement Genèse ; extra : { bttsTrend, stats:{corners,shots,cards (moyennes de total)} }
  function buildFiche(rec, extra) {
    extra = extra || rec.ficheExtra || {};
    var markets = rec.markets || [], h = pOf(markets, '1x2:home'), d = pOf(markets, '1x2:draw'), a = pOf(markets, '1x2:away'), sb = null;
    if (!isNum(h) || !isNum(d) || !isNum(a)) { sb = scoreBoard(rec.lambdaA, rec.lambdaB); h = sb.probs.h; d = sb.probs.d; a = sb.probs.a; }
    var scores = (rec.topScores || []).slice(0, 2).map(function (t) { return t.eval ? { a: t.eval.a, b: t.eval.b } : null; }).filter(Boolean);
    if (scores.length < 2) { sb = sb || scoreBoard(rec.lambdaA, rec.lambdaB); scores = sb.top; }
    var st = extra.stats || {}, cb = isNum(st.corners) ? { mean: st.corners, fromLine: null } : statFromBets(rec.bets, 'corners'), sh = isNum(st.shots) ? { mean: st.shots, fromLine: null } : statFromBets(rec.bets, 'shots');
    var pYes = pOf(markets, 'btts:yes');
    if (!isNum(pYes)) { var bb = (rec.bets || []).filter(function (x) { return x.eval && x.eval.type === 'btts'; })[0]; if (bb) pYes = bb.eval.side === 'yes' ? bb.p : 1 - bb.p; }
    return {
      id: rec.id, ts: rec.timestamp, sport: 'football', nameA: rec.nameA, nameB: rec.nameB, league: rec.league || '',
      scores: scores, probs: { h: h, d: d, a: a }, winner: winnerOf({ h: h, d: d, a: a }, rec.nameA, rec.nameB),
      corners: cb ? statBlock(cb.mean, cb.fromLine) : null, shots: sh ? statBlock(sh.mean, sh.fromLine) : null,
      btts: { pYes: isNum(pYes) ? pYes : null, trend: extra.bttsTrend || null }, lamA: rec.lambdaA, lamB: rec.lambdaB,
      final: rec.finalScore ? { a: rec.finalScore.a, b: rec.finalScore.b, stats: rec.finalStats || null } : null, approx: false
    };
  }
  // Ancien match réglé (TRACK) sans fiche enregistrée : reconstruit à partir de ses buts attendus et de ses évaluations — signalé « reconstruit ».
  function fromTrack(e) {
    var sb = scoreBoard(e.lambdaA, e.lambdaB), ev = e.evaluations || [], parse = function (re, stat) {
      var x = ev.filter(function (q) { return re.test(q.label || ''); })[0]; if (!x || !isNum(x.p)) return null;
      var m = /(plus|moins) de ([\d.]+)/i.exec(x.label); if (!m) return null; var po = /plus/i.test(m[1]) ? x.p : 1 - x.p, mean = meanFromLine(parseFloat(m[2]), po);
      return mean == null ? null : { mean: mean };
    };
    var cb = parse(/corners/i), sh = parse(/tirs cadr/i), btt = ev.filter(function (q) { return /deux .quipes marquent|muette/i.test(q.label || ''); })[0], pYes = null;
    if (btt && isNum(btt.p)) pYes = /muette/i.test(btt.label) ? 1 - btt.p : btt.p;
    return {
      id: 'trk_' + e.timestamp, ts: e.timestamp, sport: 'football', nameA: e.nameA, nameB: e.nameB, league: e.league || '',
      scores: sb.top, probs: sb.probs, winner: winnerOf(sb.probs, e.nameA, e.nameB), corners: cb ? statBlock(cb.mean) : null, shots: sh ? statBlock(sh.mean) : null,
      btts: { pYes: pYes, trend: null }, lamA: e.lambdaA, lamB: e.lambdaB, final: e.finalScore ? { a: e.finalScore.a, b: e.finalScore.b, stats: e.finalStats || null } : null, approx: true
    };
  }

  /* ---------- BTTS : validation par tout le système ---------- */
  function bttsYes(fs) { return fs && isNum(fs.a) && isNum(fs.b) && fs.a > 0 && fs.b > 0; }
  var BTTS_W = { model: 1.0, trend: 0.7, team: 0.6, league: 0.5, h2h: 0.5, calib: 0.8 };
  /* o : { nameA, nameB, league, pYes, lamA, lamB, trend (TR.describe), history:[{nameA,nameB,league,finalScore,ts}], calib:[{pYes,yes}], excludeTs } */
  function bttsEvidence(o) {
    var items = [], A = norm(o.nameA), B = norm(o.nameB), L = norm(o.league || '');
    var hist = (o.history || []).filter(function (h) { return h && h.finalScore && isNum(h.finalScore.a) && isNum(h.finalScore.b) && !(isNum(o.excludeTs) && h.ts === o.excludeTs && norm(h.nameA) === A && norm(h.nameB) === B); });
    function rate(list) { var y = list.filter(function (h) { return bttsYes(h.finalScore); }).length; return { n: list.length, y: y, r: list.length ? y / list.length : null }; }
    function add(kind, label, text, y, n, w, minN) {
      var r = n ? y / n : null; items.push({ kind: kind, label: label, text: text, y: y, n: n, lean: r == null ? 0 : (r - 0.5) * 2 * Math.min(1, n / minN), weight: w });
    }
    // 1. modèle
    if (isNum(o.pYes)) { var lm = (o.pYes - 0.5) * 2; items.push({ kind: 'model', label: 'Modèle EA', text: 'penche vers ' + (lm >= 0 ? 'OUI' : 'NON') + (Math.abs(lm) >= 0.3 ? ' (net)' : ' (léger)'), lean: lm, weight: BTTS_W.model, n: null }); }
    // 2. tendances du dossier (séries saisies pour ce match)
    var tr = o.trend;
    if (tr && isNum(tr.pTrend) && tr.W > 0 && (tr.parts || []).length) {
      var tn = tr.parts.reduce(function (s, p) { return s + (p.n || 0); }, 0), names = { form: 'Forme', venue: 'Dom./Ext.', h2h: 'Face-à-face', euro: 'Coupe d\'Europe' };
      var txt = tr.parts.map(function (p) { return (names[p.id] || p.id) + ' ' + Math.round((p.r || 0) * (p.n || 0)) + '/' + p.n; }).join(' · ');
      items.push({ kind: 'trend', label: 'Séries saisies pour ce match', text: txt + ' avec les deux équipes qui marquent', y: null, n: tn, lean: (tr.pTrend - 0.5) * 2 * Math.min(1, tn / 10), weight: BTTS_W.trend });
    }
    // 3. historique de chaque équipe dans les matchs déjà réglés du système
    [[A, o.nameA], [B, o.nameB]].forEach(function (t) {
      var list = hist.filter(function (h) { return norm(h.nameA) === t[0] || norm(h.nameB) === t[0]; }), r = rate(list);
      if (r.n >= 3) add('team', 'Historique ' + t[1], r.y + ' match' + (r.y > 1 ? 's' : '') + ' sur ' + r.n + ' avec les deux équipes qui marquent (matchs déjà analysés et réglés)', r.y, r.n, BTTS_W.team, 8);
    });
    // 4. confrontations directes déjà analysées
    var direct = hist.filter(function (h) { var a = norm(h.nameA), b = norm(h.nameB); return (a === A && b === B) || (a === B && b === A); }), dr = rate(direct);
    if (dr.n >= 1) add('h2h', 'Confrontations directes dans le système', dr.y + ' sur ' + dr.n + ' avec les deux équipes qui marquent', dr.y, dr.n, BTTS_W.h2h, 3);
    // 5. même championnat
    if (L) { var ll = hist.filter(function (h) { return norm(h.league) === L; }), lr = rate(ll); if (lr.n >= 8) add('league', 'Championnat (' + o.league + ')', lr.y + ' matchs sur ' + lr.n + ' avec les deux équipes qui marquent', lr.y, lr.n, BTTS_W.league, 20); }
    // 6. fiabilité passée de l'application à ce niveau de probabilité
    if (isNum(o.pYes)) {
      var near = (o.calib || []).filter(function (c) { return isNum(c.pYes) && Math.abs(c.pYes - o.pYes) <= 0.08; }), cy = near.filter(function (c) { return c.yes; }).length;
      if (near.length >= 8) add('calib', 'Fiabilité passée d\'EA à ce niveau', 'quand EA annonçait un niveau comparable, les deux équipes ont marqué ' + cy + ' fois sur ' + near.length, cy, near.length, BTTS_W.calib, 20);
    }
    // 7. repère : moyenne de tout le système (information, sans vote)
    var all = rate(hist); var base = all.n >= 20 ? { kind: 'base', label: 'Moyenne de tout le système', text: all.y + ' matchs sur ' + all.n + ' avec les deux équipes qui marquent', n: all.n, lean: 0, weight: 0 } : null;
    if (base) items.push(base);
    // verdict
    var voters = items.filter(function (i) { return i.weight > 0 && i.lean != null; }), sw = voters.reduce(function (s, i) { return s + i.weight; }, 0);
    var score = sw ? voters.reduce(function (s, i) { return s + i.weight * i.lean; }, 0) / sw : 0;
    var others = voters.filter(function (i) { return i.kind !== 'model' && Math.abs(i.lean) >= 0.15; }), sign = score >= 0 ? 1 : -1, agree = others.filter(function (i) { return (i.lean >= 0 ? 1 : -1) === sign; }).length;
    var pick, level, label;
    if (!voters.length) { pick = null; level = 'none'; label = 'Indécis'; }
    else if (Math.abs(score) >= 0.28 && agree >= 2) { pick = score > 0 ? 'oui' : 'non'; level = 'confirme'; label = (score > 0 ? 'OUI' : 'NON') + ' confirmé'; }
    else if (Math.abs(score) >= 0.14 && agree >= 1) { pick = score > 0 ? 'oui' : 'non'; level = 'probable'; label = 'Plutôt ' + (score > 0 ? 'OUI' : 'NON'); }
    else { pick = null; level = 'indecis'; label = 'Indécis'; }
    var onlyModel = voters.length <= 1;
    return { items: items, score: score, pick: pick, level: level, label: label, onlyModel: onlyModel, agree: agree, note: onlyModel ? 'Aucune validation trouvée dans le système (pas encore assez de matchs réglés) : verdict fondé sur le modèle seul.' : (level === 'indecis' ? 'Les validations se contredisent ou sont trop faibles : ne pas parier le BTTS sur ce match.' : '') };
  }
  // Vérification après le match : chaque ligne de la fiche est-elle tombée ?
  function checkFiche(f, verdict) {
    if (!f || !f.final) return null;
    var fa = f.final.a, fb = f.final.b, st = f.final.stats || {}, within = function (blk, v) { return blk && isNum(v) ? (v >= blk.lo && v <= blk.hi) : null; };
    var res = fa > fb ? 'A' : fa < fb ? 'B' : 'draw';
    return {
      score: f.scores.map(function (s) { return s.a === fa && s.b === fb; }),
      winner: f.winner.side === res,
      btts: verdict && verdict.pick ? ((verdict.pick === 'oui') === !!bttsYes(f.final)) : null,
      corners: within(f.corners, st.corners), shots: within(f.shots, st.shots)
    };
  }

  /* ---------- glyphes « jeu vidéo » modélisés d'après les croquis ---------- */
  // Chiffres carrés à 7 segments biseautés (croquis du « 2 » carré), avec hachures en diagonale.
  var SEGS = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
  function digitSvg(d, h, uid) {
    var W = 56, H = 96, t = 11, g = 2, hh = H / 2;
    function hs(x0, y0, len) { return [[x0, y0 + t / 2], [x0 + t / 2, y0], [x0 + len - t / 2, y0], [x0 + len, y0 + t / 2], [x0 + len - t / 2, y0 + t], [x0 + t / 2, y0 + t]]; }
    function vs(x0, y0, len) { return [[x0 + t / 2, y0], [x0 + t, y0 + t / 2], [x0 + t, y0 + len - t / 2], [x0 + t / 2, y0 + len], [x0, y0 + len - t / 2], [x0, y0 + t / 2]]; }
    var seg = { a: hs(3, 0, W - 6), g: hs(3, hh - t / 2, W - 6), d: hs(3, H - t, W - 6), f: vs(0, g + 2, hh - t / 2 - g * 2), b: vs(W - t, g + 2, hh - t / 2 - g * 2), e: vs(0, hh + t / 2 - 2, hh - t / 2 - g * 2 + 2), c: vs(W - t, hh + t / 2 - 2, hh - t / 2 - g * 2 + 2) };
    var on = SEGS[d] || '', polys = on.split('').map(function (k) { return '<polygon points="' + seg[k].map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + '" />'; }).join('');
    var id = 'eaDg' + (uid || '') + d;
    return '<svg class="ea-digit" viewBox="-2 -2 ' + (W + 4) + ' ' + (H + 4) + '" height="' + (h || 54) + '" aria-hidden="true"><defs>' +
      '<linearGradient id="' + id + 'g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".55" stop-color="#D4AF37"/><stop offset="1" stop-color="#8A733A"/></linearGradient>' +
      '<pattern id="' + id + 'h" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="rgba(5,6,10,.35)" stroke-width="1.2"/></pattern></defs>' +
      '<g fill="url(#' + id + 'g)" stroke="#fff3c4" stroke-width="1" stroke-linejoin="round">' + polys + '</g><g fill="url(#' + id + 'h)">' + polys + '</g></svg>';
  }
  function boltSvg(w, cls) {
    return '<svg class="ea-bolt ' + (cls || '') + '" viewBox="0 0 40 60" width="' + (w || 14) + '" aria-hidden="true"><path d="M30 2 L14 24 L27 26 L3 58 L18 30 L6 28 Z" fill="currentColor" /></svg>';
  }
  function curvy2Svg(h) {
    return '<svg class="ea-curvy2" viewBox="0 0 60 80" height="' + (h || 16) + '" aria-hidden="true"><path d="M8 24 C8 4 44 -2 50 20 C54 36 30 52 14 68 L14 74 L56 74 C60 66 56 58 48 60 L30 60 L48 44 C60 32 58 8 40 6" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  var api = { VERSION: VERSION, norm: norm, esc: esc, meanFromLine: meanFromLine, modalWindow: modalWindow, pOver: pOver, statFromBets: statFromBets, statBlock: statBlock, scoreBoard: scoreBoard,
    buildFiche: buildFiche, fromTrack: fromTrack, bttsEvidence: bttsEvidence, checkFiche: checkFiche, bttsYes: bttsYes, winnerOf: winnerOf, digitSvg: digitSvg, boltSvg: boltSvg, curvy2Svg: curvy2Svg };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.EAF = api;
})(typeof window !== 'undefined' ? window : globalThis);
