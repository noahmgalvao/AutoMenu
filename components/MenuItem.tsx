import { getProductCardCornerRadii, getProductCardRadius, getProductPhotoFrameRadius, templateProductImageHeight } from '../utils/templateDesign';
import React from 'react';
import { createPortal } from 'react-dom';
import { Product, MenuStyle, type ElementStyle, type FontSizeLimitKey, type MenuBorderScope } from '../types';
import { Edit3, Repeat2, FlipHorizontal2, FlipVertical2, Minus, MoreHorizontal, Plus, Trash2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, CopyCheck } from 'lucide-react';
import { FREE_TEXT_PREFIX, getPaginationItemKey } from '../utils/menuPagination';
import { selectionLayerClasses } from './selectionLayers';
import { getDirectionLabel, type FlowDirection } from '../utils/flowControls';
import { InlineStyleToolbar } from './MenuDesigner/InlineStyleToolbar';
import { CategoryDividerPicker } from './MenuDesigner/CategoryDividerPicker';
import type { MoveDirection } from '../hooks/interactions/types';
import type { PriceAdjustmentMode } from '../utils/pricePropagation';
import { clampFontSize, resolveFontSizeLimits, resolveMenuContentSpacing, resolveMinimumFontSize } from '../utils/styleRules';
import { BorderDecoration, DecorationControls, getBorderOverride, getMarker, MenuMarkerGlyph } from './MenuDesigner/Decorations';
import { ColumnResizeHandles } from './ColumnResizeHandles';
import { AutoFitText } from './AutoFitText';
import { formatMenuPriceValue } from '../utils/price';
import { resolveMenuPageDimensions } from '../utils/pageSetup';
import { resolveCategoryDivider } from '../utils/categoryDividers';
import { CanvasTextDivider } from './CanvasTextDivider';
import { CanvasActionGroup, canvasActionButtonClass } from './CanvasControls';

interface MenuItemProps {
    item: any;
    idx: number;
    style: MenuStyle;
    handlers: any; // Return type of useMenuInteractions
    products: Product[];
    inGroup: boolean;
    columnIndex?: number;
    categoryColumnCount?: number;
    backgroundText?: boolean;
}

const DirectionIcon = ({ direction, size, className }: { direction: FlowDirection; size: number; className?: string }) => {
    if (direction === 'left') return <ChevronLeft size={size} className={className} />;
    if (direction === 'right') return <ChevronRight size={size} className={className} />;
    if (direction === 'bottom') return <ChevronDown size={size} className={className} />;
    return <ChevronUp size={size} className={className} />;
};

const handleMobileFocusScroll = (element: HTMLElement) => {
    if (window.matchMedia('(min-width: 768px)').matches) return;
    window.setTimeout(() => {
        if (!element.isConnected) return;
        const rect = element.getBoundingClientRect();
        const viewportHeight = window.visualViewport?.height || window.innerHeight;
        const safeTop = 12;
        const safeBottom = viewportHeight - 12;
        if (rect.top < safeTop || rect.bottom > safeBottom) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 250);
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

const ProductImageToolbar = ({ productId, anchorId, handlers, flips }: {
    productId: string; anchorId: string; handlers: any; flips?: NonNullable<MenuStyle['productImageFlips']>[string];
}) => {
    const menuRef = React.useRef<HTMLDivElement>(null);
    const [position, setPosition] = React.useState({ left: 8, top: 8 });

    React.useLayoutEffect(() => {
        const anchor = document.getElementById(anchorId);
        const menu = menuRef.current;
        if (!anchor || !menu) return;
        const updatePosition = () => {
            const anchorRect = anchor.getBoundingClientRect();
            const menuRect = menu.getBoundingClientRect();
            const left = Math.max(8, Math.min(window.innerWidth - menuRect.width - 8, anchorRect.left + (anchorRect.width - menuRect.width) / 2));
            const top = anchorRect.top - menuRect.height - 8 >= 8
                ? anchorRect.top - menuRect.height - 8
                : Math.min(window.innerHeight - menuRect.height - 8, anchorRect.bottom + 8);
            setPosition({ left, top: Math.max(8, top) });
        };
        updatePosition();
        const observer = new ResizeObserver(updatePosition);
        observer.observe(anchor);
        observer.observe(menu);
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [anchorId]);

    return createPortal(
        <div
            ref={menuRef}
            data-product-image-surface={productId}
            data-editor-popover="true"
            data-drag-ignore="true"
            className="fixed z-[10020] flex items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-xl backdrop-blur-sm"
            style={position}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <button type="button" onClick={() => handlers.editProductImage?.(productId)} className="flex h-8 w-8 items-center justify-center rounded-lg text-indigo-600 hover:bg-indigo-50" title="Substituir imagem" aria-label="Substituir imagem"><Repeat2 size={16} /></button>
            <button type="button" onClick={() => handlers.adjustProductImageScale?.(-0.1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" title="Diminuir imagem" aria-label="Diminuir imagem"><Minus size={16} /></button>
            <button type="button" onClick={() => handlers.adjustProductImageScale?.(0.1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" title="Aumentar imagem" aria-label="Aumentar imagem"><Plus size={16} /></button>
            <button type="button" aria-pressed={Boolean(flips?.horizontal)} title="Inverter horizontalmente" aria-label="Inverter horizontalmente"
                onClick={() => handlers.flipProductImage?.(productId, 'horizontal')} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 aria-pressed:bg-indigo-50 aria-pressed:text-indigo-700"><FlipHorizontal2 size={16} /></button>
            <button type="button" aria-pressed={Boolean(flips?.vertical)} title="Inverter verticalmente" aria-label="Inverter verticalmente"
                onClick={() => handlers.flipProductImage?.(productId, 'vertical')} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 aria-pressed:bg-indigo-50 aria-pressed:text-indigo-700"><FlipVertical2 size={16} /></button>
            <button type="button" onClick={() => handlers.removeProductImage?.(productId)} className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50" title="Remover imagem" aria-label="Remover imagem"><Trash2 size={16} /></button>
        </div>,
        document.body,
    );
};

const getRenderedScale = (element: HTMLElement) => {
    const page = element.closest<HTMLElement>('[data-menu-print-page="true"]');
    const rect = page?.getBoundingClientRect();
    return page && rect?.width ? rect.width / Math.max(1, page.offsetWidth) : 1;
};

const getFreeTextMaximumWidth = (element: HTMLElement) => {
    const scale = getRenderedScale(element);
    if (element.closest('[data-page-positioned-text="true"]')) {
        const page = element.closest('[data-menu-print-page="true"]');
        if (page) return (page.getBoundingClientRect().right - element.getBoundingClientRect().left) / scale;
    }
    const column = element.closest('[data-drag-column-container="category"]');
    return (column || element).getBoundingClientRect().width / scale;
};

const getFreeTextContentWidth = (element: HTMLElement, maximumWidth: number) => {
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

const FreeTextResizeHandles = ({ product, style, handlers }: { product: Product; style: MenuStyle; handlers: any }) => {
    const startResize = (event: React.PointerEvent<HTMLButtonElement>, horizontalDirection: -1 | 1, verticalDirection: -1 | 1) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        const container = document.getElementById(`product-container-${product.id}`);
        const text = document.getElementById(`product-name-${product.id}`);
        if (!container || !text) return;
        const scale = getRenderedScale(container);
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
            nextFontSize = Math.max(minimumFontSize, Math.min(maximumFontSize, Math.round(startFontSize * factor * 10) / 10));
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
    showAddControls?: boolean;
    showTopAddControl?: boolean;
    showBottomAddControl?: boolean;
    showGridMoveControls?: boolean;
}

const ProductControls = ({
    type, id, catName, canMoveUp, canMoveDown, canMoveLeft, canMoveRight, isFreeText, handlers,
    isDragging, showSelectionOutline = true, showAddControls = true, showTopAddControl = true,
    showBottomAddControl = true, showGridMoveControls,
}: ProductControlsProps) => {
    const selectionType = type === 'category' ? 'category' : isFreeText ? 'freeText' : 'product';
    const selectionId = id || catName;
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

    if (isDragging) return null;

    const renderMove = (direction: MoveDirection, edge: FlowDirection) => (
        <button key={direction} type="button"
            className={canvasActionButtonClass}
            onClick={event => handlers.handleGlobalMove(event, type, selectionId, catName, direction)}
            title={`Mover ${getDirectionLabel(edge)}`}>
            <DirectionIcon size={19} direction={edge} />
        </button>
    );
    const renderAdd = (position: 'before' | 'after', direction: FlowDirection) => (
        <CanvasActionGroup direction={direction} kind="add">
            <button type="button" className={`${canvasActionButtonClass} !border-indigo-600 !text-white ${limitReached ? '!bg-red-500 animate-shake' : '!bg-indigo-600 hover:!bg-indigo-700'}`}
                onClick={event => handlers.handleAddClick?.(event, catName, type === 'category', position, id)}
                title={`${type === 'category' ? 'Adicionar categoria' : 'Adicionar item'} ${getDirectionLabel(direction)}`}>
                <Plus size={20} />
            </button>
        </CanvasActionGroup>
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

    return (
        <>
            {isSelected && showSelectionOutline && (
                <div className={`pointer-events-none absolute inset-0 rounded-lg border-2 border-indigo-500 ${selectionLayerClasses.outline}`} />
            )}
            {isActive && !isFreeText && showAddControls && !handlers.editingId && (
                <>
                    {showTopAddControl && renderAdd('before', addFlow.before)}
                    {showBottomAddControl && renderAdd('after', addFlow.after)}
                </>
            )}
            {!handlers.editingId && (!isSelected || isActive) && (
                <CanvasActionGroup direction="top" kind="quick" hoverOnly={!isActive}>
                    {type === 'product' && !isFreeText && (
                        <button type="button" className={`${canvasActionButtonClass} hidden md:grid`}
                            aria-hidden={handlers.objectMenuOpen || undefined} tabIndex={handlers.objectMenuOpen ? -1 : undefined}
                            title="Editar produto"
                            onClick={event => handlers.startEditing(event, selectionId, `product-name-${selectionId}`)}>
                            <Edit3 size={19} />
                        </button>
                    )}
                    <button type="button" className={`${canvasActionButtonClass} ${handlers.multiSelectMode ? '!border-indigo-500 !bg-indigo-50 !text-indigo-600' : ''}`}
                        onClick={() => handlers.setMultiSelectMode?.(!handlers.multiSelectMode)}
                        aria-pressed={Boolean(handlers.multiSelectMode)} title="Seleção múltipla">
                        <CopyCheck size={19} />
                    </button>
                    <button type="button" data-open-object-menu="true" className={canvasActionButtonClass}
                        onClick={event => handlers.openObjectMenu?.(event, { type: selectionType, id: selectionId })} title="Mais opções">
                        <MoreHorizontal size={20} />
                    </button>
                    {isFreeText && isActive && enabledMoves.map(({ direction, edge }) => renderMove(direction, edge))}
                </CanvasActionGroup>
            )}
            {isActive && !isFreeText && !handlers.editingId && enabledMoves.map(({ direction, edge }) => (
                <CanvasActionGroup key={direction} direction={edge} kind="move">
                    {renderMove(direction, edge)}
                </CanvasActionGroup>
            ))}
        </>
    );
};

export const MenuItem: React.FC<MenuItemProps> = ({
    item,
    idx,
    style,
    handlers,
    products,
    inGroup,
    columnIndex = 0,
    categoryColumnCount: renderedCategoryColumnCount,
    backgroundText = false,
}) => {
    const formattingTarget = handlers.formattingTarget;
    const fontSizeLimits = resolveFontSizeLimits(style);
    const minimumFontSize = resolveMinimumFontSize(style);
    const allowSameWordBreak = style.allowSameWordBreak === true;
    const contentSpacing = resolveMenuContentSpacing(style);
    const replacePriceOnNextInputRef = React.useRef<Set<string>>(new Set());
    const [imageMenuProductId, setImageMenuProductId] = React.useState<string | null>(null);
    React.useEffect(() => {
        if (imageMenuProductId && handlers.editingId !== imageMenuProductId) {
            setImageMenuProductId(null);
        }
    }, [handlers.editingId, imageMenuProductId]);
    React.useEffect(() => {
        if (!imageMenuProductId) return;
        const endEditing = () => {
            setImageMenuProductId(null);
            handlers.setEditingId(null);
            handlers.setFormattingTarget(null);
        };
        const closeImageMenuOutside = (event: PointerEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest<HTMLElement>('[data-product-image-surface]')?.dataset.productImageSurface === imageMenuProductId) return;
            if (target?.closest('[data-editor-popover="true"], [data-canvas-history-control]')) return;
            if (target?.closest<HTMLElement>('[data-drag-type="product"]')?.dataset.dragId === imageMenuProductId) {
                setImageMenuProductId(null);
                return;
            }
            endEditing();
        };
        const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') endEditing(); };
        document.addEventListener('pointerdown', closeImageMenuOutside, true);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeImageMenuOutside, true);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [handlers.setEditingId, handlers.setFormattingTarget, imageMenuProductId]);
    const openProductImageMenu = (event: React.MouseEvent, productId: string, isEditing: boolean) => {
        if (!isEditing) return;
        event.stopPropagation();
        handlers.setFormattingTarget?.(null);
        setImageMenuProductId(productId);
    };
    const replacePriceText = (element: HTMLElement, productId: string, text: string) => {
        const nextText = text.replace(/[^0-9.,]/g, '');
        if (!nextText) return;
        element.innerText = nextText;
        replacePriceOnNextInputRef.current.delete(productId);
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
    };
    const handlePriceFocus = (event: React.FocusEvent<HTMLElement>, productId: string) => {
        if (handlers.editingId !== productId) return;
        handlers.setProductEditingField?.(productId, 'price', `product-price-${productId}`);
        replacePriceOnNextInputRef.current.add(productId);
        handleMobileFocusScroll(event.currentTarget);
        window.setTimeout(() => {
            if (document.activeElement !== event.currentTarget || !replacePriceOnNextInputRef.current.has(productId)) return;
            const range = document.createRange();
            range.selectNodeContents(event.currentTarget);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
        }, 0);
    };
    const handlePriceKeyDown = (event: React.KeyboardEvent<HTMLElement>, productId: string) => {
        const isPlainCharacter = event.key !== 'Unidentified'
            && event.key.length === 1
            && !event.ctrlKey
            && !event.metaKey
            && !event.altKey;
        const isPriceCharacter = isPlainCharacter && /^[0-9.,]$/.test(event.key);
        if (replacePriceOnNextInputRef.current.has(productId) && isPriceCharacter) {
            event.preventDefault();
            replacePriceText(event.currentTarget, productId, event.key);
            return;
        }
        if (isPlainCharacter && !isPriceCharacter) event.preventDefault();
        handlers.handleKeyDown(event);
    };
    const handlePriceBeforeInput = (event: React.FormEvent<HTMLElement>, productId: string) => {
        if (!replacePriceOnNextInputRef.current.has(productId)) return;
        const inputEvent = event.nativeEvent as InputEvent;
        if (!inputEvent.inputType?.startsWith('insert') || !inputEvent.data) return;
        const nextText = inputEvent.data.replace(/[^0-9.,]/g, '');
        if (!nextText) return;
        event.preventDefault();
        replacePriceText(event.currentTarget, productId, nextText);
    };
    const handlePricePaste = (event: React.ClipboardEvent<HTMLElement>, productId: string) => {
        if (!replacePriceOnNextInputRef.current.has(productId)) return;
        const nextText = event.clipboardData.getData('text').replace(/[^0-9.,]/g, '');
        if (!nextText) return;
        event.preventDefault();
        replacePriceText(event.currentTarget, productId, nextText);
    };
    const renderFormattingToolbar = (type: 'product' | 'category' | 'freeText' | 'menuTitle' | 'menuSubtitle', id: string, value: ElementStyle) => {
        if (formattingTarget?.type !== type || formattingTarget.id !== id) return null;
        const fontKey: FontSizeLimitKey = type !== 'product' ? type : formattingTarget.field === 'price' ? 'productPrice'
            : formattingTarget.field === 'description' ? 'productDescription' : 'productName';
        const fallbackSize = fontKey === 'menuTitle' ? 48 : fontKey === 'category' ? 24 : fontKey === 'productDescription' ? 14 : 18;
        const scope: MenuBorderScope = type === 'menuTitle' || type === 'menuSubtitle' ? 'header' :
            type === 'category' ? 'category' : type === 'freeText' ? 'freeText' :
            formattingTarget.field === 'price' ? 'price' : 'product';
        const border = scope === 'freeText' ? style.freeTextBorders?.[id] : style.borders?.[scope];
        const dividerLabel = type === 'product' ? 'Linha do produto' : 'Linha da categoria';
        const divider = type === 'category' || type === 'product' ? {
            label: dividerLabel,
            picker: <CategoryDividerPicker compact label={dividerLabel}
                value={type === 'category' ? resolveCategoryDivider(style, id) : style.productDividerStyles?.[id] || 'none'}
                color={type === 'category' ? style.primaryColor : style.textColor}
                onChange={(preset) => handlers.updateStyle?.((previous: MenuStyle) => {
                    const field = type === 'category' ? 'categoryDividerStyles' : 'productDividerStyles';
                    return { ...previous, [field]: { ...previous[field], [id]: preset }, name: 'Custom' };
                })}
            />,
        } : undefined;
        return <InlineStyleToolbar
                targetElementId={formattingTarget.elementId}
                positionTargetElementId={type === 'product' ? `product-name-${id}` : undefined}
                value={{ ...value, fontSize: clampFontSize(style, fontKey, value?.fontSize, fallbackSize) }}
                maxFontSize={fontSizeLimits[fontKey]}
                minFontSize={minimumFontSize}
                fallbackFontFamily={style.fontFamily}
                onChange={(newStyle) => handlers.handleInlineStyleChange?.(formattingTarget, newStyle)}
                onDismiss={() => {
                    if (type === 'product' && handlers.editingId === id) handlers.setEditingId(null);
                    handlers.setFormattingTarget?.(null);
                }}
                borderOffset={border?.offset}
                decoration={handlers.updateStyle ? (formatButtons) => (
                    <DecorationControls key={scope} style={style} setStyle={handlers.updateStyle} id={id} scope={scope} targetElementId={formattingTarget.elementId} divider={divider}>
                        {formatButtons}
                    </DecorationControls>
                ) : undefined}
                onAdjustPrice={type === 'product' && formattingTarget.field === 'price'
                    ? (direction: 1 | -1, amount: number, mode: PriceAdjustmentMode) => handlers.adjustProductPrice?.(id, direction, amount, mode)
                    : undefined}
            />;
    };
    const renderProductImageControls = (product: Product, isEditing: boolean) => (
        isEditing && product.image && imageMenuProductId === product.id && !formattingTarget ? (
            <ProductImageToolbar productId={product.id} anchorId={`product-image-${product.id}`} handlers={handlers} flips={style.productImageFlips?.[product.id]} />
        ) : null
    );
    const renderProductPhoto = (product: Product, isEditing: boolean, height: number, width: string, inCard = false) => {
        if (!style.showImages || !product.image) return null;
        const frame = style.productImageFrame;
        const hasFrame = frame && frame !== 'template';
        const background = inCard && style.design?.image === 'background' && !hasFrame;
        const imageRadius = style.borders?.productImage?.radius;
        const topRadius = Math.max(imageRadius ?? 0, style.borders?.product?.radius ?? getProductCardRadius(style));
        const photoRadius = !hasFrame && inCard
            ? background
                ? 'inherit'
                : `${topRadius}px ${topRadius}px ${imageRadius ?? 0}px ${imageRadius ?? 0}px`
            : getProductPhotoFrameRadius(frame, imageRadius);
        const flips = style.productImageFlips?.[product.id];
        return (
            <div
                id={handlers.readOnly ? undefined : `product-image-${product.id}`}
                data-template-image
                data-menu-border-surface="productImage"
                data-custom-border={getBorderOverride(style, 'productImage')}
                data-product-image-surface={product.id}
                data-product-photo-frame={hasFrame ? frame : undefined}
                className={`relative shrink-0 bg-slate-100 select-none ${isEditing ? 'cursor-pointer ring-2 ring-inset ring-indigo-400' : ''}`}
                style={{
                    width: inCard && hasFrame ? 'calc(100% - 16px)' : width,
                    height: frame === 'circle' ? 'auto' : height,
                    aspectRatio: frame === 'circle' ? '1' : undefined,
                    maxWidth: hasFrame ? (frame === 'circle' ? height : height * 1.75) : '100%',
                    margin: inCard && hasFrame ? '8px auto 0' : undefined,
                    borderRadius: photoRadius,
                }}
                title={isEditing ? 'Opções da imagem' : undefined}
                onPointerDown={(event) => { if (isEditing) event.stopPropagation(); }}
                onClick={(event) => openProductImageMenu(event, product.id, isEditing)}
            >
                <span className="absolute inset-0 block overflow-hidden" style={{ borderRadius: 'inherit' }}>
                    <img key={product.image} src={product.image} alt={product.name} draggable={false}
                        className="block h-full w-full"
                        style={{
                            objectFit: inCard && !hasFrame && !background && style.design?.image !== 'cover' ? 'contain' : 'cover',
                            objectPosition: `${product.imageAlignment || 'center'} center`,
                            transform: flips?.horizontal || flips?.vertical
                                ? `scale(${flips.horizontal ? -1 : 1}, ${flips.vertical ? -1 : 1})`
                                : undefined,
                        }}
                        onError={(event) => { event.currentTarget.hidden = true; }} />
                </span>
                <BorderDecoration style={style} scope="productImage" />
                {renderProductImageControls(product, isEditing)}
            </div>
        );
    };
    
    if (item.type === 'main-header') {
        const titleStyle = style.elementStyles?.menuTitle || {};
        const subStyle = style.elementStyles?.menuSubtitle || {};
        const hasSubtitle = Boolean(style.menuSubtitle?.trim());
        const showSubtitleDraft = !hasSubtitle && !handlers.readOnly &&
            (formattingTarget?.type === 'menuTitle' || formattingTarget?.type === 'menuSubtitle');
        const showSubtitle = hasSubtitle || showSubtitleDraft;
        const heroImage = style.design?.header === 'hero' && style.showImages && style.design.image !== 'none'
            ? products.find((product) => product.image && !product.isFreeText && !style.hiddenProductIds.includes(product.id))?.image : undefined;
        const isTitleSelected = handlers.isSelected?.('menuTitle', 'menuTitle') ?? handlers.selectedId === 'menuTitle';
        const isSubtitleSelected = handlers.isSelected?.('menuSubtitle', 'menuSubtitle') ?? handlers.selectedId === 'menuSubtitle';
        
        return (
            <header 
                key={`header-${idx}`} 
                data-block-id="main-header"
                data-pagination-item="main-header"
                data-template-header
                data-menu-border-surface="header" data-custom-border={getBorderOverride(style, 'header')}
                className={`text-center group relative pointer-events-auto ${isTitleSelected || isSubtitleSelected ? 'ring-2 ring-indigo-500' : ''}`}
                style={{ marginBottom: 0, borderRadius: style.borders?.header?.radius }}
            >
            <BorderDecoration style={style} scope="header" />
            {heroImage && <img src={heroImage} data-template-hero-image alt="" draggable={false} onError={(event) => { event.currentTarget.hidden = true; }} />}
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
                id={handlers.readOnly ? undefined : "menu-title-text"}
                data-menu-heading="title"
                className={`tracking-tight outline-none focus:bg-blue-50/50 rounded cursor-text ${isTitleSelected ? 'ring-2 ring-indigo-500 bg-indigo-50/20' : ''}`}
                style={{ 
                    color: `var(--automenu-preview-primary, ${titleStyle.color || style.primaryColor})`,
                    fontFamily: titleStyle.fontFamily || style.fontFamily,
                    fontSize: `${clampFontSize(style, 'menuTitle', titleStyle.fontSize, 48)}px`,
                    fontWeight: titleStyle.fontWeight || '700',
                    fontStyle: titleStyle.italic ? 'italic' : 'normal',
                    textDecoration: titleStyle.underline ? 'underline' : 'none',
                    textAlign: titleStyle.textAlign as any,
                    textTransform: titleStyle.textTransform,
                    marginBottom: `${showSubtitle ? (titleStyle.marginBottom ?? 10) : contentSpacing.headerToContent}px`
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
                contentEditable={handlers.readOnly ? undefined : true} suppressContentEditableWarning onBlur={(e) => handlers.handleBlur(e, 'menu', 'header', 'menuTitle')} onKeyDown={handlers.handleKeyDown}
            />
            {showSubtitle && <AutoFitText
                as="p"
                text={hasSubtitle ? style.menuSubtitle : ''}
                data-subtitle-placeholder={showSubtitleDraft ? 'Adicionar subtítulo' : undefined}
                data-print-control={showSubtitleDraft ? 'true' : undefined}
                aria-label={showSubtitleDraft ? 'Adicionar subtítulo' : undefined}
                baseFontSize={clampFontSize(style, 'menuSubtitle', subStyle.fontSize, 18)}
                minimumFontSize={minimumFontSize}
                allowSameWordBreak={allowSameWordBreak}
                fitScope="menuSubtitle"
                widthMode="parent"
                id={handlers.readOnly ? undefined : "menu-subtitle-text"}
                data-menu-heading="subtitle"
                className={`opacity-90 outline-none focus:bg-blue-50/50 rounded cursor-text empty:before:pointer-events-none empty:before:opacity-50 empty:before:content-[attr(data-subtitle-placeholder)] ${isSubtitleSelected ? 'ring-2 ring-indigo-500 bg-indigo-50/20' : ''}`}
                style={{
                    color: `var(--automenu-preview-primary, ${subStyle.color || style.textColor})`,
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
                contentEditable={handlers.readOnly ? undefined : true} suppressContentEditableWarning onBlur={(e) => handlers.handleBlur(e, 'menu', 'subheader', 'menuSubtitle')} onKeyDown={handlers.handleKeyDown}
            />
            }
            </header>
        );
    }

    if (item.type === 'category-header') {
        const isSelected = handlers.isSelected?.('category', item.data) ?? handlers.selectedId === item.data;
        const catStyle = style.elementStyles?.category || {};
        const elementId = `text-${item.data}`;
        const isBeingDragged = handlers.draggedItem?.type === 'category' && handlers.draggedItem?.id === item.data;
        const compactControls = (style.categoryColumnCount || 1) > 1;
        const categoryAlign = catStyle.textAlign || 'left';
        const categoryImage = style.categoryImages?.[item.data];
        const categoryImageScale = style.categoryImageScale || 1;
        const categoryDividerPreset = resolveCategoryDivider(style, item.data);
        const renderCategoryDivider = (key: 'before' | 'after') => (
            <CanvasTextDivider preset={categoryDividerPreset} color="var(--template-accent)" titleEdge={key === 'before' ? 'right' : 'left'} />
        );
        
        return (
            <div 
                key={`cat-header-${item.data}`}
                id={handlers.readOnly ? undefined : `category-header-${item.data}`}
                data-category-id={item.data} 
                data-pagination-item={getPaginationItemKey(item)}
                onPointerDown={(e) => handlers.handleDragStart(e, 'category', item.data)}
                onDragStart={(e) => e.preventDefault()}
                className={`automenu-drag-item relative group transition-all duration-200 select-none touch-auto cursor-grab pointer-events-auto ${isSelected || handlers.editingId === item.data ? 'z-[60]' : 'z-[1]'} ${inGroup ? 'px-2 pt-2' : 'hover:bg-black/5 rounded-lg'}`}
                style={{ 
                    marginBottom: `${contentSpacing.categoryToProduct}px`,
                    touchAction: handlers.editingId === item.data ? undefined : 'none'
                }}
                onContextMenu={(e) => handlers.openObjectMenu?.(e, { type: 'category', id: item.data })} 
                onClick={(e) => { e.stopPropagation(); if (handlers.editingId !== item.data) { handlers.handleSelection('category', item.data, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey }); handlers.setSelectedPageIndex(null); } }}
                onDoubleClick={(e) => e.stopPropagation()}
            >
                {renderFormattingToolbar('category', item.data, catStyle)}
            {!handlers.readOnly && <ProductControls type="category" catName={item.data} canMoveUp={false} canMoveDown={false} canMoveLeft={false} canMoveRight={false} handlers={handlers} isDragging={isBeingDragged || handlers.isResizingCategoryColumns} showSelectionOutline={false} showAddControls={false} showGridMoveControls={false}/>}
                <div data-template-category data-menu-border-surface="category" data-custom-border={getBorderOverride(style, 'category')} style={{ borderRadius: style.borders?.category?.radius }} className={`relative flex w-full max-w-full min-w-0 items-center gap-1 ${compactControls ? 'px-1' : 'px-2'} ${categoryAlign === 'center' ? 'justify-center' : categoryAlign === 'right' ? 'justify-end' : 'justify-start'}`}>
                    <BorderDecoration style={style} scope="category" />
                    <MenuMarkerGlyph marker={getMarker(style, 'category')} fontSize={clampFontSize(style, 'category', catStyle.fontSize, 24)}
                        index={handlers.sortedCategories.filter((id: string) => !id.startsWith(FREE_TEXT_PREFIX)).indexOf(item.data)} color="var(--template-accent)" />
                    {(categoryAlign === 'center' || categoryAlign === 'right') && renderCategoryDivider('before')}
                    {style.showCategoryImages !== false && categoryImage?.url && (
                        <img
                            src={categoryImage.url}
                            alt=""
                            draggable={false}
                            className="mr-2 shrink-0 object-contain"
                            style={{
                                width: `${(categoryImage.width || 36) * categoryImageScale}px`,
                                height: `${(categoryImage.height || 36) * categoryImageScale}px`,
                                maxWidth: '35%',
                            }}
                        />
                    )}
                    <AutoFitText
                        as="h2"
                        text={item.data}
                        baseFontSize={clampFontSize(style, 'category', catStyle.fontSize, 24)}
                        minimumFontSize={minimumFontSize}
                        allowSameWordBreak={allowSameWordBreak}
                        fitScope="category"
                        data-divider-title="true"
                        widthMode="flex"
                        id={handlers.readOnly ? undefined : elementId}
                        className={`min-w-0 max-w-full shrink whitespace-normal break-words [overflow-wrap:anywhere] [word-break:normal] outline-none rounded ${handlers.editingId === item.data ? 'bg-white ring-2 ring-blue-500 z-10 cursor-text' : ''}`}
                        style={{ 
                            color: `var(--automenu-preview-primary, ${catStyle.color || style.primaryColor})`,
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
        const productDividerPreset = style.productDividerStyles?.[product.id] || 'none';
        const showProductDivider = style.showPrices !== false && productDividerPreset !== 'none';
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
        const pageHeight = resolveMenuPageDimensions(style).heightPx;
        const customMarginTop = Number.isFinite(rawCustomMarginTop)
            ? Math.max(0, Math.min(pageHeight, rawCustomMarginTop))
            : 0;
        const productAddControls = handlers.getSelectionAddControls?.(productSelectionType, product.id) || { top: true, bottom: true };
        return (
                <div 
                    key={product.id}
                    id={handlers.readOnly ? undefined : `product-container-${product.id}`}
                    data-drag-scope={handlers.dragScope}
                    data-drag-type={handlers.readOnly && backgroundText ? undefined : 'product'}
                    data-drag-id={handlers.readOnly && backgroundText ? undefined : product.id}
                    data-template-product={product.isFreeText ? undefined : true}
                    data-menu-border-surface={product.isFreeText ? 'freeText' : 'product'} data-custom-border={getBorderOverride(style, product.isFreeText ? 'freeText' : 'product', product.id)}
                    data-pagination-item={getPaginationItemKey(item)}
                    data-drag-group={item.category}
                    onPointerDown={backgroundText ? undefined : (e) => handlers.handleDragStart(e, 'product', product.id, item.category)}
                    onDragStart={(e) => e.preventDefault()}
                    onContextMenu={(e) => handlers.openObjectMenu?.(e, { type: productSelectionType, id: product.id })} 
                    onClick={(e) => { e.stopPropagation(); if (handlers.editingId !== product.id) { handlers.handleSelection(productSelectionType, product.id, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey }); handlers.setSelectedPageIndex(null); } }}
                    onDoubleClick={(e) => e.stopPropagation()} 
                    className={`automenu-drag-item relative group rounded-lg transition-all duration-200 ${handlers.readOnly && backgroundText ? 'pointer-events-none' : 'pointer-events-auto'} ${product.isFreeText ? 'p-1' : 'p-2'} ${isEditing ? 'select-text touch-auto cursor-text' : backgroundText ? 'select-none touch-auto cursor-pointer' : 'select-none touch-auto cursor-grab'} ${isSelected || isEditing ? 'z-[60]' : 'z-[1]'} ${inGroup ? 'ml-0 mb-0' : '-ml-2 mb-2 hover:bg-black/5'} ${isSelected && !isEditing ? 'bg-indigo-50/30' : ''} ${product.isFreeText ? 'transition-none flex-none' : ''}`}
                    style={{
                        width: product.isFreeText ? (product.freeTextWidth ? `${product.freeTextWidth}px` : 'fit-content') : undefined,
                        maxWidth: product.isFreeText ? '100%' : undefined,
                        touchAction: product.isFreeText && !isEditing && !backgroundText && !handlers.readOnly ? 'none' : undefined,
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
                <BorderDecoration style={style} scope={product.isFreeText ? 'freeText' : 'product'} id={product.id} />
                {isSelected && handlers.selectedId === product.id && !isFreeTextGhost && !backgroundText && !handlers.editingId && (
                    <ColumnResizeHandles
                        columnIndex={columnIndex}
                        columnCount={renderedCategoryColumnCount || categoryColumnCount}
                        onResizeStart={handlers.startCategoryColumnResize}
                    />
                )}
                {product.isFreeText && isSelected && !handlers.isResizingCategoryColumns && (
                    <FreeTextResizeHandles product={product} style={style} handlers={handlers} />
                )}
                {product.isFreeText
                    ? renderFormattingToolbar('freeText', product.id, product.styles || {})
                    : renderFormattingToolbar('product', product.id,
                        formattingTarget?.field === 'price' ? priceStyle : formattingTarget?.field === 'description' ? descStyle : nameStyle)}
                        {!handlers.readOnly && <ProductControls type="product" id={product.id} catName={item.category} canMoveUp={!backgroundText && canMoveUp} canMoveDown={!backgroundText && canMoveDown} canMoveLeft={false} canMoveRight={false} isFreeText={product.isFreeText} handlers={handlers} isDragging={isBeingDragged || handlers.isResizingCategoryColumns} showTopAddControl={productAddControls.top} showBottomAddControl={productAddControls.bottom} showGridMoveControls={productColumnCount > 1}/>}
                
                <div className={`transition-opacity duration-150 ${isBeingDragged && !product.isFreeText ? 'opacity-40' : ''}`}>
                {product.isFreeText ? (
                    <div
                        className="relative w-fit min-w-0 max-w-full leading-snug break-words [overflow-wrap:anywhere]"
                        style={{ textAlign: nameStyle.textAlign || 'left' }}
                    >
                            <AutoFitText
                            as="span"
                            text={product.name}
                            baseFontSize={clampFontSize(style, 'freeText', nameStyle.fontSize, 18)}
                            minimumFontSize={minimumFontSize}
                            allowSameWordBreak={allowSameWordBreak}
                            fitScope="freeText"
                            disableAutoFit
                            containerSelector={`#product-container-${product.id}`}
                            id={handlers.readOnly ? undefined : `product-name-${product.id}`} data-product-edit-id={product.id} className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] outline-none rounded ${isEditing ? 'bg-indigo-500/15 ring-2 ring-blue-500 cursor-text select-text touch-auto pointer-events-auto' : ''}`}
                            style={{ 
                                color: nameStyle.color || style.textColor,
                                fontFamily: nameStyle.fontFamily,
                                fontSize: `${clampFontSize(style, 'freeText', nameStyle.fontSize, 18)}px`,
                                fontWeight: nameStyle.fontWeight,
                                fontStyle: nameStyle.italic ? 'italic' : 'normal',
                                textDecoration: nameStyle.underline ? 'underline' : 'none',
                                textTransform: nameStyle.textTransform,
                                letterSpacing: nameStyle.letterSpacing ? `${nameStyle.letterSpacing}px` : undefined
                            }}
                            contentEditable={isEditing} suppressContentEditableWarning onBlur={(e) => {
                                const container = document.getElementById(`product-container-${product.id}`);
                                const pendingWidth = Number(container?.dataset.pendingFreeTextWidth);
                                if (Number.isFinite(pendingWidth) && pendingWidth > 0) {
                                    handlers.updateProduct?.(product.id, 'freeTextWidth', pendingWidth);
                                    delete container?.dataset.pendingFreeTextWidth;
                                }
                                handlers.handleBlur(e, 'product', product.id, 'name');
                            }} onKeyDown={handlers.handleKeyDown} onInput={(e) => {
                                if (!isEditing) return;
                                const container = document.getElementById(`product-container-${product.id}`);
                                if (!container) return;
                                const maximumWidth = getFreeTextMaximumWidth(container);
                                const nextWidth = getFreeTextContentWidth(e.currentTarget, maximumWidth);
                                container.style.width = `${nextWidth}px`;
                                container.dataset.pendingFreeTextWidth = String(nextWidth);
                            }} onFocus={(e) => clearDefaultTextOnFocus(e.currentTarget, ['Novo texto'])} onMouseDown={(e) => { if(!isEditing) e.preventDefault(); }} onPointerDown={(e) => { if (isEditing) e.stopPropagation(); }}
                            />
                    </div>
                ) : (
                <div className={`flex items-start justify-between ${stackImage ? 'flex-col gap-2' : compactControls ? 'gap-2' : 'gap-4'}`}>
                    {renderProductPhoto(product, isEditing, templateProductImageHeight(style, imageSizePx), stackImage ? '100%' : `${imageSizePx}px`)}
                    <div className={`flex-grow min-w-0 ${stackImage ? 'w-full' : ''} ${isNameCentered ? 'text-center' : isNameRight ? 'text-right' : 'text-left'}`}>
                         <div
                            data-product-text-row="true"
                            className={`flex min-w-0 flex-wrap ${isNameCentered ? 'items-center' : 'items-start'}`}
                            style={{
                                marginBottom: contentSpacing.productNameToDescription,
                                columnGap: showProductDivider ? 5 : contentSpacing.productNameToPrice,
                                rowGap: 2,
                            }}
                         >
                            <div className={`flex min-w-0 items-center gap-2 ${isNameCentered ? 'justify-center' : isNameRight ? 'justify-end' : ''}`} style={{ flex: showProductDivider ? '0 1 auto' : '1 1 auto' }}>
                                <MenuMarkerGlyph marker={getMarker(style, 'product')} fontSize={clampFontSize(style, 'productName', nameStyle.fontSize, 18)}
                                    index={visibleCatProducts.filter((candidate: Product) => !candidate.isFreeText).findIndex((candidate: Product) => candidate.id === product.id)}
                                    color="var(--template-accent)" />
                                <AutoFitText
                                    as="h3"
                                    text={product.name}
                                    baseFontSize={clampFontSize(style, 'productName', nameStyle.fontSize, 18)}
                                    minimumFontSize={minimumFontSize}
                                    allowSameWordBreak={allowSameWordBreak}
                                    fitScope="productName"
                                    data-divider-title="true"
                                    widthMode="flex"
                                    containerSelector="[data-product-text-row]"
                                    id={handlers.readOnly ? undefined : `product-name-${product.id}`} data-product-edit-id={product.id} className={`min-w-0 max-w-full break-words [overflow-wrap:anywhere] [word-break:normal] leading-snug outline-none rounded ${isEditing ? 'bg-indigo-500/15 ring-2 ring-blue-500 cursor-text select-text touch-auto pointer-events-auto' : ''}`}
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
                            </div>
                            {showProductDivider && (
                                <CanvasTextDivider preset={productDividerPreset} color={style.textColor} titleEdge="left" />
                            )}
                            {style.showPrices !== false && <div
                              data-template-price data-menu-border-surface="price" data-custom-border={getBorderOverride(style, 'price')} className="relative ml-auto flex min-w-0 shrink-0 items-center gap-1 whitespace-nowrap"
                              style={{ 
                                borderRadius: style.borders?.price?.radius,
                                justifyContent: priceStyle.textAlign === 'left' ? 'flex-start' : (priceStyle.textAlign === 'center' ? 'center' : 'flex-end'), 
                                display: 'flex',
                                color: `var(--automenu-preview-text, ${priceStyle.color || style.textColor})`,
                                fontFamily: priceStyle.fontFamily,
                                fontSize: `${clampFontSize(style, 'productPrice', priceStyle.fontSize, 18)}px`,
                                fontWeight: priceStyle.fontWeight,
                                fontStyle: priceStyle.italic ? 'italic' : 'normal',
                                textDecoration: priceStyle.underline ? 'underline' : 'none',
                                textTransform: priceStyle.textTransform,
                                letterSpacing: priceStyle.letterSpacing ? `${priceStyle.letterSpacing}px` : undefined,
                              }}
                            >
                                <BorderDecoration style={style} scope="price" />
                                {style.showCurrencySymbol !== false && <span data-border-text className="mr-[1px] select-none touch-auto">R$</span>}
                                <AutoFitText
                                    as="span"
                                    text={formatMenuPriceValue(product.price, style)}
                                    baseFontSize={clampFontSize(style, 'productPrice', priceStyle.fontSize, 18)}
                                    minimumFontSize={minimumFontSize}
                                    allowSameWordBreak={false}
                                    fitScope="productPrice"
                                    containerSelector="[data-product-text-row]"
                                    id={handlers.readOnly ? undefined : `product-price-${product.id}`} data-product-edit-id={product.id} className={`whitespace-nowrap outline-none rounded ${isEditing ? 'bg-indigo-500/15 ring-2 ring-blue-500 cursor-text select-text touch-auto pointer-events-auto' : ''}`}
                                    style={{ 
                                        color: `var(--automenu-preview-text, ${priceStyle.color || style.textColor})`,
                                        fontFamily: priceStyle.fontFamily,
                                        fontSize: `${clampFontSize(style, 'productPrice', priceStyle.fontSize, 18)}px`,
                                        fontWeight: priceStyle.fontWeight,
                                        fontStyle: priceStyle.italic ? 'italic' : 'normal',
                                        textDecoration: priceStyle.underline ? 'underline' : 'none',
                                        textAlign: priceStyle.textAlign,
                                        display: 'inline-block'
                                    }}
                                    contentEditable={isEditing} tabIndex={isEditing ? 0 : undefined} inputMode="decimal" enterKeyHint="done" suppressContentEditableWarning onBlur={(e) => { replacePriceOnNextInputRef.current.delete(product.id); handlers.handleBlur(e, 'product', product.id, 'price'); }} onKeyDown={(e) => handlePriceKeyDown(e, product.id)} onBeforeInput={(e) => handlePriceBeforeInput(e, product.id)} onPaste={(e) => handlePricePaste(e, product.id)} onFocus={(e) => handlePriceFocus(e, product.id)} onPointerDown={(e) => { if (isEditing) e.stopPropagation(); }} onClick={(e) => { if (isEditing) e.stopPropagation(); }}
                                />
                            </div>}
                        </div>
                        <AutoFitText
                            as="p"
                            text={product.description}
                            baseFontSize={clampFontSize(style, 'productDescription', descStyle.fontSize, 14)}
                            minimumFontSize={minimumFontSize}
                            allowSameWordBreak={allowSameWordBreak}
                            fitScope="productDescription"
                            widthMode="parent"
                            data-template-description id={handlers.readOnly ? undefined : `product-description-${product.id}`} data-product-edit-id={product.id} className={`max-w-full opacity-80 break-words [overflow-wrap:anywhere] [word-break:normal] leading-relaxed outline-none rounded ${isEditing ? 'min-h-[1.5em] bg-indigo-500/15 ring-2 ring-blue-500 cursor-text select-text touch-auto pointer-events-auto' : ''}`}
                            style={{ 
                                color: `var(--automenu-preview-text, ${descStyle.color || style.textColor})`,
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

    if (item.type === 'free-text-row') {
        return (
            <div data-pagination-item={getPaginationItemKey(item)} className="flex min-w-0 max-w-full flex-wrap items-start gap-2 pointer-events-none">
                {(item.data as Product[]).map((product) => (
                    <MenuItem
                        key={product.id}
                        item={{ type: 'product-item', data: product, category: item.category }}
                        idx={idx}
                        style={style}
                        handlers={handlers}
                        products={products}
                        inGroup={true}
                        columnIndex={columnIndex}
                        categoryColumnCount={renderedCategoryColumnCount}
                    />
                ))}
            </div>
        );
    }

    if (item.type === 'product-row') {
        const imgScale = style.imageScale || 1;
        const productColumnCount = style.columnCount || 1;
        const categoryColumnCount = style.categoryColumnCount || 1;
        const isCardLayout = style.layoutMode === 'cards' || (style.design ? style.design.card !== 'flat' : style.layoutMode === 'grid');
        const cardRadius = getProductCardCornerRadii(style, style.borders?.product?.radius ?? getProductCardRadius(style));
        const cardBackgroundColor = style.cardBackgroundColor || '#ffffff';
        const compactControls = categoryColumnCount > 1 || productColumnCount > 1;
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
            <div
                key={`row-${idx}`}
                data-pagination-grid="true"
                className="grid"
                style={{
                    gridTemplateColumns: `repeat(${productColumnCount}, minmax(0, 1fr))`,
                    columnGap: `${productGridGap}px`,
                    rowGap: `${contentSpacing.betweenProducts}px`,
                    marginBottom: contentSpacing.betweenProducts,
                }}
            >
                {(item.data as Product[]).map((product, productColumnIndex) => {
                     const isSelected = handlers.isSelected?.('product', product.id) ?? handlers.selectedId === product.id;
                     const nameStyle = style.elementStyles?.productName || {};
                     const priceStyle = style.elementStyles?.productPrice || {};
                     const descStyle = style.elementStyles?.productDescription || {};
                     const productDividerPreset = style.productDividerStyles?.[product.id] || 'none';
                     const showProductDivider = style.showPrices !== false && productDividerPreset !== 'none';
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
                     const renderedProductColumnIndex = productColumnIndex % productColumnCount;
                     const canMoveLeft = productColumnCount > 1 && renderedProductColumnIndex > 0;
                     const canMoveRight = productColumnCount > 1 && renderedProductColumnIndex < productColumnCount - 1;
                     const isBeingDragged = handlers.draggedItem?.id === product.id;
                     const isEditing = handlers.editingId === product.id;
                     const productAddControls = handlers.getSelectionAddControls?.('product', product.id) || { top: true, bottom: true };
                     return (
                            <div 
                                key={product.id}
                                id={handlers.readOnly ? undefined : `product-container-${product.id}`}
                                data-drag-scope={handlers.dragScope}
                                data-drag-type="product"
                                data-drag-id={product.id}
                                data-template-product={product.isFreeText ? undefined : true}
                                data-menu-border-surface="product" data-custom-border={getBorderOverride(style, 'product')}
                                data-product-card-surface={isCardLayout || undefined}
                                data-product-card-shape={isCardLayout ? style.productCardShape || 'template' : undefined}
                                data-drag-group={item.category}
                                onPointerDown={(e) => handlers.handleDragStart(e, 'product', product.id, item.category)}
                                onDragStart={(e) => e.preventDefault()}
                                onContextMenu={(e) => handlers.openObjectMenu?.(e, { type: 'product', id: product.id })} 
                                onClick={(e) => { e.stopPropagation(); handlers.handleSelection('product', product.id, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey }); handlers.setSelectedPageIndex(null); }}
                                className={`automenu-drag-item relative group min-w-0 transition-all pointer-events-auto p-0 ${isEditing ? 'select-text touch-auto cursor-text' : 'select-none touch-auto cursor-grab'} ${isCardLayout ? 'rounded-xl' : 'rounded-lg'} ${isSelected || isEditing ? 'z-[60] bg-indigo-50/30' : 'z-[1] hover:bg-black/5'}`}
                                style={isCardLayout ? { borderRadius: cardRadius } : undefined}
                            >
                                <BorderDecoration style={style} scope="product" />
                                {isSelected && handlers.selectedId === product.id && !handlers.editingId && (
                                    <ColumnResizeHandles columnIndex={columnIndex} columnCount={categoryColumnCount}
                                        onResizeStart={handlers.startCategoryColumnResize} />
                                )}
                                {renderFormattingToolbar('product', product.id,
                                    formattingTarget?.field === 'price' ? priceStyle : formattingTarget?.field === 'description' ? descStyle : nameStyle)}
                            {!handlers.readOnly && <ProductControls type="product" id={product.id} catName={item.category} canMoveUp={canMoveUp} canMoveDown={canMoveDown} canMoveLeft={canMoveLeft} canMoveRight={canMoveRight} isFreeText={product.isFreeText} handlers={handlers} isDragging={isBeingDragged || handlers.isResizingCategoryColumns} showTopAddControl={productAddControls.top} showBottomAddControl={productAddControls.bottom} showGridMoveControls={productColumnCount > 1}/>}
                                
                                <div
                                    data-template-card
                                    data-card-layout={isCardLayout || undefined}
                                    data-product-image-editing={isEditing || undefined}
                                    data-card-color-custom={style.cardBackgroundColorOverride || undefined}
                                    data-custom-border={getBorderOverride(style, 'product')}
                                    className={`h-full min-w-0 transition-all duration-150 ${isCardLayout ? 'border border-slate-200 shadow-sm' : 'bg-transparent'} ${isBeingDragged ? 'opacity-40' : isCardLayout ? 'group-hover:shadow-md' : ''}`}
                                    style={isCardLayout ? { backgroundColor: `var(--automenu-preview-cards, ${cardBackgroundColor})`, borderRadius: cardRadius } : undefined}
                                >
                                    <div data-product-card-content className="h-full flex flex-col" style={{ borderRadius: 'inherit' }}>
                                        {renderProductPhoto(product, isEditing, templateProductImageHeight(style, cardImageHeight), '100%', true)}
                                        <div data-template-content className={`${isCardLayout ? (categoryColumnCount > 1 || productColumnCount > 2 ? 'p-1.5' : productColumnCount > 1 ? 'p-2' : 'p-4') : 'py-2'} flex min-w-0 flex-col flex-grow ${textAlignClass}`}>
                                            <div
                                                data-product-text-row="true"
                                                className={`flex min-w-0 flex-wrap ${showProductDivider ? 'items-center' : 'items-start'}`}
                                                style={{
                                                    marginBottom: contentSpacing.productNameToDescription,
                                                    columnGap: showProductDivider ? 5 : contentSpacing.productNameToPrice,
                                                    rowGap: 2,
                                                }}
                                            >
                                                <div className={`flex min-w-0 items-center gap-1 ${nameStyle.textAlign === 'center' ? 'justify-center' : nameStyle.textAlign === 'right' ? 'justify-end' : 'justify-start'}`} style={{ flex: showProductDivider ? '0 1 auto' : '1 1 auto' }}>
                                                    <MenuMarkerGlyph marker={getMarker(style, 'product')} fontSize={clampFontSize(style, 'productName', nameStyle.fontSize, 18)}
                                                        index={visibleCatProducts.filter((candidate: Product) => !candidate.isFreeText).findIndex((candidate: Product) => candidate.id === product.id)}
                                                        color="var(--template-accent)" />
                                                    <AutoFitText
                                                        as="h3"
                                                        text={product.name}
                                                        baseFontSize={clampFontSize(style, 'productName', nameStyle.fontSize, 18)}
                                                        minimumFontSize={minimumFontSize}
                                                        allowSameWordBreak={allowSameWordBreak}
                                                        fitScope="productName"
                                                        data-divider-title="true"
                                                        widthMode="flex"
                                                        containerSelector="[data-product-text-row]"
                                                        id={handlers.readOnly ? undefined : `product-name-${product.id}`}
                                                        data-product-edit-id={product.id}
                                                        className={`min-w-0 max-w-full break-words [overflow-wrap:anywhere] [word-break:normal] leading-snug outline-none rounded ${isEditing ? 'bg-indigo-500/15 ring-2 ring-blue-500 cursor-text select-text touch-auto pointer-events-auto' : ''}`}
                                                        style={{ color: `var(--automenu-preview-text, ${nameStyle.color || style.textColor})`, fontFamily: nameStyle.fontFamily, fontSize: clampFontSize(style, 'productName', nameStyle.fontSize, 18), fontWeight: nameStyle.fontWeight, fontStyle: nameStyle.italic ? 'italic' : 'normal', textDecoration: nameStyle.underline ? 'underline' : 'none', textAlign: nameStyle.textAlign, textTransform: nameStyle.textTransform }}
                                                        contentEditable={isEditing}
                                                        suppressContentEditableWarning
                                                        onBlur={(e) => handlers.handleBlur(e, 'product', product.id, 'name')}
                                                        onKeyDown={handlers.handleKeyDown}
                                                        onFocus={(e) => { if (!isEditing) return; handlers.setProductEditingField?.(product.id, 'name', `product-name-${product.id}`); handleMobileFocusScroll(e.currentTarget); }}
                                                        tabIndex={isEditing ? 0 : undefined}
                                                        onPointerDown={(e) => { if (isEditing) e.stopPropagation(); }}
                                                        onClick={(e) => { if (isEditing) e.stopPropagation(); }}
                                                    />
                                                </div>
                                                {showProductDivider && (
                                                    <CanvasTextDivider preset={productDividerPreset} color={style.textColor} titleEdge="left" />
                                                )}
                                                {style.showPrices !== false && <div
                                                    data-template-price data-menu-border-surface="price" data-custom-border={getBorderOverride(style, 'price')} className={`relative ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap ${isCardLayout ? `rounded-full bg-white/90 border border-black/5 shadow-sm ${compactControls ? 'px-1.5 py-0.5' : 'px-2.5 py-1'}` : ''}`}
                                                    style={{ borderRadius: style.borders?.price?.radius, color: `var(--automenu-preview-text, ${priceStyle.color || style.textColor})`, fontFamily: priceStyle.fontFamily, fontSize: clampFontSize(style, 'productPrice', priceStyle.fontSize, 18), fontWeight: priceStyle.fontWeight, fontStyle: priceStyle.italic ? 'italic' : 'normal', textDecoration: priceStyle.underline ? 'underline' : 'none', textTransform: priceStyle.textTransform, letterSpacing: priceStyle.letterSpacing ? `${priceStyle.letterSpacing}px` : undefined }}
                                                >
                                                    <BorderDecoration style={style} scope="price" />
                                                    {style.showCurrencySymbol !== false && <span data-border-text className="select-none touch-auto">R$</span>}
                                                    <AutoFitText
                                                        as="span"
                                                        text={formatMenuPriceValue(product.price, style)}
                                                        baseFontSize={clampFontSize(style, 'productPrice', priceStyle.fontSize, 18)}
                                                        minimumFontSize={minimumFontSize}
                                                        allowSameWordBreak={false}
                                                        fitScope="productPrice"
                                                        containerSelector="[data-product-text-row]"
                                                        id={handlers.readOnly ? undefined : `product-price-${product.id}`}
                                                        data-product-edit-id={product.id}
                                                        className={`whitespace-nowrap outline-none rounded ${isEditing ? 'bg-indigo-500/15 ring-2 ring-blue-500 cursor-text select-text touch-auto pointer-events-auto' : ''}`}
                                                        style={{ textAlign: priceStyle.textAlign }}
                                                        contentEditable={isEditing}
                                                        tabIndex={isEditing ? 0 : undefined}
                                                        inputMode="decimal"
                                                        enterKeyHint="done"
                                                        suppressContentEditableWarning
                                                        onBlur={(e) => { replacePriceOnNextInputRef.current.delete(product.id); handlers.handleBlur(e, 'product', product.id, 'price'); }}
                                                        onKeyDown={(e) => handlePriceKeyDown(e, product.id)}
                                                        onBeforeInput={(e) => handlePriceBeforeInput(e, product.id)}
                                                        onPaste={(e) => handlePricePaste(e, product.id)}
                                                        onFocus={(e) => handlePriceFocus(e, product.id)}
                                                        onPointerDown={(e) => { if (isEditing) e.stopPropagation(); }}
                                                        onClick={(e) => { if (isEditing) e.stopPropagation(); }}
                                                    />
                                                </div>}
                                            </div>
                                            <AutoFitText
                                                as="p"
                                                text={product.description}
                                                baseFontSize={clampFontSize(style, 'productDescription', descStyle.fontSize, 14)}
                                                minimumFontSize={minimumFontSize}
                                                allowSameWordBreak={allowSameWordBreak}
                                                fitScope="productDescription"
                                                widthMode="parent"
                                                data-template-description id={handlers.readOnly ? undefined : `product-description-${product.id}`}
                                                data-product-edit-id={product.id}
                                                className={`max-w-full opacity-75 break-words [overflow-wrap:anywhere] [word-break:normal] flex-grow outline-none rounded ${isEditing ? 'min-h-[1.5em] bg-indigo-500/15 ring-2 ring-blue-500 cursor-text select-text touch-auto pointer-events-auto' : 'line-clamp-4'}`}
                                                style={{ color: `var(--automenu-preview-text, ${descStyle.color || style.textColor})`, fontFamily: descStyle.fontFamily, fontSize: clampFontSize(style, 'productDescription', descStyle.fontSize, 14), fontWeight: descStyle.fontWeight, fontStyle: descStyle.italic ? 'italic' : 'normal', textDecoration: descStyle.underline ? 'underline' : 'none', textAlign: descStyle.textAlign }}
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
