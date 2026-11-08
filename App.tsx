import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import { AlertCircle, ChefHat, History, Loader2, Paintbrush, Plus, Save, Send, ShoppingCart, X } from 'lucide-react';
import MenuDesigner from './components/MenuDesigner';
import { AuthScreen } from './components/AuthScreen';
import { ProfileMenu } from './components/ProfileMenu';
import { PublishModal } from './components/PublishModal';
import { CreateMenuModal } from './components/CreateMenuModal';
import { RevisionHistoryModal } from './components/RevisionHistoryModal';
import type { PrintCanvasOptions } from './components/MenuDesigner/PrintCanvasModal';
import type { PdfExportResult } from './utils/pdfExport';
import { getErrorMessage } from './utils/errors';
import { getPublicationUrl } from './utils/publicationUrl';
import { INITIAL_STYLE, PRESET_TEMPLATES } from './constants';
import {
  FontSizeLimits,
  LoadedWorkspaceData,
  MenuContentSpacing,
  MenuMargins,
  MenuStyle,
  MenuPublication,
  PriceDecimalPlaces,
  PriceDecimalSeparator,
  Product,
  SortOption,
} from './types';
import {
  getInitialSession,
  onSupabaseAuthChange,
  sendPasswordReauthentication,
  signInWithEmail,
  signOutCurrentUser,
  signUpWithEmail,
  updatePasswordWithNonce,
} from './services/authService';
import { getSupabaseConfigError, isSupabaseConfigured } from './services/supabaseClient';
import {
  createWorkspaceMenu,
  deleteWorkspaceMenu,
  getMenuContentSignature,
  getMenuPublication,
  loadWorkspaceData,
  loadWorkspaceMenuData,
  normalizeWorkspaceClientState,
  publishWorkspaceMenu,
  renameWorkspaceMenu,
  saveWorkspaceState,
  updatePortablePublicationMenuSlug,
  updatePublicationMenuSlug,
  updateAccountIdentity,
  updateWorkspaceRuleSettings,
} from './services/workspaceService';

const ProductDesigner = React.lazy(() => import('./components/ProductDesigner').then((module) => ({
  default: module.ProductDesigner,
})));
const SettingsModal = React.lazy(() => import('./components/SettingsModal').then((module) => ({
  default: module.SettingsModal,
})));

interface HistoryState {
  products: Product[];
  style: MenuStyle;
}

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'local' | 'error';
type PrintRequestMode = 'download' | 'download-direct' | 'share-direct' | 'publish' | 'publish-silent';
type PublishLinkAction = 'copy-link' | 'share-link' | 'download-qr' | 'share-qr' | 'open-link';
type PublishAction = PublishLinkAction | 'publish' | 'pdf-options' | 'download-pdf' | 'share-pdf' | 'save-slug' | null;
type CachedPdfExport = {
  contentSignature: string;
  result: PdfExportResult;
};

const SAVE_ERROR_MESSAGE = 'Não foi possível salvar as alterações. Entre em contato com o suporte.';
const DEFAULT_SORT_OPTION: SortOption = { field: 'name', direction: 'asc' };
const SAVE_DEBOUNCE_MS = 2000;
const SAVE_RETRY_DELAYS_MS = [600, 1600, 3200];

const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement('textarea');
  input.value = value;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
};

const qrCodeBlobCache = new Map<string, Promise<Blob>>();

const createQrCodeBlob = (value: string) => {
  const cached = qrCodeBlobCache.get(value);
  if (cached) return cached;
  const task = QRCode.toDataURL(value, {
    width: 1024,
    margin: 4,
    errorCorrectionLevel: 'H',
    color: { dark: '#0f172a', light: '#ffffff' },
  }).then(async (dataUrl) => (await fetch(dataUrl)).blob());
  qrCodeBlobCache.set(value, task);
  void task.catch(() => {
    if (qrCodeBlobCache.get(value) === task) qrCodeBlobCache.delete(value);
  });
  return task;
};

interface PersistPayload {
  workspaceId: string;
  userId: string;
  menuId: string;
  products: Product[];
  style: MenuStyle;
  templates: MenuStyle[];
  sortOption: SortOption;
  actionLabel?: string;
}

interface LocalPendingSnapshot {
  products: Product[];
  style: MenuStyle;
  templates: MenuStyle[];
  sortOption: SortOption;
  updatedAt: string;
}

interface WorkspaceViewCache {
  version: 1;
  userId: string;
  signature: string;
  data: LoadedWorkspaceData;
}

const getPendingStorageKey = (workspaceId: string, menuId: string) =>
  `automenu_pending_workspace_${workspaceId}_${menuId}`;

const getLastActiveMenuStorageKey = (userId: string) =>
  `automenu_last_active_menu_${userId}`;

const getWorkspaceViewCacheKey = (userId: string) =>
  `automenu_workspace_view_v1_${userId}`;

const readWorkspaceViewCache = (userId: string): WorkspaceViewCache | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(getWorkspaceViewCacheKey(userId));
    if (!raw) return null;
    const cached = JSON.parse(raw) as WorkspaceViewCache;
    if (
      cached.version !== 1
      || cached.userId !== userId
      || !cached.signature
      || cached.data?.profile?.userId !== userId
      || !cached.data?.workspace?.id
      || !cached.data?.menu?.id
      || !cached.data?.currentVersion?.id
    ) {
      return null;
    }
    return cached;
  } catch {
    return null;
  }
};

const writeWorkspaceViewCache = (userId: string, data: LoadedWorkspaceData) => {
  if (typeof window === 'undefined') return;

  try {
    const cached: WorkspaceViewCache = {
      version: 1,
      userId,
      signature: getPersistSignature(data),
      data,
    };
    window.localStorage.setItem(getWorkspaceViewCacheKey(userId), JSON.stringify(cached));
  } catch {
    // O cache é uma otimização; falhas de cota não interferem no salvamento principal.
  }
};

const scheduleWorkspaceViewCacheWrite = (userId: string, data: LoadedWorkspaceData) => {
  if (typeof window === 'undefined') return;
  window.setTimeout(() => writeWorkspaceViewCache(userId, data), 0);
};

const clearWorkspaceViewCache = (userId: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(getWorkspaceViewCacheKey(userId));
  } catch {
    // Sem ação necessária quando o armazenamento local está indisponível.
  }
};

const readLastActiveMenuId = (userId: string) => {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage.getItem(getLastActiveMenuStorageKey(userId));
  } catch {
    return null;
  }
};

const writeLastActiveMenuId = (userId: string, menuId: string) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(getLastActiveMenuStorageKey(userId), menuId);
  } catch {
    // O cardápio continua funcionando mesmo quando o armazenamento local está indisponível.
  }
};

const getPersistSignature = (payload: Pick<PersistPayload, 'products' | 'style' | 'templates' | 'sortOption'>) =>
  JSON.stringify({
    products: payload.products,
    style: payload.style,
    templates: payload.templates,
    sortOption: payload.sortOption,
  });

const readLocalPendingSnapshot = (workspaceId: string, menuId: string): LocalPendingSnapshot | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(getPendingStorageKey(workspaceId, menuId));
    return raw ? JSON.parse(raw) as LocalPendingSnapshot : null;
  } catch {
    return null;
  }
};

const writeLocalPendingSnapshot = (payload: PersistPayload) => {
  if (typeof window === 'undefined') return false;

  const snapshot: LocalPendingSnapshot = {
    products: payload.products,
    style: payload.style,
    templates: payload.templates,
    sortOption: payload.sortOption,
    updatedAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(getPendingStorageKey(payload.workspaceId, payload.menuId), JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
};

const clearLocalPendingSnapshot = (workspaceId: string, menuId: string) => {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(getPendingStorageKey(workspaceId, menuId));
  }
};

const waitForSaveRetry = (delayMs: number) => new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));

const saveWorkspaceStateWithRetry = async (payload: PersistPayload) => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= SAVE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await saveWorkspaceState({
        workspaceId: payload.workspaceId,
        userId: payload.userId,
        menuId: payload.menuId,
        products: payload.products,
        style: payload.style,
        templates: payload.templates,
        sortOption: payload.sortOption,
        actionLabel: payload.actionLabel,
      });
    } catch (error) {
      lastError = error;
      if (attempt === SAVE_RETRY_DELAYS_MS.length) break;
      await waitForSaveRetry(SAVE_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError;
};

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const [workspaceData, setWorkspaceData] = useState<LoadedWorkspaceData | null>(null);
  const [products, setProductsRaw] = useState<Product[]>([]);
  const [style, setStyleRaw] = useState<MenuStyle>(INITIAL_STYLE);
  const [templates, setTemplatesRaw] = useState<MenuStyle[]>(PRESET_TEMPLATES);
  const [sortOption, setSortOption] = useState<SortOption>(DEFAULT_SORT_OPTION);
  const [activePanel, setActivePanel] = useState<'product' | 'style' | null>('style');
  const [hasOpenedProductDesigner, setHasOpenedProductDesigner] = useState(false);
  const [printRequestId, setPrintRequestId] = useState(0);
  const [printRequestMode, setPrintRequestMode] = useState<PrintRequestMode>('download');
  const [publication, setPublication] = useState<MenuPublication | null>(null);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishAction, setPublishAction] = useState<PublishAction>(null);
  const [publishFeedback, setPublishFeedback] = useState<string | null>(null);
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [isRevisionHistoryOpen, setIsRevisionHistoryOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const [isMenuActionLoading, setIsMenuActionLoading] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isMenuImportOpen, setIsMenuImportOpen] = useState(false);
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);

  const skipNextPersistRef = useRef(true);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPersistPayloadRef = useRef<PersistPayload | null>(null);
  const lastSavedSignatureRef = useRef('');
  const isSavingRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const persistNowRef = useRef<() => Promise<void>>(async () => {});
  const flushPendingSaveRef = useRef<() => void>(() => {});
  const workspaceLoadRequestRef = useRef(0);
  const activeMenuIdRef = useRef<string | null>(null);
  const menuCacheRef = useRef<Record<string, LoadedWorkspaceData>>({});
  const menuSavedSignatureCacheRef = useRef<Record<string, string>>({});
  const prefetchingMenuIdsRef = useRef<Set<string>>(new Set());
  const pendingPublishActionRef = useRef<PublishLinkAction | null>(null);
  const publishFeedbackTimeoutRef = useRef<number | null>(null);
  const cachedPdfExportRef = useRef<CachedPdfExport | null>(null);
  const pendingPrintContentSignatureRef = useRef<string | null>(null);
  const currentContentSignatureRef = useRef('');
  const pendingPersistActionLabelRef = useRef<string | null>(null);

  useEffect(() => {
    const resetPublishingState = () => {
      setIsPublishing(false);
      setPrintRequestMode('download');
      setPublishAction(null);
      pendingPublishActionRef.current = null;
      pendingPrintContentSignatureRef.current = null;
    };
    window.addEventListener('pageshow', resetPublishingState);
    return () => window.removeEventListener('pageshow', resetPublishingState);
  }, []);

  useEffect(() => () => {
    if (publishFeedbackTimeoutRef.current) window.clearTimeout(publishFeedbackTimeoutRef.current);
  }, []);

  const saveCheckpoint = useCallback(() => {
    setHistory((prev) => {
      const newEntry = { products, style };
      const newHistory = [...prev, newEntry];
      return newHistory.length > 50 ? newHistory.slice(1) : newHistory;
    });
    setFuture([]);
  }, [products, style]);

  const setProducts = useCallback((value: React.SetStateAction<Product[]>) => {
    saveCheckpoint();
    setProductsRaw(value);
  }, [saveCheckpoint]);

  const setStyle = useCallback((value: React.SetStateAction<MenuStyle>) => {
    saveCheckpoint();
    setStyleRaw(value);
  }, [saveCheckpoint]);

  const setProductsAndStyle = useCallback((nextProducts: Product[], nextStyle: MenuStyle, actionLabel?: string) => {
    saveCheckpoint();
    pendingPersistActionLabelRef.current = actionLabel || null;
    setProductsRaw(nextProducts);
    setStyleRaw(nextStyle);
  }, [saveCheckpoint]);

  const setTemplates = useCallback((value: React.SetStateAction<MenuStyle[]>) => {
    setTemplatesRaw(value);
  }, []);

  const persistNow = useCallback(async () => {
    const payload = latestPersistPayloadRef.current;
    if (!payload) return;

    const signature = getPersistSignature(payload);
    if (signature === lastSavedSignatureRef.current) {
      setSaveState('saved');
      return;
    }

    if (isSavingRef.current) {
      queuedSaveRef.current = true;
      return;
    }

    isSavingRef.current = true;

    try {
      setSaveState('saving');
      const result = await saveWorkspaceStateWithRetry(payload);

      setWorkspaceData((prev) => {
        if (!prev) return prev;
        const isActiveSavedMenu = prev.menu.id === result.menu.id;
        return {
          ...prev,
          menu: isActiveSavedMenu ? result.menu : prev.menu,
          menus: prev.menus.map((menu) => menu.id === result.menu.id ? result.menu : menu),
          currentVersion: isActiveSavedMenu ? result.currentVersion : prev.currentVersion,
        };
      });

      const normalizedPayload: PersistPayload = {
        ...payload,
        menuId: result.menu.id,
        products: result.products,
        style: result.style,
        templates: result.templates,
        sortOption: result.sortOption,
      };
      const normalizedSignature = getPersistSignature(normalizedPayload);
      const latestSignature = latestPersistPayloadRef.current
        ? getPersistSignature(latestPersistPayloadRef.current)
        : '';

      lastSavedSignatureRef.current = normalizedSignature;
      menuSavedSignatureCacheRef.current[result.menu.id] = normalizedSignature;
      const cachedMenuData = menuCacheRef.current[result.menu.id];
      if (cachedMenuData && getPersistSignature(cachedMenuData) === signature) {
        const savedMenuData: LoadedWorkspaceData = {
          ...cachedMenuData,
          menu: result.menu,
          menus: cachedMenuData.menus.map((menu) => menu.id === result.menu.id ? result.menu : menu),
          currentVersion: result.currentVersion,
          products: result.products,
          style: result.style,
          templates: result.templates,
          sortOption: result.sortOption,
        };
        menuCacheRef.current[result.menu.id] = savedMenuData;
        scheduleWorkspaceViewCacheWrite(payload.userId, savedMenuData);
      }
      clearLocalPendingSnapshot(payload.workspaceId, payload.menuId);

      if (latestSignature === signature) {
        const localState = JSON.stringify({
          products: payload.products,
          style: payload.style,
          templates: payload.templates,
          sortOption: payload.sortOption,
        });
        const persistedState = JSON.stringify({
          products: result.products,
          style: result.style,
          templates: result.templates,
          sortOption: result.sortOption,
        });

        if (localState !== persistedState) {
          skipNextPersistRef.current = true;
          latestPersistPayloadRef.current = normalizedPayload;
          setProductsRaw(result.products);
          setStyleRaw(result.style);
          setTemplatesRaw(result.templates);
          setSortOption(result.sortOption);
        }

        setSaveState('saved');
        setLoadError(null);
        if (pendingPersistActionLabelRef.current === payload.actionLabel) {
          pendingPersistActionLabelRef.current = null;
        }
      } else {
        queuedSaveRef.current = true;
        setSaveState('dirty');
      }
    } catch {
      writeLocalPendingSnapshot(payload);
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      setSaveState(isOffline ? 'local' : 'error');
      if (!isOffline) {
        setLoadError(SAVE_ERROR_MESSAGE);
      }
    } finally {
      isSavingRef.current = false;

      if (queuedSaveRef.current) {
        queuedSaveRef.current = false;
        const latestPayload = latestPersistPayloadRef.current;
        if (latestPayload && getPersistSignature(latestPayload) !== lastSavedSignatureRef.current) {
          if (persistTimeoutRef.current) {
            clearTimeout(persistTimeoutRef.current);
          }
          persistTimeoutRef.current = setTimeout(() => {
            void persistNowRef.current();
          }, SAVE_DEBOUNCE_MS);
        }
      }
    }
  }, []);

  useEffect(() => {
    persistNowRef.current = persistNow;
  }, [persistNow]);

  const undo = () => {
    if (history.length === 0) {
      return;
    }

    const previous = history[history.length - 1];
    const newHistory = history.slice(0, -1);

    setFuture((prev) => [{ products, style }, ...prev]);
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

    setHistory((prev) => [...prev, { products, style }]);
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

  const hydrateWorkspaceState = useCallback((data: LoadedWorkspaceData, options: { preserveSavedSignature?: boolean; knownSavedSignature?: string } = {}) => {
    const pendingSnapshot = readLocalPendingSnapshot(data.workspace.id, data.menu.id);
    const pendingUpdatedAt = pendingSnapshot ? Date.parse(pendingSnapshot.updatedAt) : 0;
    const serverUpdatedAt = Date.parse(data.currentVersion.createdAt || '') || 0;
    const shouldRestorePending = Boolean(pendingSnapshot && pendingUpdatedAt > serverUpdatedAt);
    const restoredState = shouldRestorePending && pendingSnapshot
      ? normalizeWorkspaceClientState(pendingSnapshot)
      : data;
    const serverSignature = options.knownSavedSignature || getPersistSignature({
        products: data.products,
        style: data.style,
        templates: data.templates,
        sortOption: data.sortOption,
      });
    const savedSignature = options.preserveSavedSignature
      ? menuSavedSignatureCacheRef.current[data.menu.id] || serverSignature
      : serverSignature;
    const restoredSignature = shouldRestorePending
      ? getPersistSignature({
          products: restoredState.products,
          style: restoredState.style,
          templates: restoredState.templates,
          sortOption: restoredState.sortOption,
        })
      : serverSignature;

    if (!options.preserveSavedSignature) {
      menuSavedSignatureCacheRef.current[data.menu.id] = serverSignature;
    }

    activeMenuIdRef.current = data.menu.id;
    writeLastActiveMenuId(data.profile.userId, data.menu.id);
    const hydratedData: LoadedWorkspaceData = {
      ...data,
      products: restoredState.products,
      style: restoredState.style,
      templates: restoredState.templates,
      sortOption: restoredState.sortOption,
    };
    menuCacheRef.current[data.menu.id] = hydratedData;
    if (!shouldRestorePending && restoredSignature === savedSignature) {
      scheduleWorkspaceViewCacheWrite(data.profile.userId, hydratedData);
    }
    skipNextPersistRef.current = restoredSignature === savedSignature;
    lastSavedSignatureRef.current = savedSignature;
    setWorkspaceData(data);
    setProductsRaw(restoredState.products);
    setStyleRaw(restoredState.style);
    setTemplatesRaw(restoredState.templates);
    setSortOption({
      ...restoredState.sortOption,
      field: restoredState.sortOption.field === 'price' ? 'price' : 'name',
    });
    setHistory([]);
    setFuture([]);
    setSaveState(shouldRestorePending ? 'local' : restoredSignature === savedSignature ? 'saved' : 'dirty');
  }, []);

  const loadWorkspace = useCallback(async (userId: string, menuId?: string | null) => {
    const requestId = ++workspaceLoadRequestRef.current;
    const baselineMenuId = activeMenuIdRef.current;
    const baselineData = baselineMenuId ? menuCacheRef.current[baselineMenuId] : null;
    const baselineSignature = baselineMenuId
      ? menuSavedSignatureCacheRef.current[baselineMenuId] || (baselineData ? getPersistSignature(baselineData) : null)
      : null;
    setIsWorkspaceLoading(true);
    setLoadError(null);

    try {
      const data = await loadWorkspaceData(userId, menuId);
      if (requestId !== workspaceLoadRequestRef.current) return;
      const latestCachedData = menuCacheRef.current[data.menu.id];
      if (
        baselineMenuId === data.menu.id
        && baselineSignature
        && latestCachedData
        && getPersistSignature(latestCachedData) !== baselineSignature
      ) {
        return;
      }
      hydrateWorkspaceState(data);
    } catch (error) {
      if (requestId !== workspaceLoadRequestRef.current) return;
      setLoadError(getErrorMessage(error, 'Falha ao carregar dados do ambiente.'));
    } finally {
      if (requestId === workspaceLoadRequestRef.current) {
        setIsWorkspaceLoading(false);
      }
    }
  }, [hydrateWorkspaceState]);

  useEffect(() => {
    if (!workspaceData) return;

    activeMenuIdRef.current = workspaceData.menu.id;
    menuCacheRef.current[workspaceData.menu.id] = {
      ...workspaceData,
      products,
      style,
      templates,
      sortOption,
    };
  }, [products, sortOption, style, templates, workspaceData]);

  useEffect(() => {
    const menuId = workspaceData?.menu.id;
    if (!menuId) {
      setPublication(null);
      return;
    }
    let cancelled = false;
    setPublication(null);
    void getMenuPublication(menuId)
      .then((result) => { if (!cancelled) setPublication(result); })
      .catch((error) => { if (!cancelled) setLoadError(getErrorMessage(error, 'Falha ao carregar publicação.')); });
    return () => { cancelled = true; };
  }, [workspaceData?.menu.id]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setIsAuthLoading(false);
      return;
    }

    let isMounted = true;
    getInitialSession()
      .then((currentSession) => {
        if (isMounted) {
          setSession(currentSession);
        }
      })
      .catch((error) => {
        if (isMounted) {
      setLoadError(getErrorMessage(error, 'Falha ao iniciar sessão.'));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsAuthLoading(false);
        }
      });

    const { data } = onSupabaseAuthChange((nextSession) => {
      setSession(nextSession);
      setAuthError(null);
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const authenticatedUserId = session?.user.id || null;

  useEffect(() => {
    if (!authenticatedUserId) {
      workspaceLoadRequestRef.current += 1;
      activeMenuIdRef.current = null;
      menuCacheRef.current = {};
      menuSavedSignatureCacheRef.current = {};
      prefetchingMenuIdsRef.current.clear();
      setWorkspaceData(null);
      setProductsRaw([]);
      setStyleRaw(INITIAL_STYLE);
      setTemplatesRaw(PRESET_TEMPLATES);
      setSortOption(DEFAULT_SORT_OPTION);
      return;
    }

    const preferredMenuId = readLastActiveMenuId(authenticatedUserId);
    const cachedView = readWorkspaceViewCache(authenticatedUserId);
    const cachedData = cachedView?.data;
    if (cachedView && (!preferredMenuId || cachedView.data.menu.id === preferredMenuId)) {
      hydrateWorkspaceState(cachedView.data, { knownSavedSignature: cachedView.signature });
    }
    loadWorkspace(authenticatedUserId, preferredMenuId || cachedData?.menu.id);
  }, [authenticatedUserId, loadWorkspace]);

  useEffect(() => {
    if (!session || !workspaceData || isWorkspaceLoading) return;

    let cancelled = false;

    workspaceData.menus.forEach((menu) => {
      if (
        menu.id === workspaceData.menu.id ||
        menuCacheRef.current[menu.id] ||
        prefetchingMenuIdsRef.current.has(menu.id)
      ) {
        return;
      }

      prefetchingMenuIdsRef.current.add(menu.id);
      void loadWorkspaceMenuData({
        userId: session.user.id,
        profile: workspaceData.profile,
        workspace: workspaceData.workspace,
        templates,
        menuId: menu.id,
      })
        .then((data) => {
          if (cancelled) return;

          menuCacheRef.current[data.menu.id] = data;
          menuSavedSignatureCacheRef.current[data.menu.id] = getPersistSignature(data);
        })
        .catch(() => {})
        .finally(() => {
          prefetchingMenuIdsRef.current.delete(menu.id);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [isWorkspaceLoading, session, templates, workspaceData]);

  useEffect(() => {
    if (!session || !workspaceData || isWorkspaceLoading) {
      return;
    }

    const payload: PersistPayload = {
      workspaceId: workspaceData.workspace.id,
      userId: session.user.id,
      menuId: workspaceData.menu.id,
      products,
      style,
      templates,
      sortOption,
      actionLabel: pendingPersistActionLabelRef.current || undefined,
    };
    latestPersistPayloadRef.current = payload;
    const signature = getPersistSignature(payload);

    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      lastSavedSignatureRef.current = signature;
      return;
    }

    if (signature === lastSavedSignatureRef.current) {
      setSaveState('saved');
      return;
    }

    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      writeLocalPendingSnapshot(payload);
      setSaveState('local');
      return;
    }

    setSaveState('dirty');
    persistTimeoutRef.current = setTimeout(() => {
      void persistNowRef.current();
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
    };
  }, [isWorkspaceLoading, products, session, sortOption, style, templates, workspaceData]);

  const flushPendingSave = useCallback(() => {
    const payload = latestPersistPayloadRef.current;
    if (!payload) return;

    const signature = getPersistSignature(payload);
    if (signature === lastSavedSignatureRef.current) return;

    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = null;
    }

    writeLocalPendingSnapshot(payload);
    void persistNowRef.current();
  }, []);

  useEffect(() => {
    flushPendingSaveRef.current = flushPendingSave;
  }, [flushPendingSave]);

  const saveCurrentMenuInBackground = useCallback(() => {
    const payload = latestPersistPayloadRef.current;
    if (!payload) return;

    const signature = getPersistSignature(payload);
    if (signature === lastSavedSignatureRef.current) return;

    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = null;
    }

    writeLocalPendingSnapshot(payload);

    if (isSavingRef.current) return;
    isSavingRef.current = true;

    void saveWorkspaceStateWithRetry(payload)
      .then((result) => {
        const resultSignature = getPersistSignature({
          products: result.products,
          style: result.style,
          templates: result.templates,
          sortOption: result.sortOption,
        });

        clearLocalPendingSnapshot(payload.workspaceId, payload.menuId);
        menuSavedSignatureCacheRef.current[result.menu.id] = resultSignature;
        const cachedMenuData = menuCacheRef.current[result.menu.id];
        if (cachedMenuData && getPersistSignature(cachedMenuData) === signature) {
          const savedMenuData: LoadedWorkspaceData = {
            ...cachedMenuData,
            menu: result.menu,
            menus: cachedMenuData.menus.map((menu) => menu.id === result.menu.id ? result.menu : menu),
            currentVersion: result.currentVersion,
            products: result.products,
            style: result.style,
            templates: result.templates,
            sortOption: result.sortOption,
          };
          menuCacheRef.current[result.menu.id] = savedMenuData;
          scheduleWorkspaceViewCacheWrite(payload.userId, savedMenuData);
        }
        setWorkspaceData((prev) => {
          if (!prev) return prev;
          const isActiveSavedMenu = prev.menu.id === result.menu.id;
          return {
            ...prev,
            menu: isActiveSavedMenu ? result.menu : prev.menu,
            menus: prev.menus.map((menu) => menu.id === result.menu.id ? result.menu : menu),
            currentVersion: isActiveSavedMenu ? result.currentVersion : prev.currentVersion,
          };
        });

        const latestPayload = latestPersistPayloadRef.current;
        if (
          latestPayload &&
          latestPayload.menuId === payload.menuId &&
          getPersistSignature(latestPayload) === signature
        ) {
          lastSavedSignatureRef.current = resultSignature;
          setSaveState('saved');
          setLoadError(null);
        }
      })
      .catch(() => {
        const latestPayload = latestPersistPayloadRef.current;
        if (latestPayload?.menuId === payload.menuId) {
          setSaveState('error');
          setLoadError(SAVE_ERROR_MESSAGE);
        }
      })
      .finally(() => {
        isSavingRef.current = false;

        if (queuedSaveRef.current) {
          queuedSaveRef.current = false;
          const latestPayload = latestPersistPayloadRef.current;
          if (latestPayload && getPersistSignature(latestPayload) !== lastSavedSignatureRef.current) {
            if (persistTimeoutRef.current) {
              clearTimeout(persistTimeoutRef.current);
            }
            persistTimeoutRef.current = setTimeout(() => {
              void persistNowRef.current();
            }, SAVE_DEBOUNCE_MS);
          }
        }
      });
  }, []);

  const forceSaveCurrentMenu = useCallback(async () => {
    const getHasPendingChanges = () => {
      const payload = latestPersistPayloadRef.current;
      return Boolean(payload && getPersistSignature(payload) !== lastSavedSignatureRef.current);
    };

    if (!getHasPendingChanges()) return;

    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = null;
    }

    const payload = latestPersistPayloadRef.current;
    if (payload) {
      writeLocalPendingSnapshot(payload);
    }

    for (let attempt = 0; attempt < 3 && getHasPendingChanges(); attempt += 1) {
      await persistNowRef.current();

      while (isSavingRef.current) {
        await waitForSaveRetry(100);
      }

      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const payload = latestPersistPayloadRef.current;
      if (!payload || getPersistSignature(payload) === lastSavedSignatureRef.current) return;

      flushPendingSaveRef.current();
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    return () => {
      flushPendingSaveRef.current();
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      const payload = latestPersistPayloadRef.current;
      if (!payload || getPersistSignature(payload) === lastSavedSignatureRef.current) return;

      setSaveState('dirty');
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
      persistTimeoutRef.current = setTimeout(() => {
        void persistNowRef.current();
      }, SAVE_DEBOUNCE_MS);
    };

    const handleOffline = () => {
      const payload = latestPersistPayloadRef.current;
      if (!payload || getPersistSignature(payload) === lastSavedSignatureRef.current) return;

      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
      writeLocalPendingSnapshot(payload);
      setSaveState('local');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSignIn = async (email: string, password: string) => {
    setIsAuthSubmitting(true);
    setAuthError(null);

    try {
      await signInWithEmail(email, password);
    } catch (error) {
      setAuthError(getErrorMessage(error, 'Falha ao entrar.'));
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleSignUp = async (payload: { email: string; password: string; fullName: string; workspaceName: string }) => {
    setIsAuthSubmitting(true);
    setAuthError(null);

    try {
      await signUpWithEmail(payload);
      setAuthError('Conta criada. Verifique o e-mail se a confirmação estiver habilitada.');
    } catch (error) {
      setAuthError(getErrorMessage(error, 'Falha ao criar conta.'));
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await forceSaveCurrentMenu();
      await signOutCurrentUser();
      setWorkspaceData(null);
      setSaveState('idle');
      setLoadError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Falha ao sair da conta.'));
    }
  };

  const handleSaveSettings = async (values: {
    fullName: string;
    workspaceName: string;
    splitCategoryAcrossPages: boolean;
    productsCanChangeCategory: boolean;
    minimumFontSize: number;
    allowSameWordBreak: boolean;
    priceDecimalPlaces: PriceDecimalPlaces;
    priceDecimalSeparator: PriceDecimalSeparator;
    showPrices: boolean;
    showCurrencySymbol: boolean;
    fontSizeLimits: FontSizeLimits;
    margins: MenuMargins;
    contentSpacing: MenuContentSpacing;
  }, section: 'account' | 'rules') => {
    if (!session || !workspaceData) return;
    setIsSettingsSaving(true);
    try {
      if (section === 'account') {
        const updated = await updateAccountIdentity({
          userId: session.user.id,
          workspaceId: workspaceData.workspace.id,
          fullName: values.fullName,
          workspaceName: values.workspaceName,
        });
        setWorkspaceData((previous) => previous ? {
          ...previous,
          profile: { ...previous.profile, fullName: updated.fullName },
          workspace: { ...previous.workspace, name: updated.workspaceName },
        } : previous);
        return;
      }

      const {
        fontSizeLimits,
        minimumFontSize,
        allowSameWordBreak,
        priceDecimalPlaces,
        priceDecimalSeparator,
        showPrices,
        showCurrencySymbol,
        margins,
        contentSpacing,
      } = values;
      setStyle((previous) => ({
        ...previous,
        fontSizeLimits,
        minimumFontSize,
        allowSameWordBreak,
        priceDecimalPlaces,
        priceDecimalSeparator,
        showPrices,
        showCurrencySymbol,
        margins,
        contentSpacing,
        elementStyles: Object.fromEntries(Object.entries(previous.elementStyles).map(([key, elementStyle]) => {
          const fontLimitKey = key === 'menuTitle' || key === 'menuSubtitle' || key === 'category'
            || key === 'productName' || key === 'productPrice' || key === 'productDescription'
            ? key
            : null;
          if (!fontLimitKey || !elementStyle?.fontSize) return [key, elementStyle];
          return [key, {
            ...elementStyle,
            fontSize: Math.min(fontSizeLimits[fontLimitKey], Math.max(minimumFontSize, elementStyle.fontSize)),
          }];
        })) as MenuStyle['elementStyles'],
        pagePadding: (margins.top + margins.bottom + margins.left + margins.right) / 4,
        itemGap: contentSpacing.betweenProducts,
        name: 'Custom',
      }));

      const currentWorkspaceSettings = workspaceData.workspace.settings;
      if (
        currentWorkspaceSettings.splitCategoryAcrossPages !== values.splitCategoryAcrossPages
        || Boolean(currentWorkspaceSettings.productsCanChangeCategory) !== values.productsCanChangeCategory
      ) {
        const workspaceSettings = await updateWorkspaceRuleSettings({
          workspaceId: workspaceData.workspace.id,
          splitCategoryAcrossPages: values.splitCategoryAcrossPages,
          productsCanChangeCategory: values.productsCanChangeCategory,
        });
        setWorkspaceData((previous) => previous ? {
          ...previous,
          workspace: {
            ...previous.workspace,
            settings: workspaceSettings,
          },
        } : previous);
      }
    } finally {
      setIsSettingsSaving(false);
    }
  };

  const handleRequestPasswordReset = async () => {
    await sendPasswordReauthentication();
  };

  const handleUpdatePassword = async (password: string, nonce: string) => {
    await updatePasswordWithNonce(password, nonce);
  };

  const handleSelectMenu = async (menuId: string) => {
    if (!session || !workspaceData) return;

    if (menuId === workspaceData.menu.id) {
      setIsProfileMenuOpen(false);
      return;
    }

    const currentSnapshot: LoadedWorkspaceData = {
      ...workspaceData,
      products,
      style,
      templates,
      sortOption,
    };
    menuCacheRef.current[workspaceData.menu.id] = currentSnapshot;

    const requestId = ++workspaceLoadRequestRef.current;
    const cachedData = menuCacheRef.current[menuId];
    const cachedSignature = cachedData ? getPersistSignature(cachedData) : null;
    const cachedSavedSignature = menuSavedSignatureCacheRef.current[menuId] || null;
    const cachedIsDirty = Boolean(cachedSignature && cachedSavedSignature && cachedSignature !== cachedSavedSignature);

    activeMenuIdRef.current = menuId;
    writeLastActiveMenuId(session.user.id, menuId);
    setIsMenuActionLoading(!cachedData);
    setLoadError(null);
    setActivePanel('style');
    setIsProfileMenuOpen(false);
    saveCurrentMenuInBackground();

    if (cachedData) {
      hydrateWorkspaceState(cachedData, { preserveSavedSignature: true });
    }

    try {
      const data = await loadWorkspaceMenuData({
        userId: session.user.id,
        profile: workspaceData.profile,
        workspace: workspaceData.workspace,
        templates,
        menuId,
      });
      if (requestId !== workspaceLoadRequestRef.current || activeMenuIdRef.current !== menuId) return;

      const latestPayload = latestPersistPayloadRef.current;
      if (
        cachedSignature &&
        latestPayload?.menuId === menuId &&
        getPersistSignature(latestPayload) !== cachedSignature
      ) {
        return;
      }

      if (cachedIsDirty) return;
      hydrateWorkspaceState(data);
    } catch (error) {
      if (requestId !== workspaceLoadRequestRef.current) return;
      setLoadError(getErrorMessage(error, 'Falha ao trocar cardápio.'));
    } finally {
      if (requestId === workspaceLoadRequestRef.current) {
        setIsMenuActionLoading(false);
      }
    }
  };

  const handleCreateMenu = () => {
    if (!workspaceData) return;
    setIsProfileMenuOpen(false);
    setIsCreateMenuOpen(true);
  };

  const performCreateMenu = async (name: string, sourceMenuId: string | null) => {
    if (!session || !workspaceData) return;

    setIsMenuActionLoading(true);
    setLoadError(null);
    setActivePanel('style');
    setIsProfileMenuOpen(false);

    try {
      await forceSaveCurrentMenu();
      const menu = await createWorkspaceMenu({
        workspaceId: workspaceData.workspace.id,
        userId: session.user.id,
        name,
        sourceMenuId,
      });

      const data = await loadWorkspaceMenuData({
        userId: session.user.id,
        profile: workspaceData.profile,
        workspace: workspaceData.workspace,
        templates,
        menuId: menu.id,
      });
      hydrateWorkspaceState(data);
      setIsCreateMenuOpen(false);
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Falha ao criar cardápio.'));
    } finally {
      setIsMenuActionLoading(false);
    }
  };

  const handleRenameMenu = async (menuId: string, name: string) => {
    if (!workspaceData) return;

    setIsMenuActionLoading(true);
    setLoadError(null);

    try {
      const renamedMenu = await renameWorkspaceMenu({
        workspaceId: workspaceData.workspace.id,
        menuId,
        name,
      });

      setWorkspaceData((prev) => prev ? {
        ...prev,
        menu: prev.menu.id === renamedMenu.id ? renamedMenu : prev.menu,
        menus: prev.menus.map((menu) => menu.id === renamedMenu.id ? renamedMenu : menu),
      } : prev);
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Falha ao renomear cardápio.'));
    } finally {
      setIsMenuActionLoading(false);
    }
  };

  const handleDeleteMenu = async (menuId: string) => {
    if (!session || !workspaceData) return;

    const deletingActiveMenu = workspaceData.menu.id === menuId;
    const remainingMenus = workspaceData.menus.filter((menu) => menu.id !== menuId);
    setIsMenuActionLoading(true);
    setLoadError(null);

    try {
      await deleteWorkspaceMenu({ workspaceId: workspaceData.workspace.id, menuId });
      clearLocalPendingSnapshot(workspaceData.workspace.id, menuId);
      if (deletingActiveMenu) clearWorkspaceViewCache(session.user.id);

      if (!deletingActiveMenu) {
        setWorkspaceData((prev) => prev ? { ...prev, menus: prev.menus.filter((menu) => menu.id !== menuId) } : prev);
        return;
      }

      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
      latestPersistPayloadRef.current = null;
      const nextMenu = remainingMenus[0];
      if (nextMenu) {
        const data = await loadWorkspaceMenuData({
          userId: session.user.id,
          profile: workspaceData.profile,
          workspace: workspaceData.workspace,
          templates,
          menuId: nextMenu.id,
        });
        hydrateWorkspaceState(data);
      } else {
        await loadWorkspace(session.user.id);
      }
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Falha ao excluir cardápio.'));
    } finally {
      setIsMenuActionLoading(false);
    }
  };

  const toggleProductDesigner = () => {
    if (activePanel !== 'product') setHasOpenedProductDesigner(true);
    setActivePanel(activePanel === 'product' ? null : 'product');
  };

  const toggleMenuDesigner = () => {
    setActivePanel(activePanel === 'style' ? null : 'style');
  };

  const contentSignature = useMemo(
    () => getMenuContentSignature(products, style, sortOption),
    [products, style, sortOption],
  );
  currentContentSignatureRef.current = contentSignature;
  const hasPublishedChanges = Boolean(publication && publication.contentSignature !== contentSignature);

  useEffect(() => {
    if (cachedPdfExportRef.current?.contentSignature !== contentSignature) {
      cachedPdfExportRef.current = null;
    }
    if (pendingPrintContentSignatureRef.current
      && pendingPrintContentSignatureRef.current !== contentSignature) {
      pendingPrintContentSignatureRef.current = null;
    }
  }, [contentSignature]);

  useEffect(() => {
    if (!publication) return;
    void createQrCodeBlob(getPublicationUrl(publication)).catch(() => undefined);
  }, [publication?.id, publication?.menuSlug, publication?.portableSnapshotUrl, publication?.updatedAt]);

  const showPublishFeedback = useCallback((message: string) => {
    if (publishFeedbackTimeoutRef.current) window.clearTimeout(publishFeedbackTimeoutRef.current);
    setPublishFeedback(message);
    publishFeedbackTimeoutRef.current = window.setTimeout(() => setPublishFeedback(null), 2200);
  }, []);

  const requestPrint = (mode: PrintRequestMode = 'download') => {
    pendingPrintContentSignatureRef.current = contentSignature;
    setPrintRequestMode(mode);
    setPrintRequestId((prev) => prev + 1);
  };

  const performPublishedLinkAction = useCallback(async (
    published: MenuPublication,
    action: PublishLinkAction,
    afterPublish = false,
  ) => {
    const url = getPublicationUrl(published);
    const qrFilename = `qrcode-${published.menuSlug || 'cardapio'}.png`;

    if (action === 'open-link') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (action === 'copy-link') {
      await copyText(url);
      showPublishFeedback('Copiado');
      return;
    }

    if (action === 'share-link') {
      if (navigator.share) {
        try {
          await navigator.share({ title: published.pdfFilename.replace(/\.pdf$/i, ''), url });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            if (afterPublish) showPublishFeedback('Link publicado');
            return;
          }
          if (afterPublish && error instanceof DOMException && error.name === 'NotAllowedError') {
            showPublishFeedback('Publicado. Toque novamente para compartilhar.');
            return;
          }
        }
      }
      await copyText(url);
      showPublishFeedback('Link copiado');
      return;
    }

    const qrBlob = await createQrCodeBlob(url);
    if (action === 'share-qr') {
      const file = new File([qrBlob], qrFilename, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ title: 'QR code do cardápio', files: [file] });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            if (afterPublish) showPublishFeedback('Link publicado');
            return;
          }
          if (afterPublish && error instanceof DOMException && error.name === 'NotAllowedError') {
            showPublishFeedback('Publicado. Toque novamente para compartilhar o QR.');
            return;
          }
        }
      }
    }
    downloadBlob(qrBlob, qrFilename);
    showPublishFeedback('QR code baixado');
  }, [showPublishFeedback]);

  const handleLinkAction = async (action: PublishLinkAction) => {
    setPublishAction(action);
    setLoadError(null);

    if (publication && !hasPublishedChanges) {
      try {
        await performPublishedLinkAction(publication, action);
      } catch (error) {
        setLoadError(getErrorMessage(error, 'Não foi possível concluir a ação.'));
      } finally {
        setPublishAction(null);
      }
      return;
    }

    pendingPublishActionRef.current = action;
    setIsPublishing(true);
    try {
      await forceSaveCurrentMenu();
      requestPrint('publish-silent');
    } catch (error) {
      pendingPublishActionRef.current = null;
      setPublishAction(null);
      setIsPublishing(false);
      setLoadError(getErrorMessage(error, 'Falha ao preparar a publicação.'));
    }
  };

  const handlePublishConfirm = async ({ pdf, virtualLink }: { pdf: boolean; virtualLink: boolean }) => {
    if (!virtualLink) {
      setIsPublishOpen(false);
      requestPrint('download');
      return;
    }

    pendingPublishActionRef.current = null;
    setPublishAction('publish');
    setIsPublishing(true);
    setLoadError(null);
    try {
      await forceSaveCurrentMenu();
      requestPrint(pdf ? 'publish' : 'publish-silent');
    } catch (error) {
      setPublishAction(null);
      setIsPublishing(false);
      setLoadError(getErrorMessage(error, 'Falha ao preparar a publicação.'));
    }
  };

  const sharePdfResult = async (result: PdfExportResult, generatedAfterClick: boolean) => {
    const file = new File([result.blob], result.filename, { type: 'application/pdf' });
    const webShareNavigator = navigator as unknown as {
      share?: Navigator['share'];
      canShare?: Navigator['canShare'];
    };
    let canUseFileShare = false;
    try {
      canUseFileShare = Boolean(
        webShareNavigator.share
        && (!webShareNavigator.canShare || webShareNavigator.canShare({ files: [file] }))
      );
    } catch {
      canUseFileShare = false;
    }

    if (!canUseFileShare) {
      downloadBlob(result.blob, result.filename);
      showPublishFeedback('PDF baixado');
      return;
    }

    try {
      await webShareNavigator.share?.({ title: result.filename.replace(/\.pdf$/i, ''), files: [file] });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (generatedAfterClick && error instanceof DOMException && error.name === 'NotAllowedError') {
        showPublishFeedback('PDF pronto. Toque novamente para compartilhar.');
        return;
      }
      setLoadError(getErrorMessage(error, 'Não foi possível compartilhar o PDF.'));
    }
  };

  const handlePdfAction = async (action: 'options' | 'download' | 'share') => {
    setPublishAction(action === 'options' ? 'pdf-options' : action === 'download' ? 'download-pdf' : 'share-pdf');
    setLoadError(null);

    if (action === 'share') {
      const cachedPdf = cachedPdfExportRef.current;
      if (cachedPdf?.contentSignature === contentSignature) {
        try {
          await sharePdfResult(cachedPdf.result, false);
        } finally {
          setPublishAction(null);
        }
        return;
      }
    }

    requestPrint(action === 'options' ? 'download' : action === 'download' ? 'download-direct' : 'share-direct');
    if (action === 'options') window.setTimeout(() => setPublishAction(null), 0);
  };

  const handlePublicationSlugChange = async (menuSlug: string) => {
    if (!publication || menuSlug.trim() === publication.menuSlug) return;
    setPublishAction('save-slug');
    setLoadError(null);
    try {
      const updated = publication.portableSnapshotUrl
        ? updatePortablePublicationMenuSlug(publication, menuSlug)
        : await updatePublicationMenuSlug({ publicationId: publication.id, menuSlug });
      setPublication(updated);
      showPublishFeedback('Endereço atualizado');
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Não foi possível atualizar o endereço.'));
    } finally {
      setPublishAction(null);
    }
  };

  const handlePrintComplete = async (result: PdfExportResult, options: PrintCanvasOptions) => {
    const generatedForSignature = pendingPrintContentSignatureRef.current;
    pendingPrintContentSignatureRef.current = null;
    const generatedPdfIsCurrent = Boolean(
      generatedForSignature
      && generatedForSignature === currentContentSignatureRef.current
    );
    if (generatedPdfIsCurrent && generatedForSignature) {
      cachedPdfExportRef.current = { contentSignature: generatedForSignature, result };
    }

    if (printRequestMode === 'download-direct') {
      setPrintRequestMode('download');
      setPublishAction(null);
      showPublishFeedback('PDF baixado');
      return;
    }

    if (printRequestMode === 'share-direct') {
      if (!generatedPdfIsCurrent) {
        setPrintRequestMode('download');
        setPublishAction(null);
        showPublishFeedback('O cardápio mudou. Toque novamente para compartilhar.');
        return;
      }
      try {
        await sharePdfResult(result, true);
      } finally {
        setPrintRequestMode('download');
        setPublishAction(null);
      }
      return;
    }

    if (printRequestMode !== 'publish' && printRequestMode !== 'publish-silent') return;
    if (!workspaceData || !session) {
      pendingPublishActionRef.current = null;
      setPublishAction(null);
      setIsPublishing(false);
      return;
    }
    let published: MenuPublication;
    try {
      published = await publishWorkspaceMenu({
        workspace: workspaceData.workspace,
        menu: workspaceData.menu,
        userId: session.user.id,
        products,
        style,
        sortOption,
        pdfBlob: result.blob,
        pdfFilename: result.filename,
        pdfOptions: options,
      });
      setPublication(published);
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Falha ao publicar cardápio.'));
      pendingPublishActionRef.current = null;
      setPublishAction(null);
      setIsPublishing(false);
      setPrintRequestMode('download');
      return;
    }

    const pendingAction = pendingPublishActionRef.current;
    pendingPublishActionRef.current = null;
    setIsPublishing(false);
    setPrintRequestMode('download');
    setPublishAction(null);
    if (!pendingAction) {
      showPublishFeedback('Link publicado');
      return;
    }

    try {
      await performPublishedLinkAction(published, pendingAction, true);
    } catch (error) {
      setLoadError(getErrorMessage(error, 'O link foi publicado, mas a ação não foi concluída.'));
    }
  };

  const saveBadge = useMemo(() => {
    if (saveState === 'dirty') {
      return { label: 'Alterações pendentes', className: 'text-slate-600 bg-slate-100' };
    }

    if (saveState === 'saving') {
      return { label: 'Salvando...', className: 'text-amber-600 bg-amber-50' };
    }

    if (saveState === 'local') {
      return { label: 'Desconectado - salvo localmente', className: 'text-sky-700 bg-sky-50' };
    }

    if (saveState === 'error') {
      return { label: 'Não foi possível salvar', className: 'text-red-600 bg-red-50' };
    }

    return null;
  }, [saveState]);

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-white rounded-3xl shadow-xl border border-slate-200 p-8 space-y-4">
          <div className="flex items-center gap-3 text-slate-900">
            <AlertCircle className="w-6 h-6 text-amber-500" />
            <h1 className="text-xl font-semibold">Serviço indisponível</h1>
          </div>
          <p className="text-slate-600">
            {getSupabaseConfigError()}
          </p>
          <p className="text-sm text-slate-500">A configuração do serviço de dados está incompleta. Contate o suporte.</p>
        </div>
      </div>
    );
  }

  if (isAuthLoading || (session && isWorkspaceLoading && !workspaceData)) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-700">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Carregando ambiente...</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return <AuthScreen onSignIn={handleSignIn} onSignUp={handleSignUp} loading={isAuthSubmitting} error={authError} />;
  }

  if (!workspaceData) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-white rounded-3xl shadow-xl border border-slate-200 p-8 space-y-4">
          <div className="flex items-center gap-3 text-slate-900">
            <AlertCircle className="w-6 h-6 text-red-500" />
            <h1 className="text-xl font-semibold">Falha ao carregar o ambiente</h1>
          </div>
          <p className="text-slate-600">{loadError || 'Nenhum dado carregado.'}</p>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-50 flex flex-col font-sans text-slate-900 overflow-hidden relative">
      <nav className={`absolute top-0 left-0 right-0 bg-white border-b border-slate-200 h-16 ${isMenuImportOpen ? 'z-[1100]' : 'z-30'} transition-transform duration-300 ${isMenuImportOpen ? 'translate-y-0' : isScrolling ? '-translate-y-full md:translate-y-0' : 'translate-y-0'}`}>
        <div className="w-full px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden md:block bg-indigo-600 p-2 rounded-lg">
              <ChefHat className="text-white w-6 h-6" />
            </div>
            {!isMenuImportOpen && (
              <button
                onClick={() => void handleCreateMenu()}
                disabled={isMenuActionLoading || isWorkspaceLoading}
                className="md:hidden p-3 rounded-xl transition-all text-slate-400 hover:text-indigo-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Novo cardÃ¡pio"
              >
                {isMenuActionLoading ? <Loader2 size={24} className="animate-spin" /> : <Plus size={24} />}
              </button>
            )}
            <div className="min-w-0">
              <div className="font-bold text-xl bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600 hidden sm:block">
                AutoMenu AI
              </div>
              <div className="text-xs text-slate-500 flex items-center gap-1 min-w-0">
                <span className="truncate">{workspaceData.menu.name}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {saveBadge && (
              <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${saveBadge.className}`}>
                <Save size={12} />
                <span>{saveBadge.label}</span>
              </div>
            )}
            <button type="button" onClick={() => setIsRevisionHistoryOpen(true)} className="h-10 w-10 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center" title="Histórico de revisões"><History size={18} /></button>
            <button
              type="button"
              onClick={() => setIsPublishOpen(true)}
              disabled={isPublishing}
              className={`h-10 px-3 sm:px-4 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-60 ${publication && hasPublishedChanges
                ? 'border border-amber-400 bg-amber-50 text-amber-800 shadow-sm shadow-amber-100 hover:bg-amber-100'
                : publication
                  ? 'border border-emerald-400 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100 hover:bg-emerald-100'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {isPublishing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              <span className="hidden sm:inline">Publicar</span>
            </button>
            <ProfileMenu
              profile={workspaceData.profile}
              workspace={workspaceData.workspace}
              menus={workspaceData.menus}
              activeMenuId={workspaceData.menu.id}
              isOpen={isProfileMenuOpen}
              loading={isMenuActionLoading || isWorkspaceLoading}
              onToggle={() => setIsProfileMenuOpen((prev) => !prev)}
              onClose={() => setIsProfileMenuOpen(false)}
              onSelectMenu={(menuId) => void handleSelectMenu(menuId)}
              onCreateMenu={() => void handleCreateMenu()}
              onRenameMenu={handleRenameMenu}
              onDeleteMenu={handleDeleteMenu}
              onOpenSettings={() => {
                setIsProfileMenuOpen(false);
                setIsSettingsOpen(true);
              }}
              onSignOut={() => void handleSignOut()}
            />
          </div>
        </div>
      </nav>

      <PublishModal
        open={isPublishOpen}
        loading={isPublishing}
        preferenceKey={`automenu:publish-options:${session.user.id}`}
        hasPendingChanges={Boolean(publication && hasPublishedChanges)}
        hasPublication={Boolean(publication)}
        publicUrl={publication ? getPublicationUrl(publication) : null}
        publicationMenuSlug={publication?.menuSlug || null}
        activeAction={publishAction}
        feedback={publishFeedback}
        onClose={() => setIsPublishOpen(false)}
        onConfirm={(options) => void handlePublishConfirm(options)}
        onLinkAction={(action) => void handleLinkAction(action)}
        onPdfAction={handlePdfAction}
        onSaveMenuSlug={(menuSlug) => void handlePublicationSlugChange(menuSlug)}
      />

      <CreateMenuModal
        open={isCreateMenuOpen}
        menus={workspaceData.menus}
        defaultName={`Cardápio ${workspaceData.menus.length + 1}`}
        loading={isMenuActionLoading}
        onClose={() => setIsCreateMenuOpen(false)}
        onCreate={(name, sourceMenuId) => void performCreateMenu(name, sourceMenuId)}
      />

      <RevisionHistoryModal
        open={isRevisionHistoryOpen}
        workspaceId={workspaceData.workspace.id}
        menuId={workspaceData.menu.id}
        splitCategoryAcrossPages={workspaceData.workspace.settings.splitCategoryAcrossPages}
        onClose={() => setIsRevisionHistoryOpen(false)}
        onRestore={(revision) => {
          setProducts(revision.products);
          setStyle(revision.style);
          setSortOption(revision.sortOption);
          setIsRevisionHistoryOpen(false);
        }}
      />

      {isSettingsOpen && (
        <React.Suspense fallback={null}>
          <SettingsModal
            open
            profile={workspaceData.profile}
            workspace={workspaceData.workspace}
            menuStyle={style}
            email={session.user.email || ''}
            saving={isSettingsSaving}
            onClose={() => setIsSettingsOpen(false)}
            onSave={handleSaveSettings}
            onRequestPasswordReset={handleRequestPasswordReset}
            onUpdatePassword={handleUpdatePassword}
          />
        </React.Suspense>
      )}

      {loadError && (
        <div className="absolute top-20 right-4 z-40 flex max-w-md items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg">
          <span className="min-w-0 flex-1">{loadError}</span>
          <button type="button" onClick={() => setLoadError(null)} className="-mr-1 -mt-1 rounded-lg p-1 text-red-500 hover:bg-red-100 hover:text-red-700" title="Fechar mensagem" aria-label="Fechar mensagem">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex-grow flex overflow-hidden relative">
        <div className="hidden md:flex flex-col items-center gap-4 w-16 bg-white border-r border-slate-200 py-4 z-40">
          {!isMenuImportOpen && (
            <button
              onClick={() => void handleCreateMenu()}
              disabled={isMenuActionLoading || isWorkspaceLoading}
              className="p-3 rounded-xl transition-all text-slate-400 hover:text-indigo-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Novo cardápio"
            >
              {isMenuActionLoading ? <Loader2 size={24} className="animate-spin" /> : <Plus size={24} />}
            </button>
          )}
          <button
            onClick={toggleMenuDesigner}
            className={`p-3 rounded-xl transition-all ${activePanel === 'style' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-50'}`}
            title="Designer visual"
          >
            <Paintbrush size={24} />
          </button>
          <button
            onClick={toggleProductDesigner}
            className={`p-3 rounded-xl transition-all ${activePanel === 'product' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-50'}`}
            title="Designer de produtos"
          >
            <ShoppingCart size={24} />
          </button>
        </div>

        {hasOpenedProductDesigner && (
          <React.Suspense fallback={null}>
            <ProductDesigner
              products={products}
              setProducts={setProducts}
              style={style}
              setStyle={setStyle}
              setTemplates={setTemplates}
              sortOption={sortOption}
              isOpen={activePanel === 'product'}
              onClose={() => setActivePanel(null)}
              workspaceId={workspaceData.workspace.id}
              currentUserId={session.user.id}
              currentMenuId={workspaceData.menu.id}
              onPdfClick={() => requestPrint('download')}
              productsCanChangeCategory={workspaceData.workspace.settings?.productsCanChangeCategory}
              splitCategoryAcrossPages={workspaceData.workspace.settings.splitCategoryAcrossPages}
              onImportVisibilityChange={setIsMenuImportOpen}
            />
          </React.Suspense>
        )}

        <div className="flex-1 min-w-0 h-full relative">
          <MenuDesigner
            products={products}
            style={style}
            setStyle={setStyle}
            setProducts={setProducts}
            setProductsAndStyle={setProductsAndStyle}
            templates={templates}
            sortOption={sortOption}
            setSortOption={setSortOption}
            undo={undo}
            redo={redo}
            canUndo={history.length > 0}
            canRedo={future.length > 0}
            isOpen={activePanel === 'style'}
            isProductDesignerOpen={activePanel === 'product'}
            printRequestId={printRequestId}
            printRequestMode={printRequestMode}
            onPrintComplete={(result, options) => void handlePrintComplete(result, options)}
            onPrintError={(error) => {
              pendingPrintContentSignatureRef.current = null;
              if (printRequestMode === 'publish' || printRequestMode === 'publish-silent') {
                setIsPublishing(false);
                pendingPublishActionRef.current = null;
              }
              setPublishAction(null);
              setPrintRequestMode('download');
              setLoadError(getErrorMessage(error, 'Falha ao gerar o PDF.'));
            }}
            onPrintCancel={() => {
              pendingPrintContentSignatureRef.current = null;
              setIsPublishing(false);
              setPublishAction(null);
              pendingPublishActionRef.current = null;
              setPrintRequestMode('download');
            }}
            silentPrintOptions={(publication?.pdfOptions || {}) as Partial<PrintCanvasOptions>}
            onClose={() => setActivePanel(null)}
            onScrollActivity={setIsScrolling}
            workspaceId={workspaceData.workspace.id}
            currentUserId={session.user.id}
            splitCategoryAcrossPages={workspaceData.workspace.settings.splitCategoryAcrossPages}
            productsCanChangeCategory={workspaceData.workspace.settings?.productsCanChangeCategory}
          />
        </div>
      </div>

      <div
        className={`md:hidden fixed bottom-0 left-0 right-0 flex h-16 bg-white border-t border-slate-200 z-50 transition-transform duration-300 ${isScrolling && !activePanel ? 'translate-y-full' : 'translate-y-0'}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <button
          onClick={toggleMenuDesigner}
          className={`flex-1 flex flex-col items-center justify-center gap-1 ${activePanel === 'style' ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-400'}`}
        >
          <Paintbrush size={20} />
          <span className="text-[10px] font-bold">Visual</span>
        </button>
        <button
          onClick={toggleProductDesigner}
          className={`flex-1 flex flex-col items-center justify-center gap-1 ${activePanel === 'product' ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-400'}`}
        >
          <ShoppingCart size={20} />
          <span className="text-[10px] font-bold">Produtos</span>
        </button>
      </div>
    </div>
  );
};

export default App;
