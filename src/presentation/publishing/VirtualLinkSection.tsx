import React from 'react';
import { Check, Copy, Download, Globe2, Loader2, QrCode, Share2 } from 'lucide-react';
import { normalizePublicationSlug } from '../../domain/publishing/publicationSlug';
import { BooleanSwitch } from '../common/BooleanSwitch';
import type { PublishAction } from './useMenuPublishing';
import type { ButtonResult } from './useButtonFeedback';

export type LinkAction = 'copy-link' | 'share-link' | 'download-qr' | 'share-qr';

export interface VirtualLinkControls {
  publishingLink?: boolean;
  linkPrefix: string;
  defaultMenuSlug: string;
  publicUrl?: string | null;
  publicationMenuSlug?: string | null;
  busyActions: ReadonlySet<PublishAction>;
  error?: string | null;
  buttonResults?: Partial<Record<string, ButtonResult>>;
  onLinkAction: (action: LinkAction) => void;
  onPublishLink: (menuSlug: string) => void;
}

export const Choice: React.FC<{
  checked: boolean;
  icon: React.ReactNode;
  title: string;
  description?: string;
  onChange: (checked: boolean) => void;
}> = ({ checked, icon, title, description, onChange }) => (
  <BooleanSwitch label={title} value={checked} onChange={onChange} description={description} icon={icon}
    className={checked ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'} />
);

export const ActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  loading?: boolean;
  disabled?: boolean;
  primary?: boolean;
  result?: ButtonResult;
  expanded?: boolean;
  onClick: () => void;
}> = ({ icon, label, loading, disabled, primary, result, expanded, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    aria-expanded={expanded}
    title={label}
    className={`h-9 min-w-0 rounded-lg px-1 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors ${disabled && !loading ? 'opacity-50' : ''} ${
      result && !loading ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
        : primary ? 'bg-indigo-600 text-white hover:bg-indigo-700'
          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
    }`}
  >
    <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center">
      {loading ? <Loader2 size={15} className="animate-spin" /> : result ? <Check size={15} /> : icon}
    </span>
    <span aria-live="polite" className="min-w-0 truncate">{!loading && result ? result : label}</span>
  </button>
);

export function VirtualLinkSection({
  enabled, onChange, publishingLink, linkPrefix, defaultMenuSlug, publicUrl, publicationMenuSlug,
  busyActions, buttonResults, error, onLinkAction, onPublishLink,
}: VirtualLinkControls & { enabled: boolean; onChange: (enabled: boolean) => void }) {
  const currentSlug = publicationMenuSlug || defaultMenuSlug;
  const [draftSlug, setDraftSlug] = React.useState(currentSlug);
  const slugInputId = React.useId();
  React.useEffect(() => setDraftSlug(currentSlug), [currentSlug, linkPrefix]);
  const menuSlug = normalizePublicationSlug(draftSlug) || defaultMenuSlug;
  const address = publicUrl && menuSlug === publicationMenuSlug ? publicUrl : `${linkPrefix}${encodeURIComponent(menuSlug)}`;

  return (
  <div className="space-y-2">
    <Choice checked={enabled} onChange={onChange} icon={<Globe2 size={20} />} title="Gerar link virtual" />
    {enabled && (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide font-bold text-slate-400">Link do cardápio</div>
          <a href={address} target="_blank" rel="noopener noreferrer" title="Abrir cardápio em nova guia"
            onClick={event => { if (publishingLink) event.preventDefault(); }}
            tabIndex={publishingLink ? -1 : undefined}
            className="mt-1 block break-all text-xs text-indigo-700 hover:underline">
            <span className="block">{linkPrefix}</span><span className="font-semibold">{menuSlug}</span>
          </a>
        </div>

        <form onSubmit={event => {
          event.preventDefault();
          if (!publishingLink) onPublishLink(menuSlug);
        }}>
          <label htmlFor={slugInputId} className="text-[11px] font-bold text-slate-600">Final do link</label>
          <div className="mt-1 flex gap-2">
            <input id={slugInputId} value={draftSlug} placeholder={defaultMenuSlug}
              onChange={event => setDraftSlug(event.target.value)}
              autoCapitalize="none" spellCheck={false}
              className="min-w-0 flex-1 h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
            <button type="submit" disabled={publishingLink} aria-busy={publishingLink || undefined}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60">
              {publishingLink && <Loader2 aria-hidden="true" size={14} className="animate-spin" />} Publicar
            </button>
          </div>
        </form>
        {error && <p role="alert" className="text-xs font-semibold text-red-700">{error}</p>}

        <div className="grid grid-cols-2 gap-2">
          <ActionButton icon={<Copy size={15} />} label="Copiar" loading={busyActions.has('copy-link')} result={buttonResults?.['copy-link']} primary onClick={() => onLinkAction('copy-link')} />
          <ActionButton icon={<Share2 size={15} />} label="Compartilhar" loading={busyActions.has('share-link')} result={buttonResults?.['share-link']} onClick={() => onLinkAction('share-link')} />
        </div>

        <div className="border-t border-slate-200 pt-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-700"><QrCode size={15} /> QR code</div>
          <div className="grid grid-cols-2 gap-2">
            <ActionButton icon={<Download size={15} />} label="Baixar QR" loading={busyActions.has('download-qr')} result={buttonResults?.['download-qr']} onClick={() => onLinkAction('download-qr')} />
            <ActionButton icon={<Share2 size={15} />} label="Compartilhar QR" loading={busyActions.has('share-qr')} result={buttonResults?.['share-qr']} onClick={() => onLinkAction('share-qr')} />
          </div>
        </div>
      </div>
    )}
  </div>
  );
}
