import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Underline } from 'lucide-react';
import { ElementStyle } from '../../types';
import { FontSelect } from './SearchableSelects';
import { FontSizeInput } from './FontSizeInput';

interface InlineStyleToolbarProps {
    targetElementId: string;
    value: ElementStyle;
    onChange: (style: ElementStyle) => void | boolean;
    onDismiss: () => void;
    controls?: 'all' | 'sizeColor';
    maxFontSize?: number;
    minFontSize?: number;
}

export const InlineStyleToolbar: React.FC<InlineStyleToolbarProps> = ({ targetElementId, value, onChange, onDismiss, controls = 'all', maxFontSize, minFontSize }) => {
    const toolbarRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ left: 8, top: 8, width: 270 });
    const isSizeColorOnly = controls === 'sizeColor';

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
            const preferredWidth = isSizeColorOnly ? 120 : 270;
            const minimumWidth = isSizeColorOnly ? 120 : 210;
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
    }, [isSizeColorOnly, targetElementId]);

    return createPortal(
        <div
            ref={toolbarRef}
            data-drag-ignore="true"
            data-inline-format-toolbar="true"
            className="fixed z-[10020] rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl"
            style={position}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <div className="flex gap-1.5">
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
        </div>,
        document.body
    );
};
