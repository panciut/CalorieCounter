const { ipcMain } = require('electron');
const { getDb } = require('../db');

// Surfaces foods with one or more empty/unset domains, so the user can fix
// them without browsing the catalog row by row.
function registerAuditIpc() {
  ipcMain.handle('audit:foodsMissing', () => {
    const db = getDb();
    const rows = db.prepare(`
      SELECT
        f.id, f.name, f.category, f.group_id,
        f.calories, f.protein, f.carbs, f.fat, f.fiber,
        f.barcode, f.piece_grams, f.is_bulk, f.is_liquid,
        f.sugar, f.saturated_fat, f.sodium_mg, f.opened_days, f.price_per_100g,
        (SELECT COUNT(*) FROM food_packages p WHERE p.food_id = f.id) AS pack_count
      FROM foods f
      WHERE f.is_placeholder = 0
      ORDER BY f.name COLLATE NOCASE
    `).all();

    const out = [];
    for (const r of rows) {
      const missing = [];
      if (!(r.calories > 0)) missing.push('calories');
      if (!(r.protein  >= 0) || (r.protein === 0 && r.carbs === 0 && r.fat === 0 && r.calories > 5)) {
        // probably forgot macros if calories>5 and all macros zero
        if (r.protein === 0 && r.carbs === 0 && r.fat === 0 && r.calories > 5) missing.push('macros');
      }
      if (!r.category || r.category === 'other') missing.push('category');
      if (!r.barcode) missing.push('barcode');
      // Sizing: unless bulk, expect either piece_grams or at least one package.
      if (!r.is_bulk && !r.piece_grams && r.pack_count === 0) missing.push('sizing');
      if (r.opened_days == null) missing.push('opened_days');
      if (r.price_per_100g == null) missing.push('price');
      // Extra nutrition (always treated as optional but surfaced)
      if (r.sugar == null) missing.push('sugar');
      if (r.saturated_fat == null) missing.push('sat_fat');
      if (r.sodium_mg == null) missing.push('sodium');

      if (missing.length === 0) continue;
      out.push({
        id: r.id,
        name: r.name,
        category: r.category,
        group_id: r.group_id,
        calories: r.calories,
        is_variant: r.group_id != null,
        missing,
      });
    }
    return out;
  });
}

module.exports = registerAuditIpc;
