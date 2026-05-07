const { app, BrowserWindow, ipcMain, globalShortcut, session, systemPreferences } = require('electron');
const path = require('path');
const { initDb } = require('./db');
const { seedDev } = require('./seed_dev');

const registerFoodsIpc    = require('./ipc/foods.ipc');
const registerLogIpc      = require('./ipc/log.ipc');
const registerRecipesIpc       = require('./ipc/recipes.ipc');
const registerActualRecipesIpc = require('./ipc/actual_recipes.ipc');
const registerExercisesIpc     = require('./ipc/exercises.ipc');
const registerWaterIpc    = require('./ipc/water.ipc');
const registerWeightIpc   = require('./ipc/weight.ipc');
const registerSettingsIpc     = require('./ipc/settings.ipc');
const registerBarcodeIpc     = require('./ipc/barcode.ipc');
const { registerCustomDbIpc } = require('./ipc/customdb.ipc');
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
const registerSleepIpc           = require('./ipc/sleep.ipc');
const registerTasksIpc           = require('./ipc/tasks.ipc');
const registerHabitsIpc          = require('./ipc/habits.ipc');
const registerFocusIpc           = require('./ipc/focus.ipc');
const registerMoodIpc            = require('./ipc/mood.ipc');
const registerWorkoutsIpc        = require('./ipc/workouts.ipc');
const { registerGamificationIpc } = require('./ipc/gamification.ipc');

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
    title: 'LifeBuddy',
    icon: path.join(__dirname, '../build/icon.ico'),
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

  // Grant camera for barcode scanner. Electron 41+ uses 'camera' separately from 'media'.
  const ALLOWED_PERMISSIONS = new Set(['media', 'camera', 'microphone', 'mediaKeySystem']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return ALLOWED_PERMISSIONS.has(permission);
  });
  session.defaultSession.setDevicePermissionHandler((details) => {
    return details.deviceType === 'camera';
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
  registerBarcodeIpc();
  registerCustomDbIpc();
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
  registerSleepIpc();
  registerTasksIpc();
  registerHabitsIpc();
  registerFocusIpc();
  registerMoodIpc();
  registerWorkoutsIpc();
  registerGamificationIpc();

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
