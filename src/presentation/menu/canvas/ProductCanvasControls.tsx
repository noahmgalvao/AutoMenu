import { triggerLimitFeedback } from './textFit';
import { type FlowDirection, getDirectionLabel } from './flowControls';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, Edit3, CopyCheck, MoreHorizontal, Trash2 } from 'lucide-react';
import type { Product, MenuStyle } from '../../../domain/menu/model';
import React from 'react';
import { resolveMinimumFontSize, resolveFontSizeLimits } from '../../../domain/menu/styleRules';
import type { MoveDirection } from '../interactions/types';
import { canvasActionButtonClass, CanvasActionGroup, CanvasFlowActions } from './CanvasControls';
import { selectionLayerClasses } from './selectionLayers';

const DirectionIcon = ({ direction, size, className }: { direction: FlowDirection; size: number; className?: string }) => {
    if (direction === 'left') return <ChevronLeft size={size} className={className} />;
    if (direction === 'right') return <ChevronRight size={size} className={className} />;
    if (direction === 'bottom') return <ChevronDown size={size} className={className} />;
    return <ChevronUp size={size} className={className} />;
};

const getRenderedScale = (element: HTMLElement) => {
    const page = element.closest<HTMLElement>('[data-menu-print-page="true"]');
    const rect = page?.getBoundingClientRect();
    return page && rect?.width ? rect.width / Math.max(1, page.offsetWidth) : 1;
};

export const getFreeTextMaximumWidth = (element: HTMLElement) => {
    const scale = getRenderedScale(element);
    if (element.closest('[data-page-positioned-text="true"]')) {
        const page = element.closest('[data-menu-print-page="true"]');
        if (page) return (page.getBoundingClientRect().right - element.getBoundingClientRect().left) / scale;
    }
    const column = element.closest('[data-drag-column-container="category"]');
    return (column || element).getBoundingClientRect().width / scale;
};

export const getFreeTextContentWidth = (element: HTMLElement, maximumWidth: number) => {
    const computed = window.getComputedStyle(element);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return Math.min(maximumWidth, Math.max(36, element.scrollWidth + 8));
    context.font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
    const letterSpacing = Number.parseFloat(computed.letterSpacing) || 0;
    const lines = element.innerText.split('\n');
    const textWidth = Math.max(0, ...lines.map((line) => context.measureText(line || ' ').width + Math.max(0, line.length - 1) * letterSpacing));
    return Math.min(maximumWidth, Math.max(36, Math.ceil(textWidth + 8)));
};

export const FreeTextResizeHandles = ({ product, style, handlers }: { product: Product; style: MenuStyle; handlers: any }) => {
    const startResize = (event: React.PointerEvent<HTMLButtonElement>, horizontalDirection: -1 | 1, verticalDirection: -1 | 1) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        const container = event.currentTarget.closest<HTMLElement>('[data-menu-border-surface="freeText"]');
        const text = container?.querySelector<HTMLElement>('[data-product-edit-id]');
        if (!container || !text) return;
        const scale = getRenderedScale(container);
        const resizeHandle = event.currentTarget;
        const startX = event.clientX;
        const startY = event.clientY;
        const startWidth = container.getBoundingClientRect().width / scale;
        const startFontSize = Number(product.styles?.fontSize) || Number.parseFloat(window.getComputedStyle(text).fontSize) / scale || 18;
        const maxWidth = getFreeTextMaximumWidth(container);
        const minimumFontSize = resolveMinimumFontSize(style);
        const maximumFontSize = resolveFontSizeLimits(style).freeText;
        let nextWidth = startWidth;
        let nextFontSize = startFontSize;

        const handleMove = (moveEvent: PointerEvent) => {
            if (moveEvent.cancelable) moveEvent.preventDefault();
            moveEvent.stopPropagation();
            const horizontalDelta = ((moveEvent.clientX - startX) * horizontalDirection) / scale;
            const verticalDelta = ((moveEvent.clientY - startY) * verticalDirection) / scale;
            const resizeDelta = Math.abs(horizontalDelta) >= Math.abs(verticalDelta) ? horizontalDelta : verticalDelta;
            nextWidth = Math.max(36, Math.min(maxWidth, Math.round(startWidth + resizeDelta)));
            const factor = nextWidth / Math.max(1, startWidth);
            const requestedSize = Math.round(startFontSize * factor * 10) / 10;
            nextFontSize = Math.max(minimumFontSize, Math.min(maximumFontSize, requestedSize));
            if ((requestedSize !== nextFontSize || startWidth + resizeDelta > maxWidth + .5 || startWidth + resizeDelta < 35.5)
                && !resizeHandle.classList.contains('automenu-limit-feedback')) triggerLimitFeedback(resizeHandle);
            container.style.width = `${nextWidth}px`;
            text.style.fontSize = `${nextFontSize}px`;
        };
        const handleEnd = () => {
            window.removeEventListener('pointermove', handleMove, true);
            window.removeEventListener('pointerup', handleEnd, true);
            window.removeEventListener('pointercancel', handleEnd, true);
            const updates = [
                { id: product.id, field: 'freeTextWidth' as keyof Product, value: nextWidth },
                { id: product.id, field: 'styles' as keyof Product, value: { ...(product.styles || {}), fontSize: nextFontSize } },
            ];
            if (handlers.updateProducts) handlers.updateProducts(updates);
            else updates.forEach((update) => handlers.updateProduct?.(update.id, update.field, update.value));
        };
        window.addEventListener('pointermove', handleMove, { capture: true, passive: false });
        window.addEventListener('pointerup', handleEnd, true);
        window.addEventListener('pointercancel', handleEnd, true);
    };

    return <>
        {([[-1, -1, '-left-1.5 -top-1.5 cursor-nwse-resize'], [1, -1, '-right-1.5 -top-1.5 cursor-nesw-resize'], [-1, 1, '-bottom-1.5 -left-1.5 cursor-nesw-resize'], [1, 1, '-bottom-1.5 -right-1.5 cursor-nwse-resize']] as const).map(([x, y, position]) => (
            <button
                key={`${x}:${y}`}
                type="button"
                data-drag-ignore="true"
                data-free-text-resize-handle="true"
                aria-label="Redimensionar texto"
                title="Arraste para redimensionar"
                className={`absolute z-[75] h-3 w-3 touch-none rounded-[3px] border border-white bg-indigo-500 shadow-sm ${position}`}
                onPointerDown={(event) => startResize(event, x, y)}
            />
        ))}
    </>;
};

interface ProductControlsProps {
    type: 'product' | 'category';
    id?: string;
    catName: string;
    canMoveUp: boolean;
    canMoveDown: boolean;
    canMoveLeft?: boolean;
    canMoveRight?: boolean;
    isFreeText?: boolean;
    handlers: any;
    isDragging?: boolean;
    showSelectionOutline?: boolean;
    outlineOnly?: boolean;
    showAddControls?: boolean;
    showTopAddControl?: boolean;
    showBottomAddControl?: boolean;
    showGridMoveControls?: boolean;
}

export const ProductControls = ({
    type, id, catName, canMoveUp, canMoveDown, canMoveLeft, canMoveRight, isFreeText, handlers,
    isDragging, showSelectionOutline = true, outlineOnly = false, showAddControls = true, showTopAddControl = true,
    showBottomAddControl = true, showGridMoveControls,
}: ProductControlsProps) => {
    const selectionType = type === 'category' ? 'category' : isFreeText ? 'freeText' : 'product';
    const selectionId = id || catName;
    const editLabel = type === 'category' ? 'Editar categoria' : isFreeText ? 'Editar texto' : 'Editar produto';
    const isSelected = handlers.isSelected?.(selectionType, selectionId) ?? handlers.selectedId === selectionId;
    const isActive = isSelected && ((handlers.selectedItems?.length || 0) <= 1 || handlers.selectedId === selectionId);
    const flow = handlers.getFlowControlDirections?.(selectionType, selectionId) || { before: 'top', after: 'bottom' };
    const addFlow = isActive && showAddControls ? handlers.getAddControlDirections?.(selectionType, selectionId) || flow : flow;
    const [limitReached, setLimitReached] = React.useState(false);

    React.useEffect(() => {
        let timeout: number | undefined;
        const showLimit = (event: Event) => {
            if ((event as CustomEvent<{ category: string }>).detail.category !== catName) return;
            setLimitReached(true);
            window.clearTimeout(timeout);
            timeout = window.setTimeout(() => setLimitReached(false), 800);
        };
        window.addEventListener('menu-category-limit-reached', showLimit);
        return () => {
            window.removeEventListener('menu-category-limit-reached', showLimit);
            window.clearTimeout(timeout);
        };
    }, [catName]);

    const isDragged = handlers.isCanvasObjectDragging?.(selectionType, selectionId);
    const outline = showSelectionOutline && (isSelected || isDragged)
        ? <div data-canvas-selection-outline className={`pointer-events-none absolute inset-0 rounded-lg border-2 border-indigo-500 ${selectionLayerClasses.outline}`} />
        : null;
    if (isDragging) return isDragged ? outline : null;
    if (outlineOnly) return outline;

    const renderMove = (direction: MoveDirection, edge: FlowDirection) => (
        <button key={direction} type="button"
            className={canvasActionButtonClass}
            onClick={event => handlers.handleGlobalMove(event, type, selectionId, catName, direction)}
            title={`Mover ${getDirectionLabel(edge)}`}>
            <DirectionIcon size={19} direction={edge} />
        </button>
    );
    const renderAdd = (position: 'before' | 'after', direction: FlowDirection) => (
        <button type="button" className={`${canvasActionButtonClass} before:!border-indigo-600 !text-white ${limitReached ? 'before:!bg-red-500 animate-shake' : 'before:!bg-indigo-600 hover:before:!bg-indigo-700'}`}
            onClick={event => handlers.handleAddClick?.(event, catName, type === 'category', position, id)}
            title={`${type === 'category' ? 'Adicionar categoria' : 'Adicionar item'} ${getDirectionLabel(direction)}`}>
            <Plus size={20} />
        </button>
    );
    const moves: { direction: MoveDirection; edge: FlowDirection; enabled?: boolean }[] = showGridMoveControls
        ? [
            { direction: 'up', edge: 'top', enabled: canMoveUp },
            { direction: 'down', edge: 'bottom', enabled: canMoveDown },
            { direction: 'left', edge: 'left', enabled: canMoveLeft },
            { direction: 'right', edge: 'right', enabled: canMoveRight },
        ]
        : [
            { direction: 'up', edge: flow.before, enabled: canMoveUp },
            { direction: 'down', edge: flow.after, enabled: canMoveDown },
        ];
    const enabledMoves = moves.filter(move => move.enabled);
    const up = enabledMoves.find(move => move.edge === 'top');
    const down = enabledMoves.find(move => move.edge === 'bottom');
    const showFlowActions = isActive && !handlers.editingId && !handlers.multiSelectMode;
    const showInsertion = !isFreeText && showAddControls;

    return (
        <>
            {outline}
            {showFlowActions && !isFreeText && (
                <CanvasFlowActions
                    before={showInsertion && showTopAddControl && renderAdd('before', addFlow.before)}
                    up={up && renderMove(up.direction, up.edge)}
                    down={down && renderMove(down.direction, down.edge)}
                    after={showInsertion && showBottomAddControl && renderAdd('after', addFlow.after)}
                />
            )}
            {!handlers.editingId && (!isSelected || isActive) && (
                <CanvasActionGroup direction="top" kind="quick" hoverOnly={!isActive}>
                    <button type="button" className={canvasActionButtonClass}
                        aria-hidden={handlers.objectMenuOpen || undefined} tabIndex={handlers.objectMenuOpen ? -1 : undefined}
                        title={editLabel}
                        onClick={event => handlers.startEditing(event, selectionId, type === 'category' ? `text-${selectionId}` : `product-name-${selectionId}`)}>
                        <Edit3 size={19} />
                    </button>
                    <button type="button" className={`${canvasActionButtonClass} ${handlers.multiSelectMode ? 'before:!border-indigo-500 before:!bg-indigo-50 !text-indigo-600' : ''}`}
                        onClick={() => handlers.setMultiSelectMode?.(!handlers.multiSelectMode)}
                        aria-pressed={Boolean(handlers.multiSelectMode)} title="Seleção múltipla">
                        <CopyCheck size={19} />
                    </button>
                    <button type="button" className={`${canvasActionButtonClass} !text-red-600 hover:before:!border-red-300 hover:before:!bg-red-50`}
                        aria-hidden={handlers.objectMenuOpen || undefined} tabIndex={handlers.objectMenuOpen ? -1 : undefined}
                        onClick={() => handlers.removeCanvasObject?.({ type: selectionType, id: selectionId })} title="Remover">
                        <Trash2 size={19} />
                    </button>
                    <button type="button" data-open-object-menu="true" data-object-menu-type={selectionType} data-object-menu-id={selectionId} className={canvasActionButtonClass}
                        onClick={event => handlers.openObjectMenu?.(event, { type: selectionType, id: selectionId })} title="Mais opções">
                        <MoreHorizontal size={20} />
                    </button>
                </CanvasActionGroup>
            )}
            {showFlowActions && enabledMoves.filter(move => isFreeText || move.edge === 'left' || move.edge === 'right').map(({ direction, edge }) => (
                <CanvasActionGroup key={direction} direction={edge} kind="move">
                    {renderMove(direction, edge)}
                </CanvasActionGroup>
            ))}
        </>
    );
};
