import { createPortal } from 'react-dom';
import React, { useLayoutEffect, useRef, useState } from 'react';

/** Pointer ownership stays with this button until release, including when crossing the canvas. */
export function FloatingTipsButton({ anchorRef, tipKeys, open, onToggle, onDragStart, pending = false }: {
    anchorRef: React.RefObject<HTMLDivElement | null>;
    pending?: boolean; tipKeys: string[]; open: boolean; onToggle: () => void; onDragStart: () => void;
}) {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const drag = useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
    const [seen, setSeen] = useState<string[]>([]);
    const [appeared, setAppeared] = useState(false);
    const position = useRef({ side: 'left', y: 80 });
    const ignoreClick = useRef(false);
    // Reserve the header's full height even while it slides out of view.
    const bounds = () => ({ top: Math.max(72, (document.querySelector<HTMLElement>('[data-site-header]')?.offsetHeight || 64) + 8),
        bottom: Math.max(72, window.innerHeight - 48), width: window.innerWidth });
    useLayoutEffect(() => { if (tipKeys.length) setAppeared(true); }, [tipKeys.length]);
    useLayoutEffect(() => { if (open) setSeen(current => [...new Set([...current, ...tipKeys])]); }, [open, tipKeys.join('|')]);
    useLayoutEffect(() => {
        const anchor = anchorRef.current;
        if (!anchor) return;
        const place = () => {
            if (drag.current) return;
            const area = bounds();
            position.current.y = Math.max(area.top, Math.min(area.bottom, position.current.y));
            anchor.style.left = `${position.current.side === 'left' ? 16 : area.width - 48}px`;
            anchor.style.top = `${position.current.y}px`;
        };
        place();
        window.addEventListener('resize', place);
        return () => window.removeEventListener('resize', place);
    }, [anchorRef, appeared]);
    const finish = (event: React.PointerEvent) => {
        const current = drag.current;
        if (!current || current.id !== event.pointerId) return;
        drag.current = null;
        const anchor = anchorRef.current;
        const area = bounds();
        if (anchor && current.moved) {
            position.current.side = anchor.getBoundingClientRect().left + 16 < area.width / 2 ? 'left' : 'right';
            position.current.y = Math.max(area.top, Math.min(area.bottom, anchor.getBoundingClientRect().top));
            anchor.style.top = `${position.current.y}px`;
            anchor.style.transition = 'left 180ms ease-out';
            anchor.style.left = `${position.current.side === 'left' ? 16 : area.width - 48}px`;
        }
        ignoreClick.current = current.moved;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };
    const unread = tipKeys.filter(key => !seen.includes(key)).length;
    return createPortal(<div ref={anchorRef} className="fixed left-4 top-20 z-[80] flex items-start">
        {(appeared || tipKeys.length > 0) && <button ref={buttonRef} type="button" data-fixed-canvas-tip
            aria-label="Abrir dicas do cardápio" aria-expanded={open} aria-busy={pending} title="Dicas do cardápio"
            className="relative flex h-8 w-8 touch-none select-none items-center justify-center rounded-full bg-indigo-600 text-base font-bold leading-none text-white shadow-md hover:bg-indigo-700 active:cursor-grabbing"
            onPointerDown={event => {
                if (event.button !== 0) return;
                event.stopPropagation();
                const anchor = anchorRef.current!;
                anchor.style.transition = 'none';
                drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: anchor.getBoundingClientRect().left, top: anchor.getBoundingClientRect().top, moved: false };
                event.currentTarget.setPointerCapture(event.pointerId);
            }} onPointerMove={event => {
                const current = drag.current, anchor = anchorRef.current;
                if (!current || current.id !== event.pointerId || !anchor) return;
                const dx = event.clientX - current.x, dy = event.clientY - current.y;
                if (!current.moved && Math.hypot(dx, dy) < 4) return;
                if (!current.moved) { current.moved = true; onDragStart(); }
                const area = bounds();
                anchor.style.left = `${Math.max(0, Math.min(area.width - 32, current.left + dx))}px`;
                anchor.style.top = `${Math.max(area.top, Math.min(area.bottom, current.top + dy))}px`;
            }} onPointerUp={finish} onPointerCancel={finish}
            onClick={() => { if (ignoreClick.current) { ignoreClick.current = false; return; } onToggle(); }}>
            <span aria-hidden="true" className={pending ? "animate-pulse" : undefined}>{pending ? "…" : "?"}</span>
            {unread > 0 && !open && <span data-tips-unread className="pointer-events-none absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">{unread}</span>}
        </button>}
    </div>, document.body);
}
