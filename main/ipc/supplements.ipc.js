const { ipcMain } = require('electron');
const { getDb } = require('../db');

// Helper: find the plan effective on a given date
function getPlanForDate(db, date) {
  return db.prepare(
    'SELECT * FROM supplement_plans WHERE effective_from <= ? ORDER BY effective_from DESC LIMIT 1'
  ).get(date);
}

// Slot ordering for time_of_day — kept in sync with SUPPLEMENT_TIME_ORDER on the renderer side
const TIME_ORDER_CASE = `CASE spi.time_of_day
  WHEN 'wake_up'         THEN 1
  WHEN 'breakfast'       THEN 2
  WHEN 'morning_snack'   THEN 3
  WHEN 'lunch'           THEN 4
  WHEN 'afternoon_snack' THEN 5
  WHEN 'dinner'          THEN 6
  WHEN 'evening_snack'   THEN 7
  WHEN 'night'           THEN 8
  ELSE 9
END`;

// Helper: get items for a plan joined with supplement names
function getPlanItems(db, planId) {
  return db.prepare(`
    SELECT spi.id, spi.plan_id, spi.supplement_id, s.name,
           spi.qty, spi.unit, spi.notes, spi.time_of_day
    FROM supplement_plan_items spi
    JOIN supplements s ON s.id = spi.supplement_id
    WHERE spi.plan_id = ?
    ORDER BY ${TIME_ORDER_CASE}, s.name
  `).all(planId);
}

function registerSupplementsIpc() {

  // ── Catalog ─────────────────────────────────────────────────────────────────

  ipcMain.handle('supplements:getAll', () =>
    getDb().prepare('SELECT id, name, description FROM supplements ORDER BY name').all()
  );

  ipcMain.handle('supplements:add', (_, { name, description }) => {
    const result = getDb().prepare('INSERT INTO supplements (name, description) VALUES (?, ?)').run(name, description || null);
    return { id: result.lastInsertRowid };
  });

  ipcMain.handle('supplements:update', (_, { id, name, description }) => {
    getDb().prepare('UPDATE supplements SET name = ?, description = ? WHERE id = ?').run(name, description || null, id);
    return { ok: true };
  });

  ipcMain.handle('supplements:delete', (_, { id }) => {
    const db = getDb();
    const inPlan = db.prepare('SELECT COUNT(*) AS n FROM supplement_plan_items WHERE supplement_id = ?').get(id).n;
    const inLog  = db.prepare('SELECT COUNT(*) AS n FROM supplement_log WHERE supplement_id = ?').get(id).n;
    if (inPlan > 0 || inLog > 0) return { ok: false, reason: 'in_use' };
    db.prepare('DELETE FROM supplements WHERE id = ?').run(id);
    return { ok: true };
  });

  // ── Plan ────────────────────────────────────────────────────────────────────

  ipcMain.handle('supplementPlan:getCurrent', () => {
    const db = getDb();
    const plan = db.prepare(
      'SELECT * FROM supplement_plans ORDER BY effective_from DESC LIMIT 1'
    ).get();
    if (!plan) return null;
    return { plan, items: getPlanItems(db, plan.id) };
  });

  ipcMain.handle('supplementPlan:save', (_, { items }) => {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    const savePlan = db.transaction(() => {
      // Check for existing plan today — update in place if present
      let plan = db.prepare('SELECT * FROM supplement_plans WHERE effective_from = ?').get(today);
      if (plan) {
        db.prepare('DELETE FROM supplement_plan_items WHERE plan_id = ?').run(plan.id);
      } else {
        const result = db.prepare('INSERT INTO supplement_plans (effective_from) VALUES (?)').run(today);
        plan = { id: result.lastInsertRowid, effective_from: today };
      }
      const insertItem = db.prepare(
        'INSERT INTO supplement_plan_items (plan_id, supplement_id, qty, unit, notes, time_of_day) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const item of items) {
        insertItem.run(
          plan.id,
          item.supplement_id,
          item.qty || 1,
          item.unit || '',
          item.notes || '',
          item.time_of_day || 'breakfast',
        );
      }
      return plan.id;
    });

    const planId = savePlan();
    return { ok: true, plan_id: planId };
  });

  // ── Day / Dashboard ─────────────────────────────────────────────────────────

  ipcMain.handle('supplements:getDay', (_, { date }) => {
    const db = getDb();
    const plan = getPlanForDate(db, date);
    if (!plan) return [];
    return db.prepare(`
      SELECT spi.supplement_id AS id, s.name, spi.qty, spi.unit, spi.time_of_day,
             COALESCE(sl.count, 0) AS taken
      FROM supplement_plan_items spi
      JOIN supplements s ON s.id = spi.supplement_id
      LEFT JOIN supplement_log sl ON sl.supplement_id = spi.supplement_id AND sl.date = ?
      WHERE spi.plan_id = ?
      ORDER BY ${TIME_ORDER_CASE}, s.name
    `).all(date, plan.id);
  });

  ipcMain.handle('supplements:fill', (_, { supplement_id, date }) => {
    const db = getDb();
    const plan = getPlanForDate(db, date);
    const item = plan
      ? db.prepare('SELECT qty FROM supplement_plan_items WHERE plan_id = ? AND supplement_id = ?').get(plan.id, supplement_id)
      : null;
    const effectiveQty = item?.qty ?? 1;

    const existing = db.prepare(
      'SELECT count FROM supplement_log WHERE supplement_id = ? AND date = ?'
    ).get(supplement_id, date);
    if (!existing) {
      db.prepare('INSERT INTO supplement_log (supplement_id, date, count) VALUES (?, ?, ?)').run(supplement_id, date, effectiveQty);
    } else {
      db.prepare('UPDATE supplement_log SET count = ? WHERE supplement_id = ? AND date = ?').run(effectiveQty, supplement_id, date);
    }
    return { taken: effectiveQty };
  });

  ipcMain.handle('supplements:fillSlot', (_, { date, time_of_day }) => {
    const db = getDb();
    const plan = getPlanForDate(db, date);
    if (!plan) return { ok: true, filled: 0 };
    const items = db.prepare(
      'SELECT supplement_id, qty FROM supplement_plan_items WHERE plan_id = ? AND time_of_day = ?'
    ).all(plan.id, time_of_day);

    const upsert = db.transaction((rows) => {
      const sel = db.prepare('SELECT count FROM supplement_log WHERE supplement_id = ? AND date = ?');
      const ins = db.prepare('INSERT INTO supplement_log (supplement_id, date, count) VALUES (?, ?, ?)');
      const upd = db.prepare('UPDATE supplement_log SET count = ? WHERE supplement_id = ? AND date = ?');
      let filled = 0;
      for (const row of rows) {
        const ex = sel.get(row.supplement_id, date);
        if (!ex) { ins.run(row.supplement_id, date, row.qty); filled++; }
        else if (ex.count < row.qty) { upd.run(row.qty, row.supplement_id, date); filled++; }
      }
      return filled;
    });
    const filled = upsert(items);
    return { ok: true, filled };
  });

  ipcMain.handle('supplements:take', (_, { supplement_id, date }) => {
    const db = getDb();
    const plan = getPlanForDate(db, date);
    const item = plan
      ? db.prepare('SELECT qty FROM supplement_plan_items WHERE plan_id = ? AND supplement_id = ?').get(plan.id, supplement_id)
      : null;
    const effectiveQty = item?.qty ?? 1;

    const existing = db.prepare(
      'SELECT count FROM supplement_log WHERE supplement_id = ? AND date = ?'
    ).get(supplement_id, date);

    let newCount;
    if (!existing) {
      newCount = 1;
      db.prepare('INSERT INTO supplement_log (supplement_id, date, count) VALUES (?, ?, ?)').run(supplement_id, date, newCount);
    } else {
      newCount = existing.count >= effectiveQty ? 0 : existing.count + 1;
      if (newCount === 0) {
        db.prepare('DELETE FROM supplement_log WHERE supplement_id = ? AND date = ?').run(supplement_id, date);
      } else {
        db.prepare('UPDATE supplement_log SET count = ? WHERE supplement_id = ? AND date = ?').run(newCount, supplement_id, date);
      }
    }
    return { taken: newCount };
  });

  // ── Adherence ───────────────────────────────────────────────────────────────

  ipcMain.handle('supplements:getAdherence', (_, { days }) => {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));
    const start = startDate.toISOString().split('T')[0];

    // All plan versions that could cover the range
    const plans = db.prepare(
      'SELECT * FROM supplement_plans WHERE effective_from <= ? ORDER BY effective_from ASC'
    ).all(today);
    if (plans.length === 0) return [];

    // Items for each plan
    const planItemsMap = new Map();
    for (const plan of plans) {
      planItemsMap.set(plan.id, getPlanItems(db, plan.id));
    }

    // All log entries in range
    const logs = db.prepare(
      'SELECT supplement_id, date, count FROM supplement_log WHERE date >= ? AND date <= ? ORDER BY date'
    ).all(start, today);
    const logMap = new Map();
    for (const log of logs) {
      const key = `${log.supplement_id}|${log.date}`;
      logMap.set(key, log.count);
    }

    // Find plan effective on a given date (plans sorted ASC, find last one <= date)
    function planForDate(date) {
      let result = null;
      for (const p of plans) {
        if (p.effective_from <= date) result = p;
        else break;
      }
      return result;
    }

    // Collect all supplement ids that appear in any plan covering the range
    const allSupplementIds = new Set();
    for (const plan of plans) {
      for (const item of planItemsMap.get(plan.id)) {
        allSupplementIds.add(item.supplement_id);
      }
    }

    // For each supplement, compute adherence across the range
    const supplementNames = new Map();
    for (const plan of plans) {
      for (const item of planItemsMap.get(plan.id)) {
        supplementNames.set(item.supplement_id, item.name);
      }
    }

    const msPerDay = 86400000;
    const results = [];

    for (const supplementId of allSupplementIds) {
      let daysExpected = 0;
      let daysTaken = 0;
      const annotatedLogs = [];

      // Walk each day in range
      const rangeStart = new Date(start);
      const rangeEnd = new Date(today);
      for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const plan = planForDate(dateStr);
        if (!plan) continue;
        const planItems = planItemsMap.get(plan.id);
        const item = planItems.find(i => i.supplement_id === supplementId);
        if (!item) continue; // not in plan on this day

        daysExpected++;
        const count = logMap.get(`${supplementId}|${dateStr}`) ?? 0;
        if (count >= item.qty) daysTaken++;
        if (count > 0) {
          annotatedLogs.push({ date: dateStr, count, effectiveQty: item.qty });
        }
      }

      // Find most recent qty/unit for display
      let currentQty = 1, currentUnit = '';
      for (const plan of [...plans].reverse()) {
        const item = planItemsMap.get(plan.id).find(i => i.supplement_id === supplementId);
        if (item) { currentQty = item.qty; currentUnit = item.unit; break; }
      }

      results.push({
        id: supplementId,
        name: supplementNames.get(supplementId) ?? '',
        qty: currentQty,
        unit: currentUnit,
        daysExpected,
        daysTaken,
        adherencePct: daysExpected > 0 ? Math.round((daysTaken / daysExpected) * 100) : 0,
        logs: annotatedLogs.reverse().slice(0, 90),
      });
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
  });
}

module.exports = registerSupplementsIpc;
