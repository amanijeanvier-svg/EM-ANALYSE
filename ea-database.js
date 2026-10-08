/* EA DATABASE v1 — base statistique locale (offline-first), chronologique, sans fuite du futur.
   Donnée absente = null (UNKNOWN), jamais inventée. Anomalies : isolées en quarantaine, jamais supprimées. */
(function (g) {
  'use strict';
  var EA = g.EA = g.EA || {};
  var KEY = 'ea_database_v1', SCHEMA = 1;
  var CFG = { levels: [{ min: 300, label: 'STRONG' }, { min: 100, label: 'GOOD' }, { min: 30, label: 'MODERATE' }, { min: 10, label: 'LOW' }, { min: 0, label: 'VERY LOW' }],
    priorN: 20, modelWeight: 1.0, minSignalN: 5, conflictSpread: 0.15,
    goalLines: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5], cornerLines: [6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5], sotLines: [2.5, 3.5, 4.5, 5.5, 6.5], shotLines: [20.5, 22.5, 24.5, 26.5], cardLines: [2.5, 3.5, 4.5, 5.5, 6.5], ptLines: [150.5, 160.5, 170.5, 180.5, 190.5, 200.5, 210.5, 220.5, 230.5], windows: [3, 5, 8, 10, 15] };
  function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function num(v) { if (v === null || v === undefined || v === '') return null; var x = Number(v); return isFinite(x) ? x : null; }
  function level(n, cfg) { var L = ((cfg || CFG).levels).slice().sort(function (a, b) { return b.min - a.min; }); for (var i = 0; i < L.length; i++) if (n >= L[i].min) return L[i].label; return 'VERY LOW'; }
  function seasonOf(d) { var y = +d.slice(0, 4), m = +d.slice(5, 7); return m >= 8 ? y + '/' + String((y + 1) % 100).padStart(2, '0') : (y - 1) + '/' + String(y % 100).padStart(2, '0'); }
  function validDate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !isNaN(Date.parse(d)); }
  function rate(k, n) { return { k: k, n: n, pct: n ? k / n : null, level: level(n) }; }
  function fmt(r) { return r && r.n ? r.k + '/' + r.n + ' (' + (r.pct * 100).toFixed(0) + ' %)' + (r.n < 10 ? ' ⚠️' : '') : 'UNKNOWN'; }   // jamais de % sans k/n

  // ---------- normalisation + contrôles d'intégrité ----------
  function normalize(raw) {
    var issues = [], r = raw || {}, m = { sport: norm(r.sport) === 'basketball' ? 'basketball' : 'football', country: r.country || null, competition: String(r.competition || '').trim() || null, round: r.round || null,
      date: validDate(r.date) ? r.date : null, time: r.time || null, home: String(r.home || '').trim(), away: String(r.away || '').trim(), hs: num(r.hs), as: num(r.as), source: r.source || 'MANUAL', dateApprox: !!r.dateApprox,
      stats: {}, odds: r.odds || null };
    ['shots', 'sot', 'poss', 'corners', 'fouls', 'cards', 'xg'].forEach(function (k) { m.stats[k + '_h'] = num(r[k + '_h']); m.stats[k + '_a'] = num(r[k + '_a']); m.stats[k + '_t'] = num(r[k + '_t']); });
    if (!m.date) issues.push({ sev: 'error', code: 'NO_DATE' });
    if (!m.home || !m.away) issues.push({ sev: 'error', code: 'UNKNOWN_TEAM' });
    else if (norm(m.home) === norm(m.away)) issues.push({ sev: 'error', code: 'SAME_TEAM' });
    if (!m.competition) issues.push({ sev: 'warn', code: 'NO_COMPETITION' });
    [m.hs, m.as].forEach(function (x) { if (x != null && (x < 0 || x % 1 !== 0)) issues.push({ sev: 'error', code: 'INVALID_SCORE' }); });
    if ((m.hs == null) !== (m.as == null)) issues.push({ sev: 'error', code: 'INVALID_SCORE' });
    Object.keys(m.stats).forEach(function (k) { var v = m.stats[k]; if (v != null && v < 0) issues.push({ sev: 'error', code: 'NEGATIVE_STAT:' + k }); });
    if (m.sport === 'football') {
      var s = m.stats; if (s.sot_h != null && s.shots_h != null && s.sot_h > s.shots_h) issues.push({ sev: 'error', code: 'IMPOSSIBLE:sot_h>shots_h' });
      if (s.sot_a != null && s.shots_a != null && s.sot_a > s.shots_a) issues.push({ sev: 'error', code: 'IMPOSSIBLE:sot_a>shots_a' });
      if (s.poss_h != null && (s.poss_h > 100)) issues.push({ sev: 'error', code: 'IMPOSSIBLE:possession' });
    }
    ['corners', 'sot', 'shots', 'cards'].forEach(function (k) { var h = m.stats[k + '_h'], a = m.stats[k + '_a'], t = m.stats[k + '_t']; if (h != null && a != null && t != null && Math.abs(h + a - t) > 1e-9) issues.push({ sev: 'error', code: 'INCONSISTENT_TOTAL:' + k }); });
    if (m.stats.sot_t != null && m.stats.shots_t != null && m.stats.sot_t > m.stats.shots_t) issues.push({ sev: 'error', code: 'IMPOSSIBLE:sot_t>shots_t' });
    if (m.hs != null && m.stats.corners_h == null && m.stats.corners_t == null && m.sport === 'football') issues.push({ sev: 'info', code: 'MISSING_STATS' });
    m.season = r.season || (m.date ? seasonOf(m.date) : null); m.seasonDerived = !r.season && !!m.date;
    m.id = m.date ? [m.sport, norm(m.competition), m.season, m.date, norm(m.home), norm(m.away)].join('|') : null;
    return { match: m, issues: issues, bad: issues.some(function (i) { return i.sev === 'error'; }) };
  }

  // ---------- agrégations ----------
  function cnt(ms, avail, test) { var k = 0, n = 0; ms.forEach(function (m) { if (!avail(m)) return; n++; if (test(m)) k++; }); return rate(k, n); }
  function avg(ms, f) { var s = 0, n = 0; ms.forEach(function (m) { var v = f(m); if (v != null) { s += v; n++; } }); return { avg: n ? s / n : null, n: n }; }
  function total(m) { return m.hs + m.as; }
  function lines(ms, avail, f, L, cfg) { var o = {}; L.forEach(function (l) { o[l] = { over: cnt(ms, avail, function (m) { return f(m) > l; }), under: cnt(ms, avail, function (m) { return f(m) < l; }) }; }); return o; }
  function aggregate(ms, cfg) {
    cfg = cfg || CFG; var n = ms.length, S = ms[0] && ms[0].sport, all = function () { return true; };
    var A = { n: n, level: level(n, cfg), goals: avg(ms, total), result: { home: cnt(ms, all, function (m) { return m.hs > m.as; }), draw: cnt(ms, all, function (m) { return m.hs === m.as; }), away: cnt(ms, all, function (m) { return m.hs < m.as; }) } };
    A.result.homeOrDraw = cnt(ms, all, function (m) { return m.hs >= m.as; }); A.result.awayOrDraw = cnt(ms, all, function (m) { return m.hs <= m.as; }); A.result.homeOrAway = cnt(ms, all, function (m) { return m.hs !== m.as; });
    A.goalsHome = avg(ms, function (m) { return m.hs; }); A.goalsAway = avg(ms, function (m) { return m.as; });
    if (S === 'basketball') { A.totals = lines(ms, all, total, cfg.ptLines); A.margin = avg(ms, function (m) { return m.hs - m.as; }); return A; }
    A.totals = lines(ms, all, total, cfg.goalLines);
    A.btts = { yes: cnt(ms, all, function (m) { return m.hs > 0 && m.as > 0; }), no: cnt(ms, all, function (m) { return !(m.hs > 0 && m.as > 0); }) };
    A.btts.yesOver25 = cnt(ms, all, function (m) { return m.hs > 0 && m.as > 0 && total(m) > 2.5; }); A.btts.yesUnder25 = cnt(ms, all, function (m) { return m.hs > 0 && m.as > 0 && total(m) < 2.5; });
    [['corners', cfg.cornerLines], ['sot', cfg.sotLines], ['shots', cfg.shotLines], ['cards', cfg.cardLines || CFG.cardLines]].forEach(function (p) {
      var k = p[0], h = function (m) { return m.stats[k + '_h']; }, a = function (m) { return m.stats[k + '_a']; }, ok = function (m) { return statTotal(m, k) != null; }, t = function (m) { return statTotal(m, k); };
      A[k] = { total: avg(ms.filter(ok), t), home: avg(ms, h), away: avg(ms, a), lines: lines(ms, ok, t, p[1], cfg) };
    });
    return A;
  }
  function statTotal(m, k) { var h = m.stats[k + '_h'], a = m.stats[k + '_a']; return h != null && a != null ? h + a : (m.stats[k + '_t'] != null ? m.stats[k + '_t'] : null); }   // total connu seulement s'il est réellement fourni
  function teamView(m, team) { var home = norm(m.home) === norm(team); return { m: m, home: home, gf: home ? m.hs : m.as, ga: home ? m.as : m.hs, date: m.date, f: function (k) { return m.stats[k + (home ? '_h' : '_a')]; }, c: function (k) { return m.stats[k + (home ? '_a' : '_h')]; } }; }
  function teamBlock(tv, cfg) {
    var n = tv.length, all = function () { return true; }, B = { n: n, level: level(n, cfg || CFG) };
    B.W = tv.filter(function (t) { return t.gf > t.ga; }).length; B.D = tv.filter(function (t) { return t.gf === t.ga; }).length; B.L = n - B.W - B.D;
    B.gf = avg(tv, function (t) { return t.gf; }); B.ga = avg(tv, function (t) { return t.ga; });
    B.btts = cnt(tv, all, function (t) { return t.gf > 0 && t.ga > 0; }); B.cleanSheets = cnt(tv, all, function (t) { return t.ga === 0; }); B.failedToScore = cnt(tv, all, function (t) { return t.gf === 0; });
    B.over = {}; B.under = {}; (cfg || CFG).goalLines.forEach(function (l) { B.over[l] = cnt(tv, all, function (t) { return t.gf + t.ga > l; }); B.under[l] = cnt(tv, all, function (t) { return t.gf + t.ga < l; }); });
    ['corners', 'sot', 'shots'].forEach(function (k) { B[k] = { for: avg(tv, function (t) { return t.f(k); }), against: avg(tv, function (t) { return t.c(k); }) }; });
    B.form = tv.slice(-5).map(function (t) { return t.gf > t.ga ? 'W' : t.gf === t.ga ? 'D' : 'L'; }).join('');
    return B;
  }
  function streaks(tv) {
    var defs = { win: function (t) { return t.gf > t.ga; }, noWin: function (t) { return t.gf <= t.ga; }, btts: function (t) { return t.gf > 0 && t.ga > 0; }, over25: function (t) { return t.gf + t.ga > 2.5; }, under25: function (t) { return t.gf + t.ga < 2.5; }, cleanSheet: function (t) { return t.ga === 0; }, scored: function (t) { return t.gf > 0; }, conceded: function (t) { return t.ga > 0; } }, o = {};
    Object.keys(defs).forEach(function (k) { var c = 0; for (var i = tv.length - 1; i >= 0 && defs[k](tv[i]); i--) c++; o[k] = c; });
    o.note = 'Signal secondaire : une série n\'est jamais une causalité.'; return o;
  }
  function trendWindows(tv, cfg) {
    cfg = cfg || CFG; var o = {}, all = function () { return true; };
    cfg.windows.concat(['all']).forEach(function (w) { var s = w === 'all' ? tv : tv.slice(-w);
      o[w] = { over25: cnt(s, all, function (t) { return t.gf + t.ga > 2.5; }), btts: cnt(s, all, function (t) { return t.gf > 0 && t.ga > 0; }), over15: cnt(s, all, function (t) { return t.gf + t.ga > 1.5; }),
        corners95: cnt(s, function (t) { return t.f('corners') != null && t.c('corners') != null; }, function (t) { return t.f('corners') + t.c('corners') > 9.5; }) }; });
    return o;
  }

  // ---------- consensus base + modèle, conflits, stabilité ----------
  function shrink(k, n, base, priorN) { return (k + base * priorN) / (n + priorN); }
  function marketSpec(market) {
    var s = String(market), m, T = function (f, av) { return { test: f, avail: av }; };
    if (s === 'btts_yes') return T(function (x) { return x.hs > 0 && x.as > 0; }); if (s === 'btts_no') return T(function (x) { return !(x.hs > 0 && x.as > 0); });
    if (s === 'home_win') return T(function (x) { return x.hs > x.as; }); if (s === 'away_win') return T(function (x) { return x.hs < x.as; }); if (s === 'draw') return T(function (x) { return x.hs === x.as; });
    if (s === 'home_or_draw') return T(function (x) { return x.hs >= x.as; }); if (s === 'away_or_draw') return T(function (x) { return x.hs <= x.as; }); if (s === 'home_or_away') return T(function (x) { return x.hs !== x.as; });
    if ((m = /^(over|under):([\d.]+)$/.exec(s))) { var l = +m[2], ov = m[1] === 'over'; return T(function (x) { return ov ? x.hs + x.as > l : x.hs + x.as < l; }); }
    if ((m = /^(corners|sot|shots|cards)_(over|under):([\d.]+)$/.exec(s))) { var k = m[1], l2 = +m[3], ov2 = m[2] === 'over'; return T(function (x) { var t = statTotal(x, k); return ov2 ? t > l2 : t < l2; }, function (x) { return statTotal(x, k) != null; }); }
    if ((m = /^(home|away)_margin_gte:(\d+)$/.exec(s))) { var N0 = +m[2], hh = m[1] === 'home'; return T(function (x) { return hh ? x.hs - x.as >= N0 : x.as - x.hs >= N0; }); }
    if ((m = /^spread_(home|away):(-?[\d.]+)$/.exec(s))) { var L = +m[2], hm = m[1] === 'home'; return T(function (x) { return hm ? x.hs - x.as + L > 0 : x.as - x.hs + L > 0; }); }
    return null;
  }
  function marketTest(market) {
    if (market === 'btts_yes') return function (m) { return m.hs > 0 && m.as > 0; };
    if (market === 'home_win') return function (m) { return m.hs > m.as; }; if (market === 'away_win') return function (m) { return m.hs < m.as; }; if (market === 'draw') return function (m) { return m.hs === m.as; };
    var mm = /^over:([\d.]+)$/.exec(market); if (mm) { var l = +mm[1]; return function (m) { return m.hs + m.as > l; }; }
    return null;
  }
  function wilsonHalf(p, n) { return n > 0 ? 1.96 * Math.sqrt(p * (1 - p) / n) * 100 : 50; }
  function consensus(ms, o, cfg) {   // ms : matchs déjà filtrés AVANT la date ; o: {home, away, market, modelP}
    cfg = cfg || CFG; var spec = marketSpec(o.market); if (!spec) return { available: false, reason: 'marché non couvert par la base' }; var test = spec.test, av = spec.avail || function () { return true; };
    var sig = [], b = ms.filter(function (m) { return m.sport === o.sport && (!o.competition || norm(m.competition) === norm(o.competition)); }), lg = cnt(b, av, test);
    if (lg.n < cfg.minSignalN) return { available: false, reason: 'base insuffisante pour ce contexte (' + lg.n + ' matchs)' };
    var base = lg.pct, add = function (name, r) { if (r.n >= cfg.minSignalN) { var w = r.n / (r.n + cfg.priorN); sig.push({ name: name, k: r.k, n: r.n, raw: r.pct, p: shrink(r.k, r.n, base, cfg.priorN), w: w }); } };
    add('League baseline', lg);
    var tm = function (team, venue, last) { var t = b.filter(function (m) { return norm(m.home) === norm(team) || norm(m.away) === norm(team); }); if (venue) t = t.filter(function (m) { return (venue === 'home') === (norm(m.home) === norm(team)); }); return last ? t.slice(-last) : t; };
    var two = function (a, bb) { return rate(a.k + bb.k, a.n + bb.n); }, c = function (arr) { return cnt(arr, av, test); };
    add('Team season', two(c(tm(o.home)), c(tm(o.away)))); var rn = cfg.recentN || 5; add('Team recent (' + rn + ')', two(c(tm(o.home, null, rn)), c(tm(o.away, null, rn)))); add('Home/Away', two(c(tm(o.home, 'home')), c(tm(o.away, 'away'))));
    add('H2H', c(b.filter(function (m) { var h = norm(m.home), a = norm(m.away); return (h === norm(o.home) && a === norm(o.away)) || (h === norm(o.away) && a === norm(o.home)); })));
    if (o.modelP != null) sig.push({ name: 'Model', k: null, n: null, raw: o.modelP, p: o.modelP, w: cfg.modelWeight });
    var sw = sig.reduce(function (s, x) { return s + x.w; }, 0), p = sig.reduce(function (s, x) { return s + x.w * x.p; }, 0) / sw;
    var strong = sig.filter(function (x) { return x.w >= 0.2; }), ps = strong.map(function (x) { return x.p; }), mx = Math.max.apply(null, ps), mn = Math.min.apply(null, ps), spread = mx - mn;
    var conflict = strong.length >= 2 && mx > 0.5 && mn < 0.5 && spread >= cfg.conflictSpread, neff = sig.reduce(function (s, x) { return s + (x.n || 0) * x.w; }, 0) + cfg.priorN;
    return { available: true, p: p, signals: sig, spread: spread, conflict: conflict, stability: Math.round(Math.max(0, Math.min(1, 1 - spread / 0.4)) * 100), uncertaintyHalfPts: Math.round((wilsonHalf(p, neff) + (conflict ? 5 : 0)) * 10) / 10,
      note: conflict ? '⚠️ CONFLIT STATISTIQUE : signal insuffisamment cohérent, incertitude augmentée.' : 'Sources cohérentes.', provenance: 'EA DATABASE · ' + lg.n + ' matchs (contexte) · ' + b[0].date + ' → ' + b[b.length - 1].date };
  }

  // ---------- fournisseurs de données (couche DATA PROVIDER) ----------
  function parseCSV(text) {
    var rows = String(text || '').split(/\r?\n/).filter(function (l) { return l.trim(); }); if (rows.length < 2) return [];
    var sep = rows[0].indexOf(';') >= 0 ? ';' : rows[0].indexOf('\t') >= 0 ? '\t' : ',', al = { date: 'date', domicile: 'home', home: 'home', exterieur: 'away', away: 'away', 'extérieur': 'away', competition: 'competition', 'compétition': 'competition', league: 'competition', saison: 'season', season: 'season', pays: 'country', country: 'country', sport: 'sport', 'buts_dom': 'hs', hs: 'hs', 'buts_ext': 'as', as: 'as', hg: 'hs', ag: 'as' };
    var H = rows[0].split(sep).map(function (h) { var k = norm(h).replace(/\s+/g, '_'); return al[k] || k; });
    return rows.slice(1).map(function (l) { var c = l.split(sep), o = {}; H.forEach(function (h, i) { o[h] = c[i] == null ? null : c[i].trim(); }); o.source = 'CSV'; return o; });
  }
  function fromLegacy(DB) {
    var out = []; ['football', 'basketball'].forEach(function (sp) { (DB && DB[sp] || []).forEach(function (r) { var f = r && r.finalScore; if (!f || f.a == null || f.b == null) return;
      var d = r.matchDate || r.date || (r.timestamp ? new Date(r.timestamp).toISOString().slice(0, 10) : null), fs = r.finalStats || {}; out.push({ sport: sp, competition: r.league, home: r.nameA, away: r.nameB, hs: f.a, as: f.b, date: d, dateApprox: !(r.matchDate || r.date), source: 'LEGACY-HISTORY', corners_t: fs.corners == null ? null : fs.corners, sot_t: fs.shots == null ? null : fs.shots, cards_t: fs.cards == null ? null : fs.cards }); }); });
    return out;
  }
  // Ligne « TRACK » (historique permanent des 180+ matchs validés) : même structure que DB, on réutilise fromLegacy.
  function fromTrack(TR) { return fromLegacy(TR).map(function (r) { r.source = 'TRACK-HISTORY'; return r; }); }
  // Sauvegarde JSON exportée par l'appli (Réglages → Exporter) : {track, db, archive, settings.ea_pro_memory}
  function fromBackup(p) {
    var out = []; if (!p || typeof p !== 'object') return out;
    fromTrack(p.track).forEach(function (r) { out.push(r); });
    fromLegacy(p.db).forEach(function (r) { r.source = 'BACKUP-DB'; out.push(r); });
    try { var m = p.settings && p.settings.ea_pro_memory; if (m) { var mm = typeof m === 'string' ? JSON.parse(m) : m; fromMemory(mm.analyses || []).forEach(function (r) { r.source = 'BACKUP-MEMORY'; out.push(r); }); } } catch (e) { }
    return out;
  }
  // Dédoublonnage entre sources : un même match (même sport, équipes et score) vu par TRACK (date de validation, approx.)
  // et par la mémoire (date exacte) ne doit être compté qu'une fois. On garde la date exacte de préférence.
  function dedupeRows(rows) {
    // Ne fusionne QUE des lignes venant de sources différentes (ex. TRACK ↔ mémoire ↔ DB) : deux lignes de la même
    // source sont deux matchs distincts, même si équipes et score sont identiques.
    var best = {}, order = [], DAY = 864e5;
    (rows || []).forEach(function (r) {
      if (!r || r.hs == null || r.as == null || !r.home || !r.away) { order.push({ r: r, src: {} }); return; }
      var k = [norm(r.sport) === 'basketball' ? 'b' : 'f', norm(r.home), norm(r.away), r.hs, r.as].join('|'), t = Date.parse(r.date), list = best[k] = best[k] || [], hit = null, sc = r.source || '?';
      for (var i = 0; i < list.length; i++) { var u = Date.parse(list[i].r.date); if (!list[i].src[sc] && (isNaN(t) || isNaN(u) || Math.abs(t - u) <= 14 * DAY)) { hit = list[i]; break; } }
      if (!hit) { var e = { r: r, src: {} }; e.src[sc] = 1; list.push(e); order.push(e); } else { hit.src[sc] = 1; if (hit.r.dateApprox && !r.dateApprox) hit.r = r; }
    });
    return order.map(function (e) { return e.r; });
  }
  function fromMemory(recs) { var seen = {}, out = []; (recs || []).forEach(function (r) { var s = r.result && r.result.score; if (!s || r.type === 'combo' || !r.matchDate) return; var k = [r.sport, r.competition, r.matchDate, r.home, r.away].join('|'); if (seen[k]) return; seen[k] = 1;
    out.push({ sport: r.sport, competition: r.competition, home: r.home, away: r.away, hs: s.a, as: s.b, date: r.matchDate, source: 'EA-MEMORY' }); }); return out; }

  // ---------- store ----------
  function createStore(storage) {
    var st = null, cache = {};
    function load() { if (st) return st; try { st = JSON.parse(storage.getItem(KEY)); } catch (e) { st = null; } if (!st || !st.matches) st = { meta: { schema: 1, version: 1, state: 'EMPTY', lastUpdate: null, lastProcessed: null }, matches: {}, quarantine: [], duplicates: [], journal: [], decisions: [], decisionResults: {}, versions: [] }; if (!st.duplicates) st.duplicates = []; if (!st.journal) st.journal = []; if (!st.decisions) st.decisions = []; if (!st.decisionResults) st.decisionResults = {}; if (!st.versions) st.versions = []; return st; }
    function log(type, msg, now) { var s = load(); s.journal.push({ t: new Date(now || Date.now()).toISOString(), type: type, msg: msg }); if (s.journal.length > 200) s.journal = s.journal.slice(-200); }
    function save() { try { storage.setItem(KEY, JSON.stringify(st)); return true; } catch (e) { return false; } }
    function upsert(list, now) {
      var s = load(), added = 0, updated = 0, rejected = 0, dup = 0, touched = {}, idx = {};
      Object.keys(s.matches).forEach(function (k) { var x = s.matches[k]; idx[x.date + '|' + norm(x.home) + '|' + norm(x.away)] = k; });
      (list || []).forEach(function (raw) { var r = normalize(raw);
        if (r.bad) { rejected++; s.quarantine.push({ raw: raw, issues: r.issues, at: now || Date.now() }); return; }
        var m = r.match, had = !!s.matches[m.id], dk = m.date + '|' + norm(m.home) + '|' + norm(m.away);
        if (idx[dk] && idx[dk] !== m.id) { dup++; s.duplicates.push({ existing: idx[dk], candidate: m.id, at: now || Date.now() }); return; } idx[dk] = m.id; if (had && JSON.stringify(s.matches[m.id].stats) === JSON.stringify(m.stats) && s.matches[m.id].hs === m.hs && s.matches[m.id].as === m.as) return;
        m.issues = r.issues.filter(function (i) { return i.sev !== 'error'; }); s.matches[m.id] = m; had ? updated++ : added++; touched['L|' + m.sport + '|' + norm(m.competition)] = 1; touched['T|' + norm(m.home)] = 1; touched['T|' + norm(m.away)] = 1; });
      Object.keys(cache).forEach(function (k) { Object.keys(touched).forEach(function (t) { if (k.indexOf(t) === 0) delete cache[k]; }); });
      var ds = Object.keys(s.matches).map(function (k) { return s.matches[k].date; }).sort(); s.meta.lastProcessed = ds.length ? ds[ds.length - 1] : null;
      if (added || updated) { s.meta.lastUpdate = new Date(now || Date.now()).toISOString(); s.meta.state = 'READY'; }
      if (added || updated || rejected || dup) log(rejected || dup ? 'WARNING' : 'UPDATE', added + ' ajouté(s), ' + updated + ' mis à jour, ' + rejected + ' en quarantaine, ' + dup + ' DUPLICATE CANDIDATE', now);
      return { added: added, updated: updated, rejected: rejected, duplicates: dup, saved: save() };
    }
    function played(f) {
      f = f || {}; var s = load(), t = f.team ? norm(f.team) : null, a = Object.keys(s.matches).map(function (k) { return s.matches[k]; }).filter(function (m) { return m.hs != null && m.as != null; })
        .filter(function (m) { return (!f.sport || m.sport === f.sport) && (!f.country || norm(m.country) === norm(f.country)) && (!f.competition || norm(m.competition) === norm(f.competition)) && (!f.season || m.season === f.season) && (!f.before || m.date < f.before) && (!f.from || m.date >= f.from) && (!f.to || m.date <= f.to) && (!f.strict || !m.dateApprox); });
      if (t) a = a.filter(function (m) { var h = norm(m.home) === t, aw = norm(m.away) === t; return f.venue === 'home' ? h : f.venue === 'away' ? aw : (h || aw); });
      a.sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : x.id < y.id ? -1 : 1; }); return f.last ? a.slice(-f.last) : a;
    }
    function memo(key, fn) { if (!(key in cache)) cache[key] = fn(); return cache[key]; }
    function meta() { var s = load(), ms = Object.keys(s.matches).map(function (k) { return s.matches[k]; }), T = {}, C = {};
      ms.forEach(function (m) { T[norm(m.home)] = 1; T[norm(m.away)] = 1; C[m.sport + '|' + norm(m.competition)] = 1; });
      return Object.assign({}, s.meta, { name: 'EA DATABASE v' + s.meta.version, matches: ms.length, played: ms.filter(function (m) { return m.hs != null; }).length, teams: Object.keys(T).length, competitions: Object.keys(C).length, quarantined: s.quarantine.length, duplicates: s.duplicates.length, schema: SCHEMA, params: 'p1', model: (EA.core && EA.core.VERSION) || '?', lastRebuild: s.meta.lastRebuild || null, versions: s.versions }); }
    function league(f) { return memo('L|' + (f.sport || '') + '|' + norm(f.competition) + '|' + (f.season || '') + '|' + (f.before || ''), function () { return aggregate(played(f)); }); }
    function team(name, f) { f = Object.assign({}, f, { team: name }); var tv = played(f).map(function (m) { return teamView(m, name); }), h = tv.filter(function (t) { return t.home; }), a = tv.filter(function (t) { return !t.home; });
      return { team: name, global: teamBlock(tv), home: teamBlock(h), away: teamBlock(a), streaks: streaks(tv), trends: trendWindows(tv), n: tv.length, period: tv.length ? tv[0].date + ' → ' + tv[tv.length - 1].date : null }; }
    function initialize(sources, now) {
      var steps = [], s = function (n, d) { steps.push({ step: n, detail: d, ok: true }); }, raw = [];
      (sources || []).forEach(function (src) { raw = raw.concat(src.rows || []); }); s('1. Lecture des données', raw.length + ' ligne(s) lue(s)');
      var N = raw.map(normalize); s('2. Normalisation', N.length + ' ligne(s) normalisée(s)');
      var ids = {}, dup = 0; N.forEach(function (r) { if (!r.bad) { if (ids[r.match.id]) dup++; ids[r.match.id] = 1; } }); s('3. Déduplication', dup + ' doublon(s) fusionné(s)');
      s('4. Classement chronologique', 'plus ancien → plus récent'); var res = upsert(raw, now); s('5. Construction des équipes', ''); s('6. Construction des compétitions', '');
      log('REBUILD', 'Initialisation : ' + raw.length + ' ligne(s)', now); var m = meta(); s('7. Calcul des statistiques', m.played + ' match(s) joué(s)'); s('8. Calcul des tendances', 'fenêtres ' + CFG.windows.join('/') + ' + historique'); s('9. Création des profils', m.teams + ' équipe(s), ' + m.competitions + ' compétition(s)');
      s('10. Validation', res.rejected + ' ligne(s) en quarantaine'); var ready = m.matches > 0; s('11. Activation', ready ? '🟢 DATABASE READY' : 'aucune donnée : base vide'); load().meta.state = ready ? 'READY' : 'EMPTY'; save();
      return { steps: steps, result: res, meta: meta(), ready: ready };
    }
    function fnv(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
    // S117/S119 : snapshot de prédiction immuable (jamais modifié) ; le résultat est stocké séparément
    function addDecision(d, now) { var s = load(), snap = JSON.parse(JSON.stringify(d)); snap.createdAt = now || Date.now(); snap.id = 'd' + snap.createdAt + '_' + s.decisions.length; snap.hash = fnv(JSON.stringify(snap)); var h = snap.hash; delete snap.hash; snap.hash = h; s.decisions.push(snap); log('MODEL', 'Décision enregistrée : ' + (snap.match || '?') + ' · ' + (snap.market || '?') + ' → ' + snap.decision, now); save(); return snap; }
    function settleDecision(id, outcome, stake, now) { var s = load(); if (!s.decisions.some(function (x) { return x.id === id; }) || s.decisionResults[id] || ['won', 'lost', 'void'].indexOf(outcome) < 0) return null; var d = s.decisions.filter(function (x) { return x.id === id; })[0], u = outcome === 'void' ? 0 : outcome === 'won' ? (d.odds - 1) : -1; var r = { outcome: outcome, stake: stake == null ? 1 : stake, profitUnits: u, settledAt: now || Date.now() }; s.decisionResults[id] = r; log('LEARNING', 'Résultat enregistré (' + outcome + ') pour ' + id, now); save(); return r; }
    function verifyDecision(d) { var c = JSON.parse(JSON.stringify(d)), h = c.hash; delete c.hash; return fnv(JSON.stringify(c)) === h; }
    // S111/S154 : reconstruction complète contrôlée avec sauvegarde et restauration automatique
    function fullRebuild(sources, now, hooks) {
      hooks = hooks || {}; var BK = KEY + '_backup', old = load(), backup = JSON.stringify(old), had = Object.keys(old.matches).length, steps = [], t = now || Date.now();
      try { storage.setItem(BK, backup); } catch (e) { log('WARNING', 'Sauvegarde préalable impossible (stockage plein) : reconstruction sans filet', t); }
      try {
        var keep = { journal: old.journal, decisions: old.decisions, decisionResults: old.decisionResults, versions: old.versions };
        st = { meta: { schema: SCHEMA, version: old.meta.version || 1, state: 'EMPTY', lastUpdate: null, lastProcessed: null }, matches: {}, quarantine: [], duplicates: [], journal: keep.journal, decisions: keep.decisions, decisionResults: keep.decisionResults, versions: keep.versions }; cache = {};
        var res = initialize(sources, t), m = meta(), s2 = load();
        if (!res.ready && had > 0) throw new Error('reconstruction vide alors que ' + had + ' match(s) existaient');
        var pl = played({}), comps = {}; pl.forEach(function (x) { comps[x.sport + '|' + norm(x.competition)] = 1; });
        var add = function (n, dtl) { steps.push({ step: n, detail: dtl, ok: true }); };
        add('DETECT', res.steps[0].detail); add('VALIDATE', res.steps[1].detail); add('CLEAN', s2.quarantine.length + ' ligne(s) isolée(s) en quarantaine'); add('DEDUPLICATE', res.steps[2].detail + ' · ' + s2.duplicates.length + ' DUPLICATE CANDIDATE'); add('SORT CHRONOLOGICALLY', pl.length ? pl[0].date + ' → ' + pl[pl.length - 1].date : '—');
        add('BUILD DATABASE', m.matches + ' match(s)'); add('BUILD BASELINES', Object.keys(comps).length + ' baseline(s) de compétition'); add('BUILD TEAM PROFILES', m.teams + ' équipe(s)'); add('BUILD FORM', 'fenêtres ' + CFG.windows.join('/') + ' calculées à la demande (cache)');
        add('INITIALIZE MODELS', hooks.models ? hooks.models() : 'aucun modèle à initialiser'); add('CALIBRATE', hooks.calibrate ? hooks.calibrate() : 'aucune donnée de calibration');
        add('RUN INTEGRITY CHECK', m.quarantined + ' anomalie(s) · ' + m.duplicates + ' doublon(s) probable(s)'); s2.meta.lastRebuild = new Date(t).toISOString(); s2.versions.push({ t: s2.meta.lastRebuild, db: s2.meta.version, schema: SCHEMA, params: 'p1', matches: m.matches });
        log('REBUILD', 'FULL REBUILD terminé : ' + m.matches + ' match(s)', t); var ok = save(); add('SAVE', ok ? 'état sauvegardé' : '⚠️ sauvegarde impossible'); add('READY', m.matches ? '🟢 EA DATABASE READY' : 'base vide');
        return { steps: steps, ready: m.matches > 0, result: res.result, meta: meta(), restored: false };
      } catch (e) { try { st = JSON.parse(backup); } catch (e2) { st = null; } cache = {}; load(); log('ERROR', 'FULL REBUILD échoué : ' + e.message + ' → RESTORE PREVIOUS STATE', t); save(); return { steps: steps, ready: Object.keys(load().matches).length > 0, error: e.message, restored: true, meta: meta() }; }
    }
    return { fullRebuild: fullRebuild, addDecision: addDecision, settleDecision: settleDecision, verifyDecision: verifyDecision, decisions: function () { var s = load(); return s.decisions.map(function (x) { return { prediction: x, result: s.decisionResults[x.id] || null }; }); }, load: load, save: save, upsert: upsert, played: played, meta: meta, league: league, team: team, initialize: initialize, consensus: function (o) { return consensus(played({ before: o.before, sport: o.sport }), o); }, quarantine: function () { return load().quarantine; }, duplicates: function () { return load().duplicates; }, journal: function () { return load().journal; }, log: log, saveNow: save, reset: function () { st = null; cache = {}; try { storage.removeItem(KEY); } catch (e) { } } };
  }
  EA.database = { marketSpec: marketSpec, statTotal: statTotal, SCHEMA: SCHEMA, teamView: teamView, createStore: createStore, normalize: normalize, aggregate: aggregate, consensus: consensus, parseCSV: parseCSV, fromLegacy: fromLegacy, fromTrack: fromTrack, fromBackup: fromBackup, dedupeRows: dedupeRows, fromMemory: fromMemory, level: level, fmt: fmt, norm: norm, CFG: CFG, KEY: KEY,
    provider: { name: 'MANUAL / LOCAL DATABASE', note: 'Remplaçable par un fournisseur API : il suffit de fournir des lignes {date, home, away, hs, as, …} à initialize().' } };
  if (typeof module === 'object' && module.exports) module.exports = EA.database;
})(typeof window !== 'undefined' ? window : global);
