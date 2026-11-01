import React from 'react';
import { Check, CircleHelp, CopyPlus, Loader2, X } from 'lucide-react';
import type { MenuProductSource } from '../../types';
import { listMenuProductSources } from '../../services/workspaceService';
import type { Product } from '../../types';

interface ProductTransferModalProps {
  open: boolean;
  workspaceId: string;
  currentMenuId: string;
  products: Product[];
  onClose: () => void;
  onApply: (source: MenuProductSource, replace: boolean, sync: boolean) => Promise<void>;
}

const CheckOption: React.FC<{ checked: boolean; label: string; help: string; onChange: (value: boolean) => void }> = ({ checked, label, help, onChange }) => (
  <div className="flex items-center gap-2">
    <button type="button" onClick={() => onChange(!checked)} className={`flex-1 h-10 rounded-xl border px-3 text-xs font-semibold flex items-center gap-2 ${checked ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>
      <span className={`h-4 w-4 rounded border flex items-center justify-center ${checked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>{checked && <Check size={11} />}</span>{label}
    </button>
    <span className="group relative">
      <button type="button" className="p-2 text-slate-400 hover:text-indigo-600"><CircleHelp size={17} /></button>
      <span className="pointer-events-none absolute bottom-full right-0 mb-2 w-64 rounded-xl bg-slate-900 px-3 py-2 text-[11px] leading-relaxed text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 z-20">{help}</span>
    </span>
  </div>
);

export const ProductTransferModal: React.FC<ProductTransferModalProps> = ({ open, workspaceId, currentMenuId, products, onClose, onApply }) => {
  const [sources, setSources] = React.useState<MenuProductSource[]>([]);
  const [selectedId, setSelectedId] = React.useState('');
  const [replace, setReplace] = React.useState(true);
  const [sync, setSync] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true); setError(null); setReplace(true); setSync(true);
    void listMenuProductSources({ workspaceId, currentMenuId, currentProducts: products })
      .then((items) => { setSources(items); setSelectedId(items[0]?.menu.id || ''); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar cardápios.'))
      .finally(() => setLoading(false));
  }, [open, workspaceId, currentMenuId]);

  if (!open) return null;
  const selected = sources.find((source) => source.menu.id === selectedId);
  const apply = async () => {
    if (!selected) return;
    setLoading(true); setError(null);
    try { await onApply(selected, replace, sync); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao trazer produtos.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[1300] bg-slate-950/45 flex items-center justify-center p-4" onMouseDown={(event) => event.target === event.currentTarget && !loading && onClose()}>
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between"><div><h2 className="font-bold flex items-center gap-2"><CopyPlus size={18} className="text-indigo-600" /> Trazer produtos</h2><p className="text-xs text-slate-500 mt-1">Importe produtos de outro cardápio.</p></div><button onClick={onClose} className="p-2 text-slate-400"><X size={18} /></button></div>
        <div className="p-5 space-y-3">
          {loading && sources.length === 0 ? <div className="h-28 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div> : sources.length === 0 ? <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Nenhum outro cardápio possui produtos diferentes.</div> : (
            <>
              <label className="block"><span className="text-xs font-bold text-slate-600">Cardápio</span><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">{sources.map((source) => <option key={source.menu.id} value={source.menu.id}>{source.menu.name} · {source.products.length} produtos</option>)}</select></label>
              <CheckOption checked={replace} onChange={setReplace} label="Substituir produtos atuais" help="Remove os produtos atuais e mantém somente os produtos do cardápio selecionado." />
              <CheckOption checked={sync} onChange={setSync} label="Manter cardápios sincronizados" help="Alterações nesses produtos serão refletidas em todos os cardápios que também os possuem." />
            </>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="px-5 py-4 bg-slate-50 border-t flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2 rounded-xl border bg-white text-sm font-semibold">Cancelar</button><button onClick={() => void apply()} disabled={!selected || loading} className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-2">{loading && <Loader2 size={14} className="animate-spin" />} Trazer</button></div>
      </div>
    </div>
  );
};
