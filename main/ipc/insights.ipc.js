'use strict';
const { getDb } = require('../db');
const { buildInsights } = require('../lib/insights/insightBuilder');
const { setDayReliability, clearDayReliability } = require('../lib/insights/reliability');

// Keys as stored in the settings table (snake_case, matching the frontend convention)
const SETTING_DEFAULTS = {
  'insights_enabled':            { short: 'enabled',           def: true },
  'insights_use_nutrition':      { short: 'useNutrition',      def: true },
  'insights_include_approx_days':{ short: 'includeApproxDays', def: false },
  'insights_min_pair_n':         { short: 'minPairN',          def: 21 },
  'insights_fdr_q':              { short: 'fdrQ',              def: 0.10 },
  'insights_sleep_target_min':   { short: 'sleepTargetMin',    def: 480 },
  'insights_window_days':        { short: 'windowDays',        def: 90 },
};

function readSettings(db) {
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'insights_%'").all();
  const raw = {};
  for (const r of rows) raw[r.key] = r.value;

  const s = {};
  for (const [k, { short, def }] of Object.entries(SETTING_DEFAULTS)) {
    if (!(k in raw)) { s[short] = def; continue; }
    const v = raw[k];
    s[short] = typeof def === 'boolean' ? (v === '1' || v === 'true') : Number(v);
  }

  const wg = db.prepare("SELECT value FROM settings WHERE key IN ('goal_weight','target_weight','weight_goal') LIMIT 1").get();
  if (wg && wg.value != null && wg.value !== '') s.goalWeight = Number(wg.value);

  const langRow = db.prepare("SELECT value FROM settings WHERE key = 'language'").get();
  s.language = langRow?.value ?? 'en';

  return s;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getInsights(db, { windowDays, today } = {}) {
  const settings = readSettings(db);
  const w = windowDays || settings.windowDays || 90;
  return buildInsights(db, { windowDays: w, settings, today: today || todayStr() });
}

function setReliability(db, { date, level }) {
  setDayReliability(db, date, level);
  return { ok: true };
}

function clearReliability(db, { date }) {
  clearDayReliability(db, date);
  return { ok: true };
}

function registerInsightsIpc() {
  const { ipcMain } = require('electron');
  ipcMain.handle('insights:get', (_, args) => getInsights(getDb(), args || {}));
  ipcMain.handle('insights:setDayReliability', (_, args) => setReliability(getDb(), args || {}));
  ipcMain.handle('insights:clearDayReliability', (_, args) => clearReliability(getDb(), args || {}));
}

module.exports = registerInsightsIpc;
module.exports.getInsights = getInsights;
module.exports.setReliability = setReliability;
module.exports.clearReliability = clearReliability;
module.exports.readSettings = readSettings;
