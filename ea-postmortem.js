/* EA-VALUE 3.0 — POST-MATCH ANALYSIS + ERROR MEMORY.
   Le diagnostic est une HYPOTHÈSE AUTOMATIQUE tirée des seules données enregistrées ; une observation ne prouve rien.
   Ne modifie jamais la prédiction figée et ne change AUCUN paramètre du modèle : la prudence est affichée, pas appliquée. */
(function (g) {
  'use strict';
  if (typeof require === 'function' && typeof window === 'undefined') require('./ea-core.js');
  var EA = g.EA, C = EA.core;
  var CFG = { minN: 30, strongN: 100, gapCaution: -0.08, lowEV: 0.03, lowDQ: 60 };
  function num(v) { return C.num(v); }

  function scoreNote(r) {
    var s = r.result && r.result.score; if (!s) return null;
    var tot = s.a + s.b, m = String(r.market || ''), sel = r.selection;
    if (m === 'btts') return sel === 'yes' && (s.a === 0 || s.b === 0) ? (tot >= 3 ? 'Le match a dépassé le seuil de buts (' + tot + ') mais une des équipes n\'a pas marqué.' : 'Une des équipes n\'a pas marqué (' + s.a + '-' + s.b + ').') : sel === 'no' && s.a > 0 && s.b > 0 ? 'Les deux équipes ont marqué (' + s.a + '-' + s.b + ').' : null;
    if (/^ou:/.test(m)) { var line = parseFloat(m.slice(3)); return sel === 'over' ? 'Total de ' + tot + ' pour une ligne à ' + line + '.' : 'Total de ' + tot + ' : ' + (tot > line ? 'au-dessus' : 'sous') + ' la ligne ' + line + '.'; }
    if (m === '1X2' || m === 'ml') return 'Score final ' + s.a + '-' + s.b + '.';
    return 'Score final ' + s.a + '-' + s.b + '.';
  }

  function analyze(r) {
    if (!r || !r.result || r.result.outcome === 'void') return null;
    var won = r.result.outcome === 'won', p = num(r.pModel), o = num(r.odds), ev = (p != null && o != null && o > 1) ? p * o - 1 : null;
    var dq = r.dataQuality && num(r.dataQuality.score), cat, why;
    if (won) { cat = p != null && p >= 0.5 ? 'bonne estimation' : 'variance favorable'; why = cat === 'bonne estimation' ? 'Événement jugé probable (' + (p * 100).toFixed(0) + ' %) et réalisé.' : 'Événement jugé peu probable (' + (p * 100).toFixed(0) + ' %) mais réalisé.'; }
    else if (dq != null && dq < CFG.lowDQ) { cat = 'information inconnue'; why = 'Qualité de données basse (' + dq + '/100) au moment de l\'analyse.'; }
    else if (ev != null && ev < CFG.lowEV) { cat = 'cote insuffisante'; why = 'Avantage très faible à l\'analyse (EV ' + (ev * 100).toFixed(1) + ' %) : la marge d\'erreur absorbait tout l\'edge.'; }
    else if (p != null && p >= 0.55) { cat = 'variance'; why = 'Probabilité de ' + (p * 100).toFixed(0) + ' % : un échec reste attendu environ ' + Math.round((1 - p) * 100) + ' fois sur 100.'; }
    else { cat = 'mauvaise estimation'; why = 'Probabilité modérée (' + (p == null ? '?' : (p * 100).toFixed(0)) + ' %) : l\'estimation était peu discriminante.'; }
    return { id: r.id, outcome: r.result.outcome, category: cat, why: why, scoreNote: scoreNote(r), auto: true,
      note: 'Hypothèse automatique, à confirmer ; une seule observation ne justifie aucune modification du modèle.' };
  }

  // Mémoire des erreurs : par sport / compétition / marché, sans jamais ajuster le modèle.
  function errorMemory(records, cfg) {
    var c = Object.assign({}, CFG, cfg || {}), groups = {};
    (records || []).forEach(function (r) {
      var a = analyze(r); if (!a) return;
      var k = [r.sport || '?', r.competition || '?', String(r.market || '?')].join(' / '), g2 = groups[k] = groups[k] || { n: 0, won: 0, lost: 0, sumP: 0, cats: {} };
      g2.n++; if (a.outcome === 'won') g2.won++; else { g2.lost++; g2.cats[a.category] = (g2.cats[a.category] || 0) + 1; }
      g2.sumP += num(r.pModel) == null ? 0 : r.pModel;
    });
    Object.keys(groups).forEach(function (k) {
      var x = groups[k]; x.hitRate = x.won / x.n; x.meanP = x.sumP / x.n; x.gap = x.hitRate - x.meanP;
      var top = Object.keys(x.cats).sort(function (a, b) { return x.cats[b] - x.cats[a]; })[0]; x.frequentError = top || null;
      if (x.n < c.minN) { x.caution = 'ÉCHANTILLON INSUFFISANT'; x.level = 'NONE'; }
      else if (x.gap <= c.gapCaution) { x.level = x.n >= c.strongN ? 'STRONG' : 'LIGHT'; x.caution = x.level === 'STRONG' ? 'PRUDENCE FORTE : probabilités annoncées surestimées' : 'PRUDENCE LÉGÈRE : probabilités annoncées surestimées'; }
      else { x.level = 'NONE'; x.caution = 'aucun écart notable'; }
    });
    return { groups: groups, config: c };
  }
  EA.postmortem = { analyze: analyze, errorMemory: errorMemory, CFG: CFG };
  if (typeof module === 'object' && module.exports) module.exports = EA.postmortem;
})(typeof window !== 'undefined' ? window : global);
