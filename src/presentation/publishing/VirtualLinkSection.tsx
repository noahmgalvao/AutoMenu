import React from 'react';
import { Copy, Download, ExternalLink, Globe2, Loader2, QrCode, Share2 } from 'lucide-react';
import { BooleanRadio } from '../common/BooleanRadio';

export type LinkAction = 'copy-link' | 'share-link' | 'download-qr' | 'share-qr' | 'open-link';

export interface VirtualLinkControls {
  loading?: boolean;
  hasPublication?: boolean;
  publicUrl?: string | null;
  publicationMenuSlug?: string | null;
  activeAction?: string | null;
  feedback?: string | null;
  onLinkAction: (action: LinkAction) => void;
  onSaveMenuSlug: (menuSlug: string) => void;
}

export const Choice: React.FC<{
  checked: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onChange: (checked: boolean) => void;
}> = ({ checked, icon, title, description, onChange }) => (
  <BooleanRadio label={title} value={checked} onChange={onChange} description={description} icon={icon}
    className={checked ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'} />
);

export const ActionButton: React.FC<{
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
    className={`h-9 min-w-0 rounded-lg px-1 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors disabled:opacity-50 ${primary ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
  >
    {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
    <span className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">{label}</span>
  </button>
);

export function VirtualLinkSection({
  enabled, onChange, loading, hasPublication, publicUrl, publicationMenuSlug, activeAction, onLinkAction, onSaveMenuSlug,
}: VirtualLinkControls & { enabled: boolean; onChange: (enabled: boolean) => void }) {
  const [menuSlug, setMenuSlug] = React.useState(publicationMenuSlug || '');
  const slugInputId = React.useId();
  React.useEffect(() => setMenuSlug(publicationMenuSlug || ''), [publicationMenuSlug]);
  const actionBusy = Boolean(activeAction);
  const slugChanged = Boolean(publicationMenuSlug && menuSlug.trim() && menuSlug.trim() !== publicationMenuSlug);
  return (
  <div className="space-y-2">
    <Choice checked={enabled} onChange={onChange} icon={<Globe2 size={20} />} title="Gerar link virtual" description="Publica o cardápio e prepara o compartilhamento e o QR code." />
    {enabled && (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide font-bold text-slate-400">Link do cardápio</div>
          <div className="mt-1 truncate text-xs text-slate-600">{publicUrl || 'Será criado ao usar uma das ações abaixo.'}</div>
        </div>

        {hasPublication && publicationMenuSlug && (
          <div>
            <label htmlFor={slugInputId} className="text-[11px] font-bold text-slate-600">Final do link</label>
            <div className="mt-1 flex gap-2">
              <input id={slugInputId} value={menuSlug} onChange={(event) => setMenuSlug(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && slugChanged && onSaveMenuSlug(menuSlug)} className="min-w-0 flex-1 h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
              <button type="button" onClick={() => onSaveMenuSlug(menuSlug)} disabled={!slugChanged || loading || actionBusy} className="h-10 px-3 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-40">{activeAction === 'save-slug' ? <Loader2 size={14} className="animate-spin" /> : 'Salvar'}</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-[1fr_1fr_40px] gap-2">
          <ActionButton icon={<Copy size={15} />} label="Copiar" loading={activeAction === 'copy-link'} disabled={loading || actionBusy} primary onClick={() => onLinkAction('copy-link')} />
          <ActionButton icon={<Share2 size={15} />} label="Compartilhar" loading={activeAction === 'share-link'} disabled={loading || actionBusy} onClick={() => onLinkAction('share-link')} />
          <button type="button" onClick={() => onLinkAction('open-link')} disabled={!hasPublication || loading || actionBusy} className="h-10 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 flex items-center justify-center disabled:opacity-40" title="Abrir link em nova guia"><ExternalLink size={16} /></button>
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
  );
}
