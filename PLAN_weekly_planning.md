# Plan — Weekly Meal Planning v2

**Date**: 2026-05-07
**Owner**: Marco
**Status**: Approved, not yet implemented
**Supersedes**: earlier v1 of this file (broader scope including auto-shopping-list, training-day hints, copy-last-week, etc. — those are deferred, see §Deferred at bottom).

---

## Why

Marco plans weekly (Sunday) and shops weekly. Today his planning happens through the Dashboard's per-day Plan-mode toggle: navigate to a future date, toggle Plan, log foods with `status='planned'`, later promote to `logged` via "Confirm planned." The mechanism works. What's actually missing is:

1. **A week-level authoring surface** — no way to see all 21 main meals at once. Today every change is a 7-page navigation away.
2. **At-a-glance week visibility on the Dashboard** — even without leaving Dashboard, Marco wants to see which upcoming days have a plan vs. which are still empty.
3. **Per-meal templates** — templates today are whole-day. "My go-to lunch" should be a reusable atom, not a whole-day blob.

Three focused changes. No shopping-list integration in this scope — that'll be its own plan if/when it's wanted.

---

## Scope

### In scope
- New **PlanPage**: 7-column × meal-slot grid for the selected week. Drag-drop authoring of `log` rows with `status='planned'`. Reuses existing IPC.
- **Day-badge strip on Dashboard**: 7 compact day cells just below the page header showing each day's plan status. Tap → navigates Dashboard to that day.
- **Per-meal templates**: existing `template_items.meal` column already supports it; add UI to save a single cell as a meal template and to apply meal templates via the PlanPage cell context menu.

### Explicitly out of scope (this plan)
- Auto shopping list from plan.
- Quick-actions: Copy last week, swap days, shift plan ±1 day.
- Training-day soft hints in column headers.
- Plan-vs-actual comparison view (rejected).
- Auto-fill empty slots from Suggestions (waits for Suggestions engine).
- Multi-week views, recurring plans, calendar/HealthKit integration.
- Confirm-planned UX from PlanPage (still done from Dashboard).

---

## Decisions (locked)

| Topic | Decision |
|---|---|
| Persistence | Reuse `log` rows with `status='planned'`. PlanPage reads via `api.log.getWeekDetail`; writes via `api.log.add`. No schema changes |
| Grid emphasis | Breakfast / Lunch / Dinner are the visual centerpiece; other slots collapse to a single "Snacks" row by default with expand affordance |
| Day-badge placement | Top of Dashboard, immediately below the page header |
| Day-badge states | **Plan status only**: empty / partially planned / fully planned (all 3 main meals filled) |
| Day-badge tap | Navigate to that day's Dashboard view (existing `navigate('day', ...)` flow) |
| Per-meal templates UI | Inside PlanPage only. Right-click (or kebab) on a cell → "Apply meal template…" picker filtered to single-meal templates matching the cell's slot. Save flow on a cell → "Save this meal as template" |
| No standalone Templates manager UI | Templates remain creatable/editable through the existing flows; this plan does not add a new manager page |

---

## PlanPage Layout

```
┌────────────────────────────────────────────────────────────────────┐
│  ← Mon 6 May   Sun 12 May →                                        │
│  Plan totals: 14,200 kcal · 1,050P / 1,540C / 490F                 │
├──────────┬─────────┬─────────┬─────────┬─────────┬──────┬──────┬──┤
│          │ Mon     │ Tue     │ Wed     │ Thu     │ Fri  │ Sat  │Sun│
│          │ 2,100   │ 1,800   │ 2,150   │ 1,800   │ 1,800│ 1,900│  …│
├──────────┼─────────┼─────────┼─────────┼─────────┼──────┼──────┼──┤
│ BREAKFAST│ ☕ +    │ ☕ +    │   —     │ ☕ +    │  —   │ ☕ + │…  │
│ LUNCH    │ 🍝 +    │ 🥗 +    │ 🍝 +    │   —     │ 🥗   │  —   │…  │
│ DINNER   │ 🐟 +    │ 🐟 +    │ 🥬 +    │ 🍲 +    │  —   │ 🍲   │…  │
├──────────┼─────────┼─────────┼─────────┼─────────┼──────┼──────┼──┤
│ ▾ Snacks │ 1 item  │   —     │ 2 items │   —     │  —   │  —   │…  │
└──────────┴─────────┴─────────┴─────────┴─────────┴──────┴──────┴──┘
```

### Day column header
- Date + weekday.
- Daily kcal sum (planned + logged for past days). Color: green if within ±10% of `cal_rec`, amber if over `cal_max`.

### Meal-slot rows
- Breakfast / Lunch / Dinner shown by default with large cells.
- Other slots (MorningSnack / AfternoonSnack / LateNightSnack) collapse into one **Snacks** row showing item count. Click to expand into 3 sub-rows (collapse state persisted to localStorage).
- Each cell: chips (food name + grams). Click chip → edit/remove. Empty cell shows a `+` drop target.

### Cell interactions
- **Click `+` empty**: opens existing FoodSearch modal with the meal slot pre-set. Selecting a food adds it as `status='planned'`.
- **Drag chip to another cell**: moves the entry. Within-day moves only update meal; cross-day moves update `date`.
- **Right-click cell** (or kebab on hover): context menu — "Apply meal template…", "Save this meal as template", "Clear cell".

### Drag-drop
- Use **@dnd-kit/core** (lightweight, React 19-friendly). Add to deps if not present.
- Sortable contexts per cell to keep re-render cost local.

---

## Day-Badge Strip on Dashboard

A horizontal 7-cell row inserted at the top of `DashboardPage.tsx`, immediately below the existing page header.

- The 7 cells correspond to the **current week** (Monday-anchored — match the existing WeekPage convention; confirm during build).
- Each cell shows: weekday letter (M/T/W/T/F/S/S), date number, plan-status indicator dot.

### Plan-status states
- **Empty** — no `log` row with `status='planned'` and `date=X`. Cell renders dim, no dot.
- **Partial** — at least one planned entry, but not all three main meals (Breakfast/Lunch/Dinner) have items. Amber dot.
- **Full** — all three main meals have ≥1 planned item. Green dot.

Snacks slots are ignored for this signal — only the 3 main meals count toward "full," matching what Marco said: the main 3 are most important.

### Today indicator
- The current day's cell has a subtle ring/border highlight regardless of plan status.

### Tap behavior
- Single tap → `navigate('day', { date: cell.date })`, same as existing day-jump from elsewhere. Uses the existing Dashboard surface.

### Performance
- Computed from a single query: `SELECT date, meal, COUNT(*) FROM log WHERE date BETWEEN ? AND ? AND status='planned' GROUP BY date, meal`. Map result to the 7-cell array client-side. Re-fetch when `log` mutates (existing event/refresh hook pattern).

---

## Per-Meal Templates

`template_items.meal` already exists. No DB changes.

### Save flow
- PlanPage cell context menu → **"Save this meal as template"** → name prompt → creates a `meal_templates` row whose `template_items` are exactly the cell's items, all with that cell's meal slot.

### Apply flow
- PlanPage cell context menu → **"Apply meal template…"** → opens `ApplyMealTemplateModal`.
- Modal lists templates filtered to single-meal templates matching the cell's slot (i.e., all `template_items` for the template share one `meal` value AND that value equals the cell's meal slot).
- "Whole-day" templates are excluded from this picker (they remain accessible through their existing flow on Dashboard, unchanged).
- Selecting a template inserts its items into the cell as `status='planned'` rows. Existing items in the cell are preserved (additive); a "Replace existing" toggle in the modal switches to a clear-then-insert flow.

### Edge case
- A template that was originally saved as whole-day but happens to have only one `meal` slot populated: it qualifies for the per-meal picker. No need to distinguish "saved as meal" from "happens to be one meal" — the filter is structural.

---

## Implementation Outline

### New files
- `src/pages/PlanPage.tsx` — the page.
- `src/components/plan/PlanGrid.tsx` — the 7×N cell grid with drag-drop.
- `src/components/plan/PlanCell.tsx` — single cell: chips + drop target + context menu + empty `+`.
- `src/components/plan/ApplyMealTemplateModal.tsx` — filtered template picker.
- `src/components/plan/SaveAsMealTemplateModal.tsx` — name input + save.
- `src/components/dashboard/WeekDayStrip.tsx` — the 7-day badge strip for Dashboard.

### Files to touch
- `src/api.ts` — no new IPC channels (everything reuses existing `log` and `templates` APIs); add `api.log.getWeekDetail`/`api.templates.*` if they aren't already exposed at the right shape.
- `src/types.ts` — `PlanCellModel` (date + meal + entries), `DayPlanStatus` ('empty' | 'partial' | 'full').
- `src/components/Nav.tsx` (or wherever nav is registered) — wire the dead `plan` nav route to `PlanPage`.
- `src/pages/DashboardPage.tsx` — mount `<WeekDayStrip />` at the top.
- `src/i18n/translations.ts` — EN + IT for: page title, eyebrow, cell empty state, "Apply meal template", "Save this meal as template", "Clear cell", "Replace existing", badge tooltips ("Empty", "Partially planned", "Fully planned"), modal copy.

### Build order
1. **PlanPage scaffold + 7×3 grid (main meals only)**, reading existing planned `log` rows. Click-to-add via FoodSearch modal. No drag yet, no Snacks row.
2. **Snacks row** with collapse/expand persisted to localStorage.
3. **Drag-drop** within and across cells via `@dnd-kit`.
4. **Per-meal templates**: Save-as and Apply flows, including the "Replace existing" toggle.
5. **WeekDayStrip on Dashboard**: queries planned entries for the week, renders empty/partial/full states, tap→navigate.
6. **Polish**: IT translations sweep, ConfirmDialog wiring on "Clear cell" if the cell has ≥2 items, restart-and-verify run.

Each step is independently shippable. Step 1 alone gives Marco the week overview that's missing today.

---

## Deferred (not in this plan)

These came up in earlier discussion and were considered, but are intentionally out of scope here. Captured for future plans:

- **Plan → auto shopping list** with pantry diff. (Was a top-2 pick in the earlier broad questionnaire; the user later narrowed scope.)
- **Quick actions**: Copy last week, Clear day, Clear week, Swap days, Shift plan ±1 day.
- **Training-day soft hint** badge on day column headers from `exercises` table.
- **Auto-fill empty slots** from the Suggestions engine.
- **Confirm-planned from PlanPage** (currently confirmation lives on Dashboard only).
- **Adherence stats** (% of plan actually eaten).
- **Markdown/PDF export of plan**.

---

## Open Questions / Risks

- **Drag-drop with React 19**: `@dnd-kit/core` should work. Verify on first install; if any peer-dep snag, fall back to native HTML5 DnD with a small wrapper.
- **Status='planned' rows already exist** today from Dashboard plan-mode. PlanPage must not double-count or clobber. Test by planning via Dashboard first, then opening PlanPage.
- **Week anchor (Monday vs Sunday)**: existing WeekPage uses a `weekStart` prop. PlanPage should match that convention (likely Monday-start based on Italian locale). Confirm during build by reading `dateUtil.ts`.
- **Snacks row UX**: collapse default hides 3 sub-slots. Confirm Marco never plans complex snack stacks frequently; if he does, default to expanded.
- **Cell capacity**: a cell with 5+ chips can get visually noisy. Cap visible chips at 3 with "+N more" overflow that expands on hover/click.
