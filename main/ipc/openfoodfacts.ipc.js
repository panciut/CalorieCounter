const { ipcMain } = require('electron');
const { getDb } = require('../db');
const offDb = require('../lib/offDb');
const { categoryFromOffTags } = require('../lib/offCategoryMap');

// ── Helpers ──────────────────────────────────────────────────────────────────

// Parse "500 g", "1.5 kg", "330 ml", "6 × 200 g" → grams. Returns null if unparseable.
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

const LIQUID_TAGS = new Set([
  'en:beverages', 'en:drinks', 'en:sodas', 'en:juices', 'en:fruit-juices',
  'en:waters', 'en:mineral-waters', 'en:spring-waters',
  'en:beers', 'en:wines', 'en:spirits', 'en:liquors',
  'en:milks', 'en:plant-milks', 'en:oat-milks', 'en:almond-milks', 'en:soy-milks',
  'en:teas', 'en:coffees', 'en:energy-drinks', 'en:sports-drinks',
  'en:smoothies', 'en:nectars', 'en:syrups',
]);

const ALLOWED_COUNTRIES = new Set(['world', 'it', 'us', 'fr', 'de', 'es', 'uk']);

function offBaseUrl() {
  let code = 'world';
  try {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = 'off_country'").get();
    if (row && ALLOWED_COUNTRIES.has(row.value)) code = row.value;
  } catch { /* settings table may not exist on first run; default to world */ }
  return `https://${code}.openfoodfacts.org`;
}

const r2 = v => Math.round((v || 0) * 100) / 100;

function mapProduct(p) {
  const n = p.nutriments || {};
  const tags = p.categories_tags || [];
  const isLiquid = tags.some(tag => LIQUID_TAGS.has((tag || '').toLowerCase()));
  const category = categoryFromOffTags(tags);
  // Italian-market products on it.openfoodfacts.org often have only `product_name_it`
  // populated (no generic `product_name`). Fall back through every localized variant
  // before giving up — otherwise the typeahead silently shows blank rows.
  const generic = (p.product_name || '').trim();
  const it      = (p.product_name_it || '').trim();
  const en      = (p.product_name_en || '').trim();
  const display = generic || it || en || '';
  return {
    name:           display,
    name_en:        en || generic || it || '',
    name_it:        it || generic || en || '',
    calories:       r2(n['energy-kcal_100g']),
    protein:        r2(n.proteins_100g),
    carbs:          r2(n.carbohydrates_100g),
    fat:            r2(n.fat_100g),
    fiber:          r2(n.fiber_100g),
    sugar:          n.sugars_100g != null ? r2(n.sugars_100g) : null,
    saturated_fat:  n['saturated-fat_100g'] != null ? r2(n['saturated-fat_100g']) : null,
    sodium_mg:      n.sodium_100g != null ? r2(n.sodium_100g * 1000) : null,
    is_liquid:      isLiquid ? 1 : 0,
    pack_grams:     parseGrams(p.quantity),
    barcode:        p.code || '',
    brand:          (p.brands || '').split(',')[0].trim(),
    categories_tags: tags.join(','),
    category,
  };
}

const PRODUCT_FIELDS = [
  'code', 'product_name', 'product_name_en', 'product_name_it',
  'brands', 'nutriments', 'quantity', 'categories_tags',
].join(',');

// ── Token-Jaccard name similarity (mirrors src/lib/nameSim.ts) ───────────────
// Kept inline (not imported) because main runs as plain CommonJS Node and the
// renderer file uses ESM/Vite. The two stay in sync — when changing one, change both.

const STOPWORDS = new Set([
  'and', 'with', 'the', 'for', 'from', 'into', 'sans', 'free', 'low', 'high',
  'con', 'senza', 'alla', 'allo', 'agli', 'alle', 'dal', 'del', 'della', 'delle',
  'degli', 'dei', 'gli', 'lo', 'la', 'le', 'il', 'in', 'di', 'da', 'al', 'ai',
  'per', 'una', 'uno', 'sul', 'sulla', 'sugli', 'nel', 'nella',
]);

function tokens(s) {
  return (s ?? '').toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

function nameSimilarity(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

function withinPct(a, b, pct) {
  if (a === 0 && b === 0) return true;
  const max = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / max <= pct;
}

function atwaterDeltaPct(c) {
  const atwater = 4 * (c.protein || 0) + 4 * (c.carbs || 0) + 9 * (c.fat || 0);
  if (atwater <= 0) return 0;
  return Math.abs((c.calories || 0) - atwater) / atwater;
}

// ── Local OFF cache (off_cache.db) ───────────────────────────────────────────

function localEnabled() {
  if (!offDb.exists()) return false;
  try {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = 'off_local_enabled'").get();
    return row?.value === '1';
  } catch { return false; }
}

function onlineDisabled() {
  try {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = 'off_disable_online'").get();
    return row?.value === '1';
  } catch { return false; }
}

function rowToBarcodeResult(r) {
  if (!r) return null;
  const tags = r.categories_tags ? String(r.categories_tags).split(',').filter(Boolean) : [];
  return {
    name: r.name,
    name_en: r.name,
    name_it: r.name,
    calories: r.calories,
    protein: r.protein,
    carbs: r.carbs,
    fat: r.fat,
    fiber: r.fiber,
    sugar: r.sugar,
    saturated_fat: r.saturated_fat,
    sodium_mg: r.sodium_mg,
    is_liquid: r.is_liquid,
    pack_grams: r.pack_grams,
    barcode: r.code,
    brand: r.brand || '',
    categories_tags: r.categories_tags || '',
    category: tags.length > 0 ? categoryFromOffTags(tags) : 'other',
  };
}

function localBarcodeLookup(code) {
  try {
    const row = offDb.getOffDb().prepare('SELECT * FROM products WHERE code = ?').get(String(code));
    return rowToBarcodeResult(row);
  } catch { return null; }
}

/** Build an FTS5 query string with prefix-match on each token. */
function buildFtsQuery(input) {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2)
    .map(t => `${t}*`)
    .join(' ');
}

function localSearchByName(query, limit) {
  const q = buildFtsQuery(query);
  if (!q) return [];
  try {
    const rows = offDb.getOffDb().prepare(`
      SELECT p.*
      FROM products_fts f
      JOIN products p ON p.rowid = f.rowid
      WHERE products_fts MATCH ?
      ORDER BY bm25(products_fts), p.completeness DESC
      LIMIT ?
    `).all(q, limit);
    return rows.map(rowToBarcodeResult);
  } catch (e) {
    console.error('Local searchByName error:', e.message);
    return [];
  }
}

/** Insert an API-fetched product into the local cache so the next lookup is instant.
 *  Best-effort; no-op when local DB doesn't exist. */
function cacheLiveResult(r) {
  if (!offDb.exists()) return;
  if (!r || !r.barcode || !r.name) return;
  try {
    offDb.getOffDb().prepare(`
      INSERT OR REPLACE INTO products
        (code, name, brand, calories, protein, carbs, fat, fiber, sugar, saturated_fat, sodium_mg, pack_grams, is_liquid, completeness, categories_tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      r.barcode, r.name, r.brand || null,
      r.calories || 0, r.protein || 0, r.carbs || 0, r.fat || 0, r.fiber || 0,
      r.sugar ?? null, r.saturated_fat ?? null, r.sodium_mg ?? null, r.pack_grams ?? null,
      r.is_liquid ? 1 : 0,
      0.5,
      r.categories_tags || null,
    );
  } catch (e) { console.error('cacheLiveResult error:', e.message); }
}

// ── IPC handlers ─────────────────────────────────────────────────────────────

function registerOpenFoodFactsIpc() {
  // Existing channel name preserved for back-compat with renderer callers.
  // Local cache first; on miss, hit the live API and cache the result.
  ipcMain.handle('barcode:lookup', async (_, { barcode }) => {
    if (localEnabled()) {
      const local = localBarcodeLookup(barcode);
      if (local) return local;
    }
    if (onlineDisabled()) return null;
    try {
      const url = `${offBaseUrl()}/api/v2/product/${encodeURIComponent(barcode)}?fields=${PRODUCT_FIELDS}`;
      const resp = await fetch(url);
      const json = await resp.json();
      if (json.status !== 1 || !json.product) return null;
      const mapped = mapProduct(json.product);
      cacheLiveResult(mapped);
      return mapped;
    } catch (e) {
      console.error('Barcode lookup error:', e.message);
      return null;
    }
  });

  ipcMain.handle('openfoodfacts:searchByName', async (_, { query, limit = 10 }) => {
    if (!query || query.trim().length < 1) return [];
    if (localEnabled()) {
      const local = localSearchByName(query, limit);
      if (local.length > 0) return local;
    }
    if (onlineDisabled()) return [];
    try {
      const url = `${offBaseUrl()}/cgi/search.pl?search_terms=${encodeURIComponent(query)}`
        + `&search_simple=1&action=process&json=1&page_size=${Math.min(50, Math.max(1, limit))}`
        + `&fields=${PRODUCT_FIELDS}`;
      const resp = await fetch(url);
      const json = await resp.json();
      if (!json || !Array.isArray(json.products)) return [];
      const mapped = json.products
        .filter(p => p && (p.product_name || p.product_name_en || p.product_name_it))
        .map(mapProduct);
      // Cache the top results so the next typeahead hit is local
      for (const m of mapped) cacheLiveResult(m);
      return mapped;
    } catch (e) {
      console.error('OFF searchByName error:', e.message);
      return [];
    }
  });

  // Returns ranked candidates with match metadata. Filters to those passing the
  // requested thresholds; UI decides whether to apply silently or queue.
  ipcMain.handle('openfoodfacts:findCandidates', async (_, { name, calories, protein, carbs, fat, nameMin = 0.4, macroPct = 0.05, requireKcalConsistent = true, limit = 20 }) => {
    if (!name || name.trim().length < 1) return [];
    let candidatePool;
    if (localEnabled()) {
      // Pull a generous slice from local FTS5; we'll filter by macros below.
      candidatePool = localSearchByName(name, Math.max(20, limit));
    }
    if ((!candidatePool || candidatePool.length === 0) && !onlineDisabled()) {
      try {
        const url = `${offBaseUrl()}/cgi/search.pl?search_terms=${encodeURIComponent(name)}`
          + `&search_simple=1&action=process&json=1&page_size=${Math.min(50, Math.max(1, limit))}`
          + `&fields=${PRODUCT_FIELDS}`;
        const resp = await fetch(url);
        const json = await resp.json();
        const products = Array.isArray(json?.products) ? json.products : [];
        candidatePool = products
          .filter(p => p && (p.product_name || p.product_name_en || p.product_name_it))
          .map(mapProduct);
        for (const m of candidatePool) cacheLiveResult(m);
      } catch (e) {
        console.error('OFF findCandidates error:', e.message);
        return [];
      }
    }
    if (!candidatePool || candidatePool.length === 0) return [];
    const q = { name, calories: calories || 0, protein: protein || 0, carbs: carbs || 0, fat: fat || 0 };
    const out = [];
    for (const cand of candidatePool) {
      const nameScore = nameSimilarity(q.name, cand.name);
      if (nameScore < nameMin) continue;
      const macrosClose =
        withinPct(q.calories, cand.calories, macroPct) &&
        withinPct(q.protein,  cand.protein,  macroPct) &&
        withinPct(q.carbs,    cand.carbs,    macroPct) &&
        withinPct(q.fat,      cand.fat,      macroPct);
      if (!macrosClose) continue;
      const kcalDeltaPct = atwaterDeltaPct(cand);
      if (requireKcalConsistent && kcalDeltaPct > 0.40) continue;
      out.push({
        ...cand,
        nameScore,
        kcalDeltaPct,
        macroDeltas: {
          calories: cand.calories - q.calories,
          protein:  cand.protein  - q.protein,
          carbs:    cand.carbs    - q.carbs,
          fat:      cand.fat      - q.fat,
        },
      });
    }
    // Best name match first, then smallest kcal-vs-atwater divergence
    out.sort((a, b) => (b.nameScore - a.nameScore) || (a.kcalDeltaPct - b.kcalDeltaPct));
    return out;
  });
}

module.exports = registerOpenFoodFactsIpc;
