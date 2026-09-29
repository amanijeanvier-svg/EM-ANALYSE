/* EA-VALUE 3.0 — STOCKAGE : storageVersion, backup avant migration, restauration automatique en cas d'échec.
   Ne touche jamais aux clés historiques de l'utilisateur (ea_v3_*, ea_daily_archive, IndexedDB…). */
(function (g) {
  'use strict';
  if (typeof require === 'function' && typeof window === 'undefined') require('./ea-core.js');
  var EA = g.EA, C = EA.core;
  var VERSION_KEY = 'ea_storage_version', BACKUP_KEY = 'ea_backup_last', SETTINGS_KEY = 'ea_pro_settings', MEMORY_KEY = 'ea_pro_memory';
  var DEFAULT_SETTINGS = { mode: 'VALUE', fast: false, mcIterations: 10000, bankroll: null, minStake: null, sport: 'football' };

  var MIGRATIONS = [
    { to: 1, name: 'v0 → v1 : marquage de version (données historiques inchangées)', touches: [], up: function () { } },
    { to: 2, name: 'v1 → v2 : création de EA Memory et des réglages Pro', touches: [MEMORY_KEY, SETTINGS_KEY], up: function (st) {
      if (st.getItem(MEMORY_KEY) == null) st.setItem(MEMORY_KEY, JSON.stringify({ schema: 1, analyses: [] }));
      if (st.getItem(SETTINGS_KEY) == null) st.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
    } }
  ];
  var TARGET = MIGRATIONS[MIGRATIONS.length - 1].to;

  function currentVersion(st) { var n = parseInt(st.getItem(VERSION_KEY), 10); return isFinite(n) && n >= 0 ? n : 0; }
  function snapshot(st, keys) { var s = {}; keys.forEach(function (k) { s[k] = st.getItem(k); }); return s; }
  function restore(st, snap) { Object.keys(snap).forEach(function (k) { if (snap[k] === null) st.removeItem(k); else st.setItem(k, snap[k]); }); }

  // opts.registry / opts.target permettent de tester des migrations défaillantes
  function migrate(st, opts) {
    opts = opts || {}; var reg = opts.registry || MIGRATIONS, target = opts.target == null ? TARGET : opts.target, from = currentVersion(st), log = [];
    if (from > target) return { ok: false, from: from, to: from, error: 'VERSION_TROP_RECENTE', log: log };
    for (var i = 0; i < reg.length; i++) {
      var m = reg[i]; if (m.to <= from || m.to > target) continue;
      var snap = snapshot(st, m.touches), prevVer = currentVersion(st);
      try { st.setItem(BACKUP_KEY, JSON.stringify({ from: prevVer, to: m.to, ts: Date.now(), name: m.name, snapshot: snap })); }
      catch (e) { return { ok: false, from: prevVer, to: prevVer, error: 'BACKUP_FAILED', restored: false, log: log }; }
      try { m.up(st); if (typeof m.verify === 'function' && !m.verify(st)) throw new Error('VERIFY_FAILED'); st.setItem(VERSION_KEY, String(m.to)); log.push('OK ' + m.name); }
      catch (e) { try { restore(st, snap); st.setItem(VERSION_KEY, String(prevVer)); } catch (e2) { return { ok: false, from: prevVer, to: prevVer, error: String(e && e.message || e), restored: false, log: log }; }
        log.push('ÉCHEC ' + m.name + ' → backup restauré'); return { ok: false, from: prevVer, to: prevVer, error: String(e && e.message || e), restored: true, log: log }; }
    }
    return { ok: true, from: from, to: currentVersion(st), log: log };
  }
  function loadSettings(st) { try { var o = JSON.parse(st.getItem(SETTINGS_KEY)); return Object.assign({}, DEFAULT_SETTINGS, o || {}); } catch (e) { return Object.assign({}, DEFAULT_SETTINGS); } }
  function saveSettings(st, s) { try { st.setItem(SETTINGS_KEY, JSON.stringify(Object.assign({}, DEFAULT_SETTINGS, s))); return true; } catch (e) { return false; } }
  // Clés Pro à inclure dans l'export/import de sauvegarde
  var EXPORT_KEYS = [MEMORY_KEY, SETTINGS_KEY, VERSION_KEY];

  EA.storage = { VERSION_KEY: VERSION_KEY, BACKUP_KEY: BACKUP_KEY, SETTINGS_KEY: SETTINGS_KEY, MEMORY_KEY: MEMORY_KEY, MIGRATIONS: MIGRATIONS, TARGET: TARGET, EXPORT_KEYS: EXPORT_KEYS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS, currentVersion: currentVersion, migrate: migrate, loadSettings: loadSettings, saveSettings: saveSettings };
  if (typeof module === 'object' && module.exports) module.exports = EA.storage;
})(typeof window !== 'undefined' ? window : global);
