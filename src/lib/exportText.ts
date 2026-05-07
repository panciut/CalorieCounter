import { MEAL_ORDER, type LogEntry, type WeekDayDetail, type Settings, type Meal, type GoalPlan } from '../types';
import { applyGoalPlan } from './goalsMerge';

const r = (n: number, d = 0) => {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
};

function macroLine(label: string, actual: number, target?: number, unit = 'g'): string {
  const a = r(actual, 1);
  if (!target) return `- ${label}: ${a}${unit}`;
  const pct = target ? Math.round((actual / target) * 100) : 0;
  return `- ${label}: ${a}${unit} / ${target}${unit} (${pct}%)`;
}

function sumEntries(es: LogEntry[]) {
  return es.reduce(
    (acc, e) => ({
      cal: acc.cal + e.calories,
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fat: acc.fat + e.fat,
      fiber: acc.fiber + (e.fiber || 0),
    }),
    { cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
}

function entryLine(e: LogEntry): string {
  const parts = [
    `${r(e.calories)} kcal`,
    `P ${r(e.protein, 1)}`,
    `C ${r(e.carbs, 1)}`,
    `F ${r(e.fat, 1)}`,
  ];
  if (e.fiber) parts.push(`Fi ${r(e.fiber, 1)}`);
  return `  - ${e.name} — ${r(e.grams, 1)}g — ${parts.join(' · ')}`;
}

function groupByMeal(entries: LogEntry[]): Record<Meal, LogEntry[]> {
  const out: Record<Meal, LogEntry[]> = Object.fromEntries(
    MEAL_ORDER.map(m => [m, [] as LogEntry[]]),
  ) as Record<Meal, LogEntry[]>;
  for (const e of entries) out[e.meal]?.push(e);
  return out;
}

export interface DayExportInput {
  date: string;
  entries: LogEntry[];
  settings: Settings;
  /** Goal plan active on `date`. When provided, overrides goal-related fields in settings. */
  goalPlan?: GoalPlan | null;
  waterMl?: number;
  waterGoalMl?: number;
  restingKcal?: number;
  activeKcal?: number;
  extraKcal?: number;
  note?: string;
}

export function buildDayMarkdown(input: DayExportInput): string {
  const { date, entries, settings: baseSettings, goalPlan, waterMl, waterGoalMl, restingKcal, activeKcal, extraKcal, note } = input;
  const settings = applyGoalPlan(baseSettings, goalPlan);
  const exerciseKcal = (restingKcal ?? 0) + (activeKcal ?? 0) + (extraKcal ?? 0);
  const logged = entries.filter(e => e.status === 'logged');
  const planned = entries.filter(e => e.status === 'planned');
  const t = sumEntries(logged);

  const lines: string[] = [];
  lines.push(`# Day — ${date}`);
  lines.push('');
  lines.push('## Targets');
  if (settings.cal_rec) lines.push(`- Calories goal: ${settings.cal_rec} kcal (range ${settings.cal_min}–${settings.cal_max})`);
  if (settings.protein_rec) lines.push(`- Protein goal: ${settings.protein_rec}g (range ${settings.protein_min}–${settings.protein_max}g)`);
  if (settings.carbs_rec) lines.push(`- Carbs goal: ${settings.carbs_rec}g (range ${settings.carbs_min}–${settings.carbs_max}g)`);
  if (settings.fat_rec) lines.push(`- Fat goal: ${settings.fat_rec}g (range ${settings.fat_min}–${settings.fat_max}g)`);
  if (settings.fiber_rec) lines.push(`- Fiber goal: ${settings.fiber_rec}g (range ${settings.fiber_min}–${settings.fiber_max}g)`);
  if (settings.water_goal) lines.push(`- Water goal: ${settings.water_goal} ml`);
  lines.push('');

  lines.push('## Totals (logged)');
  lines.push(macroLine('Calories', t.cal, settings.cal_rec, ' kcal'));
  lines.push(macroLine('Protein', t.protein, settings.protein_rec));
  lines.push(macroLine('Carbs', t.carbs, settings.carbs_rec));
  lines.push(macroLine('Fat', t.fat, settings.fat_rec));
  lines.push(macroLine('Fiber', t.fiber, settings.fiber_rec));
  if (exerciseKcal > 0) {
    const parts: string[] = [];
    if (restingKcal) parts.push(`resting ${r(restingKcal)}`);
    if (activeKcal)  parts.push(`active ${r(activeKcal)}`);
    if (extraKcal)   parts.push(`extra ${r(extraKcal)}`);
    lines.push(`- Energy out: ${r(exerciseKcal)} kcal${parts.length ? ` (${parts.join(' + ')})` : ''}`);
    lines.push(`- Net calories: ${r(t.cal - exerciseKcal)} kcal`);
  }
  if (waterMl != null) {
    lines.push(`- Water: ${r(waterMl)} ml${waterGoalMl ? ` / ${waterGoalMl} ml` : ''}`);
  }
  lines.push('');

  lines.push('## Meals');
  const byMealLogged  = groupByMeal(logged);
  const byMealPlanned = groupByMeal(planned);
  for (const m of MEAL_ORDER) {
    const loggedEs  = byMealLogged[m];
    const plannedEs = byMealPlanned[m];
    const mealCal   = loggedEs.length ? r(sumEntries(loggedEs).cal) : 0;
    lines.push(`### ${m}${mealCal ? ` — ${mealCal} kcal` : ''}`);
    for (const e of loggedEs)  lines.push(entryLine(e));
    for (const e of plannedEs) lines.push(entryLine(e) + ' *(plan)*');
    if (!loggedEs.length && !plannedEs.length) lines.push('  *(empty)*');
  }
  lines.push('');

  if (note && note.trim()) {
    lines.push('## Notes');
    lines.push(note.trim());
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function buildPlanMarkdown(date: string, entries: LogEntry[], settings: Settings): string {
  const planned = entries.filter(e => e.status === 'planned');
  const logged = entries.filter(e => e.status === 'logged');
  const combined = sumEntries(entries);
  const pt = sumEntries(planned);
  const lt = sumEntries(logged);

  const lines: string[] = [];
  lines.push(`# Plan — ${date}`);
  lines.push('');
  lines.push('## Targets');
  if (settings.cal_rec) lines.push(`- Calories goal: ${settings.cal_rec} kcal (range ${settings.cal_min}–${settings.cal_max})`);
  if (settings.protein_rec) lines.push(`- Protein goal: ${settings.protein_rec}g (range ${settings.protein_min}–${settings.protein_max}g)`);
  if (settings.carbs_rec) lines.push(`- Carbs goal: ${settings.carbs_rec}g (range ${settings.carbs_min}–${settings.carbs_max}g)`);
  if (settings.fat_rec) lines.push(`- Fat goal: ${settings.fat_rec}g (range ${settings.fat_min}–${settings.fat_max}g)`);
  if (settings.fiber_rec) lines.push(`- Fiber goal: ${settings.fiber_rec}g (range ${settings.fiber_min}–${settings.fiber_max}g)`);
  lines.push('');

  lines.push('## Projected totals (logged + planned)');
  lines.push(macroLine('Calories', combined.cal, settings.cal_rec, ' kcal'));
  lines.push(macroLine('Protein', combined.protein, settings.protein_rec));
  lines.push(macroLine('Carbs', combined.carbs, settings.carbs_rec));
  lines.push(macroLine('Fat', combined.fat, settings.fat_rec));
  lines.push(macroLine('Fiber', combined.fiber, settings.fiber_rec));
  lines.push('');

  if (logged.length > 0) {
    lines.push(`## Already logged — ${r(lt.cal)} kcal`);
    const byMeal = groupByMeal(logged);
    for (const m of MEAL_ORDER) {
      const es = byMeal[m];
      if (!es.length) continue;
      lines.push(`### ${m}`);
      for (const e of es) lines.push(entryLine(e));
    }
    lines.push('');
  }

  if (planned.length > 0) {
    lines.push(`## Planned — ${r(pt.cal)} kcal`);
    const byMeal = groupByMeal(planned);
    for (const m of MEAL_ORDER) {
      const es = byMeal[m];
      if (!es.length) continue;
      lines.push(`### ${m}`);
      for (const e of es) lines.push(entryLine(e));
    }
    lines.push('');
  }

  if (entries.length === 0) {
    lines.push('_Nothing planned or logged._');
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function buildWeekMarkdown(
  weekStart: string,
  weekEnd: string,
  rows: WeekDayDetail[],
  settings: Settings,
  goalsByDate?: Record<string, GoalPlan>,
): string {
  const logged = rows.filter(d => d.calories > 0);
  const count = logged.length || 1;
  const avg = (k: keyof WeekDayDetail) => logged.reduce((s, d) => s + (d[k] as number), 0) / count;

  // Collect distinct plans intersecting the week (in chronological order)
  const planList: GoalPlan[] = [];
  const seen = new Set<number>();
  if (goalsByDate) {
    for (const d of rows) {
      const p = goalsByDate[d.date];
      if (p && !seen.has(p.id)) { seen.add(p.id); planList.push(p); }
    }
  }
  // Reference settings: latest plan in the range, falling back to base settings.
  const refSettings = applyGoalPlan(settings, planList[planList.length - 1] || null);

  const lines: string[] = [];
  lines.push(`# Week — ${weekStart} → ${weekEnd}`);
  lines.push('');
  lines.push('## Targets');
  if (planList.length > 1) {
    lines.push(`_Goals changed during this week (${planList.length} periods)._`);
    for (const p of planList) {
      const lbl = p.label ? ` (${p.label})` : '';
      lines.push(`- From ${p.effective_from}${lbl}: ${p.cal_rec ?? '—'} kcal · P ${p.protein_rec ?? '—'}g · C ${p.carbs_rec ?? '—'}g · F ${p.fat_rec ?? '—'}g · Fib ${p.fiber_rec ?? '—'}g`);
    }
  } else {
    if (refSettings.cal_rec) lines.push(`- Calories goal: ${refSettings.cal_rec} kcal/day (range ${refSettings.cal_min}–${refSettings.cal_max})`);
    if (refSettings.protein_rec) lines.push(`- Protein goal: ${refSettings.protein_rec}g/day (range ${refSettings.protein_min}–${refSettings.protein_max}g)`);
    if (refSettings.carbs_rec) lines.push(`- Carbs goal: ${refSettings.carbs_rec}g/day (range ${refSettings.carbs_min}–${refSettings.carbs_max}g)`);
    if (refSettings.fat_rec) lines.push(`- Fat goal: ${refSettings.fat_rec}g/day (range ${refSettings.fat_min}–${refSettings.fat_max}g)`);
    if (refSettings.fiber_rec) lines.push(`- Fiber goal: ${refSettings.fiber_rec}g/day (range ${refSettings.fiber_min}–${refSettings.fiber_max}g)`);
  }
  lines.push('');

  lines.push(`## Averages (${logged.length} logged day${logged.length === 1 ? '' : 's'})`);
  lines.push(macroLine('Calories', avg('calories'), refSettings.cal_rec, ' kcal'));
  lines.push(macroLine('Protein', avg('protein'), refSettings.protein_rec));
  lines.push(macroLine('Carbs', avg('carbs'), refSettings.carbs_rec));
  lines.push(macroLine('Fat', avg('fat'), refSettings.fat_rec));
  lines.push(macroLine('Fiber', avg('fiber'), refSettings.fiber_rec));
  lines.push('');

  lines.push('## Daily breakdown');
  lines.push('| Date | kcal | P | C | F | Fi |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const d of rows) {
    const mark = d.calories > 0
      ? `| ${d.date} | ${r(d.calories)} | ${r(d.protein, 1)} | ${r(d.carbs, 1)} | ${r(d.fat, 1)} | ${r(d.fiber, 1)} |`
      : `| ${d.date} | — | — | — | — | — |`;
    lines.push(mark);
  }
  lines.push('');

  return lines.join('\n').trimEnd() + '\n';
}

export interface HistoryExportInput {
  summaries: { week_start: string; days_logged: number; avg_calories: number; avg_protein: number; avg_carbs: number; avg_fat: number; avg_fiber: number }[];
  settings: Settings;
  /** Full goal_plans history, ascending by effective_from. Used to render the goal periods block. */
  goalPlans?: GoalPlan[];
  weightEntries?: { date: string; weight: number; fat_pct: number | null }[];
  currentStreak?: number;
  bestStreak?: number;
}

export function buildHistoryMarkdown(input: HistoryExportInput): string {
  const { summaries, settings, goalPlans, weightEntries, currentStreak, bestStreak } = input;
  const lines: string[] = [];
  lines.push(`# History overview — ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');

  lines.push('## Goal periods');
  if (goalPlans && goalPlans.length > 0) {
    for (let i = 0; i < goalPlans.length; i++) {
      const p = goalPlans[i];
      const next = goalPlans[i + 1];
      const lbl = p.label ? ` — ${p.label}` : '';
      const range = `${p.effective_from} → ${next ? next.effective_from : 'current'}`;
      lines.push(`- ${range}${lbl} (${p.goal_type}): ${p.cal_rec ?? '—'} kcal · P ${p.protein_rec ?? '—'}g · C ${p.carbs_rec ?? '—'}g · F ${p.fat_rec ?? '—'}g · Fib ${p.fiber_rec ?? '—'}g${p.weight_goal ? ` · target ${p.weight_goal}kg` : ''}`);
      if (p.notes) lines.push(`  - notes: ${p.notes.replace(/\n/g, ' ')}`);
    }
  } else {
    if (settings.cal_rec) lines.push(`- Calories: ${settings.cal_rec} kcal/day (range ${settings.cal_min}–${settings.cal_max})`);
    if (settings.protein_rec) lines.push(`- Protein: ${settings.protein_rec}g/day (range ${settings.protein_min}–${settings.protein_max}g)`);
    if (settings.carbs_rec) lines.push(`- Carbs: ${settings.carbs_rec}g/day (range ${settings.carbs_min}–${settings.carbs_max}g)`);
    if (settings.fat_rec) lines.push(`- Fat: ${settings.fat_rec}g/day (range ${settings.fat_min}–${settings.fat_max}g)`);
    if (settings.fiber_rec) lines.push(`- Fiber: ${settings.fiber_rec}g/day (range ${settings.fiber_min}–${settings.fiber_max}g)`);
    if (settings.weight_goal) lines.push(`- Weight goal: ${settings.weight_goal} kg`);
  }
  lines.push('');

  if (currentStreak != null || bestStreak != null) {
    lines.push('## Streaks');
    if (currentStreak != null) lines.push(`- Current: ${currentStreak} days`);
    if (bestStreak != null) lines.push(`- Best: ${bestStreak} days`);
    lines.push('');
  }

  if (summaries.length > 0) {
    const sorted = [...summaries].sort((a, b) => a.week_start.localeCompare(b.week_start));
    const totalDays = sorted.reduce((s, w) => s + w.days_logged, 0) || 1;
    const wAvg = (k: 'avg_calories' | 'avg_protein' | 'avg_carbs' | 'avg_fat' | 'avg_fiber') =>
      sorted.reduce((s, w) => s + w[k] * w.days_logged, 0) / totalDays;

    lines.push(`## Overall averages (${totalDays} logged days across ${sorted.length} weeks)`);
    lines.push(macroLine('Calories', wAvg('avg_calories'), settings.cal_rec, ' kcal'));
    lines.push(macroLine('Protein', wAvg('avg_protein'), settings.protein_rec));
    lines.push(macroLine('Carbs', wAvg('avg_carbs'), settings.carbs_rec));
    lines.push(macroLine('Fat', wAvg('avg_fat'), settings.fat_rec));
    lines.push(macroLine('Fiber', wAvg('avg_fiber'), settings.fiber_rec));
    lines.push('');

    lines.push('## Weekly summaries');
    lines.push('| Week of | Days | kcal | P | C | F | Fi |');
    lines.push('|---|---:|---:|---:|---:|---:|---:|');
    for (const w of sorted) {
      lines.push(`| ${w.week_start} | ${w.days_logged} | ${r(w.avg_calories)} | ${r(w.avg_protein, 1)} | ${r(w.avg_carbs, 1)} | ${r(w.avg_fat, 1)} | ${r(w.avg_fiber, 1)} |`);
    }
    lines.push('');
  } else {
    lines.push('_No weekly history yet._');
    lines.push('');
  }

  if (weightEntries && weightEntries.length > 0) {
    const sorted = [...weightEntries].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const delta = last.weight - first.weight;
    lines.push('## Weight');
    lines.push(`- First: ${first.weight} kg (${first.date})`);
    lines.push(`- Latest: ${last.weight} kg (${last.date})`);
    lines.push(`- Change: ${delta >= 0 ? '+' : ''}${r(delta, 1)} kg over ${sorted.length} entries`);
    if (last.fat_pct != null) lines.push(`- Latest body fat: ${last.fat_pct}%`);
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

// ── Food compare ─────────────────────────────────────────────────────────────

export interface CompareRow {
  name: string;
  gramsEff: number | null;
  kcalBudget: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  netCarbs: number;
  energyDensity: number;
  proteinDensity: number;
  satiety: number;
  macroPctP: number;
  macroPctC: number;
  macroPctF: number;
  price: number | null;
  pricePer100g: number | null;
  pricePer100kcal: number | null;
  pricePer10gProtein: number | null;
  available: boolean;
}

function cell(v: number | null, d = 1): string {
  return v == null ? '—' : String(r(v, d));
}

export function buildCompareMarkdown(rows: CompareRow[], mode: string, currency: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const names = rows.map(row => row.name);
  const sep = names.map(() => '---:');
  const line = (label: string, vals: string[]) =>
    `| ${label} | ${vals.join(' | ')} |`;

  const lines: string[] = [];
  lines.push(`# Food comparison — ${date}`);
  lines.push(`Mode: ${mode}`);
  lines.push('');

  lines.push('## Nutrition');
  lines.push(`| | ${names.join(' | ')} |`);
  lines.push(`|---|${sep.join('|')}|`);
  if (rows.some(r => r.gramsEff != null))
    lines.push(line('Effective grams (g)', rows.map(r => cell(r.gramsEff))));
  if (rows.some(r => r.kcalBudget != null))
    lines.push(line('Kcal budget', rows.map(r => cell(r.kcalBudget, 0))));
  lines.push(line('Calories (kcal)', rows.map(r => cell(r.calories, 1))));
  lines.push(line('Protein (g)', rows.map(r => cell(r.protein))));
  lines.push(line('Carbs (g)', rows.map(r => cell(r.carbs))));
  lines.push(line('Fat (g)', rows.map(r => cell(r.fat))));
  lines.push(line('Fiber (g)', rows.map(r => cell(r.fiber))));
  lines.push('');

  lines.push('## Derived metrics');
  lines.push(`| | ${names.join(' | ')} |`);
  lines.push(`|---|${sep.join('|')}|`);
  lines.push(line('Net carbs (g)', rows.map(r => cell(r.netCarbs))));
  lines.push(line('Energy density (kcal/g)', rows.map(r => cell(r.energyDensity, 2))));
  lines.push(line('Protein density (g/100 kcal)', rows.map(r => cell(r.proteinDensity))));
  lines.push(line('Satiety (P+Fi /100 kcal)', rows.map(r => cell(r.satiety))));
  lines.push(line('Macro split P/C/F (%)', rows.map(r =>
    r.available ? `${r.macroPctP}/${r.macroPctC}/${r.macroPctF}` : '—'
  )));
  lines.push('');

  const hasPrices = rows.some(r => r.pricePer100g != null);
  if (hasPrices) {
    lines.push(`## Price (${currency})`);
    lines.push(`| | ${names.join(' | ')} |`);
    lines.push(`|---|${sep.join('|')}|`);
    lines.push(line(`Per 100 g (${currency})`, rows.map(r => cell(r.pricePer100g, 2))));
    lines.push(line(`Per 100 kcal (${currency})`, rows.map(r => cell(r.pricePer100kcal, 2))));
    lines.push(line(`Per 10 g protein (${currency})`, rows.map(r => cell(r.pricePer10gProtein, 2))));
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
