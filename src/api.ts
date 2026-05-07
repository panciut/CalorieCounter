import type {
  Food, FoodPackage, FrequentFood, LogEntry, Meal, Recipe, ActualRecipe, Exercise, ExerciseType, Settings,
  WeightEntry, WaterDay, WaterEntry, DailyNote, Streak,
  Supplement, SupplementDay, SupplementAdherence,
  SupplementPlanWithItems,
  Measurement,
  WeeklySummary, WeekDayDetail, BarcodeResult, BarcodeSearchResult,
  PantryItem, PantryAggregate, PantryLocation, ShoppingItem, PantryIngredientCheck,
  Scale,
  CalorieTrendPoint, MacroTrendPoint, ExerciseTrendPoint,
  GoalType, TDEEResult, GoalSuggestion, DailyEnergy,
  DeductionEvent,
  AppNotification, DismissedNotification,
  SleepEntry, SleepTrendPoint,
  Task, TaskCompletionRate,
  Habit, HabitWeekStat,
  FocusSession, FocusDayStats, FocusWeekPoint,
  MoodEntry, MoodTrendPoint,
  WorkoutSession, WorkoutExerciseSet, WorkoutWeekPoint,
  Achievement, UserLevel, PointEvent,
  SectionStreak,
} from './types';

// Re-export for consumers that need it
export type { PantryAggregate };

// ── Electron IPC bridge ──────────────────────────────────────────────────────

declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      on:     (channel: string, cb: (...args: unknown[]) => void) => void;
      off:    (channel: string) => void;
    };
  }
}

function invoke<T>(channel: string, data?: unknown): Promise<T> {
  return window.electronAPI.invoke(channel, data) as Promise<T>;
}

// ── API ──────────────────────────────────────────────────────────────────────

export const api = {
  foods: {
    getAll:         () => invoke<Food[]>('foods:getAll'),
    getFavorites:   () => invoke<Food[]>('foods:getFavorites'),
    add:            (data: Omit<Food, 'id'>) => invoke<{ id: number }>('foods:add', data),
    delete:         (id: number) => invoke<{ ok: boolean }>('foods:delete', { id }),
    update:         (data: Food) => invoke<{ ok: boolean }>('foods:update', data),
    getFrequent:    (limit: number) => invoke<FrequentFood[]>('foods:getFrequent', { limit }),
    toggleFavorite: (id: number) => invoke<{ favorite: boolean }>('foods:toggleFavorite', { id }),
    addPackage:     (data: { food_id: number; grams: number; price?: number | null }) => invoke<{ id: number }>('foods:addPackage', data),
    updatePackage:  (data: { id: number; grams: number; price?: number | null }) => invoke<{ ok: boolean; error?: string; batch_count?: number }>('foods:updatePackage', data),
    deletePackage:  (id: number) => invoke<{ ok: boolean; error?: string; batch_count?: number }>('foods:deletePackage', { id }),
  },

  log: {
    getDay:             (date: string) => invoke<LogEntry[]>('log:getDay', { date }),
    add:                (data: { food_id: number; grams: number; meal: Meal; date: string; status?: 'logged' | 'planned'; pantry_id?: number }) =>
                          invoke<{ id: number; shortage: number; shortage_food: string | null; events: DeductionEvent[] }>('log:add', data),
    addQuick:           (data: { food: Omit<Food, 'id'>; grams: number; meal: Meal; date: string }) =>
                          invoke<{ id: number; food_id: number; shortage: number }>('log:addQuick', data),
    update:             (data: { id: number; food_id: number; grams: number; meal: Meal }) =>
                          invoke<{ ok: boolean }>('log:update', data),
    delete:             (id: number) => invoke<{ ok: boolean }>('log:delete', { id }),
    getPlanned:         (date: string) => invoke<LogEntry[]>('log:getPlanned', { date }),
    confirmPlanned:     (data: { id: number; pantry_id?: number }) => invoke<{ ok: boolean; shortage: number; shortage_food: string; events: DeductionEvent[] }>('log:confirmPlanned', data),
    confirmAllPlanned:  (data: { date: string; pantry_id?: number }) => invoke<{ ok: boolean; shortages: { food_name: string; shortage: number }[]; events: DeductionEvent[] }>('log:confirmAllPlanned', data),
    swapLunchDinner:    (date: string) => invoke<{ ok: boolean }>('log:swapLunchDinner', { date }),
    swapDays:           (data: { dateA: string; dateB: string }) =>
                          invoke<{ ok: boolean; swapped: number }>('log:swapDays', data),
    getWeeklySummaries: () => invoke<WeeklySummary[]>('log:getWeeklySummaries'),
    getWeekDetail:      (weekStart: string) => invoke<WeekDayDetail[]>('log:getWeekDetail', { weekStart }),
  },

  recipes: {
    getAll:            () => invoke<Recipe[]>('recipes:getAll'),
    get:               (id: number) => invoke<Recipe>('recipes:get', { id }),
    create:            (data: { name: string; description: string; ingredients: { food_id: number; grams: number }[] }) =>
                         invoke<{ id: number }>('recipes:create', data),
    delete:            (id: number) => invoke<{ ok: boolean }>('recipes:delete', { id }),
    log:               (data: { recipe_id: number; date: string; meal: Meal; scale?: number }) =>
                         invoke<{ ok: boolean }>('recipes:log', data),
    updateIngredients: (data: { id: number; ingredients: { food_id: number; grams: number }[] }) =>
                         invoke<{ ok: boolean }>('recipes:updateIngredients', data),
  },

  exercises: {
    getDay:     (date: string) => invoke<Exercise[]>('exercises:getDay', { date }),
    getRange:   (startDate: string, endDate: string) => invoke<Exercise[]>('exercises:getRange', { startDate, endDate }),
    add:        (data: { date: string; type: string; duration_min: number; calories_burned: number; notes?: string; sets?: { reps?: number; weight_kg?: number }[] }) =>
                  invoke<{ id: number }>('exercises:add', data),
    update:     (data: { id: number; type: string; duration_min: number; calories_burned: number; notes?: string }) =>
                  invoke<{ ok: boolean }>('exercises:update', data),
    delete:     (id: number) => invoke<{ ok: boolean }>('exercises:delete', { id }),
    getTypes:   () => invoke<ExerciseType[]>('exercises:getTypes'),
    addType:    (data: { name: string; met_value: number; category: string; muscle_groups?: string; equipment?: string; instructions?: string }) => invoke<{ id: number }>('exercises:addType', data),
    updateType: (data: { id: number; name: string; met_value: number; category: string; muscle_groups: string; equipment: string; instructions?: string }) => invoke<{ ok: boolean }>('exercises:updateType', data),
    deleteType:      (id: number) => invoke<{ ok: boolean; reason?: string }>('exercises:deleteType', { id }),
    estimate:        (data: { type: string; duration_min: number; weight_kg: number }) => invoke<{ calories: number }>('exercises:estimate', data),
    getEquipment:    () => invoke<import('./types').Equipment[]>('exercises:getEquipment'),
    addEquipment:    (data: { name: string }) => invoke<{ id: number }>('exercises:addEquipment', data),
    deleteEquipment: (id: number) => invoke<{ ok: boolean; reason?: string }>('exercises:deleteEquipment', { id }),
  },

  workoutPlans: {
    getAll:    () => invoke<import('./types').WorkoutPlan[]>('workoutPlans:getAll'),
    get:       (id: number) => invoke<import('./types').WorkoutPlan>('workoutPlans:get', { id }),
    create:    (data: { name: string; description?: string; exercises: import('./types').WorkoutPlanExerciseInput[] }) => invoke<{ id: number }>('workoutPlans:create', data),
    update:    (data: { id: number; name: string; description?: string; exercises: import('./types').WorkoutPlanExerciseInput[] }) => invoke<{ ok: boolean }>('workoutPlans:update', data),
    delete:    (id: number) => invoke<{ ok: boolean }>('workoutPlans:delete', { id }),
    duplicate: (id: number) => invoke<{ id: number }>('workoutPlans:duplicate', { id }),
  },

  workoutSchedule: {
    getWeek:   (weekStart: string) => invoke<import('./types').WorkoutScheduleDay[]>('workoutSchedule:getWeek', { weekStart }),
    getDay:    (date: string) => invoke<import('./types').WorkoutScheduleEntry[]>('workoutSchedule:getDay', { date }),
    assign:    (data: { date: string; plan_id: number }) => invoke<{ id: number; ok: boolean }>('workoutSchedule:assign', data),
    setRest:   (date: string) => invoke<{ id: number; ok: boolean }>('workoutSchedule:setRest', { date }),
    clear:     (id: number) => invoke<{ ok: boolean }>('workoutSchedule:clear', { id }),
    setStatus: (data: { id: number; status: string }) => invoke<{ ok: boolean }>('workoutSchedule:setStatus', data),
    move:      (data: { id: number; toDate: string }) => invoke<{ ok: boolean }>('workoutSchedule:move', data),
    swap:      (data: { idA: number; idB: number }) => invoke<{ ok: boolean }>('workoutSchedule:swap', data),
  },

  actualRecipes: {
    getAll:            () => invoke<ActualRecipe[]>('actualRecipes:getAll'),
    get:               (id: number) => invoke<ActualRecipe>('actualRecipes:get', { id }),
    create:            (data: { name: string; description: string; yield_g: number; notes: string; prep_time_min: number; cook_time_min: number; tools: string; procedure: string; ingredients: { food_id: number; grams: number }[] }) =>
                         invoke<{ id: number }>('actualRecipes:create', data),
    update:            (data: { id: number; name: string; description: string; yield_g: number; notes: string; prep_time_min: number; cook_time_min: number; tools: string; procedure: string }) =>
                         invoke<{ ok: boolean }>('actualRecipes:update', data),
    updateIngredients: (data: { id: number; ingredients: { food_id: number; grams: number }[] }) =>
                         invoke<{ ok: boolean }>('actualRecipes:updateIngredients', data),
    delete:            (id: number) => invoke<{ ok: boolean }>('actualRecipes:delete', { id }),
    log:               (data: { recipe_id: number; grams_eaten: number; meal: Meal; date: string }) =>
                         invoke<{ ok: boolean }>('actualRecipes:log', data),
  },

  water: {
    getDay: (date: string) => invoke<WaterDay>('water:getDay', { date }),
    add:    (data: { date: string; ml: number; source: string }) => invoke<{ ok: boolean }>('water:add', data),
    delete: (id: number) => invoke<{ ok: boolean }>('water:delete', { id }),
  },

  weight: {
    getAll: () => invoke<WeightEntry[]>('weight:getAll'),
    add:    (data: { weight: number; date: string; fat_pct?: number | null; muscle_mass?: number | null; water_pct?: number | null; bone_mass?: number | null; scale_id?: number | null }) => invoke<{ ok: boolean }>('weight:add', data),
    update: (data: { id: number; weight: number; date: string; fat_pct?: number | null; muscle_mass?: number | null; water_pct?: number | null; bone_mass?: number | null; scale_id?: number | null }) => invoke<{ ok: boolean; reason?: string }>('weight:update', data),
    delete: (id: number) => invoke<{ ok: boolean }>('weight:delete', { id }),
  },

  scales: {
    getAll:     () => invoke<Scale[]>('scales:getAll'),
    create:     (name: string) => invoke<{ id: number }>('scales:create', { name }),
    rename:     (id: number, name: string) => invoke<{ ok: boolean }>('scales:rename', { id, name }),
    delete:     (id: number) => invoke<{ ok: boolean; reason?: string }>('scales:delete', { id }),
    setDefault: (id: number) => invoke<{ ok: boolean }>('scales:setDefault', { id }),
  },

  barcode: {
    lookup: (barcode: string) => invoke<BarcodeResult | null>('barcode:lookup', { barcode }),
    search: (query: string) => invoke<BarcodeSearchResult[]>('barcode:search', { query }),
  },

  customDb: {
    selectFile:  () => invoke<string | null>('customdb:selectFile'),
    setPath:     (filePath: string | null) => invoke<{ ok: boolean; error?: string }>('customdb:setPath', { filePath }),
    getStatus:   () => invoke<{ path: string | null; status: 'none' | 'ok' | 'error'; error?: string; table?: string; rows?: number }>('customdb:getStatus'),
  },

  streaks: {
    get: () => invoke<Streak>('streaks:get'),
  },

  notes: {
    get:  (date: string) => invoke<DailyNote>('notes:get', { date }),
    save: (data: { date: string; note: string }) => invoke<{ ok: boolean }>('notes:save', data),
  },

  supplements: {
    getAll:       () => invoke<Supplement[]>('supplements:getAll'),
    add:          (data: { name: string; description?: string }) => invoke<{ id: number }>('supplements:add', data),
    update:       (data: { id: number; name: string; description?: string }) => invoke<{ ok: boolean }>('supplements:update', data),
    delete:       (id: number) => invoke<{ ok: boolean; reason?: string }>('supplements:delete', { id }),
    getDay:       (date: string) => invoke<SupplementDay[]>('supplements:getDay', { date }),
    take:         (data: { supplement_id: number; date: string }) => invoke<{ taken: number }>('supplements:take', data),
    getAdherence: (days: number) => invoke<SupplementAdherence[]>('supplements:getAdherence', { days }),
  },

  supplementPlan: {
    getCurrent: () => invoke<SupplementPlanWithItems | null>('supplementPlan:getCurrent'),
    save:       (data: { items: { supplement_id: number; qty: number; unit: string; notes: string; time_of_day: import('./types').SupplementTime }[] }) =>
                  invoke<{ ok: boolean; plan_id?: number }>('supplementPlan:save', data),
  },

  settings: {
    get:  () => invoke<Settings>('settings:get'),
    save: (data: Partial<Settings>) => invoke<{ ok: boolean }>('settings:save', data),
  },

  import: {
    selectFile: (extensions?: string[]) => invoke<string | null>('import:selectFile', { extensions }),
    foods:          (filePath: string) => invoke<{ imported: number; skipped: number }>('import:foods', { filePath }),
    foodsFromText:  (text: string) => invoke<{ ok: boolean; imported: number; skipped: number; error?: string }>('import:foodsFromText', { text }),
    fullJson:   (filePath: string) => invoke<{ ok: boolean; stats: Record<string, number> }>('import:fullJson', { filePath }),
    backup:     (filePath: string) => invoke<{ ok: boolean; error?: string }>('import:backup', { filePath }),
  },

  export: {
    data:   (format: 'json' | 'csv') => invoke<{ ok: boolean }>('export:data', { format }),
    foods:  () => invoke<{ ok: boolean; count?: number }>('export:foods'),
    pantry: () => invoke<{ ok: boolean; count?: number }>('export:pantry'),
    backup: () => invoke<{ ok: boolean; path?: string }>('export:backup'),
  },

  measurements: {
    getAll: () => invoke<Measurement[]>('measurements:getAll'),
    add:    (data: Omit<Measurement, 'id'>) => invoke<{ id: number }>('measurements:add', data),
    delete: (id: number) => invoke<{ ok: boolean }>('measurements:delete', { id }),
  },

  undo: {
    pop: () => invoke<{ action: string; ok: boolean } | null>('undo:pop'),
  },

  pantries: {
    getAll:     () => invoke<PantryLocation[]>('pantries:getAll'),
    create:     (name: string) => invoke<{ id: number }>('pantries:create', { name }),
    rename:     (id: number, name: string) => invoke<{ ok: boolean }>('pantries:rename', { id, name }),
    delete:     (id: number) => invoke<{ ok: boolean; reason?: string }>('pantries:delete', { id }),
    setDefault: (id: number) => invoke<{ ok: boolean }>('pantries:setDefault', { id }),
  },

  pantry: {
    getAll:       (pantry_id?: number) => invoke<PantryItem[]>('pantry:getAll', { pantry_id }),
    addBatch:     (data: { food_id: number; quantity_g: number; expiry_date: string | null; package_id?: number | null; pantry_id?: number }) =>
                    invoke<{ ok: boolean }>('pantry:addBatch', data),
    set:          (data: { id: number; quantity_g: number; expiry_date: string | null; package_id?: number | null }) =>
                    invoke<{ ok: boolean }>('pantry:set', data),
    delete:       (id: number) => invoke<{ ok: boolean }>('pantry:delete', { id }),
    checkStock:   (food_id: number, grams: number, pantry_id?: number) =>
                    invoke<{ have_g: number; shortage: number }>('pantry:checkStock', { food_id, grams, pantry_id }),
    getStockMap:  (pantry_id?: number) =>
                    invoke<Record<number, { total_g: number; loose_g: number; packs: { grams: number; count: number }[] }>>('pantry:getStockMap', { pantry_id }),
    canMake:      (recipe_id: number, recipe_type: 'actual' | 'bundle', pantry_id?: number) =>
      invoke<{ recipe_id: number; can_make: boolean; ingredients: PantryIngredientCheck[]; missing: PantryIngredientCheck[] }>(
        'pantry:canMake', { recipe_id, recipe_type, pantry_id }),
    canMakeAll:   (recipe_type: 'actual' | 'bundle', pantry_id?: number) =>
      invoke<{ recipe_id: number; can_make: boolean; missing_count: number }[]>(
        'pantry:canMakeAll', { recipe_type, pantry_id }),
    deductRecipe:     (recipe_id: number, scale: number, recipe_type: 'actual' | 'bundle', pantry_id?: number) =>
      invoke<{ ok: boolean; shortages: { food_name: string; shortage: number }[]; events: DeductionEvent[] }>('pantry:deductRecipe', { recipe_id, scale, recipe_type, pantry_id }),
    setOpenedDays:    (batch_id: number, days: number) => invoke<{ ok: boolean }>('pantry:setOpenedDays', { batch_id, days }),
    resolveResidual:  (food_id: number, overflow_g: number, mode: 'residual' | 'new_open', pantry_id?: number) =>
      invoke<{ ok: boolean; events: DeductionEvent[] }>('pantry:resolveResidual', { food_id, overflow_g, mode, pantry_id }),
  },

  actionLog: {
    getRecent: (limit?: number) =>
      invoke<{ id: number; kind: string; food_name: string | null; grams: number | null; details: string | null; ts: string }[]>(
        'actionlog:getRecent', { limit }
      ),
  },

  shopping: {
    getAll:       (pantry_id?: number) => invoke<ShoppingItem[]>('shopping:getAll', { pantry_id }),
    add:          (data: { food_id: number; quantity_g?: number; pantry_id?: number }) => invoke<{ id: number }>('shopping:add', data),
    toggle:       (id: number) => invoke<{ ok: boolean }>('shopping:toggle', { id }),
    delete:       (id: number) => invoke<{ ok: boolean }>('shopping:delete', { id }),
    clearChecked: (pantry_id?: number) => invoke<{ ok: boolean }>('shopping:clearChecked', { pantry_id }),
  },

  analytics: {
    caloriesTrend:  (days: number) => invoke<CalorieTrendPoint[]>('analytics:caloriesTrend', { days }),
    macroTrend:     (days: number) => invoke<MacroTrendPoint[]>('analytics:macroTrend', { days }),
    exerciseTrend:  (days: number) => invoke<ExerciseTrendPoint[]>('analytics:exerciseTrend', { days }),
  },

  goals: {
    calculateTDEE: () => invoke<TDEEResult>('goals:calculateTDEE'),
    suggest: (data: { goal_type: GoalType; tdee: number }) => invoke<GoalSuggestion>('goals:suggest', data),
  },

  dailyEnergy: {
    get:            (date: string) => invoke<DailyEnergy>('dailyEnergy:get', { date }),
    getRange:       (startDate: string, endDate: string) => invoke<DailyEnergy[]>('dailyEnergy:getRange', { startDate, endDate }),
    getPrevResting: (date: string) => invoke<{ resting_kcal: number }>('dailyEnergy:getPrevResting', { date }),
    set:            (data: DailyEnergy) => invoke<{ ok: boolean }>('dailyEnergy:set', data),
  },

  sleep: {
    get:    (date: string) => invoke<SleepEntry | null>('sleep:get', { date }),
    upsert: (data: Omit<Partial<SleepEntry>, 'factors'> & { date: string; factors?: string[] }) => invoke<{ ok: boolean }>('sleep:upsert', data),
    range:  (from: string, to: string) => invoke<SleepTrendPoint[]>('sleep:range', { from, to }),
    delete: (date: string) => invoke<{ ok: boolean }>('sleep:delete', { date }),
  },

  tasks: {
    get:                  (date: string) => invoke<Task[]>('tasks:get', { date }),
    add:                  (data: { date: string; title: string; priority?: number; estimate_min?: number; project?: string }) => invoke<{ id: number }>('tasks:add', data),
    toggle:               (id: number) => invoke<{ ok: boolean; done: number }>('tasks:toggle', { id }),
    update:               (data: { id: number; title?: string; priority?: number; estimate_min?: number; project?: string }) => invoke<{ ok: boolean }>('tasks:update', data),
    reorder:              (ids: number[]) => invoke<{ ok: boolean }>('tasks:reorder', { ids }),
    delete:               (id: number) => invoke<{ ok: boolean }>('tasks:delete', { id }),
    rolloverFromYesterday:(date: string) => invoke<{ count: number }>('tasks:rolloverFromYesterday', { date }),
    completionRate:       (date: string) => invoke<TaskCompletionRate>('tasks:completionRate', { date }),
  },

  habits: {
    list:             () => invoke<Habit[]>('habits:list'),
    create:           (data: { name: string; icon?: string; color?: string; target_per_week?: number }) => invoke<{ id: number }>('habits:create', data),
    update:           (data: { id: number; name?: string; icon?: string; color?: string; target_per_week?: number }) => invoke<{ ok: boolean }>('habits:update', data),
    archive:          (id: number) => invoke<{ ok: boolean }>('habits:archive', { id }),
    delete:           (id: number) => invoke<{ ok: boolean }>('habits:delete', { id }),
    check:            (habit_id: number, date: string) => invoke<{ checked: boolean }>('habits:check', { habit_id, date }),
    uncheck:          (habit_id: number, date: string) => invoke<{ unchecked: boolean }>('habits:uncheck', { habit_id, date }),
    getWeekStats:     (date: string) => invoke<HabitWeekStat[]>('habits:getWeekStats', { date }),
    getCurrentStreak: (habit_id: number) => invoke<{ streak: number }>('habits:getCurrentStreak', { habit_id }),
    getMonthData:     (habit_id: number, year: number, month: number) => invoke<{ dates: string[] }>('habits:getMonthData', { habit_id, year, month }),
  },

  focus: {
    startSession: (data: { type?: string; project?: string; note?: string }) =>
      invoke<{ id: number; started_at: string }>('focus:startSession', data),
    stopSession: (id: number, duration_min: number) =>
      invoke<FocusSession>('focus:stopSession', { id, duration_min }),
    logManual: (data: { date: string; duration_min: number; project?: string; note?: string }) =>
      invoke<{ id: number }>('focus:logManual', data),
    deleteSession: (id: number) =>
      invoke<{ ok: boolean }>('focus:deleteSession', { id }),
    getDayStats: (date: string) =>
      invoke<FocusDayStats>('focus:getDayStats', { date }),
    getWeekStats: (from: string, to: string) =>
      invoke<FocusWeekPoint[]>('focus:getWeekStats', { from, to }),
    getActiveSession: () =>
      invoke<FocusSession | null>('focus:getActiveSession'),
  },

  mood: {
    get:    (date: string) => invoke<MoodEntry | null>('mood:get', { date }),
    upsert: (data: { date: string; mood?: number; energy?: number; stress?: number; note?: string }) =>
              invoke<MoodEntry>('mood:upsert', data),
    range:  (from: string, to: string) => invoke<MoodTrendPoint[]>('mood:range', { from, to }),
    delete: (date: string) => invoke<{ ok: boolean }>('mood:delete', { date }),
  },

  workouts: {
    startSession:    (data: { date?: string; plan_id?: number | null; note?: string }) =>
                       invoke<{ id: number; started_at: string }>('workouts:startSession', data),
    endSession:      (data: { id: number; duration_min?: number | null; calories_burned?: number | null; perceived_effort?: number | null; note?: string | null }) =>
                       invoke<WorkoutSession>('workouts:endSession', data),
    addSet:          (data: { session_id: number; exercise_id?: number | null; set_idx?: number; reps?: number | null; weight_kg?: number | null; distance_km?: number | null; duration_sec?: number | null; rest_sec?: number | null }) =>
                       invoke<{ id: number }>('workouts:addSet', data),
    removeSet:       (id: number) => invoke<{ ok: boolean }>('workouts:removeSet', { id }),
    getSession:      (id: number) => invoke<WorkoutSession | null>('workouts:getSession', { id }),
    getDaySessions:  (date: string) => invoke<WorkoutSession[]>('workouts:getDaySessions', { date }),
    getActiveSession:() => invoke<WorkoutSession | null>('workouts:getActiveSession'),
    getWeekStats:    (from: string, to: string) => invoke<WorkoutWeekPoint[]>('workouts:getWeekStats', { from, to }),
    deleteSession:   (id: number) => invoke<{ ok: boolean }>('workouts:deleteSession', { id }),
  },

  notifications: {
    getAll:          () => invoke<AppNotification[]>('notifications:getAll'),
    dismiss:         (key: string, expires_at?: string | null) =>
                       invoke<{ ok: boolean }>('notifications:dismiss', { key, expires_at }),
    undoDismiss:     (key: string) => invoke<{ ok: boolean }>('notifications:undoDismiss', { key }),
    dismissAll:      (keys?: string[]) => invoke<{ ok: boolean }>('notifications:dismissAll', { keys }),
    recentDismissed: (limit?: number) =>
                       invoke<DismissedNotification[]>('notifications:recentDismissed', { limit }),
  },

  gamification: {
    addPoints:      (data: { module: string; reason: string; points: number; context?: Record<string, unknown> }) =>
                      window.electronAPI.invoke('gamification:addPoints', data) as Promise<{ total_points: number; level: { level: number; name: string }; new_achievements: Achievement[] }>,
    getStatus:      () => window.electronAPI.invoke('gamification:getStatus') as Promise<UserLevel>,
    getAchievements:() => window.electronAPI.invoke('gamification:getAchievements') as Promise<Achievement[]>,
    getWeekPoints:  () => window.electronAPI.invoke('gamification:getWeekPoints') as Promise<PointEvent[]>,
  },

  sectionStreaks: {
    getAll: () => invoke<SectionStreak[]>('section_streaks:getAll'),
  },
} as const;
