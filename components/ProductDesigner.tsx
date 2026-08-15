import React from 'react';
import { Product, MenuStyle, SortOption } from '../types';
import { ShoppingCart, PanelLeftClose, Printer } from 'lucide-react';
import { useProductDesignerLogic } from '../hooks/useProductDesignerLogic';
import { ImportTools } from './ProductDesigner/ImportTools';
import { ProductList } from './ProductDesigner/ProductList';
import { InsightsModal } from './ProductDesigner/InsightsModal';
import { useBottomSheetDrag } from '../hooks/useBottomSheetDrag';
import { FREE_TEXT_PREFIX } from '../utils/menuPagination';
import {
    MenuImportFlow,
    MenuImportFlowHandle,
} from './ProductDesigner/MenuImportFlow';

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
    onPrint?: () => void;
    isOpen?: boolean;
    productsCanChangeCategory?: boolean;
    splitCategoryAcrossPages?: boolean;
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
    onPrint,
    isOpen = true,
    productsCanChangeCategory,
    splitCategoryAcrossPages
}) => {

    const {
        collapsedCategories,
        editModeId,
        menuOpenId,
        showInsights,
        bulkPercentage,
        bulkAdjustmentMode,
        isUploading,
        newItemDraft,
        formData,
        setMenuOpenId,
        setShowInsights,
        setBulkPercentage,
        setBulkAdjustmentMode,
        setFormData,
        productFileInputRef,
        handlers,
        toggleCollapse,
        handleBulkAdjust,
        handleProductImageUpload,
        onProductImageClick,
        onRemoveProductImage,
        startEdit,
        cancelEdit,
        initiateAdd,
        saveEdit,
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

    const { height, isDragging, isMobile, dragHandlers } = useBottomSheetDrag(isOpen, onClose);
    const importFlowRef = React.useRef<MenuImportFlowHandle>(null);

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
            <div
                className={`
                flex flex-col bg-slate-50 overflow-hidden
                /* Mobile: Bottom Sheet */
                fixed bottom-0 left-0 right-0 z-40
                rounded-t-2xl shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] border-t border-slate-200
                transform transition-transform
                ${isOpen ? 'translate-y-0' : 'translate-y-full'}

                /* Desktop Overrides */
                md:translate-y-0 md:transform-none md:transition-all
                md:relative md:inset-auto md:h-full md:z-auto md:shadow-none md:rounded-none md:border-t-0 md:border-r md:pt-16
                ${isOpen ? 'md:w-96 md:opacity-100' : 'md:w-0 md:opacity-0'}
            `}
                style={{
                    // CRITICAL FIX: Always maintain valid height. Visibility is handled by translateY.
                    height: isMobile ? height : undefined,
                    // Disable transition ONLY during drag to prevent lag, otherwise smooth slide
                    transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s ease-out, opacity 0.3s ease-out'
                }}
                onPointerDownCapture={() => {
                    document.body.dataset.automenuDeleteContext = 'product-designer';
                }}
            >
                {/* Header */}
                <div
                    className="p-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center flex-shrink-0 min-w-0 touch-none cursor-grab active:cursor-grabbing"
                    {...dragHandlers}
                >
                    <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm pointer-events-none">
                        <ShoppingCart size={16} /> Designer de produtos
                    </h2>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="md:hidden text-slate-500 hover:text-slate-800 pointer-events-auto" onPointerDown={e => e.stopPropagation()}><PanelLeftClose size={18} /></button>
                        <button onClick={onPrint} className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded hover:bg-slate-800 flex items-center gap-1 pointer-events-auto" onPointerDown={e => e.stopPropagation()}> <Printer size={12} /> PDF </button>
                    </div>
                </div>

                {/* List - Content Scrolls Here */}
                <div
                    className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-4 space-y-4 pb-20 min-w-0"
                    onScroll={() => { if (menuOpenId) setMenuOpenId(null); }}
                >

                    <ImportTools
                        onStartAIImport={() => importFlowRef.current?.start()}
                        isUploading={isUploading}
                        bulkPercentage={bulkPercentage}
                        setBulkPercentage={setBulkPercentage}
                        bulkAdjustmentMode={bulkAdjustmentMode}
                        setBulkAdjustmentMode={setBulkAdjustmentMode}
                        handleBulkAdjust={handleBulkAdjust}
                        style={style}
                        setStyle={setStyle}
                        setShowInsights={setShowInsights}
                        multiSelectMode={handlers.multiSelectMode}
                        setMultiSelectMode={handlers.setMultiSelectMode}
                    />

                    {/* NATIVE DRAG AND DROP LIST */}
                    <ProductList
                        categories={categories}
                        grouped={grouped}
                        style={style}
                        handlers={handlers}
                        collapsedCategories={collapsedCategories}
                        toggleCollapse={toggleCollapse}
                        editModeId={editModeId}
                        menuOpenId={menuOpenId}
                        setMenuOpenId={setMenuOpenId}
                        formData={formData}
                        setFormData={setFormData}
                        newItemDraft={newItemDraft}
                        startEdit={startEdit}
                        saveEdit={saveEdit}
                        cancelEdit={cancelEdit}
                        remove={remove}
                        handleToggleVisibility={handleToggleVisibility}
                        initiateAdd={initiateAdd}
                        onProductImageClick={onProductImageClick}
                        onRemoveProductImage={onRemoveProductImage}
                    />
                </div>
            </div>

            {/* Insights Modal */}
            {showInsights && (
                <InsightsModal
                    products={products}
                    categories={categories}
                    grouped={grouped}
                    onClose={() => setShowInsights(false)}
                />
            )}

            <input type="file" ref={productFileInputRef} className="hidden" onChange={handleProductImageUpload} accept="image/*" />
            <MenuImportFlow
                ref={importFlowRef}
                disabled={isUploading}
                sortOption={sortOption}
                workspaceId={workspaceId}
                currentUserId={currentUserId}
                currentMenuId={currentMenuId}
                productsCanChangeCategory={productsCanChangeCategory}
                splitCategoryAcrossPages={splitCategoryAcrossPages}
                onPrepare={prepareAIImport}
                onComplete={commitAIImport}
            />
        </>
    );
};
