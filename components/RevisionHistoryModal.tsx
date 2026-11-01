import React from 'react';
import { Clock3, Loader2, RotateCcw, X } from 'lucide-react';
import type { MenuVersion, MenuStyle, Product, SortOption } from '../types';
import { listMenuRevisions, loadMenuRevisionState } from '../services/workspaceService';
import { MenuPreview } from './MenuPreview';

interface RevisionHistoryModalProps {
  open: boolean;
  workspaceId: string;
  menuId: string;
  onClose: () => void;
  onRestore: (state: { products: Product[]; style: MenuStyle; sortOption: SortOption }) => void;
}

export const RevisionHistoryModal: React.FC<RevisionHistoryModalProps> = ({ open, workspaceId, menuId, onClose, onRestore }) => {
  const [revisions, setRevisions] = React.useState<MenuVersion[]>([]);
  const [selected, setSelected] = React.useState<MenuVersion | null>(null);
  const [preview, setPreview] = React.useState<{ products: Product[]; style: MenuStyle; sortOption: SortOption } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true); setError(null);
    void listMenuRevisions(menuId).then((items) => { setRevisions(items); setSelected(items[0] || null); }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar histórico.')).finally(() => setLoading(false));
  }, [open, menuId]);

  React.useEffect(() => {
    if (!selected) { setPreview(null); return; }
    setLoading(true);
    void loadMenuRevisionState({ workspaceId, versionId: selected.id }).then(setPreview).catch((reason) => setError(reason instanceof Error ? reason.message : 'Falha ao abrir revisão.')).finally(() => setLoading(false));
  }, [selected?.id, workspaceId]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1250] bg-slate-950/50 backdrop-blur-sm p-3 md:p-6 flex items-center justify-center">
      <div className="w-full h-full max-w-6xl max-h-[92vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-4 border-b flex items-center justify-between"><div><h2 className="font-bold flex items-center gap-2"><Clock3 size={18} className="text-indigo-600" /> Histórico de revisões</h2><p className="text-xs text-slate-500 mt-0.5">Consulte e restaure estados anteriores.</p></div><button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button></div>
        <div className="min-h-0 flex-1 grid md:grid-cols-[300px_1fr]">
          <aside className="border-r overflow-y-auto p-3 space-y-2 custom-scrollbar bg-slate-50">
            {revisions.map((revision) => <button key={revision.id} onClick={() => setSelected(revision)} className={`w-full text-left rounded-2xl border p-3 ${selected?.id === revision.id ? 'border-indigo-400 bg-white shadow-sm' : 'border-transparent hover:bg-white'}`}><span className="block text-xs font-bold text-slate-800">{revision.actionLabel || 'Alteração salva'}</span><span className="block text-[11px] text-slate-500 mt-1">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(revision.createdAt))}</span></button>)}
            {!loading && revisions.length === 0 && <p className="text-sm text-slate-500 p-3">Nenhuma revisão encontrada.</p>}
          </aside>
          <main className="relative min-h-0 overflow-auto bg-slate-200 p-5 custom-scrollbar">
            {loading && <div className="absolute inset-0 z-10 bg-white/60 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>}
            {preview && <div className="origin-top mx-auto w-fit" style={{ zoom: 0.55 }}><MenuPreview products={preview.products} style={preview.style} sortOption={preview.sortOption} readOnly /></div>}
            {error && <p className="m-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          </main>
        </div>
        <div className="p-4 border-t bg-white flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-semibold">Fechar</button><button onClick={() => preview && onRestore(preview)} disabled={!preview || loading} className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50"><RotateCcw size={15} /> Restaurar este estado</button></div>
      </div>
    </div>
  );
};
