import React from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  Loader2,
  QrCode,
  Send,
  Settings2,
  Share2,
  X,
} from 'lucide-react';
import { loadUserPreferences, saveUserPreferences } from '../utils/userPreferences';

type LinkAction = 'copy-link' | 'share-link' | 'download-qr' | 'share-qr' | 'open-link';
type PdfAction = 'options' | 'download' | 'share';

interface PublishModalProps {
  open: boolean;
  loading?: boolean;
  preferenceKey: string;
  hasPendingChanges?: boolean;
  hasPublication?: boolean;
  publicUrl?: string | null;
  publicationMenuSlug?: string | null;
  activeAction?: string | null;
  feedback?: string | null;
  onClose: () => void;
  onConfirm: (options: { pdf: boolean; virtualLink: boolean }) => void;
  onLinkAction: (action: LinkAction) => void;
  onPdfAction: (action: PdfAction) => void;
  onSaveMenuSlug: (menuSlug: string) => void;
}

const Choice: React.FC<{
  checked: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onChange: (checked: boolean) => void;
}> = ({ checked, icon, title, description, onChange }) => (
  <label className={`flex items-start gap-3 rounded-2xl border p-4 cursor-pointer transition-colors ${checked ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 accent-indigo-600" />
    <span className={checked ? 'text-indigo-600' : 'text-slate-500'}>{icon}</span>
    <span className="min-w-0">
      <span className="block text-sm font-bold text-slate-800">{title}</span>
      <span className="block text-xs text-slate-500 mt-0.5">{description}</span>
    </span>
  </label>
);

const ActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  loading?: boolean;
  disabled?: boolean;
  primary?: boolean;
  onClick: () => void;
}> = ({ icon, label, loading, disabled, primary, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled || loading}
    className={`h-10 min-w-0 rounded-xl px-3 text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${primary ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
  >
    {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
    <span className="truncate">{label}</span>
  </button>
);

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
  const [menuSlug, setMenuSlug] = React.useState(publicationMenuSlug || '');

  React.useEffect(() => {
    if (!open) return;
    const preferences = loadUserPreferences(preferenceKey, DEFAULT_PREFERENCES);
    setPdf(preferences.pdf);
    setVirtualLink(preferences.virtualLink);
    setMenuSlug(publicationMenuSlug || '');
  }, [open, preferenceKey, publicationMenuSlug]);

  const updatePreferences = (preferences: { pdf: boolean; virtualLink: boolean }) => {
    setPdf(preferences.pdf);
    setVirtualLink(preferences.virtualLink);
    saveUserPreferences(preferenceKey, preferences);
  };

  if (!open) return null;
  const canConfirm = (pdf || virtualLink) && !loading;
  const actionBusy = Boolean(activeAction);
  const slugChanged = Boolean(publicationMenuSlug && menuSlug.trim() && menuSlug.trim() !== publicationMenuSlug);

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
              <div><p className="text-sm font-bold">Link desatualizado</p><p className="mt-0.5 text-xs leading-relaxed">As alterações ainda não estão no cardápio virtual. Publique novamente para sincronizar.</p></div>
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

          <div className="space-y-2">
            <Choice checked={virtualLink} onChange={(checked) => updatePreferences({ pdf, virtualLink: checked })} icon={<Globe2 size={20} />} title="Gerar link virtual" description="Publica o cardápio e prepara o compartilhamento e o QR code." />
            {virtualLink && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wide font-bold text-slate-400">Link do cardápio</div>
                  <div className="mt-1 truncate text-xs text-slate-600">{publicUrl || 'Será criado ao usar uma das ações abaixo.'}</div>
                </div>

                {hasPublication && publicationMenuSlug && (
                  <div>
                    <label className="text-[11px] font-bold text-slate-600">Final do link</label>
                    <div className="mt-1 flex gap-2">
                      <input value={menuSlug} onChange={(event) => setMenuSlug(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && slugChanged && onSaveMenuSlug(menuSlug)} className="min-w-0 flex-1 h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
                      <button type="button" onClick={() => onSaveMenuSlug(menuSlug)} disabled={!slugChanged || loading || actionBusy} className="h-10 px-3 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-40">{activeAction === 'save-slug' ? <Loader2 size={14} className="animate-spin" /> : 'Salvar'}</button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-[1fr_1fr_40px] gap-2">
                  <ActionButton icon={<Copy size={15} />} label="Copiar" loading={activeAction === 'copy-link'} disabled={loading || actionBusy} primary onClick={() => onLinkAction('copy-link')} />
                  <ActionButton icon={<Share2 size={15} />} label="Compartilhar" loading={activeAction === 'share-link'} disabled={loading || actionBusy} onClick={() => onLinkAction('share-link')} />
                  <button type="button" onClick={() => onLinkAction('open-link')} disabled={!hasPublication || hasPendingChanges || loading || actionBusy} className="h-10 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 flex items-center justify-center disabled:opacity-40" title="Abrir link em nova guia"><ExternalLink size={16} /></button>
                </div>

                <div className="border-t border-slate-200 pt-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-700"><QrCode size={15} /> QR code</div>
                  <div className="grid grid-cols-2 gap-2">
                    <ActionButton icon={<Download size={15} />} label="Baixar QR" loading={activeAction === 'download-qr'} disabled={loading || actionBusy} onClick={() => onLinkAction('download-qr')} />
                    <ActionButton icon={<Share2 size={15} />} label="Compartilhar QR" loading={activeAction === 'share-qr'} disabled={loading || actionBusy} onClick={() => onLinkAction('share-qr')} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {!pdf && !virtualLink && <p className="text-xs text-red-600">Selecione pelo menos uma opção.</p>}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 disabled:opacity-50">Fechar</button>
          <button onClick={() => onConfirm({ pdf, virtualLink })} disabled={!canConfirm || actionBusy} className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {activeAction === 'publish' && <Loader2 size={15} className="animate-spin" />} Publicar selecionados
          </button>
        </div>
      </div>
    </div>
  );
};
