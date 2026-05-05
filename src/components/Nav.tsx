import { useState, useRef, useEffect } from 'react';
import { useNavigate } from '../hooks/useNavigate';
import { useSettings } from '../hooks/useSettings';
import { useT } from '../i18n/useT';
import { getThisMonday } from '../lib/dateUtil';
import type { PageName } from '../types';
import NotificationBell from './NotificationBell';

// ── Icons ─────────────────────────────────────────────────────────────────────

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className="shrink-0">
      <path d={d} />
    </svg>
  );
}

const ICONS: Record<PageName, string> = {
  dashboard:    'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10',
  exercise:     'M6.5 6.5a5 5 0 000 11M17.5 6.5a5 5 0 010 11M3 12h3m12 0h3M6.5 12h11',
  net:          'M12 2v20M2 12h20 M7 7l10 10M17 7L7 17',
  week:         'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  foods:        'M3 2l2 7h14l2-7 M7 9c0 6 2 9 5 13M17 9c0 6-2 9-5 13',
  compare:      'M8 6h13M8 12h8M8 18h5 M3 6h.01M3 12h.01M3 18h.01',
  pantry:       'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8 M10 12h4',
  recipes:      'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z',
  history:      'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  stats:        'M3 3v18h18 M7 14l4-4 4 4 5-7',
  weight:       'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z',
  goals:        'M12 2L9 9H2l5.5 4-2 7L12 16l6.5 4-2-7L22 9h-7z',
  supplements:  'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0016.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 002 8.5c0 2.3 1.5 4.05 3 5.5l7 7 7-7z',
  measurements: 'M2 12h20 M12 2v20 M4.93 4.93l14.14 14.14 M19.07 4.93L4.93 19.07',
  data:         'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  settings:     'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z',
  notifications: 'M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.94 1.94 0 003.4 0',
  // pages not in main nav but in PageName
  day:          'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
};

// ── Nav item definitions ───────────────────────────────────────────────────────

type NavGroup = 'track' | 'plan' | 'health' | 'system';
interface NavItem { page: PageName; labelKey: string; group: NavGroup; }

const DEFAULT_ORDER: NavItem[] = [
  { page: 'dashboard',     labelKey: 'nav.today',         group: 'track' },
  { page: 'foods',         labelKey: 'nav.foods',         group: 'track' },
  { page: 'pantry',        labelKey: 'nav.pantry',        group: 'track' },
  { page: 'recipes',       labelKey: 'nav.recipes',       group: 'track' },
  { page: 'week',          labelKey: 'nav.week',          group: 'plan' },
  { page: 'history',       labelKey: 'nav.history',       group: 'plan' },
  { page: 'stats',         labelKey: 'nav.stats',         group: 'plan' },
  { page: 'net',           labelKey: 'nav.net',           group: 'plan' },
  { page: 'compare',       labelKey: 'nav.compare',       group: 'plan' },
  { page: 'supplements',   labelKey: 'nav.supplements',   group: 'health' },
  { page: 'exercise',      labelKey: 'nav.exercise',      group: 'health' },
  { page: 'measurements',  labelKey: 'nav.measurements',  group: 'health' },
  { page: 'weight',        labelKey: 'nav.body',          group: 'health' },
  { page: 'goals',         labelKey: 'nav.goals',         group: 'health' },
  { page: 'notifications', labelKey: 'nav.notifications', group: 'system' },
  { page: 'data',          labelKey: 'nav.data',          group: 'system' },
  { page: 'settings',      labelKey: 'nav.settings',      group: 'system' },
];

const GROUPS: { id: NavGroup; labelKey: string }[] = [
  { id: 'track',  labelKey: 'nav.group.track' },
  { id: 'plan',   labelKey: 'nav.group.plan' },
  { id: 'health', labelKey: 'nav.group.health' },
  { id: 'system', labelKey: 'nav.group.system' },
];

const STORAGE_KEY = 'nav_order';
const HIDDEN_KEY = 'nav_hidden';

// Pages that must always remain visible (cannot be hidden)
const UNHIDEABLE: Set<PageName> = new Set(['dashboard', 'settings']);

function loadOrder(): NavItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_ORDER;
    const pages: PageName[] = JSON.parse(saved);
    // Merge saved order with defaults (handles newly added pages)
    const known = new Set(pages);
    const merged = pages
      .map(p => DEFAULT_ORDER.find(i => i.page === p))
      .filter(Boolean) as NavItem[];
    const added = DEFAULT_ORDER.filter(i => !known.has(i.page));
    return [...merged, ...added];
  } catch { return DEFAULT_ORDER; }
}

function saveOrder(items: NavItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.map(i => i.page)));
}

function loadHidden(): Set<PageName> {
  try {
    const saved = localStorage.getItem(HIDDEN_KEY);
    if (!saved) return new Set();
    const pages: PageName[] = JSON.parse(saved);
    return new Set(pages.filter(p => !UNHIDEABLE.has(p)));
  } catch { return new Set(); }
}

function saveHidden(hidden: Set<PageName>) {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
}

// ── DragHandle icon ───────────────────────────────────────────────────────────

function DragHandle() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 opacity-40">
      <circle cx="9" cy="6"  r="1.5" /><circle cx="15" cy="6"  r="1.5" />
      <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className="shrink-0">
      {hidden ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-10-8-10-8a18.45 18.45 0 015.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 10 8 10 8a18.5 18.5 0 01-2.16 3.19" />
          <path d="M9.88 9.88a3 3 0 004.24 4.24" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </>
      ) : (
        <>
          <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────

interface NavProps { activePage: PageName; }

export default function Nav({ activePage }: NavProps) {
  const { navigate } = useNavigate();
  const { t } = useT();
  const { settings } = useSettings();

  const [items, setItems]       = useState<NavItem[]>(loadOrder);
  const [hidden, setHidden]     = useState<Set<PageName>>(loadHidden);
  const [editing, setEditing]   = useState(false);
  const dragIndex               = useRef<number | null>(null);
  const dragOverIndex           = useRef<number | null>(null);

  // Persist whenever order changes (but not on first mount)
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    saveOrder(items);
  }, [items]);

  const hiddenMounted = useRef(false);
  useEffect(() => {
    if (!hiddenMounted.current) { hiddenMounted.current = true; return; }
    saveHidden(hidden);
  }, [hidden]);

  function toggleHidden(page: PageName) {
    if (UNHIDEABLE.has(page)) return;
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(page)) next.delete(page); else next.add(page);
      return next;
    });
  }

  const visibleItems = editing
    ? items
    : items.filter(i => {
        if (hidden.has(i.page)) return false;
        if (i.page === 'pantry' && settings.pantry_enabled === 0) return false;
        return true;
      });

  function handleDragStart(i: number) { dragIndex.current = i; }

  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    dragOverIndex.current = i;
  }

  function handleDrop() {
    const from = dragIndex.current;
    const to   = dragOverIndex.current;
    if (from === null || to === null || from === to) return;
    setItems(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    dragIndex.current = null;
    dragOverIndex.current = null;
  }

  return (
    <nav className="flex flex-col w-48 shrink-0 bg-nav-bg border-r border-border py-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-4 gap-2">
        <span className="text-accent font-bold text-lg tracking-tight select-none">CC</span>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button
          onClick={() => setEditing(v => !v)}
          title={editing ? t('nav.done') : t('nav.reorderHide')}
          className={[
            'text-xs px-2 py-1 rounded border cursor-pointer transition-colors',
            editing
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border text-text-sec hover:border-accent/50 hover:text-text',
          ].join(' ')}
        >
          {editing ? t('nav.done') : <span style={{ display: 'inline-block', transform: 'scaleX(-1) rotate(15deg)' }}>✎</span>}
          </button>
        </div>
      </div>

      {/* Nav items */}
      {editing ? (
        // ── Edit mode: flat draggable list ─────────────────────────────
        <div className="flex flex-col gap-0.5">
          {visibleItems.map(({ page, labelKey }, i) => (
            <div
              key={page}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={e => handleDragOver(e, i)}
              onDrop={handleDrop}
              className={[
                'flex items-center gap-2 px-3 py-2 cursor-grab active:cursor-grabbing select-none transition-colors',
                hidden.has(page)
                  ? 'text-text-sec/40 hover:bg-card-hover'
                  : 'text-text-sec hover:bg-card-hover',
              ].join(' ')}
            >
              <DragHandle />
              <Icon d={ICONS[page] ?? ICONS.settings} size={15} />
              <span className="text-sm truncate flex-1">{t(labelKey)}</span>
              {!UNHIDEABLE.has(page) && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); toggleHidden(page); }}
                  onMouseDown={e => e.stopPropagation()}
                  draggable={false}
                  title={hidden.has(page) ? t('nav.showPage') : t('nav.hidePage')}
                  className="p-1 rounded hover:bg-card cursor-pointer text-text-sec hover:text-text transition-colors"
                >
                  <EyeIcon hidden={hidden.has(page)} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        // ── Normal mode: grouped sections ─────────────────────────────
        <div className="flex flex-col gap-3">
          {GROUPS.map(g => {
            const itemsInGroup = visibleItems.filter(i => i.group === g.id);
            if (itemsInGroup.length === 0) return null;
            return (
              <div key={g.id} className="flex flex-col gap-0.5">
                <div className="px-4 pt-1 pb-1 text-[10px] font-semibold tracking-[0.14em] uppercase text-text-sec/70 select-none">
                  {t(g.labelKey)}
                </div>
                {itemsInGroup.map(({ page, labelKey }) => (
                  <button
                    key={page}
                    onClick={() => page === 'week' ? navigate('week', { weekStart: getThisMonday() }) : navigate(page)}
                    className={[
                      'flex items-center gap-2.5 px-4 py-2 text-sm text-left w-full',
                      'transition-colors duration-150 cursor-pointer',
                      activePage === page
                        ? 'bg-accent/15 text-accent font-medium'
                        : 'text-text-sec hover:bg-card-hover hover:text-text',
                    ].join(' ')}
                  >
                    <Icon d={ICONS[page] ?? ICONS.settings} size={16} />
                    <span>{t(labelKey)}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </nav>
  );
}
