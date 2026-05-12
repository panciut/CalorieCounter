import { useState, useEffect } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useT } from '../i18n/useT';
import { api } from '../api';
import type { PantryLocation, Scale } from '../types';

type CustomDbStatus = { path: string | null; status: 'none' | 'ok' | 'error'; error?: string; table?: string; rows?: number };

export default function SettingsPage() {
  const { t } = useT();
  const { settings, updateSettings } = useSettings();
  const [pantries, setPantries] = useState<PantryLocation[]>([]);
  const [scales, setScales] = useState<Scale[]>([]);
  const [newScaleName, setNewScaleName] = useState('');
  const [customDbStatus, setCustomDbStatus] = useState<CustomDbStatus>({ path: null, status: 'none' });
  const [customDbLoading, setCustomDbLoading] = useState(false);
  const [customDbError, setCustomDbError] = useState<string | null>(null);

  useEffect(() => { api.pantries.getAll().then(setPantries); }, []);
  useEffect(() => { api.scales.getAll().then(setScales); }, []);
  useEffect(() => { api.customDb.getStatus().then(setCustomDbStatus); }, []);

  async function reloadScales() { setScales(await api.scales.getAll()); }
  async function handleRenameScale(id: number, name: string) {
    if (!name.trim()) return;
    await api.scales.rename(id, name.trim());
    reloadScales();
  }
  async function handleAddScale() {
    const name = newScaleName.trim();
    if (!name) return;
    await api.scales.create(name);
    setNewScaleName('');
    reloadScales();
  }
  async function handleDeleteScale(id: number) {
    await api.scales.delete(id);
    reloadScales();
  }
  async function handleSetDefaultScale(id: number) {
    await api.scales.setDefault(id);
    reloadScales();
  }

  async function handleSelectCustomDb() {
    setCustomDbLoading(true);
    setCustomDbError(null);
    try {
      const filePath = await api.customDb.selectFile();
      if (!filePath) return;
      const result = await api.customDb.setPath(filePath);
      if (!result.ok) {
        setCustomDbError(result.error ?? 'Errore sconosciuto');
        return;
      }
      setCustomDbStatus(await api.customDb.getStatus());
    } catch (e: unknown) {
      setCustomDbError(e instanceof Error ? e.message : 'Errore nella comunicazione con il processo principale');
    } finally {
      setCustomDbLoading(false);
    }
  }

  async function handleClearCustomDb() {
    await api.customDb.setPath(null);
    setCustomDbStatus({ path: null, status: 'none' });
    setCustomDbError(null);
  }

  const currentTheme = settings.theme    ?? 'dark';
  const currentLang  = settings.language ?? 'en';

  const sectionTitle = 'text-sm font-semibold text-text-sec uppercase tracking-wider mb-3';

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-10">
      <h1 className="text-2xl font-bold text-text">{t('nav.settings')}</h1>

      {/* ── Language ───────────────────────────────────────────────────────── */}
      <section>
        <h2 className={sectionTitle}>{t('settings.language')}</h2>
        <div className="flex gap-3">
          {(['en', 'it'] as const).map(lang => (
            <button
              key={lang}
              onClick={() => updateSettings({ language: lang })}
              className={[
                'px-4 py-2 rounded-md text-sm font-medium border transition-all cursor-pointer',
                currentLang === lang
                  ? 'bg-accent text-white border-accent'
                  : 'bg-transparent text-text-sec border-border hover:border-accent/50 hover:text-text',
              ].join(' ')}
            >
              {lang === 'en' ? '🇬🇧 English' : '🇮🇹 Italiano'}
            </button>
          ))}
        </div>
      </section>

      {/* ── Theme ──────────────────────────────────────────────────────────── */}
      <section>
        <h2 className={sectionTitle}>{t('settings.theme')}</h2>
        <div className="flex gap-3">
          {(['dark', 'light'] as const).map(theme => (
            <button
              key={theme}
              onClick={() => updateSettings({ theme })}
              className={[
                'px-4 py-2 rounded-md text-sm font-medium border transition-all cursor-pointer',
                currentTheme === theme
                  ? 'bg-accent text-white border-accent'
                  : 'bg-transparent text-text-sec border-border hover:border-accent/50 hover:text-text',
              ].join(' ')}
            >
              {theme === 'dark' ? `🌙 ${t('settings.dark')}` : `☀️ ${t('settings.light')}`}
            </button>
          ))}
        </div>
      </section>

      {/* ── Pantry ─────────────────────────────────────────────────────────── */}
      <section>
        <h2 className={sectionTitle}>{t('settings.pantrySection')}</h2>
        <div className="bg-card border border-border rounded-xl p-4 space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => updateSettings({ pantry_enabled: settings.pantry_enabled === 0 ? 1 : 0 })}
              className={[
                'w-10 h-6 rounded-full transition-colors cursor-pointer flex items-center',
                settings.pantry_enabled !== 0 ? 'bg-accent' : 'bg-border',
              ].join(' ')}
            >
              <div className={[
                'w-5 h-5 rounded-full bg-white shadow transition-transform mx-0.5',
                settings.pantry_enabled !== 0 ? 'translate-x-4' : 'translate-x-0',
              ].join(' ')} />
            </div>
            <span className="text-sm text-text">{t('settings.pantryEnabled')}</span>
          </label>
          {settings.pantry_enabled !== 0 && (
            <div className="flex flex-col gap-4 pt-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-sec">{t('settings.pantryWarnDays')}</label>
                  <input
                    type="number" min={0} max={30}
                    value={settings.pantry_warn_days}
                    onChange={e => updateSettings({ pantry_warn_days: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent w-24"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-sec">{t('settings.pantryUrgentDays')}</label>
                  <input
                    type="number" min={0} max={30}
                    value={settings.pantry_urgent_days}
                    onChange={e => updateSettings({ pantry_urgent_days: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent w-24"
                  />
                </div>
              </div>
              {pantries.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-sec">{t('settings.pantryDefault')}</label>
                  <div className="flex gap-2 flex-wrap">
                    {pantries.map(p => (
                      <button
                        key={p.id}
                        onClick={async () => { await api.pantries.setDefault(p.id); api.pantries.getAll().then(setPantries); }}
                        className={[
                          'text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-colors',
                          p.is_default
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-border text-text-sec hover:border-accent/50',
                        ].join(' ')}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Scales ─────────────────────────────────────────────────────────── */}
      <section>
        <h2 className={sectionTitle}>{t('settings.scalesSection')}</h2>
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          {scales.map(s => (
            <div key={s.id} className="flex items-center gap-2">
              <input
                type="text"
                defaultValue={s.name}
                onBlur={e => { if (e.target.value.trim() && e.target.value.trim() !== s.name) handleRenameScale(s.id, e.target.value); }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent"
              />
              <button
                onClick={() => handleSetDefaultScale(s.id)}
                className={[
                  'text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-colors',
                  s.is_default
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-text-sec hover:border-accent/50',
                ].join(' ')}
              >
                {s.is_default ? t('settings.scaleDefault') : t('settings.scaleSetDefault')}
              </button>
              {!s.is_default && (
                <button
                  onClick={() => handleDeleteScale(s.id)}
                  className="text-xs px-2 py-1.5 rounded-lg border border-border text-text-sec hover:text-red hover:border-red/50 cursor-pointer transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center gap-2 pt-2 border-t border-border/50">
            <input
              type="text"
              value={newScaleName}
              onChange={e => setNewScaleName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddScale()}
              placeholder={t('settings.scaleNewPlaceholder')}
              className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
            <button
              onClick={handleAddScale}
              disabled={!newScaleName.trim()}
              className="text-xs px-3 py-1.5 rounded-lg border border-accent text-accent hover:bg-accent/10 cursor-pointer disabled:opacity-40 transition-colors"
            >
              {t('settings.scaleAdd')}
            </button>
          </div>
        </div>
      </section>

      {/* ── Currency ───────────────────────────────────────────────────────── */}
      <section>
        <h2 className={sectionTitle}>{t('settings.currencySymbol')}</h2>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <input
              type="text"
              maxLength={3}
              value={settings.currency_symbol ?? '€'}
              onChange={e => updateSettings({ currency_symbol: e.target.value || '€' })}
              className="w-16 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent text-center"
            />
            <span className="text-sm text-text-sec">{t('settings.currencySymbol')}</span>
          </div>
        </div>
      </section>

      {/* ── Custom Food Database ───────────────────────────────────────────── */}
      <section>
        <h2 className={sectionTitle}>Database alimenti personalizzato</h2>
        <div className="bg-card border border-border rounded-xl p-4 space-y-4">
          <p className="text-sm text-text-sec">
            Carica un file <code className="text-xs bg-bg px-1 py-0.5 rounded">.db</code> SQLite con i tuoi alimenti.
            Verrà consultato prima delle API esterne durante la ricerca per nome o codice a barre.
          </p>

          {customDbStatus.status === 'ok' && customDbStatus.path && (
            <div className="flex items-start gap-3 bg-bg border border-border rounded-lg px-3 py-2.5">
              <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-text truncate" title={customDbStatus.path}>
                  {customDbStatus.path.split(/[\\/]/).pop()}
                </div>
                <div className="text-xs text-text-sec mt-0.5">
                  Tabella: <span className="text-text">{customDbStatus.table}</span>
                  {' · '}
                  <span className="text-text">{customDbStatus.rows?.toLocaleString()}</span> alimenti
                </div>
              </div>
            </div>
          )}

          {customDbStatus.status === 'error' && (
            <div className="flex items-center gap-2 bg-bg border border-red/30 rounded-lg px-3 py-2.5">
              <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              <span className="text-xs text-red-400">{customDbStatus.error}</span>
            </div>
          )}

          {customDbError && (
            <div className="flex items-center gap-2 bg-bg border border-red/30 rounded-lg px-3 py-2.5">
              <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              <span className="text-xs text-red-400">{customDbError}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectCustomDb}
              disabled={customDbLoading}
              className="text-sm px-4 py-2 rounded-lg border border-accent text-accent hover:bg-accent/10 cursor-pointer disabled:opacity-40 transition-colors"
            >
              {customDbLoading ? 'Caricamento…' : customDbStatus.status === 'ok' ? 'Cambia file' : 'Seleziona file .db'}
            </button>
            {customDbStatus.status !== 'none' && (
              <button
                onClick={handleClearCustomDb}
                className="text-sm px-3 py-2 rounded-lg border border-border text-text-sec hover:text-red-400 hover:border-red/50 cursor-pointer transition-colors"
              >
                Rimuovi
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Insights ───────────────────────────────────────────────────────── */}
      <section>
        <h2 className={sectionTitle}>{t('insights.settings.section')}</h2>
        <div className="bg-card border border-border rounded-xl p-4 space-y-4">
          {/* Enable toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => updateSettings({ insights_enabled: settings.insights_enabled === 0 ? 1 : 0 })}
              className={[
                'w-10 h-6 rounded-full transition-colors cursor-pointer flex items-center',
                settings.insights_enabled !== 0 ? 'bg-accent' : 'bg-border',
              ].join(' ')}
            >
              <div className={[
                'w-5 h-5 rounded-full bg-white shadow transition-transform mx-0.5',
                settings.insights_enabled !== 0 ? 'translate-x-4' : 'translate-x-0',
              ].join(' ')} />
            </div>
            <span className="text-sm text-text">{t('insights.settings.enabled')}</span>
          </label>

          {settings.insights_enabled !== 0 && (
            <div className="flex flex-col gap-4 pt-1 border-t border-border/50">
              {/* Use nutrition toggle */}
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => updateSettings({ insights_use_nutrition: settings.insights_use_nutrition === 0 ? 1 : 0 })}
                    className={[
                      'w-10 h-6 rounded-full transition-colors cursor-pointer flex items-center shrink-0',
                      settings.insights_use_nutrition !== 0 ? 'bg-accent' : 'bg-border',
                    ].join(' ')}
                  >
                    <div className={[
                      'w-5 h-5 rounded-full bg-white shadow transition-transform mx-0.5',
                      settings.insights_use_nutrition !== 0 ? 'translate-x-4' : 'translate-x-0',
                    ].join(' ')} />
                  </div>
                  <span className="text-sm text-text">{t('insights.settings.useNutrition')}</span>
                </label>
                <p className="text-xs text-text-sec pl-13 ml-13">{t('insights.settings.useNutritionHelp')}</p>
              </div>

              {/* Include approx days toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => updateSettings({ insights_include_approx_days: settings.insights_include_approx_days === 0 ? 1 : 0 })}
                  className={[
                    'w-10 h-6 rounded-full transition-colors cursor-pointer flex items-center shrink-0',
                    settings.insights_include_approx_days !== 0 ? 'bg-accent' : 'bg-border',
                  ].join(' ')}
                >
                  <div className={[
                    'w-5 h-5 rounded-full bg-white shadow transition-transform mx-0.5',
                    settings.insights_include_approx_days !== 0 ? 'translate-x-4' : 'translate-x-0',
                  ].join(' ')} />
                </div>
                <span className="text-sm text-text">{t('insights.settings.includeApprox')}</span>
              </label>

              {/* Sleep target */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-sec">{t('insights.settings.sleepTarget')}</label>
                <input
                  type="number" min={4} max={12} step={0.5}
                  value={(settings.insights_sleep_target_min ?? 480) / 60}
                  onChange={e => {
                    const h = parseFloat(e.target.value);
                    if (!isNaN(h)) updateSettings({ insights_sleep_target_min: Math.round(h * 60) });
                  }}
                  className="bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent w-24"
                />
              </div>

              {/* Advanced subsection */}
              <div className="border-t border-border/50 pt-3 flex flex-col gap-3">
                <p className="text-xs font-semibold text-text-sec uppercase tracking-wider">{t('insights.settings.advanced')}</p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-text-sec">{t('insights.settings.minPairN')}</label>
                    <input
                      type="number" min={10} max={60}
                      value={settings.insights_min_pair_n ?? 21}
                      onChange={e => {
                        const v = parseInt(e.target.value);
                        if (!isNaN(v)) updateSettings({ insights_min_pair_n: Math.min(60, Math.max(10, v)) });
                      }}
                      className="bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent w-24"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-text-sec">{t('insights.settings.fdrQ')}</label>
                    <input
                      type="number" min={0} max={1} step={0.01}
                      value={settings.insights_fdr_q ?? 0.10}
                      onChange={e => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v)) updateSettings({ insights_fdr_q: Math.min(1, Math.max(0, v)) });
                      }}
                      className="bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent w-24"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-text-sec">{t('insights.settings.windowDays')}</label>
                    <input
                      type="number" min={30} max={365}
                      value={settings.insights_window_days ?? 90}
                      onChange={e => {
                        const v = parseInt(e.target.value);
                        if (!isNaN(v)) updateSettings({ insights_window_days: Math.min(365, Math.max(30, v)) });
                      }}
                      className="bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent w-24"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Check-in giornaliero ───────────────────────────────────────────── */}
      <section>
        <h2 className={sectionTitle}>{t('checkin.settings.section')}</h2>
        <div className="bg-card border border-border rounded-xl p-4 space-y-4">

          {/* Morning */}
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => updateSettings({ checkin_morning_enabled: settings.checkin_morning_enabled === 0 ? 1 : 0 })}
                className={[
                  'w-10 h-6 rounded-full transition-colors cursor-pointer flex items-center shrink-0',
                  settings.checkin_morning_enabled !== 0 ? 'bg-accent' : 'bg-border',
                ].join(' ')}
              >
                <div className={[
                  'w-5 h-5 rounded-full bg-white shadow transition-transform mx-0.5',
                  settings.checkin_morning_enabled !== 0 ? 'translate-x-4' : 'translate-x-0',
                ].join(' ')} />
              </div>
              <span className="text-sm text-text">{t('checkin.settings.morning')}</span>
            </label>
            <p className="text-xs text-text-sec ml-13">{t('checkin.settings.morningDesc')}</p>
          </div>

          {/* Evening */}
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => updateSettings({ checkin_evening_enabled: settings.checkin_evening_enabled === 1 ? 0 : 1 })}
                className={[
                  'w-10 h-6 rounded-full transition-colors cursor-pointer flex items-center shrink-0',
                  settings.checkin_evening_enabled === 1 ? 'bg-accent' : 'bg-border',
                ].join(' ')}
              >
                <div className={[
                  'w-5 h-5 rounded-full bg-white shadow transition-transform mx-0.5',
                  settings.checkin_evening_enabled === 1 ? 'translate-x-4' : 'translate-x-0',
                ].join(' ')} />
              </div>
              <span className="text-sm text-text">{t('checkin.settings.evening')}</span>
            </label>
            <p className="text-xs text-text-sec ml-13">{t('checkin.settings.eveningDesc')}</p>
          </div>

        </div>
      </section>

      {/* ── Apple Health ───────────────────────────────────────────────────── */}
      <section>
        <h2 className={sectionTitle}>Apple Health</h2>
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <p className="text-sm text-text-sec">
            Sync workouts, active calories, and body fat% from Apple Health to LifeBuddy.
          </p>
          <div className="flex items-center gap-3">
            <button disabled className="px-4 py-2 rounded-md text-sm font-medium bg-card border border-border text-text-sec opacity-50 cursor-not-allowed">
              Connect Apple Health
            </button>
            <span className="text-xs text-text-sec bg-border/50 px-2 py-0.5 rounded-full">Coming soon</span>
          </div>
          <p className="text-xs text-text-sec">Available on macOS. Requires HealthKit permission.</p>
        </div>
      </section>
    </div>
  );
}
