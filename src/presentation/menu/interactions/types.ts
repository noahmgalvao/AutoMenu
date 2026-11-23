import type React from 'react';
import type { Product, MenuStyle, SortOption } from '../../../domain/menu/model';

export const NUDGE_STEP = 10;
export const TOUCH_LONG_PRESS_MS = 320;

export type SelectionType = 'product' | 'category' | 'freeText' | 'addedImage' | 'page' | 'menuTitle' | 'menuSubtitle' | null;
export type SelectableType = Exclude<SelectionType, null>;

export interface SelectionItem {
    backgroundPages?: number[];
    type: SelectableType;
    id: string;
}

export type FormattingField = 'name' | 'price' | 'description' | 'category' | 'freeText' | 'menuTitle' | 'menuSubtitle' | 'pageNumber';

export interface FormattingTarget {
    type: 'product' | 'category' | 'freeText' | 'menuTitle' | 'menuSubtitle' | 'pageNumber';
    id: string;
    field: FormattingField;
    elementId: string;
}

export type MoveDirection = 'up' | 'down' | 'left' | 'right';

export interface DraftItem {
    pageIndex: number;
    columnIndex: number;
    top: number; // relative to page top
    pageX?: number;
    floorId: string | null;
    floorBottom: number;
    ceilingId: string | null;
    ceilingTop: number;
    forcePagePlacement?: boolean;
    blankPageId?: string | null;
    targetCategory?: string;
    targetProductId?: string | null;
    freeTextPositionUpdates?: Record<string, { pageIndex: number; columnIndex: number; y: number }>;
}

export interface InteractionProps {
    products: Product[];
    style: MenuStyle;
    sortOption: SortOption;
    scale?: number;
    // Callbacks
    onMoveCategory?: (category: string, direction: MoveDirection) => void;
    onMoveProduct?: (productId: string, category: string, direction: MoveDirection) => void;
    onUpdateProduct?: (id: string, field: keyof Product, value: any, priceEnteredWithDecimals?: boolean) => void;
    onUpdateProducts?: (updates: { id: string, field: keyof Product, value: any }[]) => void;
    onUpdateCategoryName?: (oldName: string, newName: string) => void;
    onUpdateMenuText?: (field: 'menuTitle' | 'menuSubtitle', value: string) => void;
    onCommitCategoryOrder?: (newOrder: string[]) => void;
    onCommitProductOrder?: (category: string, newOrder: string[], manuallyChanged: boolean) => void;
    onToggleProductVisibility?: (productId: string, visible: boolean) => void;
    onAddProduct?: (category: string, productId?: string, isFreeText?: boolean, specificId?: string, initialData?: Partial<Product>, options?: { index?: number }) => void;
    onAddCategory?: (nearCategory: string, position: 'before' | 'after') => void;
    onDeleteProduct?: (productId: string) => void;
    onStyleUpdate?: React.Dispatch<React.SetStateAction<MenuStyle>>;
    onImageEditEnd?: (id: string) => void;
    onSelectionChange?: (selection: { type: SelectionType, id: string | null }, extendSelection?: boolean) => void;
    selection?: { type: SelectionType, id: string | null };
    productsCanChangeCategory?: boolean;
    splitCategoryAcrossPages?: boolean;
}
