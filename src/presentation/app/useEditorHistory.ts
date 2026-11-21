import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { MenuStyle, Product } from '../../domain/menu/model';

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
  setProductsRaw: Dispatch<SetStateAction<Product[]>>;
  setStyleRaw: Dispatch<SetStateAction<MenuStyle>>;
  pendingPersistActionLabel: { current: string | null };
}

export function useEditorHistory({ products, style, setProductsRaw, setStyleRaw, pendingPersistActionLabel }: EditorHistoryOptions) {
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
