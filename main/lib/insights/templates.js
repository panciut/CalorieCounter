'use strict';

const LABELS = {
  it: {
    sleepMin: 'sonno', sleepQuality: 'qualità del sonno', sleepDebt: 'debito di sonno',
    mood: 'umore', energy: 'energia', stress: 'stress',
    kcalIn: 'calorie assunte', kcalBalance: 'bilancio calorico', weightTrend: 'peso (trend)',
    weight: 'peso',
    lastMealHour: 'ora ultimo pasto',
    workoutDone: 'allenamento', workoutMin: 'minuti allenamento',
    habitPct: 'abitudini', taskCompletionPct: 'task completati',
    focusMin: 'sessioni focus', focusDone: 'sessioni focus', waterMl: 'acqua', steps: 'passi',
    perceivedEffort: 'sforzo percepito',
  },
  en: {
    sleepMin: 'sleep', sleepQuality: 'sleep quality', sleepDebt: 'sleep debt',
    mood: 'mood', energy: 'energy', stress: 'stress',
    kcalIn: 'calories in', kcalBalance: 'calorie balance', weightTrend: 'weight trend',
    weight: 'weight',
    lastMealHour: 'last meal time',
    workoutDone: 'workout', workoutMin: 'workout minutes',
    habitPct: 'habit completion', taskCompletionPct: 'task completion',
    focusMin: 'focus sessions', focusDone: 'focus sessions', waterMl: 'water', steps: 'steps',
    perceivedEffort: 'perceived effort',
  },
};

const ACTION_HINTS = {
  'lastMealHour~sleepQuality': { it: 'prova a cenare un po\' prima e vedi se la qualità migliora', en: 'try eating dinner a bit earlier' },
  'sleepMin~mood': { it: 'una sveglia a orari costanti aiuta a stabilizzare il sonno', en: 'a consistent wake time helps' },
  'workoutDone~mood': { it: 'tieni traccia di come ti senti il giorno dopo gli allenamenti', en: 'note how you feel the day after workouts' },
  'habitPct~energy': { it: 'completare anche solo metà delle abitudini sembra fare la differenza', en: 'even half your habits seems to help' },
  'sleepMin~kcalIn': { it: 'dormire poco aumenta la fame il giorno dopo — punta ad almeno 7h', en: 'poor sleep increases next-day hunger — aim for 7h+' },
  'workoutMin~energy': { it: 'anche una sessione breve sembra aumentare l\'energia il giorno dopo', en: 'even a short session seems to boost next-day energy' },
  'habitPct~mood': { it: 'le giornate con più abitudini completate coincidono con umore più alto', en: 'days with more habits done correlate with better mood' },
  'stress~sleepQuality': { it: 'lo stress alto si associa a sonno peggiore — considera tecniche di de-stress serali', en: 'high stress links to worse sleep — consider an evening wind-down' },
  'taskCompletionPct~mood': { it: 'completare i task giornalieri si associa a umore più alto', en: 'completing daily tasks links to better mood' },
  'kcalBalance~weightTrend': { it: 'il bilancio calorico è il predittore più diretto del trend peso', en: 'calorie balance is the strongest predictor of weight trend' },
  'focusMin~mood': { it: 'le sessioni focus si associano a umore positivo — anche 25 minuti bastano', en: 'focus sessions link to better mood — even 25 min helps' },
  'steps~mood': { it: 'più passi si associano a umore migliore — prova una camminata quotidiana', en: 'more steps link to better mood — try a daily walk' },
  'waterMl~energy': { it: 'idratazione adeguata si associa a energia più alta', en: 'good hydration links to higher energy' },
};

function fmt(x, lang = 'it') {
  const rounded = Math.round(x * 10) / 10;
  const str = rounded.toString();
  return lang === 'it' ? str.replace('.', ',') : str;
}

function renderInsight(raw, lang = 'it') {
  const labels = LABELS[lang] || LABELS.it;
  let text = '';
  let actionHint = undefined;

  if (raw.kind === 'association') {
    const { contrast, weekendControlled, nutrition, reliabilityBasis, n, lag } = raw;
    const { highMean, lowMean, cutoffLabel, predictor, outcome } = contrast;

    const suffix = weekendControlled.survived
      ? ''
      : lang === 'it'
        ? ' (potrebbe essere in parte spiegato dal weekend)'
        : ' (may be partially explained by weekends)';

    const lagPrefix = lag > 0
      ? lang === 'it'
        ? `Il giorno con ${cutoffLabel} di ${labels[predictor] ?? predictor} nella giornata precedente`
        : `On days following a day with ${cutoffLabel} of ${labels[predictor] ?? predictor}`
      : lang === 'it'
        ? `Nei giorni con ${cutoffLabel} di ${labels[predictor] ?? predictor}`
        : `On days with ${cutoffLabel} of ${labels[predictor] ?? predictor}`;

    const lagSuffix = lag > 0
      ? lang === 'it' ? ' il giorno dopo' : ' the following day'
      : '';

    if (lang === 'it') {
      const basisText = nutrition ? `${reliabilityBasis} giorni affidabili` : `${n} giorni`;
      text = `${lagPrefix}, ${labels[outcome] ?? outcome} medio${lagSuffix} ${fmt(highMean, 'it')} contro ${fmt(lowMean, 'it')} negli altri — su ${basisText}${suffix}.`;
    } else {
      const basisText = nutrition ? `${reliabilityBasis} reliable days` : `${n} days`;
      text = `${lagPrefix}, average ${labels[outcome] ?? outcome}${lagSuffix} ${fmt(highMean, 'en')} vs ${fmt(lowMean, 'en')} on others — across ${basisText}${suffix}.`;
    }

    const hintKey = `${raw.x}~${raw.y}`;
    if (ACTION_HINTS[hintKey]) {
      actionHint = ACTION_HINTS[hintKey][lang] || ACTION_HINTS[hintKey].it;
    }

  } else if (raw.kind === 'trend') {
    const { metric, direction, slopePerDay, n } = raw;
    const metricLabel = labels[metric] ?? metric;

    // sleepDebt has no slopePerDay/direction — render as accumulated debt
    if (metric === 'sleepDebt') {
      const debtH = Math.round((raw.totalDebtMin ?? 0) / 60);
      text = lang === 'it'
        ? `Hai accumulato circa ${debtH}h di debito di sonno nelle ultime 3 settimane.`
        : `You've accumulated about ${debtH}h of sleep debt over the last 3 weeks.`;
    } else {
      const directionText = direction === 'up'
        ? lang === 'it' ? 'in miglioramento' : 'improving'
        : lang === 'it' ? 'in peggioramento' : 'declining';
      const slopeText = fmt(Math.abs(slopePerDay * 7), lang);
      const signPrefix = direction === 'up' ? '+' : '-';
      if (lang === 'it') {
        text = `Il tuo ${metricLabel} è ${directionText} nelle ultime 3 settimane (${signPrefix}${slopeText} per settimana).`;
      } else {
        text = `Your ${metricLabel} is ${directionText} over the last 3 weeks (${signPrefix}${slopeText} per week).`;
      }
    }

  } else if (raw.kind === 'explained_trend') {
    const { metric, direction, slopePerWeek, n, causalFactors = [], downstreamEffects = [] } = raw;
    const metricLabel = labels[metric] ?? metric;
    const arrow = direction === 'up' ? '📈' : '📉';
    const dirIT = direction === 'up' ? 'sta salendo' : 'sta scendendo';
    const dirEN = direction === 'up' ? 'is rising' : 'is declining';
    const sign = direction === 'up' ? '+' : '-';

    if (lang === 'it') {
      let t = `${arrow} Il tuo ${metricLabel} ${dirIT} di ${sign}${fmt(Math.abs(slopePerWeek), 'it')}/settimana (${n} giorni).`;
      if (causalFactors.length > 0) {
        t += '\n\nPossibili cause:';
        for (const f of causalFactors) {
          const fLabel = labels[f.predictor] ?? f.predictor;
          const oLabel = labels[f.outcome] ?? f.outcome;
          const lagText = f.lag > 0 ? ' (il giorno prima)' : '';
          const corrLabel = Math.abs(f.stat) >= 0.5 ? 'forte' : 'moderata';
          t += `\n• ${fLabel}${lagText}: ${oLabel} medio ${fmt(f.highMean, 'it')} vs ${fmt(f.lowMean, 'it')} (correlazione ${corrLabel}, ${f.n} gg)`;
        }
      }
      if (downstreamEffects.length > 0) {
        t += '\n\nPossibili effetti:';
        for (const e of downstreamEffects) {
          const pLabel = labels[e.predictor] ?? e.predictor;
          const oLabel = labels[e.outcome] ?? e.outcome;
          const lagText = e.lag > 0 ? ` → ${oLabel} il giorno dopo` : ` → ${oLabel}`;
          const corrLabel = Math.abs(e.stat) >= 0.5 ? 'forte' : 'moderata';
          t += `\n• ${pLabel} in variazione${lagText}: medio ${fmt(e.highMean, 'it')} vs ${fmt(e.lowMean, 'it')} (correlazione ${corrLabel}, ${e.n} gg)`;
        }
      }
      text = t;
    } else {
      let t = `${arrow} Your ${metricLabel} ${dirEN} by ${sign}${fmt(Math.abs(slopePerWeek), 'en')}/week (${n} days).`;
      if (causalFactors.length > 0) {
        t += '\n\nPossible causes:';
        for (const f of causalFactors) {
          const fLabel = labels[f.predictor] ?? f.predictor;
          const oLabel = labels[f.outcome] ?? f.outcome;
          const lagText = f.lag > 0 ? ' (day before)' : '';
          const corrLabel = Math.abs(f.stat) >= 0.5 ? 'strong' : 'moderate';
          t += `\n• ${fLabel}${lagText}: ${oLabel} avg ${fmt(f.highMean, 'en')} vs ${fmt(f.lowMean, 'en')} (${corrLabel} correlation, ${f.n} days)`;
        }
      }
      if (downstreamEffects.length > 0) {
        t += '\n\nPossible effects:';
        for (const e of downstreamEffects) {
          const pLabel = labels[e.predictor] ?? e.predictor;
          const oLabel = labels[e.outcome] ?? e.outcome;
          const lagText = e.lag > 0 ? ` → ${oLabel} next day` : ` → ${oLabel}`;
          const corrLabel = Math.abs(e.stat) >= 0.5 ? 'strong' : 'moderate';
          t += `\n• ${pLabel} variation${lagText}: avg ${fmt(e.highMean, 'en')} vs ${fmt(e.lowMean, 'en')} (${corrLabel} correlation, ${e.n} days)`;
        }
      }
      text = t;
    }

  } else if (raw.kind === 'anomaly') {
    const { metric, value, baselineMedian, direction } = raw;
    const metricLabel = labels[metric] ?? metric;
    const directionText = direction === 'high'
      ? lang === 'it' ? 'insolitamente alte' : 'unusually high'
      : lang === 'it' ? 'insolitamente basse' : 'unusually low';
    const valueStr = fmt(value, lang);
    const medianStr = fmt(baselineMedian, lang);
    if (lang === 'it') {
      text = `${metricLabel} ${directionText} oggi (${valueStr}, mediana ${medianStr}).`;
    } else {
      text = `${metricLabel} ${directionText} today (${valueStr}, median ${medianStr}).`;
    }

  } else if (raw.kind === 'factor') {
    const { tag, metric, withMean, withoutMean, withN } = raw;
    const metricLabel = labels[metric] ?? metric;
    const withStr = fmt(withMean, lang);
    const withoutStr = fmt(withoutMean, lang);
    if (lang === 'it') {
      text = `Nelle notti con '${tag}', ${metricLabel} media ${withStr} contro ${withoutStr} senza — su ${withN} notti con il fattore.`;
    } else {
      text = `On nights with '${tag}', average ${metricLabel} ${withStr} vs ${withoutStr} without — across ${withN} nights with the factor.`;
    }

  } else if (raw.kind === 'milestone') {
    const MILESTONE_IT = {
      habit_streak_7: () => `🏆 7 giorni consecutivi di abitudini completate`,
      habit_streak_14: () => `🏆 14 giorni consecutivi di abitudini completate`,
      habit_streak_30: () => `🏆 30 giorni consecutivi di abitudini completate`,
      log_streak_7: () => `🏆 7 giorni consecutivi di pasti registrati`,
      log_streak_14: () => `🏆 14 giorni consecutivi di pasti registrati`,
      weight_new_low: (m) => `🏆 Nuovo peso minimo degli ultimi 90 giorni${m.value != null ? ` (${fmt(m.value, 'it')} kg)` : ''}`,
      perfect_day: () => `🏆 Giornata completa ieri: cibo, sonno e abitudini raggiunti`,
    };
    const MILESTONE_EN = {
      habit_streak_7: () => `🏆 7 consecutive days of habits completed`,
      habit_streak_14: () => `🏆 14 consecutive days of habits completed`,
      habit_streak_30: () => `🏆 30 consecutive days of habits completed`,
      log_streak_7: () => `🏆 7 consecutive days of meals logged`,
      log_streak_14: () => `🏆 14 consecutive days of meals logged`,
      weight_new_low: (m) => `🏆 New personal weight low in 90 days${m.value != null ? ` (${fmt(m.value, 'en')} kg)` : ''}`,
      perfect_day: () => `🏆 Perfect day yesterday: food, sleep and habits all achieved`,
    };
    const map = lang === 'it' ? MILESTONE_IT : MILESTONE_EN;
    const fn = map[raw.id];
    text = fn ? fn(raw) : `🏆 ${raw.id}`;
  }

  return { text, actionHint };
}

module.exports = { LABELS, ACTION_HINTS, fmt, renderInsight };
