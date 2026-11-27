import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { MeasuredReduction } from '../../../domain/menu/pageReduction';
import type { SortOption } from '../../../domain/menu/model';
import { ReadOnlyCanvas } from '../../app/RevisionReadOnlyCanvas';
import { lockModalScrolling } from '../../common/modalScroll';

export function PageReductionPreview({ options, sortOption, apply, cancel }: {
    options: MeasuredReduction[]; sortOption: SortOption; apply: (option: MeasuredReduction) => void; cancel: () => void;
}) {
    const [index, setIndex] = useState(0);
    const [scale, setScale] = useState(() => window.innerWidth < 768 ? .33 : .6);
    const current = options[index] || options[0];
    const dialog = useRef<HTMLElement>(null);
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        return () => { if (previous?.isConnected) previous.focus(); };
    }, []);
    return createPortal(<div data-page-reduction-dialog ref={lockModalScrolling} className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-950/60 p-2 md:p-5"
        onPointerDown={event => { if (event.target === event.currentTarget) cancel(); }}
        onKeyDown={event => {
            if (event.key === 'Escape') { event.stopPropagation(); cancel(); }
            if (event.key === 'Tab') {
                const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button, [tabindex="0"]') || []).filter(el => el.getClientRects().length && !el.hasAttribute('disabled'));
                const first = controls[0], last = controls[controls.length - 1];
                if (event.shiftKey && event.target === first) { event.preventDefault(); last?.focus(); }
                if (!event.shiftKey && event.target === last) { event.preventDefault(); first?.focus(); }
            }
        }}>
        <section ref={dialog} role="dialog" aria-modal="true" aria-label="Prévia para reduzir páginas" className="flex h-[min(90dvh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 p-3">
                <div><h2 className="text-sm font-bold text-slate-900">Caber em {current.pageCount} {current.pageCount === 1 ? 'página' : 'páginas'}</h2>
                    <p className="text-xs text-slate-500">Confira o resultado antes de aplicar.</p></div>
                <button type="button" autoFocus aria-label="Fechar prévia" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={cancel}><X size={18} /></button>
            </header>
            {options.length > 1 && <div role="tablist" aria-label="Opções de ajuste" className="flex shrink-0 gap-2 px-3 py-2">
                {options.map((option, i) => <button type="button" key={i} role="tab" aria-selected={index === i} onClick={() => setIndex(i)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${index === i ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-600'}`}>
                    Opção {i + 1}<span className="mt-0.5 block text-[11px] font-normal">{i === 0 ? 'Ajustes graduais' : 'Priorizar duas colunas'}</span>
                    <span className="sr-only">{option.pageCount} páginas</span>
                </button>)}
            </div>}
            <div className="min-h-0 flex-1" data-page-reduction-preview><ReadOnlyCanvas key={index} preview={{ products: current.products, style: current.style, sortOption }} scale={scale} setScale={setScale} /></div>
            <footer className="flex shrink-0 justify-between gap-2 border-t border-slate-100 p-3">
                <button type="button" onClick={cancel} className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-600">Cancelar</button>
                <button type="button" onClick={() => apply(current)} className="min-h-10 rounded-lg bg-indigo-600 px-4 text-xs font-bold text-white">Aplicar esta opção</button>
            </footer>
        </section>
    </div>, document.body);
}
