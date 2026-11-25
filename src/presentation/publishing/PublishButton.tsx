import type { MouseEventHandler, Ref } from 'react';
import { Loader2, Send } from 'lucide-react';
import type { PublicationTone } from './useMenuPublishing';

export const publicationColors = {
  neutral: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
  pending: 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100',
  synced: 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
  failed: 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100',
};

export interface PublishButtonProps {
  onClick: MouseEventHandler<HTMLButtonElement>;
  tone: PublicationTone;
  busy: boolean;
}

export function PublishButton({ onClick, tone, busy, header, buttonRef }: PublishButtonProps & {
  header?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  return <button type="button" ref={buttonRef} onClick={onClick}
    onPointerDown={event => event.stopPropagation()}
    aria-label="Publicar" title="Publicar" aria-haspopup="dialog" aria-busy={busy || undefined}
    className={`pointer-events-auto inline-flex touch-manipulation items-center justify-center gap-1.5 rounded-xl border font-bold transition-[background-color,transform] active:scale-[.97] [-webkit-tap-highlight-color:transparent] ${header
      ? 'h-10 px-3 text-sm sm:px-4' : 'h-8 px-2.5 text-xs'} ${publicationColors[tone]}`}>
    {busy ? <Loader2 size={header ? 16 : 14} className="animate-spin" /> : <Send size={header ? 16 : 14} />}
    <span className={header ? 'hidden sm:inline' : undefined}>Publicar</span>
  </button>;
}
