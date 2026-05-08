// Owns the read-only Open Food Facts mirror SQLite database (off_cache.db).
// Kept separate from the user's calories.db so wiping/refreshing the cache
// can never corrupt user data.
//
// The schema is created lazily — the file isn't touched until the user
// triggers a download from the Data page.

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const Database = require('better-sqlite3');

const SCHEMA_VERSION = 1;

let dbInstance = null;
let dbPath = null;

function getOffDbPath() {
  if (dbPath) return dbPath;
  dbPath = path.join(app.getPath('userData'), 'off_cache.db');
  return dbPath;
}

function getTempDbPath() {
  return getOffDbPath() + '.tmp';
}

function exists() {
  return fs.existsSync(getOffDbPath());
}

function applySchema(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      code            TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      brand           TEXT,
      calories        REAL NOT NULL,
      protein         REAL NOT NULL DEFAULT 0,
      carbs           REAL NOT NULL DEFAULT 0,
      fat             REAL NOT NULL DEFAULT 0,
      fiber           REAL NOT NULL DEFAULT 0,
      sugar           REAL,
      saturated_fat   REAL,
      sodium_mg       REAL,
      pack_grams      REAL,
      is_liquid       INTEGER NOT NULL DEFAULT 0,
      completeness    REAL NOT NULL DEFAULT 0,
      categories_tags TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
      name, brand,
      content='products',
      content_rowid='rowid',
      tokenize='unicode61 remove_diacritics 2'
    );

    -- Triggers keep FTS in sync. Important on the live cache path, where the
    -- live API fallback writes a row at a time after a search miss.
    CREATE TRIGGER IF NOT EXISTS products_ai AFTER INSERT ON products BEGIN
      INSERT INTO products_fts(rowid, name, brand) VALUES (new.rowid, new.name, new.brand);
    END;
    CREATE TRIGGER IF NOT EXISTS products_ad AFTER DELETE ON products BEGIN
      INSERT INTO products_fts(products_fts, rowid, name, brand) VALUES('delete', old.rowid, old.name, old.brand);
    END;
    CREATE TRIGGER IF NOT EXISTS products_au AFTER UPDATE ON products BEGIN
      INSERT INTO products_fts(products_fts, rowid, name, brand) VALUES('delete', old.rowid, old.name, old.brand);
      INSERT INTO products_fts(rowid, name, brand) VALUES (new.rowid, new.name, new.brand);
    END;

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Idempotent migration for older mirrors that lack categories_tags
  try { db.exec('ALTER TABLE products ADD COLUMN categories_tags TEXT'); }
  catch (e) {
    if (!/duplicate column/i.test(String(e?.message))) throw e;
  }

  // Stamp schema version
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
}

/** Returns a singleton handle to the off_cache.db, creating it lazily. */
function getOffDb() {
  if (dbInstance) return dbInstance;
  const p = getOffDbPath();
  dbInstance = new Database(p);
  applySchema(dbInstance);
  return dbInstance;
}

/** Opens a brand-new DB at the temp path, applies the schema, returns the handle.
 *  Used by the importer so the live cache stays usable until the import succeeds. */
function openTempDb() {
  const tmp = getTempDbPath();
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  const db = new Database(tmp);
  applySchema(db);
  return db;
}

/** Atomically swaps the temp DB onto the real path. Closes the live handle first. */
function commitTempDb() {
  if (dbInstance) { dbInstance.close(); dbInstance = null; }
  const tmp = getTempDbPath();
  const live = getOffDbPath();
  if (!fs.existsSync(tmp)) throw new Error('temp DB missing');
  fs.renameSync(tmp, live);
}

function discardTempDb() {
  const tmp = getTempDbPath();
  if (fs.existsSync(tmp)) {
    try { fs.unlinkSync(tmp); } catch { /* may be locked on Windows; ignore */ }
  }
  // WAL/SHM siblings
  for (const ext of ['-wal', '-shm']) {
    const f = tmp + ext;
    if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch { /* */ } }
  }
}

function deleteOffDb() {
  if (dbInstance) { dbInstance.close(); dbInstance = null; }
  const live = getOffDbPath();
  for (const f of [live, live + '-wal', live + '-shm']) {
    if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch { /* */ } }
  }
}

function getStatus() {
  const live = getOffDbPath();
  if (!fs.existsSync(live)) {
    return { initialized: false, sizeBytes: 0, productCount: 0, lastSynced: '' };
  }
  let sizeBytes = 0;
  for (const f of [live, live + '-wal', live + '-shm']) {
    if (fs.existsSync(f)) {
      try { sizeBytes += fs.statSync(f).size; } catch { /* */ }
    }
  }
  let productCount = 0;
  let lastSynced = '';
  try {
    const db = getOffDb();
    productCount = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
    const row = db.prepare("SELECT value FROM meta WHERE key = 'imported_at'").get();
    lastSynced = row?.value || '';
  } catch { /* */ }
  return { initialized: true, sizeBytes, productCount, lastSynced };
}

module.exports = {
  getOffDb,
  getOffDbPath,
  openTempDb,
  commitTempDb,
  discardTempDb,
  deleteOffDb,
  exists,
  getStatus,
  applySchema,
};
