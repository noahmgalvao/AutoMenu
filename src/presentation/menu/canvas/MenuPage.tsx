import { canvasShapeUrl as decorationUrl } from '../../../domain/menu/canvasShapes';
import { CanvasRotationHandle, CanvasScaleHandles } from './CanvasTransformHandles';
import { getTextOutlineStyle } from './textOutlineStyle';
import { getContentLayer, getImageLayer } from '../../../domain/menu/imageLayers';
import { CanvasLayerImage } from './CanvasLayerImage';
import { PhotoLoading } from './MenuPhoto';
import type { SelectionItem } from '../interactions/types';
import { getTemplateColors, getTemplateDesignAttributes, templateFontStack } from './templateStyles';
import '../designer/templateDesign.css';
import React from 'react';
import { resolveMenuPriceDecimalPlaces } from '../../../domain/menu/price';
import type { AddedImage, Product, MenuStyle } from '../../../domain/menu/model';
import { Crop, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CopyCheck, MoreHorizontal, Plus, Edit3, Trash2 } from 'lucide-react';
import { Resizable } from 're-resizable';
import { MenuItem } from './MenuItem';
import { CanvasActionGroup, CanvasFlowActions, canvasActionButtonClass } from './CanvasControls';
import type { PageLayout, CategoryChunkLayout, PageItem } from '../../../domain/menu/menuPagination';
import { FREE_TEXT_PREFIX } from '../../../domain/menu/flow';
import { selectionLayerClasses } from './selectionLayers';
import { getDirectionLabel, type FlowDirection } from './flowControls';
import { resolveTexture } from '../../../domain/menu/defaults';
import { InlineStyleToolbar } from '../designer/InlineStyleToolbar';
import { resolveMenuMargins, resolveMinimumFontSize, roundFontSize } from '../../../domain/menu/styleRules';
import { getColumnGridTemplate, getPageColumnWidths } from '../../../domain/menu/categoryColumns';
import { ColumnResizeHandles } from './ColumnResizeHandles';
import { isMiniFoodKind, MINI_FOODS } from '../../../domain/menu/miniFoods';
import { canvasShapeUrl, applyCanvasShapeParameters, getSelectedLayerIds, getShapeTextStyle } from '../../../domain/menu/canvasShapes';
import { ShapeTextEditor } from './ShapeTextEditor';
import { ShapeSettings } from '../designer/ShapePicker';
import { resolveMenuPageDimensions } from '../../../domain/menu/pageSetup';
import { BorderDecoration } from '../designer/Decorations';

const CategoryMoveIcon = ({ direction }: { direction: FlowDirection }) => {
    if (direction === 'left') return <ChevronLeft size={18} />;
    if (direction === 'right') return <ChevronRight size={18} />;
    if (direction === 'bottom') return <ChevronDown size={18} />;
    return <ChevronUp size={18} />;
};

const getCategoryMoveDirection = (direction: FlowDirection) => {
    if (direction === 'left' || direction === 'right') return direction;
    return direction === 'top' ? 'up' : 'down';
};

const PositionedCategoryChunk: React.FC<
    React.HTMLAttributes<HTMLDivElement> & {
        desiredPageY?: number;
        desiredPageX?: number;
        absolutePageX?: number;
        flowOffsetBefore?: number;
        detachedForDrag?: boolean;
        detachedFromFlow?: boolean;
        fitContent?: boolean;
        pageIndex: number;
        layoutKey: string;
    }
> = ({ desiredPageY, desiredPageX, absolutePageX, flowOffsetBefore = 0, detachedForDrag = false, detachedFromFlow = false, fitContent = false, pageIndex, layoutKey, style, children, ...props }) => {
    const elementRef = React.useRef<HTMLDivElement>(null);
    const [position, setPosition] = React.useState({ top: 0, left: 0 });
    const isFreePositioned = detachedFromFlow && Number.isFinite(desiredPageY);

    React.useLayoutEffect(() => {
        const element = elementRef.current;
        if (!isFreePositioned || !element) return;
        const page = element.closest<HTMLElement>(`[data-page-index="${pageIndex}"]`);
        const column = element.closest<HTMLElement>('[data-drag-column-container="category"]');
        if (!page || !column) return;

        const updatePosition = () => {
            const pageRect = page.getBoundingClientRect();
            const columnRect = column.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();
            const scale = Math.max(0.001, pageRect.width / Math.max(1, page.offsetWidth));
            const top = (pageRect.top - columnRect.top) / scale + Number(desiredPageY);
            const maximumLeft = Math.max(0, (columnRect.width - elementRect.width) / scale);
            const left = absolutePageX !== undefined
                ? (pageRect.left - columnRect.left) / scale + absolutePageX
                : Math.max(0, Math.min(maximumLeft, Number(desiredPageX) || 0));
            setPosition((current) => current.top === top && current.left === left ? current : { top, left });
        };

        updatePosition();
        const observer = new ResizeObserver(updatePosition);
        observer.observe(page);
        observer.observe(column);
        observer.observe(element);
        return () => observer.disconnect();
    }, [absolutePageX, desiredPageX, desiredPageY, isFreePositioned, layoutKey, pageIndex]);

    return (
        <div
            {...props}
            ref={elementRef}
            data-free-positioned={isFreePositioned ? 'true' : undefined}
            data-page-positioned-text={isFreePositioned && absolutePageX !== undefined ? 'true' : undefined}
            data-category-flow-offset={flowOffsetBefore || undefined}
            style={{
                ...style,
                marginTop: flowOffsetBefore || undefined,
                zIndex: detachedForDrag ? 40 : undefined,
                ...(isFreePositioned ? {
                    position: 'absolute',
                    top: position.top,
                    left: position.left,
                    width: fitContent ? 'max-content' : '100%',
                    maxWidth: absolutePageX !== undefined ? `calc(var(--menu-page-width) - ${absolutePageX}px)` : '100%',
                } : {}),
            }}
        >
            {children}
        </div>
    );
};

export type AddedImagePreview = Pick<AddedImage, 'url' | 'x' | 'y' | 'width'> & {
    pageIndex: number;
    aspect: number;
    onAspect: (aspect: number) => void;
};

interface MenuPageProps {
    addedImagePreview?: AddedImagePreview;
    pageIndex: number;
    readOnly?: boolean;
    page: PageLayout;
    style: MenuStyle;
    handlers: any;
    products: Product[];
    needsOverlay: boolean;
    pageCount: number;
    onAddPage: (index: number, position: 'before' | 'after') => void;
    onMovePage?: (index: number, direction: 'before' | 'after') => void;
    onDeletePage: (index: number) => void;
    onSetPageNumbersVisible: (visible: boolean) => void;
}

export const MenuPage: React.FC<MenuPageProps> = ({
    pageIndex,
    readOnly = false,
    page,
    style,
    handlers,
    products,
    needsOverlay,
    pageCount,
    onAddPage,
    onMovePage,
    onDeletePage,
    onSetPageNumbersVisible,
    addedImagePreview,
}) => {
    const isPageSelected = handlers.isSelected?.('page', String(pageIndex)) ?? handlers.selectedPageIndex === pageIndex;
    const pageAddControls = handlers.getPageAddControls?.(pageIndex) || { before: true, after: true };
    const backgroundPhoto = style.menuBackgroundPhoto?.url;
    const pageBackground = (style.pageBackgrounds || [])
        .find((background) => background.pageIndex === pageIndex);
    const texture = resolveTexture(pageBackground?.url || style.backgroundImage,
        style.miniFoodTextureColor, style.miniFoodTextureScale);
    const isImportedMenu = style.templateBackgroundFit === 'fill' || style.sourceType === 'ai_import' && style.appliedTemplateId === undefined;
    const backgroundSource = texture.url || (style.appliedTemplateId === undefined && !isImportedMenu ? style.sourceImage : '');
    const decorativeBackground = {
        texture: 'repeating-linear-gradient(35deg, transparent 0 6px, rgba(140, 110, 80, .046) 6px 7px)',
        split: 'linear-gradient(90deg, var(--template-tint) 0 34%, transparent 34%)',
        'accent-blocks': 'linear-gradient(145deg, var(--template-tint) 0 20%, transparent 20% 82%, var(--template-tint) 82%)',
        solid: 'none',
    };
    const renderedColumnCount = page.columnCount || page.columns.length || style.categoryColumnCount || 1;
    const renderedStyle = renderedColumnCount === (style.categoryColumnCount || 1)
        ? style
        : { ...style, categoryColumnCount: renderedColumnCount as 1 | 2 | 3 };
    const pageNumberStyle = style.elementStyles?.pageNumber || {};
    const priceDecimalPlaces = React.useMemo(() => resolveMenuPriceDecimalPlaces(style, products), [style.priceDecimalPlaces, products]);
    const minimumFontSize = resolveMinimumFontSize(style);
    const pageNumberFontSize = roundFontSize(Math.max(minimumFontSize, Math.min(50, Number(pageNumberStyle.fontSize) || 14)), 14);
    const pageNumberElementId = `page-number-${pageIndex}`;
    const showPageNumbers = style.showPageNumbers !== false;
    const isFormattingPageNumber = handlers.formattingTarget?.type === 'pageNumber'
        && handlers.formattingTarget?.elementId === pageNumberElementId;
    const margins = resolveMenuMargins(style);
    const pageDimensions = resolveMenuPageDimensions(style);
    const categoryColumnWidths = getPageColumnWidths(
        style,
        renderedColumnCount,
        handlers.liveCategoryColumnWidths,
    );

    const [shapeTextEditingId, setShapeTextEditingId] = React.useState<string | null>(null);
    React.useEffect(() => {
        if (shapeTextEditingId && shapeTextEditingId !== handlers.editingId) setShapeTextEditingId(null);
    }, [shapeTextEditingId, handlers.editingId]);
    const visibleImages = (style.addedImages || []).filter(image => image?.id && (image.repeatAsBackground || (image.pageIndex || 0) === pageIndex));
    const formattingShapeId = style.addedImages?.some(image => image.id === handlers.editingId && image.shape)
        ? handlers.editingId : null;
    const handleImageClick = (event: React.MouseEvent, id: string) => {
        event.stopPropagation();
        if (handlers.isReadyToEdit?.('addedImage', id)) handlers.startImageEditing(id);
    };
    const selectionPages = (image: AddedImage): number[] => {
        if (!image.repeatAsBackground) return [image.pageIndex || 0];
        const selected = handlers.selectedItems?.find((item: SelectionItem) => item.type === 'addedImage' && item.id === image.id);
        return selected?.backgroundPages ?? [handlers.imageEditPage?.id === image.id ? handlers.imageEditPage.pageIndex : image.pageIndex || 0];
    };
    const editableImages = readOnly ? [] : visibleImages.filter(image => selectionPages(image).includes(pageIndex));
    const activeImage = editableImages.find(image => image.id === handlers.selectedId && selectionPages(image).slice(-1)[0] === pageIndex);
    const selectedLayers = activeImage ? getSelectedLayerIds(handlers.selectedItems || [], activeImage.id) : null;
    const shapeEditor = activeImage?.shape ? activeImage
        : selectedLayers && [...(style.addedImages || [])].reverse().find(image => image.shape && selectedLayers.has(image.id));
    const pageStyle: React.CSSProperties = {
        fontFamily: style.productPhotoRatio ? templateFontStack(style, style.fontFamily)
            : style.fontFamily + (style.design ? ', Georgia, serif' : ''),
        ...getTemplateColors(style),
        backgroundColor: isImportedMenu && !backgroundPhoto ? 'transparent' : 'var(--template-paper)',
        color: 'var(--template-ink)',
        backgroundImage: backgroundPhoto ? 'none' : (!isImportedMenu || texture.tiled) && backgroundSource ? `url("${backgroundSource}")` : style.design ? decorativeBackground[style.design.background] : 'none',
        backgroundSize: texture.tiled ? 'auto' : 'cover',
        backgroundRepeat: texture.tiled ? 'repeat' : 'no-repeat',
        backgroundPosition: 'center',
        backgroundBlendMode: 'normal',
        width: `${pageDimensions.widthPx}px`,
        height: `${pageDimensions.heightPx}px`,
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
        userSelect: 'none',
        WebkitUserSelect: 'none',
    };

    const renderChunk = (chunk: CategoryChunkLayout) => {
        const renderItems = chunk.items.reduce<PageItem[]>((items, item) => {
            const previousItem = items[items.length - 1];
            if (item.type === 'product-row' && previousItem?.type === 'product-row') {
                items[items.length - 1] = {
                    ...previousItem,
                    data: [...previousItem.data, ...item.data],
                };
                return items;
            }
            items.push(item);
            return items;
        }, []);
        const isCategoryTarget = chunk.startsCategory;
        const isFreeTextTarget = chunk.category.startsWith(FREE_TEXT_PREFIX);
        const isDragTarget = isCategoryTarget || isFreeTextTarget;
        const isCategorySelected = isCategoryTarget && (handlers.isSelected?.('category', chunk.category) ?? handlers.selectedId === chunk.category);
        const activeSelectedItem = handlers.selectedItems?.find((item: any) => item.id === handlers.selectedId)
            || handlers.selectedItems?.[handlers.selectedItems.length - 1];
        const isCategoryControlAnchor = (handlers.selectedItems?.length || 0) <= 1
            || (activeSelectedItem?.type === 'category' && activeSelectedItem.id === chunk.category);
        const isCategoryDragged = isCategoryTarget && handlers.isCanvasObjectDragging?.('category', chunk.category);
        const categoryAddControls = handlers.getSelectionAddControls?.('category', chunk.category) || { top: true, bottom: true };
        const categoryFlowDirections: { before: FlowDirection; after: FlowDirection } =
            handlers.getFlowControlDirections?.('category', chunk.category) || { before: 'top', after: 'bottom' };
        const categoryAddFlow = isCategorySelected
            ? handlers.getAddControlDirections?.('category', chunk.category) || categoryFlowDirections
            : categoryFlowDirections;
        const categoryAddBeforeDirection: FlowDirection = categoryAddFlow.before;
        const categoryAddAfterDirection: FlowDirection = categoryAddFlow.after;
        const flowIndex = isDragTarget ? handlers.sortedCategories.indexOf(chunk.category) : -1;
        const categoryPosition = handlers.liveCategoryPositions !== null
            && handlers.liveCategoryPositions !== undefined
            ? handlers.liveCategoryPositions[chunk.category]
            : style.categoryPositions?.[chunk.category];
        const desiredPageY = (isCategoryTarget || isFreeTextTarget)
            && categoryPosition?.pageIndex === pageIndex
            && categoryPosition?.columnIndex === chunk.columnIndex
            ? categoryPosition.y
            : undefined;
        const renderCategoryMoveButton = (direction: FlowDirection) => (
            <button type="button" className={canvasActionButtonClass}
                onClick={(event) => handlers.handleGlobalMove?.(event, 'category', chunk.category, chunk.category, getCategoryMoveDirection(direction))}
                title={`Mover ${getDirectionLabel(direction)}`}>
                <CategoryMoveIcon direction={direction} />
            </button>
        );
        const renderCategoryAddButton = (position: 'before' | 'after', direction: FlowDirection) => (
            <button type="button" className={`${canvasActionButtonClass} before:!border-indigo-600 before:!bg-indigo-600 !text-white hover:before:!bg-indigo-700`}
                onClick={event => handlers.handleAddClick?.(event, chunk.category, true, position)}
                title={`Adicionar categoria ${getDirectionLabel(direction)}`}><Plus size={20} /></button>
        );
        const canMoveBefore = flowIndex > 0;
        const canMoveAfter = flowIndex >= 0 && flowIndex < handlers.sortedCategories.length - 1;
        const moveDirections: (FlowDirection | false)[] = renderedColumnCount > 1
            ? [
                canMoveBefore && categoryFlowDirections.before === 'top' && 'top',
                canMoveAfter && categoryFlowDirections.after === 'bottom' && 'bottom',
                chunk.columnIndex > 0 && 'left',
                chunk.columnIndex < renderedColumnCount - 1 && 'right',
            ]
            : [canMoveBefore && categoryFlowDirections.before, canMoveAfter && categoryFlowDirections.after];

        return (
            <PositionedCategoryChunk
                key={chunk.chunkId}
                desiredPageY={desiredPageY}
                desiredPageX={isFreeTextTarget ? categoryPosition?.x : undefined}
                absolutePageX={categoryPosition?.pageX}
                flowOffsetBefore={chunk.flowOffsetBefore}
                detachedForDrag={isCategoryDragged}
                fitContent={isFreeTextTarget}
                detachedFromFlow={isFreeTextTarget || categoryPosition?.pageX !== undefined}
                pageIndex={pageIndex}
                layoutKey={`${flowIndex}:${categoryColumnWidths.join(',')}`}
                data-chunk-id={chunk.chunkId}
                style={isFreeTextTarget ? undefined : { borderRadius: renderedStyle.borders?.categoryGroup?.radius }}
                data-category-chunk={chunk.category}
                data-active-canvas-drag={isCategoryDragged || undefined}
                data-menu-border-surface={isFreeTextTarget ? undefined : 'categoryGroup'}
                data-drag-scope={handlers.dragScope}
                data-drag-type={isDragTarget ? 'category' : undefined}
                data-drag-id={isDragTarget ? chunk.category : undefined}
                data-drag-page-index={isDragTarget ? pageIndex : undefined}
                data-drag-column-index={isDragTarget ? chunk.columnIndex : undefined}
                data-drag-flow-index={isDragTarget ? flowIndex : undefined}
                onDragOver={(e) => handlers.handleDragOverItem?.(e, chunk.category, 'category')}
                className={`relative rounded-xl ${!isFreeTextTarget && ((renderedStyle.fills?.categoryGroup && renderedStyle.fills.categoryGroup !== 'transparent')
                    || renderedStyle.borders?.categoryGroup?.sides.length) ? 'p-1.5' : ''} ${isCategoryDragged || handlers.isScalingCanvasObject || Number.isFinite(desiredPageY) ? 'transition-none' : 'transition-all duration-200'} pointer-events-none ${isCategorySelected || isCategoryDragged ? `ring-2 ring-indigo-500 bg-indigo-50/10 ${selectionLayerClasses.outline}` : ''}`}
            >
                {!isFreeTextTarget && <>
                    {renderedStyle.fills?.categoryGroup && <div data-category-group-paint aria-hidden="true"
                        className="pointer-events-none absolute inset-0 rounded-[inherit]"
                        style={{ zIndex: getContentLayer(style) * 10, background: renderedStyle.fills.categoryGroup }} />}
                    <BorderDecoration style={renderedStyle} scope="categoryGroup" />
                </>}
                {!readOnly && isCategorySelected && isCategoryControlAnchor && !isCategoryDragged && !handlers.editingId
                    && !handlers.multiSelectMode && handlers.startCanvasScale && (
                    <CanvasScaleHandles target={{ type: 'category', id: chunk.category }} start={handlers.startCanvasScale} />
                )}
                {isCategorySelected && isCategoryControlAnchor && !isCategoryDragged && !handlers.editingId && !handlers.multiSelectMode && (
                    <ColumnResizeHandles
                        columnIndex={chunk.columnIndex}
                        columnCount={renderedColumnCount}
                        onResizeStart={handlers.startCategoryColumnResize}
                    />
                )}
                {isCategorySelected && isCategoryControlAnchor && !isCategoryDragged && !handlers.isResizingCategoryColumns && !handlers.editingId && !handlers.multiSelectMode && (
                    <>
                        <CanvasFlowActions
                            before={categoryAddControls.top && renderCategoryAddButton('before', categoryAddBeforeDirection)}
                            up={moveDirections.includes('top') && renderCategoryMoveButton('top')}
                            down={moveDirections.includes('bottom') && renderCategoryMoveButton('bottom')}
                            after={categoryAddControls.bottom && renderCategoryAddButton('after', categoryAddAfterDirection)}
                        />
                        {moveDirections.map((direction, index) => (direction === 'left' || direction === 'right') && (
                            <CanvasActionGroup direction={direction} kind="move" key={index}>
                                {renderCategoryMoveButton(direction)}
                            </CanvasActionGroup>
                        ))}
                    </>
                )}
                <div data-pagination-chunk-content className={isFreeTextTarget ? undefined : 'flex flex-col'}>
                    {renderItems.map((item, idx) => (
                        <MenuItem
                            key={item.type === 'product-item'
                                ? `product-${item.data.id}`
                                : item.type === 'free-text-row'
                                    ? `free-text-row-${chunk.category}-${idx}`
                                : item.type === 'category-header'
                                    ? `category-${item.data}`
                                    : item.type === 'product-row'
                                        ? `product-grid-${chunk.category}-${idx}`
                                        : `${chunk.chunkId}-${item.type}-${idx}`}
                            item={item}
                            idx={idx}
                            style={renderedStyle}
                            priceDecimalPlaces={priceDecimalPlaces}
                            handlers={handlers}
                            products={products}
                            inGroup={true}
                            columnIndex={chunk.columnIndex}
                            categoryColumnCount={renderedColumnCount}
                        />
                    ))}
                </div>
            </PositionedCategoryChunk>
        );
    };

    const renderPageContent = () => {
        const elements: React.ReactNode[] = [];

        if (page.mainHeader) {
            elements.push(
                <MenuItem
                    key="main-header"
                    item={page.mainHeader}
                    idx={0}
                    pageIndex={pageIndex}
                    style={renderedStyle}
                    priceDecimalPlaces={priceDecimalPlaces}
                    handlers={handlers}
                    products={products}
                    inGroup={false}
                />
            );
        }

        const columnCount = renderedColumnCount;
        const columns = page.columns;
        const renderColumnChunks = (chunks: CategoryChunkLayout[]) => {
            const rendered: React.ReactNode[] = [];
            let looseFreeTexts: CategoryChunkLayout[] = [];
            const flushLooseFreeTexts = () => {
                if (looseFreeTexts.length === 0) return;
                const row = looseFreeTexts;
                looseFreeTexts = [];
                rendered.push(
                    <div key={`free-text-flow-${row.map((chunk) => chunk.chunkId).join('-')}`} className="flex min-w-0 flex-wrap items-start gap-2">
                        {row.map(renderChunk)}
                    </div>
                );
            };
            chunks.forEach((chunk) => {
                const effectivePositions = handlers.liveCategoryPositions ?? style.categoryPositions;
                const isLooseFreeText = chunk.category.startsWith(FREE_TEXT_PREFIX)
                    && !effectivePositions?.[chunk.category];
                if (isLooseFreeText) {
                    looseFreeTexts.push(chunk);
                    return;
                }
                flushLooseFreeTexts();
                rendered.push(renderChunk(chunk));
            });
            flushLooseFreeTexts();
            return rendered;
        };

        elements.push(
            <div
                key={`page-cols-${pageIndex}`}
                style={{
                    display: 'grid',
                    gridTemplateColumns: getColumnGridTemplate(categoryColumnWidths),
                    columnGap: columnCount > 1 ? `${margins.columnGap}px` : '0',
                    width: '100%',
                    flex: '1 1 auto',
                    minHeight: 0,
                }}
            >
                {columns.map((column) => (
                    <div
                        key={`page-col-${pageIndex}-${column.columnIndex}`}
                        data-drag-scope={handlers.dragScope}
                        data-drag-column-container="category"
                        data-drag-page-index={pageIndex}
                        data-drag-column-index={column.columnIndex}
                        onDragOver={(e) => handlers.handleDragOverItem?.(e)}
                        className="relative min-w-0 min-h-full flex flex-col gap-4 [&>*]:shrink-0"
                    >
                        {renderColumnChunks(column.chunks)}
                    </div>
                ))}
            </div>
        );

        if (handlers.draftItem && handlers.draftItem.pageIndex === pageIndex) {
            const columnGap = columnCount > 1 ? margins.columnGap : 0;
            const contentWidth = Math.max(1, pageDimensions.widthPx - margins.left - margins.right);
            const usableColumnsWidth = contentWidth - (columnGap * (columnCount - 1));
            const draftColumnIndex = Math.max(0, Math.min(columnCount - 1, handlers.draftItem.columnIndex || 0));
            const columnWidth = usableColumnsWidth * categoryColumnWidths[draftColumnIndex];
            const precedingWidth = categoryColumnWidths
                .slice(0, draftColumnIndex)
                .reduce((sum, width) => sum + (width * usableColumnsWidth), 0);
            const draftLeft = handlers.draftItem.pageX ?? (margins.left + precedingWidth + (draftColumnIndex * columnGap));

            elements.push(
                <div
                    key="draft-input"
                    className="absolute z-50 pointer-events-auto"
                    style={{
                        top: `${handlers.draftItem.top}px`,
                        left: `${draftLeft}px`,
                        width: 'fit-content',
                        maxWidth: `${handlers.draftItem.pageX === undefined ? columnWidth : pageDimensions.widthPx - draftLeft}px`,
                    }}
                >
                    <div
                        ref={handlers.draftInputRef}
                        data-placeholder-field="free-text"
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={handlers.handleDraftCommit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handlers.handleDraftCommit();
                            }
                        }}
                        className="w-fit max-w-full whitespace-pre-wrap break-words bg-indigo-500/15 ring-2 ring-blue-500 rounded p-1 font-normal text-xl leading-snug outline-none shadow-xl min-h-[30px] border border-blue-200 select-text"
                        style={{
                            color: 'var(--template-ink)',
                            WebkitTextFillColor: style.textColor,
                            '--automenu-edit-color': style.textColor,
                        } as React.CSSProperties}
                    >
                        Novo texto
                    </div>
                    <div className="text-[10px] text-blue-500 mt-1 font-semibold uppercase tracking-wide">Pressione Enter para salvar</div>
                </div>
            );
        }

        return elements;
    };

    return (
        <div data-menu-page-frame className="relative flex-shrink-0" style={isPageSelected ? { zIndex: 2 } : undefined}>
            <div
                {...getTemplateDesignAttributes(style)}
                data-menu-print-page={readOnly ? undefined : "true"}
                data-menu-preview-page={readOnly ? "true" : undefined}
                data-template-readonly={readOnly ? "true" : undefined}
                data-page-index={pageIndex}
                data-blank-page-id={page.blankPageId || undefined}
                data-drag-scope={handlers.dragScope}
                data-drag-page-container="category"
                data-drag-page-index={pageIndex}
                data-menu-page-width-px={pageDimensions.widthPx}
                data-menu-page-height-px={pageDimensions.heightPx}
                data-menu-page-width-mm={pageDimensions.widthMm}
                data-menu-page-height-mm={pageDimensions.heightMm}
                style={{ ...pageStyle, '--menu-page-width': `${pageDimensions.widthPx}px` } as React.CSSProperties}
                onDragOver={(e) => handlers.handleDragOverItem?.(e)}
                className={`shadow-2xl ${isImportedMenu ? '' : 'bg-white'} print:shadow-none print:mb-0 print:break-after-page group/page transition-shadow md:cursor-default ${isPageSelected ? 'ring-4 ring-blue-500' : ''}`}
                onClick={readOnly ? undefined : (e) => {
                    e.stopPropagation();
                    handlers.handleSelection('page', pageIndex.toString(), { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey });
                }}
                onDoubleClick={readOnly ? undefined : (e) => handlers.handlePageDoubleClick(e, pageIndex)}
            >
                {(backgroundPhoto || (isImportedMenu && !texture.tiled && backgroundSource)) && (
                    <img
                        data-menu-background-image="true"
                        src={backgroundPhoto || backgroundSource}
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                        loading="eager"
                        decoding="sync"
                        crossOrigin="anonymous"
                        className="absolute inset-0 h-full w-full pointer-events-none select-none"
                        style={{ objectFit: backgroundPhoto ? 'cover' : 'fill', zIndex: 0 }}
                    />
                )}
                {needsOverlay && !backgroundPhoto && style.appliedTemplateId === undefined && !isImportedMenu && <div className="absolute inset-0 bg-white/90 pointer-events-none z-0" />}
                {handlers.columnResizeGuide?.pageIndex === pageIndex && (
                    <div data-column-resize-guide data-print-control="true"
                        className="pointer-events-none absolute inset-y-0 z-[90] w-0.5 border-l-2 border-dashed border-rose-500"
                        style={{ left: `${handlers.columnResizeGuide.x}px` }} />
                )}
                {!backgroundPhoto && !pageBackground?.url && style.templateDecoration?.map(({ shape, x, y, width, opacity, height }, index) => (
                    <img key={index} data-template-decoration aria-hidden="true" alt="" draggable={false}
                        src={decorationUrl(shape, false)} className="pointer-events-none absolute"
                        style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${width * 100}%`, opacity, height: height !== undefined ? `${height * 100}%` : undefined, objectFit: 'fill' }} />
                ))}
                {addedImagePreview && !readOnly && (
                    <div data-added-image-preview data-print-control="true"
                        className="pointer-events-none absolute z-[70] bg-slate-100"
                        style={{ left: addedImagePreview.x, top: addedImagePreview.y, width: addedImagePreview.width,
                            height: addedImagePreview.width * addedImagePreview.aspect }}>
                        <img src={addedImagePreview.url} alt="" draggable={false}
                            className="absolute inset-0 size-full object-contain"
                            onLoad={({ currentTarget: image }) => {
                                if (image.naturalWidth && image.naturalHeight) {
                                    addedImagePreview.onAspect(image.naturalHeight / image.naturalWidth);
                                }
                            }} />
                        <PhotoLoading />
                    </div>
                )}
                {visibleImages.map((img, imgIdx) => {
                    return (
                        <div
                            key={img.id || imgIdx}
                            id={readOnly ? undefined : `added-image-${pageIndex}-${img.id}`}
                            data-added-image-drag="true"
                            data-added-image-id={img.id}
                            data-canvas-layer={getImageLayer(img)}
                            data-canvas-background-layer={getImageLayer(img) === 1 ? 'true' : undefined}
                            className="automenu-drag-item absolute group cursor-move"
                            style={{
                                left: `${img.x}px`,
                                top: `${img.y}px`,
                                width: `${img.width}px`,
                                rotate: img.rotation ? img.rotation + 'deg' : undefined,
                                zIndex: getImageLayer(img) * 10,
                                touchAction: 'none',
                            }}
                            onPointerDown={(e) => {
                                if ((e.target as HTMLElement).closest('.automenu-image-resize-handle')) return;
                                if (!readOnly) handlers.handleImageDragStart(e, img.id, pageIndex);
                            }}
                            onClick={(e) => handleImageClick(e, img.id)}
                            onContextMenu={(e) => handlers.openObjectMenu?.(e, { type: 'addedImage', id: img.id })}
                        >
                            <CanvasLayerImage image={img} alt={img.shape ? isMiniFoodKind(img.shape.kind)
                                ? MINI_FOODS.find(food => food.kind === img.shape?.kind)?.name
                                : img.shape.text || 'Forma adicionada' : 'Imagem adicionada'} />
                        </div>
                    );
                })}

                {products.map((product) => {
                    const layer = product.isFreeText ? style.freeTextBackgrounds?.[product.id] : undefined;
                    if (!layer || style.hiddenProductIds?.includes(product.id)) return null;
                    const selected = handlers.selectedItems?.find((item: SelectionItem) => item.type === 'freeText' && item.id === product.id);
                    const pages: number[] = selected?.backgroundPages?.filter((index: number) => index < pageCount) ?? [];
                    const primaryPage = pages[pages.length - 1] ?? Math.min(layer.pageIndex, pageCount - 1);
                    return (
                        <div key={product.id} data-canvas-background-layer="true" data-page-positioned-text="true" className="pointer-events-none absolute z-[11]"
                            style={{ left: layer.x, top: layer.y, width: Math.max(1, pageDimensions.widthPx - layer.x) }}>
                            <MenuItem
                                item={{ type: 'product-item', data: { ...product, customMarginTop: 0, freeTextWidth: product.freeTextWidth || layer.width }, category: product.category }}
                                idx={0}
                                style={renderedStyle}
                                priceDecimalPlaces={priceDecimalPlaces}
                                handlers={readOnly ? { readOnly: true, groupedProducts: {} } : handlers}
                                products={products}
                                inGroup
                                backgroundText={{ pageIndex, primary: pageIndex === primaryPage,
                                    selected: Boolean(!readOnly && selected && (pages.length ? pages.includes(pageIndex) : pageIndex === primaryPage)) }}
                            />
                        </div>
                    );
                })}

                <div
                    className="relative h-full flex flex-col pointer-events-none"
                    style={{
                        paddingTop: `${margins.top}px`,
                        paddingBottom: `${margins.bottom}px`,
                        paddingLeft: `${margins.left}px`,
                        paddingRight: `${margins.right}px`,
                    }}
                >
                    {renderPageContent()}
                </div>

                {editableImages.filter(img => handlers.isSelected?.('addedImage', img.id) ?? handlers.selectedId === img.id).map((img) => (
                    <div
                        key={`resize-controls-${img.id}`}
                        data-print-control="true"
                        data-added-image-drag="true"
                        data-image-selection-overlay={img.id}
                        data-active-canvas-drag={handlers.isCanvasObjectDragging?.('addedImage', img.id) || undefined}
                        data-drag-ignore="true"
                        className={`automenu-drag-item absolute ${handlers.isReadyToEdit?.('addedImage', img.id) ? 'cursor-pointer' : 'cursor-move'}`}
                        style={{
                            left: `${img.x}px`,
                            top: `${img.y}px`,
                            width: `${img.width}px`,
                            rotate: img.rotation ? img.rotation + 'deg' : undefined,
                            zIndex: 70,
                            touchAction: 'none',
                        }}
                        onPointerDown={(event) => {
                            if ((event.target as HTMLElement).closest('.automenu-image-resize-handle')) return;
                            handlers.handleImageDragStart(event, img.id, pageIndex);
                        }}
                        onClick={(event) => handleImageClick(event, img.id)}
                        onContextMenu={(event) => handlers.openObjectMenu?.(event, { type: 'addedImage', id: img.id })}
                    >
                        <Resizable
                            size={{ width: img.width, height: 'auto' }}
                            lockAspectRatio
                            enable={{ top: false, right: false, bottom: false, left: false, topRight: true, bottomRight: true, bottomLeft: true, topLeft: true }}
                            onResizeStart={(event, direction) => {
                                event.stopPropagation();
                                handlers.startImageResize?.(img.id, direction);
                            }}
                            onResize={(event, direction, ref) => {
                                event.stopPropagation();
                                handlers.previewImageResize?.(img.id, direction, ref.offsetWidth);
                            }}
                            onResizeStop={(event, direction, ref) => {
                                event.stopPropagation();
                                handlers.stopImageResize?.(img.id, direction, ref.offsetWidth);
                            }}
                            handleClasses={{
                                topRight: 'automenu-image-resize-handle bg-white border-2 border-indigo-500 rounded-full shadow-md',
                                bottomRight: 'automenu-image-resize-handle bg-white border-2 border-indigo-500 rounded-full shadow-md',
                                bottomLeft: 'automenu-image-resize-handle bg-white border-2 border-indigo-500 rounded-full shadow-md',
                                topLeft: 'automenu-image-resize-handle bg-white border-2 border-indigo-500 rounded-full shadow-md',
                            }}
                            handleStyles={{
                                topRight: { width: 24, height: 24, right: -12, top: -12 },
                                bottomRight: { width: 24, height: 24, right: -12, bottom: -12 },
                                bottomLeft: { width: 24, height: 24, left: -12, bottom: -12 },
                                topLeft: { width: 24, height: 24, left: -12, top: -12 },
                            }}
                        >
                            <div className="relative w-full">
                                <CanvasLayerImage image={img} ghost />
                                <div className={`pointer-events-none absolute inset-0 ring-2 ring-indigo-500 ${handlers.isReadyToEdit?.('addedImage', img.id)
                                    && formattingShapeId !== img.id ? 'bg-indigo-500/15' : ''}`} />
                                {activeImage?.id === img.id && !handlers.multiSelectMode && !handlers.draggedImageId
                                    && formattingShapeId !== img.id && handlers.rotateCanvasImage && (
                                    <CanvasRotationHandle rotation={img.shape?.rotation ?? img.rotation ?? 0} snapRightAngles={Boolean(img.shape)}
                                        onRotate={(rotation, commit) => handlers.rotateCanvasImage(img.id, rotation, commit)} />
                                )}
                                {img.shape && !isMiniFoodKind(img.shape.kind) && formattingShapeId === img.id && activeImage?.id === img.id &&
                                    <ShapeTextEditor shape={img.shape} imageWidth={img.width}
                                        targetId={`added-image-${pageIndex}-${img.id}`}
                                        onFocus={() => setShapeTextEditingId(img.id)}
                                        onClose={() => setShapeTextEditingId(null)}
                                        onChange={text => {
                                            handlers.updateStyle?.((previous: MenuStyle) => ({ ...previous, name: 'Custom',
                                                addedImages: previous.addedImages?.map(image => {
                                                    if (image.id !== img.id || !image.shape || isMiniFoodKind(image.shape.kind)) return image;
                                                    const shape = { ...image.shape, text };
                                                    return { ...image, shape, url: canvasShapeUrl(shape) };
                                                }),
                                            }));
                                        }} />}

                            </div>
                        </Resizable>
                    </div>
                ))}

                {isFormattingPageNumber && (
                    <InlineStyleToolbar
                        targetElementId={pageNumberElementId}
                        value={{
                            ...pageNumberStyle,
                            color: pageNumberStyle.color || style.textColor,
                            fontSize: pageNumberFontSize,
                        }}
                        controls="sizeColor"
                        compact
                        maxFontSize={Math.max(50, minimumFontSize)}
                        minFontSize={minimumFontSize}
                        onChange={(newStyle) => handlers.handleInlineStyleChange?.(handlers.formattingTarget, newStyle)}
                        onDismiss={() => handlers.setFormattingTarget?.(null)}
                        header={(
                            <>
                                <span className="whitespace-nowrap text-[9px] font-semibold text-slate-500">Numeração do cardápio</span>
                                <button
                                    type="button"
                                    data-drag-ignore="true"
                                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded transition-colors ${showPageNumbers ? 'text-red-500 hover:bg-red-50' : 'text-indigo-600 hover:bg-indigo-50'}`}
                                    onClick={() => {
                                        onSetPageNumbersVisible(!showPageNumbers);
                                        if (showPageNumbers) handlers.setFormattingTarget?.(null);
                                    }}
                                    title={showPageNumbers ? 'Excluir numeração' : 'Adicionar numeração'}
                                    aria-label={showPageNumbers ? 'Excluir numeração do cardápio' : 'Adicionar numeração ao cardápio'}
                                >
                                    {showPageNumbers ? <Trash2 size={14} /> : <Plus size={14} />}
                                </button>
                            </>
                        )}
                    />
                )}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
                    <div
                        id={readOnly ? undefined : pageNumberElementId}
                        data-page-number="true"
                        data-print-control="true"
                        className={`inline-flex min-w-8 h-8 px-2 items-center justify-center pointer-events-auto cursor-pointer select-none touch-none ${showPageNumbers ? 'opacity-40' : 'opacity-0'}`}
                        style={{
                            ...getTextOutlineStyle(pageNumberStyle.textOutline),
                            color: pageNumberStyle.color || style.textColor,
                            fontSize: `${pageNumberFontSize}px`,
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
                            if (handlers.editingId) {
                                handlers.handleSelection('page', String(pageIndex));
                            }
                            handlers.setFormattingTarget?.({
                                type: 'pageNumber',
                                id: 'pageNumber',
                                field: 'pageNumber',
                                elementId: pageNumberElementId,
                            });
                        }}
                    >
                        {pageIndex + 1}
                    </div>
                </div>
            </div>
            {activeImage && (
                <CanvasActionGroup
                    key={`controls-${activeImage.id}`}
                    data-object-page-index={pageIndex}
                    anchorId={`added-image-${pageIndex}-${activeImage.id}`}
                    direction="top"
                    kind="quick"
                    className="!z-[100000]"
                >
                    {shapeEditor && (
                        <button type="button" title="Editar forma" aria-pressed={formattingShapeId === shapeEditor.id}
                            data-inline-format-target={`added-image-${shapeEditor.id === activeImage.id ? pageIndex : shapeEditor.pageIndex || 0}-${shapeEditor.id}`}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                                event.stopPropagation();
                                if (shapeTextEditingId === shapeEditor.id) setShapeTextEditingId(null);
                                else if (formattingShapeId === shapeEditor.id) handlers.setEditingId(null);
                                else handlers.startImageEditing(shapeEditor.id);
                            }}
                            className={`${canvasActionButtonClass} ${formattingShapeId === shapeEditor.id ? 'before:!bg-indigo-50 !text-indigo-700' : ''}`}>
                            <Edit3 size={19} />
                        </button>
                    )}
                    {!activeImage.shape && <button type="button" onClick={event => {
                        event.stopPropagation();
                        handlers.openImageCrop?.(activeImage.id);
                    }} className={canvasActionButtonClass} title="Cortar"><Crop size={19} /></button>}
                    <button type="button" title="Seleção múltipla" aria-pressed={Boolean(handlers.multiSelectMode)}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
                            if (!handlers.multiSelectMode && formattingShapeId) handlers.setEditingId(null);
                            handlers.setMultiSelectMode?.(!handlers.multiSelectMode);
                        }}
                        className={`${canvasActionButtonClass} ${handlers.multiSelectMode ? 'before:!bg-indigo-50 !text-indigo-700' : ''}`}>
                        <CopyCheck size={19} />
                    </button>
                    <button type="button" className={`${canvasActionButtonClass} !text-red-600 hover:before:!border-red-300 hover:before:!bg-red-50`}
                        aria-hidden={handlers.objectMenuOpen || undefined} tabIndex={handlers.objectMenuOpen ? -1 : undefined}
                        onClick={(event) => handlers.handleRemoveImage(event, activeImage.id)} title={activeImage.shape ? 'Remover forma' : 'Remover imagem'}>
                        <Trash2 size={19} />
                    </button>
                    <button data-open-object-menu="true" data-object-menu-type="addedImage" data-object-menu-id={activeImage.id} onClick={(e) => handlers.openObjectMenu?.(e, { type: 'addedImage', id: activeImage.id })} className={canvasActionButtonClass} title="Mais opções"><MoreHorizontal size={20} /></button>
                    {activeImage.shape && formattingShapeId === activeImage.id && (
                        shapeTextEditingId === activeImage.id && !isMiniFoodKind(activeImage.shape.kind) ?
                        <InlineStyleToolbar targetElementId={`added-image-${pageIndex}-${activeImage.id}`} dismissOnClickInCanvas
                            onDismiss={() => setShapeTextEditingId(null)}
                            value={getShapeTextStyle(activeImage.shape)} minFontSize={1} maxFontSize={60}
                            onChange={textStyle => handlers.updateStyle?.((previous: MenuStyle) => ({
                                ...previous, name: 'Custom',
                                addedImages: previous.addedImages?.map(image => image.id === activeImage.id
                                    ? applyCanvasShapeParameters(image, { textStyle }) : image),
                            }))} /> :
                        <InlineStyleToolbar compact dismissOnClickInCanvas targetElementId={`added-image-${pageIndex}-${activeImage.id}`}
                            onDismiss={() => handlers.setEditingId(null)}>
                            <div className="p-1.5">
                                <ShapeSettings shape={activeImage.shape} onChangeShape={handlers.changeShape && (() => handlers.changeShape(activeImage.id))}
                                    onChange={patch => {
                                        const ids = getSelectedLayerIds(handlers.selectedItems || [], activeImage.id);
                                        handlers.updateStyle?.((previous: MenuStyle) => ({
                                            ...previous,
                                            addedImages: previous.addedImages?.map(image => ids.has(image.id)
                                                ? applyCanvasShapeParameters(image, patch) : image),
                                            name: 'Custom',
                                        }));
                                    }}
                                    onEditEnd={() => handlers.finishImageEdit?.(activeImage.id)}
                                />
                            </div>
                        </InlineStyleToolbar>
                    )}
                </CanvasActionGroup>
            )}
            {isPageSelected && (
                <>
                    <button
                        onClick={(e) => { e.stopPropagation(); handlers.setMultiSelectMode?.(!handlers.multiSelectMode); }}
                        className={`md:hidden absolute top-[-16px] right-8 z-30 p-2 rounded-full shadow-lg hover:scale-110 transition-all border-2 border-white ${handlers.multiSelectMode ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}
                        title="Seleção múltipla"
                    >
                        <CheckSquare size={18} />
                    </button>
                    {(['before', 'after'] as const).filter(direction => pageAddControls[direction]).map(direction => {
                        const before = direction === 'before';
                        const side = before ? 'left-[-32px] -translate-x-1/2' : 'right-[-32px] translate-x-1/2';
                        const placement = before ? 'antes' : 'depois';
                        const Chevron = before ? ChevronLeft : ChevronRight;
                        const controls = 'absolute z-[100002] -translate-y-1/2 rounded-full border-2 border-white p-2 text-white shadow-lg hover:scale-110';
                        return <React.Fragment key={direction}>
                            <button type="button" data-print-control="true" data-drag-ignore="true"
                                onClick={event => { event.stopPropagation(); onAddPage(pageIndex, direction); }}
                                className={`${controls} ${side} top-1/2 bg-blue-600 hover:bg-blue-700`}
                                title={`Adicionar página ${placement}`}>
                                <Plus size={24} />
                            </button>
                            {onMovePage && (before ? pageIndex > 0 : pageIndex < pageCount - 1) && (
                                <button type="button" data-print-control="true" data-drag-ignore="true"
                                    onClick={event => { event.stopPropagation(); onMovePage(pageIndex, direction); }}
                                    className={`${controls} ${side} top-3/4 bg-blue-600 hover:bg-blue-700`}
                                    title={before ? 'Trocar com a página anterior' : 'Trocar com a próxima página'}>
                                    <Chevron size={24} />
                                </button>
                            )}
                        </React.Fragment>;
                    })}
                    {pageCount > 1 && pageIndex !== 0 && (
                        <button
                            type="button"
                            data-drag-ignore="true"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); onDeletePage(pageIndex); }}
                            className="pointer-events-auto absolute bottom-[-58px] left-1/2 z-[100001] flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full border-2 border-white bg-red-600 text-white shadow-lg transition-all hover:scale-110 hover:bg-red-700"
                            title="Excluir página"
                            aria-label="Excluir página"
                        >
                            <Trash2 size={20} className="pointer-events-none" />
                        </button>
                    )}
                </>
            )}
        </div>
    );
};
