import React from 'react';
import { GripVertical } from 'lucide-react';
import { CanvasActionGroup, canvasActionButtonClass } from './CanvasControls';

interface ColumnResizeHandlesProps {
    columnIndex: number;
    columnCount: number;
    onResizeStart?: (event: React.PointerEvent<HTMLElement>, edge: 'left' | 'right', anchor: HTMLElement) => void;
}

export const ColumnResizeHandles: React.FC<ColumnResizeHandlesProps> = ({
    columnIndex,
    columnCount,
    onResizeStart,
}) => {
    const anchorRef = React.useRef<HTMLSpanElement>(null);
    if (!onResizeStart || columnCount < 2) return null;

    const renderHandle = (edge: 'left' | 'right') => {
        const enabled = edge === 'left' ? columnIndex > 0 : columnIndex < columnCount - 1;
        if (!enabled) return null;

        return (
            <CanvasActionGroup direction={edge} kind="resize">
                <button type="button" data-column-resize-handle="true"
                    className={`${canvasActionButtonClass} touch-none cursor-col-resize before:!border-rose-300 !text-rose-600 hover:before:!bg-rose-50`}
                    onPointerDown={(event) => { if (anchorRef.current) onResizeStart(event, edge, anchorRef.current); }}
                    title={`Ajustar largura da coluna pela borda ${edge === 'left' ? 'esquerda' : 'direita'}`}>
                    <GripVertical size={19} />
                </button>
            </CanvasActionGroup>
        );
    };

    return (
        <>
            <span hidden ref={anchorRef} />
            {renderHandle('left')}
            {renderHandle('right')}
        </>
    );
};
