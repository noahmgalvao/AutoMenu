import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { MenuStyle, Product } from '../../domain/menu/model';

interface HistoryState {
  products: Product[];
  style: MenuStyle;
  productEditSession?: number;
}

interface EditorHistoryOptions {
  products: Product[];
  style: MenuStyle;
  setProductsRaw: Dispatch<SetStateAction<Product[]>>;
  setStyleRaw: Dispatch<SetStateAction<MenuStyle>>;
  pendingPersistActionLabel: { current: string | null };
}

export function useEditorHistory({ products, style, setProductsRaw, setStyleRaw, pendingPersistActionLabel }: EditorHistoryOptions) {
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);
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
  }, [saveCheckpoint, setProductsRaw, setStyleRaw]);

  const setStyle = useCallback((value: React.SetStateAction<MenuStyle>) => {
    saveCheckpoint();
    setStyleRaw(value);
  }, [saveCheckpoint, setProductsRaw, setStyleRaw]);

  const setProductsAndStyle = useCallback((nextProducts: Product[], nextStyle: MenuStyle, actionLabel?: string) => {
    saveCheckpoint();
    pendingPersistActionLabel.current = actionLabel || null;
    setProductsRaw(nextProducts);
    setStyleRaw(nextStyle);
  }, [saveCheckpoint, setProductsRaw, setStyleRaw]);

  const undo = () => {
    if (history.length === 0) {
      return;
    }

    const previous = history[history.length - 1];
    const newHistory = history.slice(0, -1);

    if (productEditSession.current !== undefined && previous.productEditSession !== productEditSession.current) {
      document.dispatchEvent(new Event('automenu:close-product-editor'));
    }
    setFuture((prev) => [{ products, style, productEditSession: previous.productEditSession }, ...prev]);
    setProductsRaw(previous.products);
    setStyleRaw(previous.style);
    setHistory(newHistory);
  };

  const redo = () => {
    if (future.length === 0) {
      return;
    }

    const next = future[0];
    const newFuture = future.slice(1);

    if (productEditSession.current !== undefined && next.productEditSession !== productEditSession.current) {
      document.dispatchEvent(new Event('automenu:close-product-editor'));
    }
    setHistory((prev) => [...prev, { products, style, productEditSession: next.productEditSession }]);
    setProductsRaw(next.products);
    setStyleRaw(next.style);
    setFuture(newFuture);
  };

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

  const clearHistory = useCallback(() => {
    setHistory([]);
    setFuture([]);
  }, []);

  return {
    setProducts, setStyle, setProductsAndStyle,
    canUndo: history.length > 0, canRedo: future.length > 0,
    undo, redo, clearHistory, handleProductEditChange,
  };
}
