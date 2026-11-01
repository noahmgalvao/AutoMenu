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

  React.useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setSourceMenuId(null);
  }, [open, defaultName]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1200] bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={(event) => event.target === event.currentTarget && !loading && onClose()}>
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div><h2 className="font-bold text-slate-900">Novo cardápio</h2><p className="text-xs text-slate-500 mt-1">Criar cardápio a partir de</p></div>
          <button onClick={onClose} disabled={loading} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <label className="block"><span className="text-xs font-bold text-slate-600">Nome</span><input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" /></label>
          <div className="grid sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto custom-scrollbar">
            <button onClick={() => setSourceMenuId(null)} className={`text-left p-4 rounded-2xl border ${sourceMenuId === null ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <FilePlus2 size={18} className="text-indigo-600 mb-2" /><span className="block text-sm font-bold">Novo em branco</span><span className="text-xs text-slate-500">Usa os produtos iniciais.</span>
            </button>
            {menus.map((menu) => (
              <button key={menu.id} onClick={() => setSourceMenuId(menu.id)} className={`text-left p-4 rounded-2xl border ${sourceMenuId === menu.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <Copy size={18} className="text-violet-600 mb-2" /><span className="block text-sm font-bold truncate">{menu.name}</span><span className="text-xs text-slate-500">Cópia exata deste cardápio.</span>
              </button>
            ))}
          </div>
        </div>
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold">Cancelar</button>
          <button onClick={() => onCreate(name.trim() || defaultName, sourceMenuId)} disabled={loading} className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50">{loading && <Loader2 size={15} className="animate-spin" />} Criar</button>
        </div>
      </div>
    </div>
  );
};
