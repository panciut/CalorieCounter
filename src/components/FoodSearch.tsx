import { useState, useMemo, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import Fuse from 'fuse.js';
import { api } from '../api';
import { decomposeGrams, formatStock, type PackedStock } from '../lib/pantryUtils';
import type { Food, Recipe } from '../types';

export type SearchItem = (Food & { _freq?: number; isRecipe?: false }) | (Recipe & { _freq?: number; isRecipe: true });

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
}

export default function FoodSearch({ items, onSelect, placeholder = 'Search…', value, onClear, clearAfterSelect = false, showAllWhenEmpty = false, pantryId }: FoodSearchProps) {
  const [query, setQuery] = useState(value ?? '');
  const [activeIdx, setActiveIdx] = useState(-1);
  const [open, setOpen] = useState(false);
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
    const raw = fuse.search(query).slice(0, 30);
    // Hybrid: frequency boosts the fuse score (lower = better), but exact/near-exact
    // matches still win. Effective score = fuse.score - log10(freq+1) * 0.06, capped at 0.2 boost.
    // So "pa" with freq=100 "pasta" beats "parmigiano" with freq=0; but typing "parm" still
    // prefers "parmigiano" over a frequent "pasta".
    return raw
      .map(r => {
        const freq = (r.item as SearchItem & { _freq?: number })._freq ?? 0;
        const boost = freq > 0 ? Math.min(0.2, Math.log10(freq + 1) * 0.06) : 0;
        return { item: r.item, eff: (r.score ?? 1) - boost };
      })
      .sort((a, b) => a.eff - b.eff)
      .slice(0, 10)
      .map(r => r.item);
  }, [query, fuse]);

  // Pantry stock map (food_id → { total, packs, loose }). Refetched when pantry changes or list opens.
  const [stockMap, setStockMap] = useState<Record<number, PackedStock>>({});
  useEffect(() => {
    if (pantryId == null) { setStockMap({}); return; }
    let cancelled = false;
    api.pantry.getStockMap(pantryId).then(m => { if (!cancelled) setStockMap(m ?? {}); });
    return () => { cancelled = true; };
  }, [pantryId, open]);

  // Already-planned grams per food (status='planned', date >= today). Refetched
  // when the dropdown opens so a freshly-planned food shows the right number.
  const [plannedMap, setPlannedMap] = useState<Record<number, number>>({});
  useEffect(() => {
    let cancelled = false;
    api.log.getPlannedMap().then(m => { if (!cancelled) setPlannedMap(m ?? {}); });
    return () => { cancelled = true; };
  }, [open]);

  // Sync controlled value
  useEffect(() => {
    if (value !== undefined) setQuery(value);
  }, [value]);

  // Click outside closes
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

  // Track input position for portaled dropdown
  useLayoutEffect(() => {
    if (!open) return;
    function update() {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: r.width });
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

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleChange}
        onFocus={() => (query || showAllWhenEmpty) && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-md text-text placeholder:text-text-sec outline-none focus:border-accent transition-colors"
      />
      {open && results.length > 0 && rect && createPortal(
        <ul
          ref={listRef}
          style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
          className="z-[100] bg-card border border-border rounded-lg shadow-lg max-h-72 overflow-y-auto"
        >
          {results.map((item, i) => (
            <li
              key={item.id + (item.isRecipe ? '-r' : '')}
              onMouseDown={() => select(item)}
              onMouseEnter={() => setActiveIdx(i)}
              className={[
                'flex items-center justify-between gap-2 px-3 py-2 text-md cursor-pointer transition-colors',
                i === activeIdx ? 'bg-accent/15 text-text' : 'text-text hover:bg-card-hover',
              ].join(' ')}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate">{item.name}</div>
                <div className="text-[11px] text-text-sec tabular-nums">
                  {Math.round(item.calories)} kcal
                  <span className="mx-1">·</span>Fat {Math.round(item.fat * 10) / 10}g
                  <span className="mx-1">·</span>Carbs {Math.round(item.carbs * 10) / 10}g
                  <span className="mx-1">·</span>Fiber {Math.round((item.fiber ?? 0) * 10) / 10}g
                  <span className="mx-1">·</span>Protein {Math.round(item.protein * 10) / 10}g
                  {!item.isRecipe && <span className="ml-1 opacity-60">/100g</span>}
                </div>
              </div>
              {!item.isRecipe && (() => {
                const food = item as Food;
                const stock = pantryId != null ? stockMap[item.id] : undefined;
                const plannedG = plannedMap[item.id] ?? 0;
                const pantryG = stock?.total_g ?? 0;
                const planned = plannedG > 0 ? decomposeGrams(plannedG, food) : null;
                const remainingG = pantryG - plannedG;
                // "Remaining" is only meaningful when the user has both stock and a plan.
                const remaining = pantryG > 0 && plannedG > 0
                  ? decomposeGrams(remainingG, food)
                  : null;
                const shortageG = pantryG > 0 && remainingG < 0 ? -remainingG : 0;
                return (
                  <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end max-w-[55%]">
                    {planned && (
                      <span
                        className="text-[11px] px-1.5 py-0.5 rounded bg-accent/15 text-accent tabular-nums"
                        title={`Already planned: ${Math.round(plannedG)}g (today + future)`}
                      >
                        📋 {formatStock(planned)}
                      </span>
                    )}
                    {stock && stock.total_g > 0 && (
                      <span
                        className="text-[11px] px-1.5 py-0.5 rounded bg-green/15 text-green tabular-nums"
                        title={`In pantry: ${Math.round(stock.total_g)}g`}
                      >
                        📦 {formatStock(stock, food)}
                      </span>
                    )}
                    {remaining && remainingG > 0 && (
                      <span
                        className="text-[11px] px-1.5 py-0.5 rounded bg-text-sec/10 text-text-sec tabular-nums"
                        title={`After fulfilling planned amounts: ${Math.round(remainingG)}g remaining`}
                      >
                        ↘ {formatStock(remaining)}
                      </span>
                    )}
                    {shortageG > 0 && (
                      <span
                        className="text-[11px] px-1.5 py-0.5 rounded bg-red/15 text-red tabular-nums"
                        title={`Short ${Math.round(shortageG)}g — plan exceeds pantry stock`}
                      >
                        ⚠ −{formatStock(decomposeGrams(shortageG, food))}
                      </span>
                    )}
                  </div>
                );
              })()}
              {item.isRecipe && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-accent/20 text-accent2 shrink-0">recipe</span>
              )}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}
