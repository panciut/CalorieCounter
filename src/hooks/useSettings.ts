import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { api } from '../api';
import type { Settings } from '../types';

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Settings = {
  cal_min: 1800, cal_max: 2200, cal_rec: 2000,
  protein_min: 120, protein_max: 180, protein_rec: 150,
  carbs_min: 200, carbs_max: 300, carbs_rec: 250,
  fat_min: 55, fat_max: 85, fat_rec: 70,
  fiber_min: 20, fiber_max: 35, fiber_rec: 30,
  weight_goal: 0, water_goal: 2000,
  tol_1: 5, tol_2: 10, tol_3: 20,
  language: 'en', theme: 'dark',
  pantry_enabled: 1, pantry_warn_days: 3, pantry_urgent_days: 1,
  currency_symbol: '€',
  notif_pantry_expiry: 1, notif_low_pantry: 1,
  notif_missing_log: 1, notif_missing_energy: 1,
  notif_weight: 1, notif_weight_warn_days: 3, notif_weight_urgent_days: 7,
  insights_enabled: 1,
  insights_use_nutrition: 1,
  insights_include_approx_days: 0,
  insights_min_pair_n: 21,
  insights_fdr_q: 0.10,
  insights_sleep_target_min: 480,
  insights_window_days: 90,
  checkin_morning_enabled: 1,
  checkin_evening_enabled: 0,
  checkin_last_morning_date: '',
  checkin_last_evening_date: '',
  tdee_auto_suggest: 1,
  tdee_last_seen_value: 0,
};

// ── Context ───────────────────────────────────────────────────────────────────

interface SettingsContextValue {
  settings: Settings;
  loading: boolean;
  updateSettings: (partial: Partial<Settings>) => Promise<void>;
  invalidate: () => void;
}

export const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  loading: true,
  updateSettings: async () => {},
  invalidate: () => {},
});

// ── Provider ─────────────────────────────────────────────────────────────────

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading]   = useState(true);
  const [rev, setRev]           = useState(0);

  useEffect(() => {
    api.settings.get().then(s => {
      setSettings(s);
      setLoading(false);
      // Apply theme to body
      document.body.classList.toggle('light', s.theme === 'light');
    });
  }, [rev]);

  const updateSettings = useCallback(async (partial: Partial<Settings>) => {
    await api.settings.save(partial);
    setRev(r => r + 1);
  }, []);

  const invalidate = useCallback(() => setRev(r => r + 1), []);

  return createElement(
    SettingsContext.Provider,
    { value: { settings, loading, updateSettings, invalidate } },
    children,
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSettings() {
  return useContext(SettingsContext);
}
