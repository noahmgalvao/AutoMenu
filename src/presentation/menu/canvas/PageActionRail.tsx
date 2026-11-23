import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { observeAnchorScroll } from './canvasViewport';

interface PageActionRailProps {
    before: boolean;
    after: boolean;
    onAdd: (direction: 'before' | 'after') => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
}

export function PageActionRail({ before, after, onAdd, onMoveUp, onMoveDown }: PageActionRailProps) {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const rail = ref.current;
        const page = rail?.parentElement;
        const canvas = page?.closest<HTMLElement>('[data-automenu-editor-canvas]');
        if (!rail || !page || !canvas) return;

        const viewport = window.visualViewport;
        let frame = 0;
        const place = () => {
            const pageBox = page.getBoundingClientRect();
            const railWidth = rail.offsetWidth;
            const scale = page.offsetWidth ? pageBox.width / page.offsetWidth : 1;
            if (scale <= 0) return;
            const visibleRight = Math.min(canvas.getBoundingClientRect().right, viewport ? viewport.offsetLeft + viewport.width : window.innerWidth);
            const limit = Math.max(0, page.offsetWidth - railWidth * 1.4);
            const offset = Math.min(limit, Math.max(0, Math.round((pageBox.right - visibleRight) / scale)));
            const next = `${offset}px`;
            if (rail.style.getPropertyValue('--page-action-offset') !== next) rail.style.setProperty('--page-action-offset', next);
        };
        const schedule = () => {
            if (frame) return;
            frame = requestAnimationFrame(() => { frame = 0; place(); });
        };
        place();
        const stopObservingScroll = observeAnchorScroll(page, schedule);
        const observer = new ResizeObserver(schedule);
        observer.observe(canvas);
        const surface = page.closest('[data-canvas-zoom-surface]');
        if (surface) observer.observe(surface);
        viewport?.addEventListener('resize', schedule);
        viewport?.addEventListener('scroll', schedule);
        return () => {
            cancelAnimationFrame(frame);
            stopObservingScroll();
            observer.disconnect();
            viewport?.removeEventListener('resize', schedule);
            viewport?.removeEventListener('scroll', schedule);
        };
    }, []);

    const actions = [
        { title: 'Adicionar página antes', Icon: Plus, onClick: before ? () => onAdd('before') : undefined },
        { title: 'Trocar com a página anterior', Icon: ChevronUp, onClick: before ? onMoveUp : undefined },
        { title: 'Trocar com a próxima página', Icon: ChevronDown, onClick: after ? onMoveDown : undefined },
        { title: 'Adicionar página depois', Icon: Plus, onClick: after ? () => onAdd('after') : undefined },
    ];

    return <div ref={ref} data-page-action-rail data-print-control="true" data-drag-ignore="true"
        className="automenu-page-action-rail pointer-events-none absolute top-1/2 z-[100002] grid -translate-y-1/2">
        {actions.map(({ title, Icon, onClick }, index) => onClick && (
            <button key={title} type="button" title={title} aria-label={title}
                style={{ gridRow: index + 1 }}
                className="pointer-events-auto grid touch-manipulation place-items-center rounded-full border border-white bg-blue-600 text-white shadow-md hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
                onPointerDown={event => event.stopPropagation()}
                onClick={event => { event.stopPropagation(); onClick(); }}>
                <Icon aria-hidden="true" className="size-1/2" />
            </button>
        ))}
    </div>;
}
