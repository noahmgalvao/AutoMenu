import type { Dispatch, SetStateAction } from 'react';
import type { MenuStyle } from '../../../domain/menu/model';
import { triggerLimitFeedback } from './textFit';
import { getCanvasDragScale } from './CanvasTransformHandles';
import { clampPhotoScale, MIN_PHOTO_SCALE, MAX_PHOTO_SCALE } from '../../../domain/menu/styleRules';
import { useLayoutEffect, useRef, useState } from 'react';
import { Images, ImagePlus } from 'lucide-react';
import { livePhotoScaleVariable } from './photoSizing';
import { ProductImageToolbar } from './ProductImageToolbar';

type Point = { x: number; y: number };
type Props = {
    id: string; anchorId: string; hasPhoto: boolean; active: boolean; scale: number;
    crop: Point; flips?: { horizontal?: boolean; vertical?: boolean };
    activate: () => void; choose: () => void; remove: () => void;
    type: 'product' | 'category';
    alignment?: 'left' | 'center' | 'right';
    updateStyle: Dispatch<SetStateAction<MenuStyle>>;
};
const corners = [
    ['top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize', -1, -1],
    ['top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize', 1, -1],
    ['bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize', -1, 1],
    ['bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize', 1, 1],
] as const;
const percent = (value: number) => Math.min(100, Math.max(0, value));

export function PhotoEditControls(props: Props) {
    const [hitSize, setHitSize] = useState(32);
    const [moving, setMoving] = useState(false);
    const gesture = useRef<{ pointer: number; start: Point; corner?: number; scale: number; crop: Point; width: number; height: number; originalFit: string; excess: Point } | null>(null);
    const suppressClick = useRef(false);
    const pinch = useRef<{ distance: number; scale: number } | null>(null);
    const touchDistance = (touches: React.TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    const { id, type, updateStyle } = props;
    const frameRef = useRef<HTMLDivElement>(null);
    const draft = useRef<{ scale?: number; crop?: Point } | null>(null);
    const previewRoot = useRef<HTMLElement | null>(null);
    const scaleField = type === 'category' ? 'categoryImageScale' : 'imageScale';
    const liveScale = livePhotoScaleVariable(type);
    const setScale = (value: number, increment = false) => {
        const current = props.scale;
        const requested = increment ? Math.round((current + value) * 1000) / 1000 : value;
        if ((requested <= MIN_PHOTO_SCALE || requested >= MAX_PHOTO_SCALE) && !frameRef.current?.classList.contains('automenu-limit-feedback')) {
            triggerLimitFeedback(frameRef.current);
        }
        updateStyle(prev => {
            const previous = prev[scaleField] || 1;
            const scale = clampPhotoScale(increment ? Math.round((previous + value) * 1000) / 1000 : value);
            return previous === scale ? prev : { ...prev, [scaleField]: scale, name: 'Custom' };
        });
    };
    const previewScale = (value: number) => {
        const surface = frameRef.current?.parentElement;
        if (!surface) return;
        const scale = clampPhotoScale(value);
        if (Math.abs(scale - value) > .001 && !frameRef.current?.classList.contains('automenu-limit-feedback')) {
            triggerLimitFeedback(frameRef.current);
        }
        draft.current = { scale };
        previewRoot.current = surface.closest<HTMLElement>('[data-menu-preview-canvas], [data-product-designer-edit-form]') || surface;
        previewRoot.current.style.setProperty(liveScale, String(scale));
    };
    useLayoutEffect(() => {
        const frame = frameRef.current;
        if (!frame) return;
        const refresh = () => setHitSize(Math.min(112, 36 / Math.max(.1, getCanvasDragScale(frame))));
        refresh();
        const observer = new ResizeObserver(refresh);
        observer.observe(frame);
        window.addEventListener('resize', refresh);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', refresh);
        };
    }, []);
    useLayoutEffect(() => () => {
        previewRoot.current?.style.removeProperty(liveScale);
    }, [liveScale]);
    const setAlignment = (alignment: NonNullable<Props['alignment']>) => updateStyle(prev => {
        if (type === 'product') return { ...prev, name: 'Custom', productPhotoAlignments: { ...prev.productPhotoAlignments, [id]: alignment } };
        const image = prev.categoryImages?.[id];
        return image ? { ...prev, name: 'Custom', categoryImages: { ...prev.categoryImages, [id]: { ...image, alignment } } } : prev;
    });
    const setCrop = (crop: Point) => updateStyle(prev => {
        if (type === 'product') return { ...prev, name: 'Custom', productPhotoCrops: { ...prev.productPhotoCrops, [id]: crop } };
        const image = prev.categoryImages?.[id];
        return image ? { ...prev, name: 'Custom', categoryImages: { ...prev.categoryImages, [id]: { ...image, crop } } } : prev;
    });
    const flip = (axis: 'horizontal' | 'vertical') => updateStyle(prev => {
        if (type === 'product') {
            const flips = prev.productImageFlips?.[id];
            return { ...prev, name: 'Custom', productImageFlips: { ...prev.productImageFlips, [id]: { ...flips, [axis]: !flips?.[axis] } } };
        }
        const image = prev.categoryImages?.[id];
        return image ? { ...prev, name: 'Custom', categoryImages: { ...prev.categoryImages, [id]: { ...image, [axis]: !image[axis] } } } : prev;
    });
    const finish = (commit: boolean) => {
        const surface = frameRef.current?.parentElement;
        previewRoot.current?.style.removeProperty(liveScale);
        previewRoot.current = null;
        const next = draft.current;
        draft.current = null;
        if (commit && next?.scale !== undefined) setScale(next.scale);
        if (next?.crop) {
            const img = surface?.querySelector('img');
            if (commit) setCrop(next.crop);
            else if (img) {
                img.style.objectPosition = `${props.crop.x}% ${props.crop.y}%`;
                img.style.objectFit = gesture.current?.originalFit || 'cover';
            }
        }
        pinch.current = null;
        gesture.current = null;
        setMoving(false);
    };
    return <div ref={frameRef} data-photo-gesture data-print-control="true" data-drag-ignore="true" className="absolute inset-0 z-20 touch-none rounded-[inherit] border border-blue-500"
        onTouchStart={event => {
            if (!props.hasPhoto || event.touches.length !== 2) return;
            const frame = event.currentTarget;
            if (!Array.from(event.touches).every(t => t.target instanceof Node && frame.contains(t.target))) return;
            event.stopPropagation();
            pinch.current = { distance: Math.max(1, touchDistance(event.touches)), scale: props.scale };
            gesture.current = null;
            suppressClick.current = true;
            props.activate();
            setMoving(true);
        }}
        onTouchMove={event => {
            if (!pinch.current || event.touches.length !== 2) return;
            event.stopPropagation();
            previewScale(pinch.current.scale * touchDistance(event.touches) / pinch.current.distance);
        }}
        onTouchEnd={() => { if (pinch.current) finish(true); }}
        onTouchCancel={() => finish(false)}
        onPointerDown={event => {
            if (event.button !== 0 || !event.isPrimary) return;
            event.stopPropagation();
            const handle = (event.target as Element).closest<HTMLElement>('[data-photo-corner]');
            if (handle) event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            const img = event.currentTarget.parentElement?.querySelector('img');
            const fit = img?.naturalWidth ? Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight) : 1;
            gesture.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY },
                corner: handle ? Number(handle.dataset.photoCorner) : undefined, scale: props.scale, crop: props.crop,
                width: rect.width, height: rect.height, originalFit: img?.style.objectFit || '', excess: {
                    x: Math.max(0, (img?.naturalWidth || 0) * fit - rect.width),
                    y: Math.max(0, (img?.naturalHeight || 0) * fit - rect.height),
                } };
            suppressClick.current = false;
            const capture = handle || (event.target as Element).closest('button') || event.currentTarget;
            capture.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
            const g = gesture.current;
            if (!g || !props.hasPhoto || g.pointer !== event.pointerId || !event.buttons) return;
            const dx = event.clientX - g.start.x, dy = event.clientY - g.start.y;
            if (!suppressClick.current && Math.hypot(dx, dy) < 3) return;
            if (!suppressClick.current) props.activate();
            suppressClick.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            setMoving(true);
            if (g.corner !== undefined) {
                const [, sx, sy] = corners[g.corner];
                const delta = (sx * g.width * dx + sy * g.height * dy) / (g.width ** 2 + g.height ** 2 || 1);
                previewScale(g.scale * (1 + delta));
            } else {
                const crop = {
                    x: g.excess.x > 0.5 ? percent(g.crop.x - dx * (props.flips?.horizontal ? -100 : 100) / g.excess.x) : g.crop.x,
                    y: g.excess.y > 0.5 ? percent(g.crop.y - dy * (props.flips?.vertical ? -100 : 100) / g.excess.y) : g.crop.y,
                };
                draft.current = { crop };
                const img = frameRef.current?.parentElement?.querySelector('img');
                if (img) { img.style.objectFit = 'cover'; img.style.objectPosition = `${crop.x}% ${crop.y}%`; }
            }
        }}
        onPointerUp={event => { event.stopPropagation(); if (!pinch.current && gesture.current?.pointer === event.pointerId) finish(true); }}
        onPointerCancel={event => { if (!pinch.current && gesture.current?.pointer === event.pointerId) finish(false); }}
        onClickCapture={event => {
            if (suppressClick.current && event.currentTarget.contains(event.target as Node)) {
                event.stopPropagation();
                suppressClick.current = false;
            }
        }}
        onClick={event => { event.stopPropagation(); props.activate(); }}>
        {!moving && <button type="button"
            className="photo-overlay-slot absolute inset-0 size-full rounded-[inherit] bg-blue-500/20 text-blue-950 hover:bg-blue-400/30"
            aria-label={props.hasPhoto ? 'Substituir imagem' : 'Adicionar imagem'} title={props.hasPhoto ? 'Substituir imagem' : 'Adicionar imagem'}
            onClick={event => {
                event.stopPropagation();
                if (props.active || !props.hasPhoto) props.choose();
                else props.activate();
            }}>
            <span className="photo-overlay-action pointer-events-none">
                {props.hasPhoto ? <Images /> : <ImagePlus />}
            </span>
        </button>}
        {props.hasPhoto && corners.map(([position], index) => <span key={index} data-photo-corner={index}
            style={{ '--photo-corner-hit': `${hitSize}px` } as React.CSSProperties}
            className={`absolute z-10 grid touch-none place-items-center ${position}`}>
            <span className="pointer-events-none size-3 rounded-full border border-blue-600 bg-white" />
        </span>)}
        {props.active && props.hasPhoto && <ProductImageToolbar productId={props.id} anchorId={props.anchorId}
            scale={props.scale} onScale={delta => setScale(delta, true)} alignment={props.alignment} onAlign={props.alignment ? setAlignment : undefined} onFlip={flip} onRemove={props.remove} />}
    </div>;
}
