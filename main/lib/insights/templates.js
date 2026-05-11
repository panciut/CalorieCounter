const LABELS = {
  it: {
    sleepMin: 'sonno',
    mood: 'umore',
    energy: 'energia',
    stress: 'stress',
    kcalIn: 'calorie assunte',
    kcalBalance: 'bilancio calorico',
    weightTrend: 'peso (trend)',
    sleepQuality: 'qualità del sonno',
    lastMealHour: 'ora ultimo pasto',
    workoutDone: 'allenamento',
    habitPct: 'abitudini',
    taskCompletionPct: 'task completati',
    focusDone: 'sessioni focus'
  },
  en: {
    sleepMin: 'sleep',
    mood: 'mood',
    energy: 'energy',
    stress: 'stress',
    kcalIn: 'calories in',
    kcalBalance: 'calorie balance',
    weightTrend: 'weight trend',
    sleepQuality: 'sleep quality',
    lastMealHour: 'last meal time',
    workoutDone: 'workout',
    habitPct: 'habits',
    taskCompletionPct: 'tasks done',
    focusDone: 'focus sessions'
  }
};

const ACTION_HINTS = {
  'lastMealHour~sleepQuality': { it: 'prova a cenare un po\' prima e vedi se la qualità migliora', en: 'try eating dinner a bit earlier' },
  'sleepMin~mood': { it: 'una sveglia a orari costanti aiuta a stabilizzare il sonno', en: 'a consistent wake time helps' },
  'workoutDone~mood': { it: 'tieni traccia di come ti senti il giorno dopo gli allenamenti', en: 'note how you feel the day after workouts' },
  'habitPct~energy': { it: 'completare anche solo metà delle abitudini sembra fare la differenza', en: 'even half your habits seems to help' },
};

/**
 * Format a number for display in a specific language.
 * For Italian, replace . with , ; for English, keep as is.
 * Rounds to 1 decimal place.
 */
function fmt(x, lang = 'it') {
  const rounded = Math.round(x * 10) / 10;
  const str = rounded.toString();
  if (lang === 'it') {
    return str.replace('.', ',');
  }
  return str;
}

/**
 * Render an insight as human-readable text.
 * @param {Object} raw - The insight object
 * @param {string} lang - Language code ('it' or 'en'), defaults to 'it'
 * @returns {Object} { text, actionHint }
 */
function renderInsight(raw, lang = 'it') {
  const labels = LABELS[lang] || LABELS.it;

  let text = '';
  let actionHint = undefined;

  if (raw.kind === 'association') {
    const { contrast, weekendControlled, nutrition, reliabilityBasis, n } = raw;
    const { highMean, lowMean, cutoffLabel, predictor, outcome } = contrast;

    // Determine suffix for weekend caveat
    const suffix = weekendControlled.survived
      ? ''
      : lang === 'it'
      ? ' (potrebbe essere in parte spiegato dal weekend)'
      : ' (may be partially explained by weekends)';

    // Build association text
    if (lang === 'it') {
      const basisText = nutrition ? `${reliabilityBasis} giorni affidabili` : `${n} giorni`;
      text = `Nei giorni con ${cutoffLabel} di ${labels[predictor]}, ${labels[outcome]} medio ${fmt(highMean, 'it')} contro ${fmt(lowMean, 'it')} negli altri — su ${basisText}${suffix}.`;
    } else {
      const basisText = nutrition ? `${reliabilityBasis} reliable days` : `${n} days`;
      text = `On days with ${cutoffLabel} of ${labels[predictor]}, average ${labels[outcome]} ${fmt(highMean, 'en')} vs ${fmt(lowMean, 'en')} on others — across ${basisText}${suffix}.`;
    }

    // Check for action hint
    const hintKey = `${raw.x}~${raw.y}`;
    if (ACTION_HINTS[hintKey]) {
      actionHint = ACTION_HINTS[hintKey][lang] || ACTION_HINTS[hintKey].it;
    }
  } else if (raw.kind === 'trend') {
    const { metric, direction, slopePerDay, n } = raw;
    const metricLabel = labels[metric];
    const directionText = direction === 'up'
      ? lang === 'it' ? 'in miglioramento' : 'improving'
      : lang === 'it' ? 'in peggioramento' : 'declining';

    const slopeText = fmt(Math.abs(slopePerDay * 7), lang); // per week
    const signPrefix = direction === 'up' ? '+' : '-';

    if (lang === 'it') {
      text = `Il tuo ${metricLabel} è ${directionText} nelle ultime 3 settimane (${signPrefix}${slopeText} per settimana).`;
    } else {
      text = `Your ${metricLabel} is ${directionText} over the last 3 weeks (${signPrefix}${slopeText} per week).`;
    }
  } else if (raw.kind === 'anomaly') {
    const { metric, value, baselineMedian, direction } = raw;
    const metricLabel = labels[metric];
    const directionText = direction === 'high'
      ? lang === 'it' ? 'insolitamente alte' : 'unusually high'
      : lang === 'it' ? 'insolitamente basse' : 'unusually low';

    const valueStr = fmt(value, lang);
    const medianStr = fmt(baselineMedian, lang);

    if (lang === 'it') {
      text = `${metricLabel} ${directionText} oggi (${valueStr} kcal, mediana ${medianStr}).`;
    } else {
      text = `${metricLabel} ${directionText} today (${valueStr} cal, median ${medianStr}).`;
    }
  } else if (raw.kind === 'factor') {
    const { tag, metric, withMean, withoutMean, withN, withoutN } = raw;
    const metricLabel = labels[metric];
    const withStr = fmt(withMean, lang);
    const withoutStr = fmt(withoutMean, lang);

    if (lang === 'it') {
      text = `Nelle notti con '${tag}', ${metricLabel} media ${withStr} contro ${withoutStr} senza — su ${withN} notti con il fattore.`;
    } else {
      text = `On nights with '${tag}', average ${metricLabel} ${withStr} vs ${withoutStr} without — across ${withN} nights with the factor.`;
    }
  }

  return { text, actionHint };
}

module.exports = {
  LABELS,
  ACTION_HINTS,
  fmt,
  renderInsight
};
