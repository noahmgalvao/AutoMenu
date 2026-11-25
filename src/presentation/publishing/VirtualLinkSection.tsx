import { useEffect, useId, useState, type ReactNode } from 'react';
import { ArrowUpRight, Check, Copy, Download, Loader2, QrCode, RefreshCw, Share2 } from 'lucide-react';
import { createQrCodeBlob } from '../../infrastructure/browser/shareFiles';
import type { MenuPublishing } from './useMenuPublishing';
import type { ButtonResult } from './useButtonFeedback';

export const actionClasses = 'min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600 active:scale-[.97] transition-[background-color,transform] disabled:opacity-45 [-webkit-tap-highlight-color:transparent]';

export function ActionButton({ icon, label, loading, disabled, primary, result, expanded, onClick }: {
  icon?: ReactNode;
  label: string;
  loading?: boolean;
  disabled?: boolean;
  primary?: boolean;
  result?: ButtonResult;
  expanded?: boolean;
  onClick?: () => void;
}) {
  return <button type="button" onClick={onClick} disabled={disabled || loading} aria-busy={loading || undefined}
    aria-expanded={expanded} title={label}
    className={`${actionClasses} inline-flex items-center justify-center gap-1.5 ${result && !loading
      ? '!border-emerald-200 !bg-emerald-50 !text-emerald-800'
      : primary ? '!border-indigo-600 !bg-indigo-600 !text-white hover:!bg-indigo-700' : ''}`}>
    {loading ? <Loader2 size={15} aria-hidden="true" className="shrink-0 animate-spin" />
      : result ? <Check size={15} aria-hidden="true" className="shrink-0" /> : icon}
    <span aria-live="polite">{!loading && result ? result : label}</span>
  </button>;
}

const availabilityLabel = {
  checking: 'Verificando disponibilidade',
  online: 'Online',
  offline: 'Indisponível',
  unknown: 'Disponibilidade não verificada',
};

const statusClasses = {
  neutral: 'border-slate-200 bg-slate-50 text-slate-600',
  pending: 'border-amber-200 bg-amber-50 text-amber-900',
  synced: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  failed: 'border-red-200 bg-red-50 text-red-900',
};

function PublicationStatus({ publishing, action }: { publishing: MenuPublishing; action?: ReactNode }) {
  const { pending, publication, availability, isPublishing, tone, publicationError } = publishing;
  const availabilityText = availability ? availabilityLabel[availability] : 'Não publicado';
  let syncText = '';
  if (isPublishing) syncText = 'Sincronizando…';
  else if (publicationError) syncText = 'Falha na publicação';
  else if (publication) {
    if (pending) syncText = 'Alterações pendentes';
    else if (availability === 'online') syncText = 'Atualizado';
    else if (availability !== 'checking') syncText = 'Sem alterações pendentes';
  }

  return <div className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${statusClasses[tone]}`}>
    <div className="min-w-0 text-xs leading-5" role="status">
      <div className="flex items-center gap-2 font-semibold"><span className="size-1.5 shrink-0 rounded-full bg-current" />{availabilityText}</div>
      {syncText && <div className="pl-3.5 opacity-85">{syncText}</div>}
    </div>
    {action}
  </div>;
}

export function VirtualLinkSection({ publishing }: { publishing: MenuPublishing }) {
  const fieldId = useId();
  const [qrOpen, setQrOpen] = useState(false);
  const [qrPreview, setQrPreview] = useState<{ link: string; image: string }>();
  const { publication, publicUrl, linkEnding, updateLinkEnding, defaultMenuSlug, isPublishing,
    availability, pending, publicationError, linkActionError, busyAction, buttonResults, handleLinkAction } = publishing;
  const canRetry = availability === 'offline' || Boolean(publicationError);
  const inlineSync = Boolean(publication && (pending || canRetry || isPublishing || publication.portableSnapshotUrl));
  const bottomPublish = !publication;
  const publish = () => void publishing.publish().catch(() => undefined);

  useEffect(() => {
    if (!qrOpen || !publicUrl) return;
    let alive = true;
    let image: string | undefined;
    void createQrCodeBlob(publicUrl).then(blob => {
      if (!alive) return;
      image = URL.createObjectURL(blob);
      setQrPreview({ link: publicUrl, image });
    }).catch(() => undefined);
    return () => { alive = false; if (image) URL.revokeObjectURL(image); };
  }, [qrOpen, publicUrl]);

  return <form className="space-y-3" onSubmit={event => {
    event.preventDefault();
    if ((inlineSync || bottomPublish) && !isPublishing) publish();
  }}>
    <PublicationStatus publishing={publishing} action={inlineSync && <ActionButton label="Sincronizar"
      icon={<RefreshCw size={15} />} loading={isPublishing} primary onClick={publish} />} />
    <div>
      <label htmlFor={fieldId} className="mb-1 block text-xs font-semibold text-slate-700">Final do link</label>
      <input id={fieldId} value={linkEnding} placeholder={defaultMenuSlug} onChange={event => updateLinkEnding(event.target.value)}
        autoCapitalize="none" spellCheck={false} autoComplete="off"
        className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base outline-indigo-600 sm:text-sm" />
    </div>
    <div className="grid grid-cols-4 gap-1.5 [&>*]:flex-col [&>*]:gap-0.5 [&>*]:px-0.5 [&>*]:py-2 [&>*]:text-[10px] sm:[&>*]:flex-row sm:[&>*]:gap-1.5 sm:[&>*]:text-xs">
      {publicUrl ? <a href={publicUrl} target="_blank" rel="noopener noreferrer" className={`${actionClasses} flex items-center justify-center`}>
        <ArrowUpRight size={16} />Acessar</a> : <ActionButton icon={<ArrowUpRight size={16} />} label="Acessar" disabled />}
      <ActionButton icon={<Copy size={15} />} label="Copiar" disabled={!publicUrl || !!busyAction}
        result={buttonResults['copy-link']} loading={busyAction === 'copy-link'} onClick={() => void handleLinkAction('copy-link')} />
      <ActionButton icon={<Share2 size={15} />} label="Compartilhar" disabled={!publicUrl || !!busyAction}
        result={buttonResults['share-link']} loading={busyAction === 'share-link'} onClick={() => void handleLinkAction('share-link')} />
      <ActionButton icon={<QrCode size={15} />} label="QR Code" disabled={!publicUrl} expanded={qrOpen}
        onClick={() => { if (qrOpen) setQrPreview(undefined); setQrOpen(!qrOpen); }} />
    </div>
    {qrOpen && publicUrl && <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5" aria-label="QR Code do cardápio">
      {qrPreview?.link === publicUrl && <img src={qrPreview.image} alt="QR Code do cardápio"
        className="mx-auto size-36 rounded-xl bg-white ring-1 ring-slate-200 [image-rendering:pixelated]" />}
      <div className="grid grid-cols-3 gap-1.5">
        <ActionButton icon={<Copy size={15} />} label="Copiar QR" disabled={!!busyAction}
          result={buttonResults['copy-qr']} loading={busyAction === 'copy-qr'} onClick={() => void handleLinkAction('copy-qr')} />
        <ActionButton icon={<Download size={15} />} label="Baixar QR" disabled={!!busyAction}
          result={buttonResults['download-qr']} loading={busyAction === 'download-qr'} onClick={() => void handleLinkAction('download-qr')} />
        <ActionButton icon={<Share2 size={15} />} label="Compartilhar QR" disabled={!!busyAction}
          result={buttonResults['share-qr']} loading={busyAction === 'share-qr'} onClick={() => void handleLinkAction('share-qr')} />
      </div>
    </div>}
    {(publicationError || linkActionError) && <p role="alert" className="text-xs font-semibold text-red-700">{publicationError || linkActionError}</p>}
    {bottomPublish && <div className="grid">
      <ActionButton label="Publicar link" primary loading={isPublishing} onClick={publish} />
    </div>}
    {(inlineSync || bottomPublish) && <button className="sr-only" type="submit" tabIndex={-1} aria-hidden="true">Confirmar endereço</button>}
  </form>;
}
