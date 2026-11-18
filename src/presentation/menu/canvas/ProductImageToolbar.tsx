import type { MenuStyle } from '../../../domain/menu/model';
import React from 'react';
import { createPortal } from 'react-dom';
import { Repeat2, Minus, Plus, FlipHorizontal2, FlipVertical2, Trash2 } from 'lucide-react';

export const ProductImageToolbar = ({ productId, anchorId, handlers, flips }: {
    productId: string; anchorId: string; handlers: any; flips?: NonNullable<MenuStyle['productImageFlips']>[string];
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
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [anchorId]);

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
            <button type="button" onClick={() => handlers.editProductImage?.(productId)} className="flex h-8 w-8 items-center justify-center rounded-lg text-indigo-600 hover:bg-indigo-50" title="Substituir imagem" aria-label="Substituir imagem"><Repeat2 size={16} /></button>
            <button type="button" onClick={() => handlers.adjustProductImageScale?.(-0.1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" title="Diminuir imagem" aria-label="Diminuir imagem"><Minus size={16} /></button>
            <button type="button" onClick={() => handlers.adjustProductImageScale?.(0.1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" title="Aumentar imagem" aria-label="Aumentar imagem"><Plus size={16} /></button>
            <button type="button" aria-pressed={Boolean(flips?.horizontal)} title="Inverter horizontalmente" aria-label="Inverter horizontalmente"
                onClick={() => handlers.flipProductImage?.(productId, 'horizontal')} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 aria-pressed:bg-indigo-50 aria-pressed:text-indigo-700"><FlipHorizontal2 size={16} /></button>
            <button type="button" aria-pressed={Boolean(flips?.vertical)} title="Inverter verticalmente" aria-label="Inverter verticalmente"
                onClick={() => handlers.flipProductImage?.(productId, 'vertical')} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 aria-pressed:bg-indigo-50 aria-pressed:text-indigo-700"><FlipVertical2 size={16} /></button>
            <button type="button" onClick={() => handlers.removeProductImage?.(productId)} className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50" title="Remover imagem" aria-label="Remover imagem"><Trash2 size={16} /></button>
        </div>,
        document.body,
    );
};
