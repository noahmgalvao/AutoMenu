import React from 'react';
import {
  AlertCircle,
  Check,
  Download,
  FileText,
  Loader2,
  Send,
  Settings2,
  Share2,
  X,
} from 'lucide-react';
import { loadUserPreferences, saveUserPreferences } from '../../infrastructure/browser/userPreferences';

import { ActionButton, Choice, VirtualLinkSection, type VirtualLinkControls } from './VirtualLinkSection';

type PdfAction = 'options' | 'download' | 'share';

interface PublishModalProps extends VirtualLinkControls {
  open: boolean;
  preferenceKey: string;
  hasPendingChanges?: boolean;
  onClose: () => void;
  onConfirm: (options: { pdf: boolean; virtualLink: boolean }) => void;
  onPdfAction: (action: PdfAction) => void;
}

const DEFAULT_PREFERENCES = { pdf: true, virtualLink: true };

export const PublishModal: React.FC<PublishModalProps> = ({
  open,
  loading = false,
  preferenceKey,
  hasPendingChanges = false,
  hasPublication = false,
  publicUrl,
  publicationMenuSlug,
  activeAction,
  feedback,
  onClose,
  onConfirm,
  onLinkAction,
  onPdfAction,
  onSaveMenuSlug,
}) => {
  const [pdf, setPdf] = React.useState(true);
  const [virtualLink, setVirtualLink] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;
    const preferences = loadUserPreferences(preferenceKey, DEFAULT_PREFERENCES);
    setPdf(preferences.pdf);
    setVirtualLink(preferences.virtualLink);
  }, [open, preferenceKey]);

  const updatePreferences = (preferences: { pdf: boolean; virtualLink: boolean }) => {
    setPdf(preferences.pdf);
    setVirtualLink(preferences.virtualLink);
    saveUserPreferences(preferenceKey, preferences);
  };

  if (!open) return null;
  const canConfirm = (pdf || virtualLink) && !loading;
  const actionBusy = Boolean(activeAction);

  return (
    <div className="fixed inset-0 z-[1200] bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-3 md:p-4" onMouseDown={(event) => event.target === event.currentTarget && !loading && onClose()}>
      <div className="w-full max-w-lg max-h-[calc(100vh-1.5rem)] rounded-3xl bg-white shadow-2xl border border-white/70 overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Send size={18} className="text-indigo-600" /> Publicar</h2>
            <p className="text-xs text-slate-500 mt-1">Gere o PDF ou atualize o link do cardápio.</p>
          </div>
          <button onClick={onClose} disabled={loading} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X size={18} /></button>
        </div>

        <div className="min-h-0 overflow-y-auto p-5 space-y-4 custom-scrollbar">
          {hasPendingChanges && (
            <div className="rounded-2xl border border-red-300 bg-red-50 p-3.5 text-red-800 flex items-start gap-3">
              <AlertCircle size={19} className="mt-0.5 shrink-0" />
              <div><p className="text-sm font-bold">Link desatualizado</p><p className="mt-0.5 text-xs leading-relaxed">Publique novamente para mostrar as alterações no cardápio virtual.</p></div>
            </div>
          )}

          {feedback && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm font-bold text-emerald-700 flex items-center gap-2"><Check size={16} /> {feedback}</div>
          )}

          <div className="space-y-2">
            <Choice checked={pdf} onChange={(checked) => updatePreferences({ pdf: checked, virtualLink })} icon={<FileText size={20} />} title="Gerar PDF" description="Use o mesmo arquivo do visualizador e da publicação." />
            {pdf && (
              <div className="grid grid-cols-3 gap-2 pl-1">
                <ActionButton icon={<Settings2 size={15} />} label="Opções" loading={activeAction === 'pdf-options'} disabled={loading || actionBusy} onClick={() => onPdfAction('options')} />
                <ActionButton icon={<Download size={15} />} label="Baixar" loading={activeAction === 'download-pdf'} disabled={loading || actionBusy} primary onClick={() => onPdfAction('download')} />
                <ActionButton icon={<Share2 size={15} />} label="Compartilhar" loading={activeAction === 'share-pdf'} disabled={loading || actionBusy} onClick={() => onPdfAction('share')} />
              </div>
            )}
          </div>

          <VirtualLinkSection
            enabled={virtualLink}
            onChange={checked => updatePreferences({ pdf, virtualLink: checked })}
            loading={loading}
            hasPublication={hasPublication}
            publicUrl={publicUrl}
            publicationMenuSlug={publicationMenuSlug}
            activeAction={activeAction}
            onLinkAction={onLinkAction}
            onSaveMenuSlug={onSaveMenuSlug}
          />

          {!pdf && !virtualLink && <p className="text-xs text-red-600">Selecione pelo menos uma opção.</p>}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex justify-between gap-2 shrink-0">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 disabled:opacity-50">Fechar</button>
          <button onClick={() => onConfirm({ pdf, virtualLink })} disabled={!canConfirm || actionBusy} className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {activeAction === 'publish' && <Loader2 size={15} className="animate-spin" />} Publicar
          </button>
        </div>
      </div>
    </div>
  );
};
