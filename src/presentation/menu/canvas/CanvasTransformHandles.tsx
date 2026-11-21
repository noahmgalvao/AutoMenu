import React from 'react';
import { RotateCw } from 'lucide-react';
import type { MenuHeadingField } from '../../../domain/menu/menuHeadings';

export interface CanvasScaleTarget {
    type: MenuHeadingField | 'category' | 'product' | 'freeText';
    id: string;
    headingFields?: MenuHeadingField[];
}

export const getCanvasDragScale = (element: HTMLElement) => {
    const page = element.closest<HTMLElement>('[data-menu-print-page]');
    return page?.offsetWidth ? page.getBoundingClientRect().width / page.offsetWidth : 1;
};

type Gesture = {
    preview: (event: PointerEvent) => void;
    finish: (committed: boolean) => void;
};

type StartGesture = (event: React.PointerEvent<HTMLButtonElement>) => Gesture | undefined;

function TransformHandle({ label, className, start, children, kind }: {
    label: string;
    className: string;
    start: StartGesture;
    children: React.ReactNode;
    kind: 'scale' | 'rotation';
}) {
    const cleanupRef = React.useRef<() => void>(undefined);

    const pointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (!event.isPrimary || event.button !== 0 || cleanupRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        const gesture = start(event);
        if (!gesture) return;

        const button = event.currentTarget;
        const capture = button.closest<HTMLElement>('[data-menu-preview-canvas]') ?? button;
        const pointer = event.pointerId;
        const controller = new AbortController();
        const options = { signal: controller.signal };
        let frame = 0;
        let latest: PointerEvent | undefined;
        const cleanup = (commit: boolean) => {
            controller.abort();
            cancelAnimationFrame(frame);
            if (commit && latest && capture !== button) {
                const ignoreClick = (event: Event) => event.stopPropagation();
                capture.addEventListener('click', ignoreClick, { capture: true, once: true });
                window.setTimeout(() => capture.removeEventListener('click', ignoreClick, true), 0);
            }
            cleanupRef.current = undefined;
            if (capture.hasPointerCapture(pointer)) capture.releasePointerCapture(pointer);
            if (commit && latest) gesture.preview(latest);
            gesture.finish(commit);
        };
        cleanupRef.current = () => cleanup(false);
        try {
            capture.setPointerCapture(pointer);
        } catch {
            cleanup(false);
            return;
        }
        capture.addEventListener('pointermove', event => {
            if (event.pointerId !== pointer) return;
            latest = event;
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                if (latest) gesture.preview(latest);
            });
        }, options);
        capture.addEventListener('pointerup', event => {
            if (event.pointerId === pointer) cleanup(true);
        }, options);
        const cancel = (event: PointerEvent) => {
            if (event.pointerId === pointer) cleanup(false);
        };
        capture.addEventListener('pointercancel', cancel, options);
        capture.addEventListener('lostpointercapture', cancel, options);
        window.addEventListener('blur', () => cleanup(false), options);
    };

    const targetSize = kind === 'scale' ? '38px' : '32px';
    return <button type="button" aria-label={label} title={label} data-canvas-transform-handle={kind}
        data-print-control="true" data-drag-ignore="true"
        className={`pointer-events-auto absolute left-1/2 z-[75] grid -translate-x-1/2 touch-none place-items-center rounded-full ${className}`}
        style={{ width: `calc(${targetSize} * var(--canvas-handle-inverse, 1))`, height: `calc(${targetSize} * var(--canvas-handle-inverse, 1))` }}
        onPointerDown={pointerDown} onClick={event => event.stopPropagation()}
        onDoubleClick={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}>
        {children}
    </button>;
}

export function CanvasScaleHandles({ target, start }: {
    target: CanvasScaleTarget;
    start: (event: React.PointerEvent<HTMLButtonElement>, target: CanvasScaleTarget, direction: -1 | 1) => Gesture | undefined;
}) {
    return ([-1, 1] as const).map(direction => (
        <TransformHandle key={direction} kind="scale"
            label={direction === -1 ? 'Redimensionar pelo topo' : 'Redimensionar pela base'}
            className={`cursor-ns-resize ${direction === -1
                ? 'top-0 -translate-y-full mt-[calc(5px*var(--canvas-handle-inverse,1))]'
                : 'bottom-0 translate-y-full mb-[calc(5px*var(--canvas-handle-inverse,1))]'}`}
            start={event => start(event, target, direction)}>
            <span className="pointer-events-none absolute rounded-full border-2 border-indigo-500 bg-white shadow-sm"
                style={{
                    width: 'calc(18px * var(--canvas-handle-inverse, 1))',
                    height: 'calc(18px * var(--canvas-handle-inverse, 1))',
                    [direction === -1 ? 'bottom' : 'top']: 'calc(-4px * var(--canvas-handle-inverse, 1))',
                }} />
        </TransformHandle>
    ));
}

export const normalizeCanvasRotation = (degrees: number) => ((Math.round(degrees) % 360) + 360) % 360;

export function CanvasRotationHandle({ rotation, onRotate, belowScaleHandle = false }: {
    rotation: number;
    belowScaleHandle?: boolean;
    onRotate: (rotation: number, committed: boolean) => void;
}) {
    return <TransformHandle kind="rotation" label="Rotacionar objeto" className={`top-full cursor-grab active:cursor-grabbing ${belowScaleHandle
        ? 'mt-[calc(18px*var(--canvas-handle-inverse,1))]' : 'mt-[calc(2px*var(--canvas-handle-inverse,1))]'}`}
        start={event => {
            const frame = event.currentTarget.parentElement;
            if (!frame) return;
            const rect = frame.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const angle = (point: { clientX: number; clientY: number }) =>
                Math.atan2(point.clientY - centerY, point.clientX - centerX) * 180 / Math.PI;
            const startAngle = angle(event);
            let next = rotation;
            return {
                preview: point => {
                    next = normalizeCanvasRotation(rotation + angle(point) - startAngle);
                    onRotate(next, false);
                },
                finish: commit => onRotate(commit ? next : rotation, true),
            };
        }}>
        <span className="grid place-items-center rounded-full border border-indigo-500 bg-white text-indigo-700 shadow-sm"
            style={{ width: 'calc(25px * var(--canvas-handle-inverse, 1))', height: 'calc(25px * var(--canvas-handle-inverse, 1))' }}>
            <RotateCw style={{ width: '60%', height: '60%' }} />
        </span>
    </TransformHandle>;
}
