import { TextOutlinePicker } from './TextOutlinePicker';
import { HoldStepButton } from '../../common/HoldStepButton';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlignCenter, AlignLeft, AlignRight, Bold, ChevronDown, Italic, Minus, Plus, Underline } from 'lucide-react';
import type { ElementStyle } from '../../../domain/menu/model';
import { FontSelect } from './SearchableSelects';
import { ColorPicker } from './ColorPicker';
import { FontSizeInput } from './FontSizeInput';
import type { PriceAdjustmentMode } from '../../../domain/menu/pricePropagation';
import { getCanvasViewportBounds, observeAnchorScroll } from '../canvas/canvasViewport';

type InlineStyleToolbarProps = {
    targetElementId: string;
    positionTargetElementId?: string;
    onDismiss: () => void;
    dismissOnClickInCanvas?: boolean;
    controls?: 'all' | 'sizeColor';
    maxFontSize?: number;
    minFontSize?: number;
    header?: React.ReactNode;
    compact?: boolean;
    onAdjustPrice?: (direction: 1 | -1, amount: number, mode: PriceAdjustmentMode) => void;
    priceFormatHeader?: React.ReactNode;
    priceAdjustmentCurrency?: string;
    priceAlignment?: boolean;
    fallbackFontFamily?: string;
    decoration?: (formatButtons: React.ReactNode, onGroupBorderPanelChange: (open: boolean) => void) => React.ReactNode;
    borderOffset?: number;
} & (
    | { value: ElementStyle; onChange: (style: ElementStyle) => void | boolean; children?: never }
    | { value?: never; onChange?: never; children: React.ReactNode }
);

export const InlineStyleToolbar: React.FC<InlineStyleToolbarProps> = ({ targetElementId, positionTargetElementId, value, onChange, onDismiss, dismissOnClickInCanvas = false, controls = 'all', maxFontSize, minFontSize, header, compact = false, onAdjustPrice, priceFormatHeader, priceAdjustmentCurrency, priceAlignment = false, fallbackFontFamily, decoration, borderOffset, children }) => {
    const toolbarRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<React.CSSProperties>({ left: 8, top: 8, width: 270 });
    const [groupBorderOpen, setGroupBorderOpen] = useState(false);
    const [priceCanAlignLeft, setPriceCanAlignLeft] = useState(!priceAlignment);
    React.useLayoutEffect(() => {
        if (!priceAlignment) { setPriceCanAlignLeft(true); return; }
        const row = document.getElementById(targetElementId)?.closest('[data-product-text-row]');
        const refresh = () => setPriceCanAlignLeft(Boolean(row?.hasAttribute('data-price-wrap')));
        refresh();
        if (!row) return;
        const observer = new MutationObserver(refresh);
        observer.observe(row, { attributes: true, attributeFilter: ['data-price-wrap'] });
        return () => observer.disconnect();
    }, [priceAlignment, targetElementId]);
    const [priceAdjustment, setPriceAdjustment] = useState('10');
    const [priceAdjustmentMode, setPriceAdjustmentMode] = useState<PriceAdjustmentMode>('percentage');
    const isSizeColorOnly = controls === 'sizeColor';
    const hasHeader = Boolean(header);
    const hasPriceAdjustment = Boolean(onAdjustPrice);
    const hasDecoration = Boolean(decoration);
    const hasTextControls = Boolean(value);

    useEffect(() => {
        setPriceAdjustment('10');
        setPriceAdjustmentMode('percentage');
    }, [targetElementId]);

    useEffect(() => {
        const dismissOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Element) || toolbarRef.current?.contains(target) || target.closest('[data-editor-popover="true"]')) return;
            if (target.closest<HTMLElement>('[data-inline-format-target]')?.dataset.inlineFormatTarget === targetElementId) return;
            const editedElement = document.getElementById(targetElementId);
            const canvas = editedElement?.closest('[data-automenu-editor-canvas]');
            if (dismissOnClickInCanvas && canvas?.contains(target)
                && !target.closest('button, input, textarea, select, [data-inline-format-toolbar]')) return;
            if (target.closest('[data-product-image-surface]') && canvas?.contains(target)) return;
            const editedProduct = editedElement?.closest('[data-drag-type="product"]');
            if (editedProduct && target.closest('[data-canvas-history-control]')) return;
            if (editedProduct instanceof HTMLElement
                && target.closest<HTMLElement>('[data-product-image-surface]')?.dataset.productImageSurface === editedProduct.dataset.dragId) return;
            const editedHeader = editedElement?.closest('[data-template-header]');
            if (editedProduct?.contains(target) || (editedHeader?.contains(target) && target.closest('[data-menu-heading]'))) return;
            if (editedElement === document.activeElement) editedElement?.blur();
            onDismiss();
        };
        const dismissOnPdf = () => onDismiss();

        document.addEventListener('pointerdown', dismissOnOutsidePointer, true);
        document.addEventListener('automenu:close-inline-formatting', dismissOnPdf);
        return () => {
            document.removeEventListener('pointerdown', dismissOnOutsidePointer, true);
            document.removeEventListener('automenu:close-inline-formatting', dismissOnPdf);
        };
    }, [dismissOnClickInCanvas, onDismiss, targetElementId]);

    useLayoutEffect(() => {
        const target = document.getElementById(positionTargetElementId || targetElementId);
        if (!target) return;
        const groupSurface = groupBorderOpen ? target.closest<HTMLElement>('[data-menu-border-surface="categoryGroup"]') : null;
        const canvas = groupSurface?.closest<HTMLElement>('[data-automenu-editor-canvas]');

        const updatePosition = () => {
            const toolbarHeight = (contentRef.current?.offsetHeight || 76) + (compact ? 10 : 14);
            const preferredWidth = !hasTextControls ? 200 : hasHeader ? (compact ? 224 : 266) : isSizeColorOnly ? 199 : hasPriceAdjustment ? 364 : 344;
            const width = Math.min(preferredWidth, window.innerWidth - 16);
            const borderSurface = groupSurface || (hasDecoration
                ? document.getElementById(targetElementId)?.closest('[data-menu-border-surface]')
                : null);
            const targetRect = (borderSurface || target).getBoundingClientRect();
            const strokes = Array.from(borderSurface?.querySelectorAll(':scope > [data-menu-border]') || [])
                .map((element) => element.getBoundingClientRect());
            let top = Math.min(targetRect.top, ...strokes.map((rect) => rect.top));
            let bottom = Math.max(targetRect.bottom, ...strokes.map((rect) => rect.bottom));
            let left = Math.min(targetRect.left, ...strokes.map((rect) => rect.left));
            let right = Math.max(targetRect.right, ...strokes.map((rect) => rect.right));
            if (canvas) {
                const visible = getCanvasViewportBounds(canvas);
                if (left < visible.right && right > visible.left && top < visible.bottom && bottom > visible.top) {
                    top = Math.max(visible.top, top);
                    bottom = Math.min(visible.bottom, bottom);
                    left = Math.max(visible.left, left);
                    right = Math.min(visible.right, right);
                }
            }
            const centeredLeft = Math.max(8, Math.min(window.innerWidth - width - 8, (left + right - width) / 2));
            const availableAbove = top - 16;
            const availableBelow = window.innerHeight - bottom - 16;

            if (borderSurface && Math.max(availableAbove, availableBelow) < toolbarHeight) {
                const sideLeft = window.innerWidth - right - 16 >= width ? right + 8 : left - width - 8;
                if (sideLeft >= 8 && sideLeft + width <= window.innerWidth - 8) {
                    setPosition({ left: sideLeft, top: Math.max(8, Math.min(top, window.innerHeight - toolbarHeight - 8)), width,
                        maxHeight: window.innerHeight - 16, overflowY: toolbarHeight > window.innerHeight - 16 ? 'auto' : undefined });
                    return;
                }
                const useTop = availableAbove >= availableBelow;
                const available = Math.max(availableAbove, availableBelow);
                if (available >= (groupSurface ? 48 : 80)) {
                    setPosition({ left: centeredLeft, top: useTop ? 8 : bottom + 8, width, maxHeight: available, overflowY: 'auto' });
                    return;
                }
            }

            const categoryNameSelector = '[data-placeholder-field="category-name"]';
            const editedCategory = target.closest('[data-category-chunk]')
                ?.querySelector(`${categoryNameSelector}[contenteditable="true"]`);
            const nextCategory = target.matches('[data-menu-heading]')
                ? target.closest('[data-menu-print-page]')?.querySelector(categoryNameSelector) : null;
            const shapeId = target.getAttribute('data-added-image-id');
            const shapeActions = shapeId ? target.closest('[data-menu-preview-canvas]')
                ?.querySelector(`[data-open-object-menu][data-object-menu-id="${CSS.escape(shapeId)}"]`)
                ?.closest('[data-canvas-action-group]') : null;
            const obstacles = [editedCategory, nextCategory, shapeActions]
                .flatMap(element => element && element !== target ? [element.getBoundingClientRect()] : []);
            const coversObstacle = (x: number, y: number) => obstacles.some(rect =>
                x < rect.right && x + width > rect.left && y < rect.bottom && y + toolbarHeight > rect.top);
            const aboveTop = top - toolbarHeight - 8;
            const belowTop = Math.min(window.innerHeight - toolbarHeight - 8, bottom + 8);
            const above = availableAbove >= toolbarHeight && !coversObstacle(centeredLeft, aboveTop);
            if (!above && (availableBelow < toolbarHeight || coversObstacle(centeredLeft, belowTop)) && obstacles.length > 0) {
                const sideLeft = window.innerWidth - right - 16 >= width ? right + 8 : left - width - 8;
                const sideTop = Math.max(8, Math.min(top, window.innerHeight - toolbarHeight - 8));
                if (sideLeft >= 8 && sideLeft + width <= window.innerWidth - 8 && !coversObstacle(sideLeft, sideTop)) {
                    setPosition({ left: sideLeft, top: sideTop, width, maxHeight: window.innerHeight - 16 });
                    return;
                }
                if (availableAbove >= 48 && !coversObstacle(centeredLeft, aboveTop)) {
                    setPosition({ left: centeredLeft, top: 8, width, maxHeight: availableAbove, overflowY: 'auto' });
                    return;
                }
            }
            const toolbarTop = above ? aboveTop : belowTop;
            setPosition({ left: centeredLeft, top: Math.max(8, toolbarTop), width, maxHeight: window.innerHeight - 16,
                overflowY: toolbarHeight > window.innerHeight - 16 ? 'auto' : undefined });
        };

        updatePosition();
        const resizeObserver = new ResizeObserver(updatePosition);
        resizeObserver.observe(groupSurface || target);
        if (contentRef.current) resizeObserver.observe(contentRef.current);
        if (canvas) resizeObserver.observe(canvas);
        const borderObserver = groupSurface && new MutationObserver(records => {
            if (records.some(({ target }) => target === groupSurface ||
                (target instanceof Element && target.parentElement === groupSurface && target.hasAttribute('data-menu-border')))) {
                updatePosition();
            }
        });
        if (groupSurface) borderObserver?.observe(groupSurface, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
        window.addEventListener('resize', updatePosition);
        const stopObservingScroll = observeAnchorScroll(target, updatePosition);

        return () => {
            resizeObserver.disconnect();
            borderObserver?.disconnect();
            window.removeEventListener('resize', updatePosition);
            stopObservingScroll();
        };
    }, [borderOffset, compact, groupBorderOpen, hasDecoration, hasHeader, hasPriceAdjustment, hasTextControls, isSizeColorOnly, positionTargetElementId, targetElementId]);

    const parsedPriceAdjustment = Number(priceAdjustment);
    const canAdjustPrice = Number.isFinite(parsedPriceAdjustment) && parsedPriceAdjustment > 0;

    return createPortal(
        <div
            ref={toolbarRef}
            data-drag-ignore="true"
            data-inline-format-toolbar="true"
            data-no-browser-selection
            className={`fixed z-[10020] rounded-lg border border-slate-200 bg-white shadow-xl ${compact ? 'p-1' : 'p-1.5'}`}
            style={position}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
        >
          <div ref={contentRef}>
            {header && (
                <div className={`flex items-center justify-between border-b border-slate-100 ${compact ? 'mb-1 gap-1 pb-1' : 'mb-1.5 gap-2 pb-1.5'}`}>
                    {header}
                </div>
            )}
            {children}
            {value && onChange && <div className={`flex ${compact ? 'justify-center gap-1' : 'gap-1.5'}`}>
                {!isSizeColorOnly && (
                    <div className="min-w-0 flex-1">
                        <FontSelect
                            value={value.fontFamily || fallbackFontFamily}
                            fallbackFontFamily={fallbackFontFamily}
                            placeholder="Fonte..."
                            menuGap={36}
                            onChange={(font) => onChange({ ...value, fontFamily: font })}
                        />
                    </div>
                )}
                <FontSizeInput showStepButtons
                    value={value.fontSize}
                    max={maxFontSize}
                    min={minFontSize}
                    className={compact ? '!w-14' : undefined}
                    onChange={(fontSize) => onChange({ ...value, fontSize })}
                />
                <ColorPicker value={value.color} onChange={color => onChange({ ...value, color })} />
                <TextOutlinePicker value={value.textOutline} onChange={textOutline => onChange({ ...value, textOutline })} />
            </div>}
            {value && onChange && !isSizeColorOnly && (() => {
                const formatButtons = <>
                    {(['left', 'center', 'right'] as const).map((align) => (
                        <button
                            type="button"
                            key={align}
                            aria-label={align === 'left' ? 'Alinhar à esquerda' : align === 'center' ? 'Centralizar texto' : 'Alinhar à direita'}
                            aria-pressed={value.textAlign === align}
                            disabled={priceAlignment && align === 'left' && !priceCanAlignLeft}
                            onClick={() => onChange({ ...value, textAlign: align })}
                            className={`rounded border p-1 disabled:opacity-40 ${value.textAlign === align ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500'}`}
                        >
                            {align === 'left' ? <AlignLeft size={14} /> : align === 'center' ? <AlignCenter size={14} /> : <AlignRight size={14} />}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => onChange({ ...value, fontWeight: value.fontWeight === '700' || value.fontWeight === 'bold' ? '400' : '700' })}
                        className={`rounded border p-1 ${value.fontWeight === '700' || value.fontWeight === 'bold' ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500'}`}
                        title="Negrito" aria-label="Negrito" aria-pressed={value.fontWeight === '700' || value.fontWeight === 'bold'}
                    >
                        <Bold size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={() => onChange({ ...value, italic: !value.italic })}
                        className={`rounded border p-1 ${value.italic ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500'}`}
                        title="Itálico" aria-label="Itálico" aria-pressed={Boolean(value.italic)}
                    >
                        <Italic size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={() => onChange({ ...value, underline: !value.underline })}
                        className={`rounded border p-1 ${value.underline ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500'}`}
                        title="Sublinhado" aria-label="Sublinhado" aria-pressed={Boolean(value.underline)}
                    >
                        <Underline size={14} />
                    </button>
                </>;
                return <div className="mt-1.5">{decoration
                    ? decoration(formatButtons, setGroupBorderOpen)
                    : <div className="flex items-center justify-center gap-1">{formatButtons}</div>}
                </div>;
            })()}
            {onAdjustPrice && (
                <div className="mt-1 border-t border-slate-100 pt-1">
                    <div className="mb-0.5 text-[10px] font-semibold text-slate-600">{priceFormatHeader || 'Alterar valor'}</div>
                    <div className="grid grid-cols-[2rem_minmax(0,1fr)_4.5rem_2rem] items-center gap-1">
                        <HoldStepButton label="Diminuir preço" disabled={!canAdjustPrice}
                            onStep={() => onAdjustPrice(-1, parsedPriceAdjustment, priceAdjustmentMode)}
                            className="flex h-8 items-center justify-center rounded-lg border border-slate-200 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed">
                            <Minus size={15} />
                        </HoldStepButton>
                        <input
                            type="number"
                            min="0"
                            step={priceAdjustmentMode === 'percentage' ? '0.1' : '1'}
                            value={priceAdjustment}
                            onChange={(event) => setPriceAdjustment(event.target.value)}
                            onFocus={(event) => event.currentTarget.select()}
                            className="h-8 min-w-0 rounded-lg border border-slate-200 px-2 text-center text-sm font-semibold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                            aria-label="Valor do reajuste"
                        />
                        <label className="relative block">
                            <select
                                value={priceAdjustmentMode}
                                onChange={(event) => setPriceAdjustmentMode(event.target.value as PriceAdjustmentMode)}
                                className="h-8 w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-2 pr-5 text-xs font-medium text-slate-600 outline-none focus:border-indigo-400"
                                aria-label="Tipo do reajuste"
                            >
                                <option value="percentage">%</option>
                                <option value="integer">{priceAdjustmentCurrency || 'Valor'}</option>
                            </select>
                            <ChevronDown size={11} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        </label>
                        <HoldStepButton label="Aumentar preço" disabled={!canAdjustPrice}
                            onStep={() => onAdjustPrice(1, parsedPriceAdjustment, priceAdjustmentMode)}
                            className="flex h-8 items-center justify-center rounded-lg border border-slate-200 text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed">
                            <Plus size={15} />
                        </HoldStepButton>
                    </div>
                </div>
            )}
          </div>
        </div>,
        document.body
    );
};
