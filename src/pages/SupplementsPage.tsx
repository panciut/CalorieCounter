import { useEffect, useState } from 'react';
import { useT } from '../i18n/useT';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import Tabs from '../components/ui/Tabs';
import ModalFooter from '../components/ui/ModalFooter';
import PageHeader from '../components/ui/PageHeader';
import { api } from '../api';
import {
  SUPPLEMENT_TIME_ORDER,
  type Supplement, type SupplementPlanItem, type SupplementPlanWithItems, type SupplementTime,
} from '../types';

type Tab = 'catalog' | 'plan';

// ── Plan editor (module-level) ─────────────────────────────────────────────────
interface PlanRow {
  supplement_id: number;
  name: string;
  qty: string;
  unit: string;
  notes: string;
  time_of_day: SupplementTime;
}

interface PlanEditorProps {
  catalog: Supplement[];
  initialItems: SupplementPlanItem[];
  onSave: (items: { supplement_id: number; qty: number; unit: string; notes: string; time_of_day: SupplementTime }[]) => void;
  onCancel: () => void;
  t: ReturnType<typeof useT>['t'];
}

function PlanEditor({ catalog, initialItems, onSave, onCancel, t }: PlanEditorProps) {
  const [rows, setRows] = useState<PlanRow[]>(
    initialItems.map(i => ({
      supplement_id: i.supplement_id,
      name: i.name,
      qty: String(i.qty),
      unit: i.unit,
      notes: i.notes,
      time_of_day: i.time_of_day ?? 'breakfast',
    }))
  );
  const [addId, setAddId] = useState<number | ''>('');

  const usedIds = new Set(rows.map(r => r.supplement_id));
  const available = catalog.filter(s => !usedIds.has(s.id));

  function addRow() {
    const id = Number(addId);
    if (!id) return;
    const s = catalog.find(c => c.id === id);
    if (!s) return;
    setRows(prev => [...prev, { supplement_id: id, name: s.name, qty: '1', unit: '', notes: '', time_of_day: 'breakfast' }]);
    setAddId('');
  }

  function removeRow(supplementId: number) {
    setRows(prev => prev.filter(r => r.supplement_id !== supplementId));
  }

  function patch(supplementId: number, partial: Partial<PlanRow>) {
    setRows(prev => prev.map(r => r.supplement_id === supplementId ? { ...r, ...partial } : r));
  }

  function handleSave() {
    onSave(rows.map(r => ({
      supplement_id: r.supplement_id,
      qty: parseInt(r.qty) || 1,
      unit: r.unit.trim(),
      notes: r.notes.trim(),
      time_of_day: r.time_of_day,
    })));
  }

  const inputCls = 'rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text focus:outline-none focus:border-accent';

  return (
    <div className="flex flex-col gap-4">
      {/* Row list */}
      {rows.length === 0 && (
        <p className="text-sm text-text-sec py-2 text-center">{t('suppl.noPlan')}</p>
      )}
      {rows.length > 0 && (
        <div className="flex flex-col divide-y divide-border/40">
          {rows.map(row => (
            <div key={row.supplement_id} className="py-3 flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium text-text min-w-24 flex-1">{row.name}</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <select
                  value={row.time_of_day}
                  onChange={e => patch(row.supplement_id, { time_of_day: e.target.value as SupplementTime })}
                  className={`${inputCls} w-32`}
                >
                  {SUPPLEMENT_TIME_ORDER.map(slot => (
                    <option key={slot} value={slot}>{t(`suppl.time.${slot}`)}</option>
                  ))}
                </select>
                <input
                  type="text" inputMode="decimal"
                  value={row.qty}
                  onChange={e => patch(row.supplement_id, { qty: e.target.value })}
                  placeholder="1"
                  className={`${inputCls} w-12 text-center`}
                />
                <input
                  type="text"
                  value={row.unit}
                  onChange={e => patch(row.supplement_id, { unit: e.target.value })}
                  placeholder={t('suppl.unitPlaceholder')}
                  className={`${inputCls} w-24`}
                />
                <input
                  type="text"
                  value={row.notes}
                  onChange={e => patch(row.supplement_id, { notes: e.target.value })}
                  placeholder={t('suppl.notes')}
                  className={`${inputCls} w-36`}
                />
                <button
                  onClick={() => removeRow(row.supplement_id)}
                  className="text-text-sec hover:text-red cursor-pointer text-sm px-1"
                >✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add supplement */}
      {available.length > 0 && (
        <div className="flex gap-2 items-center">
          <select
            value={addId}
            onChange={e => setAddId(Number(e.target.value) || '')}
            className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
          >
            <option value="">{t('suppl.addToPlan')}</option>
            {available.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button
            onClick={addRow}
            disabled={!addId}
            className="px-3 py-2 rounded-lg bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 cursor-pointer disabled:opacity-40 transition-colors"
          >+</button>
        </div>
      )}

      <ModalFooter
        onCancel={onCancel}
        onConfirm={handleSave}
        cancelLabel={t('common.cancel')}
        confirmLabel={t('common.save')}
        className="border-t border-border pt-3"
      />
    </div>
  );
}

// ── Supplement detail modal (module-level) ────────────────────────────────────
interface SupplementDetailModalProps {
  supplement: Supplement;
  onSave: (id: number, name: string, description: string) => void;
  onDelete: (s: Supplement) => void;
  onClose: () => void;
  t: ReturnType<typeof useT>['t'];
}

function SupplementDetailModal({ supplement, onSave, onDelete, onClose, t }: SupplementDetailModalProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(supplement.name);
  const [editDesc, setEditDesc] = useState(supplement.description ?? '');

  const inputCls = 'w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent';

  function handleSave() {
    if (!editName.trim()) return;
    onSave(supplement.id, editName.trim(), editDesc.trim());
  }

  return (
    <Modal isOpen onClose={onClose} title={editing ? t('suppl.editSupplement') : supplement.name} width="max-w-md">
      <div className="flex flex-col gap-4">
        {editing ? (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-sec uppercase tracking-wide">{t('suppl.name')}</label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                autoFocus
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-sec uppercase tracking-wide">{t('suppl.description')}</label>
              <textarea
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                rows={3}
                placeholder={t('suppl.descPlaceholder')}
                className={`${inputCls} resize-none`}
              />
            </div>
            <ModalFooter
              onCancel={() => { setEditing(false); setEditName(supplement.name); setEditDesc(supplement.description ?? ''); }}
              onConfirm={handleSave}
              cancelLabel={t('common.cancel')}
              confirmLabel={t('common.save')}
              confirmDisabled={!editName.trim()}
              className="pt-1"
            />
          </>
        ) : (
          <>
            {supplement.description ? (
              <p className="text-sm text-text-sec leading-relaxed">{supplement.description}</p>
            ) : (
              <p className="text-sm text-text-sec/50 italic">{t('suppl.descPlaceholder')}</p>
            )}
            <div className="flex gap-2 justify-between pt-1">
              <button
                onClick={() => onDelete(supplement)}
                className="px-3 py-2 rounded-xl text-sm text-red border border-red/30 hover:bg-red/10 cursor-pointer transition-colors"
              >{t('common.delete')}</button>
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:opacity-90 cursor-pointer"
              >{t('suppl.editSupplement')}</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function SupplementsPage() {
  const { t } = useT();
  const { showToast } = useToast();

  const [tab, setTab]               = useState<Tab>('plan');
  const [catalog, setCatalog]       = useState<Supplement[]>([]);
  const [currentPlan, setCurrentPlan] = useState<SupplementPlanWithItems | null | undefined>(undefined);
  const [editingPlan, setEditingPlan] = useState(false);

  // Catalog state
  const [newName, setNewName]           = useState('');
  const [newDesc, setNewDesc]           = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Supplement | null>(null);
  const [detailTarget, setDetailTarget] = useState<Supplement | null>(null);

  async function loadCatalog() {
    setCatalog(await api.supplements.getAll());
  }

  async function loadPlan() {
    setCurrentPlan(await api.supplementPlan.getCurrent());
  }

  useEffect(() => {
    loadCatalog();
    loadPlan();
  }, []);

  async function handleAddCatalog() {
    const name = newName.trim();
    if (!name) return;
    await api.supplements.add({ name, description: newDesc.trim() || undefined });
    setNewName('');
    setNewDesc('');
    showToast(t('common.saved'));
    loadCatalog();
  }

  async function handleUpdateSupplement(id: number, name: string, description: string) {
    await api.supplements.update({ id, name, description: description || undefined });
    showToast(t('common.saved'));
    setDetailTarget(null);
    loadCatalog();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const result = await api.supplements.delete(deleteTarget.id);
    setDeleteTarget(null);
    if (!result.ok) {
      showToast(t('suppl.cannotDelete'), 'error');
      return;
    }
    showToast('Deleted');
    loadCatalog();
    loadPlan();
  }

  async function handleSavePlan(items: { supplement_id: number; qty: number; unit: string; notes: string; time_of_day: SupplementTime }[]) {
    await api.supplementPlan.save({ items });
    setEditingPlan(false);
    showToast(t('common.saved'));
    loadPlan();
  }

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col gap-0 h-full min-h-0">
      <PageHeader eyebrow={t('eyebrow.supplements')} title={t('page.supplements')} className="mb-4" />

      <Tabs<Tab>
        items={[{ id: 'plan', label: t('suppl.plan') }, { id: 'catalog', label: t('suppl.catalog') }]}
        active={tab}
        onChange={setTab}
        className="mb-6"
      />

      <div className="flex-1 min-h-0 overflow-y-auto">

        {/* ── CATALOG TAB ────────────────────────────────────────────────── */}
        {tab === 'catalog' && (
          <div className="flex flex-col gap-4">
            {/* Add form */}
            <div className="flex flex-col gap-2 border border-border rounded-xl p-4 bg-card">
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCatalog()}
                placeholder={t('suppl.namePlaceholder')}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent"
              />
              <textarea
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                rows={2}
                placeholder={t('suppl.descPlaceholder')}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent resize-none"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleAddCatalog}
                  disabled={!newName.trim()}
                  className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 cursor-pointer disabled:opacity-40"
                >{t('suppl.addTitle')}</button>
              </div>
            </div>

            {/* List */}
            {catalog.length === 0 ? (
              <p className="text-text-sec text-sm py-4 text-center">{t('suppl.noSupplements')}</p>
            ) : (
              <div className="flex flex-col divide-y divide-border/50">
                {catalog.map(s => (
                  <div
                    key={s.id}
                    className="py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-card-hover rounded-lg px-2 -mx-2 transition-colors"
                    onClick={() => setDetailTarget(s)}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm text-text">{s.name}</span>
                      {s.description && (
                        <span className="text-xs text-text-sec truncate">{s.description}</span>
                      )}
                    </div>
                    <span className="text-text-sec/50 text-sm shrink-0">›</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PLAN TAB ───────────────────────────────────────────────────── */}
        {tab === 'plan' && (
          <div className="flex flex-col gap-4">
            {editingPlan ? (
              <>
                <div className="text-sm font-semibold text-text">{t('suppl.editPlan')}</div>
                <PlanEditor
                  catalog={catalog}
                  initialItems={currentPlan?.items ?? []}
                  onSave={handleSavePlan}
                  onCancel={() => setEditingPlan(false)}
                  t={t}
                />
              </>
            ) : currentPlan === undefined ? (
              <p className="text-text-sec text-sm py-4 text-center">…</p>
            ) : currentPlan === null ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <p className="text-text-sec text-sm">{t('suppl.noPlan')}</p>
                <button
                  onClick={() => setEditingPlan(true)}
                  className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 cursor-pointer"
                >{t('suppl.createPlan')}</button>
              </div>
            ) : (
              <>
                {/* Plan header */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-text">{t('suppl.planTitle')}</div>
                    <div className="text-xs text-text-sec mt-0.5">
                      {t('suppl.planSince')} {currentPlan.plan.effective_from}
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingPlan(true)}
                    className="text-sm px-3 py-1.5 rounded-lg border border-border text-text-sec hover:border-accent hover:text-accent cursor-pointer transition-colors"
                  >{t('suppl.editPlan')}</button>
                </div>

                {/* Plan items */}
                {currentPlan.items.length === 0 ? (
                  <p className="text-text-sec text-sm py-4 text-center">{t('suppl.noPlan')}</p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {SUPPLEMENT_TIME_ORDER.map(slot => {
                      const slotItems = currentPlan.items.filter(i => (i.time_of_day ?? 'breakfast') === slot);
                      if (slotItems.length === 0) return null;
                      return (
                        <div key={slot} className="flex flex-col">
                          <div className="text-sm font-semibold text-text-sec mb-1.5">
                            {t(`suppl.time.${slot}`)}
                          </div>
                          <div className="flex flex-col divide-y divide-border/40">
                            <div className="py-1.5 grid grid-cols-[1fr_auto_auto_auto] gap-3 text-xs font-medium text-text-sec uppercase tracking-wider">
                              <span>{t('suppl.name')}</span>
                              <span className="w-16 text-center">{t('suppl.qty')}</span>
                              <span className="w-20">{t('suppl.unit')}</span>
                              <span className="w-32">{t('suppl.notes')}</span>
                            </div>
                            {slotItems.map(item => (
                              <div key={item.supplement_id} className="py-3 grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center">
                                <span className="text-sm font-medium text-text">{item.name}</span>
                                <span className="w-16 text-center text-sm text-text tabular-nums">{item.qty}</span>
                                <span className="w-20 text-sm text-text-sec">{item.unit || '—'}</span>
                                <span className="w-32 text-sm text-text-sec truncate">{item.notes || '—'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>

      {deleteTarget && (
        <ConfirmDialog
          message={`Delete "${deleteTarget.name}"?`}
          confirmLabel={t('common.delete') ?? 'Delete'}
          dangerous
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {detailTarget && !deleteTarget && (
        <SupplementDetailModal
          supplement={detailTarget}
          onSave={handleUpdateSupplement}
          onDelete={s => { setDetailTarget(null); setDeleteTarget(s); }}
          onClose={() => setDetailTarget(null)}
          t={t}
        />
      )}
    </div>
  );
}
