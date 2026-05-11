import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { useT } from '../i18n/useT';
import { useAchievementToast } from '../hooks/useAchievementToast';
import { today, addDays, formatShortDate } from '../lib/dateUtil';
import { cardOuter, eyebrow, serifItalic } from '../lib/fbUI';
import { fbBtnPrimary, fbBtnGhost, fbBtnIcon } from '../lib/fbStyles';
import BarChartCard from '../components/BarChartCard';
import StreakBadge from '../components/StreakBadge';
import WeeklySummaryCard from '../components/WeeklySummaryCard';
import ModuleInsightsCard from '../components/ModuleInsightsCard';
import type { Task, TasksStats } from '../types';

// ── Priority colours ─────────────────────────────────────────────────────────

const PRIORITY_COLORS = ['#6b7280', '#f59e0b', '#ef4444'] as const; // low, med, high
const PRIORITY_LABELS = ['Low', 'Med', 'High'] as const;

// ── Completion ring (SVG) ────────────────────────────────────────────────────

function CompletionRing({ done, total, size = 64 }: { done: number; total: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? done / total : 0;
  const offset = circ * (1 - pct);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fb-border)" strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke="var(--fb-accent)"
        strokeWidth={6}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset .4s cubic-bezier(0.16,1,0.3,1)' }}
      />
    </svg>
  );
}

// ── Trash icon ───────────────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  );
}

function DragIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="9" y1="5" x2="9" y2="19" />
      <line x1="15" y1="5" x2="15" y2="19" />
    </svg>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const { showToast } = useToast();
  const { t } = useT();
  const showAchievements = useAchievementToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [date, setDate] = useState(today());
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [filterDone, setFilterDone] = useState<'all' | 'open' | 'done'>('all');

  const [tasksStats, setTasksStats] = useState<TasksStats | null>(null);

  const dragTaskIdRef = useRef<number | null>(null);
  const dragOverTaskIdRef = useRef<number | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      const rows = await api.tasks.get(date) as Task[];
      setTasks(rows);
    } catch { /* silent */ }
  }, [date]);

  const loadStats = useCallback(async () => {
    try {
      const from = addDays(today(), -29);
      const to = today();
      const stats = await api.tasks.getStats(from, to);
      setTasksStats(stats);
    } catch {}
  }, []);

  useEffect(() => { loadTasks(); loadStats(); }, [loadTasks, loadStats]);

  // ── Add ──────────────────────────────────────────────────────────────────

  async function handleAdd() {
    const title = newTitle.trim();
    if (!title) return;
    try {
      await api.tasks.add({ date, title, priority: newPriority });
      setNewTitle('');
      setNewPriority(0);
      await loadTasks();
    } catch { /* silent */ }
  }

  // ── Toggle done ──────────────────────────────────────────────────────────

  async function handleToggle(id: number) {
    try {
      const task = tasks.find(t => t.id === id);
      await api.tasks.toggle(id);
      await loadTasks();
      // Award points when completing a task (was undone → done)
      if (task && task.done === 0) {
        api.gamification.addPoints({ module: 'tasks', reason: 'task_completed', points: 5, context: { date: date } })
          .then(r => { if (r.new_achievements?.length) showAchievements(r.new_achievements); })
          .catch(() => {});
      }
    } catch { /* silent */ }
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  async function handleDelete(id: number) {
    try {
      await api.tasks.delete(id);
      await loadTasks();
    } catch { /* silent */ }
  }

  // ── Inline edit ──────────────────────────────────────────────────────────

  function startEdit(task: Task) {
    setEditingId(task.id);
    setEditTitle(task.title);
  }

  async function commitEdit(id: number) {
    const title = editTitle.trim();
    if (title) {
      try { await api.tasks.update({ id, title }); } catch { /* silent */ }
    }
    setEditingId(null);
    await loadTasks();
  }

  // ── Rollover ─────────────────────────────────────────────────────────────

  async function handleRollover() {
    try {
      const { count } = await api.tasks.rolloverFromYesterday(date) as { count: number };
      if (count > 0) {
        showToast(`${count} task${count > 1 ? 's' : ''} rolled over`, 'success');
        await loadTasks();
      } else {
        showToast('Nessun task da ieri', 'info');
      }
    } catch { /* silent */ }
  }

  // ── Drag to reorder ──────────────────────────────────────────────────────

  function onDragStart(taskId: number) { dragTaskIdRef.current = taskId; }
  function onDragEnter(taskId: number) { dragOverTaskIdRef.current = taskId; }

  async function onDragEnd() {
    const fromId = dragTaskIdRef.current;
    const toId = dragOverTaskIdRef.current;
    dragTaskIdRef.current = null;
    dragOverTaskIdRef.current = null;
    if (fromId === null || toId === null || fromId === toId) return;
    const from = tasks.findIndex(t => t.id === fromId);
    const to = tasks.findIndex(t => t.id === toId);
    if (from === -1 || to === -1) return;
    const reordered = [...tasks];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setTasks(reordered);
    try {
      await api.tasks.reorder(reordered.map(t => t.id));
    } catch { await loadTasks(); }
  }

  // ── Derived ──────────────────────────────────────────────────────────────

  const total = tasks.length;
  const doneCount = tasks.filter(t => t.done === 1).length;
  const isToday = date === today();

  const visibleTasks = tasks.filter(t => {
    if (filterDone === 'open') return t.done === 0;
    if (filterDone === 'done') return t.done === 1;
    return true;
  });

  // ── Styles ────────────────────────────────────────────────────────────────

  const inputCls: CSSProperties = {
    flex: 1,
    background: 'var(--fb-card)',
    border: '1px solid var(--fb-border)',
    color: 'var(--fb-text)',
    borderRadius: 10,
    padding: '8px 12px',
    fontSize: 13,
    outline: 'none',
    fontFamily: 'var(--font-body)',
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={eyebrow}>{t('tasks.eyebrow')}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ ...serifItalic, fontSize: 26, fontWeight: 400, color: 'var(--fb-text)', letterSpacing: -0.5, lineHeight: 1.1 }}>
            {t('tasks.title')}
          </span>
          {tasksStats && (
            <StreakBadge
              current={tasksStats.current_streak}
              best={tasksStats.best_streak}
              emoji="✅"
              label={t('tasks.clearStreak')}
            />
          )}
        </div>
      </header>

      {/* ── Weekly Summary ───────────────────────────────────────────────── */}
      {tasksStats && (
        <WeeklySummaryCard
          title={t('tasks.weekTitle')}
          metrics={[
            {
              label: t('tasks.completed'),
              thisWeek: tasksStats.week_done,
              lastWeek: tasksStats.last_week_done,
              higherIsBetter: true,
            },
            {
              label: t('tasks.completionRate'),
              thisWeek: tasksStats.week_total > 0 ? Math.round((tasksStats.week_done / tasksStats.week_total) * 100) : 0,
              lastWeek: tasksStats.last_week_total > 0 ? Math.round((tasksStats.last_week_done / tasksStats.last_week_total) * 100) : 0,
              unit: '%',
              higherIsBetter: true,
            },
            {
              label: t('tasks.created'),
              thisWeek: tasksStats.week_total,
              lastWeek: tasksStats.last_week_total,
            },
          ]}
        />
      )}

      {/* ── Date navigation ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={() => setDate(d => offsetDate(d, -1))}
          style={{ ...fbBtnGhost, padding: '6px 12px', fontSize: 16, lineHeight: 1 }}
          aria-label="Previous day"
        >‹</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fb-text)', minWidth: 110, textAlign: 'center' }}>
          {isToday ? 'Oggi' : formatShortDate(date)}
        </span>
        <button
          type="button"
          onClick={() => setDate(d => offsetDate(d, 1))}
          style={{ ...fbBtnGhost, padding: '6px 12px', fontSize: 16, lineHeight: 1 }}
          aria-label="Next day"
          disabled={date >= today()}
        >›</button>
        {!isToday && (
          <button
            type="button"
            onClick={() => setDate(today())}
            style={{ ...fbBtnGhost, fontSize: 11, padding: '4px 10px', marginLeft: 4 }}
          >Oggi</button>
        )}
      </div>

      {/* ── Completion summary card ──────────────────────────────────────────── */}
      <section style={{ ...cardOuter, display: 'flex', alignItems: 'center', gap: 16 }}>
        <CompletionRing done={doneCount} total={total} size={64} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.5, color: 'var(--fb-text)', lineHeight: 1 }}>
            {doneCount}<span style={{ fontSize: 14, color: 'var(--fb-text-3)', fontWeight: 400 }}>/{total}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fb-text-3)', marginTop: 2 }}>{t('tasks.completion')}</div>
        </div>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'open', 'done'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilterDone(f)}
              style={{
                padding: '4px 10px',
                borderRadius: 99,
                border: `1px solid ${filterDone === f ? 'var(--fb-accent)' : 'var(--fb-border)'}`,
                background: filterDone === f ? 'color-mix(in srgb, var(--fb-accent) 14%, transparent)' : 'transparent',
                color: filterDone === f ? 'var(--fb-accent)' : 'var(--fb-text-3)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all .2s cubic-bezier(0.16,1,0.3,1)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {f === 'all' ? 'Tutti' : f === 'open' ? 'Aperti' : 'Fatti'}
            </button>
          ))}
        </div>
      </section>

      {/* ── Task list ───────────────────────────────────────────────────────── */}
      <section style={cardOuter}>
        {tasks.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 0' }}>
            <div style={{ color: 'var(--fb-text-3)', fontSize: 13, fontStyle: 'italic' }}>
              {t('tasks.empty')}
            </div>
            <button
              type="button"
              onClick={handleRollover}
              style={{ ...fbBtnGhost, fontSize: 12, padding: '6px 14px' }}
            >
              {t('tasks.rollover')}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {visibleTasks.map((task) => (
              <div
                key={task.id}
                draggable
                onDragStart={() => onDragStart(task.id)}
                onDragEnter={() => onDragEnter(task.id)}
                onDragEnd={onDragEnd}
                onDragOver={e => e.preventDefault()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: 'var(--fb-bg)',
                  border: '1px solid var(--fb-border)',
                  transition: 'opacity .15s ease',
                  opacity: task.done === 1 ? 0.5 : 1,
                  cursor: 'default',
                  userSelect: 'none',
                }}
              >
                {/* Drag handle */}
                <span style={{ color: 'var(--fb-text-3)', cursor: 'grab', flexShrink: 0 }}>
                  <DragIcon />
                </span>

                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={task.done === 1}
                  onChange={() => handleToggle(task.id)}
                  style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0, accentColor: 'var(--fb-accent)' }}
                />

                {/* Priority dot */}
                <span
                  style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS[0],
                    flexShrink: 0,
                  }}
                  title={PRIORITY_LABELS[task.priority]}
                />

                {/* Title — inline edit */}
                {editingId === task.id ? (
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    onBlur={() => commitEdit(task.id)}
                    onKeyDown={e => { if (e.key === 'Enter') commitEdit(task.id); if (e.key === 'Escape') setEditingId(null); }}
                    style={{ ...inputCls, flex: 1, padding: '3px 6px', fontSize: 13 }}
                  />
                ) : (
                  <span
                    onClick={() => startEdit(task)}
                    style={{
                      flex: 1,
                      fontSize: 13,
                      color: 'var(--fb-text)',
                      textDecoration: task.done === 1 ? 'line-through' : 'none',
                      cursor: 'text',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {task.title}
                  </span>
                )}

                {/* Project badge */}
                {task.project && (
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    padding: '2px 7px',
                    borderRadius: 99,
                    background: 'color-mix(in srgb, var(--fb-accent) 12%, transparent)',
                    color: 'var(--fb-accent)',
                    flexShrink: 0,
                    maxWidth: 80,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {task.project}
                  </span>
                )}

                {/* Estimate */}
                {task.estimate_min != null && (
                  <span style={{ fontSize: 10, color: 'var(--fb-text-3)', flexShrink: 0 }}>
                    {task.estimate_min}m
                  </span>
                )}

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => handleDelete(task.id)}
                  style={{ ...fbBtnIcon, color: 'var(--fb-text-3)', flexShrink: 0 }}
                  title="Delete"
                >
                  <TrashIcon />
                </button>
              </div>
            ))}

            {/* Rollover button when tasks exist */}
            {tasks.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <button
                  type="button"
                  onClick={handleRollover}
                  style={{ ...fbBtnGhost, fontSize: 11, padding: '4px 12px' }}
                >
                  {t('tasks.rollover')}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Add task form ────────────────────────────────────────────────────── */}
      <section style={cardOuter}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fb-text-2)', letterSpacing: 0.2 }}>
          Nuovo task
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder={t('tasks.addPlaceholder')}
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            style={inputCls}
          />
          {/* Priority picker */}
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {([0, 1, 2] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setNewPriority(p)}
                title={PRIORITY_LABELS[p]}
                style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: PRIORITY_COLORS[p],
                  border: newPriority === p ? '2px solid var(--fb-text)' : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'border .15s ease',
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newTitle.trim()}
            style={{ ...fbBtnPrimary, opacity: !newTitle.trim() ? 0.5 : 1 }}
          >
            +
          </button>
        </div>
      </section>

      {/* ── 30-day chart ─────────────────────────────────────────────── */}
      {tasksStats && tasksStats.days.some(d => d.total > 0) && (
        <section style={cardOuter}>
          <span style={eyebrow}>{t('tasks.chart30Title')}</span>
          <BarChartCard
            data={tasksStats.days.map(d => ({
              label: formatShortDate(d.date),
              value: d.done,
            }))}
            height={180}
            color="var(--fb-accent)"
          />
        </section>
      )}

      {/* ── Correlazioni ─────────────────────────────────────────────── */}
      <ModuleInsightsCard modules={['tasks']} />

    </div>
  );
}
