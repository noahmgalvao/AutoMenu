
import React from 'react';
import { MenuStyle } from '../../types';
import { Loader2, Sparkles, Minus, Plus, ImageIcon, BarChart, ListChecks, ChevronDown } from 'lucide-react';

interface ImportToolsProps {
  onStartAIImport: () => void;
  isUploading: boolean;
  bulkPercentage: number | string;
  setBulkPercentage: (value: string) => void;
  bulkAdjustmentMode: 'percentage' | 'integer';
  setBulkAdjustmentMode: (value: 'percentage' | 'integer') => void;
  handleBulkAdjust: (direction: 1 | -1) => void;
  style: MenuStyle;
  setStyle: React.Dispatch<React.SetStateAction<MenuStyle>>;
  setShowInsights: (show: boolean) => void;
  multiSelectMode: boolean;
  setMultiSelectMode?: (enabled: boolean) => void;
}

export const ImportTools: React.FC<ImportToolsProps> = ({
  onStartAIImport,
  isUploading,
  bulkPercentage,
  setBulkPercentage,
  bulkAdjustmentMode,
  setBulkAdjustmentMode,
  handleBulkAdjust,
  style,
  setStyle,
  setShowInsights,
  multiSelectMode,
  setMultiSelectMode
}) => {
  return (
    <div className="space-y-3 mb-6">
      <button 
        onClick={onStartAIImport}
        disabled={isUploading}
        className="w-full flex items-center justify-center gap-2 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-lg shadow-sm hover:shadow-md transition-all text-sm font-medium"
      >
        {isUploading ? <Loader2 className="animate-spin" size={16}/> : <Sparkles size={16}/>}
        Importar foto com IA
      </button>

      <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_2.5rem] grid-rows-[2.5rem_2.5rem] gap-2">
        <div className="row-span-2 bg-white border border-slate-200 rounded-lg p-2 grid grid-rows-[minmax(0,1fr)_2rem] gap-1">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 min-w-0">
            <input 
              className="min-w-0 flex-1 bg-transparent text-lg leading-none px-1 py-1 outline-none font-semibold text-slate-800"
              placeholder="0"
              type="number"
              min="0"
              step={bulkAdjustmentMode === 'percentage' ? '0.1' : '1'}
              value={bulkPercentage}
              onChange={e => setBulkPercentage(e.target.value)}
            />
            <span className="shrink-0 text-lg font-semibold text-slate-400">
              {bulkAdjustmentMode === 'percentage' ? '%' : '$'}
            </span>
            <label className="relative block w-[108px] shrink-0">
              <select
                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-md py-1.5 pl-1.5 pr-4 text-[9px] font-medium text-slate-600 outline-none"
                value={bulkAdjustmentMode}
                onChange={(e) => setBulkAdjustmentMode(e.target.value as 'percentage' | 'integer')}
              >
                <option value="percentage">Porcentagem</option>
                <option value="integer">Inteiro</option>
              </select>
              <ChevronDown size={10} className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button onClick={() => handleBulkAdjust(-1)} className="h-8 bg-slate-100 shadow-sm rounded hover:text-red-600 flex items-center justify-center"><Minus size={12}/></button>
            <button onClick={() => handleBulkAdjust(1)} className="h-8 bg-slate-100 shadow-sm rounded hover:text-green-600 flex items-center justify-center"><Plus size={12}/></button>
          </div>
        </div>
        <button 
          onClick={() => setStyle(prev => ({ ...prev, showImages: !prev.showImages, name: 'Custom' }))}
          className={`h-10 w-10 rounded-lg border flex items-center justify-center ${style.showImages ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-400'}`}
          title="Mostrar/ocultar imagens dos produtos"
        >
          <ImageIcon size={18} />
        </button>
        <button 
          onClick={() => setShowInsights(true)}
          className="h-10 w-10 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 flex items-center justify-center"
          title="Análises"
        >
          <BarChart size={18} />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setMultiSelectMode?.(!multiSelectMode); }}
          className={`col-span-2 h-10 rounded-lg border flex items-center justify-center gap-2 px-3 text-[11px] font-semibold transition-colors ${multiSelectMode ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100'}`}
          title="Seleção múltipla"
        >
          <ListChecks size={15} />
          Seleção múltipla
        </button>
      </div>
    </div>
  );
};
