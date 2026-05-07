import { useState, useMemo, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import Fuse from 'fuse.js';
import { useT } from '../i18n/useT';
import type { ExerciseType } from '../types';
import { useExerciseImages } from '../hooks/useExerciseImages';

interface Props {
  items: ExerciseType[];
  onSelect: (item: ExerciseType) => void;
  placeholder?: string;
  value?: string;
  onClear?: () => void;
  clearAfterSelect?: boolean;
  showAllWhenEmpty?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  cardio:      'bg-blue-500/15 text-blue-400',
  strength:    'bg-orange-500/15 text-orange-400',
  flexibility: 'bg-green-500/15 text-green-400',
  other:       'bg-text-sec/15 text-text-sec',
};

function SearchItem({ item, isActive, onSelect, onHover }: { item: ExerciseType, isActive: boolean, onSelect: () => void, onHover: () => void }) {
  const { t } = useT();
  const { images, loading } = useExerciseImages(item.name);
  const muscles = item.muscle_groups ? item.muscle_groups.split(',').filter(Boolean).slice(0, 3) : [];

  return (
    <li
      onMouseDown={onSelect}
      onMouseEnter={onHover}
      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
        isActive ? 'bg-accent/15 text-text' : 'text-text hover:bg-card-hover'
      }`}
    >
      <div className="w-10 h-10 rounded overflow-hidden bg-bg border border-border shrink-0 flex items-center justify-center">
        {!loading && images.length > 0 ? (
          <img src={images[0]} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-[10px] text-text-sec">IMG</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{item.name}</div>
        {muscles.length > 0 && (
          <div className="flex gap-1 mt-0.5 flex-wrap">
            {muscles.map(m => (
              <span key={m} className="text-[10px] text-text-sec">
                {t(`muscle.${m}` as Parameters<typeof t>[0])}
              </span>
            ))}
          </div>
        )}
      </div>
      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.other}`}>
        {t(`category.${item.category}` as Parameters<typeof t>[0])}
      </span>
    </li>
  );
}

export default function ExerciseSearch({ items, onSelect, placeholder = 'Search exercises…', value, onClear, clearAfterSelect = false, showAllWhenEmpty = false }: Props) {
  const { t } = useT();
  const [query, setQuery]       = useState(value ?? '');
  const [muscleFilter, setMuscleFilter] = useState('');
  const [activeIdx, setActiveIdx] = useState(-1);
  const [open, setOpen]         = useState(false);
  const [rect, setRect]         = useState<{ top: number; left: number; width: number } | null>(null);

  const inputRef     = useRef<HTMLInputElement>(null);
  const listRef      = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fuse = useMemo(() => new Fuse(items, { keys: ['name'], threshold: 0.4, includeScore: true }), [items]);
  const allSorted = useMemo(() => [...items].sort((a, b) => a.name.localeCompare(b.name)), [items]);

  const results = useMemo(() => {
    let list = items;
    if (query.trim()) {
      list = fuse.search(query).map(r => r.item);
    } else if (showAllWhenEmpty) {
      list = allSorted;
    } else {
      list = [];
    }

    if (muscleFilter) {
      list = list.filter(ex => ex.muscle_groups && ex.muscle_groups.includes(muscleFilter));
    }

    return list.slice(0, 20);
  }, [query, fuse, allSorted, showAllWhenEmpty, muscleFilter, items]);

  useEffect(() => { if (value !== undefined) setQuery(value); }, [value]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
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

  const select = useCallback((item: ExerciseType) => {
    setQuery(clearAfterSelect ? '' : item.name);
    setOpen(false);
    setActiveIdx(-1);
    onSelect(item);
  }, [onSelect, clearAfterSelect]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); select(results[activeIdx]); }
    else if (e.key === 'Escape') setOpen(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setOpen(e.target.value.length > 0 || showAllWhenEmpty);
    setActiveIdx(-1);
    if (!e.target.value && onClear) onClear();
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex gap-2 items-center">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => (query || showAllWhenEmpty) && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-sec outline-none focus:border-accent transition-colors min-w-0"
        />
        <select
          value={muscleFilter}
          onChange={e => { setMuscleFilter(e.target.value); setOpen(true); inputRef.current?.focus(); }}
          className="w-28 bg-bg border border-border rounded-lg px-2 py-2 text-sm text-text outline-none focus:border-accent cursor-pointer shrink-0"
          title={t('exercise.library.filterMuscle')}
        >
          <option value="">{t('exercise.library.filterMuscle')}</option>
          {['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'abs', 'full_body'].map(m => (
            <option key={m} value={m}>{t(`muscle.${m}` as Parameters<typeof t>[0])}</option>
          ))}
        </select>
      </div>
      {open && results.length > 0 && rect && createPortal(
        <ul
          ref={listRef}
          style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
          className="z-[100] bg-card border border-border rounded-lg shadow-lg max-h-72 overflow-y-auto"
        >
          {results.map((item, i) => (
            <SearchItem
              key={item.id}
              item={item}
              isActive={i === activeIdx}
              onSelect={() => select(item)}
              onHover={() => setActiveIdx(i)}
            />
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}
