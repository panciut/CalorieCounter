import { useMemo, useState } from 'react';
import { useT } from '../../i18n/useT';
import { useToast } from '../Toast';
import { api } from '../../api';
import ConfirmDialog from '../ConfirmDialog';
import GroupWithDialog from './GroupWithDialog';
import PromoteToGenericDialog from './PromoteToGenericDialog';
import NewGroupDialog from './NewGroupDialog';
import type { Food } from '../../types';

interface Props {
  foods: Food[];
  onChanged: () => void;
}

interface GroupNode {
  canonical: Food;
  variants: Food[];
}

export default function GroupsTab({ foods, onChanged }: Props) {
  const { t } = useT();
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [confirmUngroup, setConfirmUngroup] = useState<number | null>(null);
  const [groupWith, setGroupWith] = useState<Food | null>(null);
  const [promote, setPromote] = useState<Food | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [solosVisible, setSolosVisible] = useState(false);

  const { groups, solos, orphans } = useMemo(() => {
    const byId = new Map<number, Food>(foods.map(f => [f.id, f]));
    const variantsByCanonical = new Map<number, Food[]>();
    for (const f of foods) {
      if (f.group_id != null) {
        if (!variantsByCanonical.has(f.group_id)) variantsByCanonical.set(f.group_id, []);
        variantsByCanonical.get(f.group_id)!.push(f);
      }
    }
    const groups: GroupNode[] = [];
    const solos: Food[] = [];
    const orphans: Food[] = []; // group_id pointing at a missing canonical (shouldn't happen)
    for (const f of foods) {
      if (f.group_id == null) {
        const variants = variantsByCanonical.get(f.id) ?? [];
        if (variants.length > 0) {
          groups.push({ canonical: f, variants: [...variants].sort((a, b) => a.name.localeCompare(b.name)) });
        } else {
          solos.push(f);
        }
      } else if (!byId.has(f.group_id)) {
        orphans.push(f);
      }
    }
    groups.sort((a, b) => a.canonical.name.localeCompare(b.canonical.name));
    solos.sort((a, b) => a.name.localeCompare(b.name));
    return { groups, solos, orphans };
  }, [foods]);

  function toggleExpanded(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleRecompute(canonicalId: number) {
    await api.foods.recomputeGroupAverages(canonicalId);
    showToast(t('foods.recomputedAverages'));
    onChanged();
  }

  async function handleUngroup(variantId: number) {
    await api.foods.ungroup(variantId);
    setConfirmUngroup(null);
    showToast(t('common.saved'));
    onChanged();
  }

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <h2 className="text-sm font-semibold text-text-sec uppercase tracking-wider">{t('foods.tabGroups')}</h2>
        <span className="text-xs text-text-sec">·</span>
        <span className="text-xs text-text-sec tabular-nums">{groups.length} {t('foods.groupCount')}</span>
        {orphans.length > 0 && <span className="text-xs text-red">· {orphans.length} {t('foods.orphans')}</span>}
        <button
          onClick={() => setNewGroupOpen(true)}
          className="ml-auto text-xs text-accent border border-accent/40 hover:bg-accent/10 rounded-lg px-2 py-1 cursor-pointer transition-colors"
        >+ {t('foods.newGroup')}</button>
        <button
          onClick={() => setSolosVisible(v => !v)}
          className="text-xs text-text-sec border border-border rounded-lg px-2 py-1 hover:border-accent hover:text-accent cursor-pointer"
        >{solosVisible ? t('foods.hideSolos') : t('foods.showSolos').replace('{n}', String(solos.length))}</button>
      </div>

      <div className="overflow-auto flex-1 rounded-xl border border-border">
        {groups.length === 0 ? (
          <p className="p-4 text-sm text-text-sec">{t('foods.noGroups')}</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {groups.map(g => {
              const open = expanded.has(g.canonical.id);
              return (
                <li key={g.canonical.id}>
                  <div
                    className="flex items-center gap-2 px-3 py-2 hover:bg-bg/40 cursor-pointer"
                    onClick={() => toggleExpanded(g.canonical.id)}
                  >
                    <span className="text-text-sec/60 text-xs w-3">{open ? '▾' : '▸'}</span>
                    <span className="text-text font-medium">{g.canonical.name}</span>
                    <span className="text-[10px] uppercase tracking-wider text-accent/80">
                      {g.variants.length} {t('foods.variants')}
                    </span>
                    <span className="text-xs text-text-sec/70 tabular-nums ml-auto">
                      {Math.round(g.canonical.calories)} kcal · P{g.canonical.protein} C{g.canonical.carbs} F{g.canonical.fat}
                    </span>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); handleRecompute(g.canonical.id); }}
                      className="text-[10px] uppercase tracking-wider text-text-sec hover:text-accent border border-border hover:border-accent rounded px-1.5 py-0.5 cursor-pointer transition-colors"
                      title={t('foods.recomputeAvg')}
                    >Σ</button>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setGroupWith(g.canonical); }}
                      className="text-[10px] uppercase tracking-wider text-text-sec hover:text-accent border border-border hover:border-accent rounded px-1.5 py-0.5 cursor-pointer transition-colors"
                      title={t('foods.addVariant')}
                    >+</button>
                  </div>

                  {open && (
                    <ul className="bg-bg/30 divide-y divide-border/30">
                      {g.variants.map(v => (
                        <li key={v.id} className="flex items-center gap-2 px-3 py-1.5 pl-9">
                          <span className="text-text-sec/60 text-xs">↳</span>
                          <span className="text-text text-sm">{v.name}</span>
                          {v.barcode && <span className="text-[10px] text-text-sec/60 tabular-nums">{v.barcode}</span>}
                          <span className="text-xs text-text-sec/70 tabular-nums ml-auto">
                            {Math.round(v.calories)} kcal · P{v.protein} C{v.carbs} F{v.fat}
                          </span>
                          <button
                            type="button"
                            onClick={() => setConfirmUngroup(v.id)}
                            className="text-[10px] uppercase tracking-wider text-text-sec hover:text-red border border-border hover:border-red rounded px-1.5 py-0.5 cursor-pointer transition-colors"
                            title={t('foods.ungroup')}
                          >{t('foods.ungroup')}</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {solosVisible && (
          <div className="border-t border-border">
            <p className="px-3 py-2 text-xs uppercase tracking-wider text-text-sec/70">
              {t('foods.solosTitle')} · {solos.length}
            </p>
            <ul className="divide-y divide-border/30">
              {solos.map(f => (
                <li key={f.id} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="text-text text-sm">{f.name}</span>
                  <span className="text-[10px] text-text-sec/60">{f.category}</span>
                  <span className="text-xs text-text-sec/70 tabular-nums ml-auto">
                    {Math.round(f.calories)} kcal
                  </span>
                  <button
                    type="button"
                    onClick={() => setGroupWith(f)}
                    className="text-[10px] uppercase tracking-wider text-text-sec hover:text-accent border border-border hover:border-accent rounded px-1.5 py-0.5 cursor-pointer transition-colors"
                    title={t('foods.groupWith')}
                  >🔗</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {confirmUngroup !== null && (
        <ConfirmDialog
          message={t('foods.confirmUngroupMsg')}
          confirmLabel={t('foods.ungroup')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => handleUngroup(confirmUngroup)}
          onCancel={() => setConfirmUngroup(null)}
        />
      )}

      {groupWith && (
        <GroupWithDialog
          food={groupWith}
          onClose={() => setGroupWith(null)}
          onGrouped={() => { setGroupWith(null); onChanged(); showToast(t('common.saved')); }}
        />
      )}

      {promote && (
        <PromoteToGenericDialog
          food={promote}
          onClose={() => setPromote(null)}
          onPromoted={() => { setPromote(null); onChanged(); }}
        />
      )}

      {newGroupOpen && (
        <NewGroupDialog
          candidates={solos}
          onClose={() => setNewGroupOpen(false)}
          onCreated={() => { setNewGroupOpen(false); onChanged(); }}
        />
      )}
    </div>
  );
}
