const { app, BrowserWindow, ipcMain, globalShortcut, session, systemPreferences } = require('electron');
const path = require('path');
const { initDb, getDb } = require('./db');
const { seedDev } = require('./seed_dev');
const offDb = require('./lib/offDb');
const { categoryFromOffTags } = require('./lib/offCategoryMap');

// One-time backfill: for foods with a barcode whose category is still 'other',
// look up off_cache.products.categories_tags and derive a real category.
function backfillFoodCategoriesFromOff() {
  const db = getDb();
  try {
    const seeded = db.prepare("SELECT value FROM settings WHERE key = 'schema.foods_category_backfill_v1'").get();
    if (seeded) return;
    if (!offDb.exists()) {
      // No mirror yet — nothing to derive from. We'll try again next launch.
      return;
    }
    const rows = db.prepare(
      "SELECT id, barcode FROM foods WHERE barcode IS NOT NULL AND (category IS NULL OR category = 'other') AND is_placeholder = 0"
    ).all();
    if (rows.length === 0) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('schema.foods_category_backfill_v1', '1')").run();
      return;
    }
    const lookup = offDb.getOffDb().prepare("SELECT categories_tags FROM products WHERE code = ?");
    const update = db.prepare("UPDATE foods SET category = ? WHERE id = ?");
    let updated = 0;
    db.transaction(() => {
      for (const f of rows) {
        const r = lookup.get(String(f.barcode));
        if (!r || !r.categories_tags) continue;
        const tags = String(r.categories_tags).split(',').filter(Boolean);
        const cat = categoryFromOffTags(tags);
        if (cat && cat !== 'other') {
          update.run(cat, f.id);
          updated++;
        }
      }
    })();
    // Only mark as done when we've actually mapped at least one row; otherwise
    // a future OFF mirror refresh can fill in categories_tags and we'll retry.
    if (updated > 0) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('schema.foods_category_backfill_v1', '1')").run();
    }
    console.log(`[backfill] foods category: updated ${updated}/${rows.length} rows`);
  } catch (e) { console.error('foods category backfill failed:', e.message); }
}

const registerFoodsIpc    = require('./ipc/foods.ipc');
const registerLogIpc      = require('./ipc/log.ipc');
const registerRecipesIpc       = require('./ipc/recipes.ipc');
const registerActualRecipesIpc = require('./ipc/actual_recipes.ipc');
const registerExercisesIpc     = require('./ipc/exercises.ipc');
const registerWaterIpc    = require('./ipc/water.ipc');
const registerWeightIpc   = require('./ipc/weight.ipc');
const registerSettingsIpc     = require('./ipc/settings.ipc');
const registerOpenFoodFactsIpc = require('./ipc/openfoodfacts.ipc');
const registerOffLocalIpc      = require('./ipc/off_local.ipc');
const registerNotesIpc       = require('./ipc/notes.ipc');
const registerStreaksIpc     = require('./ipc/streaks.ipc');
const registerSupplementsIpc = require('./ipc/supplements.ipc');
const registerTemplatesIpc  = require('./ipc/templates.ipc');
const registerImportIpc     = require('./ipc/import.ipc');
const registerExportIpc     = require('./ipc/export.ipc');
const registerMeasurementsIpc = require('./ipc/measurements.ipc');
const { registerUndoIpc }     = require('./ipc/undo.ipc');
const registerPantryIpc       = require('./ipc/pantry.ipc');
const registerAnalyticsIpc    = require('./ipc/analytics.ipc');
const registerGoalsTdeeIpc    = require('./ipc/goals_tdee.ipc');
const registerDailyEnergyIpc  = require('./ipc/daily_energy.ipc');
const registerNotificationsIpc = require('./ipc/notifications.ipc');
const registerWorkoutPlansIpc    = require('./ipc/workout_plans.ipc');
const registerWorkoutScheduleIpc = require('./ipc/workout_schedule.ipc');
const registerSuggestionsIpc    = require('./ipc/suggestions.ipc');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0a0a0a',
    title: 'CalorieCounter',
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5199');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.webContents.on('console-message', (_e, level, msg, line, src) => {
    const tag = ['V','I','W','E'][level] || '?';
    console.log(`[renderer:${tag}] ${msg}  (${src}:${line})`);
  });
}

app.whenReady().then(async () => {
  initDb();
  seedDev();
  backfillFoodCategoriesFromOff();

  // Grant camera (and mic) for barcode scanner. Electron denies media by default.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'media' || permission === 'mediaKeySystem') return callback(true);
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    if (permission === 'media') return true;
    return false;
  });

  // macOS: ensure TCC camera access for the running process.
  if (process.platform === 'darwin') {
    try { await systemPreferences.askForMediaAccess('camera'); } catch {}
  }

  registerFoodsIpc();
  registerLogIpc();
  registerRecipesIpc();
  registerActualRecipesIpc();
  registerExercisesIpc();
  registerWaterIpc();
  registerWeightIpc();
  registerSettingsIpc();
  registerOpenFoodFactsIpc();
  registerOffLocalIpc();
  registerNotesIpc();
  registerStreaksIpc();
  registerSupplementsIpc();
  registerTemplatesIpc();
  registerImportIpc();
  registerExportIpc();
  registerMeasurementsIpc();
  registerUndoIpc();
  registerPantryIpc();
  registerAnalyticsIpc();
  registerGoalsTdeeIpc();
  registerDailyEnergyIpc();
  registerNotificationsIpc();
  registerWorkoutPlansIpc();
  registerWorkoutScheduleIpc();
  registerSuggestionsIpc();

  createWindow();

  // Global shortcut: focus quick-add from anywhere on the desktop
  globalShortcut.register('CommandOrControl+N', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('shortcut:quickAdd');
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
