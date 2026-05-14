import { useState, useMemo, useRef, useEffect, useCallback, useLayoutEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import Fuse from 'fuse.js';
import { api } from '../api';
import type { Food, Recipe } from '../types';

export type SearchItem =
  | (Food & { _freq?: number; isRecipe?: false; isActualRecipe?: false })
  | (Recipe & { _freq?: number; isRecipe: true; isActualRecipe?: false })
  | (Recipe & { _freq?: number; isRecipe: true; isActualRecipe: true; yield_g: number });

interface FoodSearchProps {
  items: SearchItem[];
  onSelect: (item: SearchItem) => void;
  placeholder?: string;
  value?: string;
  onClear?: () => void;
  clearAfterSelect?: boolean;
  showAllWhenEmpty?: boolean;
  /** When set, each food row shows a small badge with the total grams currently in this pantry. */
  pantryId?: number;
  /** Compact header-style input instead of the large pill */
  compact?: boolean;
}

// ── Style tokens ──────────────────────────────────────────────────────────────

const eyebrow: CSSProperties = {
  fontSize: 9.5, fontWeight: 600, letterSpacing: 1.2,
  textTransform: 'uppercase', color: 'var(--fb-text-3)',
};

const serifItalic: CSSProperties = {
  fontFamily: 'var(--font-serif)', fontStyle: 'italic',
};

function inputStyle(compact: boolean, focused: boolean): CSSProperties {
  if (compact) {
    return {
      width: '100%',
      background: 'var(--fb-card)',
      border: '1px solid ' + (focused ? 'var(--fb-accent)' : 'var(--fb-border)'),
      borderRadius: 11,
      padding: '8px 32px 8px 32px',
      fontSize: 13, fontWeight: 500,
      fontFamily: 'var(--font-body)',
      color: 'var(--fb-text)',
      outline: 'none',
      transition: 'border-color .25s ease, box-shadow .25s ease',
      boxShadow: focused ? '0 0 0 3px var(--fb-accent-soft)' : 'none',
    };
  }
  return {
    width: '100%',
    background: 'var(--fb-card)',
    border: '1px solid ' + (focused ? 'var(--fb-accent)' : 'var(--fb-border-strong)'),
    borderRadius: 18,
    padding: '16px 52px 16px 52px',
    fontSize: 15, fontWeight: 500,
    fontFamily: 'var(--font-serif)', fontStyle: 'italic',
    color: 'var(--fb-text)',
    outline: 'none',
    letterSpacing: -0.1,
    transition: 'border-color .25s ease, box-shadow .25s ease',
    boxShadow: focused ? '0 0 0 4px var(--fb-accent-soft)' : '0 1px 2px rgba(0,0,0,0.18)',
  };
}

const dotDivider: CSSProperties = {
  width: 3, height: 3, borderRadius: '50%',
  background: 'var(--fb-border-strong)',
  flexShrink: 0,
};

export default function FoodSearch({
  items, onSelect, placeholder = 'Search…',
  value, onClear, clearAfterSelect = false,
  showAllWhenEmpty = false, pantryId, compact = false,
}: FoodSearchProps) {
  const [query, setQuery] = useState(value ?? '');
  const [activeIdx, setActiveIdx] = useState(-1);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fuse = useMemo(() => new Fuse(items, { keys: ['name'], threshold: 0.4, includeScore: true }), [items]);
  const allSorted = useMemo(() => [...items].sort((a, b) => a.name.localeCompare(b.name)), [items]);

  const results = useMemo(() => {
    if (!query.trim()) {
      return showAllWhenEmpty ? allSorted : [];
    }
    const raw = fuse.search(query).slice(0, 20);
    return raw
      .sort((a, b) => {
        const aFreq = (a.item as SearchItem & { _freq?: number })._freq ?? 0;
        const bFreq = (b.item as SearchItem & { _freq?: number })._freq ?? 0;
        if (bFreq !== aFreq) return bFreq - aFreq;
        return (a.score ?? 1) - (b.score ?? 1);
      })
      .slice(0, 10)
      .map(r => r.item);
  }, [query, fuse, showAllWhenEmpty, allSorted]);

  type Stock = { total_g: number; loose_g: number; packs: { grams: number; count: number }[] };
  const [stockMap, setStockMap] = useState<Record<number, Stock>>({});
  useEffect(() => {
    if (pantryId == null) { setStockMap({}); return; }
    let cancelled = false;
    api.pantry.getStockMap(pantryId).then(m => { if (!cancelled) setStockMap(m ?? {}); });
    return () => { cancelled = true; };
  }, [pantryId, open]);

  function formatStock(s: Stock): string {
    const fmtG = (g: number) => g >= 1000
      ? `${(g / 1000).toFixed(g >= 10000 ? 0 : 1)}kg`
      : `${Math.round(g)}g`;
    const packParts = s.packs.map(p =>
      `${p.count % 1 === 0 ? p.count : p.count.toFixed(2)}×${fmtG(p.grams)}`,
    );
    if (packParts.length === 0) return fmtG(s.loose_g);
    if (s.loose_g <= 0) return packParts.join(' + ');
    return [...packParts, fmtG(s.loose_g)].join(' + ');
  }

  useEffect(() => {
    if (value !== undefined) setQuery(value);
  }, [value]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current && containerRef.current.contains(target)) return;
      if (listRef.current && listRef.current.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    function update() {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 6, left: r.left, width: r.width });
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, query]);

  const select = useCallback((item: SearchItem) => {
    setQuery(clearAfterSelect ? '' : item.name);
    setOpen(false);
    setActiveIdx(-1);
    onSelect(item);
  }, [onSelect, clearAfterSelect]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      select(results[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setOpen(e.target.value.length > 0 || showAllWhenEmpty);
    setActiveIdx(-1);
    if (!e.target.value && onClear) onClear();
  }

  const iconSize = compact ? 14 : 18;
  const iconLeftOffset = compact ? 11 : 20;
  const clearRightOffset = compact ? 8 : 18;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <span style={{
          position: 'absolute', left: iconLeftOffset,
          pointerEvents: 'none',
          color: focused ? 'var(--fb-accent)' : 'var(--fb-text-3)',
          display: 'inline-flex', transition: 'color .25s ease',
        }}>
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => { setFocused(true); if (query || showAllWhenEmpty) setOpen(true); }}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={inputStyle(compact, focused)}
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); if (onClear) onClear(); inputRef.current?.focus(); }}
            aria-label="Clear"
            style={{
              position: 'absolute', right: clearRightOffset,
              width: compact ? 20 : 26, height: compact ? 20 : 26,
              borderRadius: 99, border: 0,
              background: 'var(--fb-bg-2)', color: 'var(--fb-text-3)',
              fontSize: compact ? 10 : 12, lineHeight: 1, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all .2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--fb-bg)'; e.currentTarget.style.color = 'var(--fb-text)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--fb-bg-2)'; e.currentTarget.style.color = 'var(--fb-text-3)'; }}
          >✕</button>
        )}
      </div>
      {open && results.length > 0 && rect && createPortal(
        <ul
          ref={listRef}
          style={{
            position: 'fixed',
            top: rect.top, left: rect.left, width: rect.width,
            zIndex: 100,
            background: 'var(--fb-card)',
            border: '1px solid var(--fb-border-strong)',
            borderRadius: compact ? 12 : 18,
            boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
            maxHeight: 384, overflowY: 'auto',
            margin: 0, padding: 4, listStyle: 'none',
            animation: 'fb-fade-up 0.15s ease',
          }}
        >
          {results.map((item, i) => {
            const isActive = i === activeIdx;
            const stock = !item.isRecipe ? stockMap[item.id] : null;
            return (
              <li
                key={item.id + (item.isRecipe ? '-r' : '')}
                onMouseDown={() => select(item)}
                onMouseEnter={() => setActiveIdx(i)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 10,
                  padding: compact ? '8px 10px' : '10px 14px',
                  borderRadius: compact ? 8 : 12,
                  cursor: 'pointer',
                  background: isActive ? 'var(--fb-accent-soft)' : 'transparent',
                  transition: 'background .2s ease',
                }}
              >
                <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{
                    ...serifItalic,
                    fontSize: 14, fontWeight: 500,
                    color: isActive ? 'var(--fb-accent)' : 'var(--fb-text)',
                    letterSpacing: -0.1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    transition: 'color .2s ease',
                  }}>{item.name}</div>
                  <div style={{
                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
                    fontSize: 10.5, fontWeight: 600,
                    color: 'var(--fb-text-2)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    <span style={{ color: 'var(--fb-text)' }}>{Math.round(item.calories)} kcal</span>
                    <span style={dotDivider} />
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--fb-red)' }} />
                      P {Math.round(item.protein * 100) / 100}g
                    </span>
                    <span style={dotDivider} />
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--fb-amber)' }} />
                      C {Math.round(item.carbs * 100) / 100}g
                    </span>
                    <span style={dotDivider} />
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--fb-green)' }} />
                      F {Math.round(item.fat * 100) / 100}g
                    </span>
                    {!item.isRecipe && (
                      <span style={{ ...serifItalic, fontWeight: 400, fontSize: 10, color: 'var(--fb-text-3)', marginLeft: 2 }}>
                        per 100g
                      </span>
                    )}
                  </div>
                </div>
                {!item.isRecipe && pantryId != null && stock && stock.total_g > 0 && (
                  <span
                    title={`In pantry: ${Math.round(stock.total_g)}g`}
                    style={{
                      ...eyebrow, color: 'var(--fb-green)',
                      padding: '4px 10px', borderRadius: 99,
                      background: 'color-mix(in srgb, var(--fb-green) 14%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--fb-green) 28%, transparent)',
                      fontVariantNumeric: 'tabular-nums',
                      flexShrink: 0,
                    }}
                  >
                    {formatStock(stock)}
                  </span>
                )}
                {item.isRecipe && (
                  <span style={{
                    ...eyebrow, color: 'var(--fb-accent-2)',
                    padding: '4px 10px', borderRadius: 99,
                    background: 'var(--fb-accent-soft)',
                    border: '1px solid color-mix(in srgb, var(--fb-accent) 28%, transparent)',
                    flexShrink: 0,
                  }}>
                    {item.isActualRecipe ? 'recipe' : 'bundle'}
                  </span>
                )}
              </li>
            );
          })}
        </ul>,
        document.body
      )}
    </div>
  );
}
