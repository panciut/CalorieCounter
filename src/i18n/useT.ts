import { useContext } from 'react';
import { SettingsContext } from '../hooks/useSettings';
import { translations } from './translations';
import type { Meal } from '../types';
import { MEAL_ORDER } from '../types';

export function useT() {
  const { settings } = useContext(SettingsContext);
  const lang = (settings?.language ?? 'en') as 'en' | 'it';
  const map = translations[lang] ?? translations.en;

  function t(key: string, vars?: Record<string, string | number>): string {
    const template = map[key] ?? translations.en[key] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (m, name) => {
      const v = vars[name];
      return v == null ? m : String(v);
    });
  }

  function tMeal(meal: Meal | string): string {
    const keyMap: Record<string, string> = {
      Breakfast:      'meal.breakfast',
      MorningSnack:   'meal.morningSnack',
      Lunch:          'meal.lunch',
      AfternoonSnack: 'meal.afternoonSnack',
      Dinner:         'meal.dinner',
      EveningSnack:   'meal.eveningSnack',
      NightSnack:     'meal.nightSnack',
      // legacy fallback for any pre-migration data still in memory
      Snack:          'meal.afternoonSnack',
    };
    const k = keyMap[meal];
    return k ? t(k) : meal;
  }

  function mealFromTranslated(translated: string): Meal {
    return MEAL_ORDER.find(m => tMeal(m) === translated) ?? (translated as Meal);
  }

  return { t, tMeal, mealFromTranslated, lang };
}
