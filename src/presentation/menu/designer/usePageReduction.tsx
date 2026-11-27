import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MenuStyle, Product, SortOption } from '../../../domain/menu/model';
import { buildPageReductionCandidates, selectPageReduction, selectPageReductionAlternative, type MeasuredReduction, type PageReductionCandidate } from '../../../domain/menu/pageReduction';
import { resolveMinimumFontSize } from '../../../domain/menu/styleRules';
import { measurePriceWidth } from '../canvas/textFit';
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
            const images = Array.from(root.current.querySelectorAll<HTMLImageElement>('img'));
            // A cached fallback aspect ratio is not the final layout. Wait for photos,
            // then for the real renderer to settle before counting pages.
            const fontsPending = Array.from(document.querySelectorAll<HTMLLinkElement>('[data-automenu-fonts]')).some(link => link.media !== 'all' && link.dataset.failed !== 'true');
            const ready = !fontsPending && document.fonts.status === 'loaded' && images.every(image => image.complete);
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
                    if (text.closest('[data-canvas-background-layer]')) continue;
                    signature.push(getComputedStyle(text).fontSize, text.dataset.wordOverflow, text.closest('[data-price-wrap]') !== null);
                    if (text.dataset.wordOverflow === 'true') valid = false;
                    if (text.hasAttribute('data-price-base-size')) {
                        const row = text.closest<HTMLElement>('[data-product-text-row]');
                        if (row && measurePriceWidth(text, resolveMinimumFontSize(candidate.style)) > row.clientWidth + .5) valid = false;
                    }
                }
            }
            const next = JSON.stringify(signature);
            stable = ready && next === previous ? stable + 1 : 0;
            previous = next;
            if (stable >= 5 && performance.now() - started >= 360) { complete(valid ? pages.length : Infinity); return; }
            // An unstable proposal is never shown as a successful fit.
            if (performance.now() - started > 10000) { complete(Infinity); return; }
            timer = setTimeout(sample, 60);
        };
        for (const image of root.current?.querySelectorAll<HTMLImageElement>('img') || []) image.loading = 'eager';
        timer = setTimeout(sample, 60);
        return () => { disposed = true; clearTimeout(timer); };
    }, [candidate, complete]);
    return <div ref={root} data-page-reduction-probe aria-hidden="true" inert
        style={{ position: 'fixed', left: -30000, top: 0, width: 'max-content', opacity: 0, pointerEvents: 'none' }}>
        <MenuPreview products={candidate.products} style={candidate.style} sortOption={sortOption} readOnly />
    </div>;
}

const NO_OPTIONS: MeasuredReduction[] = [];

export function usePageReduction(products: Product[], style: MenuStyle, sortOption: SortOption, pageCount: number) {
    // Editor renders may recreate equal objects. Only actual document changes
    // invalidate an expensive measured result, never opening or scrolling a panel.
    const sourceKey = JSON.stringify([products, style, sortOption]);
    const source = useMemo(() => ({ products, style, sortOption }), [sourceKey]);
    products = source.products; style = source.style; sortOption = source.sortOption;
    const [fontRevision, setFontRevision] = useState(0);
    useEffect(() => {
        const changed = () => setFontRevision(value => value + 1);
        document.fonts.addEventListener('loading', changed);
        document.fonts.addEventListener('loadingdone', changed);
        window.addEventListener('automenu:fonts-ready', changed);
        return () => { document.fonts.removeEventListener('loading', changed); document.fonts.removeEventListener('loadingdone', changed); window.removeEventListener('automenu:fonts-ready', changed); };
    }, []);
    const [probe, setProbe] = useState<{ id: number; candidate: PageReductionCandidate; complete: (count: number) => void } | null>(null);
    const [result, setResult] = useState<{ products: Product[]; style: MenuStyle; sortOption: SortOption; pageCount: number; fontRevision: number; options: MeasuredReduction[] }>();
    const sequence = useRef(0);
    useEffect(() => {
        if (pageCount <= 1) { setProbe(null); return; }
        const controller = new AbortController();
        const { signal } = controller;
        const timer = setTimeout(() => {
            const measure = (candidate: PageReductionCandidate): Promise<number> => {
                signal.throwIfAborted();
                return new Promise<number>((resolve, reject) => {
                    const id = ++sequence.current;
                    const abort = () => reject(new DOMException('Cancelled', 'AbortError'));
                    signal.addEventListener('abort', abort, { once: true });
                    setProbe({ id, candidate, complete: count => {
                        signal.removeEventListener('abort', abort);
                        if (!signal.aborted) resolve(count);
                    } });
                });
            };
            void (async () => {
                try {
                    const first = await selectPageReduction(buildPageReductionCandidates(products, style), pageCount, measure, signal);
                    const options = first ? [first] : [];
                    if (first) {
                        const second = await selectPageReductionAlternative(products, style, first, pageCount, measure, signal);
                        if (second) options.push(second);
                    }
                    signal.throwIfAborted();
                    setResult({ products, style, sortOption, pageCount, fontRevision, options });
                } catch (error) {
                    if (!signal.aborted) { console.warn('Page reduction preview failed', error instanceof Error ? error.message : 'unknown'); setResult({ products, style, sortOption, pageCount, fontRevision, options: [] }); }
                } finally { if (!signal.aborted) setProbe(null); }
            })();
        }, 650);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [products, style, sortOption, pageCount, fontRevision]);
    const options = result?.products === products && result.style === style && result.sortOption === sortOption && result.fontRevision === fontRevision && pageCount > 1 ? result.options : NO_OPTIONS;
    const ready = pageCount === 1 || result?.products === products && result.style === style && result.sortOption === sortOption && result.fontRevision === fontRevision;
    return { options, ready, fontRevision, measurement: probe && createPortal(<ReductionProbe key={probe.id} candidate={probe.candidate} sortOption={sortOption} complete={probe.complete} />, document.body) };
}
