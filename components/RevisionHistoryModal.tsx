import React from 'react';
import { ArrowLeft, Eye, History, Loader2, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
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
const getInitialScale = (isMobile: boolean) => isMobile ? 0.28 : 0.78;

const getRevisionTitle = (revision: MenuVersion) => {
  const label = revision.actionLabel?.trim();
  if (label && label.toLocaleLowerCase('pt-BR') !== 'alteração salva') return label;
  if (revision.versionType === 'published') return 'Cardápio publicado';
  return `Revisão ${revision.versionNumber}`;
};

const formatRevisionTime = (createdAt: string) => new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(createdAt));

const formatRevisionDateTime = (createdAt: string) => new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date(createdAt));

const getRevisionDayLabel = (createdAt: string) => {
  const date = new Date(createdAt);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Hoje';
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
};

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
  const [scale, setScale] = React.useState(getInitialScale(isMobile));
  const revisionGroups = React.useMemo(() => {
    const groups: Array<{ key: string; label: string; revisions: MenuVersion[] }> = [];
    revisions.forEach((revision) => {
      const key = new Date(revision.createdAt).toDateString();
      const lastGroup = groups[groups.length - 1];
      if (lastGroup?.key === key) lastGroup.revisions.push(revision);
      else groups.push({ key, label: getRevisionDayLabel(revision.createdAt), revisions: [revision] });
    });
    return groups;
  }, [revisions]);
  const selectedTitle = selected ? getRevisionTitle(selected) : '';

  React.useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => { setIsMobile(query.matches); setScale(getInitialScale(query.matches)); };
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true); setError(null); setCanvasMode(false); setScale(getInitialScale(isMobile));
    void listMenuRevisions(menuId)
      .then((items) => { setRevisions(items); setSelected(items[0] || null); })
      .catch((reason) => setError(getErrorMessage(reason, 'Falha ao carregar histórico.')))
      .finally(() => setLoading(false));
  }, [open, menuId]);

  React.useEffect(() => {
    if (!selected) { setPreview(null); return; }
    setLoading(true); setError(null); setScale(getInitialScale(isMobile));
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
          <div className="min-w-0 text-center"><div className="text-sm font-bold text-slate-900 truncate">{selectedTitle}</div>{selected && <div className="text-[10px] text-slate-500">{formatRevisionDateTime(selected.createdAt)}</div>}</div>
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
      <div className="w-full h-full max-w-5xl max-h-[96vh] md:max-h-[90vh] bg-white rounded-2xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-4 py-3.5 border-b flex items-center justify-between"><div><h2 className="font-bold flex items-center gap-2"><History size={18} className="text-indigo-600" /> Histórico de revisões</h2><p className="text-xs text-slate-500 mt-0.5">{revisions.length} {revisions.length === 1 ? 'estado salvo' : 'estados salvos'}</p></div><button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button></div>
        <div className="min-h-0 flex-1 grid md:grid-cols-[310px_minmax(0,1fr)]">
          <aside className="overflow-y-auto md:border-r custom-scrollbar bg-slate-50">
            {revisionGroups.map((group) => (
              <section key={group.key}>
                <div className="sticky top-0 z-10 border-y border-slate-200/80 bg-slate-100/95 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 backdrop-blur-sm">{group.label}</div>
                <div className="relative ml-5 border-l border-slate-200 py-2 pr-3 pl-4 space-y-1">
                  {group.revisions.map((revision) => {
                    const active = selected?.id === revision.id;
                    return (
                      <button key={revision.id} onClick={() => { setPreview(null); setLoading(true); setSelected(revision); if (isMobile) setCanvasMode(true); }} className={`relative w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${active ? 'border-indigo-300 bg-white shadow-sm' : 'border-transparent hover:border-slate-200 hover:bg-white'}`}>
                        <span className={`absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full border-2 ${active ? 'border-indigo-600 bg-indigo-100' : 'border-slate-300 bg-slate-50'}`} />
                        <span className="block text-xs font-bold text-slate-800">{getRevisionTitle(revision)}</span>
                        <span className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-500"><span>{formatRevisionTime(revision.createdAt)}</span><span>v{revision.versionNumber}</span></span>
                        <span className="md:hidden mt-2 text-[11px] font-bold text-indigo-600 flex items-center gap-1"><Eye size={12} /> Abrir preview</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            {loading && revisions.length === 0 && <div className="h-32 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>}
            {!loading && revisions.length === 0 && <p className="text-sm text-slate-500 p-5">Nenhuma revisão encontrada.</p>}
          </aside>
          <main className="relative hidden md:flex min-h-0 flex-col bg-slate-100">
            <div className="h-16 shrink-0 border-b bg-white px-4 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="truncate text-sm font-bold text-slate-900">{selectedTitle || 'Selecione uma revisão'}</div>{selected && <div className="mt-0.5 text-[10px] text-slate-500">{formatRevisionDateTime(selected.createdAt)} · Somente leitura</div>}</div>
              <div className="flex shrink-0 gap-2"><button onClick={() => setCanvasMode(true)} disabled={!preview || loading} className="h-9 px-3 rounded-xl border bg-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"><Eye size={14} /> Abrir canvas</button><button onClick={() => preview && onRestore(preview)} disabled={!preview || loading} className="h-9 px-3 rounded-xl bg-indigo-600 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"><RotateCcw size={14} /> Restaurar</button></div>
            </div>
            <div className="relative min-h-0 flex-1">
              {preview && <ReadOnlyCanvas preview={preview} scale={scale} setScale={setScale} splitCategoryAcrossPages={splitCategoryAcrossPages} />}
              {!preview && !loading && <div className="h-full flex items-center justify-center text-sm text-slate-500">Selecione uma revisão para visualizar.</div>}
              {loading && <div className="absolute inset-0 z-30 bg-white/60 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>}
              {error && <p className="absolute left-4 right-4 top-4 z-30 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};
