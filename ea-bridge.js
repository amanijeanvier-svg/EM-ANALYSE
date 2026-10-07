/* EA BRIDGE — branche EA DATABASE + FINAL DECISION GATE directement sur les analyses GENÈSE (football) et BASKET ANALYSE.
   Les calculs historiques ne sont pas modifiés : le verdict base de données s'ajoute sous « Paris retenus » (probabilité Genèse/Basket + base interne → probabilité finale, cote juste, décision). */
(function (g) {
  'use strict';
  var EA = g.EA = g.EA || {}; if (!EA.dbfinal) return;
  var F = EA.dbfinal, I = EA.dbintel, D = EA.database;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pc(v, d) { return v == null ? 'UNKNOWN' : (v * 100).toFixed(d == null ? 1 : d) + ' %'; }
  // ---- correspondance pari legacy → marché de la base (null = marché non couvert, jamais deviné) ----
  function mapBet(b, sport, names) {
    var e = (b && b.eval) || {}, t = e.type;
    if (sport === 'basketball') {
      if (t === 'result2way') return e.outcome === 'A' ? 'home_win' : 'away_win';
      var lb = String((b && b.label) || ''), m = /^(Plus|Moins) de ([\d.]+) points/.exec(lb); if (m) return (m[1] === 'Plus' ? 'over:' : 'under:') + m[2];
      m = /^(.+?) gagne par (\d+)\+/.exec(lb); if (m && names) { if (D.norm(m[1]) === D.norm(names.home)) return 'home_margin_gte:' + m[2]; if (D.norm(m[1]) === D.norm(names.away)) return 'away_margin_gte:' + m[2]; }
      return null;
    }
    if (t === 'goalsLine') return (e.op === 'over' ? 'over:' : 'under:') + e.line;
    if (t === 'btts') return e.side === 'yes' ? 'btts_yes' : 'btts_no';
    if (t === 'result1x2' || t === 'result') return e.outcome === 'A' ? 'home_win' : e.outcome === 'B' ? 'away_win' : e.outcome === 'draw' ? 'draw' : null;
    if (t === 'resultDC' && e.outcomes) { var o = e.outcomes.slice().sort().join(','); return o === 'A,draw' ? 'home_or_draw' : o === 'B,draw' ? 'away_or_draw' : o === 'A,B' ? 'home_or_away' : null; }
    if (t === 'statLine') { var k = { corners: 'corners', shots: 'sot', cards: 'cards' }[e.stat]; return k ? k + '_' + (e.op === 'over' ? 'over' : 'under') + ':' + e.line : null; }
    return null;
  }
  // ---- verdict (pur : testable sans DOM) ----
  function verdict(o) {
    var st = o.store, items = [], recs = o.records || [];
    (o.bets || []).forEach(function (b, i) {
      var mk = mapBet(b, o.sport, { home: o.home, away: o.away }), p = b.p > 1 ? b.p / 100 : b.p;
      if (!mk) { items.push({ i: i, label: b.label, unsupported: true, p: p }); return; }
      var R = F.analyzeFull(st, { sport: o.sport, competition: o.league || undefined, home: o.home, away: o.away, market: mk, modelP: p, odds: b.odds > 1 ? b.odds : null, live: true }, { records: recs, bankroll: o.bankroll, minStake: o.minStake });
      items.push({ i: i, label: b.label, market: mk, p: p, R: R });
    });
    var ok = items.filter(function (x) { return x.R; }), pr = I.priorities(ok.map(function (x) { return x.R; })), val = ok.filter(function (x) { return x.R.decision === 'VALUE'; });
    var top = pr.length ? 'VALUE' : ok.some(function (x) { return x.R.decision === 'CHECK'; }) ? 'CHECK' : ok.some(function (x) { return x.R.decision === 'BLOCKED'; }) ? 'BLOCKED' : 'NO BET';
    var f = { sport: o.sport, competition: o.league || undefined, before: new Date(Date.now() + 864e5).toISOString().slice(0, 10) }, tvl = [];
    if (ok.length && ok[0].R.cons && ok[0].R.cons.available) [o.home, o.away].forEach(function (t) { try { var x = I.teamVsLeague(st, t, f); if (!x.unknown) tvl.push({ team: t, items: x.items.filter(function (y) { return !y.unknown && (y.shrunkPts != null ? Math.abs(y.shrunkPts) >= 3 : Math.abs(y.shrunkRatio - 1) >= 0.08); }).slice(0, 5), n: x.n }); } catch (e) { } });
    var h2h = st.played({ sport: o.sport }).filter(function (m) { var a = D.norm(m.home), b = D.norm(m.away), x = D.norm(o.home), y = D.norm(o.away); return (a === x && b === y) || (a === y && b === x); }).slice(-5).reverse();
    var combo = null; if (val.length >= 2 && EA.parlay) { var r = EA.parlay.optimize(val.map(function (x) { return F.legOf(x.R, { home: o.home, away: o.away }); }), {}); if (r.status === 'BET') combo = r; }
    var base = ok.length ? ok[0].R : null, why = pr.length ? pr[0].result.why : [], seen = {}, noBet = !pr.length ? ok.map(function (x) { return x.R.reasons[0]; }).filter(function (r) { if (!r || seen[r]) return false; seen[r] = 1; return true; }).slice(0, 2) : [], noOdds = ok.length > 0 && ok.every(function (x) { return !(x.R.input.odds > 1); });
    return { items: items, ok: ok, priorities: pr, top: top, combo: combo, tvl: tvl, h2h: h2h, dq: base && base.dq, leak: base && base.leak, why: why, noBetReasons: noBet, unsupported: items.filter(function (x) { return x.unsupported; }).length, noOdds: noOdds, home: o.home, away: o.away, league: o.league };
  }
  var COL = { VALUE: '#2ecc71', CHECK: '#f1c40f', 'NO BET': '#8a93a6', BLOCKED: '#e74c3c' }, BADGE = { VALUE: '🔥 VALUE', CHECK: '🟡 CHECK', 'NO BET': '🚫 NO BET', BLOCKED: '🔴 BLOCKED' };
  function html(v) {
    var dq = v.dq, h = '<div class="section-title">🎯 Verdict EA × Base de données</div>';
    if (!v.ok.length) return h + '<div style="padding:10px 0;font-size:13px;opacity:.85">Aucun des paris retenus n\'est couvert par la base interne : le verdict de l\'analyse reste celui du moteur ci-dessus (aucune confirmation statistique disponible).</div>';
    h += '<div style="border-left:4px solid ' + COL[v.top] + ';padding:10px 12px;margin:8px 0;background:rgba(255,255,255,.03);border-radius:6px"><div style="font-weight:700;font-size:15px">' + BADGE[v.top] + (v.priorities.length ? ' — ' + esc(F.labelOf(v.priorities[0].result.input.market)) : '') + '</div>';
    if (v.priorities.length) { var b = v.priorities[0], r = b.result; h += '<div style="font-size:13px;margin-top:4px">' + esc(v.items.filter(function (x) { return x.R === r; })[0].label) + ' · probabilité finale ' + pc(r.probabilities.final) + ' · cote juste ' + r.fairOdds.toFixed(2) + ' · cote minimale ' + r.minOdds.toFixed(2) + ' · EV ' + (r.ev * 100).toFixed(1) + ' % · confiance ' + r.confidence.score + '/100 · risque ' + r.risk.level + '</div>'; }
    else h += '<div style="font-size:13px;margin-top:4px">' + (v.noOdds ? 'En attente des cotes : saisissez la « Cote entrée » d\'un pari ci-dessus, EA calcule alors edge, EV et la décision. Les cotes minimales pour qu\'un pari soit intéressant sont indiquées pour chaque pari.' : v.noBetReasons.length ? esc(v.noBetReasons.join(' · ')) : 'Aucun pari ne passe le contrôle final.') + '</div><div style="font-size:12px;opacity:.8;margin-top:4px">NO BET est une sortie normale du moteur : aucun pari n\'est forcé.</div>';
    h += '</div>';
    h += '<div style="font-size:12px;opacity:.85;margin:6px 0">Base interne : qualité <b>' + esc(dq.band) + '</b> (' + dq.score + '/100) · N = ' + dq.n + ' matchs · dernier match ' + esc(dq.lastMatch || '—') + ' · anti-leakage ' + esc(v.leak.icon) + (v.leak.approxUsed ? ' · ' + v.leak.approxUsed + ' match(s) à date approximative (résultats déjà connus)' : '') + '</div>';
    v.items.forEach(function (x) {
      if (x.unsupported) { h += '<div style="padding:8px 0;border-top:1px solid rgba(255,255,255,.08);font-size:13px"><b>' + esc(x.label) + '</b><div style="opacity:.75;font-size:12px">Marché non couvert par la base interne (aucune estimation inventée).</div></div>'; return; }
      var R = x.R, p = R.probabilities, sg = (R.cons && R.cons.signals) || [], base = sg.filter(function (s) { return s.name.indexOf('League') === 0; })[0];
      h += '<details style="padding:8px 0;border-top:1px solid rgba(255,255,255,.08)"><summary style="cursor:pointer;overflow-wrap:anywhere"><b>' + BADGE[R.decision] + '</b> · ' + esc(x.label) + ' <span style="opacity:.8">— ' + (p ? 'Moteur ' + pc(x.p, 0) + ' → final ' + pc(p.final, 0) + ' · cote min. ' + R.minOdds.toFixed(2) + (R.input.odds > 1 ? ' · edge ' + (R.edgePts == null ? '—' : R.edgePts.toFixed(1) + ' pts') + ' · EV ' + (R.ev * 100).toFixed(1) + ' %' : '') : esc(R.reasons[0] || '')) + '</span></summary><div style="font-size:12.5px;line-height:1.5;padding:6px 0">';
      if (p) { h += '<div>Probabilité moteur <b>' + pc(x.p) + '</b> · base interne (consensus) <b>' + pc(R.cons.p) + '</b> · finale <b>' + pc(p.final) + '</b>' + (base ? ' · baseline ligue ' + pc(base.raw) + ' (N=' + base.n + ')' : '') + '</div><div>Cote juste <b>' + R.fairOdds.toFixed(2) + '</b> · cote minimale acceptable <b>' + R.minOdds.toFixed(2) + '</b>' + (R.input.odds > 1 ? ' · cote saisie ' + R.input.odds + ' · edge ' + (R.edgePts == null ? '—' : R.edgePts.toFixed(1) + ' pts') + ' · EV ' + (R.ev * 100).toFixed(1) + ' %' : ' · <i>saisissez la cote du bookmaker pour obtenir l\'edge et l\'EV</i>') + '</div>';
        h += '<div>Confiance ' + R.confidence.score + '/100 · risque ' + R.risk.level + ' · stabilité ' + (R.stability && R.stability.available ? R.stability.label + ' (' + R.stability.stability + '/100)' : '—') + ' · conflit ' + (R.conflict && R.conflict.score != null ? R.conflict.label + ' (' + R.conflict.score + '/100)' : '—') + ' · ' + esc(R.uncertainty.note) + '</div>';
        h += '<div style="margin-top:4px">' + sg.map(function (s) { return esc(s.name) + ' : ' + (s.k == null ? pc(s.p) : s.k + '/' + s.n + ' → ' + pc(s.p)); }).join(' · ') + '</div>'; if (R.cons.conflict) h += '<div style="color:#f1c40f">⚠️ CONFLIT STATISTIQUE : signal insuffisamment cohérent</div>'; }
      h += '<div style="margin-top:4px"><b>Contrôle final</b> : ' + R.checks.filter(function (c) { return c.ok !== null; }).map(function (c) { return (c.ok ? '✓ ' : '✗ ') + esc(c.label); }).join(' · ') + '</div>' + (R.decision !== 'VALUE' ? '<div><b>Pourquoi pas :</b> ' + esc(R.reasons.join(' · ')) + '</div>' : '<div><b>Pourquoi :</b> ' + esc(R.why.slice(0, 4).join(' · ') || R.reasons[0]) + '</div>') + '</div></details>'; });
    if (v.tvl.length) h += '<div style="margin-top:10px"><b style="font-size:13px">Équipes vs baseline du championnat</b>' + v.tvl.map(function (t) { return '<div style="font-size:12.5px;padding:4px 0"><b>' + esc(t.team) + '</b> (N=' + t.n + ') : ' + (t.items.length ? t.items.map(function (y) { return esc(y.name) + ' ' + (y.shrunkPts != null ? (y.shrunkPts >= 0 ? '+' : '') + y.shrunkPts.toFixed(1) + ' pts' : '×' + y.shrunkRatio.toFixed(2)); }).join(' · ') : 'proche de la moyenne du championnat') + '</div>'; }).join('') + '</div>';
    if (v.h2h.length) h += '<div style="margin-top:8px;font-size:12.5px"><b>H2H en base</b> : ' + v.h2h.map(function (m) { return esc(m.home) + ' ' + m.hs + '-' + m.as + ' ' + esc(m.away); }).join(' · ') + ' <span style="opacity:.7">(poids réduit si ancien)</span></div>';
    h += '<div style="margin-top:10px;padding:8px 10px;border-radius:6px;background:rgba(255,255,255,.04);font-size:13px">' + (v.combo ? '<b>🔥 COMBINÉ RENTABLE</b> : ' + v.combo.legs.map(function (l) { return esc(l.market + ' ' + l.selection) + ' @' + l.odds; }).join(' + ') + ' → cote ' + v.combo.odds.toFixed(2) + ', probabilité jointe ' + pc(v.combo.pJoint) + ', EV ' + (v.combo.ev * 100).toFixed(1) + ' % (corrélation provisoire).' : '❌ Aucun combiné suffisamment solide.') + '</div>';
    if (v.unsupported) h += '<div style="font-size:11.5px;opacity:.7;margin-top:6px">' + v.unsupported + ' pari(s) hors couverture de la base.</div>';
    return h + '<div style="font-size:11.5px;opacity:.7;margin-top:8px">Probabilités et verdicts = estimations statistiques, jamais une garantie de gain. Source : EA DATABASE (interne), version ' + esc(EA.dbui ? EA.dbui.store().meta().name : '') + '.</div>';
  }
  // ---- câblage DOM ----
  var lastSync = 0;
  function sync(force) { if (!EA.dbui) return; var now = Date.now(); if (!force && now - lastSync < 2000) return; lastSync = now; try { var src = EA.dbui.sources(), rows = src.reduce(function (a, x) { return a.concat(x.rows); }, []), s = EA.dbui.store(); if (!rows.length) return; if (s.meta().state !== 'READY') s.initialize(src); else s.upsert(rows); } catch (e) { try { EA.dbui.store().log('ERROR', 'Sync : ' + e.message); } catch (e2) { } } }
  function proRecs() { try { var raw = JSON.parse(g.localStorage.getItem('ea_pro_memory')); return raw && raw.analyses || []; } catch (e) { return []; } }
  function render(sport) {
    var hostId = sport === 'football' ? 'betsListGe' : 'betsListBk', host = document.getElementById(hostId); var DBx = typeof DB !== 'undefined' ? DB : null; if (!host || !DBx || !EA.dbui) return;
    var rec = (DBx[sport] || [])[0]; if (!rec || Date.now() - rec.timestamp > 6 * 3600 * 1000 || !rec.bets) return;
    sync(true); var box = document.getElementById('eaDb_' + sport);
    if (!box) { box = document.createElement('div'); box.id = 'eaDb_' + sport; box.style.cssText = 'padding:0 22px 22px;max-width:100%;overflow-wrap:anywhere'; host.parentNode.parentNode.insertBefore(box, host.parentNode.nextSibling); }
    var bets = rec.bets.map(function (b, i) { var inp = document.querySelector('.odds-input-bet[data-rec="' + rec.id + '"][data-idx="' + i + '"][data-kind="entry"]'), od = inp ? parseFloat(inp.value) : NaN; return Object.assign({}, b, { odds: od > 1 ? od : null }); });
    var v; try { v = verdict({ store: EA.dbui.store(), sport: sport, home: rec.nameA, away: rec.nameB, league: rec.league, bets: bets, records: proRecs() }); box.innerHTML = html(v); }
    catch (e) { box.innerHTML = '<div class="section-title">🎯 Verdict EA × Base de données</div><div style="font-size:12.5px;opacity:.85">Verdict base de données indisponible (' + esc(e.message) + '). L\'analyse ci-dessus n\'est pas affectée.</div>'; try { EA.dbui.store().log('ERROR', 'Bridge ' + sport + ' : ' + e.message); } catch (e2) { } return; }
    try { rec.dbVerdict = { at: Date.now(), top: v.top, items: v.ok.map(function (x) { return { label: x.label, decision: x.R.decision, pFinal: x.R.probabilities ? x.R.probabilities.final : null }; }), baseN: v.dq && v.dq.n, engine: EA.core && EA.core.VERSION }; if (typeof g.persistDB === 'function') g.persistDB(); } catch (e) { }
  }
  function boot() {
    [['generateBtn', 'football'], ['bkGenerateBtn', 'basketball']].forEach(function (p) { var b = document.getElementById(p[0]); if (b) b.addEventListener('click', function () { setTimeout(function () { try { render(p[1]); } catch (e) { } }, 0); }); });
    var t = null; document.addEventListener('input', function (e) { var el = e.target; if (!el || !el.classList || !el.classList.contains('odds-input-bet') || el.getAttribute('data-kind') !== 'entry') return; var sp = el.getAttribute('data-sport'); clearTimeout(t); t = setTimeout(function () { try { render(sp); } catch (e2) { } }, 350); });
    if (typeof g.markResult === 'function') { var mr = g.markResult; g.markResult = function () { var r = mr.apply(this, arguments); try { sync(true); } catch (e) { } return r; }; }
    setTimeout(function () { sync(true); }, 400);
  }
  EA.bridge = { mapBet: mapBet, verdict: verdict, html: html, render: render, sync: sync };
  if (typeof document !== 'undefined') { if (document.readyState === 'complete') boot(); else g.addEventListener('load', boot); }
  if (typeof module === 'object' && module.exports) module.exports = EA.bridge;
})(typeof window !== 'undefined' ? window : global);
