import { useEffect, useState, useCallback } from 'react';
import { useT } from '../i18n/useT';
import { useToast } from '../components/Toast';
import { api } from '../api';
import PageHeader from '../components/ui/PageHeader';
import { today } from '../lib/dateUtil';
import type { SuggestionsBundle, SuggestionFood, SuggestionCombo, Meal } from '../types';

export default function SuggestionsPage() {
  const { t } = useT();
  const { showToast } = useToast();
  const [bundle, setBundle] = useState<SuggestionsBundle | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    api.suggestions.getBundle().then(b => { setBundle(b); setLoading(false); });
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function logFood(food: SuggestionFood, slot: Meal) {
    const grams = food.piece_grams ?? 100;
    await api.log.add({ food_id: food.id, grams, meal: slot, date: today(), status: 'logged' });
    showToast(`${food.name} · ${grams}g`);
    reload();
  }

  async function logCombo(c: SuggestionCombo, slot: Meal) {
    const a_g = c.a.piece_grams ?? 100;
    const b_g = c.b.piece_grams ?? 100;
    await api.log.add({ food_id: c.a.id, grams: a_g, meal: slot, date: today(), status: 'logged' });
    await api.log.add({ food_id: c.b.id, grams: b_g, meal: slot, date: today(), status: 'logged' });
    showToast(`${c.a.name} + ${c.b.name}`);
    reload();
  }

  if (loading || !bundle) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <PageHeader eyebrow={t('eyebrow.suggestions')} title={t('page.suggestions')} />
        <p className="text-text-sec text-sm">…</p>
      </div>
    );
  }

  const slot = bundle.slot;
  const slotLabel = t(mealLabelKey(slot));

  const sections: { key: string; title: string; subtitle: string; items: SuggestionFood[] }[] = [
    {
      key: 'forgotten',
      title: t('sug.forgottenTitle'),
      subtitle: t('sug.forgottenHint'),
      items: bundle.forgottenFavorites,
    },
    {
      key: 'triedFew',
      title: t('sug.triedFewTitle'),
      subtitle: t('sug.triedFewHint'),
      items: bundle.triedFew,
    },
    {
      key: 'rotationGap',
      title: t('sug.rotationGapTitle'),
      subtitle: t('sug.rotationGapHint'),
      items: bundle.rotationGap,
    },
    {
      key: 'fromPantry',
      title: t('sug.fromPantryTitle'),
      subtitle: t('sug.fromPantryHint'),
      items: bundle.fromPantry,
    },
    {
      key: 'neverTried',
      title: t('sug.neverTriedTitle'),
      subtitle: t('sug.neverTriedHint'),
      items: bundle.neverTried,
    },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader eyebrow={t('eyebrow.suggestions')} title={t('page.suggestions')} />

      <p className="text-xs text-text-sec">{t('sug.intro').replace('{slot}', slotLabel)}</p>

      {/* Combos for current slot */}
      {bundle.combos.length > 0 && (
        <Section
          title={`${t('sug.combosTitle')} · ${slotLabel}`}
          subtitle={t('sug.combosHint')}
          empty={false}
        >
          <div className="flex gap-2 overflow-x-auto pb-1">
            {bundle.combos.map((c, i) => (
              <button
                key={i}
                onClick={() => logCombo(c, slot)}
                className="shrink-0 rounded-xl border border-border bg-card hover:border-accent hover:bg-accent/5 transition-colors text-left p-3 min-w-[200px] max-w-[260px] cursor-pointer"
                title={t('sug.logBoth')}
              >
                <div className="text-text font-medium leading-tight">{c.a.name}</div>
                <div className="text-text-sec text-xs">+ {c.b.name}</div>
                <div className="text-[10px] text-accent/70 uppercase tracking-wider mt-1">{c.cnt}× {t('sug.together')}</div>
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* The 5 food sections */}
      {sections.map(s => (
        <Section
          key={s.key}
          title={s.title}
          subtitle={s.subtitle}
          empty={s.items.length === 0}
          emptyText={t('sug.empty')}
        >
          <div className="flex gap-2 overflow-x-auto pb-1">
            {s.items.map(f => (
              <SuggestionCard key={f.id} food={f} onLog={() => logFood(f, slot)} t={t} />
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}

function mealLabelKey(m: Meal): string {
  return 'meal.' + m[0].toLowerCase() + m.slice(1);
}

interface SectionProps {
  title: string;
  subtitle: string;
  empty: boolean;
  emptyText?: string;
  children: React.ReactNode;
}

function Section({ title, subtitle, empty, emptyText, children }: SectionProps) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold text-text uppercase tracking-wider">{title}</h2>
        <p className="text-xs text-text-sec/80">{subtitle}</p>
      </div>
      {empty ? (
        <p className="text-text-sec/60 text-xs italic">{emptyText}</p>
      ) : children}
    </section>
  );
}

interface CardProps {
  food: SuggestionFood;
  onLog: () => void;
  t: (k: string, vars?: Record<string, string | number>) => string;
}

function SuggestionCard({ food, onLog, t }: CardProps) {
  const cat = food.category ?? 'other';
  return (
    <button
      onClick={onLog}
      title={t('sug.logNow')}
      className="shrink-0 rounded-xl border border-border bg-card hover:border-accent hover:bg-accent/5 transition-colors text-left p-3 w-[180px] cursor-pointer"
    >
      <div className="text-text font-medium leading-tight line-clamp-2 min-h-[2.4em]">{food.name}</div>
      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-text-sec uppercase tracking-wider">
        <span>{t(`food.category.${cat}`)}</span>
        {food.last_date && <>· <span className="tabular-nums">{food.last_date}</span></>}
        {food.total_count != null && food.total_count > 0 && <>· {food.total_count}×</>}
        {food.total_in_pantry_g != null && <>· {Math.round(food.total_in_pantry_g)}g</>}
      </div>
      <div className="text-[10px] text-text-sec/70 mt-1 tabular-nums">
        {Math.round(food.calories)} kcal · P{Math.round(food.protein)} C{Math.round(food.carbs)} F{Math.round(food.fat)}
      </div>
    </button>
  );
}
