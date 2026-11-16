import React from 'react';
import type { CategoryDividerStyle } from '../../types';
import { CATEGORY_DIVIDER_PRESETS, getCategoryDividerStyle } from '../../utils/categoryDividers';

interface CategoryDividerPickerProps {
  value: CategoryDividerStyle;
  color: string;
  onChange: (value: CategoryDividerStyle) => void;
  compact?: boolean;
}

export const CategoryDividerPicker: React.FC<CategoryDividerPickerProps> = ({ value, color, onChange, compact = false }) => (
  <div className="space-y-1.5">
    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Linha da categoria</div>
    <div className={`grid ${compact ? 'grid-cols-5' : 'grid-cols-2'} gap-1.5`}>
      {CATEGORY_DIVIDER_PRESETS.map((preset) => (
        <button
          key={preset.value}
          type="button"
          onClick={() => onChange(preset.value)}
          className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left transition ${
            value === preset.value
              ? 'border-indigo-400 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100'
              : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-slate-50'
          }`}
          title={preset.label}
          aria-label={`Linha ${preset.label}`}
        >
          <span className="min-w-0 flex-1" style={getCategoryDividerStyle(preset.value, color, 'right')} />
          {!compact && <span className="truncate text-[10px] font-semibold">{preset.label}</span>}
        </button>
      ))}
    </div>
  </div>
);
