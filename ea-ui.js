/* EA-VALUE 3.0 — INTERFACE PRO (onglet « Pro 3.0 ») : zones aérées, une colonne sur mobile. Aucune formule ici : tout passe par EA.engine. */
(function (g) {
  'use strict';
  var EA = g.EA, C = EA.core, doc = g.document;
  var LS = (function () { try { g.localStorage.setItem('__t', '1'); g.localStorage.removeItem('__t'); return g.localStorage; } catch (e) { var m = {}; return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; } }; } })();
  var S = { sport: 'football', mode: 'VALUE', tab: 'analyse', ctx: { h: {}, a: {} }, last: null, shock: null, settings: null, memory: null, msg: '' };
  var LV = ['green', 'yellow', 'orange', 'red', 'unknown'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return doc.getElementById(id); }
  function nv(id) { var e = $(id); if (!e) return null; var v = String(e.value).replace(',', '.').trim(); return v === '' ? null : C.num(v); }
  function sv(id) { var e = $(id); return e ? String(e.value).trim() : ''; }
  function pc(p) { return C.isNum(p) ? (p * 100).toFixed(1) + ' %' : 'DATA UNAVAILABLE'; }
  function od(o) { return C.isNum(o) ? o.toFixed(2) : '—'; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function cfg() { var o = S.settings.configOverride; return o ? C.merge(C.DEFAULT_CONFIG, o) : C.DEFAULT_CONFIG; }
  function save() { EA.storage.saveSettings(LS, S.settings); }
  function records() { return S.memory.all().filter(function (r) { return r.type !== 'combo'; }); }
  function chip(txt, cls) { return '<span class="pro-chip ' + (cls || '') + '">' + esc(txt) + '</span>'; }
  function qcls(v) { return !C.isNum(v) ? 'grey' : v >= 75 ? 'green' : v >= 55 ? 'yellow' : 'red'; }
  function decCls(d) { return d === 'NO BET' ? 'NOBET' : d; }

  // ---------- squelette ----------
  function field(id, label, ph, extra) { return '<div class="pro-field"><label for="' + id + '">' + label + '</label><input class="pro-in" id="' + id + '" type="text" inputmode="decimal" placeholder="' + (ph || '') + '" ' + (extra || '') + '></div>'; }
  function emoGroup(side, key, title) {
    var cur = S.ctx[side][key] || 'unknown';
    return '<div><div class="pro-lab">' + title + '</div><div class="pro-emos" data-side="' + side + '" data-key="' + key + '">' +
      LV.map(function (l) { return '<button type="button" class="pro-emo' + (l === cur ? ' on' : '') + '" data-v="' + l + '" aria-label="' + esc(EA.context.LABELS[key][l]) + '">' + EA.context.EMOJI[l] + '</button>'; }).join('') +
      '</div><div class="pro-state" id="st_' + side + '_' + key + '">' + esc(EA.context.LABELS[key][cur]) + '</div></div>';
  }
  function lineupGroup(side) {
    var cur = S.ctx[side].lineup || 'unknown', opts = [['yes', 'Confirmée'], ['no', 'Non confirmée'], ['unknown', 'Inconnue']];
    return '<div><div class="pro-lab">Composition officielle</div><div class="pro-emos" data-side="' + side + '" data-key="lineup">' + opts.map(function (o) { return '<button type="button" class="pro-emo' + (o[0] === cur ? ' on' : '') + '" style="font-size:12px" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div></div>';
  }
  function sideBlock(side, name) {
    var fb = S.sport === 'football';
    var stats = fb ? field('p_' + side + '_gf', 'Buts marqués / match', '1.8') + field('p_' + side + '_ga', 'Buts encaissés / match', '1.0') + field('p_' + side + '_n', 'Matchs joués', '8') + field('p_' + side + '_elo', 'Elo (optionnel)', '1650')
      : field('p_' + side + '_pace', 'Pace', '99') + field('p_' + side + '_ortg', 'Off. rating', '114') + field('p_' + side + '_drtg', 'Def. rating', '112') + field('p_' + side + '_n', 'Matchs joués', '20');
    var prior = fb ? field('p_' + side + '_pgf', 'Buts marqués saison préc.', '') + field('p_' + side + '_pga', 'Buts encaissés saison préc.', '') + field('p_' + side + '_xgf', 'xG / match', '') + field('p_' + side + '_xga', 'xGA / match', '')
      : field('p_' + side + '_ppace', 'Pace saison préc.', '') + field('p_' + side + '_portg', 'ORtg saison préc.', '') + field('p_' + side + '_pdrtg', 'DRtg saison préc.', '');
    var pl = fb ? 'Nom, buts, passes déc. (une ligne par absent)' : 'Nom, points/match, passes/match, rebonds/match';
    var tt = fb ? field('p_' + side + '_t1', 'Buts de l\'équipe (même période)', '') + field('p_' + side + '_t2', 'Passes déc. équipe', '') : field('p_' + side + '_t1', 'Points/match équipe', '') + field('p_' + side + '_t2', 'Passes/match équipe', '') + field('p_' + side + '_t3', 'Rebonds/match équipe', '');
    return '<div class="pro-side"><h4 id="p_' + side + '_title">' + esc(name) + '</h4><div class="pro-fields">' + stats + '</div>' +
      '<details class="pro-det"><summary>Historique saison précédente / ' + (fb ? 'xG' : 'compléments') + ' (optionnel)</summary><div class="pro-fields">' + prior + '</div></details>' +
      emoGroup(side, 'effectif', 'EFFECTIF — joueurs importants absents ?') + emoGroup(side, 'fatigue', 'FATIGUE') + emoGroup(side, 'rotation', 'ROTATION / COMPOSITION') + lineupGroup(side) +
      '<details class="pro-det"><summary>Détails facultatifs : absents, calendrier</summary><div class="pro-field"><label for="p_' + side + '_pl">' + pl + '</label><textarea class="pro-in" id="p_' + side + '_pl"></textarea></div><div class="pro-fields">' + tt + '</div>' +
      '<div class="pro-field"><label for="p_' + side + '_dates">Dates des derniers matchs (AAAA-MM-JJ, séparées par des virgules)</label><textarea class="pro-in" id="p_' + side + '_dates"></textarea></div></details></div>';
  }
  function shell() {
    return '<div class="pro-wrap">' +
      '<div class="pro-card pro-head"><div class="pro-title"><b>EA VALUE PRO</b><span class="pro-ver" id="proVer">' + C.VERSION + '</span></div>' +
      '<div class="pro-row"><div class="pro-seg" id="proSport"><button data-v="football">⚽ Football</button><button data-v="basketball">🏀 Basketball</button></div><div class="pro-chip grey" id="proDate">' + today() + '</div></div>' +
      '<div class="pro-row"><div class="pro-seg" id="proMode"><button data-v="VALUE">MODE VALUE</button><button data-v="HIGH_PROBABILITY">HIGH PROBABILITY</button></div><div class="pro-seg" style="flex:0 1 120px"><button id="proFast">FAST MODE</button></div></div></div>' +
      '<div class="pro-card pro-sum" id="proSummary" role="button" tabindex="0"></div>' +
      '<div class="pro-subnav" id="proNav"><button data-t="analyse">ANALYSE</button><button data-t="marches">MARCHÉS</button><button data-t="decision">DÉCISION</button><button data-t="historique">HISTORIQUE</button><button data-t="lab">MODEL LAB</button><button data-t="bankroll">BANKROLL</button></div>' +
      '<div class="pro-pane" id="pane-analyse"></div><div class="pro-pane" id="pane-marches"></div><div class="pro-pane" id="pane-decision"></div><div class="pro-pane" id="pane-historique"></div><div class="pro-pane" id="pane-lab"></div><div class="pro-pane" id="pane-bankroll"></div></div>';
  }
  function renderAnalyse() {
    var fb = S.sport === 'football';
    var lg = fb ? field('p_lgH', 'Buts/match à domicile (ligue)', '1.5') + field('p_lgA', 'Buts/match à l\'extérieur (ligue)', '1.2')
      : field('p_lgPace', 'Pace de ligue', '98') + field('p_lgOrtg', 'Off. rating de ligue', '113') + field('p_homeAdv', 'Avantage domicile (points)', '2.5');
    var sd = fb ? '' : '<details class="pro-det"><summary>Écarts-types (optionnel — sinon PROVISOIRES)</summary><div class="pro-fields">' + field('p_sdM', 'Écart-type de la marge', '') + field('p_sdT', 'Écart-type du total', '') + '</div></details>';
    $('pane-analyse').innerHTML =
      '<div class="pro-card"><h3>Match center</h3><div class="pro-fields">' +
      '<div class="pro-field"><label for="p_home">Équipe à domicile</label><input class="pro-in" id="p_home" type="text" autocomplete="off"></div><div class="pro-field"><label for="p_away">Équipe à l\'extérieur</label><input class="pro-in" id="p_away" type="text" autocomplete="off"></div>' +
      '<div class="pro-field"><label for="p_comp">Compétition</label><input class="pro-in" id="p_comp" type="text"></div><div class="pro-field"><label for="p_date">Date du match</label><input class="pro-in" id="p_date" type="date" value="' + today() + '"></div>' +
      '<div class="pro-field" style="grid-column:1/-1"><label for="p_dts">Date des statistiques saisies (fraîcheur)</label><input class="pro-in" id="p_dts" type="date" value="' + today() + '"></div></div></div>' +
      '<div class="pro-card"><h3>Ligue et début de saison</h3><div class="pro-fields">' + lg + '</div>' + sd +
      '<div class="pro-field"><label for="p_squad">Stabilité de l\'effectif (mercato, changements)</label><select class="pro-in" id="p_squad"><option value="unknown">Je ne sais pas</option><option value="stable">Stable</option><option value="changed">Modifié</option></select></div></div>' +
      '<div class="pro-grid two">' + sideBlock('h', 'Domicile') + sideBlock('a', 'Extérieur') + '</div>' +
      '<div class="pro-card"><button class="pro-btn primary" id="proRun" type="button">ANALYSER</button><p class="pro-dim" id="proRunMsg">Champ vide = information manquante (DATA UNAVAILABLE) : rien n\'est inventé, l\'incertitude augmente.</p></div>';
  }
  function renderMarches() {
    var fb = S.sport === 'football', body;
    if (fb) body = '<div class="pro-card"><h3>1X2</h3><div class="pro-fields">' + field('p_o_h', 'Domicile', '1.90') + field('p_o_d', 'Nul', '3.40') + field('p_o_a', 'Extérieur', '4.20') + '</div></div>' +
      '<div class="pro-card"><h3>Total de buts</h3><div class="pro-fields">' + field('p_o_ol', 'Ligne', '2.5') + '<div></div>' + field('p_o_ov', 'Plus de', '1.90') + field('p_o_un', 'Moins de', '1.90') + '</div></div>' +
      '<div class="pro-card"><h3>BTTS</h3><div class="pro-fields">' + field('p_o_by', 'Oui', '1.80') + field('p_o_bn', 'Non', '1.95') + '</div></div>';
    else body = '<div class="pro-card"><h3>Moneyline</h3><div class="pro-fields">' + field('p_o_mh', 'Domicile', '1.70') + field('p_o_ma', 'Extérieur', '2.20') + '</div></div>' +
      '<div class="pro-card"><h3>Handicap (ligne du domicile)</h3><div class="pro-fields">' + field('p_o_sl', 'Ligne (ex. -3.5)', '-3.5') + '<div></div>' + field('p_o_sh', 'Cote domicile', '1.91') + field('p_o_sa', 'Cote extérieur', '1.91') + '</div></div>' +
      '<div class="pro-card"><h3>Total de points</h3><div class="pro-fields">' + field('p_o_tl', 'Ligne', '224.5') + '<div></div>' + field('p_o_to', 'Plus de', '1.91') + field('p_o_tu', 'Moins de', '1.91') + '</div></div>';
    $('pane-marches').innerHTML = body + '<div class="pro-card"><button class="pro-btn primary" id="proRun2" type="button">RECALCULER</button><p class="pro-dim">Les cotes ne modifient jamais la probabilité du modèle : elles servent au prix, à l\'edge et à l\'EV.</p></div><div id="proValue"></div>';
  }

  // ---------- collecte ----------
  function parsePlayers(txt, fb) {
    return String(txt || '').split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var p = l.split(','); var a = C.num((p[1] || '').replace(',', '.')), b = C.num(p[2]), c = C.num(p[3]);
      return fb ? { name: p[0].trim(), goals: a, assists: b } : { name: p[0].trim(), ppg: a, apg: b, rpg: c };
    });
  }
  function ctxFor(side) {
    var fb = S.sport === 'football', c = S.ctx[side], pl = parsePlayers(sv('p_' + side + '_pl'), fb);
    var team = fb ? { goals: nv('p_' + side + '_t1'), assists: nv('p_' + side + '_t2') } : { ppg: nv('p_' + side + '_t1'), apg: nv('p_' + side + '_t2'), rpg: nv('p_' + side + '_t3') };
    var dates = sv('p_' + side + '_dates').split(/[,\s;]+/).filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); });
    return { effectif: { level: c.effectif || 'unknown', players: pl, team: team }, fatigue: { level: c.fatigue || 'unknown', schedule: dates.length ? { matchDate: sv('p_date'), previousDates: dates } : null },
      rotation: { level: c.rotation || 'unknown', lineupConfirmed: c.lineup === 'yes' ? true : c.lineup === 'no' ? false : null } };
  }
  function statsFor(side) {
    if (S.sport === 'football') return { gf: nv('p_' + side + '_gf'), ga: nv('p_' + side + '_ga'), n: nv('p_' + side + '_n'), elo: nv('p_' + side + '_elo'), priorGf: nv('p_' + side + '_pgf'), priorGa: nv('p_' + side + '_pga'), xgf: nv('p_' + side + '_xgf'), xga: nv('p_' + side + '_xga') };
    return { pace: nv('p_' + side + '_pace'), ortg: nv('p_' + side + '_ortg'), drtg: nv('p_' + side + '_drtg'), n: nv('p_' + side + '_n'), priorPace: nv('p_' + side + '_ppace'), priorOrtg: nv('p_' + side + '_portg'), priorDrtg: nv('p_' + side + '_pdrtg') };
  }
  function collect() {
    var recs = records(), perf = EA.memory.modelPerf(recs), health = { consensus: EA.memory.modelHealth(recs, 'consensus', cfg()) };
    Object.keys(perf).forEach(function (id) { health[id] = EA.memory.modelHealth(recs, id, cfg()); });
    var ts = sv('p_dts'), base = { sport: S.sport, home: sv('p_home') || 'Domicile', away: sv('p_away') || 'Extérieur', competition: sv('p_comp'), matchDate: sv('p_date') || today(), dataTimestamp: ts ? ts + 'T12:00:00' : null,
      homeStats: statsFor('h'), awayStats: statsFor('a'), squadStability: sv('p_squad'), context: { home: ctxFor('h'), away: ctxFor('a') }, mode: S.mode, fast: !!S.settings.fast, iterations: S.settings.fast ? null : S.settings.mcIterations,
      bankroll: S.settings.bankroll, minStake: S.settings.minStake, config: cfg(), modelPerf: perf, modelHealth: health };
    if (S.sport === 'football') {
      base.league = { avgHome: nv('p_lgH'), avgAway: nv('p_lgA') };
      base.markets = { '1X2': { home: nv('p_o_h'), draw: nv('p_o_d'), away: nv('p_o_a') }, ou: { line: nv('p_o_ol') || 2.5, over: nv('p_o_ov'), under: nv('p_o_un') }, btts: { yes: nv('p_o_by'), no: nv('p_o_bn') } };
      if (!$('p_o_h')) { base.markets = (S.lastInput && S.lastInput.markets) || {}; }
    } else {
      base.league = { pace: nv('p_lgPace'), ortg: nv('p_lgOrtg') }; base.homeAdvPts = nv('p_homeAdv'); base.sdMargin = nv('p_sdM'); base.sdTotal = nv('p_sdT');
      base.spreadLine = nv('p_o_sl'); base.totalLine = nv('p_o_tl');
      base.markets = { moneyline: { home: nv('p_o_mh'), away: nv('p_o_ma') }, spread: { home: nv('p_o_sh'), away: nv('p_o_sa') }, total: { over: nv('p_o_to'), under: nv('p_o_tu') } };
    }
    return base;
  }

  // ---------- rendu des résultats ----------
  function mLabel(m, r) {
    var mk = m.market, s = m.selection, h = esc(r.home), a = esc(r.away);
    if (mk === '1X2') return '1X2 · ' + (s === 'home' ? 'Victoire ' + h : s === 'draw' ? 'Match nul' : 'Victoire ' + a);
    if (mk.indexOf('ou:') === 0) return (s === 'over' ? 'Plus de ' : 'Moins de ') + mk.slice(3) + ' buts';
    if (mk === 'btts') return 'BTTS · ' + (s === 'yes' ? 'Oui' : 'Non');
    if (mk === 'ml') return 'Moneyline · ' + (s === 'home' ? h : a);
    if (mk.indexOf('spread:') === 0) { var L = parseFloat(mk.slice(7)); var v = s === 'home' ? L : -L; return 'Handicap · ' + (s === 'home' ? h : a) + ' ' + (v > 0 ? '+' : '') + v; }
    if (mk.indexOf('total:') === 0) return (s === 'over' ? 'Plus de ' : 'Moins de ') + mk.slice(6) + ' points';
    return mk + ' ' + s;
  }
  function renderSummary() {
    var r = S.last, el = $('proSummary');
    if (!r) { el.innerHTML = '<h3>Décision</h3><p class="pro-dim">Aucune analyse. Renseigne les données puis appuie sur ANALYSER.</p>'; return; }
    el.innerHTML = '<h3>Décision · signal principal</h3><div class="pro-dec ' + decCls(r.decision.decision) + '">' + esc(r.decision.decision) + '</div><p>' + esc(r.signal) + '</p><div class="pro-row">' +
      chip('Data ' + r.dataQuality.score + '/100', qcls(r.dataQuality.score)) + chip('Contexte ' + r.context.quality.score + '/100', qcls(r.context.quality.score)) + chip('Stabilité ' + r.stability, r.stability === 'Stable' ? 'green' : r.stability === 'Instable' ? 'red' : 'yellow') + '</div>';
  }
  function renderDecision() {
    var r = S.last, el = $('pane-decision'); if (!r) { el.innerHTML = '<div class="pro-card"><p class="pro-dim">Aucune analyse pour le moment.</p></div>'; return; }
    if (!r.pick) {
      var u = r.unavailable || {};
      el.innerHTML = '<div class="pro-card"><h3>Decision center</h3><div class="pro-dec NOBET">NO BET</div><p><b>NO QUALIFIED OPPORTUNITY</b></p><p class="pro-warn">' + esc(u.label || 'INSUFFICIENT DATA') + ' : ' + esc(u.reason || 'données insuffisantes') + '</p><p class="pro-dim">Aucune valeur n\'est inventée : complète les statistiques manquantes puis relance l\'analyse.</p></div>' +
        '<div class="pro-card"><h3>Qualité des informations</h3><div class="pro-kv"><span>Data Quality</span><span>' + r.dataQuality.score + '/100</span></div>' + (r.dataQuality.missing.length ? '<p class="pro-dim">Manquant : ' + r.dataQuality.missing.map(esc).join(', ') + '</p>' : '') + '</div>';
      return;
    }
    var d = r.decision, c = r.commentary, e = r.early, cq = r.context.quality, dq = r.dataQuality, fr = r.freshness, html = '';
    html += '<div class="pro-card"><h3>Decision center</h3><div class="pro-dec ' + decCls(d.decision) + '">' + esc(d.decision) + '</div><p><b>' + esc(mLabel(r.pick, r)) + '</b></p>' +
      (d.reasons.length ? '<ul class="pro-list">' + d.reasons.slice(0, 5).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
      d.notes.map(function (n) { return '<p class="pro-warn">' + esc(n) + '</p>'; }).join('') + '</div>';
    if (S.shock && S.shock.isShock) html += '<div class="pro-shock"><h3>INFORMATION SHOCK</h3><p>Probabilité : ' + (S.shock.before * 100).toFixed(0) + ' % → ' + (S.shock.after * 100).toFixed(0) + ' % (' + (S.shock.change > 0 ? '+' : '') + S.shock.change.toFixed(1) + ' points)</p><p class="pro-dim">Cause : ' + esc(S.shock.cause) + '</p></div>';
    html += '<div class="pro-card"><h3>Commentaire</h3><p><b>Signal principal.</b> ' + esc(c.signal) + '</p>' +
      '<div><div class="pro-lab">POUR</div><ul class="pro-list">' + (c.pour.length ? c.pour.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') : '<li>Aucun facteur favorable documenté</li>') + '</ul></div>' +
      '<div><div class="pro-lab">CONTRE</div><ul class="pro-list">' + (c.contre.length ? c.contre.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') : '<li>Aucun facteur défavorable documenté</li>') + '</ul></div>' +
      '<div><div class="pro-lab">RISQUES</div><ul class="pro-list">' + (c.risques.length ? c.risques.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') : '<li>Aucun risque signalé</li>') + '</ul></div>' +
      (c.prix ? '<div class="pro-kv"><span>Cote actuelle</span><span>' + od(c.prix.current) + '</span><span>Cote juste</span><span>' + od(c.prix.fair) + '</span><span>Minimum acceptable</span><span>' + od(c.prix.minimum) + '</span></div>' : '') +
      '<div class="pro-kv"><span>Stabilité</span><span>' + esc(c.stability) + '</span><span>Qualité des données</span><span>' + esc(c.dataQuality) + '</span></div><p><b>Conclusion.</b> ' + esc(c.conclusion) + '</p></div>';
    html += '<div class="pro-card"><h3>Qualité des informations</h3><div class="pro-kv"><span>Data Quality</span><span>' + dq.score + '/100</span><span>Early Season Reliability</span><span>' + (e && e.reliability != null ? e.reliability + '/100' : 'INSUFFICIENT DATA') + '</span><span>Context Quality</span><span>' + cq.score + '/100</span><span>Fraîcheur</span><span>' + esc(fr.label) + (fr.ageHours != null ? ' (' + Math.round(fr.ageHours) + ' h)' : '') + '</span></div>' +
      '<p class="pro-dim">Ces scores mesurent la fiabilité des informations, PAS une probabilité de victoire.</p>' +
      (e && e.mode != null ? '<p class="pro-dim">' + esc(e.label) + ' · échantillon ' + esc(e.details.echantillon) + ' · historique ' + esc(e.details.historique) + ' · effectif ' + esc(e.details.effectif) + ' · incertitude ' + esc(e.details.incertitude) + ' · ' + esc(e.weightsStatus) + '</p>' : '') +
      (dq.missing.length ? '<details class="pro-det"><summary>Données manquantes (' + dq.missing.length + ')</summary><p class="pro-dim">' + dq.missing.map(esc).join(', ') + '</p></details>' : '') + '</div>';
    var cx = r.context;
    html += '<div class="pro-card"><h3>Contexte</h3><div class="pro-kv"><span>Effectif dom. / ext.</span><span>' + cx.home.effectif.emoji + ' ' + cx.away.effectif.emoji + '</span><span>Impact estimé</span><span>' + esc(cx.home.effectif.impact) + ' / ' + esc(cx.away.effectif.impact) + '</span><span>Fatigue</span><span>' + cx.home.fatigue.emoji + ' ' + cx.away.fatigue.emoji + '</span><span>Rotation</span><span>' + cx.home.rotation.emoji + ' ' + cx.away.rotation.emoji + '</span></div>' +
      (cx.home.rotation.lineupConfirmed && cx.away.rotation.lineupConfirmed ? '' : '<p class="pro-warn">LINEUP NOT CONFIRMED</p>') + '</div>';
    var models = Object.keys(r.pick.modelProbs).map(function (id) { var st = (r.modelStatus.filter(function (m) { return m.id === id; })[0] || {}).status || 'IMPLEMENTED'; return '<span>' + esc(id) + ' · ' + esc(st) + '</span><span>' + pc(r.pick.modelProbs[id]) + '</span>'; }).join('');
    html += '<div class="pro-card"><h3>Model center</h3><div class="pro-kv">' + models + '<span><b>Consensus</b></span><span><b>' + pc(r.pick.p) + '</b></span></div><p class="pro-dim">' + esc(r.weightsLabel) + ' · accord ' + (r.modelAgreementPct != null ? r.modelAgreementPct + ' %' : 'inconnu') + ' · ' +
      (r.simulation ? 'Monte Carlo : ' + r.simulation.iterationsRun + ' simulations réellement exécutées' : '') + (r.simulation && r.simulation.sdProvisional ? ' · écarts-types PROVISOIRES' : '') + '</p>' +
      (r.expectations ? '<div class="pro-kv"><span>Pace attendue</span><span>' + r.expectations.pace.toFixed(1) + '</span><span>Points attendus</span><span>' + r.expectations.pointsHome.toFixed(1) + ' – ' + r.expectations.pointsAway.toFixed(1) + '</span><span>Marge attendue</span><span>' + r.expectations.margin.toFixed(1) + '</span><span>Total attendu</span><span>' + r.expectations.total.toFixed(1) + '</span></div>' : '') +
      (r.lambdas ? '<div class="pro-kv"><span>Buts attendus (λ)</span><span>' + r.lambdas.home.toFixed(2) + ' – ' + r.lambdas.away.toFixed(2) + '</span></div>' : '') +
      (r.marketBenchmark ? '<p class="pro-dim">Benchmark marché (informatif, hors P_MODEL) : marge ' + r.marketBenchmark.overroundPct.toFixed(1) + ' %</p>' : '') + '</div>';
    var fi = r.featureImportance, mx = Math.max.apply(null, [0.0001].concat(r.evidence.factors.map(function (f) { return Math.abs(f.delta); })));
    html += '<div class="pro-card"><h3>Evidence ledger</h3>' + (r.evidence.factors.length ? r.evidence.factors.map(function (f) { return '<div class="pro-bar"><span>' + esc(f.name) + ' <b class="pro-mono">' + (f.delta > 0 ? '+' : '') + f.delta.toFixed(1) + '</b></span><span><i class="' + (f.delta < 0 ? 'neg' : '') + '" style="width:' + Math.max(4, Math.round(Math.abs(f.delta) / mx * 100)) + '%"></i></span></div>'; }).join('') +
      '<div class="pro-kv"><span><b>NET IMPACT</b></span><span><b>' + (r.evidence.net > 0 ? '+' : '') + r.evidence.net.toFixed(1) + ' pts</b></span></div>' : '<p class="pro-dim">DATA UNAVAILABLE</p>') + '<p class="pro-dim">Contribution de chaque facteur à la probabilité du signal, en points.</p></div>';
    if (r.warnings.length) html += '<div class="pro-card"><h3>Avertissements</h3>' + r.warnings.map(function (w) { return '<p class="pro-warn">' + esc(w) + '</p>'; }).join('') + '</div>';
    html += '<div class="pro-card"><button class="pro-btn primary" data-save="' + r.markets.indexOf(r.pick) + '" type="button">ENREGISTRER DANS EA MEMORY</button><p class="pro-dim" id="proSaveMsg">' + esc(S.msg) + '</p></div>';
    el.innerHTML = html;
  }
  function renderValue() {
    var r = S.last, el = $('proValue'); if (!el) return; if (!r || !r.pick) { el.innerHTML = r ? '<div class="pro-card"><p class="pro-warn">INSUFFICIENT DATA : value non calculable.</p></div>' : ''; return; }
    el.innerHTML = '<div class="pro-card"><h3>Value center</h3></div>' + r.markets.map(function (m, i) {
      var v = m.value;
      return '<div class="pro-card"><div class="pro-row" style="justify-content:space-between;align-items:center"><b>' + mLabel(m, r) + '</b>' + chip(m.decision.decision, m.decision.decision === 'BET' ? 'green' : m.decision.decision === 'CHECK' ? 'yellow' : 'red') + '</div>' +
        '<div class="pro-kv"><span>Probabilité</span><span>' + pc(m.p) + '</span><span>Cote juste</span><span>' + od(v.fairOdds) + '</span><span>Cote actuelle</span><span>' + od(v.currentOdds) + '</span><span>Edge</span><span>' + (v.edgePts != null ? (v.edgePts > 0 ? '+' : '') + v.edgePts.toFixed(1) + ' pts' : '—') + '</span><span>EV</span><span>' + (v.ev != null ? (v.ev * 100).toFixed(1) + ' %' : '—') + '</span><span>Minimum acceptable</span><span>' + od(v.targetMinimum) + '</span></div>' +
        (v.status === 'VALUE_LOST' ? '<p class="pro-warn">VALUE LOST — NO BET</p>' : v.status === 'NO_PRICE' ? '<p class="pro-dim">Aucune cote saisie : value non calculable.</p>' : '') +
        '<p class="pro-dim">Fourchette d\'incertitude heuristique ±' + m.uncertaintyHalfPts.toFixed(1) + ' pts (garde-fou, pas un intervalle de confiance calibré).</p>' +
        '<button class="pro-btn small" data-save="' + i + '" type="button">Enregistrer ce marché</button></div>';
    }).join('');
  }
  function renderHistorique() {
    var recs = records(), st = EA.memory.stats(recs, cfg()), cm = EA.memory.competitionMemory(recs, cfg()), el = $('pane-historique');
    var f = function (v, d, suf) { return C.isNum(v) ? v.toFixed(d) + (suf || '') : 'DATA UNAVAILABLE'; };
    var html = '<div class="pro-card"><h3>Mémoire EA</h3><div class="pro-kv"><span>Analyses enregistrées</span><span>' + st.N + '</span><span>Résultats saisis</span><span>' + st.settled + '</span><span>ROI (cotes connues)</span><span>' + (st.roi != null ? (st.roi * 100).toFixed(1) + ' %' : 'DATA UNAVAILABLE') + '</span><span>Taux de réussite</span><span>' + (st.hitRate != null ? (st.hitRate * 100).toFixed(0) + ' %' : '—') + '</span><span>CLV moyen</span><span>' + (st.clvAvg != null ? (st.clvAvg > 0 ? '+' : '') + st.clvAvg.toFixed(2) + ' pts' : 'CLV UNAVAILABLE') + '</span><span>CLV positif</span><span>' + (st.clvPositivePct != null ? st.clvPositivePct.toFixed(0) + ' %' : '—') + '</span></div>' + (st.label === 'SAMPLE TOO SMALL' ? '<p class="pro-warn">SAMPLE TOO SMALL — ces chiffres ne sont pas exploitables.</p>' : '') + '</div>';
    var groups = Object.keys(cm.byMarket);
    if (groups.length) html += '<div class="pro-card"><h3>Par sport · compétition · marché</h3>' + groups.map(function (k) { var s = cm.byMarket[k]; return '<div class="pro-kv"><span>' + esc(k) + '</span><span>N=' + s.settled + (s.label === 'SAMPLE TOO SMALL' ? ' · SAMPLE TOO SMALL' : ' · ROI ' + (s.roi != null ? (s.roi * 100).toFixed(1) + ' %' : '—') + ' · CLV ' + (s.clvAvg != null ? s.clvAvg.toFixed(2) : 'UNAVAILABLE')) + '</span></div>'; }).join('') + '</div>';
    if (!recs.length) html += '<div class="pro-card"><p class="pro-dim">Aucune analyse enregistrée. Utilise « Enregistrer dans EA Memory » après une analyse.</p></div>';
    html += recs.slice().reverse().map(function (r) {
      var res = r.result, cl = EA.memory.clv(r.odds, r.closingOdds), rr = { home: r.home, away: r.away };
      return '<div class="pro-card"><div class="pro-row" style="justify-content:space-between"><b>' + esc(r.home) + ' – ' + esc(r.away) + '</b>' + chip(r.decision, r.decision === 'BET' ? 'green' : r.decision === 'CHECK' ? 'yellow' : 'red') + '</div><p class="pro-dim">' + esc(r.competition || '—') + ' · ' + esc(r.matchDate) + ' · ' + esc(r.modelVersion) + '</p>' +
        '<div class="pro-kv"><span>' + esc(mLabel(r, rr)) + '</span><span>P ' + pc(r.pModel) + '</span><span>Cote d\'analyse</span><span>' + od(r.odds) + '</span><span>Cote juste</span><span>' + od(r.fairOdds) + '</span><span>Cote de clôture</span><span>' + (r.closingOdds ? od(r.closingOdds) : 'CLV UNAVAILABLE') + '</span>' + (cl ? '<span>CLV</span><span>' + (cl.clvProbPts > 0 ? '+' : '') + cl.clvProbPts.toFixed(2) + ' pts</span>' : '') + '</div>' +
        (res ? '<p><b>' + (res.outcome === 'won' ? 'Gagné' : res.outcome === 'lost' ? 'Perdu' : 'Annulé') + '</b> · profit ' + (res.profit != null ? res.profit.toFixed(2) + (res.stake ? '' : ' u') : '—') + ' · erreur ' + (res.error != null ? res.error.toFixed(2) : '—') + '</p>' :
          '<div class="pro-fields"><div class="pro-field"><label for="cl_' + r.id + '">Cote de clôture</label><input class="pro-in" id="cl_' + r.id + '" inputmode="decimal"></div><div class="pro-field"><label for="sk_' + r.id + '">Mise (optionnel)</label><input class="pro-in" id="sk_' + r.id + '" inputmode="decimal"></div><div class="pro-field"><label for="sa_' + r.id + '">Score dom. (optionnel)</label><input class="pro-in" id="sa_' + r.id + '" inputmode="numeric"></div><div class="pro-field"><label for="sb_' + r.id + '">Score ext. (optionnel)</label><input class="pro-in" id="sb_' + r.id + '" inputmode="numeric"></div></div><div class="pro-row"><button class="pro-btn small" data-settle="won" data-id="' + r.id + '" type="button">Gagné</button><button class="pro-btn small" data-settle="lost" data-id="' + r.id + '" type="button">Perdu</button><button class="pro-btn small" data-settle="void" data-id="' + r.id + '" type="button">Annulé</button></div>') +
        '<button class="pro-btn small" data-del="' + r.id + '" type="button">Supprimer</button></div>';
    }).join('');
    el.innerHTML = html;
  }
  function healthChip(h) { if (!h || h.state == null) return chip('⚪ INSUFFICIENT DATA' + (h && h.n != null ? ' (' + h.n + '/' + h.required + ')' : ''), 'grey'); return chip(h.emoji + ' ' + h.label, h.state === 'HEALTHY' ? 'green' : h.state === 'CAUTION' ? 'yellow' : 'red'); }
  function renderLab() {
    var recs = records(), set = recs.filter(function (r) { return r.result && r.result.outcome !== 'void'; }), cal = EA.models.calibration(set.map(function (r) { return { p: r.pModel, hit: r.result.outcome === 'won' }; }));
    var statusList = (S.last && S.last.modelStatus) || C.MODEL_STATUS, html = '<div class="pro-card"><h3>Statut des modèles</h3><div class="pro-kv">' + statusList.map(function (m) { return '<span>' + esc(m.name) + '</span><span>' + esc(m.status) + '</span>'; }).join('') + '</div><details class="pro-det"><summary>Notes</summary>' + C.MODEL_STATUS.map(function (m) { return '<p class="pro-dim"><b>' + esc(m.name) + '</b> : ' + esc(m.note) + '</p>'; }).join('') + '</details>' +
      '<p class="pro-dim">' + esc(S.last ? S.last.weightsLabel : 'MODEL WEIGHTS NOT YET CALIBRATED') + '</p></div>';
    html += '<div class="pro-card"><h3>Calibration</h3>' + (cal.n ? '<div class="pro-kv"><span>Brier</span><span>' + cal.brier.toFixed(3) + '</span><span>Log Loss</span><span>' + cal.logLoss.toFixed(3) + '</span><span>ECE</span><span>' + cal.ece.toFixed(3) + '</span><span>N</span><span>' + cal.n + (cal.label === 'SAMPLE TOO SMALL' ? ' · SAMPLE TOO SMALL' : '') + '</span></div>' +
      cal.buckets.map(function (b) { return '<div class="pro-bk"><span>' + b.range + '</span><span>' + (b.n ? '<i style="width:' + Math.round(b.freq * 100) + '%"></i>' : '<span class="pro-dim">—</span>') + '</span><span>' + (b.n ? Math.round(b.meanP * 100) + '→' + Math.round(b.freq * 100) + '% (' + b.n + ')' : '') + '</span></div>'; }).join('') + '<p class="pro-dim">Probabilité prédite → fréquence réelle, par tranche.</p>' : '<p class="pro-dim">INSUFFICIENT DATA : aucun résultat enregistré.</p>') + '</div>';
    var wf = EA.memory.walkForward(recs, { config: cfg() });
    html += '<div class="pro-card"><h3>Backtest walk-forward</h3>' + (wf.label !== 'OK' ? '<p class="pro-warn">' + esc(wf.label) + ' (' + wf.N + '/' + wf.required + ' analyses vérifiables)</p>' : ['training', 'validation', 'test'].map(function (k) { var m = wf[k]; return '<div class="pro-lab">' + k.toUpperCase() + ' · N=' + m.N + '</div><div class="pro-kv"><span>ROI / Yield</span><span>' + (m.roi != null ? (m.roi * 100).toFixed(1) + ' %' : '—') + '</span><span>Profit (unités)</span><span>' + (m.profitUnits != null ? m.profitUnits.toFixed(2) : '—') + '</span><span>Drawdown max</span><span>' + (m.maxDrawdownUnits != null ? m.maxDrawdownUnits.toFixed(2) : '—') + '</span><span>Série perdante max</span><span>' + m.maxLosingStreak + '</span><span>Brier / Log Loss</span><span>' + f2(m.brier) + ' / ' + f2(m.logLoss) + '</span><span>CLV</span><span>' + (m.clvAvg != null ? m.clvAvg.toFixed(2) : 'CLV UNAVAILABLE') + '</span></div>'; }).join('') + '<p class="pro-dim">' + esc(wf.note) + '</p>') +
      (wf.excluded && wf.excluded.length ? '<p class="pro-warn">' + wf.excluded.length + ' analyse(s) exclue(s) : ' + esc(wf.excluded[0].reason) + '</p>' : '') + '</div>';
    var perf = EA.memory.modelPerf(recs), ids = ['consensus'].concat(Object.keys(perf));
    html += '<div class="pro-card"><h3>Model health</h3>' + ids.map(function (id) { var h = EA.memory.modelHealth(recs, id, cfg()); return '<div class="pro-row" style="justify-content:space-between;align-items:center"><span>' + esc(id) + '</span>' + healthChip(h) + '</div>' + (h.reasons && h.reasons.length ? '<p class="pro-dim">' + esc(h.reasons.join(', ')) + '</p>' : ''); }).join('') + '<p class="pro-dim">Seuils PROVISOIRES et configurables. Un modèle DEGRADED/DISABLED n\'est plus pondéré, son historique est conservé.</p></div>';
    var ad = EA.memory.autoDiscovery(recs, cfg());
    html += '<div class="pro-card"><h3>Auto Discovery · EXPERIMENTAL</h3>' + (ad.candidates.length ? ad.candidates.slice(0, 6).map(function (c) { return '<div class="pro-kv"><span>' + esc(c.feature) + ' (N=' + c.n + ')</span><span>' + (c.corrWithResidual != null ? c.corrWithResidual.toFixed(2) : 'INSUFFICIENT DATA') + '</span></div>'; }).join('') : '<p class="pro-dim">INSUFFICIENT DATA</p>') + '<p class="pro-dim">' + esc(ad.note) + ' Cycle : EXPERIMENTAL → VALIDATION → TEST → PRODUCTION (promotion manuelle, non automatisée).</p></div>';
    html += '<div class="pro-card"><h3>Réglages</h3><div class="pro-field"><label for="setMc">Simulations Monte Carlo</label><select class="pro-in" id="setMc">' + cfg().mc.options.map(function (o) { return '<option value="' + o + '"' + (o === S.settings.mcIterations ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></div>' +
      '<p class="pro-dim">FAST MODE : ' + (S.settings.fast ? 'actif (' + cfg().mc.fast + ' simulations, animations coupées)' : 'inactif') + '</p>' +
      '<details class="pro-det"><summary>Configuration avancée (JSON, fusionnée avec les valeurs par défaut)</summary><textarea class="pro-in" id="setCfg" style="min-height:120px" placeholder=\'{"value":{"minEV":0.06}}\'>' + esc(S.settings.configOverride ? JSON.stringify(S.settings.configOverride) : '') + '</textarea><div class="pro-row"><button class="pro-btn small" id="setCfgSave" type="button">Appliquer</button><button class="pro-btn small" id="setCfgReset" type="button">Réinitialiser</button></div><p class="pro-dim" id="setCfgMsg"></p></details></div>';
    html += '<div class="pro-card"><h3>À propos · Debug</h3><div class="pro-kv"><span>Version</span><span>' + C.VERSION + '</span><span>storageVersion</span><span>' + EA.storage.currentVersion(LS) + ' / ' + EA.storage.TARGET + '</span><span>Analyses en mémoire</span><span>' + recs.length + '</span><span>Coefficients</span><span>' + (C.DEFAULT_CONFIG.provisional ? 'PROVISIONAL WEIGHTS' : 'validés') + '</span></div><p class="pro-dim">STATISTICAL MODEL · MODEL ENGINE · DECISION ENGINE. Aucune probabilité n\'est garantie.</p></div>';
    $('pane-lab').innerHTML = html;
  }
  function f2(v) { return C.isNum(v) ? v.toFixed(3) : '—'; }
  function renderBankroll() {
    var recs = records(), set = recs.filter(function (r) { return r.result && r.result.stake && r.result.profit != null; }).sort(function (a, b) { return a.result.settledAt - b.result.settledAt; }), cum = 0, peak = 0, dd = 0;
    set.forEach(function (r) { cum += r.result.profit; if (cum > peak) peak = cum; dd = Math.max(dd, peak - cum); });
    var st = S.last && S.last.pick && S.last.pick.odds ? EA.bankroll.suggestStake({ bankroll: S.settings.bankroll, p: S.last.pick.p, odds: S.last.pick.odds, minStake: S.settings.minStake }, cfg()) : null;
    var html = '<div class="pro-card"><h3>Bankroll</h3><div class="pro-fields">' + field('bkBank', 'Bankroll', String(S.settings.bankroll || '')) + field('bkMin', 'Mise minimale du bookmaker (optionnel)', String(S.settings.minStake || '')) + '</div><button class="pro-btn" id="bkSave" type="button">Enregistrer</button>' +
      '<div class="pro-kv"><span>Profit/perte (paris avec mise)</span><span>' + (set.length ? cum.toFixed(2) : 'DATA UNAVAILABLE') + '</span><span>Drawdown maximal</span><span>' + (set.length ? dd.toFixed(2) : '—') + '</span><span>Paris avec mise</span><span>' + set.length + '</span></div></div>';
    html += '<div class="pro-card"><h3>Mise indicative</h3>' + (st ? (st.available ? '<div class="pro-kv"><span>Niveau</span><span>' + esc(st.tier) + '</span><span>Mise</span><span>' + st.stake.toFixed(2) + '</span><span>Part de bankroll</span><span>' + (st.stakePct * 100).toFixed(2) + ' %</span><span>Plafond</span><span>' + st.cap.toFixed(2) + '</span></div><p class="' + (st.stakeOk ? 'pro-dim' : 'pro-warn') + '">' + esc(st.label) + (st.advice ? ' — ' + esc(st.advice) : '') + '</p>' : '<p class="pro-dim">' + esc(st.label) + ' : ' + esc(st.reason) + '</p>') : '<p class="pro-dim">Analyse avec cote et bankroll renseignées requise.</p>') +
      '<p class="pro-dim">Kelly fractionné, plafonné, jamais all-in. Indicatif : aucun gain futur n\'est garanti.</p></div>';
    html += '<div class="pro-card"><h3>Simulateur de bankroll</h3><div class="pro-fields">' + field('sm_n', 'Nombre de paris', '100') + field('sm_pct', 'Mise (% bankroll)', '1') + field('sm_odds', 'Cote moyenne', '1.90') + field('sm_p', 'Probabilité de gain (%)', '55') + '</div>' +
      '<div class="pro-field"><label for="sm_k">Simulations</label><select class="pro-in" id="sm_k"><option>1000</option><option selected>5000</option><option>10000</option></select></div><button class="pro-btn primary" id="smRun" type="button">SIMULER</button><div id="smOut"></div></div>';
    $('pane-bankroll').innerHTML = html;
    if (S.settings.bankroll != null) $('bkBank').value = S.settings.bankroll; if (S.settings.minStake != null) $('bkMin').value = S.settings.minStake;
  }

  // ---------- actions ----------
  function run() {
    var input = collect(); S.lastInput = input;
    var res = S.sport === 'football' ? EA.engine.analyzeFootball(input) : EA.engine.analyzeBasketball(input);
    S.shock = null;
    if (res.pick) {
      var key = [res.sport, res.competition || '', res.home, res.away, res.matchDate].join('|'), prev = S.memory.previous(key, res.pick.market, res.pick.selection), cur = EA.engine.toMemoryRecord(res);
      if (prev) { var cause = EA.value.diffContext(Object.assign({}, prev.contextSnapshot, { odds: prev.odds }), Object.assign({}, cur.contextSnapshot, { odds: cur.odds })); S.shock = EA.value.informationShock(prev.pModel, res.pick.p, cause.length ? cause.join(' ; ') : 'nouvelles données saisies', cfg()); }
    }
    S.last = res; poolAdd(res); S.msg = ''; renderSummary(); renderValue(); renderDecision(); if (S.tab === 'analyse') { var m = $('proRunMsg'); if (m) m.textContent = 'Analyse terminée : ' + res.decision.decision + '.'; }
    if (S.tab === 'analyse' || S.tab === 'marches') tab('decision');
  }
  function tab(t) {
    S.tab = t; ['analyse', 'marches', 'decision', 'historique', 'lab', 'bankroll'].forEach(function (k) { $('pane-' + k).classList.toggle('on', k === t); });
    Array.prototype.forEach.call($('proNav').children, function (b) { b.classList.toggle('on', b.dataset.t === t); });
    if (t === 'historique') renderHistorique(); if (t === 'lab') renderLab(); if (t === 'bankroll') renderBankroll(); if (t === 'decision') renderDecision(); if (t === 'marches') renderValue();
  }
  function setSport(sp) {
    S.sport = sp; S.settings.sport = sp; save(); S.last = null; S.shock = null; S.ctx = { h: {}, a: {} };
    Array.prototype.forEach.call($('proSport').children, function (b) { b.classList.toggle('on', b.dataset.v === sp); });
    renderAnalyse(); renderMarches(); renderSummary(); renderDecision(); bindForm();
  }
  function setMode(m) { S.mode = m; S.settings.mode = m; save(); Array.prototype.forEach.call($('proMode').children, function (b) { b.classList.toggle('on', b.dataset.v === m); }); if (S.last && S.lastInput) run(); }
  function applyFast() { g.EA_FAST = !!S.settings.fast; doc.body.classList.toggle('ea-fast', !!S.settings.fast); $('proFast').classList.toggle('on', !!S.settings.fast); }
  function saveRecord(idx) {
    var r = S.last; if (!r || !r.markets[idx]) return; var rec = EA.engine.toMemoryRecord(r, r.markets[idx]); var pk = r.markets[idx]; if (pk && pk.odds && S.settings.bankroll) { var sg = EA.bankroll.suggestStake({ bankroll: S.settings.bankroll, p: pk.p, odds: pk.odds, minStake: S.settings.minStake }, cfg()); if (sg && sg.available) rec.plannedStake = sg.stake; }
    if (EA.snapshot) rec.snapshot = EA.snapshot.build(r, idx, S.lastInput, EA.parlay ? EA.parlay.optimize(S.pool, S.settings && S.settings.config) : null);
    try { S.memory.add(rec); S.msg = 'Analyse enregistrée (prédiction figée, non modifiable).'; } catch (e) { S.msg = 'Enregistrement impossible : stockage plein ou indisponible.'; }
    var m = $('proSaveMsg'); if (m) m.textContent = S.msg;
  }
  function bindForm() {
    Array.prototype.forEach.call(doc.querySelectorAll('#pane-analyse .pro-emos'), function (grp) {
      grp.addEventListener('click', function (ev) {
        var b = ev.target.closest('button'); if (!b) return; var side = grp.dataset.side, key = grp.dataset.key; S.ctx[side][key] = b.dataset.v;
        Array.prototype.forEach.call(grp.children, function (x) { x.classList.toggle('on', x === b); });
        var st = $('st_' + side + '_' + key); if (st && EA.context.LABELS[key]) st.textContent = EA.context.LABELS[key][b.dataset.v];
      });
    });
    var hi = $('p_home'), ai = $('p_away'); if (hi) hi.addEventListener('input', function () { $('p_h_title').textContent = hi.value || 'Domicile'; }); if (ai) ai.addEventListener('input', function () { $('p_a_title').textContent = ai.value || 'Extérieur'; });
    var b1 = $('proRun'), b2 = $('proRun2'); if (b1) b1.addEventListener('click', run); if (b2) b2.addEventListener('click', run);
  }
  function bindGlobal() {
    $('proSport').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b && b.dataset.v !== S.sport) setSport(b.dataset.v); });
    $('proMode').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setMode(b.dataset.v); });
    $('proFast').addEventListener('click', function () { S.settings.fast = !S.settings.fast; save(); applyFast(); });
    $('proNav').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) tab(b.dataset.t); });
    $('proSummary').addEventListener('click', function () { if (S.last) tab('decision'); });
    $('proSummary').addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && S.last) { e.preventDefault(); tab('decision'); } });
    $('eaProRoot').addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.dataset.save != null) { saveRecord(parseInt(t.dataset.save, 10)); return; }
      if (t.dataset.settle) { var id = t.dataset.id; S.memory.settle(id, t.dataset.settle, { closingOdds: nv('cl_' + id), stake: nv('sk_' + id), score: { a: nv('sa_' + id), b: nv('sb_' + id) } }); renderHistorique(); return; }
      if (t.dataset.del) { if (g.confirm('Supprimer cette analyse de la mémoire ?')) { S.memory.remove(t.dataset.del); renderHistorique(); } return; }
      if (t.id === 'bkSave') { S.settings.bankroll = nv('bkBank'); S.settings.minStake = nv('bkMin'); save(); renderBankroll(); return; }
      if (t.id === 'smRun') {
        var out = EA.bankroll.simulate({ bankroll: S.settings.bankroll || 100, nBets: nv('sm_n'), stakePct: (nv('sm_pct') || 0) / 100, odds: nv('sm_odds'), winProb: (nv('sm_p') || 0) / 100, sims: parseInt($('sm_k').value, 10) }, cfg());
        $('smOut').innerHTML = out.available ? '<div class="pro-kv"><span>Résultat médian</span><span>' + out.median.toFixed(0) + '</span><span>Percentile 10</span><span>' + out.p10.toFixed(0) + '</span><span>Percentile 90</span><span>' + out.p90.toFixed(0) + '</span><span>Drawdown moyen max</span><span>' + (out.avgMaxDrawdown * 100).toFixed(0) + ' %</span><span>Série perdante (médiane / p90)</span><span>' + out.medianLosingStreak + ' / ' + out.p90LosingStreak + '</span><span>Risque de ruine</span><span>' + (out.riskOfRuin * 100).toFixed(1) + ' %</span></div><p class="pro-dim">Ruine : ' + esc(out.ruinDefinition) + (out.negativeEV ? ' · EV négative avec ces paramètres' : '') + '</p><p class="pro-warn"><b>' + out.banner + '</b></p>' : '<p class="pro-warn">' + esc(out.label) + ' : ' + esc(out.reason) + '</p>';
        return;
      }
      if (t.id === 'setCfgSave') { try { var o = JSON.parse($('setCfg').value || 'null'); S.settings.configOverride = o; save(); $('setCfgMsg').textContent = 'Configuration appliquée.'; } catch (err) { $('setCfgMsg').textContent = 'JSON invalide : configuration inchangée.'; } return; }
      if (t.id === 'setCfgReset') { S.settings.configOverride = null; save(); renderLab(); return; }
    });
    $('eaProRoot').addEventListener('change', function (e) { if (e.target.id === 'setMc') { S.settings.mcIterations = parseInt(e.target.value, 10); save(); } });
  }
  function init() {
    var root = $('eaProRoot'); if (!root) return;
    var mig = EA.storage.migrate(LS); S.migration = mig;
    S.settings = EA.storage.loadSettings(LS); S.memory = EA.memory.createMemory(LS); S.sport = S.settings.sport || 'football'; S.mode = S.settings.mode || 'VALUE';
    root.innerHTML = shell(); renderAnalyse(); renderMarches(); renderSummary(); bindGlobal(); bindForm();
    Array.prototype.forEach.call($('proSport').children, function (b) { b.classList.toggle('on', b.dataset.v === S.sport); });
    Array.prototype.forEach.call($('proMode').children, function (b) { b.classList.toggle('on', b.dataset.v === S.mode); });
    applyFast(); tab('analyse');
    if (!mig.ok) { var m = $('proRunMsg'); if (m) m.textContent = 'Migration du stockage non appliquée (' + mig.error + ')' + (mig.restored ? ' — sauvegarde restaurée.' : '.'); }
    var vl = doc.getElementById('eaVersionLine'); if (vl) vl.textContent = 'EA Value Pro ' + C.VERSION;
  }

  // ---------- COMBINÉ RENTABLE (bloc unique) ----------
  S.pool = [];
  function dbMarket(m) { var s = m.selection, x = String(m.market || '');
    if (x === 'btts' && s === 'yes') return 'btts_yes'; var o = /^ou:([\d.]+)$/.exec(x); if (o && s === 'over') return 'over:' + o[1];
    if ((x === '1X2' || x === 'ml') && (s === 'home' || s === 'away')) return s + '_win'; return x === '1X2' && s === 'draw' ? 'draw' : null; }
  function dbConflict(res, m) {   // EA DATABASE : conflit entre sources internes et modèle ⇒ jambe écartée du combiné
    try { var mk = dbMarket(m); if (!mk || !EA.dbui || !EA.database) return false; var st = EA.dbui.store(); if (st.meta().state !== 'READY') return false;
      var c = st.consensus({ sport: S.sport || 'football', competition: res.competition || res.league, home: res.home, away: res.away, market: mk, modelP: m.p, before: res.matchDate }); return !!(c.available && c.conflict); } catch (e) { return false; } }
  function poolAdd(res) {
    if (!res || !res.markets || !EA.parlay) return;
    var key = [res.home, res.away, res.matchDate].join('|'), label = (res.home || '?') + ' – ' + (res.away || '?');
    S.pool = S.pool.filter(function (l) { return l.matchKey !== key; }); var wm = EA.market ? EA.market.weightMap(records()) : {};
    res.markets.forEach(function (m) { S.pool.push({ matchKey: key, label: label, market: m.market, selection: m.selection, p: m.p, odds: m.odds, value: m.value, uncertaintyHalfPts: m.uncertaintyHalfPts, decision: m.decision && m.decision.decision, dataQuality: res.dataQuality && res.dataQuality.score, weightsLabel: m.weightsLabel, weight: wm[(S.sport || '?') + '/' + m.market], dbConflict: dbConflict(res, m) }); });
  }
  function parlayHtml() {
    if (!EA.parlay) return '';
    var r = EA.parlay.optimize(S.pool, S.settings && S.settings.config), h = '<div class="pro-card pro-parlay"><h3>🔥 COMBINÉ RENTABLE</h3>';
    h += '<p class="pro-dim">Pool : ' + new Set(S.pool.map(function (l) { return l.matchKey; })).size + ' match(s) analysé(s) avec cotes · ' + r.tested + ' combinaison(s) testée(s) en arrière-plan.</p>';
    if (r.status !== 'BET') {
      h += '<div class="pro-dec NOBET">🛑 PAS DE COMBINÉ RENTABLE</div><p>' + esc(r.message) + '</p>';
    } else {
      h += r.legs.map(function (l, i) { return '<div class="pro-kv"><span>Sélection ' + (i + 1) + ' · ' + esc(l.label) + '</span><span>' + esc(l.market + ' ' + l.selection) + ' @ ' + l.odds.toFixed(2) + '</span></div>'; }).join('') +
        '<hr><div class="pro-kv"><span>Cote totale</span><span>' + r.odds.toFixed(2) + '</span></div>' +
        '<div class="pro-kv"><span>Probabilité jointe (corrélation incluse)</span><span>' + (r.pJoint * 100).toFixed(1) + ' %</span></div>' +
        '<div class="pro-kv"><span>Probabilité marché (1/cote)</span><span>' + (r.pMarket * 100).toFixed(1) + ' %</span></div>' +
        '<div class="pro-kv"><span>Edge</span><span>' + (r.edgePts >= 0 ? '+' : '') + r.edgePts.toFixed(1) + ' pts</span></div>' +
        '<div class="pro-kv"><span>EV (EV pessimiste)</span><span>' + (r.ev >= 0 ? '+' : '') + (r.ev * 100).toFixed(1) + ' % (' + (r.evLow * 100).toFixed(1) + ' %)</span></div>' +
        '<div class="pro-kv"><span>Qualité données (min.)</span><span>' + r.dataQuality + '/100</span></div>' +
        '<div class="pro-kv"><span>Incertitude jointe</span><span>±' + r.uncertaintyHalfPts.toFixed(1) + ' pts</span></div>' +
        '<div class="pro-kv"><span>Calibration</span><span>' + esc(r.calibration) + '</span></div>' +
        '<div class="pro-kv"><span>Risque de modèle</span><span>' + esc(r.risk) + '</span></div>' +
        '<div class="pro-kv"><span>Seuil minimum de cote</span><span>' + r.minOdds.toFixed(2) + '</span></div>' +
        (r.preferSingle ? '<p class="pro-warn">🎯 ' + esc(r.preferMessage) + ' (' + esc(r.bestSingle.leg.label + ' · ' + r.bestSingle.leg.market + ' ' + r.bestSingle.leg.selection) + ')</p>' : '') +
        (r.sameMatchWarning ? '<p class="pro-warn">' + esc(r.sameMatchWarning) + '</p>' : '') +
        '<div class="pro-dec BET">🔥 DÉCISION : BET</div><button class="pro-btn small" onclick="EA.ui._saveCombo()">Enregistrer ce combiné</button><p class="pro-dim">« Rentable » = favorable selon le modèle et ses hypothèses actuelles, pas un gain garanti.</p>' +
        '<details><summary>Pourquoi ?</summary><ul class="pro-list"><li>EV ≥ seuil et EV pessimiste positive (' + (r.evLow * 100).toFixed(1) + ' %)</li><li>Chaque jambe est BET, cote ≥ cote minimale, données ≥ 60/100</li><li>' + r.legs.length + ' sélection(s) : le nombre est choisi par le moteur, sans quota</li><li>' + (r.correlationNotes.length ? esc(r.correlationNotes.join(' ; ')) : 'Jambes de matchs différents : indépendance supposée') + '</li></ul></details>';
    }
    if (r.rejected.length) h += '<details><summary>Pourquoi pas ? (' + r.rejected.length + ' marché(s) écarté(s))</summary><ul class="pro-list">' + r.rejected.slice(0, 12).map(function (x) { return '<li>' + esc(x.leg) + ' : ' + esc(x.why) + '</li>'; }).join('') + '</ul></details>';
    if (r.invalidCombos) h += '<p class="pro-dim">' + r.invalidCombos + ' combinaison(s) rejetée(s) pour corrélation excessive ou dépendance inconnue.</p>';
    h += '<button class="pro-btn" onclick="EA.ui._clearPool()">Vider le pool</button></div>';
    if (r.ranked && r.ranked.length) h += '<div class="pro-card"><h3>Priorité des paris</h3>' + r.ranked.map(function (x, i) { return '<div class="pro-kv"><span>' + ['🥇 PRIORITÉ 1', '🥈 PRIORITÉ 2', '🥉 PRIORITÉ 3'][i] + ' · ' + esc(x.leg.label) + '</span><span>' + esc(x.leg.market + ' ' + x.leg.selection) + ' @ ' + x.leg.odds.toFixed(2) + ' · EV pess. ' + (x.evLow * 100).toFixed(1) + ' %</span></div>'; }).join('') + '<p class="pro-dim">Uniquement des paris individuels BET dont l\'EV reste positive après incertitude ; aucun Top 3 artificiel.</p></div>';
    return h;
  }
  var _renderDecision = renderDecision;
  renderDecision = function () { _renderDecision(); var el = $('pane-decision'); if (el) el.insertAdjacentHTML('beforeend', parlayHtml()); };

  // ---------- POST-MATCH ANALYSIS + ERROR MEMORY ----------
  function postmortemHtml() {
    if (!EA.postmortem) return '';
    var recs = records(), em = EA.postmortem.errorMemory(recs), ks = Object.keys(em.groups), h = '';
    var done = recs.filter(function (r) { return r.result && r.result.outcome !== 'void'; }).slice(-10).reverse();
    if (done.length) h += '<div class="pro-card"><h3>🧠 POST-MATCH ANALYSIS</h3>' + done.map(function (r) {
      var a = EA.postmortem.analyze(r);
      return '<div class="pro-kv"><span>' + esc(r.home) + ' – ' + esc(r.away) + ' · ' + esc(r.market + ' ' + r.selection) + '</span><span>' + (a.outcome === 'won' ? 'Gagné' : 'Perdu') + ' · ' + esc(a.category) + '</span></div><p class="pro-dim">' + esc(a.why) + (a.scoreNote ? ' ' + esc(a.scoreNote) : '') + '</p>';
    }).join('') + '<p class="pro-dim">Hypothèses automatiques à confirmer. La prédiction d\'origine n\'est jamais modifiée.</p></div>';
    if (ks.length) h += '<div class="pro-card"><h3>Error Memory</h3>' + ks.map(function (k) { var x = em.groups[k]; return '<div class="pro-kv"><span>' + esc(k) + '</span><span>' + x.won + 'G / ' + x.lost + 'P (N=' + x.n + ')</span></div><p class="pro-dim">' + esc(x.caution) + (x.frequentError ? ' · erreur la plus fréquente : ' + esc(x.frequentError) : '') + '</p>'; }).join('') + '<p class="pro-dim">Aucun paramètre du modèle n\'est modifié automatiquement ; la prudence n\'est signalée qu\'à partir de ' + em.config.minN + ' observations.</p></div>';
    return h;
  }
  var _renderHistorique = renderHistorique;
  renderHistorique = function () { _renderHistorique(); var el = $('pane-historique'); if (el) el.insertAdjacentHTML('beforeend', postmortemHtml()); };

  // ---------- CALIBRATION PAR TRANCHES + LEAGUE PROFILE (Model Lab) ----------
  function calibrationHtml() {
    if (!EA.calibration) return '';
    var recs = records(), lv = cfg().sampleLevels, cb = EA.calibration.buckets(recs, lv), lp = EA.calibration.leagueProfiles(recs, cfg(), lv), h = '';
    var pct = function (v) { return v == null ? '—' : (v * 100).toFixed(0) + ' %'; };
    h += '<div class="pro-card"><h3>Calibration par tranches</h3>';
    if (!cb.n) h += '<p class="pro-dim">Aucun résultat saisi : calibration non mesurable.</p>';
    else {
      h += '<p class="pro-dim">' + cb.n + ' résultat(s) · échantillon ' + esc(cb.level) + (cb.insufficient ? ' · ⚠️ Échantillon insuffisant' : '') + ' · Brier ' + cb.brier.toFixed(3) + ' · Log loss ' + cb.logLoss.toFixed(3) + ' · ECE ' + (cb.ece * 100).toFixed(1) + ' pts</p>';
      h += cb.buckets.filter(function (b) { return b.n; }).map(function (b) { return '<div class="pro-kv"><span>' + esc(b.name) + ' · annoncé ' + pct(b.meanP) + '</span><span>réel ' + pct(b.freq) + ' (' + (b.error >= 0 ? '+' : '') + (b.error * 100).toFixed(0) + ' pts)</span></div><p class="pro-dim">' + esc(b.text) + (b.reliable ? '' : ' · aucune recalibration appliquée') + '</p>'; }).join('');
    }
    h += '</div>';
    var ks = Object.keys(lp);
    if (ks.length) h += '<div class="pro-card"><h3>League Profile</h3>' + ks.map(function (k) {
      var p = lp[k], l = '<div class="pro-kv"><span>' + esc(k) + '</span><span>' + p.settled + ' résultat(s) · ' + esc(p.level) + '</span></div><p class="pro-dim">' + esc(p.note) + '</p>';
      if (p.enough) {
        l += '<p class="pro-dim">ROI ' + (p.roi == null ? '—' : (p.roi * 100).toFixed(1) + ' %') + ' · CLV ' + (p.clvAvg == null ? '—' : p.clvAvg.toFixed(2)) + ' · Brier ' + (p.brier == null ? '—' : p.brier.toFixed(3)) + '</p>';
        if (p.avgTotal != null) l += '<p class="pro-dim">Total moyen ' + p.avgTotal.toFixed(2) + ' (variance ' + p.variance.toFixed(2) + ') · victoire domicile ' + pct(p.homeWinPct) + (p.bttsPct != null ? ' · BTTS ' + pct(p.bttsPct) + ' · Over 2.5 ' + pct(p.over25Pct) : '') + ' <i>(' + p.scores + ' scores saisis)</i></p>';
        l += Object.keys(p.markets).map(function (m) { var x = p.markets[m]; return '<div class="pro-kv"><span>' + esc(m) + ' (N=' + x.n + ')</span><span>' + pct(x.hit) + ' vs ' + pct(x.meanP) + ' annoncé · ' + esc(x.level) + '</span></div>'; }).join('');
      }
      return l;
    }).join('') + '<p class="pro-dim">Profils informatifs : aucune pondération par compétition n\'est appliquée automatiquement.</p></div>';
    return h;
  }
  var _renderLab = renderLab;
  renderLab = function () { _renderLab(); var el = $('pane-lab'); if (el) el.insertAdjacentHTML('beforeend', calibrationHtml()); };

  // ---------- SNAPSHOT / COMBINÉS ENREGISTRÉS / SIMPLES vs COMBINÉS ----------
  function comboRecords() { return S.memory.all().filter(function (r) { return r.type === 'combo'; }); }
  function saveCombo() {
    if (!EA.parlay || !EA.snapshot) return;
    var r = EA.parlay.optimize(S.pool, S.settings && S.settings.config); if (r.status !== 'BET') return;
    try { S.memory.add(EA.snapshot.toRecord(r)); S.msg = 'Combiné enregistré (figé, non modifiable).'; } catch (e) { S.msg = 'Enregistrement impossible : stockage plein ou indisponible.'; }
    renderDecision();
  }
  function settleCombo(id, outcome) { S.memory.settle(id, outcome, { stake: 1 }); renderHistorique(); }
  function snapshotHtml() {
    if (!EA.snapshot) return '';
    var all = S.memory.all(), cmp = EA.snapshot.simplesVsCombos(all), combos = comboRecords(), h = '', f1 = function (v) { return v == null ? '—' : (v * 100).toFixed(1) + ' %'; };
    h += '<div class="pro-card"><h3>Simples vs Combinés</h3>';
    ['simples', 'combos'].forEach(function (k) { var x = cmp[k]; h += '<div class="pro-kv"><span>' + (k === 'simples' ? 'Simples' : 'Combinés') + ' (N=' + x.n + ' · ' + esc(x.level) + ')</span><span>' + x.won + 'G / ' + x.lost + 'P · ROI ' + f1(x.roi) + '</span></div><p class="pro-dim">Cote moyenne ' + (x.avgOdds ? x.avgOdds.toFixed(2) : '—') + ' · EV annoncé moyen ' + f1(x.meanEV) + (x.avgLegs ? ' · ' + x.avgLegs.toFixed(1) + ' sélections en moyenne' : '') + '</p>'; });
    h += '<p>' + (cmp.code === 'COMBINES_MOINS_BONS' ? '⚠️ ' : '') + esc(cmp.verdict) + '</p></div>';
    var open = combos.filter(function (r) { return !r.result; });
    if (open.length) h += '<div class="pro-card"><h3>Combinés à régler</h3>' + open.map(function (r) { return '<div class="pro-kv"><span>' + r.legCount + ' sél. @ ' + r.odds.toFixed(2) + '</span><span><button class="pro-btn small" onclick="EA.ui._settleCombo(\'' + r.id + '\',\'won\')">Gagné</button> <button class="pro-btn small" onclick="EA.ui._settleCombo(\'' + r.id + '\',\'lost\')">Perdu</button></span></div><p class="pro-dim">' + esc(r.selection) + '</p>'; }).join('') + '</div>';
    var snaps = all.filter(function (r) { return r.snapshot; }).slice(-5).reverse();
    if (snaps.length) h += '<div class="pro-card"><h3>Snapshots pré-match</h3>' + snaps.map(function (r) { var okv = S.memory.verify(r); return '<div class="pro-kv"><span>' + esc(r.type === 'combo' ? 'Combiné' : (r.home + ' – ' + r.away + ' · ' + r.market + ' ' + r.selection)) + '</span><span>v' + (r.version || 1) + ' · ' + (okv ? '✅ intact' : '⚠️ altéré') + '</span></div><p class="pro-dim">' + esc((r.snapshot.savedAt || '').replace('T', ' ').slice(0, 16)) + ' · moteur ' + esc(r.snapshot.engineVersion || '?') + (r.supersedes ? ' · remplace une version antérieure (conservée)' : '') + '</p>'; }).join('') + '</div>';
    return h;
  }
  var _renderHistorique2 = renderHistorique;
  renderHistorique = function () { _renderHistorique2(); var el = $('pane-historique'); if (el) el.insertAdjacentHTML('beforeend', snapshotHtml()); };

  // ---------- MARKET PERFORMANCE + BACKTEST V3 (Model Lab) / RISK ENGINE (Bankroll) ----------
  function marketLabHtml() {
    if (!EA.market || !EA.risk) return '';
    var recs = records(), pf = EA.market.perf(recs), ks = Object.keys(pf), doc = ks.filter(function (k) { return pf[k].documented; }), small = ks.length - doc.length, h = '';
    var f1 = function (v) { return v == null ? '—' : (v * 100).toFixed(1) + ' %'; };
    h += '<div class="pro-card"><h3>Market Performance</h3>';
    if (!doc.length) h += '<p class="pro-dim">⚠️ Échantillon insuffisant : aucun marché n\'a encore 30 résultats réglés.</p>';
    h += doc.map(function (k) { var x = pf[k]; return '<div class="pro-kv"><span>' + esc(k) + ' (N=' + x.n + ' · ' + esc(x.level) + ')</span><span>' + x.won + 'G / ' + x.lost + 'P · ' + f1(x.hit) + '</span></div><p class="pro-dim">ROI ' + f1(x.roi) + ' · EV annoncé ' + f1(x.meanEV) + ' · CLV ' + (x.clv == null ? '—' : x.clv.toFixed(2) + ' pts') + ' · annoncé ' + f1(x.meanP) + ' vs réel ' + f1(x.hit) + ' · poids ' + x.weight.toFixed(2) + ' (' + esc(x.reason) + ')</p>'; }).join('');
    if (small) h += '<p class="pro-dim">' + small + ' marché(s) non affiché(s) : échantillon insuffisant.</p>';
    h += '<p class="pro-dim">Le poids n\'agit que sur l\'exigence d\'EV des combinés, entre 0,70 et 1,05, à partir de 100 observations ; aucun marché n\'est supprimé.</p></div>';
    var bt = EA.risk.rulesBacktest(recs);
    h += '<div class="pro-card"><h3>Backtest des règles V3</h3>';
    if (bt.insufficient) h += '<p class="pro-dim">⚠️ Échantillon insuffisant (' + bt.total + ' paris réglés avec cote ; minimum 60) : aucune conclusion.</p>';
    else h += ['training', 'validation', 'test'].map(function (k) { var p = bt.parts[k], a = p.all, v = p.v3; return '<div class="pro-kv"><span>' + (k === 'training' ? 'Apprentissage' : k === 'validation' ? 'Validation' : 'Test') + '</span><span>tous N=' + a.n + ' · ROI ' + f1(a.roi) + '</span></div><p class="pro-dim">Règles V3 : N=' + v.n + (v.small ? ' (petit échantillon)' : '') + ' · ROI ' + f1(v.roi) + ' · hit ' + f1(v.hit) + ' · drawdown max ' + v.maxDD.toFixed(2) + ' u · profit factor ' + (v.profitFactor == null ? '—' : v.profitFactor.toFixed(2)) + ' · CLV ' + (v.clv == null ? '—' : v.clv.toFixed(2)) + '</p>'; }).join('');
    return h + '<p class="pro-dim">' + esc(bt.note) + '</p></div>';
  }
  var _renderLab2 = renderLab;
  renderLab = function () { _renderLab2(); var el = $('pane-lab'); if (el) el.insertAdjacentHTML('beforeend', marketLabHtml()); };
  function riskHtml() {
    if (!EA.risk) return '';
    var pick = S.last && S.last.pick, st = pick && pick.odds ? EA.bankroll.suggestStake({ bankroll: S.settings.bankroll, p: pick.p, odds: pick.odds, minStake: S.settings.minStake }, cfg()) : null;
    var a = EA.risk.assess({ bankroll: S.settings.bankroll, proposed: st && st.available ? st.stake : null, records: records() });
    var h = '<div class="pro-card"><h3>Risk Engine</h3><div class="pro-kv"><span>Niveau</span><span>' + esc(a.level) + '</span></div>';
    if (a.stake == null) return h + '<p class="pro-dim">' + esc(a.flags.join(' · ')) + ' Analysez un match avec cote et renseignez la bankroll.</p></div>';
    h += '<div class="pro-kv"><span>Mise après contrôle du risque</span><span>' + a.stake.toFixed(2) + '</span></div><p class="pro-dim">Exposition ouverte ' + a.exposure.toFixed(2) + ' · drawdown ' + a.drawdown.toFixed(2) + ' (' + (a.drawdownPct * 100).toFixed(1) + ' %) · série de pertes ' + a.lossStreak + '</p>';
    return h + (a.flags.length ? '<ul class="pro-list">' + a.flags.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') + '<p class="pro-dim">Le Risk Engine ne peut que plafonner ou réduire une mise : jamais de martingale ni d\'augmentation après une perte.</p></div>';
  }
  var _renderBankroll = renderBankroll;
  renderBankroll = function () { _renderBankroll(); var el = $('pane-bankroll'); if (el) el.insertAdjacentHTML('beforeend', riskHtml()); };
  EA.ui = { init: init, _saveCombo: saveCombo, _settleCombo: settleCombo, _clearPool: function () { S.pool = []; renderDecision(); }, _poolAdd: poolAdd, _pool: function () { return S.pool; }, _state: S, _collect: collect, _run: run };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : global);
