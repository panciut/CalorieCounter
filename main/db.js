const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

let db;

function getDbPath() {
  return path.join(app.getPath('userData'), 'calories.db');
}

function getDb() {
  if (!db) {
    db = new Database(getDbPath());
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

function initDb() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS foods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      calories REAL NOT NULL,
      protein REAL NOT NULL,
      carbs REAL NOT NULL,
      fat REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      food_id INTEGER NOT NULL,
      grams REAL NOT NULL,
      FOREIGN KEY (food_id) REFERENCES foods(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS weight_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      weight REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      food_id INTEGER NOT NULL,
      grams REAL NOT NULL,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
      FOREIGN KEY (food_id) REFERENCES foods(id)
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      duration_min REAL NOT NULL DEFAULT 0,
      calories_burned REAL NOT NULL DEFAULT 0,
      notes TEXT,
      source TEXT NOT NULL DEFAULT 'manual'
    );

    CREATE TABLE IF NOT EXISTS exercise_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_id INTEGER NOT NULL,
      set_number INTEGER NOT NULL,
      reps INTEGER,
      weight_kg REAL,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exercise_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      met_value REAL NOT NULL DEFAULT 5.0,
      category TEXT NOT NULL DEFAULT 'other'
    );

    CREATE TABLE IF NOT EXISTS actual_recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      yield_g REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (date('now'))
    );

    CREATE TABLE IF NOT EXISTS actual_recipe_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      food_id INTEGER NOT NULL,
      grams REAL NOT NULL,
      FOREIGN KEY (recipe_id) REFERENCES actual_recipes(id) ON DELETE CASCADE,
      FOREIGN KEY (food_id) REFERENCES foods(id)
    );

    CREATE TABLE IF NOT EXISTS water_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      ml REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_notes (
      date TEXT PRIMARY KEY,
      note TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS supplements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS supplement_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplement_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (supplement_id) REFERENCES supplements(id) ON DELETE CASCADE,
      UNIQUE(supplement_id, date)
    );

    CREATE TABLE IF NOT EXISTS meal_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS template_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      food_id INTEGER NOT NULL,
      grams REAL NOT NULL,
      meal TEXT NOT NULL DEFAULT 'AfternoonSnack',
      FOREIGN KEY (template_id) REFERENCES meal_templates(id) ON DELETE CASCADE,
      FOREIGN KEY (food_id) REFERENCES foods(id)
    );

    CREATE TABLE IF NOT EXISTS body_measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      waist REAL, chest REAL, arms REAL, thighs REAL, hips REAL, neck REAL
    );

    CREATE TABLE IF NOT EXISTS undo_stack (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      action TEXT NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pantry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      food_id INTEGER NOT NULL UNIQUE,
      quantity_g REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS shopping_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      food_id INTEGER NOT NULL,
      quantity_g REAL NOT NULL DEFAULT 0,
      checked INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS daily_energy (
      date TEXT PRIMARY KEY,
      resting_kcal REAL NOT NULL DEFAULT 0,
      active_kcal REAL NOT NULL DEFAULT 0,
      extra_kcal REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS notification_dismissals (
      key TEXT PRIMARY KEY,
      dismissed_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      is_custom INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS workout_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (date('now')),
      updated_at TEXT NOT NULL DEFAULT (date('now'))
    );

    CREATE TABLE IF NOT EXISTS workout_plan_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL,
      exercise_type_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      target_sets INTEGER,
      target_reps INTEGER,
      target_duration_min REAL,
      target_weight_kg REAL,
      rest_sec INTEGER,
      is_optional INTEGER NOT NULL DEFAULT 0,
      superset_group INTEGER,
      notes TEXT,
      FOREIGN KEY (plan_id) REFERENCES workout_plans(id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_type_id) REFERENCES exercise_types(id)
    );

    CREATE TABLE IF NOT EXISTS workout_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      plan_id INTEGER,
      status TEXT NOT NULL DEFAULT 'planned',
      notes TEXT,
      FOREIGN KEY (plan_id) REFERENCES workout_plans(id) ON DELETE SET NULL
    );
  `);

  // Migrations: add columns that may not exist in imported databases
  const migrations = [
    "ALTER TABLE foods ADD COLUMN piece_grams REAL",
    "ALTER TABLE foods ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE log ADD COLUMN meal TEXT NOT NULL DEFAULT 'Snack'",
    "ALTER TABLE foods ADD COLUMN fiber REAL NOT NULL DEFAULT 0",
    "ALTER TABLE foods ADD COLUMN is_liquid INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE water_log ADD COLUMN source TEXT",
    "ALTER TABLE water_log ADD COLUMN log_id INTEGER",
    "ALTER TABLE log ADD COLUMN status TEXT NOT NULL DEFAULT 'logged'",
    "ALTER TABLE weight_log ADD COLUMN fat_pct REAL",
    "ALTER TABLE weight_log ADD COLUMN muscle_mass REAL",
    "ALTER TABLE weight_log ADD COLUMN water_pct REAL",
    "ALTER TABLE weight_log ADD COLUMN bone_mass REAL",
    "ALTER TABLE supplements ADD COLUMN unit TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE supplements ADD COLUMN notes TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE supplements ADD COLUMN created_at TEXT NOT NULL DEFAULT '2000-01-01'",
    "ALTER TABLE foods ADD COLUMN barcode TEXT",
    "ALTER TABLE pantry ADD COLUMN package_id INTEGER",
    "ALTER TABLE foods ADD COLUMN opened_days INTEGER",
    "ALTER TABLE foods ADD COLUMN discard_threshold_pct REAL NOT NULL DEFAULT 10",
    "ALTER TABLE pantry ADD COLUMN opened_at TEXT",
    "ALTER TABLE pantry ADD COLUMN opened_days INTEGER",
    "ALTER TABLE pantry ADD COLUMN starting_grams REAL",
    "ALTER TABLE actual_recipes ADD COLUMN prep_time_min INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE actual_recipes ADD COLUMN cook_time_min INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE actual_recipes ADD COLUMN tools TEXT",
    "ALTER TABLE actual_recipes ADD COLUMN procedure TEXT",
    "ALTER TABLE foods ADD COLUMN price_per_100g REAL",
    "ALTER TABLE foods ADD COLUMN is_bulk INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE food_packages ADD COLUMN price REAL",
    `CREATE TABLE IF NOT EXISTS action_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      food_name TEXT,
      grams REAL,
      details TEXT,
      ts TEXT DEFAULT (datetime('now'))
    )`,
    "ALTER TABLE exercise_types ADD COLUMN muscle_groups TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE exercise_types ADD COLUMN equipment TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE exercise_types ADD COLUMN instructions TEXT",
    "ALTER TABLE exercise_types ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE exercises ADD COLUMN schedule_id INTEGER",
    "ALTER TABLE exercises ADD COLUMN workout_session_id INTEGER",
    "ALTER TABLE supplements ADD COLUMN deleted_at TEXT",
    "ALTER TABLE supplements ADD COLUMN description TEXT",
    `CREATE TABLE IF NOT EXISTS supplement_dosages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplement_id INTEGER NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT '',
      effective_from TEXT NOT NULL,
      FOREIGN KEY (supplement_id) REFERENCES supplements(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS supplement_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      effective_from TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS supplement_plan_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL,
      supplement_id INTEGER NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (plan_id) REFERENCES supplement_plans(id) ON DELETE CASCADE,
      FOREIGN KEY (supplement_id) REFERENCES supplements(id)
    )`,
    `CREATE TABLE IF NOT EXISTS pantries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0
    )`,
    'ALTER TABLE pantry ADD COLUMN pantry_id INTEGER DEFAULT 1',
    'ALTER TABLE shopping_list ADD COLUMN pantry_id INTEGER DEFAULT 1',
    `CREATE TABLE IF NOT EXISTS scales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0
    )`,
    'ALTER TABLE weight_log ADD COLUMN scale_id INTEGER',
    'ALTER TABLE foods ADD COLUMN is_placeholder INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE foods ADD COLUMN display_name TEXT',
    "ALTER TABLE supplement_plan_items ADD COLUMN time_of_day TEXT NOT NULL DEFAULT 'breakfast'",
    "ALTER TABLE daily_energy ADD COLUMN steps INTEGER NOT NULL DEFAULT 0",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_workout_session_id ON exercises(workout_session_id) WHERE workout_session_id IS NOT NULL",
    "UPDATE log SET meal = 'AfternoonSnack' WHERE meal = 'Snack'",
    "UPDATE template_items SET meal = 'AfternoonSnack' WHERE meal = 'Snack'",
    "ALTER TABLE foods ADD COLUMN image_url TEXT",
  ];
  for (const stmt of migrations) {
    try { database.exec(stmt); } catch (_) {}
  }

  // Bootstrap the pantries table — create default "Home" pantry and backfill existing rows
  try {
    const pantryCount = database.prepare('SELECT COUNT(*) AS n FROM pantries').get().n;
    if (pantryCount === 0) {
      database.prepare("INSERT INTO pantries (name, is_default) VALUES ('Home', 1)").run();
      const defaultId = database.prepare('SELECT id FROM pantries WHERE is_default = 1').get().id;
      database.prepare('UPDATE pantry SET pantry_id = ? WHERE pantry_id IS NULL').run(defaultId);
      database.prepare('UPDATE shopping_list SET pantry_id = ? WHERE pantry_id IS NULL').run(defaultId);
    }
  } catch (_) {}

  // Bootstrap the scales table — seed two default scales the first time
  try {
    const scaleCount = database.prepare('SELECT COUNT(*) AS n FROM scales').get().n;
    if (scaleCount === 0) {
      database.prepare("INSERT INTO scales (name, is_default) VALUES ('Scale 1', 1)").run();
      database.prepare("INSERT INTO scales (name, is_default) VALUES ('Scale 2', 0)").run();
      const defaultId = database.prepare('SELECT id FROM scales WHERE is_default = 1').get().id;
      database.prepare('UPDATE weight_log SET scale_id = ? WHERE scale_id IS NULL').run(defaultId);
    }
  } catch (_) {}

  // Migrate existing supplements into the plan system (one-time, guarded)
  try {
    const alreadyMigrated = database.prepare('SELECT COUNT(*) AS n FROM supplement_plans').get().n > 0;
    if (!alreadyMigrated) {
      const existing = database.prepare(
        "SELECT id, qty, COALESCE(unit,'') AS unit, COALESCE(notes,'') AS notes, COALESCE(created_at,'2000-01-01') AS created_at FROM supplements WHERE deleted_at IS NULL"
      ).all();
      if (existing.length > 0) {
        const effectiveFrom = existing.reduce((min, s) => s.created_at < min ? s.created_at : min, existing[0].created_at);
        const planResult = database.prepare(
          'INSERT INTO supplement_plans (effective_from) VALUES (?)'
        ).run(effectiveFrom);
        const planId = planResult.lastInsertRowid;
        const insertItem = database.prepare(
          'INSERT INTO supplement_plan_items (plan_id, supplement_id, qty, unit, notes) VALUES (?, ?, ?, ?, ?)'
        );
        for (const s of existing) {
          insertItem.run(planId, s.id, s.qty, s.unit, s.notes);
        }
      }
    }
  } catch (_) {}

  // food_packages table (one-to-many with foods)
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS food_packages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        food_id INTEGER NOT NULL,
        grams REAL NOT NULL,
        FOREIGN KEY(food_id) REFERENCES foods(id) ON DELETE CASCADE
      )
    `);
    database.exec(`CREATE INDEX IF NOT EXISTS idx_food_packages_food ON food_packages(food_id)`);
  } catch (_) {}

  // One-time migration: drop UNIQUE(food_id) on pantry, add expiry_date column
  try {
    const indexes = database.prepare("PRAGMA index_list('pantry')").all();
    const hasUniqueOnFoodId = indexes.some(idx => {
      if (!idx.unique) return false;
      const cols = database.prepare(`PRAGMA index_info('${idx.name}')`).all();
      return cols.length === 1 && cols[0].name === 'food_id';
    });
    if (hasUniqueOnFoodId) {
      database.transaction(() => {
        database.exec(`
          CREATE TABLE IF NOT EXISTS pantry_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            food_id INTEGER NOT NULL,
            quantity_g REAL NOT NULL,
            expiry_date TEXT,
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE CASCADE
          )
        `);
        database.exec(`
          INSERT INTO pantry_new (id, food_id, quantity_g, expiry_date, updated_at)
            SELECT id, food_id, quantity_g, NULL, updated_at FROM pantry
        `);
        database.exec('DROP TABLE pantry');
        database.exec('ALTER TABLE pantry_new RENAME TO pantry');
        database.exec('CREATE INDEX IF NOT EXISTS idx_pantry_food_expiry ON pantry(food_id, expiry_date)');
      })();
    }
  } catch (e) { console.error('pantry schema migration failed:', e); }

  // Backfill starting_grams for existing batches that predate the column
  try {
    database.exec("UPDATE pantry SET starting_grams = quantity_g WHERE starting_grams IS NULL");
  } catch (_) {}

  // One-time migration v1: convert Shape A foods (piece_grams with no matching
  // package) into proper food_packages rows, clearing piece_grams. Leaves
  // Shape B foods alone (piece_grams AND a larger package both set).
  try {
    const migrated = database.prepare("SELECT value FROM settings WHERE key = 'schema.piece_pack_migrated_v1'").get();
    if (!migrated) {
      const foods = database.prepare("SELECT id, name, piece_grams FROM foods WHERE piece_grams IS NOT NULL").all();
      const getPackages = database.prepare("SELECT id, grams FROM food_packages WHERE food_id = ?");
      const insertPackage = database.prepare("INSERT INTO food_packages (food_id, grams) VALUES (?, ?)");
      const clearPieceGrams = database.prepare("UPDATE foods SET piece_grams = NULL WHERE id = ?");
      database.transaction(() => {
        for (const f of foods) {
          const packs = getPackages.all(f.id);
          const hasLarger = packs.some(p => p.grams > f.piece_grams + 0.01);
          const hasMatching = packs.some(p => Math.abs(p.grams - f.piece_grams) < 0.01);
          if (hasLarger) continue; // Shape B: keep piece_grams
          if (packs.length === 0) {
            insertPackage.run(f.id, f.piece_grams);
            clearPieceGrams.run(f.id);
            console.log(`[migration v1] ${f.name}: piece_grams ${f.piece_grams}g → new package`);
          } else if (hasMatching) {
            clearPieceGrams.run(f.id);
            console.log(`[migration v1] ${f.name}: piece_grams cleared (duplicate of existing pack)`);
          }
        }
      })();
      database.prepare("INSERT INTO settings (key, value) VALUES ('schema.piece_pack_migrated_v1', '1')").run();
    }
  } catch (e) { console.error('piece_pack migration failed:', e); }

  // One-time migration v2: backfill pantry.package_id for rows that predate
  // current pack-aware add flow, and split multi-pack rows into one row per pack.
  // For a row with NULL package_id:
  //   - if quantity_g ≤ smallest pack whose grams ≥ quantity_g → link to that pack
  //   - else if quantity_g divides evenly into a pack → split into N rows of that pack
  //   - else: skip (ambiguous)
  // For a row with non-NULL package_id but quantity_g > pack.grams → split.
  try {
    const migrated = database.prepare("SELECT value FROM settings WHERE key = 'schema.pantry_package_backfill_v1'").get();
    if (!migrated) {
      const getRows = database.prepare(`
        SELECT id, food_id, quantity_g, package_id, expiry_date, opened_at, opened_days, starting_grams
        FROM pantry
      `);
      const getPackages = database.prepare("SELECT id, grams FROM food_packages WHERE food_id = ? ORDER BY grams");
      const updateRow = database.prepare("UPDATE pantry SET package_id = ?, quantity_g = ?, starting_grams = ? WHERE id = ?");
      const insertRow = database.prepare(`
        INSERT INTO pantry (food_id, quantity_g, expiry_date, package_id, opened_at, opened_days, starting_grams, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);
      const EPS = 0.02;

      database.transaction(() => {
        const rows = getRows.all();
        for (const r of rows) {
          const packs = getPackages.all(r.food_id);
          if (packs.length === 0) continue;

          const currentPack = r.package_id ? packs.find(p => p.id === r.package_id) : null;
          if (currentPack && r.quantity_g <= currentPack.grams * (1 + EPS)) continue;

          let refPack = currentPack;
          if (!refPack) {
            const fits = packs.find(p => r.quantity_g <= p.grams * (1 + EPS));
            if (fits) {
              refPack = fits;
            } else {
              const divisible = packs.filter(p => {
                const ratio = r.quantity_g / p.grams;
                return Math.abs(ratio - Math.round(ratio)) < EPS && Math.round(ratio) >= 1;
              });
              if (divisible.length === 0) continue;
              refPack = divisible[0];
            }
          }

          const n = Math.round(r.quantity_g / refPack.grams);
          if (n <= 0) continue;

          if (n === 1) {
            const newStarting = r.starting_grams != null ? r.starting_grams : refPack.grams;
            updateRow.run(refPack.id, r.quantity_g, newStarting, r.id);
            console.log(`[pantry backfill] row ${r.id}: linked to pack ${refPack.id} (${refPack.grams}g)`);
          } else {
            updateRow.run(refPack.id, refPack.grams, refPack.grams, r.id);
            for (let i = 1; i < n; i++) {
              insertRow.run(r.food_id, refPack.grams, r.expiry_date, refPack.id, r.opened_at, r.opened_days, refPack.grams);
            }
            console.log(`[pantry backfill] row ${r.id}: split into ${n} × ${refPack.grams}g (pack ${refPack.id})`);
          }
        }
      })();
      database.prepare("INSERT INTO settings (key, value) VALUES ('schema.pantry_package_backfill_v1', '1')").run();
    }
  } catch (e) { console.error('pantry package backfill failed:', e); }

  // Default settings
  const insertSetting = database.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  for (const [key, val] of [
    ['cal_goal', '2000'],
    ['protein_goal', '150'],
    ['carbs_goal', '250'],
    ['fat_goal', '70'],
    ['weight_goal', '0'],
    ['fiber_goal', '25'],
    ['water_goal', '2000'],
    ['language', 'en'],
    ['theme', 'dark'],
    ['pantry_enabled', '1'],
    ['pantry_warn_days', '3'],
    ['pantry_urgent_days', '1'],
    ['currency_symbol', '€'],
  ]) {
    insertSetting.run(key, val);
  }

  // Seed default exercise types (name, met_value, category, muscle_groups, equipment)
  const insertExType = database.prepare(
    'INSERT OR IGNORE INTO exercise_types (name, met_value, category, muscle_groups, equipment, instructions, is_custom) VALUES (?, ?, ?, ?, ?, ?, 0)'
  );
  for (const [name, met, cat, muscles, equip, instructions] of [
    // Cardio
    ['Running',              9.8,  'cardio',      'quadriceps,hamstrings,calves,glutes',        '', ''],
    ['Cycling',              7.5,  'cardio',      'quadriceps,hamstrings,glutes,calves',         'bike', ''],
    ['Swimming',             8.0,  'cardio',      'full_body',                                   '', ''],
    ['Walking',              3.5,  'cardio',      'quadriceps,calves,glutes',                    '', ''],
    ['HIIT',                 8.0,  'cardio',      'full_body',                                   '', ''],
    ['Jump Rope',           11.0,  'cardio',      'calves,quadriceps,shoulders',                 'jump_rope', ''],
    ['Rowing',               7.0,  'cardio',      'back,biceps,quadriceps,glutes',               'rowing_machine', ''],
    ['Elliptical',           5.0,  'cardio',      'quadriceps,hamstrings,glutes',                'machine', ''],
    ['Stair Climbing',       8.0,  'cardio',      'quadriceps,glutes,calves',                    'machine', ''],
    ['Boxing',               9.0,  'cardio',      'shoulders,biceps,triceps,abs',                '', ''],
    // Strength — Chest
    ['Bench Press',          6.0,  'strength',    'chest,triceps,shoulders',                     'barbell,bench', ''],
    ['Incline Bench Press',  6.0,  'strength',    'chest,triceps,shoulders',                     'barbell,bench', ''],
    ['Dumbbell Flyes',       4.0,  'strength',    'chest,shoulders',                             'dumbbell,bench', ''],
    ['Push-ups',             5.0,  'strength',    'chest,triceps,shoulders',                     '', 'EN: Keep your body in a straight line, lower until your chest is close to the floor, then push back up.\nIT: Mantieni il corpo in linea retta, scendi fino a sfiorare il pavimento con il petto, poi spingi per risalire.'],
    ['Cable Crossover',      4.0,  'strength',    'chest,shoulders',                             'cable', ''],
    ['Floor Press',          5.5,  'strength',    'chest,triceps,shoulders',                     'dumbbell', 'EN: Lie on the floor, press dumbbells up until arms are fully extended.\nIT: Disteso a terra, spingi i manubri verso l\'alto flettendo e stendendo le braccia.'],
    ['Bridge Press',         5.5,  'strength',    'chest,triceps,shoulders,glutes',              'dumbbell', 'EN: Floor press while maintaining a glute bridge position.\nIT: Floor press eseguita mantenendo il bacino sollevato (ponte glutei).'],
    // Strength — Back
    ['Deadlift',             6.0,  'strength',    'back,glutes,hamstrings,forearms',             'barbell', ''],
    ['Barbell Row',          6.0,  'strength',    'back,biceps,forearms',                        'barbell', ''],
    ['Lat Pulldown',         5.0,  'strength',    'back,biceps',                                 'machine,cable', ''],
    ['Pull-ups',             8.0,  'strength',    'back,biceps',                                 'pull_up_bar', 'EN: Hang from a bar, pull yourself up until your chin passes the bar, lower with control.\nIT: Appenditi a una sbarra, tirati su fino a superarla col mento, scendi con controllo.'],
    ['Seated Cable Row',     5.0,  'strength',    'back,biceps',                                 'cable', ''],
    ['Dumbbell Row',         5.0,  'strength',    'back,biceps',                                 'dumbbell', 'EN: Support one knee and hand on a bench, pull the dumbbell up to your hip keeping your back straight.\nIT: Appoggia ginocchio e mano su una panca, tira il manubrio fino all\'anca mantenendo la schiena dritta.'],
    ['Gorilla Row',          5.5,  'strength',    'back,biceps',                                 'dumbbell', 'EN: Alternate rowing dumbbells from the floor while maintaining a bent-over position.\nIT: Remata alternata partendo col busto flesso quasi parallelo al suolo (manubri a terra).'],
    ['Pullover',             4.5,  'strength',    'back,chest',                                  'dumbbell,bench', 'EN: Lie on a bench, lower a dumbbell behind your head with slightly bent arms, pull it back over your chest.\nIT: Sdraiato, abbassa il manubrio dietro la testa con braccia semi-tese, torna sopra il petto.'],
    ['Shrugs',               3.5,  'strength',    'traps',                                       'dumbbell', 'EN: Stand straight, hold dumbbells at your sides, and shrug your shoulders up.\nIT: In piedi, solleva o "scrolla" le spalle verso l\'alto tenendo le braccia dritte.'],
    // Strength — Shoulders
    ['Overhead Press',       6.0,  'strength',    'shoulders,triceps',                           'barbell', ''],
    ['Dumbbell Press',       5.0,  'strength',    'shoulders,triceps',                           'dumbbell', 'EN: Sit or stand, press dumbbells overhead until arms are fully extended.\nIT: Seduto o in piedi, spingi i manubri verso l\'alto fino a stendere completamente le braccia.'],
    ['Lateral Raises',       3.0,  'strength',    'shoulders',                                   'dumbbell', 'EN: Raise dumbbells to your sides until they reach shoulder height.\nIT: Solleva i manubri lateralmente fino all\'altezza delle spalle.'],
    ['Face Pulls',           3.0,  'strength',    'shoulders,back',                              'cable', ''],
    ['Front Raises',         3.0,  'strength',    'shoulders',                                   'dumbbell', 'EN: Raise dumbbells in front of you up to shoulder level.\nIT: Solleva i manubri davanti a te fino all\'altezza delle spalle.'],
    ['Dumbbell Arnold Press',5.0,  'strength',    'shoulders,triceps',                           'dumbbell', 'EN: Start with dumbbells in front of shoulders, palms facing you. Rotate hands outwards as you press up.\nIT: Inizia con i manubri davanti alle spalle, palmi verso di te. Ruota i polsi verso l\'esterno mentre spingi in alto.'],
    ['Reverse Flyes',        3.0,  'strength',    'shoulders,back',                              'dumbbell', 'EN: Bend over, raise dumbbells to your sides to train the rear delts.\nIT: Busto flesso (a 90°), solleva i manubri lateralmente per il deltoide posteriore.'],
    ['Scaption',             3.0,  'strength',    'shoulders',                                   'dumbbell', 'EN: Raise dumbbells diagonally (scapular plane).\nIT: Alzate lungo il "piano scapolare" (in diagonale).'],
    // Strength — Arms
    ['Barbell Curl',         4.0,  'strength',    'biceps,forearms',                             'barbell', ''],
    ['Dumbbell Curl',        4.0,  'strength',    'biceps,forearms',                             'dumbbell', 'EN: Curl the dumbbells towards your shoulders, keeping your elbows stationary.\nIT: Fletti i manubri verso le spalle, mantenendo i gomiti fermi lungo i fianchi.'],
    ['Hammer Curl',          4.0,  'strength',    'biceps,forearms',                             'dumbbell', 'EN: Curl dumbbells with palms facing each other.\nIT: Fletti i manubri mantenendo i palmi rivolti l\'uno verso l\'altro.'],
    ['Concentration Curl',   3.5,  'strength',    'biceps',                                      'dumbbell', 'EN: Sit and rest your elbow on your inner thigh, curling the dumbbell up.\nIT: Seduto, gomito appoggiato all\'interno coscia, solleva il manubrio concentrandoti sul bicipite.'],
    ['Tricep Pushdown',      4.0,  'strength',    'triceps',                                     'cable', ''],
    ['Skull Crushers',       4.0,  'strength',    'triceps',                                     'barbell,bench', ''],
    ['Tricep Dips',          5.0,  'strength',    'triceps,chest,shoulders',                     '', 'EN: Lower your body by bending elbows until they are at a 90-degree angle, then push back up.\nIT: Abbassa il corpo piegando i gomiti a 90 gradi, poi spingi per risalire. Ottimo su parallele o sedia/panca.'],
    ['Tricep Kickback',      3.5,  'strength',    'triceps',                                     'dumbbell', 'EN: Bend over, keep elbow high and extend arm backward.\nIT: Busto flesso, gomito alto, estendi il braccio all\'indietro.'],
    ['Overhead Tricep Ext',  4.0,  'strength',    'triceps',                                     'dumbbell', 'EN: Hold a dumbbell overhead, lower it behind your head by bending elbows, then press up.\nIT: Estensione singola o a due mani sopra la testa in piedi o seduto.'],
    // Strength — Legs
    ['Squat',                6.0,  'strength',    'quadriceps,glutes,hamstrings',                'barbell', ''],
    ['Bodyweight Squat',     5.0,  'strength',    'quadriceps,glutes,hamstrings',                '', 'EN: Keep chest up, push hips back and bend knees to lower down. Keep weight on your heels.\nIT: Petto in fuori, spingi il bacino indietro e piega le ginocchia. Tieni il peso sui talloni.'],
    ['Goblet Squat',         5.5,  'strength',    'quadriceps,glutes,core',                      'dumbbell', 'EN: Hold one dumbbell vertically against your chest, perform a squat keeping your torso upright.\nIT: Tieni in verticale un manubrio contro il petto e fai uno squat mantenendo il busto dritto.'],
    ['Front Squat',          6.0,  'strength',    'quadriceps,glutes,core',                      'dumbbell', 'EN: Hold two dumbbells resting on your shoulders while squatting.\nIT: Due manubri appoggiati alle spalle mentre esegui lo squat.'],
    ['Sumo Squat',           5.5,  'strength',    'quadriceps,glutes,adductors',                 'dumbbell', 'EN: Wide stance, toes pointed out, hold a dumbbell between your legs.\nIT: Gambe larghe, punte in fuori, manubrio tra le gambe per target anche sull\'interno coscia.'],
    ['Leg Press',            5.0,  'strength',    'quadriceps,glutes,hamstrings',                'machine', ''],
    ['Lunges',               5.0,  'strength',    'quadriceps,glutes,hamstrings',                '', 'EN: Step forward and lower hips until both knees are bent at a 90-degree angle.\nIT: Fai un passo in avanti e scendi finché entrambe le ginocchia formano un angolo di 90 gradi.'],
    ['Dumbbell Lunges',      5.5,  'strength',    'quadriceps,glutes,hamstrings',                'dumbbell', 'EN: Hold dumbbells by your sides. Step forward and lower your body until knees are at 90 degrees.\nIT: Tieni i manubri lungo i fianchi. Affondo in avanti scendendo fino a 90 gradi con le ginocchia.'],
    ['Lateral Lunges',       5.0,  'strength',    'quadriceps,glutes,adductors',                 'dumbbell', 'EN: Step out to the side, bend that knee while keeping the other leg straight.\nIT: Affondi laterali. Fai un passo di lato piegando il ginocchio spingendo i fianchi indietro.'],
    ['Bulgarian Split Squat',6.0,  'strength',    'quadriceps,glutes,hamstrings',                'dumbbell', 'EN: Elevate one foot securely on a bench behind you. Lower body until front thigh is parallel to the ground.\nIT: Appoggia un piede dietro di te su un rialzo. Scendi finché la coscia frontale è parallela al suolo.'],
    ['Step-up',              5.5,  'strength',    'quadriceps,glutes',                           'dumbbell,bench', 'EN: Step up onto a bench or sturdy chair, driving through the front foot.\nIT: Salita su una sedia o gradino con manubri in mano.'],
    ['Leg Curl',             4.0,  'strength',    'hamstrings',                                  'machine', ''],
    ['Leg Extension',        4.0,  'strength',    'quadriceps',                                  'machine', ''],
    ['Calf Raises',          3.5,  'strength',    'calves',                                      'machine', 'EN: Push up onto your toes, squeeze your calves, then lower heels down.\nIT: Spingi in alto sulle punte, contrai i polpacci e poi scendi con i talloni. Fattibile su gradino per maggiore ROM.'],
    ['Romanian Deadlift',    6.0,  'strength',    'hamstrings,glutes,back',                      'barbell', ''],
    ['Dumbbell RDL',         5.0,  'strength',    'hamstrings,glutes,back',                      'dumbbell', 'EN: Keeping legs mostly straight, push hips back to lower dumbbells along your legs until you feel a stretch.\nIT: Tieni le gambe semitese, spingi indietro il bacino per far scendere i manubri lungo le gambe finché senti stretching sui femorali.'],
    ['Single Leg RDL',       5.0,  'strength',    'hamstrings,glutes,core',                      'dumbbell', 'EN: RDL performed on one leg for balance and unilateral strength.\nIT: Stacco rumeno su una gamba sola, ottimo per femorali e bilanciamento.'],
    // Strength — Core & Full body (Home focus)
    ['Plank',                4.0,  'strength',    'abs,obliques',                                '', 'EN: Hold a push-up position resting on your forearms. Keep body straight and core tight.\nIT: Mantieni la posizione di push-up appoggiando gli avambracci. Corpo in linea e addome contratto.'],
    ['Crunches',             3.5,  'strength',    'abs',                                         '', 'EN: Lie on back with bent knees. Contract abs to lift your shoulder blades off the floor.\nIT: Supino, ginocchia piegate. Contrai l\'addome per sollevare le scapole da terra.'],
    ['Hanging Leg Raises',   4.0,  'strength',    'abs,obliques',                                'pull_up_bar', 'EN: Hang from a bar, raise legs up until parallel to floor keeping them straight.\nIT: Appeso, solleva le gambe tese finché sono parallele al suolo.'],
    ['Russian Twists',       3.5,  'strength',    'obliques,abs',                                '', 'EN: Sit with torso leaning back, feet slightly elevated. Twist your torso from side to side.\nIT: Seduto col busto inclinato all\'indietro, piedi sollevati. Ruota il busto da destra a sinistra (meglio se tieni un peso).'],
    ['Weighted Crunch',      4.0,  'strength',    'abs',                                         'dumbbell', 'EN: Classic crunch while holding a dumbbell against your chest.\nIT: Crunch classico mantenendo un manubrio stretto al petto.'],
    ['Mountain Climbers',    8.0,  'strength',    'abs,full_body',                               '', 'EN: From a push-up position, quickly alternate bringing your knees towards your chest.\nIT: Dalla posizione di push-up, porta alternativamente e velocemente le ginocchia verso il petto.'],
    ['Burpees',              8.5,  'strength',    'full_body,cardio',                            '', 'EN: Drop into a squat, kick feet back to a plank, do a push-up, jump feet in, and stand/jump up.\nIT: Scendi in squat, lancia i piedi indietro in plank, fai un push-up, raccogli le gambe e salta in alto.'],
    ['Glute Bridge',         4.0,  'strength',    'glutes,hamstrings',                           '', 'EN: Lie on back, bend knees, feet flat. Push through heels to lift hips towards the ceiling.\nIT: Supino, ginocchia piegate. Spingi con i talloni per sollevare il bacino verso il soffitto.'],
    ['Hip Thrust',           5.0,  'strength',    'glutes,hamstrings',                           'dumbbell,bench', 'EN: Rest your upper back on a bench, hold a weight on your hips, and thrust up.\nIT: Poggiando le scapole sul divano o panca, peso sul bacino, sollevati spingendo con i glutei.'],
    ['Renegade Row',         6.0,  'strength',    'back,core,full_body',                         'dumbbell', 'EN: In a push-up position holding dumbbells, alternate rowing one dumbbell up while balancing on the other.\nIT: In posizione push-up sui manubri, esegui un rematore alternato tenendo l\'equilibrio sull\'altro manubrio.'],
    ['Suitcase Carry',       4.5,  'strength',    'core,obliques',                               'dumbbell', 'EN: Walk while holding a heavy dumbbell in only one hand.\nIT: Cammina mantenendo un manubrio in una sola mano per allenare la stabilità laterale (anti-flessione).'],
    ['Dumbbell Thruster',    6.5,  'strength',    'quadriceps,shoulders,full_body',              'dumbbell', 'EN: Hold dumbbells at shoulder height. Front squat down, then press dumbbells overhead as you stand up.\nIT: Manubri alle spalle. Fai uno squat e, risalendo, spingi i manubri sopra la testa in un unico movimento.'],
    // Strength — legacy (keep for backwards compat)
    ['Weight Training',      6.0,  'strength',    'full_body',                                   'barbell,dumbbell', ''],
    ['Calisthenics',         8.0,  'strength',    'full_body',                                   'pull_up_bar', ''],
    // Flexibility
    ['Yoga',                 3.0,  'flexibility', 'full_body',                                   'mat', ''],
    ['Stretching',           2.5,  'flexibility', 'full_body',                                   'mat', ''],
    ['Foam Rolling',         2.0,  'flexibility', 'full_body',                                   'mat', ''],
    ['Pilates',              3.5,  'flexibility', 'abs,back,full_body',                          'mat', ''],
    // Other
    ['Other',                5.0,  'other',       '',                                            '', ''],
    ['Sport',                7.0,  'other',       'full_body',                                   '', ''],
  ]) {
    insertExType.run(name, met, cat, muscles, equip, instructions);
  }

  // Backfill muscle_groups/equipment on existing rows that pre-date this migration
  const backfillEx = database.prepare(
    "UPDATE exercise_types SET muscle_groups=?, equipment=? WHERE name=? AND muscle_groups=''"
  );
  for (const [name, muscles, equip] of [
    ['Running',         'quadriceps,hamstrings,calves,glutes',  ''],
    ['Cycling',         'quadriceps,hamstrings,glutes,calves',  'bike'],
    ['Swimming',        'full_body',                             ''],
    ['Walking',         'quadriceps,calves,glutes',              ''],
    ['HIIT',            'full_body',                             ''],
    ['Weight Training', 'full_body',                             'barbell,dumbbell'],
    ['Calisthenics',    'full_body',                             'pull_up_bar'],
    ['Yoga',            'full_body',                             'mat'],
    ['Stretching',      'full_body',                             'mat'],
    ['Other',           '',                                      ''],
  ]) {
    backfillEx.run(muscles, equip, name);
  }

  // Add explicit backfill for new bodyweight/instruction setups
  const backfillInst = database.prepare(
    "UPDATE exercise_types SET instructions=? WHERE name=? AND (instructions IS NULL OR instructions='')"
  );
  for (const [name, instructions] of [
    ['Push-ups', 'EN: Keep your body in a straight line, lower until your chest is close to the floor, then push back up.\nIT: Mantieni il corpo in linea retta, scendi fino a sfiorare il pavimento con il petto, poi spingi per risalire.'],
    ['Pull-ups', 'EN: Hang from a bar, pull yourself up until your chin passes the bar, lower with control.\nIT: Appenditi a una sbarra, tirati su fino a superarla col mento, scendi con controllo.'],
    ['Dumbbell Row', 'EN: Support one knee and hand on a bench, pull the dumbbell up to your hip keeping your back straight.\nIT: Appoggia ginocchio e mano su una panca, tira il manubrio fino all\'anca mantenendo la schiena dritta.'],
    ['Dumbbell Press', 'EN: Sit or stand, press dumbbells overhead until arms are fully extended.\nIT: Seduto o in piedi, spingi i manubri verso l\'alto fino a stendere completamente le braccia.'],
    ['Lateral Raises', 'EN: Raise dumbbells to your sides until they reach shoulder height.\nIT: Solleva i manubri lateralmente fino all\'altezza delle spalle.'],
    ['Front Raises', 'EN: Raise dumbbells in front of you up to shoulder level.\nIT: Solleva i manubri davanti a te fino all\'altezza delle spalle.'],
    ['Dumbbell Arnold Press', 'EN: Start with dumbbells in front of shoulders, palms facing you. Rotate hands outwards as you press up.\nIT: Inizia con i manubri davanti alle spalle, palmi verso di te. Ruota i polsi verso l\'esterno mentre spingi in alto.'],
    ['Dumbbell Curl', 'EN: Curl the dumbbells towards your shoulders, keeping your elbows stationary.\nIT: Fletti i manubri verso le spalle, mantenendo i gomiti fermi lungo i fianchi.'],
    ['Hammer Curl', 'EN: Curl dumbbells with palms facing each other.\nIT: Fletti i manubri mantenendo i palmi rivolti l\'uno verso l\'altro.'],
    ['Tricep Dips', 'EN: Lower your body by bending elbows until they are at a 90-degree angle, then push back up.\nIT: Abbassa il corpo piegando i gomiti a 90 gradi, poi spingi per risalire.'],
    ['Bodyweight Squat', 'EN: Keep chest up, push hips back and bend knees to lower down. Keep weight on your heels.\nIT: Petto in fuori, spingi il bacino indietro e piega le ginocchia. Tieni il peso sui talloni.'],
    ['Goblet Squat', 'EN: Hold one dumbbell vertically against your chest, perform a squat keeping your torso upright.\nIT: Tieni in verticale un manubrio contro il petto e fai uno squat mantenendo il busto dritto.'],
    ['Lunges', 'EN: Step forward and lower hips until both knees are bent at a 90-degree angle.\nIT: Fai un passo in avanti e scendi finché entrambe le ginocchia formano un angolo di 90 gradi.'],
    ['Dumbbell Lunges', 'EN: Hold dumbbells by your sides. Step forward and lower your body until knees are at 90 degrees.\nIT: Tieni i manubri lungo i fianchi. Affondo in avanti scendendo fino a 90 gradi con le ginocchia.'],
    ['Bulgarian Split Squat', 'EN: Elevate one foot securely on a bench behind you. Lower body until front thigh is parallel to the ground.\nIT: Appoggia un piede dietro di te su un rialzo. Scendi finché la coscia frontale è parallela al suolo.'],
    ['Calf Raises', 'EN: Push up onto your toes, squeeze your calves, then lower heels down.\nIT: Spingi in alto sulle punte, contrai i polpacci e poi scendi con i talloni.'],
    ['Dumbbell RDL', 'EN: Keeping legs mostly straight, push hips back to lower dumbbells along your legs until you feel a stretch.\nIT: Tieni le gambe semitese, spingi indietro il bacino per far scendere i manubri lungo le gambe finché senti stretching.'],
    ['Plank', 'EN: Hold a push-up position resting on your forearms. Keep body straight and core tight.\nIT: Mantieni la posizione di push-up appoggiando gli avambracci. Corpo in linea e addome contratto.'],
    ['Crunches', 'EN: Lie on back with bent knees. Contract abs to lift your shoulder blades off the floor.\nIT: Supino, ginocchia piegate. Contrai l\'addome per sollevare le scapole da terra.'],
    ['Hanging Leg Raises', 'EN: Hang from a bar, raise legs up until parallel to floor keeping them straight.\nIT: Appeso, solleva le gambe tese finché sono parallele al suolo.'],
    ['Russian Twists', 'EN: Sit with torso leaning back, feet slightly elevated. Twist your torso from side to side.\nIT: Seduto col busto inclinato all\'indietro, piedi sollevati. Ruota il busto da destra a sinistra.'],
    ['Mountain Climbers', 'EN: From a push-up position, quickly alternate bringing your knees towards your chest.\nIT: Dalla posizione di push-up, porta alternativamente e velocemente le ginocchia verso il petto.'],
    ['Burpees', 'EN: Drop into a squat, kick feet back to a plank, do a push-up, jump feet in, and stand/jump up.\nIT: Scendi in squat, lancia i piedi indietro in plank, fai un push-up, raccogli le gambe e salta in alto.'],
    ['Glute Bridge', 'EN: Lie on back, bend knees, feet flat. Push through heels to lift hips towards the ceiling.\nIT: Supino, ginocchia piegate. Spingi con i talloni per sollevare il bacino verso il soffitto.'],
    ['Renegade Row', 'EN: In a push-up position holding dumbbells, alternate rowing one dumbbell up while balancing on the other.\nIT: In posizione push-up sui manubri, esegui un rematore alternato tenendo l\'equilibrio sull\'altro manubrio.'],
    ['Dumbbell Thruster', 'EN: Hold dumbbells at shoulder height. Front squat down, then press dumbbells overhead as you stand up.\nIT: Manubri alle spalle. Fai uno squat e, risalendo, spingi i manubri sopra la testa in un unico movimento.'],
  ]) {
    backfillInst.run(instructions, name);
  }

  // Seed equipment items
  const insertEquip = database.prepare('INSERT OR IGNORE INTO equipment (name, is_custom) VALUES (?, 0)');
  for (const name of [
    'Barbell', 'Dumbbell', 'Kettlebell', 'Cable', 'Machine',
    'Pull-up bar', 'Bench', 'Mat', 'Resistance band', 'Bike',
    'Jump rope', 'Rowing machine',
  ]) {
    insertEquip.run(name);
  }

  // Lifestyle module tables (sleep, focus, tasks, habits, mood, workouts)
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS sleep_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT UNIQUE NOT NULL,
        bedtime TEXT,
        wake_time TEXT,
        duration_min INTEGER,
        quality INTEGER,
        factors TEXT,
        note TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS focus_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        duration_min INTEGER NOT NULL DEFAULT 0,
        type TEXT NOT NULL DEFAULT 'pomodoro',
        project TEXT,
        note TEXT,
        completed INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        title TEXT NOT NULL,
        done INTEGER DEFAULT 0,
        priority INTEGER DEFAULT 0,
        estimate_min INTEGER,
        project TEXT,
        order_idx INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        done_at TEXT
      );

      CREATE TABLE IF NOT EXISTS habits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        icon TEXT DEFAULT '✓',
        color TEXT DEFAULT '#d97706',
        target_per_week INTEGER DEFAULT 7,
        archived INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS habit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        value INTEGER DEFAULT 1,
        UNIQUE(habit_id, date)
      );

      CREATE TABLE IF NOT EXISTS mood_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT UNIQUE NOT NULL,
        mood INTEGER,
        energy INTEGER,
        stress INTEGER,
        note TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS workout_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        plan_id INTEGER REFERENCES workout_plans(id) ON DELETE SET NULL,
        started_at TEXT,
        ended_at TEXT,
        duration_min INTEGER,
        calories_burned INTEGER,
        perceived_effort INTEGER,
        note TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS workout_exercise_sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
        exercise_id INTEGER REFERENCES exercise_types(id) ON DELETE SET NULL,
        set_idx INTEGER DEFAULT 0,
        reps INTEGER,
        weight_kg REAL,
        distance_km REAL,
        duration_sec INTEGER,
        rest_sec INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_focus_session_date ON focus_sessions(date);
      CREATE INDEX IF NOT EXISTS idx_task_date ON tasks(date);
      CREATE INDEX IF NOT EXISTS idx_workout_session_date ON workout_sessions(date);
    `);
  } catch (e) { console.error('lifestyle schema init failed:', e); }

  // Gamification schema
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS user_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        points INTEGER NOT NULL,
        reason TEXT NOT NULL,
        module TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '🏆',
        unlocked_at TEXT
      );

      CREATE TABLE IF NOT EXISTS user_level (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        total_points INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        level_name TEXT DEFAULT 'Principiante',
        streak_days INTEGER DEFAULT 0,
        last_activity_date TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_user_points_date ON user_points(date);
    `);

    database.prepare(`
      INSERT OR IGNORE INTO user_level (id, total_points, level, level_name) VALUES (1, 0, 1, 'Principiante')
    `).run();

    const insertAchievement = database.prepare(
      'INSERT OR IGNORE INTO achievements (key, name, description, icon) VALUES (?, ?, ?, ?)'
    );
    for (const [key, name, description, icon] of [
      ['first_sleep',    'Prima notte',         'Hai tracciato il tuo primo sonno',          '🌙'],
      ['sleep_7_streak', 'Dormitore seriale',   '7 notti consecutive ≥ 7h',                  '😴'],
      ['sleep_quality',  'Sonno di qualità',    '5 notti con qualità ≥ 4',                   '⭐'],
      ['first_task',     'Prima lista',         'Hai completato il tuo primo task',           '✅'],
      ['task_master',    'Task master',         '50 task completati in totale',               '🎯'],
      ['perfect_day',    'Giornata perfetta',   'Tutti i task completati in un giorno',       '🌟'],
      ['first_habit',    'Primo abitudine',     'Hai creato la tua prima abitudine',          '💡'],
      ['habit_7_streak', 'Abitudine costante',  '7 giorni di streak su una abitudine',        '🔥'],
      ['habit_30_streak','Abitudine di ferro',  '30 giorni di streak su una abitudine',       '💪'],
      ['first_focus',    'Prima sessione',      'Prima sessione di focus completata',          '🧠'],
      ['focus_2h',       'Focus intenso',       '2h di focus in un giorno',                   '⚡'],
      ['first_workout',  'Prima sudata',        'Primo allenamento completato',                '🏋️'],
      ['workout_10',     'Allenamento costante','10 sessioni di allenamento',                  '🏆'],
      ['first_journal',  'Primo diario',        'Prima nota nel diario',                       '📓'],
      ['welcome',        'Primo passo',         'Benvenuto in LifeBuddy!',                     '🌟'],
    ]) {
      insertAchievement.run(key, name, description, icon);
    }
  } catch (e) { console.error('gamification schema failed:', e); }

  // Section streaks (Duolingo-style per-area streak tracking)
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS section_streaks (
        section TEXT PRIMARY KEY,
        current_streak INTEGER DEFAULT 0,
        longest_streak INTEGER DEFAULT 0,
        last_completed_date TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS section_streak_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        section TEXT NOT NULL,
        date TEXT NOT NULL,
        UNIQUE(section, date)
      );

      CREATE INDEX IF NOT EXISTS idx_section_streak_log ON section_streak_log(section, date);
    `);

    // Seed streak achievements
    const insertAch = database.prepare(
      'INSERT OR IGNORE INTO achievements (key, name, description, icon) VALUES (?, ?, ?, ?)'
    );
    for (const [key, name, desc, icon] of [
      ['streak_3_sleep',    'Dormitore costante',    '3 notti di sonno tracciate consecutive',     '🌙'],
      ['streak_7_sleep',    'Settimana di sonno',    '7 notti di sonno tracciate consecutive',     '😴'],
      ['streak_30_sleep',   'Maestro del sonno',     '30 notti di sonno tracciate consecutive',    '🛌'],
      ['streak_3_diet',     'Dieta regolare',        '3 giorni di dieta tracciati consecutivi',    '🥗'],
      ['streak_7_diet',     'Settimana sana',        '7 giorni di dieta tracciati consecutivi',    '🍎'],
      ['streak_30_diet',    'Nutrizionista',         '30 giorni di dieta tracciati consecutivi',   '🥦'],
      ['streak_3_focus',    'Focus abitudinario',    '3 giorni di focus consecutivi',              '🧠'],
      ['streak_7_focus',    'Settimana produttiva',  '7 giorni di focus consecutivi',              '⚡'],
      ['streak_30_focus',   'Mente di ferro',        '30 giorni di focus consecutivi',             '🎯'],
      ['streak_3_workout',  'Atleta emergente',      '3 allenamenti consecutivi',                  '💪'],
      ['streak_7_workout',  'Settimana atletica',    '7 allenamenti consecutivi',                  '🏋️'],
      ['streak_30_workout', 'Campione della palestra','30 allenamenti consecutivi',                '🏆'],
    ]) {
      insertAch.run(key, name, desc, icon);
    }
  } catch (e) { console.error('section streaks schema failed:', e); }
}

module.exports = { getDb, getDbPath, closeDb, initDb };
