
import React from 'react';
import { Loader2, Sparkles, Minus, Plus, BarChart, CopyCheck, ChevronDown, CopyPlus } from 'lucide-react';

interface ImportToolsProps {
  onStartAIImport: () => void;
  isUploading: boolean;
  bulkPercentage: number | string;
  setBulkPercentage: (value: string) => void;
  bulkAdjustmentMode: 'percentage' | 'integer';
  setBulkAdjustmentMode: (value: 'percentage' | 'integer') => void;
  handleBulkAdjust: (direction: 1 | -1) => void;
  setShowInsights: (show: boolean) => void;
  multiSelectMode: boolean;
  setMultiSelectMode?: (enabled: boolean) => void;
  onImportProducts: () => void;
}

export const ImportTools: React.FC<ImportToolsProps> = ({
  onStartAIImport,
  isUploading,
  bulkPercentage,
  setBulkPercentage,
  bulkAdjustmentMode,
  setBulkAdjustmentMode,
  handleBulkAdjust,
  setShowInsights,
  multiSelectMode,
  setMultiSelectMode,
  onImportProducts
}) => {
  return (
    <div className="mb-4 space-y-2.5">
      <button 
        onClick={onStartAIImport}
        disabled={isUploading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md"
      >
        {isUploading ? <Loader2 className="animate-spin" size={16}/> : <Sparkles size={16}/>}
        Importar foto com IA
      </button>

      <div className="grid grid-cols-[minmax(0,1fr)_5.75rem] grid-rows-[2.25rem_2.25rem_2.25rem] gap-2">
        <div className="row-span-3 flex min-w-0 flex-col rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">Alterar preços</div>
          <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 rounded-lg bg-slate-50 px-2">
            <input 
              className="min-w-0 bg-transparent py-1 text-xl font-semibold leading-none text-slate-800 outline-none"
              placeholder="10"
              type="number"
              min="0"
              step={bulkAdjustmentMode === 'percentage' ? '0.1' : '1'}
              value={bulkPercentage}
              onChange={e => setBulkPercentage(e.target.value)}
            />
            <span className="shrink-0 text-sm font-semibold text-slate-400">
              {bulkAdjustmentMode === 'percentage' ? '%' : 'R$'}
            </span>
          </div>
          <label className="relative mt-1.5 block shrink-0">
              <select
                className="h-7 w-full appearance-none rounded-md border-0 bg-slate-100 py-1 pl-2 pr-6 text-[10px] font-medium text-slate-600 outline-none ring-1 ring-inset ring-slate-200"
                value={bulkAdjustmentMode}
                onChange={(e) => setBulkAdjustmentMode(e.target.value as 'percentage' | 'integer')}
              >
                <option value="percentage">Porcentagem</option>
                <option value="integer">Inteiro</option>
              </select>
              <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
            </label>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <button onClick={() => handleBulkAdjust(-1)} className="flex h-7 items-center justify-center rounded-md bg-rose-50 text-rose-600 transition hover:bg-rose-100" title="Diminuir preços"><Minus size={13}/></button>
            <button onClick={() => handleBulkAdjust(1)} className="flex h-7 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100" title="Aumentar preços"><Plus size={13}/></button>
          </div>
        </div>
        <button
          onClick={() => setShowInsights(true)}
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600 flex items-center justify-center gap-1.5"
          title="Análises"
        >
          <BarChart size={18} />
          <span>Análises</span>
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setMultiSelectMode?.(!multiSelectMode); }}
          className={`h-9 rounded-lg border flex items-center justify-center gap-1.5 px-2 text-[10px] font-semibold transition-colors ${multiSelectMode ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100'}`}
          title="Seleção múltipla"
        >
          <CopyCheck size={15} />
          Seleção múltipla
        </button>
        <button
          type="button"
          onClick={onImportProducts}
          className="h-9 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-indigo-600 flex items-center justify-center gap-1.5 px-2 text-[10px] font-semibold transition-colors"
          title="Importar produtos de outro cardápio"
        >
          <CopyPlus size={15} />
          Cardápios
        </button>
      </div>
    </div>
  );
};
