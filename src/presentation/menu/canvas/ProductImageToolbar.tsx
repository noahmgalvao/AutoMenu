import { observeAnchorScroll } from './canvasViewport';
import React from 'react';
import { MAX_PHOTO_SCALE, MIN_PHOTO_SCALE } from '../../../domain/menu/styleRules';
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { HoldStepButton } from '../../common/HoldStepButton';
import { createPortal } from 'react-dom';
import { Minus, Plus, FlipHorizontal2, FlipVertical2, Trash2 } from 'lucide-react';

export const ProductImageToolbar = ({ productId, anchorId, scale, onScale, alignment, onAlign, onFlip, onRemove }: {
    productId: string; anchorId: string;
    onRemove: () => void;
    scale: number;
    onScale: (delta: number) => void;
    alignment?: 'left' | 'center' | 'right';
    onAlign?: (alignment: 'left' | 'center' | 'right') => void;
    onFlip: (axis: 'horizontal' | 'vertical') => void;
}) => {
    const menuRef = React.useRef<HTMLDivElement>(null);
    const [position, setPosition] = React.useState({ left: 8, top: 8 });

    React.useLayoutEffect(() => {
        const anchor = document.getElementById(anchorId);
        const menu = menuRef.current;
        if (!anchor || !menu) return;
        const updatePosition = () => {
            const anchorRect = anchor.getBoundingClientRect();
            const menuRect = menu.getBoundingClientRect();
            const left = Math.max(8, Math.min(window.innerWidth - menuRect.width - 8, anchorRect.left + (anchorRect.width - menuRect.width) / 2));
            const top = anchorRect.top - menuRect.height - 8 >= 8
                ? anchorRect.top - menuRect.height - 8
                : Math.min(window.innerHeight - menuRect.height - 8, anchorRect.bottom + 8);
            setPosition({ left, top: Math.max(8, top) });
        };
        updatePosition();
        const observer = new ResizeObserver(updatePosition);
        observer.observe(anchor);
        observer.observe(menu);
        window.addEventListener('resize', updatePosition);
        const stopObservingScroll = observeAnchorScroll(anchor, updatePosition);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updatePosition);
            stopObservingScroll();
        };
    }, [anchorId, alignment]);

    return createPortal(
        <div
            ref={menuRef}
            data-product-image-surface={productId}
            data-editor-popover="true"
            data-drag-ignore="true"
            className="fixed z-[10020] flex items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-xl backdrop-blur-sm"
            style={position}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <HoldStepButton label="Diminuir imagem" onStep={() => { onScale(-0.1); return scale > MIN_PHOTO_SCALE; }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"><Minus size={16} /></HoldStepButton>
            <HoldStepButton label="Aumentar imagem" onStep={() => { onScale(0.1); return scale < MAX_PHOTO_SCALE; }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"><Plus size={16} /></HoldStepButton>
            {onAlign && <div className="flex items-center gap-0.5 border-l border-slate-200 pl-1" role="group" aria-label="Alinhamento da imagem">
                {([
                    ['left', 'Alinhar imagem à esquerda', AlignLeft],
                    ['center', 'Centralizar imagem', AlignCenter],
                    ['right', 'Alinhar imagem à direita', AlignRight],
                ] as const).map(([value, label, Icon]) => <button key={value} type="button" aria-label={label} title={label}
                    aria-pressed={alignment === value} onClick={() => onAlign(value)}
                    className="grid size-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 aria-pressed:bg-indigo-50 aria-pressed:text-indigo-700">
                    <Icon size={15} />
                </button>)}
            </div>}
            <button type="button" title="Inverter horizontalmente" aria-label="Inverter horizontalmente"
                onClick={() => onFlip('horizontal')} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"><FlipHorizontal2 size={16} /></button>
            <button type="button" title="Inverter verticalmente" aria-label="Inverter verticalmente"
                onClick={() => onFlip('vertical')} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"><FlipVertical2 size={16} /></button>
            <button type="button" title="Remover imagem" aria-label="Remover imagem" onClick={onRemove}
                className="grid size-8 place-items-center rounded-lg text-red-600 hover:bg-red-50"><Trash2 size={16} /></button>
        </div>,
        document.body,
    );
};
