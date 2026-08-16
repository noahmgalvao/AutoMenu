import React from 'react';
import { GripVertical } from 'lucide-react';
import { selectionLayerClasses } from './selectionLayers';

interface ColumnResizeHandlesProps {
    columnIndex: number;
    columnCount: number;
    onResizeStart?: (event: React.PointerEvent<HTMLElement>, edge: 'left' | 'right') => void;
}

export const ColumnResizeHandles: React.FC<ColumnResizeHandlesProps> = ({
    columnIndex,
    columnCount,
    onResizeStart,
}) => {
    if (!onResizeStart || columnCount < 2) return null;

    const renderHandle = (edge: 'left' | 'right') => {
        const enabled = edge === 'left' ? columnIndex > 0 : columnIndex < columnCount - 1;
        if (!enabled) return null;

        return (
            <button
                type="button"
                data-drag-ignore="true"
                data-print-control="true"
                data-responsive-control-obstacle="true"
                className={`absolute ${edge === 'left' ? '-left-3' : '-right-3'} top-1/2 -translate-y-1/2 h-16 w-6 rounded-full border-2 border-rose-500 bg-white text-rose-600 shadow-lg cursor-col-resize pointer-events-auto ${selectionLayerClasses.controls} hover:scale-105 transition-transform flex items-center justify-center`}
                onPointerDown={(event) => onResizeStart(event, edge)}
                title={`Ajustar largura da coluna pela borda ${edge === 'left' ? 'esquerda' : 'direita'}`}
            >
                <GripVertical size={16} />
            </button>
        );
    };

    return (
        <>
            {renderHandle('left')}
            {renderHandle('right')}
        </>
    );
};
