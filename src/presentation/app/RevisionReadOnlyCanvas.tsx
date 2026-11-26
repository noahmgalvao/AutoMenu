import React from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { MenuPreview } from '../menu/canvas/MenuPreview';
import type { WorkspaceMenuContent as RevisionState } from '../../application/workspace/workspaceGateway';
const clampZoom = (value: number) => Math.min(1.5, Math.max(.2, value));
export const ReadOnlyCanvas: React.FC<{
    preview: RevisionState;
    scale: number;
    setScale: React.Dispatch<React.SetStateAction<number>>;
    splitCategoryAcrossPages?: boolean;
}> = ({ preview, scale, setScale, splitCategoryAcrossPages }) => {
    const viewportRef = React.useRef<HTMLDivElement>(null);
    const pinchRef = React.useRef<{
        distance: number;
        scale: number;
    } | null>(null);
    const [showZoom, setShowZoom] = React.useState(false);
    const zoomTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const updateZoom = React.useCallback((delta: number) => {
        setScale((current) => clampZoom(Number((current + delta).toFixed(2))));
        setShowZoom(true);
        if (zoomTimerRef.current)
            clearTimeout(zoomTimerRef.current);
        zoomTimerRef.current = setTimeout(() => setShowZoom(false), 1000);
    }, [setScale]);
    React.useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport)
            return;
        const onWheel = (event: WheelEvent) => {
            if (!event.ctrlKey && !event.metaKey)
                return;
            event.preventDefault();
            updateZoom(event.deltaY * -0.0035);
        };
        viewport.addEventListener('wheel', onWheel, { passive: false });
        return () => viewport.removeEventListener('wheel', onWheel);
    }, [updateZoom]);
    React.useEffect(() => () => {
        if (zoomTimerRef.current)
            clearTimeout(zoomTimerRef.current);
    }, []);
    const touchDistance = (touches: React.TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    return (<div ref={viewportRef} className="relative h-full min-h-0 overflow-auto bg-slate-200 custom-scrollbar touch-pan-x touch-pan-y" onTouchStart={(event) => {
            if (event.touches.length === 2)
                pinchRef.current = { distance: touchDistance(event.touches), scale };
        }} onTouchMove={(event) => {
            if (event.touches.length !== 2 || !pinchRef.current)
                return;
            event.preventDefault();
            const nextScale = clampZoom(pinchRef.current.scale * (touchDistance(event.touches) / pinchRef.current.distance));
            setScale(nextScale);
            setShowZoom(true);
        }} onTouchEnd={(event) => {
            if (event.touches.length < 2) {
                pinchRef.current = null;
                if (zoomTimerRef.current)
                    clearTimeout(zoomTimerRef.current);
                zoomTimerRef.current = setTimeout(() => setShowZoom(false), 800);
            }
        }} onTouchCancel={() => { pinchRef.current = null; }}>
      <div className={`sticky top-3 z-20 flex justify-end gap-2 pr-3 pointer-events-none ${showZoom ? '' : ''}`}>
        <span className={`self-center rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-bold text-white transition-opacity ${showZoom ? 'opacity-100' : 'opacity-0'}`}>{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => updateZoom(-0.1)} className="pointer-events-auto p-2.5 rounded-full bg-white text-slate-700 shadow-lg hover:bg-slate-50" aria-label="Diminuir zoom"><ZoomOut size={18}/></button>
        <button type="button" onClick={() => updateZoom(0.1)} className="pointer-events-auto p-2.5 rounded-full bg-white text-slate-700 shadow-lg hover:bg-slate-50" aria-label="Aumentar zoom"><ZoomIn size={18}/></button>
      </div>
      <div className="w-fit min-w-full p-3 md:p-6 flex justify-center items-start">
        <div className="w-fit origin-top-left" style={{ zoom: scale }}>
          <MenuPreview products={preview.products} style={preview.style} sortOption={preview.sortOption} readOnly splitCategoryAcrossPages={splitCategoryAcrossPages}/>
        </div>
      </div>
    </div>);
};
