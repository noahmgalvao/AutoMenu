import React from 'react';
import { Copy, FilePlus2, Loader2, X } from 'lucide-react';
import type { Menu } from '../types';

interface CreateMenuModalProps {
  open: boolean;
  menus: Menu[];
  defaultName: string;
  loading?: boolean;
  onClose: () => void;
  onCreate: (name: string, sourceMenuId: string | null) => void;
}

export const CreateMenuModal: React.FC<CreateMenuModalProps> = ({ open, menus, defaultName, loading = false, onClose, onCreate }) => {
  const [name, setName] = React.useState(defaultName);
  const [sourceMenuId, setSourceMenuId] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<'blank' | 'copy'>('blank');
  const sources = menus.filter(menu => menu.status !== 'archived' && menu.currentDraftVersionId);

  React.useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setSourceMenuId(null);
    setMode('blank');
  }, [open, defaultName]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1200] bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={(event) => event.target === event.currentTarget && !loading && onClose()}>
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-900">Novo cardápio</h2>
          <button onClick={onClose} disabled={loading} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <label className="block"><span className="text-xs font-bold text-slate-600">Nome</span><input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" /></label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" aria-pressed={mode === 'blank'} onClick={() => setMode('blank')} className={`text-left p-4 rounded-2xl border ${mode === 'blank' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <FilePlus2 size={18} className="text-indigo-600 mb-2" /><span className="block text-sm font-bold">Criar em branco</span>
            </button>
            <button type="button" aria-pressed={mode === 'copy'} disabled={!sources.length} onClick={() => setMode('copy')} className={`text-left p-4 rounded-2xl border disabled:opacity-50 ${mode === 'copy' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <Copy size={18} className="text-violet-600 mb-2" /><span className="block text-sm font-bold">Criar a partir de outro</span>
            </button>
          </div>
          {mode === 'copy' && <label className="block text-xs font-bold text-slate-600">
            Cardápio de origem
            <select value={sourceMenuId || ''} onChange={event => setSourceMenuId(event.target.value || null)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
              <option value="" disabled>Selecione um cardápio</option>
              {sources.map(menu => <option key={menu.id} value={menu.id}>{menu.name}</option>)}
            </select>
          </label>}
        </div>
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold">Cancelar</button>
          <button onClick={() => onCreate(name.trim() || defaultName, mode === 'copy' ? sourceMenuId : null)} disabled={loading || (mode === 'copy' && !sources.some(menu => menu.id === sourceMenuId))} className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50">{loading && <Loader2 size={15} className="animate-spin" />} Criar</button>
        </div>
      </div>
    </div>
  );
};
