import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MenuStyle, Product, SortOption } from '../../../domain/menu/model';
import { buildPageReductionCandidates, selectPageReduction, type MeasuredReduction, type PageReductionCandidate } from '../../../domain/menu/pageReduction';
import { MenuPreview } from '../canvas/MenuPreview';

/** Read-only, isolated measurement uses exactly the editor renderer, including its real font fitting. */
function ReductionProbe({ candidate, sortOption, complete }: { candidate: PageReductionCandidate; sortOption: SortOption; complete: (count: number) => void }) {
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
        let disposed = false, timer: ReturnType<typeof setTimeout>;
        let previous = '', stable = 0;
        const started = performance.now();
        const sample = () => {
            if (disposed || !root.current) return;
            const pages = Array.from(root.current.querySelectorAll<HTMLElement>('[data-menu-print-page]'));
            let valid = pages.length > 0;
            const signature: unknown[] = [pages.length];
            for (const page of pages) {
                const content = page.querySelector<HTMLElement>('[data-menu-content]');
                if (!content) { valid = false; continue; }
                const paper = page.getBoundingClientRect();
                const bottom = paper.bottom - parseFloat(getComputedStyle(content).paddingBottom);
                for (const chunk of page.querySelectorAll<HTMLElement>('[data-category-chunk]')) {
                    const rect = chunk.getBoundingClientRect();
                    signature.push(Math.round(rect.bottom * 10), Math.round(rect.height * 10));
                    if (rect.bottom > bottom + .5 || rect.right > paper.right + .5) valid = false;
                }
                for (const text of page.querySelectorAll<HTMLElement>('[data-word-fit], [data-price-base-size]')) {
                    signature.push(getComputedStyle(text).fontSize, text.dataset.wordOverflow, text.closest('[data-price-wrap]') !== null);
                    if (text.dataset.wordOverflow === 'true') valid = false;
                }
            }
            const next = JSON.stringify(signature);
            stable = next === previous ? stable + 1 : 0;
            previous = next;
            if (stable >= 3 && performance.now() - started >= 240) { complete(valid ? pages.length : Infinity); return; }
            // An unstable proposal is never shown as a successful fit.
            if (performance.now() - started > 2800) { complete(Infinity); return; }
            timer = setTimeout(sample, 60);
        };
        void document.fonts.ready.then(() => { if (!disposed) timer = setTimeout(sample, 60); });
        return () => { disposed = true; clearTimeout(timer); };
    }, [candidate, complete]);
    return <div ref={root} data-page-reduction-probe aria-hidden="true" inert
        style={{ position: 'fixed', left: -30000, top: 0, width: 'max-content', opacity: 0, pointerEvents: 'none' }}>
        <MenuPreview products={candidate.products} style={candidate.style} sortOption={sortOption} readOnly />
    </div>;
}

const NO_OPTIONS: MeasuredReduction[] = [];

export function usePageReduction(products: Product[], style: MenuStyle, sortOption: SortOption, pageCount: number) {
    const [probe, setProbe] = useState<{ id: number; candidate: PageReductionCandidate; complete: (count: number) => void } | null>(null);
    const [result, setResult] = useState<{ products: Product[]; style: MenuStyle; sortOption: SortOption; pageCount: number; options: MeasuredReduction[] }>();
    const sequence = useRef(0);
    useEffect(() => {
        if (pageCount <= 1) { setProbe(null); return; }
        const controller = new AbortController();
        const { signal } = controller;
        const timer = setTimeout(() => {
            const measure = (candidate: PageReductionCandidate) => new Promise<number>((resolve, reject) => {
                signal.throwIfAborted();
                const id = ++sequence.current;
                const abort = () => reject(new DOMException('Cancelled', 'AbortError'));
                signal.addEventListener('abort', abort, { once: true });
                setProbe({ id, candidate, complete: count => {
                    signal.removeEventListener('abort', abort);
                    if (!signal.aborted) resolve(count);
                } });
            });
            void (async () => {
                try {
                    const first = await selectPageReduction(buildPageReductionCandidates(products, style), pageCount, measure, signal);
                    const options = first ? [first] : [];
                    if (first && !((first.style.categoryColumnCount || 1) >= 2 && first.style.columnCount >= 2)) {
                        const second = await selectPageReduction(buildPageReductionCandidates(products, style, true), pageCount, measure, signal, first.pageCount);
                        if (second && second.pageCount === first.pageCount) options.push(second);
                    }
                    signal.throwIfAborted();
                    setResult({ products, style, sortOption, pageCount, options });
                } catch (error) {
                    if (!signal.aborted) { console.warn('Page reduction preview failed', error instanceof Error ? error.message : 'unknown'); setResult({ products, style, sortOption, pageCount, options: [] }); }
                } finally { if (!signal.aborted) setProbe(null); }
            })();
        }, 650);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [products, style, sortOption, pageCount]);
    const options = result?.products === products && result.style === style && result.sortOption === sortOption && result.pageCount === pageCount && pageCount > 1 ? result.options : NO_OPTIONS;
    const ready = result?.products === products && result.style === style && result.sortOption === sortOption && result.pageCount === pageCount;
    return { options, ready, measurement: probe && createPortal(<ReductionProbe key={probe.id} candidate={probe.candidate} sortOption={sortOption} complete={probe.complete} />, document.body) };
}
