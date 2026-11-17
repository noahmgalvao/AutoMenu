import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { CategoryDividerStyle } from '../../types';
import { CATEGORY_DIVIDER_PRESETS, getCategoryDividerStyle } from '../../utils/categoryDividers';

interface CategoryDividerPickerProps {
  value: CategoryDividerStyle;
  color: string;
  onChange: (value: CategoryDividerStyle) => void;
  label?: string;
}

export const CategoryDividerPicker: React.FC<CategoryDividerPickerProps> = ({ value, color, onChange, label = 'Linha da categoria' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selected = CATEGORY_DIVIDER_PRESETS.find((preset) => preset.value === value) || CATEGORY_DIVIDER_PRESETS[0];

  const renderPreview = (preset: CategoryDividerStyle) => preset === 'none'
    ? <span className="w-full text-center text-[10px] text-slate-400">sem linha</span>
    : <span className="block w-full" data-ornamental-divider={preset === 'ornamental' ? 'right' : undefined} style={getCategoryDividerStyle(preset, color, 'right')} />;

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-9 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-left text-slate-700 transition hover:border-indigo-300"
        aria-expanded={isOpen}
      >
        <span className="flex h-4 min-w-0 flex-1 items-center">{renderPreview(selected.value)}</span>
        <span className="text-[11px] font-semibold">{selected.label}</span>
        <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {CATEGORY_DIVIDER_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => {
                onChange(preset.value);
                setIsOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition ${
                value === preset.value ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="flex h-4 min-w-0 flex-1 items-center">{renderPreview(preset.value)}</span>
              <span className="w-20 truncate text-[10px] font-semibold">{preset.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
