// ── Core data types ──────────────────────────────────────────────────────────

// Food shapes (semantic rules for piece_grams vs food_packages):
//   Shape A — the piece IS a sealed unit (egg, tuna can, cola can, mozzarella ball).
//     Each unit is physically independent. Model with ONE food_packages row per
//     size; piece_grams stays NULL. Adding N to pantry creates N separate batches.
//   Shape B — pieces share a container (2g Pringle in a 200g can; 25g bread slice
//     in a 500g loaf). Opening the container exposes all pieces at once. Model
//     with piece_grams = serving size AND a food_packages row for the container
//     (grams > piece_grams).
//   Shape C — just weight (oil, flour, rice). Neither piece_grams nor (necessarily)
//     packages. Bulk packages are fine but there are no discrete pieces.
//
// Migration v1 (main/db.js) enforces this by promoting any piece_grams-only food
// into a food_packages row.

export type Meal =
  | 'Breakfast'
  | 'MorningSnack'
  | 'Lunch'
  | 'AfternoonSnack'
  | 'Dinner'
  | 'EveningSnack'
  | 'NightSnack';

export const MEAL_ORDER: Meal[] = [
  'Breakfast', 'MorningSnack', 'Lunch', 'AfternoonSnack', 'Dinner', 'EveningSnack', 'NightSnack',
];

export const MAIN_MEALS: Meal[] = ['Breakfast', 'Lunch', 'Dinner'];

export type SupplementTime =
  | 'wake_up'
  | 'breakfast'
  | 'morning_snack'
  | 'lunch'
  | 'afternoon_snack'
  | 'dinner'
  | 'evening_snack'
  | 'night';

export const SUPPLEMENT_TIME_ORDER: SupplementTime[] = [
  'wake_up', 'breakfast', 'morning_snack', 'lunch',
  'afternoon_snack', 'dinner', 'evening_snack', 'night',
];

export interface FoodPackage {
  id: number;
  food_id: number;
  grams: number;
  price?: number | null;
}

export type FoodCategory =
  | 'vegetables' | 'fruit' | 'meat' | 'fish' | 'dairy' | 'eggs'
  | 'grains' | 'legumes' | 'nuts_seeds' | 'sweets' | 'beverages' | 'other';

export const FOOD_CATEGORIES: FoodCategory[] = [
  'vegetables', 'fruit', 'meat', 'fish', 'dairy', 'eggs',
  'grains', 'legumes', 'nuts_seeds', 'sweets', 'beverages', 'other',
];

export interface Food {
  id: number;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  piece_grams: number | null;
  is_liquid: number; // 0 or 1
  favorite?: number; // 0 or 1
  barcode?: string | null;
  packages?: FoodPackage[]; // attached by foods:getAll
  opened_days?: number | null;
  discard_threshold_pct?: number;
  price_per_100g?: number | null;
  is_bulk?: number; // 0 or 1 — Shape C (flour/rice/oil): default to grams when logging
  sugar?: number | null;          // g per 100g, optional
  saturated_fat?: number | null;  // g per 100g, optional
  sodium_mg?: number | null;      // mg per 100g, optional (display can convert to salt g)
  category?: FoodCategory;        // default 'other'
  group_id?: number | null;       // self-reference: variant points to canonical
  variant_count?: number;         // attached when this food is a canonical (read-only computed field)
}

export interface SimilarFood extends Food {
  nameScore: number;
  macroDeltaPct: number;
}

export interface FrequentFood extends Food {
  use_count: number;
}

export interface LogEntry {
  id: number;
  food_id: number;
  name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar?: number | null;
  saturated_fat?: number | null;
  sodium_mg?: number | null;
  /** Shared id across all log rows inserted from one recipe-log action. */
  recipe_log_id?: string | null;
  /** Snapshot of the recipe name at log time (recipe may be renamed/deleted later). */
  recipe_name?: string | null;
  meal: Meal;
  date: string;
  status: 'logged' | 'planned';
}

export interface Recipe {
  id: number;
  name: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar?: number | null;
  saturated_fat?: number | null;
  sodium_mg?: number | null;
  ingredient_count: number;
  ingredients?: RecipeIngredient[];
}

export interface RecipeIngredient {
  id: number;
  food_id: number;
  name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar?: number | null;
  saturated_fat?: number | null;
  sodium_mg?: number | null;
  editGrams?: number;
}

export interface Exercise {
  id: number;
  date: string;
  type: string;
  duration_min: number;
  calories_burned: number;
  notes: string | null;
  source: 'manual' | 'apple_health';
  sets?: ExerciseSet[];
}

export interface ExerciseSet {
  id: number;
  exercise_id: number;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
}

export interface ExerciseType {
  id: number;
  name: string;
  met_value: number;
  category: string;
  muscle_groups: string;
  equipment: string;
  instructions: string | null;
  is_custom: number;
}

export const MUSCLE_GROUPS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
  'quadriceps', 'hamstrings', 'glutes', 'calves', 'abs', 'obliques',
  'full_body',
] as const;

export const EQUIPMENT_OPTIONS = [
  'barbell', 'dumbbell', 'kettlebell', 'cable', 'machine',
  'pull_up_bar', 'bench', 'mat', 'resistance_band', 'bike',
  'jump_rope', 'rowing_machine', 'none',
] as const;

export const EXERCISE_CATEGORIES = ['cardio', 'strength', 'flexibility', 'other'] as const;

export interface Equipment {
  id: number;
  name: string;
  is_custom: number;
}

export interface WorkoutPlan {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  exercise_count: number;
  exercises?: WorkoutPlanExercise[];
}

export interface WorkoutPlanExercise {
  id: number;
  plan_id: number;
  exercise_type_id: number;
  exercise_name: string;
  exercise_category: string;
  sort_order: number;
  target_sets: number | null;
  target_reps: number | null;
  target_duration_min: number | null;
  target_weight_kg: number | null;
  rest_sec: number | null;
  is_optional: number;
  superset_group: number | null;
  notes: string | null;
}

export interface WorkoutPlanExerciseInput {
  exercise_type_id: number;
  sort_order: number;
  target_sets?: number;
  target_reps?: number;
  target_duration_min?: number;
  target_weight_kg?: number;
  rest_sec?: number;
  is_optional?: boolean;
  superset_group?: number;
  notes?: string;
}

export type WorkoutStatus = 'planned' | 'done' | 'skipped' | 'rest';

export interface WorkoutScheduleEntry {
  id: number;
  date: string;
  plan_id: number | null;
  plan_name: string | null;
  status: WorkoutStatus;
  notes: string | null;
}

export interface WorkoutScheduleDay {
  date: string;
  entries: WorkoutScheduleEntry[];
  exercises_logged: number;
}

export interface ActualRecipe {
  id: number;
  name: string;
  description: string | null;
  yield_g: number;
  notes: string | null;
  prep_time_min: number;
  cook_time_min: number;
  tools: string | null;
  procedure: string | null;
  created_at: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  total_fiber: number;
  total_sugar?: number | null;
  total_saturated_fat?: number | null;
  total_sodium_mg?: number | null;
  ingredient_count: number;
  ingredients?: ActualRecipeIngredient[];
}

export interface ActualRecipeIngredient {
  id: number;
  food_id: number;
  name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar?: number | null;
  saturated_fat?: number | null;
  sodium_mg?: number | null;
}

export interface Settings {
  cal_min: number;
  cal_max: number;
  cal_rec: number;
  protein_min: number;
  protein_max: number;
  protein_rec: number;
  carbs_min: number;
  carbs_max: number;
  carbs_rec: number;
  fat_min: number;
  fat_max: number;
  fat_rec: number;
  fiber_min: number;
  fiber_max: number;
  fiber_rec: number;
  weight_goal: number;
  water_goal: number;
  tol_1: number;
  tol_2: number;
  tol_3: number;
  language: 'en' | 'it';
  theme: 'dark' | 'light';
  pantry_enabled: number;    // 0 or 1
  pantry_warn_days: number;  // default 3
  pantry_urgent_days: number; // default 1
  /** Master toggle for the "add to shopping list?" prompt that appears when a pack is finished. */
  shopping_prompt_enabled: number;
  /** Maximum packs-remaining-after-deletion that still triggers the prompt.
   *  0 = only on the very last pack; 1 = last or second-to-last; 99 = always. */
  shopping_prompt_threshold: number;
  currency_symbol: string;   // default '€'
  // notification toggles (0 or 1)
  notif_pantry_expiry: number;
  notif_low_pantry: number;
  notif_missing_log: number;
  notif_missing_energy: number;
  notif_weight: number;
  notif_weight_warn_days: number;   // default 3
  notif_weight_urgent_days: number; // default 7
  // extra nutrition (sugar / saturated fat / sodium)
  track_extra_nutrition: number;          // 0 or 1
  extra_nutrition_unit: 'sodium' | 'salt'; // display unit
  off_country: string;                    // OFF subdomain code: 'world' | 'it' | 'us' | …
  // Local OFF mirror
  off_local_enabled: number;              // 0 or 1; flips to 1 after first successful import
  off_local_last_synced: string;          // ISO date string of last successful import
  off_disable_online: number;             // 0 or 1; when 1, skip the live API fallback entirely
}

export interface OffLocalStatus {
  initialized: boolean;
  sizeBytes: number;
  productCount: number;
  lastSynced: string;
}

export interface OffImportProgress {
  stage: 'downloading' | 'parsing' | 'indexing' | 'done' | 'error' | 'cancelled';
  bytesRead: number;
  totalBytes: number | null;
  rowsParsed: number;
  rowsKept: number;
  rowsSkipped: number;
  message?: string;
}

export interface WeightEntry {
  id: number;
  date: string;
  weight: number;
  fat_pct: number | null;
  muscle_mass: number | null;
  water_pct: number | null;
  bone_mass: number | null;
  scale_id: number | null;
  scale_name: string | null;
}

export interface Scale {
  id: number;
  name: string;
  is_default: number; // 0 or 1
}

export interface WaterEntry {
  id: number;
  date: string;
  ml: number;
  source: string;
  log_id: number | null;
}

export interface WaterDay {
  total_ml: number;
  entries: WaterEntry[];
}

export interface DailyNote {
  date: string;
  note: string;
}

export interface Streak {
  current: number;
  best: number;
}

export interface Supplement {
  id: number;
  name: string;
  description?: string | null;
}

export interface SupplementPlan {
  id: number;
  effective_from: string;
}

export interface SupplementPlanItem {
  id: number;
  plan_id: number;
  supplement_id: number;
  name: string;
  qty: number;
  unit: string;
  notes: string;
  time_of_day: SupplementTime;
}

export interface SupplementPlanWithItems {
  plan: SupplementPlan;
  items: SupplementPlanItem[];
}

export interface SupplementDay {
  id: number;
  name: string;
  qty: number;
  unit: string;
  time_of_day: SupplementTime;
  taken: number;
}

export interface SupplementAdherence {
  id: number;
  name: string;
  qty: number;
  unit: string;
  daysExpected: number;
  daysTaken: number;
  adherencePct: number;
  logs: { date: string; count: number; effectiveQty: number }[];
}

export interface Measurement {
  id: number;
  date: string;
  waist: number | null;
  chest: number | null;
  arms: number | null;
  thighs: number | null;
  hips: number | null;
  neck: number | null;
}

export interface WeeklySummary {
  week_start: string;
  avg_calories: number;
  avg_protein: number;
  avg_carbs: number;
  avg_fat: number;
  avg_fiber: number;
  days_logged: number;
}

export interface WeekDayDetail {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  planned_calories: number;
  planned_protein: number;
  planned_carbs: number;
  planned_fat: number;
  planned_fiber: number;
}

export interface PantryLocation {
  id: number;
  name: string;
  is_default: number; // 0 or 1
}

export interface PantryItem {
  id: number;
  food_id: number;
  food_name: string;
  piece_grams: number | null;
  quantity_g: number;
  expiry_date: string | null; // ISO yyyy-mm-dd
  updated_at: string;
  package_id: number | null;
  package_grams: number | null; // denormalized from food_packages join
  opened_at: string | null;
  opened_days: number | null;
  starting_grams: number | null;
  pantry_id: number;
}

export type DeductionEvent =
  | { kind: 'opened'; batch_id: number; food_id: number; food_name: string; default_days: number | null; pantry_id?: number }
  | { kind: 'residual_or_new'; food_id: number; food_name: string; overflow_g: number; next_batch_id: number | null; pantry_id?: number }
  | { kind: 'near_empty'; batch_id: number; food_id: number; food_name: string; remaining_g: number; starting_g: number; pantry_id?: number }
  | { kind: 'finished'; batch_id: number; food_id: number; food_name: string; pantry_id?: number; remaining_packs?: number };

export interface PantryAggregate {
  food_id: number;
  food_name: string;
  piece_grams: number | null;
  total_g: number;
  earliest_expiry: string | null;
  batches: PantryItem[];
  pack_breakdown: { grams: number; count: number }[];
}

export interface PantryIngredientCheck {
  food_id: number;
  food_name: string;
  need_g: number;
  have_g: number;
}

export interface ShoppingItem {
  id: number;
  food_id: number;
  food_name: string;
  quantity_g: number;
  checked: number; // 0 or 1
  pantry_id: number;
}

export interface DailyEnergy {
  date: string;
  resting_kcal: number;
  active_kcal: number;
  extra_kcal: number;
  steps: number;
  distance_km: number;
}

export interface CalorieTrendPoint {
  date: string;
  calories_in: number;
  calories_out: number;
  resting_kcal: number;
  active_kcal: number;
  extra_kcal: number;
  steps: number;
  net: number;
}

export interface MacroTrendPoint {
  date: string;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface ExerciseTrendPoint {
  date: string;
  count: number;
  total_min: number;
  total_burned: number;
}

// ── Stats bundle (analytics:stats) ───────────────────────────────────────────

export interface StatsCompliance { hit: number; total: number; pct: number; }

export interface StatsTopFood {
  food_id: number;
  name: string;
  count: number;
  total_g: number;
  total_kcal: number;
}

export interface StatsMealSlice {
  meal: Meal;
  kcal: number;
  avg_kcal: number;
  pct: number;
  items: number;
}

export interface StatsBodyPoint {
  date: string;
  weight: number;
  fat_pct: number | null;
  lean_kg: number | null;
  muscle_mass: number | null;
}

export interface StatsHeatmapDay {
  date: string;
  kcal: number;
  has_food: 0 | 1;
  has_energy: 0 | 1;
  has_weight: 0 | 1;
  has_exercise: 0 | 1;
}

export interface StatsDow {
  dow: number;
  avg_kcal: number;
  avg_burned: number;
  avg_steps: number;
  sessions: number;
}

export interface StatsBundle {
  range: { days: number; start_date: string; end_date: string; is_all: boolean };
  summary: {
    days_with_food: number;
    days_with_energy: number;
    days_with_weight: number;
    total_kcal_logged: number;
    total_kcal_burned: number;
    avg_kcal_per_day: number;
    avg_protein_per_day: number;
    avg_carbs_per_day: number;
    avg_fat_per_day: number;
    avg_fiber_per_day: number;
    avg_kcal_out_per_day: number;
    avg_net_per_day: number | null;
    current_streak: number;
    best_streak: number;
  };
  compliance: {
    calories: StatsCompliance;
    protein:  StatsCompliance;
    carbs:    StatsCompliance;
    fat:      StatsCompliance;
    fiber:    StatsCompliance;
  };
  macroSplit: {
    protein_pct: number;
    carbs_pct: number;
    fat_pct: number;
    protein_g_per_kg_bw: number | null;
    body_weight_kg: number | null;
  };
  micros: { date: string; sugar: number; saturated_fat: number; sodium_mg: number }[];
  caloriesByDay: { date: string; kcal: number; protein: number; carbs: number; fat: number; fiber: number }[];
  topFoodsByFreq: StatsTopFood[];
  topFoodsByKcal: StatsTopFood[];
  mealDistribution: StatsMealSlice[];
  body: {
    weight_first: number | null;
    weight_last: number | null;
    weight_delta: number | null;
    fat_first: number | null;
    fat_last: number | null;
    fat_delta: number | null;
    lean_first: number | null;
    lean_last: number | null;
    lean_delta: number | null;
    weekly_rate_kg: number;
    goal_weight: number | null;
    goal_eta_days: number | null;
    points: StatsBodyPoint[];
    meas_first: Measurement | null;
    meas_last: Measurement | null;
  };
  training: {
    sessions: number;
    total_minutes: number;
    total_burned: number;
    by_category: { category: string; sessions: number; minutes: number; burned: number }[];
    by_muscle:   { muscle: string; sets: number; total_volume_kg: number }[];
    top_exercises: {
      name: string;
      sessions: number;
      total_minutes: number;
      total_burned: number;
      total_volume_kg: number;
    }[];
    longest_session: { date: string; type: string; duration_min: number; calories_burned: number } | null;
    plan_done_pct: number | null;
  };
  activity: {
    avg_steps: number;
    total_steps: number;
    max_steps_day: { date: string; steps: number } | null;
    avg_distance_km: number;
    total_distance_km: number;
    avg_active_kcal: number;
    total_active_kcal: number;
    avg_resting_kcal: number;
    avg_extra_kcal: number;
    total_extra_kcal: number;
    points: { date: string; steps: number; distance_km: number; active_kcal: number; resting_kcal: number; extra_kcal: number }[];
  };
  heatmap: StatsHeatmapDay[];
  dayOfWeek: StatsDow[];
  records: {
    biggest_kcal_day: { date: string; kcal: number } | null;
    smallest_kcal_day: { date: string; kcal: number } | null;
    most_steps_day: { date: string; steps: number } | null;
    most_burned_day: { date: string; kcal: number } | null;
    longest_session: { date: string; type: string; duration_min: number; calories_burned: number } | null;
    heaviest_set: { date: string; type: string; weight_kg: number; reps: number } | null;
    longest_run: { date: string; type: string; duration_min: number } | null;
    most_water_day: { date: string; ml: number } | null;
    biggest_weight_drop: { drop_kg: number; from: { date: string; weight: number }; to: { date: string; weight: number } } | null;
    best_streak: number;
    total_kcal_tracked: number;
    total_workouts: number;
    total_distance_km: number;
    total_steps: number;
    total_water_ml: number;
    days_logged_alltime: number;
  };
}

export type StatsRange = 7 | 30 | 90 | 180 | 365 | 'all';

export interface MealTemplateSummary {
  id: number;
  name: string;
  item_count: number;
  total_calories: number | null;
}

export interface MealTemplateItem {
  id: number;
  food_id: number;
  grams: number;
  meal: Meal;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface MealTemplate {
  id: number;
  name: string;
  items: MealTemplateItem[];
}

export interface SuggestionFood extends Food {
  last_date?: string;
  total_count?: number;
  total_in_pantry_g?: number;
}

export interface SuggestionCombo {
  cnt: number;
  a: Food;
  b: Food;
}

export interface FoodAuditRow {
  id: number;
  name: string;
  category: FoodCategory;
  group_id: number | null;
  calories: number;
  is_variant: boolean;
  missing: string[];
}

export interface SuggestionsBundle {
  slot: Meal;
  forgottenFavorites: SuggestionFood[];
  triedFew: SuggestionFood[];
  rotationGap: SuggestionFood[];
  combos: SuggestionCombo[];
  fromPantry: SuggestionFood[];
  neverTried: SuggestionFood[];
}

export type GoalType = 'lose' | 'maintain' | 'gain' | 'custom';

export interface TDEEResult {
  tdee: number | null;
  confidence: 'low' | 'medium' | 'high';
  data_points: number;
}

export interface GoalSuggestion {
  cal_rec: number;
  cal_min: number;
  cal_max: number;
  protein_rec: number;
  rate_per_week_kg: number;
}

export interface GoalPlan {
  id: number;
  effective_from: string;
  label: string;
  notes: string;
  goal_type: GoalType;
  cal_min: number | null;
  cal_rec: number | null;
  cal_max: number | null;
  protein_min: number | null;
  protein_rec: number | null;
  protein_max: number | null;
  carbs_min: number | null;
  carbs_rec: number | null;
  carbs_max: number | null;
  fat_min: number | null;
  fat_rec: number | null;
  fat_max: number | null;
  fiber_min: number | null;
  fiber_rec: number | null;
  fiber_max: number | null;
  weight_goal: number | null;
  water_goal: number | null;
  tol_1: number | null;
  tol_2: number | null;
  tol_3: number | null;
  created_at: string;
}

export type GoalPlanInput = Partial<Omit<GoalPlan, 'id' | 'created_at'>> & { effective_from: string };

export interface BarcodeResult {
  name: string;
  name_en?: string;
  name_it?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  is_liquid: number;
  pack_grams?: number | null;
  sugar?: number | null;
  saturated_fat?: number | null;
  sodium_mg?: number | null;
  barcode?: string;
  brand?: string;
  categories_tags?: string;
  category?: FoodCategory;
}

// ── Page navigation ──────────────────────────────────────────────────────────

export type PageName =
  | 'dashboard'
  | 'exercise'
  | 'net'
  | 'foods'
  | 'compare'
  | 'pantry'
  | 'recipes'
  | 'history'
  | 'stats'
  | 'week'
  | 'day'
  | 'plan'
  | 'suggestions'
  | 'weight'
  | 'supplements'
  | 'measurements'
  | 'goals'
  | 'data'
  | 'notifications'
  | 'settings';

export type NotificationType =
  | 'pantry_expiry'
  | 'pantry_opened'
  | 'missing_log'
  | 'missing_active_energy'
  | 'low_pantry'
  | 'missing_weight';

export type NotificationSeverity = 'info' | 'warn' | 'urgent';

export interface AppNotification {
  key: string;
  type: NotificationType;
  severity: NotificationSeverity;
  payload: Record<string, string | number | null>;
  action?: { page: PageName; params?: Record<string, string> };
  created_at: string;
}

export interface DismissedNotification {
  key: string;
  dismissed_at: string;
  expires_at: string | null;
}

export interface NavParam {
  weekStart?: string;
  date?: string;
  fromWeek?: string;
}
