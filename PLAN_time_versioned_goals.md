# Plan — Time-Versioned Goals

**Date**: 2026-05-07
**Owner**: Marco
**Status**: Approved, not yet implemented

---

## Why

Today, calorie + macro + weight goals live as flat keys in the `settings` table (`cal_min/rec/max`, `protein_*`, `carbs_*`, `fat_*`, `fiber_*`, `weight_goal`, `water_goal`, `tol_*`). All consumers read these globally via `useSettings()`:

- `src/components/DayMacrosCard.tsx` — every day uses today's goal
- `src/pages/HistoryPage.tsx`, `WeekPage.tsx`, `NetPage.tsx` — past summaries rated against today's goal
- `src/lib/exportText.ts` — exported Markdown bakes today's goal into every historical day

Result: changing the goal retroactively re-rates the entire history. If Marco moves from cut (1800 kcal) to maintenance (2500 kcal), every day in the past suddenly looks like he was undereating against the new goal. The number changed, but the lived experience didn't.

The codebase already has the right pattern for this — `supplement_plans (effective_from)` + `supplement_plan_items` — established when supplements went through the same growing pain. Goals get the same treatment.

---

## Scope

### In scope
- New `goal_plans` table storing time-versioned goals (calories, all 4 macros + fiber, weight target, water target, tolerance bands).
- Resolution helper: "what were Marco's goals on date X?" returns the most recent `goal_plan` with `effective_from <= X`.
- One-time backfill: insert one `goal_plan` row at `effective_from = '2000-01-01'` populated from the current `settings` values, so all existing history evaluates against the same goal it implicitly used before.
- GoalsPage gets a **history view** showing each goal period chronologically (label + dates + numbers). Saving new goals creates a new row dated **today** by default.
- All consumers that currently read goal keys from `settings` switch to per-date resolution. Day views use the day's goal; week/range views use **per-day correct** (each day rated against its own goal).
- Past goal periods are **read-only** — an audit log. To change a past period, you insert a new plan with that effective_from, overriding it from that point forward.
- Each plan has a free-text **label** + optional **notes** (e.g., "Cut Q2 2026", "Maintenance after holidays").

### Explicitly out of scope
- Versioning non-goal settings (`language`, `theme`, `pantry_*`, `currency_symbol`, `track_extra_nutrition`, `off_country`, etc. — these stay in `settings`, genuinely global).
- Editing past goal periods in place (rejected — read-only audit).
- Sub-day goal changes ("training day vs rest day" macro skew). Already deferred in the weekly-planning plan.
- Auto-creating a new goal plan when adaptive TDEE drifts. TDEE intelligence still suggests numbers; user explicitly clicks Save.

---

## Decisions (locked)

| Topic | Decision |
|---|---|
| Default effective_from on save | **Today** |
| Editability of past periods | **Read-only audit log**. To override a past period, insert a new plan with that effective_from date — it cuts the prior one off |
| Per-plan metadata | Free-text **label** + free-text **notes** |
| Range views straddling a change | **Per-day correct** — each day uses its own goal; aggregates are computed accordingly |
| Backfill | Insert one plan dated `2000-01-01` from current `settings` values on first run |
| `settings` keys after migration | Keep them as a denormalized "current" mirror for any legacy code we miss; treat `goal_plans` as the source of truth. Migration drops them after a settled period (next major); flagged for cleanup |
| Adaptive TDEE behavior | Suggest values; user clicks Save → creates new plan. No silent auto-versioning |

---

## Schema

```sql
CREATE TABLE goal_plans (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  effective_from  TEXT NOT NULL UNIQUE,        -- 'YYYY-MM-DD'
  label           TEXT NOT NULL DEFAULT '',
  notes           TEXT NOT NULL DEFAULT '',
  goal_type       TEXT NOT NULL DEFAULT 'custom',  -- 'lose'|'maintain'|'gain'|'custom'
  -- Calorie targets
  cal_min         REAL,
  cal_rec         REAL,
  cal_max         REAL,
  -- Macros
  protein_min     REAL, protein_rec REAL, protein_max REAL,
  carbs_min       REAL, carbs_rec   REAL, carbs_max   REAL,
  fat_min         REAL, fat_rec     REAL, fat_max     REAL,
  fiber_min       REAL, fiber_rec   REAL, fiber_max   REAL,
  -- Other targets
  weight_goal     REAL,
  water_goal      REAL,
  -- Tolerance bands
  tol_1           REAL, tol_2 REAL, tol_3 REAL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_goal_plans_effective_from ON goal_plans(effective_from);
```

`effective_from UNIQUE` enforces one plan per day. Re-saving for "today" twice means the second save **updates** the existing today row (treated as a correction, not a new period). No row deletion needed.

### Resolution

```sql
SELECT * FROM goal_plans
WHERE effective_from <= ?
ORDER BY effective_from DESC
LIMIT 1
```

Wrapped in `getGoalsForDate(date)` in `main/ipc/goals_tdee.ipc.js`. For range queries, batch via:

```sql
SELECT effective_from FROM goal_plans WHERE effective_from <= ? ORDER BY effective_from
```

…then in JS, walk dates in the range and assign the active `goal_plan` to each.

### Backfill (runs once on first launch after migration)

```js
const existing = db.prepare("SELECT COUNT(*) AS n FROM goal_plans").get().n;
if (existing === 0) {
  const s = settingsAsObject(db);  // pull all goal-related keys
  db.prepare(`
    INSERT INTO goal_plans (effective_from, label, goal_type,
      cal_min, cal_rec, cal_max,
      protein_min, protein_rec, protein_max,
      carbs_min, carbs_rec, carbs_max,
      fat_min, fat_rec, fat_max,
      fiber_min, fiber_rec, fiber_max,
      weight_goal, water_goal,
      tol_1, tol_2, tol_3
    ) VALUES ('2000-01-01', 'Initial', 'custom', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(/* values */);
}
```

Guarded by a settings flag `schema.goal_plans_seeded_v1 = '1'` so it never re-runs.

---

## Resolution Layer

### Backend

`main/ipc/goals_tdee.ipc.js` exposes:

- `goals:getForDate({ date })` → returns the active `goal_plan` row for that date.
- `goals:getForDateRange({ start, end })` → returns a `Map<date, goal_plan>` for every day in the range.
- `goals:listPlans()` → all plans, sorted ascending. Used by the GoalsPage history view.
- `goals:savePlan({ effective_from, label, notes, goal_type, …all goal fields })` → upserts on `effective_from`. If the date matches an existing plan, updates it (the "fix today's plan" case); otherwise inserts.
- `goals:deletePlan({ id })` → only allowed if `effective_from > today`. Past plans are immutable. Future plans (queued ahead) can be cancelled.

### Renderer

A new hook `useGoalsForDate(date)` returns the active goal for that date (cached via React Query-style memoization keyed by date). For range views, `useGoalsForDateRange(start, end)` returns a `Map<date, Goals>`.

`useSettings()` keeps returning the current snapshot for non-goal settings, but the goal-specific fields it currently exposes get a deprecation comment and resolve to "today's goals" via the new hook so existing call sites keep working during the transition. Audit + remove in a follow-up.

---

## UI Changes

### GoalsPage

Single page, two stacked sections:

**Top: "Current goals" form** (existing layout)
- The form prefills with the active goal for today.
- Save button text becomes **"Save as new goal period (starts today)"** with helper text *"Past days will keep their existing goals."*
- Optional **label** input above the macros (placeholder: "e.g., Cut Q2"), and optional **notes** textarea below.
- The "Calculate from TDEE / suggest goals" intelligence stays put; it just feeds numbers into the form, doesn't auto-save.

**Bottom: "Goal history"** (new)
- Reverse-chronological list of past plans.
- Each row shows: `effective_from → next plan's start (or "current")`, label, goal_type tag, calorie target + macro summary line, notes preview.
- Past rows are read-only (no edit pencil). Tapping expands to full view.
- The most recent (current) plan shows an **"Update without creating new period"** affordance — opens the same form but updates in place rather than creating a new row. Used for typo fixes on the active plan.
- Future-dated plans (rare; only via the date picker) show a **Cancel** button (deletes the row). When cancelled, the previous plan extends back into effect.

### Day views (Dashboard, NetPage)
- `DayMacrosCard` consumes `useGoalsForDate(currentDate)` instead of `useSettings()` for goal fields. Otherwise unchanged.

### Range views (HistoryPage, WeekPage)
- Each day row uses its own day's goal for "vs goal" coloring and over/under indicators.
- The aggregate "avg vs goal" line shows the **average of per-day deltas** rather than (avg actual − single goal). Numerically equivalent when goal is constant, correct when it isn't.
- If the visible range straddles a goal change, surface a small chip in the header: "Goals changed on 2026-05-07" — passive label, no UI complication.

### Markdown export (`src/lib/exportText.ts`)
- Daily-journal entries quote the goals active for that day (not the current goal).
- The header summary section for a multi-day export lists each goal period that intersects the range, with its dates and numbers.

---

## Implementation Outline

### New files
- `src/hooks/useGoalsForDate.ts` — single-date hook.
- `src/hooks/useGoalsForDateRange.ts` — range hook returning `Map<date, Goals>`.
- `src/components/goals/GoalHistoryList.tsx` — reverse-chrono list, expandable rows.
- `src/components/goals/GoalPlanRow.tsx` — single history row.

### Files to touch
- `main/db.js` — `CREATE TABLE goal_plans` + index + one-time backfill from `settings`.
- `main/ipc/goals_tdee.ipc.js` — new handlers: `goals:getForDate`, `goals:getForDateRange`, `goals:listPlans`, `goals:savePlan`, `goals:deletePlan`. Existing TDEE handlers unchanged.
- `src/api.ts` — `api.goals.*` wrappers.
- `src/types.ts` — `GoalPlan` type, `GoalsForDate` (resolved snapshot).
- `src/pages/GoalsPage.tsx` — label + notes inputs, save-as-new-period button, mount `<GoalHistoryList />` below the form, "update in place" affordance for the active plan.
- `src/components/DayMacrosCard.tsx` — switch from `useSettings()` to `useGoalsForDate(date)`.
- `src/pages/HistoryPage.tsx`, `WeekPage.tsx`, `NetPage.tsx` — switch to per-date goal resolution; aggregates compute per-day deltas; show "Goals changed on X" chip when applicable.
- `src/lib/exportText.ts` — accept a goals-resolver callback or pre-resolved map; use per-day goal values.
- `src/i18n/translations.ts` — EN + IT for: "Save as new goal period (starts today)", "Past days will keep their existing goals", "Goal history", "Update without creating new period", "Cancel future plan", "Goals changed on {date}", "Initial" (label for the seeded backfill row), goal_type labels.

### Build order

1. **Schema + backfill**: create `goal_plans`, insert one row from current `settings`, gate with seeding flag. App still functions — nothing reads from it yet.
2. **Resolution layer**: IPC handlers (`goals:getForDate`, `goals:getForDateRange`, `goals:listPlans`, `goals:savePlan`). Renderer hooks. Tested in isolation.
3. **DayMacrosCard cutover**: switch the per-day display first. Easiest to verify visually.
4. **GoalsPage rewrite**: new save flow (creates plan), label + notes fields, history list section, in-place update for current plan, cancel for future plans.
5. **HistoryPage / WeekPage / NetPage cutover**: per-day correct aggregates and the "goals changed" chip.
6. **Markdown export cutover**: per-day goal values, multi-period summary block.
7. **Polish**: ConfirmDialog wiring on cancel-future-plan, IT translations sweep, restart-and-verify run with a synthetic goal change.

Each step ships independently. Step 3 alone delivers the core promise (today's view uses today's goal; past view uses its own goal) — everything after is making the rest of the app catch up.

---

## Open Questions / Risks

- **Same-day double-save**: if Marco saves goals at 09:00 then again at 17:00 the same day, second save updates the row. He doesn't get two entries for one day. Documented in Save button helper text.
- **Today's goal already-eaten paradox**: if Marco has eaten 2200 kcal and saves a new goal of 1800 effective today, today shows over-budget. He may want effective_from=tomorrow in those cases. The custom-date picker would solve this — currently we only ship the today default. **Mitigation**: in v1, the Save button copy reads "Starts today (covers today's logged entries too)" and we add an inline secondary action "…or start tomorrow instead" that sets effective_from to tomorrow. Cheap escape hatch.
- **Aggregations now require per-day goals**: `WeekPage`'s `recWeek = cal_rec * includedRows.length` becomes `sum(perDayGoal[d].cal_rec)`. Slightly more lookup, negligible cost (≤7 rows).
- **Settings → goal_plans drift**: keeping `settings.cal_rec` as a denormalized mirror is brittle. Either (a) make `settings.*` getters compute from today's `goal_plans` row dynamically, or (b) write through both on save. Pick (a) on the IPC layer (`settings:get` overrides goal keys with today's plan values) so renderer reads via `useSettings` keep working without code change. Audit and remove the goal keys from `settings` in a follow-up.
- **Adaptive TDEE drift**: `goals:calculateTDEE` already uses 30 days of logs to compute expected TDEE. It doesn't need to be goal-versioned — it's a measurement, not a target. Keep as-is.
- **Multi-period Markdown export size**: a year of weekly goal changes would dump ~52 goal blocks. Cap to "active period plus changes inside the export range" — usually ≤3.
