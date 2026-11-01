import React from 'react';
import { ArrowLeft, Clock3, Eye, Loader2, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { MenuVersion, MenuStyle, Product, SortOption } from '../types';
import { listMenuRevisions, loadMenuRevisionState } from '../services/workspaceService';
import { getErrorMessage } from '../utils/errors';
import { MenuPreview } from './MenuPreview';

type RevisionState = { products: Product[]; style: MenuStyle; sortOption: SortOption };

interface RevisionHistoryModalProps {
  open: boolean;
  workspaceId: string;
  menuId: string;
  splitCategoryAcrossPages?: boolean;
  onClose: () => void;
  onRestore: (state: RevisionState) => void;
}

const clampZoom = (value: number) => Math.min(1.5, Math.max(0.2, value));

const ReadOnlyCanvas: React.FC<{
  preview: RevisionState;
  scale: number;
  setScale: React.Dispatch<React.SetStateAction<number>>;
  splitCategoryAcrossPages?: boolean;
}> = ({ preview, scale, setScale, splitCategoryAcrossPages }) => {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const pinchRef = React.useRef<{ distance: number; scale: number } | null>(null);
  const [showZoom, setShowZoom] = React.useState(false);
  const zoomTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateZoom = React.useCallback((delta: number) => {
    setScale((current) => clampZoom(Number((current + delta).toFixed(2))));
    setShowZoom(true);
    if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
    zoomTimerRef.current = setTimeout(() => setShowZoom(false), 1000);
  }, [setScale]);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      updateZoom(event.deltaY * -0.0035);
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [updateZoom]);

  React.useEffect(() => () => {
    if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
  }, []);

  const touchDistance = (touches: React.TouchList) => Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY,
  );

  return (
    <div
      ref={viewportRef}
      className="relative h-full min-h-0 overflow-auto bg-slate-200 custom-scrollbar touch-pan-x touch-pan-y"
      onTouchStart={(event) => {
        if (event.touches.length === 2) pinchRef.current = { distance: touchDistance(event.touches), scale };
      }}
      onTouchMove={(event) => {
        if (event.touches.length !== 2 || !pinchRef.current) return;
        event.preventDefault();
        const nextScale = clampZoom(pinchRef.current.scale * (touchDistance(event.touches) / pinchRef.current.distance));
        setScale(nextScale);
        setShowZoom(true);
      }}
      onTouchEnd={(event) => {
        if (event.touches.length < 2) {
          pinchRef.current = null;
          if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
          zoomTimerRef.current = setTimeout(() => setShowZoom(false), 800);
        }
      }}
      onTouchCancel={() => { pinchRef.current = null; }}
    >
      <div className={`sticky top-3 z-20 flex justify-end gap-2 pr-3 pointer-events-none ${showZoom ? '' : ''}`}>
        <span className={`self-center rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-bold text-white transition-opacity ${showZoom ? 'opacity-100' : 'opacity-0'}`}>{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => updateZoom(-0.1)} className="pointer-events-auto p-2.5 rounded-full bg-white text-slate-700 shadow-lg hover:bg-slate-50" aria-label="Diminuir zoom"><ZoomOut size={18} /></button>
        <button type="button" onClick={() => updateZoom(0.1)} className="pointer-events-auto p-2.5 rounded-full bg-white text-slate-700 shadow-lg hover:bg-slate-50" aria-label="Aumentar zoom"><ZoomIn size={18} /></button>
      </div>
      <div className="w-fit min-w-full p-3 md:p-6 flex justify-center items-start">
        <div className="w-fit origin-top-left" style={{ zoom: scale }}>
          <MenuPreview
            products={preview.products}
            style={preview.style}
            sortOption={preview.sortOption}
            readOnly
            splitCategoryAcrossPages={splitCategoryAcrossPages}
          />
        </div>
      </div>
    </div>
  );
};

export const RevisionHistoryModal: React.FC<RevisionHistoryModalProps> = ({
  open,
  workspaceId,
  menuId,
  splitCategoryAcrossPages,
  onClose,
  onRestore,
}) => {
  const [revisions, setRevisions] = React.useState<MenuVersion[]>([]);
  const [selected, setSelected] = React.useState<MenuVersion | null>(null);
  const [preview, setPreview] = React.useState<RevisionState | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [canvasMode, setCanvasMode] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(() => window.matchMedia('(max-width: 767px)').matches);
  const [scale, setScale] = React.useState(isMobile ? 0.28 : 0.55);

  React.useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => { setIsMobile(query.matches); setScale(query.matches ? 0.28 : 0.55); };
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true); setError(null); setCanvasMode(false); setScale(isMobile ? 0.28 : 0.55);
    void listMenuRevisions(menuId)
      .then((items) => { setRevisions(items); setSelected(items[0] || null); })
      .catch((reason) => setError(getErrorMessage(reason, 'Falha ao carregar histórico.')))
      .finally(() => setLoading(false));
  }, [open, menuId]);

  React.useEffect(() => {
    if (!selected) { setPreview(null); return; }
    setLoading(true); setError(null); setScale(isMobile ? 0.28 : 0.55);
    void loadMenuRevisionState({ workspaceId, versionId: selected.id })
      .then(setPreview)
      .catch((reason) => setError(getErrorMessage(reason, 'Falha ao abrir revisão.')))
      .finally(() => setLoading(false));
  }, [selected?.id, workspaceId]);

  if (!open) return null;

  if (canvasMode) {
    return (
      <div className="fixed inset-0 z-[1300] bg-slate-200 flex flex-col">
        <div className="h-16 shrink-0 border-b bg-white px-3 md:px-5 flex items-center justify-between gap-3">
          <button type="button" onClick={() => setCanvasMode(false)} className="h-10 px-3 rounded-xl border border-slate-200 text-sm font-bold flex items-center gap-2"><ArrowLeft size={17} /> Voltar</button>
          <div className="min-w-0 text-center"><div className="text-sm font-bold text-slate-900 truncate">{selected?.actionLabel || 'Alteração salva'}</div>{selected && <div className="text-[10px] text-slate-500">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(selected.createdAt))}</div>}</div>
          <button type="button" onClick={() => preview && onRestore(preview)} disabled={!preview || loading} className="h-10 px-3 rounded-xl bg-indigo-600 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50"><RotateCcw size={16} /><span className="hidden sm:inline">Restaurar</span></button>
        </div>
        <div className="relative min-h-0 flex-1">
          {preview && <ReadOnlyCanvas preview={preview} scale={scale} setScale={setScale} splitCategoryAcrossPages={splitCategoryAcrossPages} />}
          {loading && <div className="absolute inset-0 z-30 bg-white/60 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>}
          {error && <p className="absolute left-4 right-4 top-4 z-30 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1250] bg-slate-950/50 backdrop-blur-sm p-2 md:p-6 flex items-center justify-center">
      <div className="w-full h-full max-w-6xl max-h-[96vh] md:max-h-[92vh] bg-white rounded-2xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-4 border-b flex items-center justify-between"><div><h2 className="font-bold flex items-center gap-2"><Clock3 size={18} className="text-indigo-600" /> Histórico de revisões</h2><p className="text-xs text-slate-500 mt-0.5">Consulte e restaure estados anteriores.</p></div><button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button></div>
        <div className="min-h-0 flex-1 grid md:grid-cols-[300px_1fr]">
          <aside className="overflow-y-auto md:border-r p-3 space-y-2 custom-scrollbar bg-slate-50">
            {revisions.map((revision) => (
              <button key={revision.id} onClick={() => { setPreview(null); setLoading(true); setSelected(revision); if (isMobile) setCanvasMode(true); }} className={`w-full text-left rounded-2xl border p-3 ${selected?.id === revision.id ? 'border-indigo-400 bg-white shadow-sm' : 'border-transparent hover:bg-white'}`}>
                <span className="block text-xs font-bold text-slate-800">{revision.actionLabel || 'Alteração salva'}</span>
                <span className="block text-[11px] text-slate-500 mt-1">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(revision.createdAt))}</span>
                <span className="md:hidden mt-2 text-[11px] font-bold text-indigo-600 flex items-center gap-1"><Eye size={12} /> Abrir preview</span>
              </button>
            ))}
            {!loading && revisions.length === 0 && <p className="text-sm text-slate-500 p-3">Nenhuma revisão encontrada.</p>}
          </aside>
          <main className="relative hidden md:block min-h-0">
            {preview && <ReadOnlyCanvas preview={preview} scale={scale} setScale={setScale} splitCategoryAcrossPages={splitCategoryAcrossPages} />}
            {loading && <div className="absolute inset-0 z-30 bg-white/60 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>}
            {error && <p className="absolute left-4 right-4 top-4 z-30 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          </main>
        </div>
        <div className="p-3 md:p-4 border-t bg-white flex justify-between gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-semibold">Fechar</button>
          <div className="hidden md:flex gap-2"><button onClick={() => setCanvasMode(true)} disabled={!preview || loading} className="px-4 py-2 rounded-xl border text-sm font-bold flex items-center gap-2 disabled:opacity-50"><Eye size={15} /> Ver no canvas</button><button onClick={() => preview && onRestore(preview)} disabled={!preview || loading} className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50"><RotateCcw size={15} /> Restaurar este estado</button></div>
        </div>
      </div>
    </div>
  );
};
