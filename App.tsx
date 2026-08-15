import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AlertCircle, ChefHat, Loader2, Paintbrush, Plus, Save, ShoppingCart } from 'lucide-react';
import MenuDesigner from './components/MenuDesigner';
import { ProductDesigner } from './components/ProductDesigner';
import { AuthScreen } from './components/AuthScreen';
import { ProfileMenu } from './components/ProfileMenu';
import { SettingsModal } from './components/SettingsModal';
import { INITIAL_STYLE, PRESET_TEMPLATES } from './constants';
import {
  FontSizeLimits,
  LoadedWorkspaceData,
  MenuContentSpacing,
  MenuMargins,
  MenuStyle,
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
  loadWorkspaceData,
  loadWorkspaceMenuData,
  normalizeWorkspaceClientState,
  renameWorkspaceMenu,
  saveWorkspaceState,
  updateAccountSettings,
} from './services/workspaceService';

interface HistoryState {
  products: Product[];
  style: MenuStyle;
}

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'local' | 'error';

const DEFAULT_SORT_OPTION: SortOption = { field: 'name', direction: 'asc' };
const SAVE_DEBOUNCE_MS = 2000;
const SAVE_RETRY_DELAYS_MS = [600, 1600, 3200];

interface PersistPayload {
  workspaceId: string;
  userId: string;
  menuId: string;
  products: Product[];
  style: MenuStyle;
  templates: MenuStyle[];
  sortOption: SortOption;
}

interface LocalPendingSnapshot {
  products: Product[];
  style: MenuStyle;
  templates: MenuStyle[];
  sortOption: SortOption;
  updatedAt: string;
}

const getPendingStorageKey = (workspaceId: string, menuId: string) =>
  `automenu_pending_workspace_${workspaceId}_${menuId}`;

const getLastActiveMenuStorageKey = (userId: string) =>
  `automenu_last_active_menu_${userId}`;

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
  if (typeof window === 'undefined') return;

  const snapshot: LocalPendingSnapshot = {
    products: payload.products,
    style: payload.style,
    templates: payload.templates,
    sortOption: payload.sortOption,
    updatedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(getPendingStorageKey(payload.workspaceId, payload.menuId), JSON.stringify(snapshot));
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
  const [printRequestId, setPrintRequestId] = useState(0);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const [isMenuActionLoading, setIsMenuActionLoading] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
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
      } else {
        queuedSaveRef.current = true;
        setSaveState('dirty');
      }
    } catch (error) {
      writeLocalPendingSnapshot(payload);
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      setSaveState(isOffline ? 'local' : 'error');
      if (!isOffline) {
        setLoadError(error instanceof Error ? error.message : 'Falha ao salvar dados no Supabase.');
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

  const hydrateWorkspaceState = useCallback((data: LoadedWorkspaceData, options: { preserveSavedSignature?: boolean } = {}) => {
    const pendingSnapshot = readLocalPendingSnapshot(data.workspace.id, data.menu.id);
    const pendingUpdatedAt = pendingSnapshot ? Date.parse(pendingSnapshot.updatedAt) : 0;
    const serverUpdatedAt = Date.parse(data.currentVersion.createdAt || '') || 0;
    const shouldRestorePending = Boolean(pendingSnapshot && pendingUpdatedAt > serverUpdatedAt);
    const restoredState = shouldRestorePending && pendingSnapshot
      ? normalizeWorkspaceClientState(pendingSnapshot)
      : data;
    const serverSignature = getPersistSignature({
      products: data.products,
      style: data.style,
      templates: data.templates,
      sortOption: data.sortOption,
    });
    const savedSignature = options.preserveSavedSignature
      ? menuSavedSignatureCacheRef.current[data.menu.id] || serverSignature
      : serverSignature;
    const restoredSignature = getPersistSignature({
      products: restoredState.products,
      style: restoredState.style,
      templates: restoredState.templates,
      sortOption: restoredState.sortOption,
    });

    if (!options.preserveSavedSignature) {
      menuSavedSignatureCacheRef.current[data.menu.id] = serverSignature;
    }

    activeMenuIdRef.current = data.menu.id;
    writeLastActiveMenuId(data.profile.userId, data.menu.id);
    menuCacheRef.current[data.menu.id] = {
      ...data,
      products: restoredState.products,
      style: restoredState.style,
      templates: restoredState.templates,
      sortOption: restoredState.sortOption,
    };
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
    setIsWorkspaceLoading(true);
    setLoadError(null);

    try {
      const data = await loadWorkspaceData(userId, menuId);
      if (requestId !== workspaceLoadRequestRef.current) return;
      hydrateWorkspaceState(data);
    } catch (error) {
      if (requestId !== workspaceLoadRequestRef.current) return;
      const message = error instanceof Error ? error.message : 'Falha ao carregar dados do ambiente.';
      setLoadError(message);
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
          setLoadError(error instanceof Error ? error.message : 'Falha ao iniciar sessão.');
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

    loadWorkspace(authenticatedUserId, readLastActiveMenuId(authenticatedUserId));
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
      .catch((error) => {
        const latestPayload = latestPersistPayloadRef.current;
        if (latestPayload?.menuId === payload.menuId) {
          setSaveState('error');
          setLoadError(error instanceof Error ? error.message : 'Falha ao salvar dados no Supabase.');
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
      setAuthError(error instanceof Error ? error.message : 'Falha ao entrar.');
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
      setAuthError(error instanceof Error ? error.message : 'Falha ao criar conta.');
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
      setLoadError(error instanceof Error ? error.message : 'Falha ao sair da conta.');
    }
  };

  const handleSaveSettings = async (values: {
    fullName: string;
    workspaceName: string;
    splitCategoryAcrossPages: boolean;
    productsCanChangeCategory: boolean;
    fontSizeLimits: FontSizeLimits;
    margins: MenuMargins;
    contentSpacing: MenuContentSpacing;
  }) => {
    if (!session || !workspaceData) return;
    setIsSettingsSaving(true);
    try {
      const {
        fontSizeLimits,
        margins,
        contentSpacing,
        ...accountSettings
      } = values;
      const updated = await updateAccountSettings({
        userId: session.user.id,
        workspaceId: workspaceData.workspace.id,
        ...accountSettings,
      });
      setWorkspaceData((prev) => prev ? { ...prev, ...updated } : prev);
      setStyle((previous) => ({
        ...previous,
        fontSizeLimits,
        margins,
        contentSpacing,
        pagePadding: (margins.top + margins.bottom + margins.left + margins.right) / 4,
        itemGap: contentSpacing.betweenProducts,
        name: 'Custom',
      }));
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
      setLoadError(error instanceof Error ? error.message : 'Falha ao trocar cardápio.');
    } finally {
      if (requestId === workspaceLoadRequestRef.current) {
        setIsMenuActionLoading(false);
      }
    }
  };

  const handleCreateMenu = async () => {
    if (!session || !workspaceData) return;

    setIsMenuActionLoading(true);
    setLoadError(null);
    setActivePanel('style');
    setIsProfileMenuOpen(false);
    saveCurrentMenuInBackground();

    try {
      const nextIndex = workspaceData.menus.length + 1;
      const menu = await createWorkspaceMenu({
        workspaceId: workspaceData.workspace.id,
        userId: session.user.id,
        name: `Cardápio ${nextIndex}`,
      });

      const data = await loadWorkspaceMenuData({
        userId: session.user.id,
        profile: workspaceData.profile,
        workspace: workspaceData.workspace,
        templates,
        menuId: menu.id,
      });
      hydrateWorkspaceState(data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Falha ao criar cardápio.');
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
      setLoadError(error instanceof Error ? error.message : 'Falha ao renomear cardápio.');
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
      setLoadError(error instanceof Error ? error.message : 'Falha ao excluir cardápio.');
    } finally {
      setIsMenuActionLoading(false);
    }
  };

  const toggleProductDesigner = () => {
    setActivePanel(activePanel === 'product' ? null : 'product');
  };

  const toggleMenuDesigner = () => {
    setActivePanel(activePanel === 'style' ? null : 'style');
  };

  const requestPrint = () => {
    setPrintRequestId((prev) => prev + 1);
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
      return { label: 'Erro - salvo localmente', className: 'text-red-600 bg-red-50' };
    }

    return { label: 'Todas as alterações salvas', className: 'text-emerald-600 bg-emerald-50' };
  }, [saveState]);

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-white rounded-3xl shadow-xl border border-slate-200 p-8 space-y-4">
          <div className="flex items-center gap-3 text-slate-900">
            <AlertCircle className="w-6 h-6 text-amber-500" />
            <h1 className="text-xl font-semibold">Supabase não configurado</h1>
          </div>
          <p className="text-slate-600">
            {getSupabaseConfigError()}
          </p>
          <p className="text-sm text-slate-500">
            Use as variáveis `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_GEMINI_API_KEY`.
          </p>
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
      <nav className={`absolute top-0 left-0 right-0 bg-white border-b border-slate-200 h-16 z-30 transition-transform duration-300 ${isScrolling ? '-translate-y-full md:translate-y-0' : 'translate-y-0'}`}>
        <div className="w-full px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <ChefHat className="text-white w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-xl bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600 hidden sm:block">
                AutoMenu AI
              </div>
              <div className="text-xs text-slate-500 truncate">
                {workspaceData.menu.name} · {workspaceData.workspace.name}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${saveBadge.className}`}>
              <Save size={12} />
              <span>{saveBadge.label}</span>
            </div>
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

      <SettingsModal
        open={isSettingsOpen}
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

      {loadError && (
        <div className="absolute top-20 right-4 z-40 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-2xl shadow-lg max-w-md">
          {loadError}
        </div>
      )}

      <div className="flex-grow flex overflow-hidden relative">
        <div className="hidden md:flex flex-col items-center gap-4 w-16 bg-white border-r border-slate-200 py-4 z-40">
          <button
            onClick={() => void handleCreateMenu()}
            disabled={isMenuActionLoading || isWorkspaceLoading}
            className="p-3 rounded-xl transition-all text-slate-400 hover:text-indigo-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Novo cardápio"
          >
            {isMenuActionLoading ? <Loader2 size={24} className="animate-spin" /> : <Plus size={24} />}
          </button>
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
          productsCanChangeCategory={workspaceData.workspace.settings?.productsCanChangeCategory}
          splitCategoryAcrossPages={workspaceData.workspace.settings.splitCategoryAcrossPages}
          onPrint={requestPrint}
        />

        <div className="flex-1 min-w-0 h-full relative">
          <MenuDesigner
            products={products}
            style={style}
            setStyle={setStyle}
            setProducts={setProducts}
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
