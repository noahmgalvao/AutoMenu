import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { getCategoryFitRegression } from '../../domain/menu/menuPagination';
import type { MenuStyle, Product, SortOption } from '../../domain/menu/model';

interface HistoryState {
  products: Product[];
  style: MenuStyle;
  productEditSession?: number;
}

interface HistoryAction {
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
}

type HistoryEntry = HistoryState | HistoryAction;

interface EditorHistoryOptions {
  products: Product[];
  style: MenuStyle;
  sortOption: SortOption;
  setProductsRaw: Dispatch<SetStateAction<Product[]>>;
  setStyleRaw: Dispatch<SetStateAction<MenuStyle>>;
  pendingPersistActionLabel: { current: string | null };
}

const categorySizingFields = [
  'minimumFontSize', 'revisedMinimumFontSize',
  'layoutMode',
  'imageScale', 'categoryImageScale', 'productPhotoRatio', 'categoryPhotoRatio', 'productPhotoAlignments',
  'productPhotoAlignmentDefault', 'categoryPhotoAlignmentDefault', 'productImageFrame', 'categoryImages',
  'showImages', 'showCategoryImages', 'showPrices', 'hiddenProductIds', 'menuTitle', 'menuSubtitle', 'headingPages',
] as const satisfies readonly (keyof MenuStyle)[];

const addsProductsToCategories = (products: Product[], nextProducts: Product[]) => {
  const categories = new Map(products.map(product => [product.id, product.category]));
  return nextProducts.some(product => !product.isFreeText && categories.get(product.id) !== product.category);
};

export function useEditorHistory({ products, style, sortOption, setProductsRaw, setStyleRaw, pendingPersistActionLabel }: EditorHistoryOptions) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);
  const applying = useRef(false);
  const [isApplying, setIsApplying] = useState(false);
  const nextProductEditSession = useRef(0);
  const productEditSession = useRef<number | undefined>(undefined);
  const handleProductEditChange = useCallback((id: string | null) => {
    productEditSession.current = id ? ++nextProductEditSession.current : undefined;
  }, []);

  const saveCheckpoint = useCallback(() => {
    const newEntry = { products, style, productEditSession: productEditSession.current };
    setHistory((prev) => {
      const newHistory = [...prev, newEntry];
      return newHistory.length > 50 ? newHistory.slice(1) : newHistory;
    });
    setFuture([]);
  }, [products, style]);

  const setProducts = useCallback((value: React.SetStateAction<Product[]>) => {
    saveCheckpoint();
    setProductsRaw(value);
  }, [saveCheckpoint, setProductsRaw]);

  const setStyle = useCallback((value: React.SetStateAction<MenuStyle>) => {
    saveCheckpoint();
    setStyleRaw(previous => {
      const next = typeof value === 'function' ? value(previous) : value;
      const resizing = categorySizingFields.some(key => next[key] !== previous[key]);
      return resizing && getCategoryFitRegression(products, previous, products, next, sortOption) ? previous : next;
    });
  }, [products, saveCheckpoint, setStyleRaw, sortOption]);

  const setProductsAndStyle = useCallback((nextProducts: Product[], nextStyle: MenuStyle, actionLabel?: string) => {
    const resizing = categorySizingFields.some(key => nextStyle[key] !== style[key]);
    if ((resizing || addsProductsToCategories(products, nextProducts))
      && getCategoryFitRegression(products, style, nextProducts, nextStyle, sortOption)) return;
    saveCheckpoint();
    pendingPersistActionLabel.current = actionLabel || null;
    setProductsRaw(nextProducts);
    setStyleRaw(nextStyle);
  }, [pendingPersistActionLabel, products, saveCheckpoint, setProductsRaw, setStyleRaw, sortOption, style]);

  const recordAction = useCallback((action: HistoryAction) => {
    setHistory(previous => [...previous.slice(-49), action]);
    setFuture([]);
  }, []);

  const navigateHistory = async (direction: 'undo' | 'redo') => {
    if (applying.current) return;
    const undoing = direction === 'undo';
    const entry = undoing ? history[history.length - 1] : future[0];
    if (!entry) return;
    const removeEntry = undoing ? setHistory : setFuture;
    const addEntry = undoing ? setFuture : setHistory;
    let inverse: HistoryEntry;
    if ('undo' in entry) {
      applying.current = true;
      setIsApplying(true);
      try {
        if (!(await entry[direction]())) return;
      } finally {
        applying.current = false;
        setIsApplying(false);
      }
      inverse = entry;
    } else {
      if (productEditSession.current !== undefined && entry.productEditSession !== productEditSession.current) {
        document.dispatchEvent(new Event('automenu:close-product-editor'));
      }
      inverse = { products, style, productEditSession: entry.productEditSession };
      setProductsRaw(entry.products);
      setStyleRaw(entry.style);
    }
    removeEntry(entries => entries.filter(candidate => candidate !== entry));
    addEntry(entries => undoing ? [inverse, ...entries] : [...entries, inverse]);
  };
  const undo = () => void navigateHistory('undo');
  const redo = () => void navigateHistory('redo');

  useEffect(() => {
    const handleKeyboardUndoRedo = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.key.toLowerCase() !== 'z') return;
      if (!window.matchMedia('(min-width: 768px)').matches) return;

      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
    };

    window.addEventListener('keydown', handleKeyboardUndoRedo);
    return () => window.removeEventListener('keydown', handleKeyboardUndoRedo);
  }, [history, future, products, style]);

  const clearHistory = useCallback((keepMenuActions = false) => {
    const retain = (entries: HistoryEntry[]) => keepMenuActions ? entries.filter(entry => 'undo' in entry) : [];
    setHistory(retain);
    setFuture(retain);
  }, []);

  return {
    setProducts, setStyle, setProductsAndStyle,
    canUndo: !isApplying && history.length > 0, canRedo: !isApplying && future.length > 0,
    undo, redo, clearHistory, recordAction, handleProductEditChange,
  };
}
