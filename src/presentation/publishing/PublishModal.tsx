import { DisclosureChevron } from '../common/DisclosureChevron';
import React from 'react';
import {
  AlertCircle,
  Check,
  Image as ImageIcon,
  Download,
  FileText,
  Loader2,
  Send,
  Settings2,
  Share2,
  X,
} from 'lucide-react';
import { resolveImagePages, toggleImagePage, type ImagePages } from '../../domain/publishing/imagePages';
import { lockModalScrolling } from '../common/modalScroll';
import { isPublishLocked, type JpgAction, type PublishOptions } from './useMenuPublishing';
import { loadUserPreferences, saveUserPreferences } from '../../infrastructure/browser/userPreferences';

import { ActionButton, Choice, VirtualLinkSection, type VirtualLinkControls } from './VirtualLinkSection';

type PdfAction = 'options' | 'download' | 'share';

interface PublishModalProps extends VirtualLinkControls {
  open: boolean;
  preferenceKey: string;
  hasPendingChanges?: boolean;
  onClose: () => void;
  pageCount: number;
  selectedPages: readonly number[];
  error?: string | null;
  onConfirm: (options: PublishOptions) => void;
  onJpgAction: (action: JpgAction, pages: number[]) => void;
  preparePdf: () => void;
  prepareJpg: (pages: readonly number[]) => void;
  onPdfAction: (action: PdfAction) => void;
}

const DEFAULT_PREFERENCES = { pdf: true, jpg: false, virtualLink: true };

export const PublishModal: React.FC<PublishModalProps> = ({
  open,
  publishingLink = false,
  preferenceKey,
  hasPendingChanges = false,
  hasPublication = false,
  publicUrl,
  publicationMenuSlug,
  busyActions,
  buttonResults,
  feedback,
  pageCount,
  selectedPages,
  error,
  preparePdf,
  prepareJpg,
  onJpgAction,
  onClose,
  onConfirm,
  onLinkAction,
  onPdfAction,
  onSaveMenuSlug,
}) => {
  const [preferences, setPreferences] = React.useState(() => loadUserPreferences(preferenceKey, DEFAULT_PREFERENCES));
  const [pageChoice, setPageChoice] = React.useState<ImagePages | null>(null);
  const [pdfOptionsOpened, setPdfOptionsOpened] = React.useState(false);
  const [pagesOpen, setPagesOpen] = React.useState(false);
  const { pdf, jpg, virtualLink } = preferences;
  const locked = isPublishLocked(publishingLink, busyActions);
  const hasSelection = selectedPages.some(index => index >= 0 && index < pageCount);
  const imagePages = React.useMemo<ImagePages>(() => pageChoice && (pageChoice.mode !== 'selection' || hasSelection)
    ? pageChoice : { mode: hasSelection ? 'selection' : 'all' }, [pageChoice, hasSelection]);
  const indexes = React.useMemo(() => resolveImagePages(imagePages, pageCount, selectedPages), [imagePages, pageCount, selectedPages]);

  React.useEffect(() => {
    if (!open) return;
    setPreferences(loadUserPreferences(preferenceKey, DEFAULT_PREFERENCES));
    setPageChoice(null);
    setPagesOpen(false);
    setPdfOptionsOpened(false);
  }, [open, preferenceKey]);

  React.useEffect(() => {
    if (!open || !pdf || !pageCount || pdfOptionsOpened || locked) return;
    const timer = window.setTimeout(preparePdf, 900);
    return () => window.clearTimeout(timer);
  }, [open, pdf, pageCount, preparePdf, pdfOptionsOpened, locked]);
  React.useEffect(() => {
    if (!open || !jpg || !indexes.length || pdfOptionsOpened || locked) return;
    const timer = window.setTimeout(() => prepareJpg(indexes), 900);
    return () => window.clearTimeout(timer);
  }, [open, jpg, indexes, prepareJpg, pdfOptionsOpened, locked]);

  const updatePreferences = (next: typeof DEFAULT_PREFERENCES) => {
    setPreferences(next);
    saveUserPreferences(preferenceKey, next);
  };

  if (!open) return null;
  const canConfirm = (pdf || jpg || virtualLink) && (!jpg || indexes.length > 0);
  const pageLabel = imagePages.mode === 'all' ? (pagesOpen ? 'Todas as páginas' : 'Todas') : imagePages.mode === 'selection' ? 'Seleção'
    : indexes.length === 1 ? `Página ${indexes[0] + 1}` : `${indexes.length} páginas`;
  const confirming = (virtualLink && publishingLink) || (!pdf && !virtualLink && jpg && busyActions.has('download-jpg'));

  return (
    <div ref={lockModalScrolling} className="fixed inset-0 z-[1200] bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-3 md:p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Publicar" className="w-full max-w-lg max-h-[calc(100dvh-1.5rem)] rounded-3xl bg-white shadow-2xl border border-white/70 overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Send size={18} className="text-indigo-600" /> Publicar</h2>
          </div>
          <button onClick={onClose} aria-label="Fechar publicação" className="p-2 rounded-xl text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <fieldset disabled={locked} className="min-h-0 min-w-0 overflow-y-auto p-5 space-y-4 custom-scrollbar disabled:pointer-events-none disabled:grayscale disabled:opacity-50">
          {hasPendingChanges && (
            <div className="rounded-2xl border border-red-300 bg-red-50 p-3.5 text-red-800 flex items-start gap-3">
              <AlertCircle size={19} className="mt-0.5 shrink-0" />
              <div><p className="text-sm font-bold">Link desatualizado</p><p className="mt-0.5 text-xs leading-relaxed">Publique novamente para mostrar as alterações no cardápio virtual.</p></div>
            </div>
          )}

          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs font-medium text-red-700">{error}</p>}

          {feedback && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm font-bold text-emerald-700 flex items-center gap-2"><Check size={16} /> {feedback}</div>
          )}

          <div className="space-y-2">
            <Choice checked={pdf} onChange={(checked) => updatePreferences({ ...preferences, pdf: checked })} icon={<FileText size={20} />} title="Gerar PDF"  />
            {pdf && (
              <div className="grid grid-cols-3 gap-2 pl-1" role="group" aria-label="Ações de PDF">
                <ActionButton icon={<Settings2 size={15} />} label="Opções" onClick={() => { setPdfOptionsOpened(true); onPdfAction('options'); }} />
                <ActionButton icon={<Download size={15} />} label="Baixar" loading={busyActions.has('download-pdf')} result={buttonResults?.['download-pdf']} primary onClick={() => onPdfAction('download')} />
                <ActionButton icon={<Share2 size={15} />} label="Compartilhar" loading={busyActions.has('share-pdf')} result={buttonResults?.['share-pdf']} onClick={() => onPdfAction('share')} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Choice checked={jpg} onChange={checked => updatePreferences({ ...preferences, jpg: checked })}
              icon={<ImageIcon size={20} />} title="Gerar JPG"  />
            {jpg && <>
              <div className="grid grid-cols-3 gap-2 pl-1" role="group" aria-label="Ações de JPG">
                <ActionButton icon={<DisclosureChevron open={pagesOpen} size={15} />} label={pageLabel} expanded={pagesOpen}
                  disabled={!pageCount} onClick={() => setPagesOpen(open => !open)} />
                <ActionButton icon={<Download size={15} />} label="Baixar" primary result={buttonResults?.['download-jpg']}
                  loading={busyActions.has('download-jpg')} disabled={!indexes.length}
                  onClick={() => onJpgAction('download', indexes)} />
                <ActionButton icon={<Share2 size={15} />} label="Compartilhar" loading={busyActions.has('share-jpg')}
                  disabled={!indexes.length} onClick={() => onJpgAction('share', indexes)} />
              </div>
              {pagesOpen && (
                <div role="group" aria-label="Páginas do JPG" className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  {([{ mode: 'all', label: 'Todas as páginas' }, { mode: 'selection', label: 'Seleção' }] as const).map(({ mode, label }) => (
                    <PageOption key={mode} label={label} checked={imagePages.mode === mode}
                      disabled={mode === 'selection' && !hasSelection}
                      onClick={() => { setPageChoice({ mode }); setPagesOpen(false); }} />
                  ))}
                  {Array.from({ length: pageCount }, (_, index) => (
                    <PageOption key={index} label={`Página ${index + 1}`}
                      checked={imagePages.mode === 'pages' && indexes.includes(index)}
                      onClick={() => setPageChoice(toggleImagePage(imagePages, index))} />
                  ))}
                </div>
              )}
            </>}
          </div>

          <VirtualLinkSection
            enabled={virtualLink}
            onChange={checked => updatePreferences({ ...preferences, virtualLink: checked })}
            publishingLink={publishingLink}
            hasPublication={hasPublication}
            publicUrl={publicUrl}
            publicationMenuSlug={publicationMenuSlug}
            busyActions={busyActions}
            buttonResults={buttonResults}
            onLinkAction={onLinkAction}
            onSaveMenuSlug={onSaveMenuSlug}
          />

          {!pdf && !jpg && !virtualLink && <p className="text-xs text-red-600">Selecione pelo menos uma opção.</p>}
        </fieldset>

        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex justify-between gap-2 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600">Fechar</button>
          <button onClick={() => onConfirm({ pdf, jpgPages: jpg ? indexes : null, virtualLink })} disabled={!canConfirm || locked} aria-busy={confirming || undefined} data-unavailable={!canConfirm || undefined} className="relative px-7 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:grayscale disabled:opacity-50 flex items-center gap-2">
            {confirming && <Loader2 size={15} className="absolute left-2 animate-spin" />} Publicar
          </button>
        </div>
      </div>
    </div>
  );
};

function PageOption({ label, checked, disabled, onClick }: {
  label: string; checked: boolean; disabled?: boolean; onClick: () => void;
}) {
  return <button type="button" aria-pressed={checked} disabled={disabled} onClick={onClick}
    className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left text-xs font-semibold disabled:opacity-40 ${checked
      ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'}`}>
    {label}
    {checked && <Check size={15} aria-hidden="true" />}
  </button>;
}
