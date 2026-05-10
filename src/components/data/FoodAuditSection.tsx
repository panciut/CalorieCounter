import { useEffect, useState, useMemo } from 'react';
import { useT } from '../../i18n/useT';
import { useNavigate } from '../../hooks/useNavigate';
import { api } from '../../api';
import type { FoodAuditRow } from '../../types';

const FIELD_LABEL_KEY: Record<string, string> = {
  calories: 'audit.fld.calories',
  macros:   'audit.fld.macros',
  category: 'audit.fld.category',
  barcode:  'audit.fld.barcode',
  sizing:   'audit.fld.sizing',
  opened_days: 'audit.fld.openedDays',
  price:    'audit.fld.price',
  sugar:    'audit.fld.sugar',
  sat_fat:  'audit.fld.satFat',
  sodium:   'audit.fld.sodium',
};

const FIELD_ORDER = ['calories','macros','category','barcode','sizing','opened_days','price','sugar','sat_fat','sodium'];

/** Foods missing one or more values across categorization, sizing, macros, etc.
 *  Filter by missing field; click a row to jump to FoodsPage to fix it. */
export default function FoodAuditSection() {
  const { t } = useT();
  const { navigate } = useNavigate();
  const [rows, setRows] = useState<FoodAuditRow[] | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    api.audit.foodsMissing().then(setRows);
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of FIELD_ORDER) c[f] = 0;
    for (const r of rows ?? []) for (const m of r.missing) c[m] = (c[m] ?? 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (filter === 'all') return rows;
    return rows.filter(r => r.missing.includes(filter));
  }, [rows, filter]);

  if (!rows) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold text-text-sec uppercase tracking-wider">{t('audit.title')}</h2>

      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <p className="text-sm text-text-sec">
          {t('audit.summary').replace('{n}', String(rows.length))}
        </p>

        {/* Filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={['text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer',
              filter === 'all' ? 'border-accent text-accent bg-accent/10' : 'border-border text-text-sec hover:border-accent/50'].join(' ')}
          >{t('audit.all')} · {rows.length}</button>
          {FIELD_ORDER.map(f => {
            if (counts[f] === 0) return null;
            const active = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={['text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer',
                  active ? 'border-accent text-accent bg-accent/10' : 'border-border text-text-sec hover:border-accent/50'].join(' ')}
              >{t(FIELD_LABEL_KEY[f] ?? f)} · {counts[f]}</button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <p className="text-text-sec/70 text-xs italic">{t('audit.empty')}</p>
        ) : (
          <div className="overflow-auto max-h-[420px] border border-border rounded-lg">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="text-text-sec text-xs uppercase tracking-wider border-b border-border">
                  <th className="text-left px-3 py-2">{t('th.food')}</th>
                  <th className="text-left px-3 py-2">{t('foods.category')}</th>
                  <th className="text-left px-3 py-2">{t('audit.missingHeader')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr
                    key={r.id}
                    onClick={() => navigate('foods')}
                    className="border-t border-border/30 hover:bg-bg/50 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2 text-text">
                      {r.name}
                      {r.is_variant && <span className="ml-1.5 text-[10px] text-text-sec/70">↳</span>}
                    </td>
                    <td className="px-3 py-2 text-text-sec text-xs">{t(`food.category.${r.category}`)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {r.missing.map(m => (
                          <span key={m} className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-bg border border-border text-text-sec">
                            {t(FIELD_LABEL_KEY[m] ?? m)}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
