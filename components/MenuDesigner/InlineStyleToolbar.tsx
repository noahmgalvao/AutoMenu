import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlignCenter, AlignLeft, AlignRight, Bold, ChevronDown, Italic, Minus, Plus, Underline } from 'lucide-react';
import { ElementStyle } from '../../types';
import { FontSelect } from './SearchableSelects';
import { FontSizeInput } from './FontSizeInput';
import type { PriceAdjustmentMode } from '../../utils/pricePropagation';

interface InlineStyleToolbarProps {
    targetElementId: string;
    value: ElementStyle;
    onChange: (style: ElementStyle) => void | boolean;
    onDismiss: () => void;
    controls?: 'all' | 'sizeColor';
    maxFontSize?: number;
    minFontSize?: number;
    header?: React.ReactNode;
    compact?: boolean;
    onAdjustPrice?: (direction: 1 | -1, amount: number, mode: PriceAdjustmentMode) => void;
}

export const InlineStyleToolbar: React.FC<InlineStyleToolbarProps> = ({ targetElementId, value, onChange, onDismiss, controls = 'all', maxFontSize, minFontSize, header, compact = false, onAdjustPrice }) => {
    const toolbarRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ left: 8, top: 8, width: 270 });
    const [priceAdjustment, setPriceAdjustment] = useState('10');
    const [priceAdjustmentMode, setPriceAdjustmentMode] = useState<PriceAdjustmentMode>('percentage');
    const isSizeColorOnly = controls === 'sizeColor';
    const hasHeader = Boolean(header);
    const hasPriceAdjustment = Boolean(onAdjustPrice);

    useEffect(() => {
        setPriceAdjustment('10');
        setPriceAdjustmentMode('percentage');
    }, [targetElementId]);

    useEffect(() => {
        const dismissOnOutsidePointer = (event: PointerEvent) => {
            if (!toolbarRef.current?.contains(event.target as Node)) onDismiss();
        };
        const dismissOnPdf = () => onDismiss();

        document.addEventListener('pointerdown', dismissOnOutsidePointer, true);
        document.addEventListener('automenu:close-inline-formatting', dismissOnPdf);
        return () => {
            document.removeEventListener('pointerdown', dismissOnOutsidePointer, true);
            document.removeEventListener('automenu:close-inline-formatting', dismissOnPdf);
        };
    }, [onDismiss]);

    useLayoutEffect(() => {
        const target = document.getElementById(targetElementId);
        if (!target) return;

        const updatePosition = () => {
            const targetRect = target.getBoundingClientRect();
            const toolbarHeight = toolbarRef.current?.getBoundingClientRect().height || 76;
            const preferredWidth = hasHeader ? (compact ? 148 : 210) : isSizeColorOnly ? 120 : hasPriceAdjustment ? 300 : 270;
            const minimumWidth = hasHeader ? (compact ? 144 : 190) : isSizeColorOnly ? 120 : 210;
            const width = Math.min(preferredWidth, Math.max(minimumWidth, window.innerWidth - 16));
            const left = Math.max(8, Math.min(window.innerWidth - width - 8, targetRect.left + (targetRect.width / 2) - (width / 2)));
            const top = targetRect.top - toolbarHeight - 8 >= 8
                ? targetRect.top - toolbarHeight - 8
                : Math.min(window.innerHeight - toolbarHeight - 8, targetRect.bottom + 8);
            setPosition({ left, top: Math.max(8, top), width });
        };

        updatePosition();
        const resizeObserver = new ResizeObserver(updatePosition);
        resizeObserver.observe(target);
        if (toolbarRef.current) resizeObserver.observe(toolbarRef.current);
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [compact, hasHeader, hasPriceAdjustment, isSizeColorOnly, targetElementId]);

    const parsedPriceAdjustment = Number(priceAdjustment);
    const canAdjustPrice = Number.isFinite(parsedPriceAdjustment) && parsedPriceAdjustment > 0;

    return createPortal(
        <div
            ref={toolbarRef}
            data-drag-ignore="true"
            data-inline-format-toolbar="true"
            className={`fixed z-[10020] rounded-lg border border-slate-200 bg-white shadow-xl ${compact ? 'p-1' : 'p-1.5'}`}
            style={position}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            {header && (
                <div className={`flex items-center justify-between border-b border-slate-100 ${compact ? 'mb-1 gap-1 pb-1' : 'mb-1.5 gap-2 pb-1.5'}`}>
                    {header}
                </div>
            )}
            <div className={`flex ${compact ? 'justify-center gap-1' : 'gap-1.5'}`}>
                {!isSizeColorOnly && (
                    <div className="min-w-0 flex-1">
                        <FontSelect
                            value={value.fontFamily || ''}
                            includeInherit
                            placeholder="Fonte..."
                            onChange={(font) => onChange({ ...value, fontFamily: font || undefined })}
                        />
                    </div>
                )}
                <FontSizeInput
                    value={value.fontSize}
                    max={maxFontSize}
                    min={minFontSize}
                    className={compact ? '!w-14' : undefined}
                    onChange={(fontSize) => onChange({ ...value, fontSize })}
                />
                <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded border border-slate-200">
                    <input
                        type="color"
                        className="absolute -left-4 -top-4 h-[200%] w-[200%] cursor-pointer"
                        value={value.color || '#000000'}
                        onChange={(event) => onChange({ ...value, color: event.target.value })}
                    />
                </div>
            </div>
            {!isSizeColorOnly && (
                <div className="mt-1.5 flex items-center justify-center gap-1">
                    {(['left', 'center', 'right'] as const).map((align) => (
                        <button
                            type="button"
                            key={align}
                            onClick={() => onChange({ ...value, textAlign: align })}
                            className={`rounded border p-1 ${value.textAlign === align ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500'}`}
                        >
                            {align === 'left' ? <AlignLeft size={14} /> : align === 'center' ? <AlignCenter size={14} /> : <AlignRight size={14} />}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => onChange({ ...value, fontWeight: value.fontWeight === '700' || value.fontWeight === 'bold' ? '400' : '700' })}
                        className={`rounded border p-1 ${value.fontWeight === '700' || value.fontWeight === 'bold' ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500'}`}
                        title="Negrito"
                    >
                        <Bold size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={() => onChange({ ...value, italic: !value.italic })}
                        className={`rounded border p-1 ${value.italic ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500'}`}
                        title="Itálico"
                    >
                        <Italic size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={() => onChange({ ...value, underline: !value.underline })}
                        className={`rounded border p-1 ${value.underline ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500'}`}
                        title="Sublinhado"
                    >
                        <Underline size={14} />
                    </button>
                </div>
            )}
            {onAdjustPrice && (
                <div className="mt-2 border-t border-slate-100 pt-2">
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Alterar valor</div>
                    <div className="grid grid-cols-[2rem_minmax(0,1fr)_4.5rem_2rem] items-center gap-1">
                        <button
                            type="button"
                            disabled={!canAdjustPrice}
                            onClick={() => onAdjustPrice(-1, parsedPriceAdjustment, priceAdjustmentMode)}
                            className="flex h-8 items-center justify-center rounded-lg border border-slate-200 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                            title="Diminuir preço"
                        >
                            <Minus size={15} />
                        </button>
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
                                <option value="integer">R$</option>
                            </select>
                            <ChevronDown size={11} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        </label>
                        <button
                            type="button"
                            disabled={!canAdjustPrice}
                            onClick={() => onAdjustPrice(1, parsedPriceAdjustment, priceAdjustmentMode)}
                            className="flex h-8 items-center justify-center rounded-lg border border-slate-200 text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                            title="Aumentar preço"
                        >
                            <Plus size={15} />
                        </button>
                    </div>
                </div>
            )}
        </div>,
        document.body
    );
};
