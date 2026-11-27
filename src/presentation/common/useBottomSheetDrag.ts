import { createContext, useContext, useCallback, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';

const PARTIAL_HEIGHT = '45dvh';
const EXPANDED_HEIGHT = '100dvh';
const SNAP_DISTANCE = 64;

interface SheetDrag {
    pointerId: number;
    startY: number;
    startHeight: number;
    fullHeight: number;
    visibleHeight: number;
    frame: number;
}

export const DesignerSheetExpansionContext = createContext<{expanded:boolean;setExpanded:(value:boolean)=>void}|null>(null);

export function useBottomSheetDrag(isOpen: boolean, onClose?: () => void) {
    const shared = useContext(DesignerSheetExpansionContext);
    const sharedRef = useRef(shared); sharedRef.current = shared;
    const [height, setHeight] = useState(PARTIAL_HEIGHT);
    const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
    const sheetRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<SheetDrag | null>(null);
    const animationRef = useRef<Animation | null>(null);

    useLayoutEffect(() => {
        const query = window.matchMedia('(max-width: 767px)');
        const update = () => setIsMobile(query.matches);
        query.addEventListener('change', update);
        return () => query.removeEventListener('change', update);
    }, []);

    useLayoutEffect(() => {
        const sheet = sheetRef.current;
        if (!sheet || !isMobile || !isOpen) return;
        const next = sharedRef.current?.expanded ? EXPANDED_HEIGHT : PARTIAL_HEIGHT;
        sheet.style.height = next;
        setHeight(next);
        return () => {
            const drag = dragRef.current;
            if (drag) cancelAnimationFrame(drag.frame);
            dragRef.current = null;
            animationRef.current?.cancel();
            sheet.style.removeProperty('transition');
            sheet.style.removeProperty('transform');
            if (!window.matchMedia('(max-width: 767px)').matches) sheet.style.removeProperty('height');
        };
    }, [isMobile, isOpen, shared?.expanded]);

    useLayoutEffect(() => {
        if (!isMobile || !isOpen) return;
        const root = document.documentElement.style;
        root.setProperty('--automenu-bottom-sheet-height', height);
        return () => {
            if (root.getPropertyValue('--automenu-bottom-sheet-height') === height) {
                root.removeProperty('--automenu-bottom-sheet-height');
            }
        };
    }, [height, isMobile, isOpen]);

    const settleHeight = useCallback((next: string, fromTop?: number) => {
        const sheet = sheetRef.current;
        if (!sheet) return;
        const startTop = fromTop ?? sheet.getBoundingClientRect().top;
        animationRef.current?.cancel();
        sheet.style.transition = 'none';
        sheet.style.transform = 'none';
        sheet.style.height = next;
        const offset = startTop - sheet.getBoundingClientRect().top;
        sheet.style.removeProperty('transform');
        sheet.style.removeProperty('transition');
        setHeight(next);
        sharedRef.current?.setExpanded(next === EXPANDED_HEIGHT);

        if (Math.abs(offset) > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            animationRef.current = sheet.animate([
                { transform: `translate3d(0, ${offset}px, 0)` },
                { transform: 'translate3d(0, 0, 0)' },
            ], { duration: 190, easing: 'cubic-bezier(.22, .8, .3, 1)' });
        }
    }, []);

    const dragHeight = (drag: SheetDrag, pointerY: number) =>
        Math.max(0, Math.min(drag.fullHeight, drag.startHeight + drag.startY - pointerY));

    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        const sheet = sheetRef.current;
        if (!isMobile || !isOpen || !sheet || event.button !== 0 || dragRef.current) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const startHeight = Math.max(0, window.innerHeight - sheet.getBoundingClientRect().top);
        animationRef.current?.cancel();
        sheet.style.transition = 'none';
        sheet.style.height = EXPANDED_HEIGHT;
        const fullHeight = sheet.offsetHeight;
        sheet.style.transform = `translate3d(0, ${fullHeight - startHeight}px, 0)`;
        dragRef.current = { pointerId: event.pointerId, startY: event.clientY, startHeight, fullHeight, visibleHeight: startHeight, frame: 0 };
    };

    const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        drag.visibleHeight = dragHeight(drag, event.clientY);
        if (drag.frame) return;
        drag.frame = requestAnimationFrame(() => {
            drag.frame = 0;
            const sheet = sheetRef.current;
            if (sheet) sheet.style.transform = `translate3d(0, ${drag.fullHeight - drag.visibleHeight}px, 0)`;
        });
    };

    const finish = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
        const drag = dragRef.current;
        const sheet = sheetRef.current;
        if (!drag || drag.pointerId !== event.pointerId || !sheet) return;
        dragRef.current = null;
        cancelAnimationFrame(drag.frame);
        const visibleHeight = cancelled ? drag.visibleHeight : dragHeight(drag, event.clientY);
        const delta = drag.startY - event.clientY;
        if (!cancelled && delta < -8 && visibleHeight < window.innerHeight * .25 && onClose) {
            sheet.style.height = `${Math.max(1, visibleHeight)}px`;
            sheet.style.transform = 'none';
            void sheet.offsetHeight;
            sheet.style.removeProperty('transform');
            sheet.style.removeProperty('transition');
            onClose();
            return;
        }
        const next = cancelled || Math.abs(delta) < 8 ? height : (
            delta >= SNAP_DISTANCE || (delta > -SNAP_DISTANCE && visibleHeight > drag.fullHeight * .78)
                ? EXPANDED_HEIGHT : PARTIAL_HEIGHT
        );
        settleHeight(next, window.innerHeight - visibleHeight);
    };

    const openPartial = useCallback(() => {
        if (isMobile) settleHeight('50dvh');
    }, [isMobile, settleHeight]);
    const isExpanded = height === EXPANDED_HEIGHT;
    const toggleExpanded = () => {
        if (isMobile) settleHeight(isExpanded ? PARTIAL_HEIGHT : EXPANDED_HEIGHT);
    };

    return {
        sheetRef, height, isMobile, isExpanded, openPartial, toggleExpanded,
        dragHandlers: {
            onPointerDown, onPointerMove, onPointerUp: finish,
            onPointerCancel: (event: PointerEvent<HTMLDivElement>) => finish(event, true),
            onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => finish(event, true),
            style: isMobile && isExpanded ? { paddingTop: 'max(0.75rem, env(safe-area-inset-top))' } : undefined,
        },
    };
}
