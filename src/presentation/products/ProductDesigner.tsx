import { DesignerTapButton } from '../common/DesignerTapButton';
import { preventBrowserContextMenu } from '../common/noBrowserSelection';
import React from 'react';
import type { Product, MenuStyle, SortOption } from '../../domain/menu/model';
import { ShoppingCart, FileText, Maximize2, Minimize2, X } from 'lucide-react';
import { useProductDesignerLogic } from './useProductDesignerLogic';
import { ImportTools } from './ImportTools';
import { ProductList } from './ProductList';
import { InsightsModal } from './InsightsModal';
import { useBottomSheetDrag } from '../common/useBottomSheetDrag';
import { FREE_TEXT_PREFIX } from '../../domain/menu/flow';
import { getMenuPriceSymbol } from '../../domain/menu/price';
import {
    MenuImportFlow,
    MenuImportFlowHandle,
} from '../imports/MenuImportFlow';
import { ProductTransferModal } from './ProductTransferModal';
import { useAppServices } from '../app/AppServicesProvider';
import type { MenuProductSource } from '../../domain/workspace/model';
import { PricePropagationPrompt } from '../menu/PricePropagationPrompt';

interface ProductDesignerProps {
    products: Product[];
    setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
    style: MenuStyle;
    setStyle: React.Dispatch<React.SetStateAction<MenuStyle>>;
    setTemplates?: React.Dispatch<React.SetStateAction<MenuStyle[]>>;
    sortOption: SortOption;
    workspaceId: string;
    currentUserId: string;
    currentMenuId: string;
    onClose?: () => void;
    onPdfClick?: () => void;
    isOpen?: boolean;
    productsCanChangeCategory?: boolean;
    splitCategoryAcrossPages?: boolean;
    onImportVisibilityChange?: (visible: boolean) => void;
}

export const ProductDesigner: React.FC<ProductDesignerProps> = ({
    products,
    setProducts,
    style,
    setStyle,
    setTemplates,
    sortOption,
    workspaceId,
    currentUserId,
    currentMenuId,
    onClose,
    onPdfClick,
    isOpen = true,
    productsCanChangeCategory: legacyDrag,
    splitCategoryAcrossPages: legacySplit,
    onImportVisibilityChange,
}) => {
    const productsCanChangeCategory = style.productsCanChangeCategory ?? legacyDrag;
    const splitCategoryAcrossPages = style.splitCategoryAcrossPages ?? legacySplit;
    const { workspace: { linkSyncedMenuProducts } } = useAppServices();

    const {
        collapsedCategories,
        editModeId,
        menuOpenId,
        showInsights,
        bulkPercentage,
        bulkAdjustmentMode,
        pendingPricePropagation,
        isUploading,
        newItemDraft,
        formData,
        existingEdits,
        pendingDivider,
        productImageUpload,
        categoryImageUpload,
        setMenuOpenId,
        setShowInsights,
        setBulkPercentage,
        setBulkAdjustmentMode,
        setFormData,
        updateExistingEdit,
        updateProductDivider,
        productFileInputRef,
        categoryFileInputRef,
        handlers,
        toggleCollapse,
        handleBulkAdjust,
        applyPricePropagation,
        dismissPricePropagation,
        handleProductImageUpload,
        onProductImageClick,
        onRemoveProductImage,
        handleCategoryImageUpload,
        onCategoryImageClick,
        onRemoveCategoryImage,
        startEdit,
        cancelEdit,
        initiateAdd,
        saveEdit,
        saveOnExit,
        remove,
        handleToggleVisibility,
        prepareAIImport,
        commitAIImport
    } = useProductDesignerLogic({
        products,
        setProducts,
        style,
        setStyle,
        setTemplates,
        sortOption,
        workspaceId,
        currentUserId,
        currentMenuId,
        productsCanChangeCategory
    });

    const { sheetRef, height, isMobile, isExpanded, toggleExpanded, dragHandlers } = useBottomSheetDrag(isOpen, onClose);
    const importFlowRef = React.useRef<MenuImportFlowHandle>(null);
    const [isProductTransferOpen, setIsProductTransferOpen] = React.useState(false);

    const handleProductTransfer = async (source: MenuProductSource, replace: boolean, sync: boolean) => {
        const importedProducts = source.products.map((product) => ({ ...product }));
        if (sync) {
            await linkSyncedMenuProducts({
                workspaceId,
                sourceMenuId: source.menu.id,
                targetMenuId: currentMenuId,
                productIds: importedProducts.map((product) => product.id),
            });
        }
        setProducts((current) => {
            const freeText = current.filter((product) => product.isFreeText);
            if (replace) return [...importedProducts, ...freeText];
            const existingIds = new Set(current.map((product) => product.id));
            return [...current, ...importedProducts.filter((product) => !existingIds.has(product.id))];
        });
        setStyle((current) => ({
            ...current,
            customCategoryOrder: Array.from(new Set([
                ...(current.customCategoryOrder || []),
                ...importedProducts.map((product) => product.category),
            ])),
        }));
    };

    const grouped = React.useMemo(() => (
        Object.fromEntries(
            Object.entries(handlers.groupedProducts).map(([category, categoryProducts]) => [
                category,
                (categoryProducts as Product[]).filter((product) => !product.isFreeText),
            ])
        ) as Record<string, Product[]>
    ), [handlers.groupedProducts]);
    const categories = handlers.sortedCategories.filter((category) => (
        !category.startsWith(FREE_TEXT_PREFIX) && (grouped[category]?.length || 0) > 0
    ));

    React.useEffect(() => {
        if (!editModeId) return;
        if (!isOpen) {
            saveOnExit();
            return;
        }
        const saveOnOutsideClick = (event: MouseEvent) => {
            if (event.target instanceof Element && !event.target.closest('[data-product-designer-edit-form], [data-product-designer-file], [data-editor-popover][data-product-image-surface]')) {
                saveOnExit();
            }
        };
        document.addEventListener('click', saveOnOutsideClick, true);
        return () => document.removeEventListener('click', saveOnOutsideClick, true);
    }, [editModeId, isOpen, saveOnExit]);

    React.useEffect(() => {
        if (!isOpen) return;

        const handleDeleteKey = (event: KeyboardEvent) => {
            if (event.key !== 'Delete') return;

            const target = event.target as HTMLElement | null;
            if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
            if (document.body.dataset.automenuDeleteContext !== 'product-designer') return;

            const selectedItems = handlers.selectedItems || [];
            const firstItem = selectedItems.find((item: any) => (
                item.type === 'category' || item.type === 'product' || item.type === 'freeText'
            ));
            if (!firstItem) return;

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            remove(firstItem.id, firstItem.type === 'category' ? 'category' : 'product');
        };

        window.addEventListener('keydown', handleDeleteKey, true);
        return () => window.removeEventListener('keydown', handleDeleteKey, true);
    }, [handlers.selectedItems, isOpen, remove]);

    return (
        <>
            <div ref={sheetRef} id="designer-sheet-products" data-designer-sheet data-sheet-open={isOpen} inert={!isOpen} data-no-browser-selection onContextMenu={preventBrowserContextMenu}
                className={`
                flex flex-col bg-slate-50 overflow-hidden
                /* Mobile: Bottom Sheet */
                fixed bottom-0 left-0 right-0 z-40 max-md:max-h-[var(--automenu-max-sheet-height,100dvh)]
                rounded-t-2xl shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] border-t border-slate-200
                md:transition-all
                md:relative md:inset-auto md:h-full md:z-auto md:shadow-none md:rounded-none md:border-t-0 md:border-r md:pt-16
                ${isOpen ? 'md:w-96 md:opacity-100' : 'md:w-0 md:opacity-0'}
            `}
                style={{ height: isMobile ? height : undefined }}
                onPointerDownCapture={() => {
                    document.body.dataset.automenuDeleteContext = 'product-designer';
                }}
            >
                {/* Header */}
                <div
                    className="p-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center flex-shrink-0 min-w-0 touch-none cursor-grab active:cursor-grabbing"
                    {...dragHandlers}
                >
                    <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm pointer-events-none min-w-0 truncate">
                        <ShoppingCart size={16} /> Produtos
                    </h2>
                    <div className="flex shrink-0 gap-1.5">
                        <button type="button" onClick={onPdfClick} className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 pointer-events-auto" onPointerDown={e => e.stopPropagation()} title="Exportar PDF"><FileText size={14} /> PDF</button>
                        <DesignerTapButton type="button" onClick={toggleExpanded} aria-expanded={isExpanded} className="md:hidden h-8 w-8 rounded-lg text-slate-500 hover:bg-white hover:text-slate-800 pointer-events-auto flex items-center justify-center" onPointerDown={e => e.stopPropagation()} title={isExpanded ? 'Voltar à visualização parcial' : 'Expandir painel'} aria-label={isExpanded ? 'Voltar à visualização parcial' : 'Expandir painel'}>{isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</DesignerTapButton>
                        <DesignerTapButton type="button" onClick={onClose} className="md:hidden h-8 w-8 rounded-lg text-slate-500 hover:bg-white hover:text-slate-800 pointer-events-auto flex items-center justify-center" onPointerDown={e => e.stopPropagation()} title="Fechar painel" aria-label="Fechar painel"><X size={18} /></DesignerTapButton>
                    </div>
                </div>

                {/* List - Content Scrolls Here */}
                <div
                    className="flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain custom-scrollbar p-4 space-y-4 pb-20 min-w-0"
                    data-product-designer-scroll-container="true"
                    onScroll={() => { if (menuOpenId) setMenuOpenId(null); }}
                    onClickCapture={(event) => {
                        const target = event.target as Element | null;
                        if (menuOpenId && !target?.closest('[data-product-designer-options-menu="true"]')) {
                            event.preventDefault();
                            event.stopPropagation();
                            setMenuOpenId(null);
                        }
                    }}
                >

                    <ImportTools
                        onStartAIImport={() => importFlowRef.current?.start()}
                        isUploading={isUploading}
                        bulkPercentage={bulkPercentage}
                        setBulkPercentage={setBulkPercentage}
                        bulkAdjustmentMode={bulkAdjustmentMode}
                        currencySymbol={getMenuPriceSymbol(style)}
                        setBulkAdjustmentMode={setBulkAdjustmentMode}
                        handleBulkAdjust={handleBulkAdjust}
                        setShowInsights={setShowInsights}
                        multiSelectMode={handlers.multiSelectMode}
                        setMultiSelectMode={handlers.setMultiSelectMode}
                        onImportProducts={() => setIsProductTransferOpen(true)}
                    />

                    {/* NATIVE DRAG AND DROP LIST */}
                    <ProductList
                        categories={categories}
                        grouped={grouped}
                        style={style}
                        setStyle={setStyle}
                        handlers={handlers}
                        collapsedCategories={collapsedCategories}
                        toggleCollapse={toggleCollapse}
                        editModeId={editModeId}
                        editTogether
                        menuOpenId={menuOpenId}
                        setMenuOpenId={setMenuOpenId}
                        formData={formData}
                        setFormData={setFormData}
                        newItemDraft={newItemDraft}
                        existingEdits={existingEdits}
                        pendingDivider={pendingDivider}
                        updateExistingEdit={updateExistingEdit}
                        updateProductDivider={updateProductDivider}
                        startEdit={startEdit}
                        saveEdit={saveEdit}
                        cancelEdit={cancelEdit}
                        remove={remove}
                        handleToggleVisibility={handleToggleVisibility}
                        initiateAdd={initiateAdd}
                        onCategoryImageClick={onCategoryImageClick}
                        onRemoveCategoryImage={onRemoveCategoryImage}
                        onProductImageClick={onProductImageClick}
                        onRemoveProductImage={onRemoveProductImage}
                        productImageUpload={productImageUpload}
                        categoryImageUpload={categoryImageUpload}
                    />
                </div>
            </div>

            {/* Insights Modal */}
            {showInsights && (
                <InsightsModal
                    products={products}
                    categories={categories}
                    grouped={grouped}
                    style={style}
                    onClose={() => setShowInsights(false)}
                />
            )}
            <PricePropagationPrompt
                request={pendingPricePropagation}
                style={style}
                onApply={applyPricePropagation}
                onDismiss={dismissPricePropagation}
            />

            <input type="file" ref={productFileInputRef} data-product-designer-file className="hidden" onChange={handleProductImageUpload} accept="image/*" />
            <input type="file" ref={categoryFileInputRef} data-product-designer-file className="hidden" onChange={handleCategoryImageUpload} accept="image/*" />
            <MenuImportFlow
                ref={importFlowRef}
                disabled={isUploading}
                sortOption={sortOption}
                workspaceId={workspaceId}
                currentUserId={currentUserId}
                currentMenuId={currentMenuId}
                productsCanChangeCategory={productsCanChangeCategory}
                splitCategoryAcrossPages={splitCategoryAcrossPages}
                currentProducts={products}
                currentStyle={style}
                onPrepare={prepareAIImport}
                onComplete={commitAIImport}
                onVisibilityChange={onImportVisibilityChange}
            />
            <ProductTransferModal
                open={isProductTransferOpen}
                workspaceId={workspaceId}
                currentMenuId={currentMenuId}
                products={products}
                preferenceKey={`automenu:product-transfer-options:${currentUserId}`}
                onClose={() => setIsProductTransferOpen(false)}
                onApply={handleProductTransfer}
            />
        </>
    );
};
