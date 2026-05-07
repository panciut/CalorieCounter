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
  | 'EveningSnack';

export const MEAL_ORDER: Meal[] = [
  'Breakfast', 'MorningSnack', 'Lunch', 'AfternoonSnack', 'Dinner', 'EveningSnack',
];

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
  image_url?: string | null;
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
  currency_symbol: string;   // default '€'
  // notification toggles (0 or 1)
  notif_pantry_expiry: number;
  notif_low_pantry: number;
  notif_missing_log: number;
  notif_missing_energy: number;
  notif_weight: number;
  notif_weight_warn_days: number;   // default 3
  notif_weight_urgent_days: number; // default 7
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

export interface SleepEntry {
  id: number;
  date: string;
  bedtime: string | null;
  wake_time: string | null;
  duration_min: number | null;
  quality: number | null;
  factors: string | null; // JSON string array
  note: string | null;
  created_at: string;
}

export interface SleepTrendPoint {
  date: string;
  duration_min: number | null;
  quality: number | null;
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
  | { kind: 'finished'; batch_id: number; food_id: number; food_name: string; pantry_id?: number };

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

export type GoalType = 'lose' | 'maintain' | 'gain';

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
  image_url?: string | null;
}

export interface BarcodeSearchResult extends BarcodeResult {
  barcode?: string;
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
  | 'week'
  | 'day'
  | 'weight'
  | 'supplements'
  | 'measurements'
  | 'goals'
  | 'data'
  | 'notifications'
  | 'settings'
  | 'sleep'
  | 'tasks'
  | 'habits'
  | 'focus'
  | 'journal'
  | 'achievements';

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

export interface Task {
  id: number;
  date: string;
  title: string;
  done: number; // 0 or 1
  priority: number; // 0=low 1=medium 2=high
  estimate_min: number | null;
  project: string | null;
  order_idx: number;
  created_at: string;
  done_at: string | null;
}

export interface TaskCompletionRate {
  total: number;
  done: number;
  rate: number; // 0-1
}

export interface NavParam {
  weekStart?: string;
  date?: string;
  fromWeek?: string;
}

// ── Habits ────────────────────────────────────────────────────────────────────

export interface Habit {
  id: number;
  name: string;
  icon: string;
  color: string;
  target_per_week: number;
  archived: number; // 0 or 1
  created_at: string;
}

export interface HabitLog {
  id: number;
  habit_id: number;
  date: string;
  value: number;
}

export interface HabitWeekStat {
  habit_id: number;
  checks: { date: string; done: boolean }[];
}

// ── Focus / Pomodoro ──────────────────────────────────────────────────────────

export interface FocusSession {
  id: number;
  date: string;
  started_at: string;
  ended_at: string | null;
  duration_min: number;
  type: 'pomodoro' | 'manual';
  project: string | null;
  note: string | null;
  completed: number; // 0 or 1
  created_at: string;
}

// ── Journal / Mood ────────────────────────────────────────────────────────────

export interface MoodEntry {
  id: number;
  date: string;
  mood: number | null;
  energy: number | null;
  stress: number | null;
  note: string | null;
  created_at: string;
}

export interface MoodTrendPoint {
  date: string;
  mood: number | null;
  energy: number | null;
  stress: number | null;
}

export interface FocusDayStats {
  sessions: FocusSession[];
  total_min: number;
  total_sessions: number;
  completed_sessions: number;
}

export interface FocusWeekPoint {
  date: string;
  total_min: number;
  sessions: number;
}

// ── Workout sessions ──────────────────────────────────────────────────────────

export interface WorkoutSession {
  id: number;
  date: string;
  plan_id: number | null;
  started_at: string | null;
  ended_at: string | null;
  duration_min: number | null;
  calories_burned: number | null;
  perceived_effort: number | null; // 1-10
  note: string | null;
  created_at: string;
  sets?: WorkoutExerciseSet[];
}

export interface WorkoutExerciseSet {
  id: number;
  session_id: number;
  exercise_id: number | null;
  set_idx: number;
  reps: number | null;
  weight_kg: number | null;
  distance_km: number | null;
  duration_sec: number | null;
  rest_sec: number | null;
}

export interface WorkoutWeekPoint {
  date: string;
  duration_min: number;
  calories_burned: number;
  sessions: number;
}

// ── Gamification ──────────────────────────────────────────────────────────────

export interface Achievement {
  id: number;
  key: string;
  name: string;
  description: string;
  icon: string;
  unlocked_at: string | null;
}

export interface UserLevel {
  id: number;
  total_points: number;
  level: number;
  level_name: string;
  streak_days: number;
  last_activity_date: string | null;
  today_points: number;
  next_level_min: number | null;
  recent_achievements: Achievement[];
}

export interface PointEvent {
  date: string;
  total_points: number;
  reasons: string;
}
