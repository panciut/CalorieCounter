// Streaming Open Food Facts dump importer.
//
// Source: https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz
// (~0.9 GB compressed; OFF uses TAB as separator despite the .csv extension.)
//
// Pipeline: HTTPS → gunzip → TSV parser → filter → batched INSERT into a
// temp SQLite DB. On success the temp file is atomically renamed onto the
// live cache; on failure or cancel the temp is discarded so the existing
// cache is never corrupted.

const https = require('https');
const http = require('http');
const { URL } = require('url');
const zlib = require('zlib');
const { parse: csvParse } = require('csv-parse');
const offDb = require('./offDb');

const SOURCE_URL = 'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz';
const BATCH_SIZE = 5000;
const PROGRESS_THROTTLE_MS = 750;
const MAX_REDIRECTS = 5;

/**
 * https.get / http.get that transparently follows 30x redirects.
 * Calls onResponse(res) once the final 200 response arrives, or onError(err) on
 * any failure / redirect loop / non-2xx terminal status.
 */
function getFollowingRedirects(urlStr, onResponse, onError, depth = 0) {
  if (depth > MAX_REDIRECTS) {
    onError(new Error('too many redirects'));
    return null;
  }
  const u = new URL(urlStr);
  const lib = u.protocol === 'http:' ? http : https;
  const req = lib.get(urlStr, (res) => {
    const status = res.statusCode || 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      // Drain and follow
      res.resume();
      const next = new URL(res.headers.location, urlStr).toString();
      getFollowingRedirects(next, onResponse, onError, depth + 1);
      return;
    }
    if (status !== 200) {
      onError(new Error(`HTTP ${status}`));
      res.resume();
      return;
    }
    onResponse(res);
  });
  req.on('error', onError);
  return req;
}

// ── Per-row filter ───────────────────────────────────────────────────────────

const LIQUID_TAG_NEEDLES = [
  'en:beverages', 'en:drinks', 'en:sodas', 'en:juices', 'en:fruit-juices',
  'en:waters', 'en:mineral-waters', 'en:spring-waters',
  'en:beers', 'en:wines', 'en:spirits', 'en:liquors',
  'en:milks', 'en:plant-milks', 'en:oat-milks', 'en:almond-milks', 'en:soy-milks',
  'en:teas', 'en:coffees', 'en:energy-drinks', 'en:sports-drinks',
  'en:smoothies', 'en:nectars', 'en:syrups',
];

function parseGrams(str) {
  if (!str || typeof str !== 'string') return null;
  const re = /(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\b/gi;
  let match, last = null;
  while ((match = re.exec(str)) !== null) last = match;
  if (!last) return null;
  const num = parseFloat(last[1].replace(',', '.'));
  switch (last[2].toLowerCase()) {
    case 'kg': return num * 1000;
    case 'g':  return num;
    case 'l':  return num * 1000;
    case 'cl': return num * 10;
    case 'ml': return num;
    default:   return null;
  }
}

function num(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function r2(v) {
  return v == null ? null : Math.round(v * 100) / 100;
}

/**
 * Returns either a row object ready to insert, or null if the product should
 * be skipped. The plan's "keep only useful products" filter:
 *   - Italian-market (countries_tags contains en:italy)
 *   - Has a usable name
 *   - Calories present and > 0
 *   - At least one of protein/carbs/fat present
 *   - Atwater consistency: |kcal − (4·p + 4·c + 9·f)| / atwater ≤ 0.40
 */
function filterRow(p) {
  const countries = (p.countries_tags || '').toLowerCase();
  if (!countries.includes('en:italy')) return null;

  const name = (p.product_name || p.product_name_it || p.product_name_en || p.brands || '').trim();
  if (!name) return null;

  const calories = num(p['energy-kcal_100g']);
  if (calories == null || calories <= 0) return null;

  const protein = num(p.proteins_100g);
  const carbs   = num(p.carbohydrates_100g);
  const fat     = num(p.fat_100g);
  if (protein == null && carbs == null && fat == null) return null;

  // Atwater check
  const p2 = protein || 0, c2 = carbs || 0, f2 = fat || 0;
  const atwater = 4 * p2 + 4 * c2 + 9 * f2;
  if (atwater > 0) {
    const deltaPct = Math.abs(calories - atwater) / atwater;
    if (deltaPct > 0.40) return null;
  }

  const fiber = num(p.fiber_100g) || 0;
  const sugar = num(p.sugars_100g);
  const saturatedFat = num(p['saturated-fat_100g']);
  const sodiumG = num(p.sodium_100g);
  const sodiumMg = sodiumG != null ? sodiumG * 1000 : null;
  const packGrams = parseGrams(p.quantity);
  const isLiquid = LIQUID_TAG_NEEDLES.some(needle => countries.includes(needle))
    || (p.categories_tags || '').toLowerCase().split(',').some(tag =>
        LIQUID_TAG_NEEDLES.some(n => tag.trim() === n));

  // Completeness 0..1 — share of optional fields populated, used as a
  // tiebreaker in FTS5 ranking.
  let filled = 0, possible = 8;
  if (sugar != null) filled++;
  if (saturatedFat != null) filled++;
  if (sodiumMg != null) filled++;
  if (fiber > 0) filled++;
  if (packGrams != null) filled++;
  if (p.brands) filled++;
  if (p.product_name) filled++;
  if (protein != null && carbs != null && fat != null) filled++;

  return {
    code: String(p.code || '').trim(),
    name,
    brand: (p.brands || '').split(',')[0].trim() || null,
    calories: r2(calories),
    protein: r2(p2),
    carbs:   r2(c2),
    fat:     r2(f2),
    fiber:   r2(fiber),
    sugar: r2(sugar),
    saturated_fat: r2(saturatedFat),
    sodium_mg: r2(sodiumMg),
    pack_grams: r2(packGrams),
    is_liquid: isLiquid ? 1 : 0,
    completeness: Math.round((filled / possible) * 100) / 100,
    categories_tags: typeof p.categories_tags === 'string'
      ? p.categories_tags
      : (Array.isArray(p.categories_tags) ? p.categories_tags.join(',') : null),
  };
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run a full import. Returns a controller with a `cancel()` method and a
 * `done` promise that resolves with the final tally.
 *
 * @param {(p: object) => void} onProgress
 */
function startImport(onProgress) {
  const cancel = { flag: false };
  let lastProgressTs = 0;
  let stage = 'downloading';
  const counters = { bytesRead: 0, totalBytes: null, rowsParsed: 0, rowsKept: 0, rowsSkipped: 0 };

  function emit(extra = {}) {
    onProgress({ stage, ...counters, ...extra });
  }
  function maybeEmit() {
    const now = Date.now();
    if (now - lastProgressTs >= PROGRESS_THROTTLE_MS) {
      lastProgressTs = now;
      emit();
    }
  }

  const done = new Promise((resolve, reject) => {
    let req;
    let db;
    let inserted = 0;
    let pendingBatch = [];
    let insertStmt;

    function teardown(err) {
      try { if (req) req.destroy(); } catch { /* */ }
      try { if (db) db.close(); } catch { /* */ }
      offDb.discardTempDb();
      if (err) reject(err); else resolve(counters);
    }

    function flushBatch() {
      if (pendingBatch.length === 0) return;
      const tx = db.transaction((rows) => {
        for (const r of rows) insertStmt.run(r);
      });
      tx(pendingBatch);
      pendingBatch = [];
    }

    try {
      db = offDb.openTempDb();
      // Buffer aggressive writes; pragmas for speed during bulk import only.
      db.pragma('journal_mode = MEMORY');
      db.pragma('synchronous = OFF');
      db.pragma('temp_store = MEMORY');
      insertStmt = db.prepare(`
        INSERT OR REPLACE INTO products
          (code, name, brand, calories, protein, carbs, fat, fiber, sugar, saturated_fat, sodium_mg, pack_grams, is_liquid, completeness, categories_tags)
        VALUES
          (@code, @name, @brand, @calories, @protein, @carbs, @fat, @fiber, @sugar, @saturated_fat, @sodium_mg, @pack_grams, @is_liquid, @completeness, @categories_tags)
      `);

      const onError = (err) => {
        stage = 'error';
        emit({ message: String(err && err.message || err) });
        teardown(err);
      };

      req = getFollowingRedirects(SOURCE_URL, (resp) => {
        const cl = parseInt(resp.headers['content-length'] || '0', 10);
        if (cl > 0) counters.totalBytes = cl;

        resp.on('data', (chunk) => { counters.bytesRead += chunk.length; });

        const gunzip = zlib.createGunzip();
        const parser = csvParse({
          columns: true,
          delimiter: '\t',           // OFF dump is tab-separated
          quote: false,              // dump intentionally has no quoting
          relax_quotes: true,
          relax_column_count: true,
          skip_empty_lines: true,
          skip_records_with_error: true,
          bom: true,
          trim: false,
        });

        parser.on('readable', () => {
          let rec;
          while ((rec = parser.read()) !== null) {
            if (cancel.flag) {
              parser.end();
              return;
            }
            counters.rowsParsed++;
            const filtered = filterRow(rec);
            if (filtered && filtered.code) {
              pendingBatch.push(filtered);
              counters.rowsKept++;
              if (pendingBatch.length >= BATCH_SIZE) {
                flushBatch();
                inserted += BATCH_SIZE;
              }
            } else {
              counters.rowsSkipped++;
            }
            if (counters.rowsParsed % 10000 === 0) {
              if (stage !== 'parsing') stage = 'parsing';
              maybeEmit();
            }
          }
        });

        parser.on('end', () => {
          if (cancel.flag) {
            stage = 'cancelled';
            emit();
            teardown(new Error('cancelled'));
            return;
          }
          try {
            flushBatch();
            inserted = counters.rowsKept;
            stage = 'indexing';
            emit();

            // Optimize FTS5 for query performance after bulk insert
            db.prepare(`INSERT INTO products_fts(products_fts) VALUES('optimize')`).run();
            db.prepare(`ANALYZE`).run();

            // Stamp meta
            const now = new Date().toISOString();
            const upsert = db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`);
            upsert.run('imported_at', now);
            upsert.run('product_count', String(inserted));
            upsert.run('source_url', SOURCE_URL);

            db.close();
            db = null;

            offDb.commitTempDb();
            stage = 'done';
            emit();
            resolve(counters);
          } catch (err) {
            stage = 'error';
            emit({ message: String(err && err.message || err) });
            teardown(err);
          }
        });

        parser.on('error', (err) => {
          stage = 'error';
          emit({ message: String(err && err.message || err) });
          teardown(err);
        });

        gunzip.on('error', (err) => {
          stage = 'error';
          emit({ message: String(err && err.message || err) });
          teardown(err);
        });

        resp.pipe(gunzip).pipe(parser);
      }, onError);
    } catch (err) {
      stage = 'error';
      emit({ message: String(err && err.message || err) });
      teardown(err);
    }
  });

  return {
    done,
    cancel: () => { cancel.flag = true; },
  };
}

module.exports = { startImport, SOURCE_URL };
