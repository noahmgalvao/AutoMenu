import React from 'react';
import { Check, CircleHelp, CopyPlus, Link2Off, Loader2, X } from 'lucide-react';
import type { MenuProductSource, MenuProductSync } from '../../types';
import { listMenuProductSources, listMenuProductSyncs, unlinkSyncedMenuProducts } from '../../services/workspaceService';
import type { Product } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { loadUserPreferences, saveUserPreferences } from '../../utils/userPreferences';

interface ProductTransferModalProps {
  open: boolean;
  workspaceId: string;
  currentMenuId: string;
  products: Product[];
  preferenceKey: string;
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

const DEFAULT_PREFERENCES = { replace: true, sync: true };

export const ProductTransferModal: React.FC<ProductTransferModalProps> = ({ open, workspaceId, currentMenuId, products, preferenceKey, onClose, onApply }) => {
  const [sources, setSources] = React.useState<MenuProductSource[]>([]);
  const [syncs, setSyncs] = React.useState<MenuProductSync[]>([]);
  const [selectedId, setSelectedId] = React.useState('');
  const [replace, setReplace] = React.useState(true);
  const [sync, setSync] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [unlinkingMenuId, setUnlinkingMenuId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const preferences = loadUserPreferences(preferenceKey, DEFAULT_PREFERENCES);
    setLoading(true); setError(null); setSources([]); setSyncs([]); setSelectedId(''); setReplace(preferences.replace); setSync(preferences.sync);
    void Promise.allSettled([
      listMenuProductSources({ workspaceId, currentMenuId, currentProducts: products }),
      listMenuProductSyncs({ workspaceId, currentMenuId }),
    ])
      .then(([sourcesResult, syncsResult]) => {
        if (sourcesResult.status === 'fulfilled') {
          setSources(sourcesResult.value);
          setSelectedId(sourcesResult.value[0]?.menu.id || '');
        } else {
          setError(getErrorMessage(sourcesResult.reason, 'Não foi possível carregar os cardápios. Tente novamente.'));
        }
        setSyncs(syncsResult.status === 'fulfilled' ? syncsResult.value : []);
      })
      .finally(() => setLoading(false));
  }, [open, workspaceId, currentMenuId, preferenceKey]);

  const updatePreferences = (preferences: { replace: boolean; sync: boolean }) => {
    setReplace(preferences.replace);
    setSync(preferences.sync);
    saveUserPreferences(preferenceKey, preferences);
  };

  if (!open) return null;
  const selected = sources.find((source) => source.menu.id === selectedId);
  const apply = async () => {
    if (!selected) return;
    setLoading(true); setError(null);
    try { await onApply(selected, replace, sync); onClose(); }
    catch (reason) { setError(getErrorMessage(reason, 'Não foi possível importar os produtos. Tente novamente.')); }
    finally { setLoading(false); }
  };

  const unlink = async (linkedMenu: MenuProductSync) => {
    if (!window.confirm(`Desvincular os produtos de "${linkedMenu.menu.name}"? Os cardápios deixarão de receber alterações um do outro.`)) return;
    setUnlinkingMenuId(linkedMenu.menu.id); setError(null);
    try {
      await unlinkSyncedMenuProducts({ workspaceId, sourceMenuId: currentMenuId, targetMenuId: linkedMenu.menu.id });
      setSyncs((current) => current.filter((item) => item.menu.id !== linkedMenu.menu.id));
    } catch (reason) {
      setError(getErrorMessage(reason, 'Não foi possível desvincular os produtos. Tente novamente.'));
    } finally {
      setUnlinkingMenuId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[1300] bg-slate-950/45 flex items-center justify-center p-4" onMouseDown={(event) => event.target === event.currentTarget && !loading && onClose()}>
      <div className="w-full max-w-md max-h-[calc(100dvh-2rem)] rounded-3xl bg-white shadow-2xl overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-100 flex justify-between"><div><h2 className="font-bold flex items-center gap-2"><CopyPlus size={18} className="text-indigo-600" /> Importar produtos</h2><p className="text-xs text-slate-500 mt-1">Copie produtos de outro cardápio e escolha se deseja mantê-los sincronizados.</p></div><button onClick={onClose} className="p-2 text-slate-400"><X size={18} /></button></div>
        <div className="p-5 space-y-3 overflow-y-auto">
          {loading && sources.length === 0 ? <div className="h-28 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div> : sources.length === 0 ? <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Nenhum outro cardápio possui produtos diferentes.</div> : (
            <>
              <label className="block"><span className="text-xs font-bold text-slate-600">Cardápio</span><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">{sources.map((source) => <option key={source.menu.id} value={source.menu.id}>{source.menu.name} · {source.products.length} produtos</option>)}</select></label>
              <CheckOption checked={replace} onChange={(checked) => updatePreferences({ replace: checked, sync })} label="Substituir produtos atuais" help="Remove os produtos atuais e mantém somente os produtos do cardápio selecionado." />
              <CheckOption checked={sync} onChange={(checked) => updatePreferences({ replace, sync: checked })} label="Manter cardápios sincronizados" help="Alterações nesses produtos serão refletidas em todos os cardápios que também os possuem." />
            </>
          )}
          {syncs.length > 0 && (
            <div className="pt-2 space-y-2">
              <div>
                <h3 className="text-xs font-bold text-slate-700">Produtos sincronizados</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Desvincule um cardápio para que eles deixem de compartilhar alterações.</p>
              </div>
              {syncs.map((linkedMenu) => (
                <div key={linkedMenu.menu.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-700">{linkedMenu.menu.name}</p>
                    <p className="text-[11px] text-slate-500">{linkedMenu.productCount} produto{linkedMenu.productCount === 1 ? '' : 's'} sincronizado{linkedMenu.productCount === 1 ? '' : 's'}</p>
                  </div>
                  <button type="button" onClick={() => void unlink(linkedMenu)} disabled={Boolean(unlinkingMenuId)} className="shrink-0 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 flex items-center gap-1.5">
                    {unlinkingMenuId === linkedMenu.menu.id ? <Loader2 size={13} className="animate-spin" /> : <Link2Off size={13} />}
                    Desvincular
                  </button>
                </div>
              ))}
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="px-5 py-4 bg-slate-50 border-t flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2 rounded-xl border bg-white text-sm font-semibold">Cancelar</button><button onClick={() => void apply()} disabled={!selected || loading} className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-2">{loading && <Loader2 size={14} className="animate-spin" />} Importar produtos</button></div>
      </div>
    </div>
  );
};
