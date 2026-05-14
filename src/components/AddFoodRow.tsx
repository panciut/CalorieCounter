import { useState } from 'react';
import FoodSearch, { type SearchItem } from './FoodSearch';
import { useT } from '../i18n/useT';
import type { Food } from '../types';

interface AddFoodRowProps {
  foods: Food[];
  onAdd: (food: Food, grams: number) => void;
}

export default function AddFoodRow({ foods, onAdd }: AddFoodRowProps) {
  const { t } = useT();
  const [selected, setSelected] = useState<Food | null>(null);
  const [amount, setAmount]     = useState('');
  const [usePieces, setUsePieces] = useState(false);
  const [searchKey, setSearchKey] = useState(0);

  const items: SearchItem[] = foods.map(f => ({ ...f, isRecipe: false as const }));

  function handleSelect(item: SearchItem) {
    if (item.isRecipe) return;
    const food = item as Food;
    setSelected(food);
    setUsePieces(!!food.piece_grams);
    setAmount(food.piece_grams ? '1' : '');
  }

  function handleClear() {
    setSelected(null);
    setAmount('');
    setUsePieces(false);
  }

  const effectiveGrams = selected
    ? (usePieces && selected.piece_grams
        ? Math.round(parseFloat(amount || '0') * selected.piece_grams * 100) / 100
        : parseFloat(amount || '0'))
    : 0;

  function handleAdd() {
    if (!selected || !effectiveGrams) return;
    onAdd(selected, effectiveGrams);
    handleClear();
    setSearchKey(k => k + 1);
  }

  const inputCls = 'bg-card border border-border rounded-md px-3 py-2 text-sm text-text outline-none focus:border-accent';

  return (
    <div className="flex flex-col gap-2">
      <FoodSearch
        key={searchKey}
        items={items}
        onSelect={handleSelect}
        onClear={handleClear}
        placeholder={t('foods.searchPlaceholder')}
      />
      {selected && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-3 text-xs text-text-sec bg-bg rounded-lg px-3 py-2">
            <span className="text-text font-medium">{selected.name}</span>
            <span>per 100g:</span>
            <span><span className="text-text font-medium">{Math.round(selected.calories)}</span> kcal</span>
            <span><span className="text-text font-medium">{Math.round(selected.protein * 100) / 100}</span>g P</span>
            <span><span className="text-text font-medium">{Math.round(selected.carbs * 100) / 100}</span>g C</span>
            <span><span className="text-text font-medium">{Math.round(selected.fat * 100) / 100}</span>g F</span>
          </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text" inputMode="decimal"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder={usePieces ? `${t('common.pieces')} (${selected.piece_grams}g)` : t('common.grams')}
            className={`w-32 ${inputCls}`}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          />
          {selected.piece_grams && (
            <button
              type="button"
              onClick={() => { setUsePieces(v => !v); setAmount(''); }}
              className="text-xs text-accent underline cursor-pointer"
            >
              {usePieces ? t('dash.switchToGrams') : t('dash.switchToPieces')}
            </button>
          )}
          <button
            type="button"
            onClick={handleAdd}
            disabled={!effectiveGrams}
            className="px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 cursor-pointer disabled:opacity-40"
          >
            {t('common.add')}
          </button>
          </div>
          {effectiveGrams > 0 && (
            <div className="text-xs text-text-sec tabular-nums">
              = <span className="text-text font-medium">{Math.round(selected.calories * effectiveGrams / 100)}</span> kcal
              <span className="mx-1">·</span>P <span className="text-text">{Math.round(selected.protein * effectiveGrams / 10) / 10}</span>g
              <span className="mx-1">·</span>C <span className="text-text">{Math.round(selected.carbs * effectiveGrams / 10) / 10}</span>g
              <span className="mx-1">·</span>F <span className="text-text">{Math.round(selected.fat * effectiveGrams / 10) / 10}</span>g
            </div>
          )}
        </div>
      )}
    </div>
  );
}
