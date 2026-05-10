-- One-shot auto-classification of categories + grouping of clear brand-variant
-- duplicates. Safe to re-run: only sets values that were 'other' / NULL.

BEGIN TRANSACTION;

-- ── Categories ──────────────────────────────────────────────────────────────

-- vegetables
UPDATE foods SET category='vegetables' WHERE id IN (
  152, 136, 159, 92, 125, 150, 148, 145, 147, 120, 128, 129, 61,
  52, 65, 153, 134, 155, 76, 174, 62, 25, 66,
  139, 122, 126, 127, 80, 124, 123, 35, 58, 119, 118,
  156, 132, 82, 141, 135, 57, 133, 143, 39, 138, 121, 157, 54
) AND category='other';

-- fruit
UPDATE foods SET category='fruit' WHERE id IN (
  108, 111, 112, 97, 117, 37, 115, 106, 114, 102,
  110, 103, 99, 98, 94, 116, 113, 104, 105, 95, 107, 109, 101
) AND category='other';

-- meat
UPDATE foods SET category='meat' WHERE id IN (
  19, 41, 45, 176, 164, 79, 83, 77
) AND category='other';

-- fish
UPDATE foods SET category='fish' WHERE id IN (53, 51) AND category='other';

-- dairy
UPDATE foods SET category='dairy' WHERE id IN (
  24, 42, 27, 18, 78, 175, 48, 26, 22
) AND category='other';

-- eggs
UPDATE foods SET category='eggs' WHERE id IN (38) AND category='other';

-- grains
UPDATE foods SET category='grains' WHERE id IN (
  16, 23, 33, 64, 85, 43, 44, 183, 91, 56, 21, 20
) AND category='other';

-- legumes
UPDATE foods SET category='legumes' WHERE id IN (30, 180, 55) AND category='other';

-- nuts_seeds
UPDATE foods SET category='nuts_seeds' WHERE id IN (36, 81, 163, 182) AND category='other';

-- sweets
UPDATE foods SET category='sweets' WHERE id IN (
  171, 172, 28, 63, 178, 184
) AND category='other';

-- beverages
UPDATE foods SET category='beverages' WHERE id IN (
  167, 181, 166, 165, 169, 168, 50, 170, 49, 29, 173, 177, 93, 179
) AND category='other';

-- (everything not touched stays 'other': sauces, ketchup, oil, etc.)

-- ── Groupings ───────────────────────────────────────────────────────────────

-- Funghi Trifolati Champignon: canonical = 25 (Coop, oldest among trifolati),
-- variants: 66 (Lidl), 174 (Logro Champignon Trifolati).
UPDATE foods SET group_id = 25 WHERE id IN (66, 174) AND group_id IS NULL;

-- CocaCola Zero family: 49 (CocaCola Zero Zero) and 170 (CocaCola Zero) share
-- the same barcode (5000112579581) — clearly the same product imported twice.
-- Canonical = 49 (older id), variant = 170.
UPDATE foods SET group_id = 49 WHERE id = 170 AND group_id IS NULL;

COMMIT;
