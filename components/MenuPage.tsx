import React from 'react';
import { Product, MenuStyle } from '../types';
import { BringToFront, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Minus, MoreHorizontal, Plus, SendToBack, Trash2 } from 'lucide-react';
import { Resizable } from 're-resizable';
import { MenuItem, ResponsiveMoveButton } from './MenuItem';
import { PageLayout, CategoryChunkLayout, FREE_TEXT_PREFIX, A4_WIDTH_PX } from '../utils/menuPagination';
import { selectionLayerClasses } from './selectionLayers';
import { getDirectionLabel, getEdgeControlClass, type FlowDirection } from '../utils/flowControls';
import { normalizeTextureUrl } from '../constants';
import { InlineStyleToolbar } from './MenuDesigner/InlineStyleToolbar';
import { resolveMenuMargins, resolveMinimumFontSize } from '../utils/styleRules';
import { getColumnGridTemplate, getPageColumnWidths } from '../utils/categoryColumns';
import { ColumnResizeHandles } from './ColumnResizeHandles';

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
        pageIndex: number;
        layoutKey: string;
        dragging?: boolean;
    }
> = ({ desiredPageY, pageIndex, layoutKey, dragging = false, style, children, ...props }) => {
    const elementRef = React.useRef<HTMLDivElement>(null);
    const offsetRef = React.useRef(0);
    const [offset, setOffset] = React.useState(0);

    React.useLayoutEffect(() => {
        const element = elementRef.current;
        if (!element) return;
        if (!Number.isFinite(desiredPageY)) {
            offsetRef.current = 0;
            setOffset(0);
            return;
        }

        const page = element.closest<HTMLElement>(`[data-menu-print-page="true"][data-page-index="${pageIndex}"]`);
        if (!page) return;
        let animationFrame: number | null = null;
        const updateOffset = () => {
            animationFrame = null;
            const pageRect = page.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();
            const scale = Math.max(0.001, pageRect.width / A4_WIDTH_PX);
            const naturalTop = elementRect.top - (offsetRef.current * scale);
            const nextOffset = ((pageRect.top + (Number(desiredPageY) * scale)) - naturalTop) / scale;
            if (Math.abs(nextOffset - offsetRef.current) < 0.25) return;
            offsetRef.current = nextOffset;
            setOffset(nextOffset);
        };
        const scheduleUpdate = () => {
            if (animationFrame !== null) cancelAnimationFrame(animationFrame);
            animationFrame = requestAnimationFrame(updateOffset);
        };

        updateOffset();
        const observer = new ResizeObserver(scheduleUpdate);
        observer.observe(page);
        observer.observe(element);
        const column = element.closest<HTMLElement>('[data-drag-column-container="category"]');
        if (column) {
            observer.observe(column);
            Array.from(column.children).forEach((child) => observer.observe(child));
        }
        window.addEventListener('resize', scheduleUpdate);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', scheduleUpdate);
            if (animationFrame !== null) cancelAnimationFrame(animationFrame);
        };
    }, [desiredPageY, layoutKey, pageIndex]);

    return (
        <div
            {...props}
            ref={elementRef}
            style={{
                ...style,
                marginTop: Number.isFinite(desiredPageY) && !dragging ? `${offset}px` : style?.marginTop,
                transform: Number.isFinite(desiredPageY) && dragging ? `translateY(${offset}px)` : style?.transform,
            }}
        >
            {children}
        </div>
    );
};

interface MenuPageProps {
    pageIndex: number;
    page: PageLayout;
    style: MenuStyle;
    handlers: any;
    products: Product[];
    needsOverlay: boolean;
    pageCount: number;
    onAddPage: (index: number, position: 'before' | 'after') => void;
    onDeletePage: (index: number) => void;
}

export const MenuPage: React.FC<MenuPageProps> = ({
    pageIndex,
    page,
    style,
    handlers,
    products,
    needsOverlay,
    pageCount,
    onAddPage,
    onDeletePage,
}) => {
    const isPageSelected = handlers.isSelected?.('page', String(pageIndex)) ?? handlers.selectedPageIndex === pageIndex;
    const pageAddControls = handlers.getPageAddControls?.(pageIndex) || { before: true, after: true };
    const pageBackground = (style.pageBackgrounds || [])
        .find((background) => background.pageIndex === pageIndex);
    const backgroundTexture = normalizeTextureUrl(pageBackground?.url || style.backgroundImage);
    const isImportedMenu = style.sourceType === 'ai_import';
    const backgroundSource = backgroundTexture || (!isImportedMenu ? style.sourceImage : '');
    const renderedColumnCount = page.columnCount || page.columns.length || style.categoryColumnCount || 1;
    const renderedStyle = renderedColumnCount === (style.categoryColumnCount || 1)
        ? style
        : { ...style, categoryColumnCount: renderedColumnCount as 1 | 2 | 3 };
    const pageNumberStyle = style.elementStyles?.pageNumber || {};
    const minimumFontSize = resolveMinimumFontSize(style);
    const pageNumberFontSize = Math.max(minimumFontSize, Math.min(50, Number(pageNumberStyle.fontSize) || 14));
    const pageNumberElementId = `page-number-${pageIndex}`;
    const isFormattingPageNumber = handlers.formattingTarget?.type === 'pageNumber'
        && handlers.formattingTarget?.elementId === pageNumberElementId;
    const margins = resolveMenuMargins(style);
    const categoryColumnWidths = getPageColumnWidths(
        style,
        renderedColumnCount,
        handlers.liveCategoryColumnWidths,
    );

    const pageStyle: React.CSSProperties = {
        fontFamily: style.fontFamily,
        backgroundColor: isImportedMenu ? 'transparent' : style.backgroundColor,
        color: style.textColor,
        backgroundImage: !isImportedMenu && backgroundSource ? `url(${backgroundSource})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundBlendMode: 'normal',
        width: '794px',
        height: '1123px',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
        userSelect: 'none',
        WebkitUserSelect: 'none',
    };

    const renderChunk = (chunk: CategoryChunkLayout) => {
        const isCategoryTarget = chunk.startsCategory;
        const isFreeTextTarget = chunk.category.startsWith(FREE_TEXT_PREFIX);
        const isDragTarget = isCategoryTarget || isFreeTextTarget;
        const isCategorySelected = isCategoryTarget && (handlers.isSelected?.('category', chunk.category) ?? handlers.selectedId === chunk.category);
        const isCategoryDragged = isCategoryTarget && handlers.draggedItem?.type === 'category' && handlers.draggedItem?.id === chunk.category;
        const categoryAddControls = handlers.getSelectionAddControls?.('category', chunk.category) || { top: true, bottom: true };
        const categoryFlowDirections = handlers.getFlowControlDirections?.('category', chunk.category) || { before: 'top', after: 'bottom' };
        const flowIndex = isDragTarget ? handlers.sortedCategories.indexOf(chunk.category) : -1;
        const categoryPosition = handlers.liveCategoryPositions?.[chunk.category]
            || style.categoryPositions?.[chunk.category];
        const desiredPageY = isCategoryTarget
            && categoryPosition?.pageIndex === pageIndex
            && categoryPosition?.columnIndex === chunk.columnIndex
            ? categoryPosition.y
            : undefined;
        const renderCategoryMoveButton = (direction: FlowDirection, enabled: boolean) => {
            if (!enabled) return null;
            const lane = direction === 'left' || direction === 'right' ? 'center' : 'leading';

            return (
                <ResponsiveMoveButton
                    flowDirection={direction}
                    className={`absolute ${getEdgeControlClass(direction, lane)} p-2 bg-white border border-slate-200 shadow-md rounded-full text-slate-500 hover:text-indigo-600 hover:bg-slate-50 ${selectionLayerClasses.controls} transition-all cursor-pointer pointer-events-auto`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => handlers.handleGlobalMove?.(
                        event,
                        'category',
                        chunk.category,
                        chunk.category,
                        getCategoryMoveDirection(direction)
                    )}
                    title={`Mover ${getDirectionLabel(direction)}`}
                >
                    <CategoryMoveIcon direction={direction} />
                </ResponsiveMoveButton>
            );
        };

        return (
            <PositionedCategoryChunk
                key={chunk.chunkId}
                desiredPageY={desiredPageY}
                pageIndex={pageIndex}
                layoutKey={`${flowIndex}:${categoryColumnWidths.join(',')}`}
                dragging={isCategoryDragged}
                data-chunk-id={chunk.chunkId}
                data-category-chunk={chunk.category}
                data-drag-scope={handlers.dragScope}
                data-drag-type={isDragTarget ? 'category' : undefined}
                data-drag-id={isDragTarget ? chunk.category : undefined}
                data-drag-page-index={isDragTarget ? pageIndex : undefined}
                data-drag-column-index={isDragTarget ? chunk.columnIndex : undefined}
                data-drag-flow-index={isDragTarget ? flowIndex : undefined}
                onDragOver={(e) => handlers.handleDragOverItem?.(e, chunk.category, 'category')}
                className={`relative rounded-xl ${isCategoryDragged ? 'transition-none' : 'transition-all duration-200'} pointer-events-none ${isCategorySelected ? `ring-2 ring-indigo-500 bg-indigo-50/10 ${selectionLayerClasses.outline}` : ''}`}
            >
                {isCategorySelected && !isCategoryDragged && (
                    <ColumnResizeHandles
                        columnIndex={chunk.columnIndex}
                        columnCount={renderedColumnCount}
                        onResizeStart={handlers.startCategoryColumnResize}
                    />
                )}
                {isCategorySelected && !isCategoryDragged && (
                    <>
                        {categoryAddControls.top && (
                            <button
                                className={`absolute ${getEdgeControlClass(categoryFlowDirections.before)} bg-indigo-600 text-white p-1 rounded-full ${selectionLayerClasses.controls} shadow-md hover:scale-110 hover:bg-indigo-700 transition-transform cursor-pointer pointer-events-auto`}
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => handlers.handleAddClick?.(e, chunk.category, true, 'before')}
                                title={`Adicionar categoria ${getDirectionLabel(categoryFlowDirections.before)}`}
                            >
                                <Plus size={12} />
                            </button>
                        )}
                        {categoryAddControls.bottom && (
                            <button
                                className={`absolute ${getEdgeControlClass(categoryFlowDirections.after)} bg-indigo-600 text-white p-1 rounded-full ${selectionLayerClasses.controls} shadow-md hover:scale-110 hover:bg-indigo-700 transition-transform cursor-pointer pointer-events-auto`}
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => handlers.handleAddClick?.(e, chunk.category, true, 'after')}
                                title={`Adicionar categoria ${getDirectionLabel(categoryFlowDirections.after)}`}
                            >
                                <Plus size={12} />
                            </button>
                        )}
                        {renderCategoryMoveButton(categoryFlowDirections.before, flowIndex > 0)}
                        {renderCategoryMoveButton(
                            categoryFlowDirections.after,
                            flowIndex >= 0 && flowIndex < handlers.sortedCategories.length - 1
                        )}
                    </>
                )}
                <div className={`transition-opacity duration-150 ${isCategoryDragged ? 'opacity-40' : ''}`}>
                    {chunk.items.map((item, idx) => (
                        <MenuItem
                            key={`${chunk.chunkId}-${item.type}-${idx}`}
                            item={item}
                            idx={idx}
                            style={renderedStyle}
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
                    style={renderedStyle}
                    handlers={handlers}
                    products={products}
                    inGroup={false}
                />
            );
        }

        const columnCount = renderedColumnCount;
        const columns = page.columns;

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
                        className="min-w-0 min-h-full flex flex-col gap-4"
                    >
                        {column.chunks.map(renderChunk)}
                    </div>
                ))}
            </div>
        );

        if (handlers.draftItem && handlers.draftItem.pageIndex === pageIndex) {
            const columnGap = columnCount > 1 ? margins.columnGap : 0;
            const contentWidth = A4_WIDTH_PX - margins.left - margins.right;
            const usableColumnsWidth = contentWidth - (columnGap * (columnCount - 1));
            const draftColumnIndex = Math.max(0, Math.min(columnCount - 1, handlers.draftItem.columnIndex || 0));
            const columnWidth = usableColumnsWidth * categoryColumnWidths[draftColumnIndex];
            const precedingWidth = categoryColumnWidths
                .slice(0, draftColumnIndex)
                .reduce((sum, width) => sum + (width * usableColumnsWidth), 0);
            const draftLeft = margins.left + precedingWidth + (draftColumnIndex * columnGap);

            elements.push(
                <div
                    key="draft-input"
                    className="absolute z-50 pointer-events-auto"
                    style={{
                        top: `${handlers.draftItem.top}px`,
                        left: `${draftLeft}px`,
                        width: `${columnWidth}px`,
                    }}
                >
                    <div
                        ref={handlers.draftInputRef}
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={handlers.handleDraftCommit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handlers.handleDraftCommit();
                            }
                        }}
                        className="bg-white ring-2 ring-blue-500 rounded p-1 font-normal text-xl leading-snug outline-none shadow-xl min-h-[30px] border border-blue-200 text-blue-900"
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
        <div className="relative flex-shrink-0">
            <div
                data-menu-print-page="true"
                data-page-index={pageIndex}
                data-drag-scope={handlers.dragScope}
                data-drag-page-container="category"
                data-drag-page-index={pageIndex}
                style={pageStyle}
                onDragOver={(e) => handlers.handleDragOverItem?.(e)}
                className={`shadow-2xl ${isImportedMenu ? '' : 'bg-white'} print:shadow-none print:mb-0 print:break-after-page group/page transition-all md:cursor-default ${isPageSelected ? 'ring-4 ring-blue-500' : ''}`}
                onClick={(e) => {
                    e.stopPropagation();
                    handlers.setSelectedPageIndex(pageIndex);
                    handlers.setSelectedId(null);
                    handlers.handleSelection('page', pageIndex.toString(), { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey });
                    handlers.setEditingId(null);
                }}
                onDoubleClick={(e) => handlers.handlePageDoubleClick(e, pageIndex)}
            >
                {isImportedMenu && backgroundSource && (
                    <img
                        data-menu-background-image="true"
                        src={backgroundSource}
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                        loading="eager"
                        decoding="sync"
                        crossOrigin="anonymous"
                        className="absolute inset-0 h-full w-full pointer-events-none select-none"
                        style={{ objectFit: 'fill', zIndex: 0 }}
                    />
                )}
                {needsOverlay && !isImportedMenu && <div className="absolute inset-0 bg-white/90 pointer-events-none z-0" />}
                {handlers.columnResizeGuide?.pageIndex === pageIndex && (
                    <div
                        data-print-control="true"
                        className="absolute inset-y-0 w-0.5 bg-rose-500 pointer-events-none z-[90] shadow-[0_0_0_1px_rgba(255,255,255,0.9),0_0_10px_rgba(244,63,94,0.9)]"
                        style={{ left: `${handlers.columnResizeGuide.x}px` }}
                    >
                        <div className="absolute top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-rose-600 px-2 py-1 text-[10px] font-bold text-white shadow-lg">
                            {handlers.columnResizeGuide.snappedToCenter ? 'Centro' : 'Largura da coluna'}
                        </div>
                    </div>
                )}

                {(style.addedImages || []).filter((img) => img && img.id && (img.pageIndex || 0) === pageIndex).map((img, imgIdx) => {
                    return (
                        <div
                            key={img.id || imgIdx}
                            id={`added-image-${pageIndex}-${img.id}`}
                            data-added-image-drag="true"
                            data-added-image-id={img.id}
                            className="automenu-drag-item absolute group cursor-move"
                            style={{
                                left: `${img.x}px`,
                                top: `${img.y}px`,
                                width: `${img.width}px`,
                                zIndex: img.zIndex ?? 11,
                                touchAction: 'none',
                            }}
                            onPointerDown={(e) => {
                                if ((e.target as HTMLElement).closest('.automenu-image-resize-handle')) return;
                                handlers.handleImageDragStart(e, img.id);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onContextMenu={(e) => handlers.openObjectMenu?.(e, { type: 'addedImage', id: img.id })}
                        >
                            <img src={img.url} alt="imagem adicionada" className="w-full h-auto pointer-events-none select-none" draggable={false} />
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
                        zIndex: style.contentLayer === 'front' ? 30 : style.contentLayer === 'back' ? 2 : 10,
                    }}
                >
                    {renderPageContent()}
                </div>

                {(style.addedImages || []).filter((img) => (
                    img
                    && img.id
                    && (img.pageIndex || 0) === pageIndex
                    && (handlers.isSelected?.('addedImage', img.id) ?? handlers.selectedId === img.id)
                )).map((img) => (
                    <div
                        key={`resize-controls-${img.id}`}
                        data-print-control="true"
                        data-added-image-drag="true"
                        data-drag-ignore="true"
                        className="automenu-drag-item absolute cursor-move"
                        style={{
                            left: `${img.x}px`,
                            top: `${img.y}px`,
                            width: `${img.width}px`,
                            zIndex: 70,
                            touchAction: 'none',
                        }}
                        onPointerDown={(event) => {
                            if ((event.target as HTMLElement).closest('.automenu-image-resize-handle')) return;
                            handlers.handleImageDragStart(event, img.id);
                        }}
                        onClick={(event) => event.stopPropagation()}
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
                            onResize={(event, direction, ref, delta) => {
                                event.stopPropagation();
                                const controlWrapper = ref.parentElement;
                                if (!controlWrapper) return;
                                const finalWidth = Number(ref.offsetWidth);
                                const deltaWidth = Number.isFinite(finalWidth)
                                    ? finalWidth - Number(img.width)
                                    : Number(delta.width);
                                const deltaHeight = Number(delta.height);
                                if (!Number.isFinite(finalWidth) || finalWidth <= 0 || !Number.isFinite(deltaWidth)) return;

                                const nextLeft = direction === 'topLeft' || direction === 'bottomLeft'
                                    ? img.x - deltaWidth
                                    : img.x;
                                const nextTop = direction === 'topLeft' || direction === 'topRight'
                                    ? img.y - (Number.isFinite(deltaHeight) ? deltaHeight : 0)
                                    : img.y;
                                if (!Number.isFinite(nextLeft) || !Number.isFinite(nextTop)) return;
                                controlWrapper.style.left = `${nextLeft}px`;
                                controlWrapper.style.top = `${nextTop}px`;

                                const imageElement = document.getElementById(`added-image-${pageIndex}-${img.id}`);
                                if (imageElement) {
                                    imageElement.style.left = `${nextLeft}px`;
                                    imageElement.style.top = `${nextTop}px`;
                                    imageElement.style.width = `${finalWidth}px`;
                                }
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
                                <img src={img.url} alt="" aria-hidden="true" className="block h-auto w-full opacity-0 pointer-events-none select-none" draggable={false} />
                                <div className="absolute inset-0 ring-2 ring-indigo-500 pointer-events-none" />
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
                        maxFontSize={Math.max(50, minimumFontSize)}
                        minFontSize={minimumFontSize}
                        onChange={(newStyle) => handlers.handleInlineStyleChange?.(handlers.formattingTarget, newStyle)}
                        onDismiss={() => handlers.setFormattingTarget?.(null)}
                    />
                )}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
                    <div
                        id={pageNumberElementId}
                        data-page-number="true"
                        data-print-control="true"
                        className="inline-flex min-w-8 h-8 px-2 items-center justify-center opacity-40 pointer-events-auto cursor-pointer select-none touch-none"
                        style={{
                            color: pageNumberStyle.color || style.textColor,
                            fontSize: `${pageNumberFontSize}px`,
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
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
            {(style.addedImages || []).filter((img) => img && img.id && (img.pageIndex || 0) === pageIndex && handlers.selectedId === img.id).map((img) => (
                <div
                    key={`controls-${img.id}`}
                    data-print-control="true"
                    className="absolute shadow-lg rounded-full flex gap-1 p-1 bg-white pointer-events-auto"
                    style={{
                        top: `${Math.max(-56, img.y - 56)}px`,
                        left: `${Math.max(104, Math.min(A4_WIDTH_PX - 104, img.x + (img.width / 2)))}px`,
                        transform: 'translateX(-50%)',
                        zIndex: 100000,
                    }}
                >
                    <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => handlers.handleLayerImage(e, img.id, 'back')} className="p-2.5 hover:bg-slate-100 rounded-l-full rounded-r text-slate-600" title="Enviar atras"><SendToBack size={24} /></button>
                    <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => handlers.handleLayerImage(e, img.id, 'front')} className="p-2.5 hover:bg-slate-100 rounded text-slate-600" title="Trazer frente"><BringToFront size={24} /></button>
                    <div className="w-px bg-slate-200 mx-1"></div>
                    <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => handlers.handleRemoveImage(e, img.id)} className="p-2.5 hover:bg-red-50 rounded text-red-500"><Trash2 size={24} /></button>
                    <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => handlers.openObjectMenu?.(e, { type: 'addedImage', id: img.id })} className="p-2.5 hover:bg-slate-100 rounded-l rounded-r-full text-slate-600" title="Mais opções"><MoreHorizontal size={24} /></button>
                </div>
            ))}
            {isPageSelected && (
                <>
                    <button
                        onClick={(e) => { e.stopPropagation(); handlers.setMultiSelectMode?.(!handlers.multiSelectMode); }}
                        className={`md:hidden absolute top-[-16px] right-8 z-30 p-2 rounded-full shadow-lg hover:scale-110 transition-all border-2 border-white ${handlers.multiSelectMode ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}
                        title="Seleção múltipla"
                    >
                        <CheckSquare size={18} />
                    </button>
                    {pageAddControls.after && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onAddPage(pageIndex, 'after'); }}
                            className="absolute right-[-32px] top-1/2 -translate-y-1/2 translate-x-1/2 z-30 p-2 bg-blue-600 rounded-full shadow-lg text-white hover:bg-blue-700 hover:scale-110 transition-all border-2 border-white"
                            title="Adicionar página depois"
                        >
                            <Plus size={24} />
                        </button>
                    )}
                    {pageIndex > 0 && pageAddControls.before && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onAddPage(pageIndex, 'before'); }}
                            className="absolute left-[-32px] top-1/2 -translate-y-1/2 -translate-x-1/2 z-30 p-2 bg-blue-600 rounded-full shadow-lg text-white hover:bg-blue-700 hover:scale-110 transition-all border-2 border-white"
                            title="Adicionar página antes"
                        >
                            <Plus size={24} />
                        </button>
                    )}
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
