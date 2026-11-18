import React, { useCallback, useMemo, useState } from 'react';
import { InteractionProps, DraftItem, NUDGE_STEP, SelectionType } from './types';

import { useMenuData } from './useMenuData';
import { useSelectionState } from './useSelectionState';
import { useImageManipulation } from './useImageManipulation';
import { useDraggableInteractions } from './useDraggableInteractions';
import { useKeyboardMovement } from './useKeyboardMovement';
import { useCategoryColumnResize } from './useCategoryColumnResize';

// Re-export constants needed by components if any (legacy compatibility)
export { NUDGE_STEP };

export const useMenuInteractions = (props: InteractionProps) => {
    // 0. State needed for composition (lifted up for useKeyboardMovement)
    const [draftItem, setDraftItem] = useState<DraftItem | null>(null);

    const { 
        products, style, sortOption 
    } = props;

    // 1. Data Preparation
    const { groupedProductsBase, sortedCategoriesBase } = useMenuData({ products, style, sortOption });

    // 2. Selection & UI State
    const selectionState = useSelectionState(props, sortedCategoriesBase, groupedProductsBase);

    // 3. Image Manipulation
    const imageInteractions = useImageManipulation(props, selectionState.handleSelection, selectionState.selectedItems, selectionState.multiSelectMode);
    const columnResizeContext = useMemo(() => ({
        products,
        groupedProducts: groupedProductsBase,
        sortedCategories: sortedCategoriesBase,
        splitCategoryAcrossPages: props.splitCategoryAcrossPages,
    }), [groupedProductsBase, products, props.splitCategoryAcrossPages, sortedCategoriesBase]);
    const columnResizeInteractions = useCategoryColumnResize(style, props.onStyleUpdate, columnResizeContext);
    const { clearMultiSelectionTo, setMultiSelectMode } = selectionState;
    const collapseDragSelection = useCallback((type: SelectionType, id: string) => {
        clearMultiSelectionTo(type, id);
        setMultiSelectMode(false);
    }, [clearMultiSelectionTo, setMultiSelectMode]);

    // 4. Draggable Interactions (Heavy Logic)
    // Calculates the *FINAL* sorted/grouped data (Live vs Saved)
    const draggableInteractions = useDraggableInteractions(
        props, 
        groupedProductsBase, 
        sortedCategoriesBase, 
        selectionState.handleSelection,
        selectionState.editingId,
        selectionState.multiSelectMode,
        selectionState.selectedItems,
        collapseDragSelection,
    );

    // 5. Keyboard & Free Text (Uses final data)
    const keyboardInteractions = useKeyboardMovement(
        props,
        draggableInteractions.sortedCategories,
        draggableInteractions.groupedProducts,
        draftItem,
        setDraftItem,
        selectionState.selectedItems,
        selectionState.clearMultiSelectionTo
    );

    // Wrapper to inject dependencies into handlePageDoubleClick
    const handlePageDoubleClickWrapper = (e: React.MouseEvent, pageIndex: number) => {
        keyboardInteractions.handlePageDoubleClick(
            e, 
            pageIndex, 
            selectionState.handleSelection, 
            selectionState.setSelectedPageIndex
        );
    };

    return {
        // ...selectionState
        selectedId: selectionState.selectedId,
        setSelectedId: selectionState.setSelectedId,
        selectedItems: selectionState.selectedItems,
        setSelectedItems: selectionState.setSelectedItems,
        multiSelectMode: selectionState.multiSelectMode,
        setMultiSelectMode: selectionState.setMultiSelectMode,
        editingId: selectionState.editingId,
        setEditingId: selectionState.setEditingId,
        formattingTarget: selectionState.formattingTarget,
        setFormattingTarget: selectionState.setFormattingTarget,
        showAddModal: selectionState.showAddModal,
        setShowAddModal: selectionState.setShowAddModal,
        selectedPageIndex: selectionState.selectedPageIndex,
        setSelectedPageIndex: selectionState.setSelectedPageIndex,
        showDeletePageConfirm: selectionState.showDeletePageConfirm,
        setShowDeletePageConfirm: selectionState.setShowDeletePageConfirm,
        pageToDelete: selectionState.pageToDelete,
        setPageToDelete: selectionState.setPageToDelete,
        handleSelection: selectionState.handleSelection,
        clearMultiSelectionTo: selectionState.clearMultiSelectionTo,
        replaceSelectedItems: selectionState.replaceSelectedItems,
        isSelected: selectionState.isSelected,
        getSelectionAddControls: selectionState.getSelectionAddControls,
        getPageAddControls: selectionState.getPageAddControls,
        handleBlur: selectionState.handleBlur,
        handleKeyDown: selectionState.handleKeyDown,
        startEditing: selectionState.startEditing,
        isReadyToEdit: selectionState.isReadyToEdit,
        startImageEditing: selectionState.startImageEditing,
        setEditingField: selectionState.setEditingField,
        startMenuTextEditing: selectionState.startMenuTextEditing,

        // ...imageInteractions
        imageEditPage: imageInteractions.imageEditPage,
        draggedImageId: imageInteractions.draggedImageId,
        setDraggedImageId: imageInteractions.setDraggedImageId,
        handleImageDragStart: (event: React.PointerEvent, id: string, pageIndex?: number) => {
            if (selectionState.isReadyToEdit('addedImage', id)) {
                event.stopPropagation();
                return;
            }
            const selected = selectionState.selectedItems.some(item => item.type === 'addedImage' && item.id === id);
            if (selected && !event.shiftKey && !event.ctrlKey && !event.metaKey
                && (selectionState.multiSelectMode || selectionState.selectedItems.length > 1)) {
                draggableInteractions.handleDragStart(event, 'addedImage', id);
            } else {
                imageInteractions.handleImageDragStart(event, id, pageIndex);
            }
        },
        handleResizeImage: imageInteractions.handleResizeImage,
        resizeImageByDelta: imageInteractions.resizeImageByDelta,
        startImageResize: imageInteractions.startImageResize,
        resizeImageFromCorner: imageInteractions.resizeImageFromCorner,
        stopImageResize: imageInteractions.stopImageResize,
        handleRemoveImage: imageInteractions.handleRemoveImage,
        handleLayerImage: imageInteractions.handleLayerImage,

        liveCategoryColumnWidths: columnResizeInteractions.liveCategoryColumnWidths,
        isResizingCategoryColumns: columnResizeInteractions.isResizingCategoryColumns,
        columnResizeGuide: columnResizeInteractions.columnResizeGuide,
        startCategoryColumnResize: columnResizeInteractions.startCategoryColumnResize,
        updateProduct: props.onUpdateProduct,
        updateProducts: props.onUpdateProducts,
        updateStyle: props.onStyleUpdate,

        // ...draggableInteractions
        dragScope: draggableInteractions.dragScope,
        draggedItem: draggableInteractions.draggedItem,
        isCanvasObjectDragging: (type: SelectionType, id: string) =>
            draggableInteractions.draggedSelection.some(item => item.type === type && item.id === id)
            || (draggableInteractions.draggedItem?.id === id
                && draggableInteractions.draggedItem.type === (type === 'freeText' ? 'product' : type))
            || (type === 'addedImage' && imageInteractions.draggedImageId === id),
        // liveCategoryOrder: draggableInteractions.liveCategoryOrder, // Not usually exposed but available if needed
        // liveProductOrder: draggableInteractions.liveProductOrder,
        liveCategoryPageAssignments: draggableInteractions.liveCategoryPageAssignments,
        liveCategoryPositions: draggableInteractions.liveCategoryPositions,
        liveCanvasLayers: draggableInteractions.liveCanvasLayers,
        sortedCategories: draggableInteractions.sortedCategories,
        groupedProducts: draggableInteractions.groupedProducts,
        handleDragStart: draggableInteractions.handleDragStart,
        handleDragEnd: draggableInteractions.handleDragEnd,
        handleDragOverItem: draggableInteractions.handleDragOverItem,

        // ...keyboardInteractions & Draft
        draftItem, 
        setDraftItem,
        visualList: keyboardInteractions.visualList,
        draftInputRef: keyboardInteractions.draftInputRef,
        handleGlobalMove: keyboardInteractions.handleGlobalMove,
        handleDraftCommit: keyboardInteractions.handleDraftCommit,
        handleRemove: keyboardInteractions.handleRemove,
        handleAddClick: keyboardInteractions.handleAddClick,
        
        // Wrapped handlers
        handlePageDoubleClick: handlePageDoubleClickWrapper,
    };
};
