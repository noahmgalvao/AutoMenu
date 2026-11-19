import type { Dispatch, SetStateAction } from 'react';
import type { MenuStyle } from '../../../domain/menu/model';
import { useRef, useState } from 'react';
import { Images, ImagePlus, Trash2 } from 'lucide-react';
import { ProductImageToolbar } from './ProductImageToolbar';

type Point = { x: number; y: number };
type Props = {
    id: string; anchorId: string; hasPhoto: boolean; active: boolean; scale: number;
    crop: Point; flips?: { horizontal?: boolean; vertical?: boolean };
    activate: () => void; choose: () => void; remove: () => void;
    type: 'product' | 'category';
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
    const [moving, setMoving] = useState(false);
    const gesture = useRef<{ pointer: number; start: Point; corner?: number; scale: number; crop: Point; width: number; height: number; excess: Point } | null>(null);
    const suppressClick = useRef(false);
    const pinch = useRef<{ distance: number; scale: number } | null>(null);
    const touchDistance = (touches: React.TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    const { id, type, updateStyle } = props;
    const setScale = (value: number) => {
        const field = type === 'category' ? 'categoryImageScale' : 'imageScale';
        const scale = Math.max(0.5, Math.min(type === 'category' ? 2 : 2.5, Math.round(value * 10) / 10));
        updateStyle(prev => prev[field] === scale ? prev : { ...prev, [field]: scale, name: 'Custom' });
    };
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
    return <div data-print-control="true" data-drag-ignore="true" className="absolute inset-0 z-20 touch-none rounded-[inherit] border border-blue-500"
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
            setScale(pinch.current.scale * touchDistance(event.touches) / pinch.current.distance);
        }}
        onTouchEnd={() => { pinch.current = null; setMoving(false); }}
        onTouchCancel={() => { pinch.current = null; setMoving(false); }}
        onPointerDown={event => {
            if (event.button !== 0) return;
            event.stopPropagation();
            const handle = (event.target as Element).closest<HTMLElement>('[data-photo-corner]');
            const rect = event.currentTarget.getBoundingClientRect();
            const img = event.currentTarget.parentElement?.querySelector('img');
            const fit = img?.naturalWidth ? Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight) : 1;
            gesture.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY },
                corner: handle ? Number(handle.dataset.photoCorner) : undefined, scale: props.scale, crop: props.crop,
                width: rect.width, height: rect.height, excess: {
                    x: Math.max(0, (img?.naturalWidth || 0) * fit - rect.width),
                    y: Math.max(0, (img?.naturalHeight || 0) * fit - rect.height),
                } };
            suppressClick.current = false;
            if (handle) event.currentTarget.setPointerCapture(event.pointerId);
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
                const delta = Math.abs(dx) >= Math.abs(dy) ? sx * dx / g.width : sy * dy / g.height;
                setScale(g.scale * (1 + delta));
            } else {
                setCrop({
                    x: g.excess.x > 0.5 ? percent(g.crop.x - dx * (props.flips?.horizontal ? -100 : 100) / g.excess.x) : g.crop.x,
                    y: g.excess.y > 0.5 ? percent(g.crop.y - dy * (props.flips?.vertical ? -100 : 100) / g.excess.y) : g.crop.y,
                });
            }
        }}
        onPointerUp={event => { event.stopPropagation(); gesture.current = null; setMoving(false); }}
        onPointerCancel={() => { gesture.current = null; setMoving(false); }}
        onClickCapture={event => { if (suppressClick.current) { event.stopPropagation(); suppressClick.current = false; } }}
        onClick={event => { event.stopPropagation(); props.activate(); }}>
        {!moving && <div className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-blue-500/25">
            <button type="button" className="grid min-w-0 max-w-[48%] place-items-center rounded bg-white/90 p-0.5 text-blue-700"
                aria-label={props.hasPhoto ? 'Substituir imagem' : 'Adicionar imagem'} title={props.hasPhoto ? 'Substituir imagem' : 'Adicionar imagem'}
                onClick={event => { event.stopPropagation(); props.activate(); props.choose(); }}>
                {props.hasPhoto ? <Images size={16} className="max-w-full" /> : <ImagePlus size={16} />}
            </button>
            {props.hasPhoto && <><span className="mx-px h-4 border-l border-blue-700/60" />
                <button type="button" aria-label="Remover imagem" title="Remover imagem" className="grid min-w-0 max-w-[48%] place-items-center rounded bg-white/90 p-0.5 text-red-600"
                    onClick={event => { event.stopPropagation(); props.activate(); props.remove(); }}><Trash2 size={16} className="max-w-full" /></button>
            </>}
        </div>}
        {props.hasPhoto && corners.map(([position], index) => <span key={index} data-photo-corner={index}
            className={`absolute h-2 w-2 rounded-full border border-blue-600 bg-white ${position}`} />)}
        {props.active && props.hasPhoto && <ProductImageToolbar productId={props.id} anchorId={props.anchorId} flips={props.flips}
            onScale={delta => setScale(props.scale + delta)} onFlip={flip} />}
    </div>;
}
