# Plan — Food Categories + Food Groups (canonical / variants)

**Date**: 2026-05-07
**Owner**: Marco
**Status**: Approved, not yet implemented

---

## Why

Two related pain points in the foods catalog (current state: 142 foods, 54 with barcodes):

1. **No categorization.** Marco can't filter or analyze by "vegetables", "meat", etc. Needed for better browsing on the Foods page and for richer analytics on the AI export (e.g. "what % of my protein came from animal vs plant sources?"). OpenFoodFacts already returns `categories_tags` for barcoded items — we currently drop it after using it for liquid detection.

2. **Brand-variant duplication.** Same food sold by different supermarkets ends up as separate rows with slightly different macros. Concrete example from Marco's DB — "Funghi Trifolati" exists 4× (Logro, Logro Champignon, Coop, Lidl) with macros within ~13% of each other. He doesn't care which one he eats; he wants them treated as one thing for logging/analytics, while pantry stock stays per-variant (each jar is a different SKU).

---

## Scope

### In scope
- Add a `category` field to foods, with ~12 flat values.
- Auto-assign category from OpenFoodFacts `categories_tags` when a barcode exists; manual dropdown otherwise.
- Add a "food group" concept: one canonical food + zero or more variants linking to it.
- Logging picks variant from pantry when available; otherwise logs against the canonical.
- Pantry continues tracking each variant SKU separately (unchanged).
- Foods page: show category, filter by category, "Group with…" action to link a food as a variant of an existing canonical, and "Ungroup" to detach.
- Analytics / Suggestions: roll up by `COALESCE(group_id, food_id)` so "Funghi Trifolati Coop" and "Funghi Trifolati Lidl" count as the same food in frequency/co-occurrence detection.
- One-time on-add similarity prompt: when adding a new food, if name+macros are close to an existing canonical/variant, prompt "Add as variant of X, or as a separate food?".

### Out of scope
- Hierarchical / two-level categories. Marco picked flat ~12.
- Free-form tags (multiple categories per food).
- Auto-merging existing dupes silently. Existing dupes get a "Group these" button — user decides.
- Renaming or splitting categories at runtime — the 12 are fixed in code (with translations).

---

## Decisions (locked)

| Topic | Decision |
|---|---|
| Granularity | Flat list, fixed 12 categories |
| Source | OFF `categories_tags` when barcode present, else manual dropdown |
| Variant model | Self-referencing `group_id` on `foods` table (canonical row = `group_id IS NULL` and has at least one row pointing to it) |
| Canonical macros | Auto-set to average of variants at grouping time; "Recompute averages" button on canonical's edit modal; user can override and keep manual values |
| Default at log time | Variant in pantry first, else canonical |
| Existing dupes | Manual fix via "Group these" UI on Foods page; never auto-merged |
| New dupes | On-add similarity prompt suggests grouping with existing canonical |

---

## Categories (the fixed 12)

`vegetables`, `fruit`, `meat`, `fish`, `dairy`, `eggs`, `grains`, `legumes`, `nuts_seeds`, `sweets`, `beverages`, `other`

Stored as `TEXT` (the slug). UI labels via `useT` keys: `food.category.vegetables`, etc. Both EN and IT in `src/i18n/translations.ts`.

### OFF → category mapping

Map first matching OFF tag (top-down precedence):

```
en:beverages, en:drinks, en:waters, en:milks, en:teas, en:coffees …  → beverages
en:meats, en:poultry, en:beef, en:pork, en:cured-meats …             → meat
en:fishes, en:seafood, en:shellfish …                                 → fish
en:eggs                                                               → eggs
en:dairies, en:cheeses, en:yogurts, en:butters, en:creams …           → dairy
en:fruits …                                                           → fruit
en:vegetables, en:mushrooms, en:potatoes, en:tomatoes …               → vegetables
en:cereals, en:breads, en:pastas, en:rices, en:flours …               → grains
en:legumes, en:beans, en:lentils, en:chickpeas, en:peas …             → legumes
en:nuts, en:seeds, en:dried-fruits …                                  → nuts_seeds
en:sweets, en:chocolates, en:candies, en:sugars, en:desserts …        → sweets
(no match)                                                            → other
```

The full list lives in `main/lib/offCategoryMap.js` so it's easy to extend.

---

## Schema Changes

```sql
-- Foods: category and group link
ALTER TABLE foods ADD COLUMN category TEXT NOT NULL DEFAULT 'other';
ALTER TABLE foods ADD COLUMN group_id INTEGER REFERENCES foods(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_foods_category ON foods(category);
CREATE INDEX IF NOT EXISTS idx_foods_group_id ON foods(group_id);

-- Local OFF cache: store categories so re-classification doesn't need a refetch
ALTER TABLE products ADD COLUMN categories_tags TEXT;  -- comma-separated OFF tag list
```

A canonical food: `group_id IS NULL` AND at least one row exists with `group_id = this.id`. A variant: `group_id IS NOT NULL`. A solo food: `group_id IS NULL` with no variants — same as today.

### Backfill on first run

1. **Categories**: for foods with `barcode IS NOT NULL`, look up `off_cache.products.categories_tags` (newly stored from now on) → derive category. For others, leave as `'other'` so Marco can fix them via the Foods page.
2. **Groups**: no auto-grouping. The Foods page gets a "Suggested groupings" section that surfaces same-category rows whose names share ≥2 stem tokens AND whose macros are within 20% — Marco confirms each grouping manually.

---

## UI Changes

### Foods page
- New **Category** column on the food list.
- New **Filter by category** chips above the list.
- Each food row: badge showing category; if it's a variant, show "↳ part of *Funghi Trifolati*" subtitle.
- Each canonical row: small "N variants" indicator that expands inline to show its variants.
- New action menu item per food: **Group with…** (opens a picker with same-category candidates, sorted by name similarity). Once grouped, the picked food becomes the canonical; current food becomes a variant.
- Canonical edit modal: extra **Recompute averages from variants** button.
- New top-of-page **Suggested groupings** collapsible section (auto-detected candidates, dismissable).

### Add Food dialog
- Category dropdown (auto-filled from OFF if barcode looked up; editable).
- After macros are entered or fetched, if a similar canonical exists (name similarity ≥ 0.5 AND all macros within 15%), show inline banner:
  > "Looks like **Funghi Trifolati** (canonical with 3 variants). [Add as variant] [Add as separate food]"

### Log entry / FoodSearch
- When logging, the food picker shows canonicals first, with "(N variants)" indicator. Tapping a canonical: if its current pantry has any variant in stock, the log entry uses that variant's macros; otherwise it uses the canonical's macros. The renderer handles this lookup right before insert.
- Variants still appear in search but are de-prioritized (ranked below canonicals of the same group).

---

## Behavior Rules

- **Logging a canonical**: at the moment of insert, the renderer queries pantry for any variant of that canonical with `quantity_g > 0`. If multiple, prefer the one most recently used (most recent log entry). The actual `log.food_id` becomes the chosen variant's id, so per-meal macros remain accurate. If no variant in pantry, log against the canonical id directly.
- **Logging a variant directly**: unchanged from today. User explicitly picked a specific brand.
- **Deleting a canonical that has variants**: ConfirmDialog warning — variants will be detached (their `group_id → NULL`, becoming solo foods). No log entries are touched.
- **Deleting a variant**: unchanged.
- **Editing a variant's macros**: optional auto-recompute of canonical averages, gated behind a checkbox in the edit modal ("Update group averages too").
- **Pantry stock**: per-variant; never per-canonical. Pantry-aware suggestions (from the Suggestions plan) consult variants.

---

## Analytics & Suggestions Roll-Up

Anywhere we group log entries by food for frequency/co-occurrence/streaks, switch the grouping key from `food_id` to `COALESCE(group_id, food_id)`. Affected queries:

- `foods:getFrequent` (existing)
- New `suggestions:*` queries from the other plan
- Combo detection (pair/triplet co-occurrence)
- Future: macro breakdown by category (uses `category` directly)

---

## Implementation Outline

### New files
- `main/lib/offCategoryMap.js` — single exported function `categoryFromOffTags(tags)`.
- `src/components/foods/CategoryFilter.tsx` — chip filter strip.
- `src/components/foods/GroupWithDialog.tsx` — picker for grouping a food as variant.
- `src/components/foods/SuggestedGroupings.tsx` — auto-detected dupe candidates section.

### Files to touch
- `main/db.js` — schema migrations (foods.category, foods.group_id, products.categories_tags).
- `main/ipc/foods.ipc.js` — accept/return `category` and `group_id`; new handlers `foods:groupAs`, `foods:ungroup`, `foods:recomputeGroupAverages`, `foods:findSimilar` (for on-add prompt and suggested-groupings).
- `main/ipc/openfoodfacts.ipc.js` — store `categories_tags` in cache, return it on lookups, derive category in `mapProduct`.
- `main/ipc/log.ipc.js` — when adding a log entry against a canonical, swap to a pantry variant if one exists.
- `main/ipc/analytics.ipc.js` — change groupings to `COALESCE(group_id, food_id)`.
- `src/api.ts` — wrappers for new handlers.
- `src/types.ts` — `Food` gains `category: FoodCategory` and `group_id?: number | null`. New `FoodCategory` union of the 12 slugs.
- `src/pages/FoodsPage.tsx` — category column, filter chips, group/ungroup actions, suggested-groupings section.
- `src/components/FoodFormModal.tsx` (or wherever the add/edit dialog lives) — category dropdown, "Add as variant of X" banner, "Recompute averages" button, "Update group averages" checkbox.
- `src/components/FoodSearch.tsx` — rank canonicals above variants of same group.
- `src/i18n/translations.ts` — EN + IT for all new strings (category labels, dialog copy, banner text).

### Build order

1. Schema migration + `category` field, default `'other'` everywhere. UI dropdown on add/edit. Foods page column + filter. (Categories work in isolation.)
2. OFF integration: cache `categories_tags`, derive category on barcode/search results, auto-fill on add. One-time backfill pass over existing foods with barcodes.
3. `group_id` schema + IPC (`groupAs`, `ungroup`, `recomputeGroupAverages`). Foods page UI for grouping + canonical/variant indicators.
4. On-add similarity banner + Suggested groupings section (uses `foods:findSimilar`).
5. Pantry-aware variant pick at log time. Test with the mushroom case end-to-end.
6. Analytics roll-up to `COALESCE(group_id, food_id)`.
7. Polish: IT translations, ConfirmDialog wiring on canonical-delete, restart-and-verify pass.

Each step ships independently; no step blocks logging from working.

---

## Open Questions / Risks

- **Average macros across variants of very different sizes**: if Coop's trifolati is 62 kcal but a future "Funghi Trifolati de luxe" version is 110 kcal, simple mean misleads. Mitigation: weight average by usage frequency (how often each variant has been logged), not equal weight. Document this on the Recompute button.
- **Canonical creation flow**: when grouping `A` with `B`, which one becomes canonical? Default rule: the one without a barcode (treat as "generic") wins; if both have or neither has barcode, the older food wins. UI lets user flip the choice before confirming.
- **OFF tag drift**: OFF tags change/expand over time. The map in `offCategoryMap.js` needs occasional review; unmatched products fall to `'other'` rather than crashing.
- **Foreign keys on `foods.group_id`**: SQLite doesn't enforce ON DELETE SET NULL unless `PRAGMA foreign_keys=ON` (already set in `getDb`). Confirm during migration.
