import React, { useLayoutEffect, useRef, useState } from 'react';

/** Pointer ownership stays with this button until release, including when crossing the canvas. */
export function FloatingTipsButton({ anchorRef, tipKeys, open, onToggle, onDragStart }: {
    anchorRef: React.RefObject<HTMLDivElement | null>;
    tipKeys: string[]; open: boolean; onToggle: () => void; onDragStart: () => void;
}) {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const drag = useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
    const [seen, setSeen] = useState<string[]>([]);
    const [appeared, setAppeared] = useState(false);
    const position = useRef({ side: 'left', y: 80 });
    const ignoreClick = useRef(false);
    useLayoutEffect(() => { if (tipKeys.length) setAppeared(true); }, [tipKeys.length]);
    useLayoutEffect(() => { if (open) setSeen(current => [...new Set([...current, ...tipKeys])]); }, [open, tipKeys.join('|')]);
    useLayoutEffect(() => {
        const anchor = anchorRef.current;
        if (!anchor) return;
        const place = () => {
            if (drag.current) return;
            const parent = anchor.offsetParent as HTMLElement | null;
            if (!parent) return;
            const rect = parent.getBoundingClientRect();
            const maxY = Math.max(16, Math.min(parent.clientHeight, window.innerHeight - rect.top) - 48);
            position.current.y = Math.max(16, Math.min(maxY, position.current.y));
            anchor.style.left = `${position.current.side === 'left' ? 16 : parent.clientWidth - 48}px`;
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
        const parent = anchor?.offsetParent as HTMLElement | null;
        if (anchor && parent && current.moved) {
            position.current.side = anchor.offsetLeft + 16 < parent.clientWidth / 2 ? 'left' : 'right';
            position.current.y = anchor.offsetTop;
            anchor.style.transition = 'left 180ms ease-out';
            anchor.style.left = `${position.current.side === 'left' ? 16 : parent.clientWidth - 48}px`;
        }
        ignoreClick.current = current.moved;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };
    const unread = tipKeys.filter(key => !seen.includes(key)).length;
    return <div ref={anchorRef} className="absolute left-4 top-20 z-[80] flex items-start">
        {(appeared || tipKeys.length > 0) && <button ref={buttonRef} type="button" data-fixed-canvas-tip
            aria-label="Abrir dicas do cardápio" aria-expanded={open} title="Dicas do cardápio"
            className="relative flex h-8 w-8 touch-none select-none items-center justify-center rounded-full bg-indigo-600 text-base font-bold leading-none text-white shadow-md hover:bg-indigo-700 active:cursor-grabbing"
            onPointerDown={event => {
                if (event.button !== 0) return;
                event.stopPropagation();
                const anchor = anchorRef.current!;
                anchor.style.transition = 'none';
                drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: anchor.offsetLeft, top: anchor.offsetTop, moved: false };
                event.currentTarget.setPointerCapture(event.pointerId);
            }} onPointerMove={event => {
                const current = drag.current, anchor = anchorRef.current;
                if (!current || current.id !== event.pointerId || !anchor) return;
                const dx = event.clientX - current.x, dy = event.clientY - current.y;
                if (!current.moved && Math.hypot(dx, dy) < 4) return;
                if (!current.moved) { current.moved = true; onDragStart(); }
                const parent = anchor.offsetParent as HTMLElement;
                const rect = parent.getBoundingClientRect();
                anchor.style.left = `${Math.max(0, Math.min(parent.clientWidth - 32, current.left + dx))}px`;
                anchor.style.top = `${Math.max(16, Math.min(Math.min(parent.clientHeight, window.innerHeight - rect.top) - 48, current.top + dy))}px`;
            }} onPointerUp={finish} onPointerCancel={finish}
            onClick={() => { if (ignoreClick.current) { ignoreClick.current = false; return; } onToggle(); }}>
            <span aria-hidden="true">?</span>
            {unread > 0 && !open && <span data-tips-unread className="pointer-events-none absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">{unread}</span>}
        </button>}
    </div>;
}
