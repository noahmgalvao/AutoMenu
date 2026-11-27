import type { ReactNode } from 'react';
import { Check, X } from 'lucide-react';

export function MenuTip({ title, children, apply, dismiss, applyLabel, dismissLabel, disabled, onHover, prominent, choices }: {
  choices?: {label:string;apply:()=>void;disabled?:boolean}[];
  title: string;
  prominent?: boolean;
  children: ReactNode;
  apply: () => void;
  dismiss: () => void;
  applyLabel: string;
  dismissLabel?: string;
  disabled?: boolean;
  onHover?: (hovered: boolean) => void;
}) {
  return <section className="space-y-1.5" onMouseEnter={() => onHover?.(true)} onMouseLeave={() => onHover?.(false)}>
    <h3 className={prominent ? "text-sm font-bold text-indigo-900" : "text-[10px] font-bold uppercase tracking-wide text-slate-500"}>{title}</h3>
    <div className="flex items-start gap-2.5 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3">
      <div className="min-w-0 flex-1 space-y-2 text-xs leading-relaxed text-slate-700">{children}{choices && <div className="flex flex-wrap gap-2 pt-1">{choices.map((choice,index)=><button type="button" key={choice.label} disabled={choice.disabled} onClick={choice.apply} className={`min-h-9 rounded-lg px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${index===0?'bg-indigo-600 text-white hover:bg-indigo-700':'border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50'}`}>{choice.label}</button>)}</div>}</div>
      <div className="flex shrink-0 gap-1">
        {!choices && <button type="button" onClick={apply} disabled={disabled} aria-label={applyLabel} title={applyLabel}
          className="grid size-8 place-items-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:opacity-40">
          <Check size={16} />
        </button>}
        <button type="button" onClick={dismiss} aria-label={dismissLabel || 'Descartar dica'} title={dismissLabel || 'Descartar dica'}
          className="grid size-8 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100">
          <X size={16} />
        </button>
      </div>
    </div>
  </section>;
}
