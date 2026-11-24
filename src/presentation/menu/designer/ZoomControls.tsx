import { HoldStepButton } from '../../common/HoldStepButton';

import React from 'react';
import { Monitor, ZoomIn, ZoomOut } from 'lucide-react';

interface ZoomControlsProps {
    scale: number;
    updateZoom: (delta: number) => void;
    showZoomInfo: boolean;
    onHoldChange: (holding: boolean) => void;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({ scale, updateZoom, showZoomInfo, onHoldChange }) => {
    return (
        <>
        {/* Zoom Indicator */}
        <div className={`absolute top-20 left-0 right-0 z-10 flex justify-center pointer-events-none transition-opacity duration-1000 ${showZoomInfo ? 'opacity-100' : 'opacity-0'}`}>
            <span className="bg-slate-900/80 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-medium shadow-lg flex items-center gap-2">
                <Monitor size={12} /> Live Preview - {scale.toFixed(1)}x
            </span>
        </div>
        
        {/* Zoom Buttons */}
        <div data-canvas-control-obstacle className="absolute top-20 right-4 z-10 hidden gap-2 md:flex">
            <HoldStepButton onHoldChange={onHoldChange} label="Diminuir zoom" onStep={() => updateZoom(-0.1)} disabled={scale <= 0.3}
                className="p-2 bg-white rounded-full shadow-lg hover:bg-slate-50 text-slate-700"><ZoomOut size={16} /></HoldStepButton>
            <HoldStepButton onHoldChange={onHoldChange} label="Aumentar zoom" onStep={() => updateZoom(0.1)} disabled={scale >= 2.5}
                className="p-2 bg-white rounded-full shadow-lg hover:bg-slate-50 text-slate-700"><ZoomIn size={16} /></HoldStepButton>
        </div>
        </>
    );
};
