import { useState, useEffect } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useT } from '../i18n/useT';
import { api } from '../api';
import SettingsSection from '../components/ui/SettingsSection';
import PageHeader from '../components/ui/PageHeader';
import type { PantryLocation, Scale } from '../types';

export default function SettingsPage() {
  const { t } = useT();
  const { settings, updateSettings } = useSettings();
  const [pantries, setPantries] = useState<PantryLocation[]>([]);
  const [scales, setScales] = useState<Scale[]>([]);
  const [newScaleName, setNewScaleName] = useState('');

  useEffect(() => { api.pantries.getAll().then(setPantries); }, []);
  useEffect(() => { api.scales.getAll().then(setScales); }, []);

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

  const currentTheme = settings.theme    ?? 'dark';
  const currentLang  = settings.language ?? 'en';

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader eyebrow={t('eyebrow.settings')} title={t('page.settings')} />

      <SettingsSection title={t('settings.language')} bare>
        <div className="flex gap-3">
          {(['en', 'it'] as const).map(lang => (
            <button
              key={lang}
              onClick={() => updateSettings({ language: lang })}
              className={[
                'px-4 py-2 rounded-lg text-sm font-medium border transition-all cursor-pointer',
                currentLang === lang
                  ? 'bg-accent text-white border-accent'
                  : 'bg-transparent text-text-sec border-border hover:border-accent/50 hover:text-text',
              ].join(' ')}
            >
              {lang === 'en' ? '🇬🇧 English' : '🇮🇹 Italiano'}
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.theme')} bare>
        <div className="flex gap-3">
          {(['dark', 'light'] as const).map(theme => (
            <button
              key={theme}
              onClick={() => updateSettings({ theme })}
              className={[
                'px-4 py-2 rounded-lg text-sm font-medium border transition-all cursor-pointer',
                currentTheme === theme
                  ? 'bg-accent text-white border-accent'
                  : 'bg-transparent text-text-sec border-border hover:border-accent/50 hover:text-text',
              ].join(' ')}
            >
              {theme === 'dark' ? `🌙 ${t('settings.dark')}` : `☀️ ${t('settings.light')}`}
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.pantrySection')}>
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

              {/* Shopping prompt configuration */}
              <div className="flex flex-col gap-2 pt-3 border-t border-border">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => updateSettings({ shopping_prompt_enabled: settings.shopping_prompt_enabled === 0 ? 1 : 0 })}
                    className={[
                      'w-10 h-6 rounded-full transition-colors cursor-pointer flex items-center',
                      settings.shopping_prompt_enabled !== 0 ? 'bg-accent' : 'bg-border',
                    ].join(' ')}
                  >
                    <div className={[
                      'w-5 h-5 rounded-full bg-white shadow transition-transform mx-0.5',
                      settings.shopping_prompt_enabled !== 0 ? 'translate-x-4' : 'translate-x-0',
                    ].join(' ')} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm text-text">{t('settings.shoppingPromptEnabled')}</span>
                    <span className="text-[11px] text-text-sec/70">{t('settings.shoppingPromptHint')}</span>
                  </div>
                </label>
                {settings.shopping_prompt_enabled !== 0 && (
                  <div className="flex flex-col gap-1.5 pl-13">
                    <label className="text-xs text-text-sec">{t('settings.shoppingPromptThreshold')}</label>
                    <select
                      value={settings.shopping_prompt_threshold}
                      onChange={e => updateSettings({ shopping_prompt_threshold: parseInt(e.target.value, 10) })}
                      className="bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent w-fit cursor-pointer"
                    >
                      <option value={0}>{t('settings.shoppingPromptOnLast')}</option>
                      <option value={1}>{t('settings.shoppingPromptOnLastOrSecondLast')}</option>
                      <option value={2}>{t('settings.shoppingPromptOnLastFew')}</option>
                      <option value={99}>{t('settings.shoppingPromptAlways')}</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}
      </SettingsSection>

      <SettingsSection title={t('settings.extraNutritionSection')}>
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => updateSettings({ track_extra_nutrition: settings.track_extra_nutrition === 0 ? 1 : 0 })}
            className={[
              'w-10 h-6 rounded-full transition-colors cursor-pointer flex items-center',
              settings.track_extra_nutrition !== 0 ? 'bg-accent' : 'bg-border',
            ].join(' ')}
          >
            <div className={[
              'w-5 h-5 rounded-full bg-white shadow transition-transform mx-0.5',
              settings.track_extra_nutrition !== 0 ? 'translate-x-4' : 'translate-x-0',
            ].join(' ')} />
          </div>
          <span className="text-sm text-text">{t('settings.trackExtraNutrition')}</span>
        </label>
        {settings.track_extra_nutrition !== 0 && (
          <div className="flex flex-col gap-1.5 pt-1">
            <label className="text-xs text-text-sec">{t('settings.displayAs')}</label>
            <div className="flex gap-2">
              {(['sodium', 'salt'] as const).map(unit => (
                <button
                  key={unit}
                  onClick={() => updateSettings({ extra_nutrition_unit: unit })}
                  className={[
                    'text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-colors',
                    settings.extra_nutrition_unit === unit
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-text-sec hover:border-accent/50',
                  ].join(' ')}
                >
                  {unit === 'sodium' ? t('settings.sodiumMg') : t('settings.saltG')}
                </button>
              ))}
            </div>
          </div>
        )}
      </SettingsSection>

      <SettingsSection title={t('settings.offCountrySection')}>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-text-sec">{t('settings.offCountryHint')}</label>
          <select
            value={settings.off_country}
            onChange={e => updateSettings({ off_country: e.target.value })}
            className="bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent w-fit cursor-pointer"
          >
            <option value="world">🌍 Worldwide</option>
            <option value="it">🇮🇹 Italia</option>
            <option value="us">🇺🇸 United States</option>
            <option value="fr">🇫🇷 France</option>
            <option value="de">🇩🇪 Deutschland</option>
            <option value="es">🇪🇸 España</option>
            <option value="uk">🇬🇧 United Kingdom</option>
          </select>
          <p className="text-[11px] text-text-sec/70 leading-relaxed pt-2 border-t border-border mt-1">
            {t('settings.offAttribution')}{' '}
            <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Open Food Facts</a>
            {' · '}
            <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">ODbL</a>
          </p>

          <label className="flex items-center gap-3 cursor-pointer pt-3 border-t border-border mt-1">
            <div
              onClick={() => updateSettings({ off_disable_online: settings.off_disable_online === 0 ? 1 : 0 })}
              className={[
                'w-10 h-6 rounded-full transition-colors cursor-pointer flex items-center',
                settings.off_disable_online !== 0 ? 'bg-accent' : 'bg-border',
              ].join(' ')}
            >
              <div className={[
                'w-5 h-5 rounded-full bg-white shadow transition-transform mx-0.5',
                settings.off_disable_online !== 0 ? 'translate-x-4' : 'translate-x-0',
              ].join(' ')} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-text">{t('settings.offDisableOnline')}</span>
              <span className="text-[11px] text-text-sec/70">{t('settings.offDisableOnlineHint')}</span>
            </div>
          </label>
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.scalesSection')}>
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
      </SettingsSection>

      <SettingsSection title={t('settings.currencySymbol')}>
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
      </SettingsSection>

      <SettingsSection title="Apple Health">
          <p className="text-sm text-text-sec">
            Sync workouts, active calories, and body fat% from Apple Health to CalorieCounter.
          </p>
          <div className="flex items-center gap-3">
            <button disabled className="px-4 py-2 rounded-lg text-sm font-medium bg-card border border-border text-text-sec opacity-50 cursor-not-allowed">
              Connect Apple Health
            </button>
            <span className="text-xs text-text-sec bg-border/50 px-2 py-0.5 rounded-full">Coming soon</span>
          </div>
          <p className="text-xs text-text-sec">Available on macOS. Requires HealthKit permission.</p>
      </SettingsSection>
    </div>
  );
}
