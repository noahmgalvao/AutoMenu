import { ExportPagePicker } from './ExportPagePicker';
import React from 'react';
import {
  AlertCircle,
  Image as ImageIcon,
  Download,
  FileText,
  Send,
  Settings2,
  Share2,
  X,
} from 'lucide-react';
import { resolveImagePages, type ImagePages } from '../../domain/publishing/imagePages';
import { lockModalScrolling } from '../common/modalScroll';
import { isPublishLocked, type JpgAction } from './useMenuPublishing';
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
  onJpgAction: (action: JpgAction, pages: number[]) => void;
  preparePdf: () => void;
  preparePublication: () => void;
  prepareJpg: (pages: readonly number[]) => void;
  onPdfAction: (action: PdfAction) => void;
}

const DEFAULT_PREFERENCES = { pdf: true, jpg: false, virtualLink: true };

export const PublishModal: React.FC<PublishModalProps> = ({
  open,
  publishingLink = false,
  preferenceKey,
  hasPendingChanges = false,
  linkPrefix,
  defaultMenuSlug,
  publicUrl,
  publicationMenuSlug,
  busyActions,
  buttonResults,
  pageCount,
  selectedPages,
  error,
  preparePdf,
  preparePublication,
  prepareJpg,
  onJpgAction,
  onClose,
  onLinkAction,
  onPdfAction,
  onPublishLink,
}) => {
  const [preferences, setPreferences] = React.useState(() => loadUserPreferences(preferenceKey, DEFAULT_PREFERENCES));
  const [pageChoice, setPageChoice] = React.useState<ImagePages | null>(null);
  const [pdfOptionsOpened, setPdfOptionsOpened] = React.useState(false);
  const { pdf, jpg, virtualLink } = preferences;
  const locked = isPublishLocked(publishingLink, busyActions);
  const hasSelection = selectedPages.some(index => index >= 0 && index < pageCount);
  const imagePages = React.useMemo<ImagePages>(() => pageChoice && (pageChoice.mode !== 'selection' || hasSelection)
    ? pageChoice : { mode: 'all' }, [pageChoice, hasSelection]);
  const indexes = React.useMemo(() => resolveImagePages(imagePages, pageCount, selectedPages), [imagePages, pageCount, selectedPages]);

  React.useEffect(() => {
    if (!open) return;
    setPreferences(loadUserPreferences(preferenceKey, DEFAULT_PREFERENCES));
    setPageChoice(null);
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

  React.useEffect(() => {
    if (!open || !virtualLink || !pageCount || pdfOptionsOpened || locked) return;
    const timer = window.setTimeout(preparePublication, 650);
    return () => window.clearTimeout(timer);
  }, [open, virtualLink, pageCount, preparePublication, pdfOptionsOpened, locked]);

  const updatePreferences = (next: typeof DEFAULT_PREFERENCES) => {
    setPreferences(next);
    saveUserPreferences(preferenceKey, next);
  };

  if (!open) return null;
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
                <ExportPagePicker format="JPG" choice={imagePages} pageCount={pageCount} selectedPages={selectedPages}
                  onChange={setPageChoice} />
                <ActionButton icon={<Download size={15} />} label="Baixar" primary result={buttonResults?.['download-jpg']}
                  loading={busyActions.has('download-jpg')} disabled={!indexes.length}
                  onClick={() => onJpgAction('download', indexes)} />
                <ActionButton icon={<Share2 size={15} />} label="Compartilhar" loading={busyActions.has('share-jpg')}
                  disabled={!indexes.length} onClick={() => onJpgAction('share', indexes)} />
              </div>
            </>}
          </div>

          <VirtualLinkSection
            enabled={virtualLink}
            onChange={checked => updatePreferences({ ...preferences, virtualLink: checked })}
            publishingLink={publishingLink}
            linkPrefix={linkPrefix}
            defaultMenuSlug={defaultMenuSlug}
            publicUrl={publicUrl}
            publicationMenuSlug={publicationMenuSlug}
            busyActions={busyActions}
            buttonResults={buttonResults}
            onLinkAction={onLinkAction}
            onPublishLink={onPublishLink}
          />

          {!pdf && !jpg && !virtualLink && <p className="text-xs text-red-600">Selecione pelo menos uma opção.</p>}
        </fieldset>

        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex justify-between gap-2 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600">Fechar</button>
        </div>
      </div>
    </div>
  );
};
