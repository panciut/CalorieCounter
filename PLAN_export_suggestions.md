# Plan — Export/Import Overhaul + Suggestions Page

**Date**: 2026-05-07
**Owner**: Marco
**Status**: Approved, not yet implemented

---

## Why

Two pain points driving this work:

1. **AI-assisted analysis** — Marco wants to copy his full meal/health history into Claude/ChatGPT and ask questions like "how did my eating shift over time?" or "what's making me plateau?". The current export isn't structured for that.
2. **Meal repetitiveness** — Marco self-detects when he's in a rut. He doesn't need the app to warn him; he needs it to **resurface forgotten meals** and **propose realistic alternatives** so the rut breaks itself.

Secondary goal: make import safer and more flexible (selective by domain, choose merge vs replace), so moving data between machines or rolling back is no longer an all-or-nothing operation.

---

## Scope

### In scope
- New **Suggestions** page (nav item) with 6 sections.
- New **Export** dialog on the Data page with format + date-range controls.
- New **Import** dialog with per-domain include/skip and merge/replace.
- Time-of-day awareness for combo suggestions.
- Pantry-stock awareness for meal suggestions.

### Explicitly out of scope
- Macro-gap fillers (rejected by Marco — not a current need).
- Repetition *warnings* / "you've eaten X 5× this week" nudges (Marco self-detects).
- LLM/online generation of new combos (build-from-history only; no external API).
- iOS companion changes (this is desktop-only for now).

---

## Decisions (locked)

| Topic | Decision |
|---|---|
| Export format | User picks at export time: Markdown bundle / single JSON / meals-only Markdown |
| Export MD structure | Daily journal, chronological |
| Export date range | Preset chips (30d / 90d / 1y / All) + custom range pickers |
| Import behavior | Selective dialog: per-domain include/skip + merge/replace mode |
| Suggester surface | Dedicated nav page (no Dashboard strip, no FoodSearch integration in v1) |
| Suggestion sources | Past meals + foods catalog + recipes |
| Forgotten-meal tiering | Three non-overlapping buckets (see §Suggestions below) |
| Combo detection rule | Two foods logged in the same meal slot on the same day, co-observed ≥3 times. Triplets get their own row if ≥3 |

---

## Suggestions Page

New nav item. Page is six vertical sections, each a horizontal scroll-row of cards. Each card → tap → prefills today's entry with that food/meal at the current meal slot.

1. **Proven favorites you forgot**
   - Eaten ≥3× ever, none in last 30 days.
   - Sort by historical frequency desc.

2. **Tried once or twice**
   - Eaten exactly 2× ever, none in last 21 days.
   - Non-overlapping with §1.

3. **In your rotation gap**
   - Eaten exactly 1× ever, not in last 14 days.
   - Non-overlapping with §1–§2. Acts as a "give it another shot" tier.

4. **Frequent combos for [meal slot]**
   - Meal slot = breakfast/lunch/dinner/snack, derived from current time of day.
   - Auto-detected pairs (and triplets ≥3 co-occurrences), ranked by co-occurrence count.
   - Tapping a combo logs all its items in one shot.

5. **From your pantry**
   - Meals/recipes you've built before, whose ingredients are currently in pantry with sufficient stock.
   - Practical "you can actually make this right now" filter.

6. **Never tried**
   - Foods + recipes in your catalog that you've added but never logged.
   - Helps clear the catalog backlog.

### Time-of-day rules
- Breakfast: 04:00–10:30
- Lunch: 10:30–15:00
- Dinner: 18:00–23:00
- Snack: anything else

Use entry `logged_at` timestamps to bucket historical meals into slots for combo detection and §4.

---

## Export

Triggered from Data page, replaces current export.

**Dialog controls**
- Format: radio — `Markdown bundle (AI-friendly)` / `Single JSON` / `Meals-only Markdown`
- Range: preset chips `30d` `90d` `1y` `All` + custom start/end date pickers
- Output: single file save dialog (or folder, for the bundle)

**Markdown bundle** — folder containing:
- `caloriecounter-<start>_<end>.md` — daily journal (see template below)
- `data.json` — full structured sidecar for round-trip via Import

**Daily journal template** (per day):
```
## 2026-05-07 — Thursday
**Totals**: 2140 kcal · 165P / 220C / 70F
**Weight**: 78.4 kg
**Exercise**: 45min run (420 kcal)
**Water**: 2.1 L · **Supplements**: vitamin D, omega-3

### Breakfast (08:12)
- Greek yogurt 200g — 130 kcal · 18P / 8C / 2F
- Banana 120g — 105 kcal · 1P / 27C / 0F

### Lunch (13:05)
- ...

### Notes
(any free-text notes on the day)
```

**Single JSON** — one file, all domains, schema-versioned for future-proof import.

**Meals-only Markdown** — same daily journal, but only the meal sections + totals. Smallest file, optimized for "analyze my eating" prompts.

---

## Import

Triggered from Data page. Replaces current import.

**Step 1**: file picker (accepts `.json` from Single JSON export, or the `data.json` from a Markdown bundle).

**Step 2**: parsing summary modal listing each domain with counts found:
```
☑ Foods catalog        324 items     [Merge ▾]
☑ Meal log             1,847 entries [Merge ▾]
☑ Weight log           412 entries   [Merge ▾]
☐ Exercises            …             [Merge ▾]
…
```
Per-row: include checkbox + Mode dropdown (Merge / Replace).

**Merge** = additive: insert rows whose natural key (date+id, or food name+barcode, etc.) doesn't already exist. Never destroys data.

**Replace** = delete all rows in that domain, then insert from file. Requires a `ConfirmDialog` ("This will delete N existing weight entries. Continue?").

**Step 3**: write summary toast — "Imported: 412 foods, 53 meals, 0 weight (skipped — already present)."

---

## Implementation Outline

### New files
- `src/pages/SuggestionsPage.tsx` — the page.
- `src/components/suggestions/SuggestionRow.tsx` — horizontal card row.
- `src/components/suggestions/SuggestionCard.tsx` — single card.
- `src/components/data/ExportDialog.tsx` — new dialog.
- `src/components/data/ImportDialog.tsx` — new dialog.
- `main/ipc/suggestions.js` — queries for the 6 buckets.
- `main/ipc/exportImport.js` — replaces (or extends) existing export logic. Handles MD generation, JSON dump, selective import with merge/replace per domain.

### Files to touch
- `src/api.ts` — add `api.suggestions.*`, update `api.data.export` / `api.data.import` signatures.
- `src/types.ts` — add `Suggestion`, `SuggestionBucket`, `ExportOptions`, `ImportPlan` types.
- `src/components/Nav.tsx` (or wherever nav order lives) — register new "suggestions" page.
- `src/i18n/translations.ts` — EN + IT strings for every new UI text.
- `main/main.js` — register new IPC handlers.
- `main/db.js` — likely no schema change; combo detection is a query, not a stored table. If perf becomes an issue, add a materialized `food_cooccurrence` table later.

### Performance notes
- Combo detection over years of meal log could be slow. First implementation: pure SQL with a self-join on `meal_log` keyed by (date, meal_slot). If query >100ms, cache results in-memory on app start and invalidate on new meal entry.
- Pantry-aware §5 needs a join between recipe ingredients and current pantry stock; should be fine.

### i18n reminder
Every new label, button, section title, dialog message must have entries in both `en` and `it` in `src/i18n/translations.ts`. No hardcoded English in JSX.

---

## Build Order

1. **Export dialog + Markdown daily journal generator** — gives Marco the AI-paste workflow he wants today, lowest risk.
2. **Single JSON export + Selective Import dialog** — round-trip working.
3. **Suggestions page scaffolding + IPC + sections 1–3** (forgotten meals, no combos yet).
4. **Section 4 (combos) with time-of-day filtering**.
5. **Section 5 (pantry) + Section 6 (never tried)**.
6. **Polish: empty states, IT translations sweep, ConfirmDialog wiring, restart-and-verify run.**

Each step is independently shippable and testable manually (no test suite — verify by running `npm run dev`).

---

## Open Questions / Risks

- **Combo threshold** (≥3 co-occurrences) is a guess. May need tuning once Marco sees real output. Keep it as a const at top of `suggestions.js` so it's trivial to adjust.
- **Meal-slot boundaries** are hardcoded; if Marco's schedule shifts (e.g. late dinners), they may need to become a Setting. Defer until he hits the friction.
- **JSON schema versioning** — add a `"schemaVersion": 1` field so future imports can detect old formats and migrate.
- **Bundle format** — emitting a folder (MD + JSON sidecar) on macOS is fine via Electron's `dialog.showSaveDialog` + `fs.mkdir`. Confirm Windows/cross-platform behavior if iOS companion ever ships.
