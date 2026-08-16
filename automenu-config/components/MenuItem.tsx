import React from 'react';
import { Product, MenuStyle } from '../types';
import { MoreHorizontal, Plus, Trash2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Edit3, EyeOff, ListChecks } from 'lucide-react';
import { A4_HEIGHT_PX, FREE_TEXT_PREFIX } from '../utils/menuPagination';
import { isPristineNewCategory, isPristineNewProduct } from '../utils/pristineItems';
import { selectionLayerClasses } from './selectionLayers';
import { getDirectionLabel, getEdgeControlClass, type FlowDirection } from '../utils/flowControls';
import { InlineStyleToolbar } from './MenuDesigner/InlineStyleToolbar';
import type { MoveDirection } from '../hooks/interactions/types';
import { clampFontSize, resolveFontSizeLimits, resolveMenuContentSpacing, resolveMinimumFontSize } from '../utils/styleRules';
import { ColumnResizeHandles } from './ColumnResizeHandles';
import { AutoFitText } from './AutoFitText';

interface MenuItemProps {
    item: any;
    idx: number;
    style: MenuStyle;
    handlers: any; // Return type of useMenuInteractions
    products: Product[];
    inGroup: boolean;
    columnIndex?: number;
    categoryColumnCount?: number;
}

const DirectionIcon = ({ direction, size, className }: { direction: FlowDirection; size: number; className?: string }) => {
    if (direction === 'left') return <ChevronLeft size={size} className={className} />;
    if (direction === 'right') return <ChevronRight size={size} className={className} />;
    if (direction === 'bottom') return <ChevronDown size={size} className={className} />;
    return <ChevronUp size={size} className={className} />;
};

const moveDirectionToFlowDirection: Record<MoveDirection, FlowDirection> = {
    up: 'top',
    down: 'bottom',
    left: 'left',
    right: 'right',
};

const handleMobileFocusScroll = (element: HTMLElement) => {
    if (window.matchMedia('(min-width: 768px)').matches) return;
    window.setTimeout(() => {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
};

const clearDefaultTextOnFocus = (element: HTMLElement, defaultTexts: string[]) => {
    window.setTimeout(() => {
        if (document.activeElement !== element) return;
        const text = element.innerText.trim();
        if (defaultTexts.includes(text)) {
            element.innerText = '';
        }
    }, 0);
};

const rectanglesOverlap = (left: DOMRect, right: DOMRect, gap: number = 3) => (
    left.left < right.right + gap &&
    left.right > right.left - gap &&
    left.top < right.bottom + gap &&
    left.bottom > right.top - gap
);

type ResponsiveControlAxis = 'x' | 'y';

interface ResponsiveControlCoordinator {
    users: number;
    schedule: () => void;
    dispose: () => void;
}

const responsiveControlCoordinators = new WeakMap<HTMLElement, ResponsiveControlCoordinator>();

const getResponsiveControlAxis = (direction: FlowDirection): ResponsiveControlAxis => (
    direction === 'top' || direction === 'bottom' ? 'x' : 'y'
);

const getResponsiveControlShift = (control: HTMLElement, axis: ResponsiveControlAxis) => {
    const value = Number(
        axis === 'x'
            ? control.dataset.responsiveShiftX
            : control.dataset.responsiveShiftY
    );
    return Number.isFinite(value) ? value : 0;
};

const getUnshiftedControlRect = (control: HTMLElement) => {
    const rect = control.getBoundingClientRect();
    const shiftX = getResponsiveControlShift(control, 'x');
    const shiftY = getResponsiveControlShift(control, 'y');
    return DOMRect.fromRect({
        x: rect.left - shiftX,
        y: rect.top - shiftY,
        width: rect.width,
        height: rect.height,
    });
};

const shiftControlRect = (rect: DOMRect, axis: ResponsiveControlAxis, shift: number) => (
    DOMRect.fromRect({
        x: rect.left + (axis === 'x' ? shift : 0),
        y: rect.top + (axis === 'y' ? shift : 0),
        width: rect.width,
        height: rect.height,
    })
);

const setResponsiveControlShift = (
    control: HTMLElement,
    axis: ResponsiveControlAxis,
    shift: number,
) => {
    const roundedShift = Math.round(shift * 10) / 10;
    const shiftX = axis === 'x' ? roundedShift : 0;
    const shiftY = axis === 'y' ? roundedShift : 0;
    control.dataset.responsiveShiftX = String(shiftX);
    control.dataset.responsiveShiftY = String(shiftY);
    control.style.translate = `${shiftX}px ${shiftY}px`;
};

const clearResponsiveControlShift = (control: HTMLElement) => {
    delete control.dataset.responsiveShiftX;
    delete control.dataset.responsiveShiftY;
    control.style.removeProperty('translate');
};

const registerResponsiveControl = (root: HTMLElement) => {
    let coordinator = responsiveControlCoordinators.get(root);

    if (!coordinator) {
        let animationFrame: number | null = null;
        let disposed = false;
        const observedElements = new Set<Element>();
        const resizeObserver = new ResizeObserver(() => schedule());

        const observeCurrentElements = () => {
            [
                root,
                ...Array.from(root.querySelectorAll<HTMLElement>(
                    '[data-responsive-edge-control="true"], [data-responsive-control-obstacle="true"]'
                )),
            ].forEach((element) => {
                if (observedElements.has(element)) return;
                observedElements.add(element);
                resizeObserver.observe(element);
            });
        };

        const reposition = () => {
            animationFrame = null;
            if (disposed || !root.isConnected) return;

            observeCurrentElements();
            const controls = Array.from(
                root.querySelectorAll<HTMLButtonElement>('[data-responsive-edge-control="true"]')
            ).filter((control) => (
                control.getClientRects().length > 0
                && control.closest<HTMLElement>('[data-category-chunk], .automenu-drag-item') === root
            ));
            if (controls.length === 0) return;

            const page = root.closest<HTMLElement>('[data-menu-print-page="true"]');
            const bounds = page?.getBoundingClientRect() || root.getBoundingClientRect();
            const occupiedRects = Array.from(
                root.querySelectorAll<HTMLButtonElement>('[data-responsive-control-obstacle="true"]')
            )
                .filter((candidate) => (
                    candidate.getClientRects().length > 0
                    && candidate.closest<HTMLElement>('[data-category-chunk], .automenu-drag-item') === root
                ))
                .map((candidate) => candidate.getBoundingClientRect());
            const groups = new Map<string, { axis: ResponsiveControlAxis; controls: HTMLButtonElement[] }>();

            controls.forEach((control) => {
                const direction = control.dataset.responsiveFlowDirection as FlowDirection;
                const axis = getResponsiveControlAxis(direction);
                const key = `${control.dataset.responsiveControlGroup || 'move'}:${axis}`;
                const group = groups.get(key) || { axis, controls: [] };
                group.controls.push(control);
                groups.set(key, group);
            });

            [...groups.entries()]
                .sort(([left], [right]) => left.localeCompare(right))
                .forEach(([, group]) => {
                    const baseRects = group.controls.map(getUnshiftedControlRect);
                    const currentShift = getResponsiveControlShift(group.controls[0], group.axis);
                    const isValidShift = (shift: number) => baseRects.every((baseRect) => {
                        const candidate = shiftControlRect(baseRect, group.axis, shift);
                        const insidePage = group.axis === 'x'
                            ? candidate.left >= bounds.left && candidate.right <= bounds.right
                            : candidate.top >= bounds.top && candidate.bottom <= bounds.bottom;
                        return insidePage
                            && !occupiedRects.some((obstacle) => rectanglesOverlap(candidate, obstacle));
                    });

                    let resolvedShift = 0;
                    if (!isValidShift(0)) {
                        if (currentShift !== 0 && isValidShift(currentShift)) {
                            resolvedShift = currentShift;
                        } else {
                            const candidates = new Set<number>();
                            occupiedRects.forEach((obstacle) => {
                                baseRects.forEach((baseRect) => {
                                    if (group.axis === 'x') {
                                        candidates.add(obstacle.left - 4 - baseRect.right);
                                        candidates.add(obstacle.right + 4 - baseRect.left);
                                    } else {
                                        candidates.add(obstacle.top - 4 - baseRect.bottom);
                                        candidates.add(obstacle.bottom + 4 - baseRect.top);
                                    }
                                });
                            });
                            resolvedShift = [...candidates]
                                .filter(isValidShift)
                                .sort((left, right) => Math.abs(left) - Math.abs(right))[0] ?? currentShift;
                        }
                    }

                    group.controls.forEach((control) => {
                        setResponsiveControlShift(control, group.axis, resolvedShift);
                    });
                    baseRects.forEach((baseRect) => {
                        occupiedRects.push(shiftControlRect(baseRect, group.axis, resolvedShift));
                    });
                });
        };

        function schedule() {
            if (disposed || animationFrame !== null) return;
            animationFrame = window.requestAnimationFrame(reposition);
        }

        coordinator = {
            users: 0,
            schedule,
            dispose: () => {
                disposed = true;
                if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
                resizeObserver.disconnect();
                responsiveControlCoordinators.delete(root);
            },
        };
        responsiveControlCoordinators.set(root, coordinator);
        reposition();
    }

    coordinator.users += 1;
    coordinator.schedule();
    return () => {
        const current = responsiveControlCoordinators.get(root);
        if (!current) return;
        current.users -= 1;
        if (current.users <= 0) current.dispose();
        else current.schedule();
    };
};

export const ResponsiveMoveButton: React.FC<
    React.ButtonHTMLAttributes<HTMLButtonElement> & { flowDirection: FlowDirection; controlGroup?: string }
> = ({ flowDirection, controlGroup = 'move', children, ...buttonProps }) => {
    const buttonRef = React.useRef<HTMLButtonElement>(null);

    React.useLayoutEffect(() => {
        const button = buttonRef.current;
        const root = button?.closest<HTMLElement>('[data-category-chunk], .automenu-drag-item');
        if (!button || !root) return;
        const unregister = registerResponsiveControl(root);
        return () => {
            unregister();
            clearResponsiveControlShift(button);
        };
    }, [controlGroup, flowDirection]);

    return (
        <button
            ref={buttonRef}
            type="button"
            data-responsive-edge-control="true"
            data-responsive-control-group={controlGroup}
            data-responsive-flow-direction={flowDirection}
            {...buttonProps}
        >
            {children}
        </button>
    );
};

const ProductControls = ({ type, id, catName, isMobileSelected, canMoveUp, canMoveDown, canMoveLeft, canMoveRight, hideGeneralControls, isFreeText, isPristineNewDefault, handlers, onEdit, isDragging = false, showSelectionOutline = true, showAddControls = true, showTopAddControl = true, showBottomAddControl = true, compactControls = false, mobileExpandedControls = false, denseControls = false, containMobileControls = false, showGridMoveControls = false }: any) => {
    const selectionType = type === 'category' ? 'category' : isFreeText ? 'freeText' : 'product';
    const selectionId = type === 'category' ? catName : id;
    const isSelected = handlers.isSelected?.(selectionType, selectionId) ?? handlers.selectedId === selectionId;
    const pointerEventsClass = isMobileSelected ? 'pointer-events-auto' : 'pointer-events-none md:group-hover:pointer-events-auto';
    const usesDeleteAction = isFreeText || isPristineNewDefault;
    const flowDirections = handlers.getFlowControlDirections?.(selectionType, selectionId) || { before: 'top', after: 'bottom' };
    const controlPadding = denseControls ? 'p-0.5' : compactControls ? (mobileExpandedControls ? 'p-2.5 md:p-1.5' : 'p-1.5') : 'p-2.5';
    const movePadding = denseControls ? 'p-0.5' : compactControls ? (mobileExpandedControls ? 'p-2 md:p-1.5' : 'p-1.5') : 'p-2';
    const iconSize = denseControls ? 12 : compactControls ? 15 : 24;
    const iconClass = compactControls && mobileExpandedControls && !denseControls ? 'h-6 w-6 md:h-[15px] md:w-[15px]' : undefined;
    const generalControlsPosition = compactControls && containMobileControls
        ? 'top-1 right-1'
        : compactControls
            ? 'top-[-38px] right-0'
            : 'top-[-10px] right-[-10px]';
    
    let effectiveHideGeneralControls = hideGeneralControls;
    if (handlers.multiSelectMode && handlers.selectedItems && handlers.selectedItems.length > 1) {
        const firstItem = handlers.selectedItems[0];
        const isFirst = firstItem.type === selectionType && firstItem.id === selectionId;
        if (!isFirst) {
            effectiveHideGeneralControls = true;
        }
    }
    const showMoveControls = !effectiveHideGeneralControls || (isFreeText && isSelected);
    
    const [shakingCategory, setShakingCategory] = React.useState<string | null>(null);

    React.useEffect(() => {
        const handleLimitReached = (e: Event) => {
            const customEvent = e as CustomEvent<{ category: string }>;
            setShakingCategory(customEvent.detail.category);
            setTimeout(() => setShakingCategory(null), 800);
        };
        window.addEventListener('menu-category-limit-reached', handleLimitReached);
        return () => window.removeEventListener('menu-category-limit-reached', handleLimitReached);
    }, []);

    const isLimitReached = shakingCategory === catName;
    const addControlClass = isLimitReached ? 'bg-red-500 animate-shake shadow-[0_0_10px_rgba(239,68,68,0.8)]' : 'bg-indigo-600 shadow-md hover:scale-110 hover:bg-indigo-700';
    const renderMoveButton = (direction: MoveDirection, enabled: boolean) => {
        if (!enabled) return null;

        const flowDirection = moveDirectionToFlowDirection[direction];

        return (
            <ResponsiveMoveButton
                flowDirection={flowDirection}
                controlGroup="move"
                onClick={(e) => handlers.handleGlobalMove(e, type, id || catName, catName, direction)}
                className={`absolute ${getEdgeControlClass(flowDirection, 'leading')} ${movePadding} ${pointerEventsClass} bg-white border border-slate-200 shadow-sm rounded-full text-slate-500 hover:text-indigo-600 hover:bg-slate-50 transition-all cursor-pointer`}
                onPointerDown={(e) => e.stopPropagation()}
                title={`Mover ${getDirectionLabel(flowDirection)}`}
            >
                <DirectionIcon direction={flowDirection} size={iconSize} className={iconClass} />
            </ResponsiveMoveButton>
        );
    };

    return (
    <>
        {isSelected && showSelectionOutline && (
             <div className={`absolute inset-0 border-2 border-indigo-500 rounded-lg pointer-events-none ${selectionLayerClasses.outline}`} />
        )}

        {isSelected && !isDragging && !isFreeText && showAddControls && (
            <>
                {showTopAddControl && (
                    <ResponsiveMoveButton
                        flowDirection={flowDirections.before}
                        controlGroup="add"
                        className={`absolute ${getEdgeControlClass(flowDirections.before)} text-white p-1 rounded-full ${selectionLayerClasses.controls} transition-transform cursor-pointer ${addControlClass}`}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={(e) => handlers.handleAddClick?.(e, catName, type === 'category', 'before', id)}
                        title={`${type === 'category' ? 'Adicionar categoria' : 'Adicionar item'} ${getDirectionLabel(flowDirections.before)}`}
                    >
                        <Plus size={12}/>
                    </ResponsiveMoveButton>
                )}
                {showBottomAddControl && (
                    <ResponsiveMoveButton
                        flowDirection={flowDirections.after}
                        controlGroup="add"
                        className={`absolute ${getEdgeControlClass(flowDirections.after)} text-white p-1 rounded-full ${selectionLayerClasses.controls} transition-transform cursor-pointer ${addControlClass}`}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={(e) => handlers.handleAddClick?.(e, catName, type === 'category', 'after', id)}
                        title={`${type === 'category' ? 'Adicionar categoria' : 'Adicionar item'} ${getDirectionLabel(flowDirections.after)}`}
                    >
                        <Plus size={12}/>
                    </ResponsiveMoveButton>
                )}
            </>
        )}

        {!isDragging && !handlers.editingId && <div className={`absolute inset-0 pointer-events-none ${selectionLayerClasses.controls} transition-opacity duration-200 ${isMobileSelected ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'}`}>
           {!effectiveHideGeneralControls && (
               <div className={`absolute ${generalControlsPosition} ${pointerEventsClass} flex max-w-[calc(100%_-_0.5rem)] flex-wrap justify-end gap-1 ${selectionLayerClasses.controls}`}>
                    {onEdit && (
                        <button
                            onClick={onEdit}
                            className={`${controlPadding} bg-white border border-slate-200 shadow-md rounded-full text-slate-500 hover:text-indigo-600 hover:bg-slate-50 hover:scale-110 transition-transform cursor-pointer`}
                            title="Editar produto"
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <Edit3 size={iconSize} className={iconClass} />
                        </button>
                    )}
                    <button
                        className={`${controlPadding} bg-white border shadow-md rounded-full hover:scale-110 transition-transform cursor-pointer pointer-events-auto ${handlers.multiSelectMode ? 'border-indigo-500 text-indigo-600 bg-indigo-50' : 'border-slate-200 text-slate-500'}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); handlers.setMultiSelectMode?.(!handlers.multiSelectMode); }}
                        title="Seleção múltipla"
                    >
                        <ListChecks size={iconSize} className={iconClass} />
                    </button>
                    <button 
                        onClick={(e) => handlers.handleRemove(e, id || catName, type)} 
                        className={`${controlPadding} bg-white border border-slate-200 shadow-md rounded-full ${usesDeleteAction ? 'text-red-500 hover:bg-red-50' : 'text-slate-400 hover:text-red-500 hover:bg-slate-50'} hover:scale-110 transition-transform cursor-pointer`}
                        title={usesDeleteAction ? "Excluir item" : "Ocultar item"}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        {usesDeleteAction ? <Trash2 size={iconSize} className={iconClass} /> : <EyeOff size={iconSize} className={iconClass} />}
                    </button>
                    <button
                        onClick={(e) => handlers.openObjectMenu?.(e, { type: selectionType, id: selectionId })}
                        className={`${controlPadding} bg-white border border-slate-200 shadow-md rounded-full text-slate-500 hover:text-indigo-600 hover:bg-slate-50 hover:scale-110 transition-transform cursor-pointer`}
                        title="Mais opções"
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <MoreHorizontal size={iconSize} className={iconClass} />
                    </button>
               </div>
           )}
          {showMoveControls && (
              <>
                  {showGridMoveControls ? (
                    <>
                        {renderMoveButton('up', canMoveUp)}
                        {renderMoveButton('down', canMoveDown)}
                        {renderMoveButton('left', canMoveLeft ?? canMoveUp)}
                        {renderMoveButton('right', canMoveRight ?? canMoveDown)}
                    </>
                  ) : (
                    <>
                    {canMoveUp && (
                    <ResponsiveMoveButton
                        flowDirection={flowDirections.before}
                        controlGroup="move"
                        onClick={(e) => handlers.handleGlobalMove(e, type, id || catName, catName, 'up')}
                        className={`absolute ${getEdgeControlClass(flowDirections.before, 'leading')} ${movePadding} ${pointerEventsClass} bg-white border border-slate-200 shadow-sm rounded-full text-slate-500 hover:text-indigo-600 hover:bg-slate-50 transition-all cursor-pointer`}
                        onPointerDown={(e) => e.stopPropagation()}
                        title={`Mover ${getDirectionLabel(flowDirections.before)}`}
                    >
                        <DirectionIcon direction={flowDirections.before} size={iconSize} className={iconClass} />
                    </ResponsiveMoveButton>
                  )}
                  {canMoveDown && (
                    <ResponsiveMoveButton
                        flowDirection={flowDirections.after}
                        controlGroup="move"
                        onClick={(e) => handlers.handleGlobalMove(e, type, id || catName, catName, 'down')}
                        className={`absolute ${getEdgeControlClass(flowDirections.after, 'leading')} ${movePadding} ${pointerEventsClass} bg-white border border-slate-200 shadow-sm rounded-full text-slate-500 hover:text-indigo-600 hover:bg-slate-50 transition-all cursor-pointer`}
                        onPointerDown={(e) => e.stopPropagation()}
                        title={`Mover ${getDirectionLabel(flowDirections.after)}`}
                    >
                        <DirectionIcon direction={flowDirections.after} size={iconSize} className={iconClass} />
                    </ResponsiveMoveButton>
                  )}
                    </>
                  )}
              </>
          )}
        </div>}
    </>
  )};

export const MenuItem: React.FC<MenuItemProps> = ({
    item,
    idx,
    style,
    handlers,
    products,
    inGroup,
    columnIndex = 0,
    categoryColumnCount: renderedCategoryColumnCount,
}) => {
    const formattingTarget = handlers.formattingTarget;
    const fontSizeLimits = resolveFontSizeLimits(style);
    const minimumFontSize = resolveMinimumFontSize(style);
    const allowSameWordBreak = style.allowSameWordBreak === true;
    const contentSpacing = resolveMenuContentSpacing(style);
    const getToolbarFontSizeLimit = (type: string) => {
        if (type === 'menuTitle') return fontSizeLimits.menuTitle;
        if (type === 'menuSubtitle') return fontSizeLimits.menuSubtitle;
        if (type === 'category') return fontSizeLimits.category;
        if (type === 'freeText') return fontSizeLimits.freeText;
        if (type === 'product') {
            if (formattingTarget?.field === 'price') return fontSizeLimits.productPrice;
            if (formattingTarget?.field === 'description') return fontSizeLimits.productDescription;
            return fontSizeLimits.productName;
        }
        return undefined;
    };
    const renderFormattingToolbar = (type: string, id: string, value: any) => (
        formattingTarget?.type === type && formattingTarget?.id === id
            ? <InlineStyleToolbar targetElementId={formattingTarget.elementId} value={value || {}} maxFontSize={getToolbarFontSizeLimit(type)} minFontSize={minimumFontSize} onChange={(newStyle) => handlers.handleInlineStyleChange?.(formattingTarget, newStyle)} onDismiss={() => handlers.setFormattingTarget?.(null)} />
            : null
    );
    
    if (item.type === 'main-header') {
        const titleStyle = style.elementStyles?.menuTitle || {};
        const subStyle = style.elementStyles?.menuSubtitle || {};
        const hasSubtitle = Boolean(style.menuSubtitle?.trim());
        const isTitleSelected = handlers.isSelected?.('menuTitle', 'menuTitle') ?? handlers.selectedId === 'menuTitle';
        const isSubtitleSelected = handlers.isSelected?.('menuSubtitle', 'menuSubtitle') ?? handlers.selectedId === 'menuSubtitle';
        
        return (
            <header 
                key={`header-${idx}`} 
                data-block-id="main-header" 
                className="text-center group relative pointer-events-auto" 
                style={{ marginBottom: 0 }}
            >
            {formattingTarget?.type === 'menuTitle' && renderFormattingToolbar('menuTitle', 'menuTitle', titleStyle)}
            {formattingTarget?.type === 'menuSubtitle' && renderFormattingToolbar('menuSubtitle', 'menuSubtitle', subStyle)}
            <AutoFitText
                as="h1"
                text={style.menuTitle ?? 'MENU'}
                baseFontSize={clampFontSize(style, 'menuTitle', titleStyle.fontSize, 48)}
                minimumFontSize={minimumFontSize}
                allowSameWordBreak={allowSameWordBreak}
                fitScope="menuTitle"
                widthMode="parent"
                showOverflowFeedback
                id="menu-title-text"
                data-menu-heading="title"
                className={`tracking-tight outline-none focus:bg-blue-50/50 rounded cursor-text ${isTitleSelected ? 'ring-2 ring-indigo-500 bg-indigo-50/20' : ''}`}
                style={{ 
                    color: titleStyle.color || style.primaryColor, 
                    fontFamily: titleStyle.fontFamily || style.fontFamily,
                    fontSize: `${clampFontSize(style, 'menuTitle', titleStyle.fontSize, 48)}px`,
                    fontWeight: titleStyle.fontWeight || '700',
                    fontStyle: titleStyle.italic ? 'italic' : 'normal',
                    textDecoration: titleStyle.underline ? 'underline' : 'none',
                    textAlign: titleStyle.textAlign as any,
                    textTransform: titleStyle.textTransform,
                    marginBottom: `${hasSubtitle ? (titleStyle.marginBottom ?? 10) : contentSpacing.headerToContent}px`
                }} 
                onContextMenu={!hasSubtitle ? (event) => handlers.openObjectMenu?.(event, { type: 'menuTitle', id: 'menuTitle' }) : undefined}
                onClick={(e) => {
                    e.stopPropagation();
                    handlers.handleSelection('menuTitle', 'menuTitle', { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey });
                    handlers.setSelectedPageIndex(null);
                }}
                onFocus={() => {
                    handlers.handleSelection('menuTitle', 'menuTitle');
                    handlers.startMenuTextEditing?.('menuTitle', 'menu-title-text');
                }}
                contentEditable suppressContentEditableWarning onBlur={(e) => handlers.handleBlur(e, 'menu', 'header', 'menuTitle')} onKeyDown={handlers.handleKeyDown}
            />
            {hasSubtitle && <AutoFitText
                as="p"
                text={style.menuSubtitle}
                baseFontSize={clampFontSize(style, 'menuSubtitle', subStyle.fontSize, 18)}
                minimumFontSize={minimumFontSize}
                allowSameWordBreak={allowSameWordBreak}
                fitScope="menuSubtitle"
                widthMode="parent"
                showOverflowFeedback
                id="menu-subtitle-text"
                data-menu-heading="subtitle"
                className={`opacity-90 outline-none focus:bg-blue-50/50 rounded cursor-text ${isSubtitleSelected ? 'ring-2 ring-indigo-500 bg-indigo-50/20' : ''}`}
                style={{
                    color: subStyle.color || style.textColor,
                    fontFamily: subStyle.fontFamily || style.fontFamily,
                    fontSize: `${clampFontSize(style, 'menuSubtitle', subStyle.fontSize, 18)}px`,
                    fontWeight: subStyle.fontWeight,
                    fontStyle: subStyle.italic ? 'italic' : 'normal',
                    textDecoration: subStyle.underline ? 'underline' : 'none',
                    textAlign: subStyle.textAlign as any || 'center',
                    textTransform: subStyle.textTransform,
                    letterSpacing: subStyle.letterSpacing ? `${subStyle.letterSpacing}px` : undefined,
                    marginBottom: `${contentSpacing.headerToContent}px`
                }}
                onClick={(e) => {
                    e.stopPropagation();
                    handlers.handleSelection('menuSubtitle', 'menuSubtitle', { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey });
                    handlers.setSelectedPageIndex(null);
                }}
                onFocus={() => {
                    handlers.handleSelection('menuSubtitle', 'menuSubtitle');
                    handlers.startMenuTextEditing?.('menuSubtitle', 'menu-subtitle-text');
                }}
                contentEditable suppressContentEditableWarning onBlur={(e) => handlers.handleBlur(e, 'menu', 'subheader', 'menuSubtitle')} onKeyDown={handlers.handleKeyDown}
            />
            }
            </header>
        );
    }

    if (item.type === 'category-header') {
        const isSelected = handlers.isSelected?.('category', item.data) ?? handlers.selectedId === item.data;
        const catStyle = style.elementStyles?.category || {};
        const elementId = `text-${item.data}`;
        const isPristineNewDefault = isPristineNewCategory(item.data, products);
        const isBeingDragged = handlers.draggedItem?.type === 'category' && handlers.draggedItem?.id === item.data;
        const compactControls = (style.categoryColumnCount || 1) > 1;
        const categoryAlign = catStyle.textAlign || 'left';
        const renderCategoryDivider = (key: string) => (
            <div key={key} className="h-px min-w-0 flex-grow opacity-40" style={{ backgroundColor: style.primaryColor }} />
        );
        
        return (
            <div 
                key={`cat-header-${item.data}`}
                id={`category-header-${item.data}`} 
                data-category-id={item.data} 
                onPointerDown={(e) => handlers.handleDragStart(e, 'category', item.data)}
                onDragStart={(e) => e.preventDefault()}
                className={`automenu-drag-item relative group transition-all duration-200 select-none touch-none cursor-grab pointer-events-auto ${isSelected || handlers.editingId === item.data ? 'z-[60]' : 'z-[1]'} ${inGroup ? 'px-2 pt-2' : 'hover:bg-black/5 rounded-lg'}`}
                style={{ 
                    marginBottom: `${contentSpacing.categoryToProduct}px`
                }}
                onContextMenu={(e) => handlers.openObjectMenu?.(e, { type: 'category', id: item.data })} 
                onClick={(e) => { e.stopPropagation(); if (!handlers.editingId) { handlers.handleSelection('category', item.data, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey }); handlers.setSelectedPageIndex(null); } }}
                onDoubleClick={(e) => e.stopPropagation()}
            >
                <div
                    aria-hidden="true"
                    className={`absolute inset-x-0 hidden md:block pointer-events-auto ${
                        compactControls ? '-top-[38px] h-[46px]' : '-top-3 h-5'
                    }`}
                />
                {renderFormattingToolbar('category', item.data, catStyle)}
                <ProductControls type="category" catName={item.data} isMobileSelected={isSelected} index={idx} total={0} isLastInBlock={false} canMoveUp={false} canMoveDown={false} canMoveLeft={false} canMoveRight={false} hideGeneralControls={false} isPristineNewDefault={isPristineNewDefault} handlers={handlers} onEdit={(e: React.MouseEvent) => handlers.startEditing(e, item.data, elementId, 'category')} isDragging={isBeingDragged} showSelectionOutline={false} showAddControls={false} compactControls={compactControls} showGridMoveControls={false}/>
                <div className={`flex w-full max-w-full min-w-0 items-center gap-0 ${compactControls ? 'px-1' : 'px-2'} ${categoryAlign === 'center' ? 'justify-center' : categoryAlign === 'right' ? 'justify-end' : 'justify-start'}`}>
                    {(categoryAlign === 'center' || categoryAlign === 'right') && renderCategoryDivider('before')}
                    <AutoFitText
                        as="h2"
                        text={item.data}
                        baseFontSize={clampFontSize(style, 'category', catStyle.fontSize, 24)}
                        minimumFontSize={minimumFontSize}
                        allowSameWordBreak={allowSameWordBreak}
                        fitScope="category"
                        widthMode="flex"
                        availableWidthInset={compactControls ? 8 : 16}
                        showOverflowFeedback={handlers.editingId === item.data}
                        id={elementId}
                        className={`min-w-0 max-w-full shrink whitespace-normal break-words [overflow-wrap:anywhere] [word-break:normal] outline-none rounded ${handlers.editingId === item.data ? 'bg-white ring-2 ring-blue-500 z-10 cursor-text px-1' : ''}`}
                        style={{ 
                            color: catStyle.color || style.primaryColor,
                            fontFamily: catStyle.fontFamily,
                            fontSize: `${clampFontSize(style, 'category', catStyle.fontSize, 24)}px`,
                            fontWeight: catStyle.fontWeight,
                            fontStyle: catStyle.italic ? 'italic' : 'normal',
                            textDecoration: catStyle.underline ? 'underline' : 'none',
                            textAlign: catStyle.textAlign,
                            textTransform: catStyle.textTransform,
                            letterSpacing: catStyle.letterSpacing ? `${catStyle.letterSpacing}px` : undefined
                        }}
                        contentEditable={handlers.editingId === item.data} suppressContentEditableWarning onBlur={(e) => handlers.handleBlur(e, 'category', item.data)} onKeyDown={handlers.handleKeyDown} onMouseDown={(e) => { if(handlers.editingId !== item.data) e.preventDefault(); }} onPointerDown={(e) => { if (handlers.editingId === item.data) e.stopPropagation(); }}
                    />
                    {(categoryAlign === 'left' || categoryAlign === 'center') && renderCategoryDivider('after')}
                </div>
            </div>
        );
    }

    if (item.type === 'product-item') {
        const product = item.data as Product;
        const productSelectionType = product.isFreeText ? 'freeText' : 'product';
        const isSelected = handlers.isSelected?.(productSelectionType, product.id) ?? handlers.selectedId === product.id;
        const isEditing = handlers.editingId === product.id;
        const hiddenProductIds = new Set(style.hiddenProductIds || []);
        const visibleCatProducts = (handlers.groupedProducts[item.category] || [])
            .filter((candidate: Product) => !hiddenProductIds.has(candidate.id));
        const pIndex = visibleCatProducts.findIndex((candidate: Product) => candidate.id === product.id);
        const canMoveUp = visibleCatProducts.length > 1 && pIndex > 0;
        const canMoveDown = visibleCatProducts.length > 1 && pIndex >= 0 && pIndex < visibleCatProducts.length - 1;
        
        const isBeingDragged = handlers.draggedItem?.id === product.id;
        const nameStyle = product.isFreeText && product.styles ? product.styles : (style.elementStyles?.productName || {});
        const priceStyle = style.elementStyles?.productPrice || {};
        const descStyle = style.elementStyles?.productDescription || {};
        const isNameCentered = nameStyle.textAlign === 'center';
        const isNameRight = nameStyle.textAlign === 'right';
        const descriptionAlign = descStyle.textAlign || nameStyle.textAlign || 'left';
        
        const imgScale = style.imageScale || 1;
        const categoryColumnCount = style.categoryColumnCount || 1;
        const productColumnCount = style.columnCount || 1;
        const compactControls = categoryColumnCount > 1;
        const stackImage = categoryColumnCount >= 3 && style.showImages && Boolean(product.image);
        const imageSizePx = (categoryColumnCount >= 3 ? 96 : categoryColumnCount === 2 ? 64 : 96) * imgScale;
        const rawCustomMarginTop = Number(product.customMarginTop);
        const isFreeTextGhost = product.isFreeText && item.category?.startsWith(FREE_TEXT_PREFIX);
        const customMarginTop = Number.isFinite(rawCustomMarginTop)
            ? Math.max(0, Math.min(A4_HEIGHT_PX, rawCustomMarginTop))
            : 0;
        const productAddControls = handlers.getSelectionAddControls?.(productSelectionType, product.id) || { top: true, bottom: true };
        const isPristineNewDefault = isPristineNewProduct(product);
        return (
                <div 
                    key={product.id}
                    id={`product-container-${product.id}`} 
                    data-drag-scope={handlers.dragScope}
                    data-drag-type="product"
                    data-drag-id={product.id}
                    data-drag-group={item.category}
                    onPointerDown={(e) => handlers.handleDragStart(e, 'product', product.id, item.category)}
                    onDragStart={(e) => e.preventDefault()}
                    onContextMenu={(e) => handlers.openObjectMenu?.(e, { type: productSelectionType, id: product.id })} 
                    onClick={(e) => { e.stopPropagation(); if (!handlers.editingId) { handlers.handleSelection(productSelectionType, product.id, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey }); handlers.setSelectedPageIndex(null); } }}
                    onDoubleClick={(e) => e.stopPropagation()} 
                    className={`automenu-drag-item relative group rounded-lg transition-all duration-200 pointer-events-auto ${isSelected && compactControls && !isEditing ? 'px-2 pb-2 pt-12 md:p-2' : 'p-2'} ${isEditing ? 'select-text touch-auto cursor-text' : 'select-none touch-none cursor-grab'} ${isSelected || isEditing ? 'z-[60]' : 'z-[1]'} ${inGroup ? 'ml-0 mb-0' : '-ml-2 mb-2 hover:bg-black/5'} ${isSelected && !isEditing ? 'bg-indigo-50/30' : ''} ${product.isFreeText ? 'transition-none' : ''}`}
                    style={{
                        marginTop: customMarginTop,
                        marginBottom: isFreeTextGhost
                            ? -customMarginTop
                            : product.isFreeText
                                ? undefined
                                : contentSpacing.betweenProducts,
                        paddingTop: inGroup && !isSelected && !product.isFreeText ? 0 : undefined,
                        paddingBottom: inGroup && !isSelected && !product.isFreeText ? 0 : undefined,
                    }}
                >
                {isSelected && (
                    <ColumnResizeHandles
                        columnIndex={columnIndex}
                        columnCount={renderedCategoryColumnCount || categoryColumnCount}
                        onResizeStart={handlers.startCategoryColumnResize}
                    />
                )}
                {product.isFreeText
                    ? renderFormattingToolbar('freeText', product.id, product.styles || {})
                    : renderFormattingToolbar('product', product.id,
                        formattingTarget?.field === 'price' ? priceStyle : formattingTarget?.field === 'description' ? descStyle : nameStyle)}
                <ProductControls type="product" id={product.id} catName={item.category} isMobileSelected={isSelected} index={idx} total={0} canMoveUp={canMoveUp} canMoveDown={canMoveDown} canMoveLeft={false} canMoveRight={false} isFreeText={product.isFreeText} isPristineNewDefault={isPristineNewDefault} handlers={handlers} onEdit={compactControls && !product.isFreeText ? (e: React.MouseEvent) => handlers.startEditing(e, product.id, `product-name-${product.id}`, 'name') : undefined} isDragging={isBeingDragged} showTopAddControl={productAddControls.top} showBottomAddControl={productAddControls.bottom} compactControls={compactControls} containMobileControls showGridMoveControls={productColumnCount > 1}/>
                
                <div className={`transition-opacity duration-150 ${isBeingDragged && !product.isFreeText ? 'opacity-40' : ''}`}>
                {product.isFreeText ? (
                    <div
                        className="min-w-0 max-w-full leading-snug break-words [overflow-wrap:anywhere]"
                        style={{ textAlign: nameStyle.textAlign || 'left' }}
                    >
                            <AutoFitText
                            as="span"
                            text={product.name}
                            baseFontSize={clampFontSize(style, 'freeText', nameStyle.fontSize, 18)}
                            minimumFontSize={minimumFontSize}
                            allowSameWordBreak={allowSameWordBreak}
                            fitScope="freeText"
                            containerSelector={`#product-container-${product.id}`}
                            showOverflowFeedback={isEditing}
                            id={`product-name-${product.id}`} data-product-edit-id={product.id} className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] outline-none rounded ${isEditing ? 'bg-white ring-2 ring-blue-500 cursor-text px-1' : ''}`}
                            style={{ 
                                color: nameStyle.color,
                                fontFamily: nameStyle.fontFamily,
                                fontSize: `${clampFontSize(style, 'freeText', nameStyle.fontSize, 18)}px`,
                                fontWeight: nameStyle.fontWeight,
                                fontStyle: nameStyle.italic ? 'italic' : 'normal',
                                textDecoration: nameStyle.underline ? 'underline' : 'none',
                                textTransform: nameStyle.textTransform,
                                letterSpacing: nameStyle.letterSpacing ? `${nameStyle.letterSpacing}px` : undefined
                            }}
                            contentEditable={isEditing} suppressContentEditableWarning onBlur={(e) => handlers.handleBlur(e, 'product', product.id, 'name')} onKeyDown={handlers.handleKeyDown} onFocus={(e) => clearDefaultTextOnFocus(e.currentTarget, ['Novo texto'])} onMouseDown={(e) => { if(!isEditing) e.preventDefault(); }} onPointerDown={(e) => { if (isEditing) e.stopPropagation(); }}
                            />
                            <button
                                data-product-edit-id={product.id}
                                onClick={(e) => handlers.startEditing(e, product.id, `product-name-${product.id}`, 'freeText')}
                                className={`relative ml-2 inline-flex align-middle ${selectionLayerClasses.controls} ${compactControls ? 'p-1.5' : 'p-2'} bg-white border border-slate-200 shadow-sm rounded-md text-slate-500 hover:text-indigo-600 hover:bg-slate-50 transition-all ${isSelected || handlers.editingId === product.id ? 'opacity-100 pointer-events-auto' : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto'}`}
                                onPointerDown={(e) => e.stopPropagation()}
                                title="Editar texto"
                            >
                                <Edit3 size={compactControls ? 15 : 20} />
                            </button>
                    </div>
                ) : (
                <div className={`flex items-start justify-between ${stackImage ? 'flex-col gap-2' : compactControls ? 'gap-2' : 'gap-4'}`}>
                    {style.showImages && product.image && ( 
                        <div style={{ width: stackImage ? '100%' : `${imageSizePx}px`, height: `${imageSizePx}px` }} className="rounded-md overflow-hidden flex-shrink-0 bg-gray-100 shadow-inner select-none transition-all duration-300">
                            <img src={product.image} alt={product.name} className="w-full h-full object-cover" draggable={false} />
                        </div> 
                    )}
                    <div className={`flex-grow min-w-0 ${isNameCentered ? 'text-center' : isNameRight ? 'text-right' : 'text-left'}`}>
                         <div
                            className={`grid grid-cols-[minmax(0,1fr)_auto] ${isNameCentered ? 'items-center' : 'items-start'}`}
                            style={{
                                marginBottom: contentSpacing.productNameToDescription,
                                columnGap: contentSpacing.productNameToPrice,
                            }}
                         >
                            <div className={`flex items-center gap-2 min-w-0 ${isNameCentered ? 'justify-center w-full' : isNameRight ? 'justify-end' : ''}`}>
                                <AutoFitText
                                    as="h3"
                                    text={product.name}
                                    baseFontSize={clampFontSize(style, 'productName', nameStyle.fontSize, 18)}
                                    minimumFontSize={minimumFontSize}
                                    allowSameWordBreak={allowSameWordBreak}
                                    fitScope="productName"
                                    widthMode="flex"
                                    showOverflowFeedback={isEditing}
                                    id={`product-name-${product.id}`} data-product-edit-id={product.id} className={`min-w-0 max-w-full break-words [overflow-wrap:anywhere] [word-break:normal] leading-snug outline-none rounded ${isEditing ? 'bg-white ring-2 ring-blue-500 cursor-text px-1 select-text touch-auto pointer-events-auto' : ''}`}
                                    style={{ 
                                        color: nameStyle.color || style.textColor,
                                        fontFamily: nameStyle.fontFamily,
                                        fontSize: `${clampFontSize(style, 'productName', nameStyle.fontSize, 18)}px`,
                                        fontWeight: nameStyle.fontWeight,
                                        fontStyle: nameStyle.italic ? 'italic' : 'normal',
                                        textDecoration: nameStyle.underline ? 'underline' : 'none',
                                        textAlign: nameStyle.textAlign,
                                        textTransform: nameStyle.textTransform,
                                        letterSpacing: nameStyle.letterSpacing ? `${nameStyle.letterSpacing}px` : undefined
                                    }}
                                    contentEditable={isEditing} tabIndex={isEditing ? 0 : undefined} suppressContentEditableWarning onBlur={(e) => handlers.handleBlur(e, 'product', product.id, 'name')} onKeyDown={handlers.handleKeyDown} onFocus={(e) => { if (!isEditing) return; handlers.setProductEditingField?.(product.id, 'name', `product-name-${product.id}`); handleMobileFocusScroll(e.currentTarget); }} onPointerDown={(e) => { if (isEditing) e.stopPropagation(); }} onClick={(e) => { if (isEditing) e.stopPropagation(); }}
                                />
                                <button data-product-edit-id={product.id} onClick={(e) => handlers.startEditing(e, product.id, `product-name-${product.id}`, 'name')} className={`relative ${selectionLayerClasses.controls} ${compactControls ? 'hidden' : ''} p-2.5 bg-white border border-slate-200 shadow-sm rounded-md text-slate-500 hover:text-indigo-600 hover:bg-slate-50 transition-all flex-shrink-0 ${isSelected || handlers.editingId === product.id ? 'opacity-100 pointer-events-auto' : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto'}`} onPointerDown={(e) => e.stopPropagation()}><Edit3 size={24} /></button>
                            </div>
                            <div 
                              className="flex min-w-0 shrink-0 items-center gap-1 whitespace-nowrap"
                              style={{ 
                                justifyContent: priceStyle.textAlign === 'left' ? 'flex-start' : (priceStyle.textAlign === 'center' ? 'center' : 'flex-end'), 
                                display: 'flex',
                                fontFamily: priceStyle.fontFamily,
                                fontSize: `${clampFontSize(style, 'productPrice', priceStyle.fontSize, 18)}px`,
                                fontWeight: priceStyle.fontWeight,
                              }}
                            >
                                <span className="opacity-70 mr-[1px] select-none touch-none" style={{ color: priceStyle.color }}>$</span>
                                <AutoFitText
                                    as="span"
                                    text={product.price.toFixed(2)}
                                    baseFontSize={clampFontSize(style, 'productPrice', priceStyle.fontSize, 18)}
                                    minimumFontSize={minimumFontSize}
                                    allowSameWordBreak={false}
                                    fitScope="productPrice"
                                    containerSelector={`#product-container-${product.id}`}
                                    showOverflowFeedback={isEditing}
                                    id={`product-price-${product.id}`} data-product-edit-id={product.id} className={`whitespace-nowrap outline-none rounded ${isEditing ? 'bg-white ring-2 ring-blue-500 cursor-text px-1 select-text touch-auto pointer-events-auto' : ''}`}
                                    style={{ 
                                        color: priceStyle.color,
                                        fontFamily: priceStyle.fontFamily,
                                        fontSize: `${clampFontSize(style, 'productPrice', priceStyle.fontSize, 18)}px`,
                                        fontWeight: priceStyle.fontWeight,
                                        fontStyle: priceStyle.italic ? 'italic' : 'normal',
                                        textDecoration: priceStyle.underline ? 'underline' : 'none',
                                        textAlign: priceStyle.textAlign,
                                        display: 'inline-block'
                                    }}
                                    contentEditable={isEditing} tabIndex={isEditing ? 0 : undefined} inputMode="decimal" enterKeyHint="done" suppressContentEditableWarning onBlur={(e) => handlers.handleBlur(e, 'product', product.id, 'price')} onKeyDown={(e) => { if (isEditing && e.key !== 'Unidentified' && e.key.length === 1 && !/^[0-9.,]$/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault(); handlers.handleKeyDown(e); }} onFocus={(e) => { if (!isEditing) return; handlers.setProductEditingField?.(product.id, 'price', `product-price-${product.id}`); handleMobileFocusScroll(e.currentTarget); setTimeout(() => { if (document.activeElement === e.currentTarget) { const range = document.createRange(); range.selectNodeContents(e.currentTarget); const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range); } }, 0); }} onPointerDown={(e) => { if (isEditing) e.stopPropagation(); }} onClick={(e) => { if (isEditing) e.stopPropagation(); }}
                                />
                            </div>
                        </div>
                        <AutoFitText
                            as="p"
                            text={product.description}
                            baseFontSize={clampFontSize(style, 'productDescription', descStyle.fontSize, 14)}
                            minimumFontSize={minimumFontSize}
                            allowSameWordBreak={allowSameWordBreak}
                            fitScope="productDescription"
                            widthMode="parent"
                            showOverflowFeedback={isEditing}
                            id={`product-description-${product.id}`} data-product-edit-id={product.id} className={`max-w-full opacity-80 break-words [overflow-wrap:anywhere] [word-break:normal] leading-relaxed outline-none rounded ${isEditing ? 'min-h-[1.5em] bg-white ring-2 ring-blue-500 cursor-text px-1 select-text touch-auto pointer-events-auto' : ''}`}
                            style={{ 
                                color: descStyle.color,
                                fontFamily: descStyle.fontFamily,
                                fontSize: `${clampFontSize(style, 'productDescription', descStyle.fontSize, 14)}px`,
                                fontWeight: descStyle.fontWeight,
                                textAlign: descStyle.textAlign || nameStyle.textAlign,
                                fontStyle: descStyle.italic ? 'italic' : 'normal',
                                textDecoration: descStyle.underline ? 'underline' : 'none'
                            }}
                            contentEditable={isEditing} tabIndex={isEditing ? 0 : undefined} suppressContentEditableWarning onBlur={(e) => handlers.handleBlur(e, 'product', product.id, 'description')} onKeyDown={handlers.handleKeyDown} onFocus={(e) => { if (!isEditing) return; handlers.setProductEditingField?.(product.id, 'description', `product-description-${product.id}`); handleMobileFocusScroll(e.currentTarget); }} onPointerDown={(e) => { if (isEditing) e.stopPropagation(); }} onClick={(e) => { if (isEditing) e.stopPropagation(); }}
                        />
                    </div>
                    </div>
                )}
                </div>
                </div>
        );
    }

    if (item.type === 'product-row') {
        const imgScale = style.imageScale || 1;
        const productColumnCount = style.columnCount || 1;
        const categoryColumnCount = style.categoryColumnCount || 1;
        const isCardLayout = style.layoutMode === 'cards' || style.layoutMode === 'grid';
        const cardBackgroundColor = style.cardBackgroundColor || '#ffffff';
        const compactControls = categoryColumnCount > 1 || productColumnCount > 1;
        const denseControls = categoryColumnCount > 1 && productColumnCount > 1;
        const mobileExpandedControls = !denseControls && categoryColumnCount === 1 && productColumnCount > 1;
        const cardImageHeight = (
            categoryColumnCount >= 3
                ? 56
                : categoryColumnCount === 2
                    ? 72
                    : productColumnCount >= 3
                        ? 90
                        : productColumnCount === 2
                            ? 120
                            : 168
        ) * imgScale;
        const productGridGap = categoryColumnCount > 1
            ? (productColumnCount > 2 ? 4 : 8)
            : productColumnCount > 2
                ? 8
                : productColumnCount > 1
                    ? 12
                    : 24;
        
        return (
            <div key={`row-${idx}`} className="grid" style={{ gridTemplateColumns: `repeat(${productColumnCount}, minmax(0, 1fr))`, gap: `${productGridGap}px`, marginBottom: contentSpacing.betweenProducts }}>
                {(item.data as Product[]).map((product) => {
                     const isSelected = handlers.isSelected?.('product', product.id) ?? handlers.selectedId === product.id;
                     const nameStyle = style.elementStyles?.productName || {};
                     const priceStyle = style.elementStyles?.productPrice || {};
                     const descStyle = style.elementStyles?.productDescription || {};
                     const textAlignClass = nameStyle.textAlign === 'left'
                        ? 'text-left'
                        : nameStyle.textAlign === 'right'
                            ? 'text-right'
                            : 'text-center';
                     const hiddenProductIds = new Set(style.hiddenProductIds || []);
                     const visibleCatProducts = (handlers.groupedProducts[item.category] || [])
                        .filter((candidate: Product) => !hiddenProductIds.has(candidate.id));
                     const pIndex = visibleCatProducts.findIndex((candidate: Product) => candidate.id === product.id);
                     const hasMovableSiblings = visibleCatProducts.length > 1 && pIndex >= 0;
                     const canMoveUp = hasMovableSiblings && (productColumnCount > 1 ? pIndex - productColumnCount >= 0 : pIndex > 0);
                     const canMoveDown = hasMovableSiblings && (productColumnCount > 1 ? pIndex + productColumnCount < visibleCatProducts.length : pIndex < visibleCatProducts.length - 1);
                     const canMoveLeft = hasMovableSiblings && productColumnCount > 1 && pIndex % productColumnCount > 0;
                     const canMoveRight = hasMovableSiblings && productColumnCount > 1 && pIndex % productColumnCount < productColumnCount - 1 && pIndex < visibleCatProducts.length - 1;
                     const isBeingDragged = handlers.draggedItem?.id === product.id;
                     const isEditing = handlers.editingId === product.id;
                     const productAddControls = handlers.getSelectionAddControls?.('product', product.id) || { top: true, bottom: true };
                     const isPristineNewDefault = isPristineNewProduct(product);
                     return (
                            <div 
                                key={product.id}
                                id={`product-container-${product.id}`}
                                data-drag-scope={handlers.dragScope}
                                data-drag-type="product"
                                data-drag-id={product.id}
                                data-drag-group={item.category}
                                onPointerDown={(e) => handlers.handleDragStart(e, 'product', product.id, item.category)}
                                onDragStart={(e) => e.preventDefault()}
                                onContextMenu={(e) => handlers.openObjectMenu?.(e, { type: 'product', id: product.id })} 
                                onClick={(e) => { e.stopPropagation(); handlers.handleSelection('product', product.id, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey }); handlers.setSelectedPageIndex(null); }}
                                className={`automenu-drag-item relative group min-w-0 transition-all pointer-events-auto ${isSelected && compactControls && !isEditing ? (mobileExpandedControls ? 'px-0 pb-0 pt-14 md:p-0' : 'px-0 pb-0 pt-10 md:p-0') : 'p-0'} ${isEditing ? 'select-text touch-auto cursor-text' : 'select-none touch-none cursor-grab'} ${isCardLayout ? 'rounded-xl' : 'rounded-lg'} ${isSelected || isEditing ? 'z-[60] bg-indigo-50/30' : 'z-[1] hover:bg-black/5'}`}
                            >
                                {renderFormattingToolbar('product', product.id,
                                    formattingTarget?.field === 'price' ? priceStyle : formattingTarget?.field === 'description' ? descStyle : nameStyle)}
                                <ProductControls type="product" id={product.id} catName={item.category} isMobileSelected={isSelected} index={idx} total={0} canMoveUp={canMoveUp} canMoveDown={canMoveDown} canMoveLeft={canMoveLeft} canMoveRight={canMoveRight} isFreeText={product.isFreeText} isPristineNewDefault={isPristineNewDefault} handlers={handlers} onEdit={compactControls ? (e: React.MouseEvent) => handlers.startEditing(e, product.id, `product-name-${product.id}`, 'name') : undefined} isDragging={isBeingDragged} showTopAddControl={productAddControls.top} showBottomAddControl={productAddControls.bottom} compactControls={compactControls} mobileExpandedControls={mobileExpandedControls} denseControls={denseControls} containMobileControls showGridMoveControls={productColumnCount > 1}/>
                                
                                <div
                                    className={`h-full transition-all duration-150 ${isCardLayout ? 'rounded-xl overflow-hidden border border-slate-200 shadow-sm' : 'bg-transparent'} ${isBeingDragged ? 'opacity-40' : isCardLayout ? 'group-hover:shadow-md' : ''}`}
                                    style={isCardLayout ? { backgroundColor: cardBackgroundColor } : undefined}
                                >
                                    <div className="h-full flex flex-col">
                                        {style.showImages && product.image && (
                                            <div style={{ height: `${cardImageHeight}px` }} className={`w-full bg-gray-100 overflow-hidden transition-all duration-300 ${isCardLayout ? '' : 'rounded-md'}`}>
                                                <img src={product.image} className="w-full h-full object-cover" alt={product.name} draggable={false} />
                                            </div>
                                        )}
                                        <div className={`${isCardLayout ? (categoryColumnCount > 1 || productColumnCount > 2 ? 'p-1.5' : productColumnCount > 1 ? 'p-2' : 'p-4') : 'py-2'} flex min-w-0 flex-col flex-grow ${textAlignClass}`}>
                                            <div
                                                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start"
                                                style={{
                                                    marginBottom: contentSpacing.productNameToDescription,
                                                    columnGap: contentSpacing.productNameToPrice,
                                                }}
                                            >
                                                <div className={`flex min-w-0 items-center gap-1 ${nameStyle.textAlign === 'center' ? 'justify-center' : nameStyle.textAlign === 'right' ? 'justify-end' : 'justify-start'}`}>
                                                    <AutoFitText
                                                        as="h3"
                                                        text={product.name}
                                                        baseFontSize={clampFontSize(style, 'productName', nameStyle.fontSize, 18)}
                                                        minimumFontSize={minimumFontSize}
                                                        allowSameWordBreak={allowSameWordBreak}
                                                        fitScope="productName"
                                                        widthMode="flex"
                                                        showOverflowFeedback={isEditing}
                                                        id={`product-name-${product.id}`}
                                                        data-product-edit-id={product.id}
                                                        className={`min-w-0 max-w-full break-words [overflow-wrap:anywhere] [word-break:normal] leading-snug outline-none rounded ${isEditing ? 'bg-white ring-2 ring-blue-500 cursor-text px-1 select-text touch-auto pointer-events-auto' : ''}`}
                                                        style={{ color: nameStyle.color || style.textColor, fontFamily: nameStyle.fontFamily, fontSize: clampFontSize(style, 'productName', nameStyle.fontSize, 18), fontWeight: nameStyle.fontWeight, fontStyle: nameStyle.italic ? 'italic' : 'normal', textDecoration: nameStyle.underline ? 'underline' : 'none', textAlign: nameStyle.textAlign, textTransform: nameStyle.textTransform }}
                                                        contentEditable={isEditing}
                                                        suppressContentEditableWarning
                                                        onBlur={(e) => handlers.handleBlur(e, 'product', product.id, 'name')}
                                                        onKeyDown={handlers.handleKeyDown}
                                                        onFocus={(e) => { if (!isEditing) return; handlers.setProductEditingField?.(product.id, 'name', `product-name-${product.id}`); handleMobileFocusScroll(e.currentTarget); }}
                                                        tabIndex={isEditing ? 0 : undefined}
                                                        onPointerDown={(e) => { if (isEditing) e.stopPropagation(); }}
                                                        onClick={(e) => { if (isEditing) e.stopPropagation(); }}
                                                    />
                                                    <button
                                                        data-product-edit-id={product.id}
                                                        onClick={(e) => handlers.startEditing(e, product.id, `product-name-${product.id}`, 'name')}
                                                        className={`relative flex-shrink-0 ${selectionLayerClasses.controls} ${compactControls ? 'hidden' : 'p-2.5 md:p-2'} bg-white border border-slate-200 shadow-sm rounded-md text-slate-500 hover:text-indigo-600 hover:bg-slate-50 transition-all ${isSelected || isEditing ? 'opacity-100 pointer-events-auto' : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto'}`}
                                                        onPointerDown={(e) => e.stopPropagation()}
                                                        title="Editar produto"
                                                    >
                                                        <Edit3 size={20} className="h-6 w-6 md:h-5 md:w-5" />
                                                    </button>
                                                </div>
                                                <div
                                                    className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap justify-self-end ${isCardLayout ? `rounded-full bg-white/90 border border-black/5 shadow-sm ${compactControls ? 'px-1.5 py-0.5' : 'px-2.5 py-1'}` : ''}`}
                                                    style={{ color: priceStyle.color, fontFamily: priceStyle.fontFamily, fontSize: clampFontSize(style, 'productPrice', priceStyle.fontSize, 18), fontWeight: priceStyle.fontWeight, fontStyle: priceStyle.italic ? 'italic' : 'normal', textDecoration: priceStyle.underline ? 'underline' : 'none' }}
                                                >
                                                    <span className="opacity-70 select-none touch-none">$</span>
                                                    <AutoFitText
                                                        as="span"
                                                        text={product.price.toFixed(2)}
                                                        baseFontSize={clampFontSize(style, 'productPrice', priceStyle.fontSize, 18)}
                                                        minimumFontSize={minimumFontSize}
                                                        allowSameWordBreak={false}
                                                        fitScope="productPrice"
                                                        containerSelector={`#product-container-${product.id}`}
                                                        showOverflowFeedback={isEditing}
                                                        id={`product-price-${product.id}`}
                                                        data-product-edit-id={product.id}
                                                        className={`whitespace-nowrap outline-none ${isEditing ? 'ring-2 ring-blue-500 cursor-text select-text touch-auto pointer-events-auto' : ''}`}
                                                        style={{ textAlign: priceStyle.textAlign }}
                                                        contentEditable={isEditing}
                                                        tabIndex={isEditing ? 0 : undefined}
                                                        inputMode="decimal"
                                                        enterKeyHint="done"
                                                        suppressContentEditableWarning
                                                        onBlur={(e) => handlers.handleBlur(e, 'product', product.id, 'price')}
                                                        onKeyDown={(e) => { if (isEditing && e.key !== 'Unidentified' && e.key.length === 1 && !/^[0-9.,]$/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault(); handlers.handleKeyDown(e); }}
                                                        onFocus={(e) => { if (!isEditing) return; handlers.setProductEditingField?.(product.id, 'price', `product-price-${product.id}`); handleMobileFocusScroll(e.currentTarget); setTimeout(() => { if (document.activeElement === e.currentTarget) { const range = document.createRange(); range.selectNodeContents(e.currentTarget); const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range); } }, 0); }}
                                                        onPointerDown={(e) => { if (isEditing) e.stopPropagation(); }}
                                                        onClick={(e) => { if (isEditing) e.stopPropagation(); }}
                                                    />
                                                </div>
                                            </div>
                                            <AutoFitText
                                                as="p"
                                                text={product.description}
                                                baseFontSize={clampFontSize(style, 'productDescription', descStyle.fontSize, 14)}
                                                minimumFontSize={minimumFontSize}
                                                allowSameWordBreak={allowSameWordBreak}
                                                fitScope="productDescription"
                                                widthMode="parent"
                                                showOverflowFeedback={isEditing}
                                                id={`product-description-${product.id}`}
                                                data-product-edit-id={product.id}
                                                className={`max-w-full opacity-75 break-words [overflow-wrap:anywhere] [word-break:normal] flex-grow outline-none rounded ${isEditing ? 'min-h-[1.5em] bg-white ring-2 ring-blue-500 cursor-text px-1 select-text touch-auto pointer-events-auto' : 'line-clamp-4'}`}
                                                style={{ color: descStyle.color, fontFamily: descStyle.fontFamily, fontSize: clampFontSize(style, 'productDescription', descStyle.fontSize, 14), fontWeight: descStyle.fontWeight, fontStyle: descStyle.italic ? 'italic' : 'normal', textDecoration: descStyle.underline ? 'underline' : 'none', textAlign: descStyle.textAlign }}
                                                contentEditable={isEditing}
                                                tabIndex={isEditing ? 0 : undefined}
                                                suppressContentEditableWarning
                                                onBlur={(e) => handlers.handleBlur(e, 'product', product.id, 'description')}
                                                onKeyDown={handlers.handleKeyDown}
                                                onFocus={(e) => { if (!isEditing) return; handlers.setProductEditingField?.(product.id, 'description', `product-description-${product.id}`); handleMobileFocusScroll(e.currentTarget); }}
                                                onPointerDown={(e) => { if (isEditing) e.stopPropagation(); }}
                                                onClick={(e) => { if (isEditing) e.stopPropagation(); }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                     )
                })}
            </div>
        )
    }
    return null;
};
