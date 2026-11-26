import { revisionOperationId } from '../../application/revisions/operationId';
import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import type { AuthSession } from '../../application/account/authGateway';
import { classifyChange } from '../../domain/revisions/events';
import type { Json } from '../../domain/revisions/model';
import { getErrorMessage } from '../../application/errorMessages';
import { createWorkspaceTemplate } from '../../application/templates/portableTemplateStyle';
import { INITIAL_STYLE, PRESET_TEMPLATES } from '../../domain/menu/defaults';
import type {
  MenuStyle,
  Product,
  SortOption,
} from '../../domain/menu/model';
import type { LoadedWorkspaceData, Menu } from '../../domain/workspace/model';
import { DEFAULT_SORT_OPTION, normalizeWorkspaceClientState, withMenuRuleFallback } from '../../application/workspace/state';
import { useAppServices } from './AppServicesProvider';
import { useEditorHistory } from './useEditorHistory';
import { getPersistSignature, saveWorkspaceStateWithRetry, waitForSaveRetry, type PersistPayload } from '../../application/workspace/editorPersistence';
import {
  clearLocalPendingSnapshot, clearWorkspaceViewCache, readLastActiveMenuId, readLocalPendingSnapshot,
  readWorkspaceViewCache, scheduleWorkspaceViewCacheWrite, writeLastActiveMenuId, writeLocalPendingSnapshot,
} from '../../infrastructure/browser/workspaceCache';

const SAVE_ERROR_MESSAGE = 'Não foi possível salvar as alterações. Entre em contato com o suporte.';
const SAVE_DEBOUNCE_MS = 1000;

function mergeDurableTemplates(current: MenuStyle[], saved: MenuStyle[] = []) {
  return [...new Map([...current, ...saved].map(template => [template.id, template])).values()];
}

type MenuHistoryAction =
  | { type: 'rename'; id: string; previousName: string; name: string }
  | { type: 'delete'; menus: Menu[]; activeMenuId?: string };

interface WorkspaceEditorOptions {
  showStylePanel: () => void;
  closeProfileMenu: () => void;
  closeCreateMenu: () => void;
}

export function useWorkspaceEditor({ showStylePanel, closeProfileMenu, closeCreateMenu }: WorkspaceEditorOptions) {
  const { auth, revisions, workspace: workspaceGateway } = useAppServices();
  const { getInitialSession, subscribeToAuth, sendPasswordReauthentication, signInWithEmail, signOutCurrentUser,
    signUpWithEmail, updatePasswordWithNonce, isConfigured } = auth;
  const { createWorkspaceMenu, deleteWorkspaceMenus, renameWorkspaceMenu, restoreWorkspaceMenus, updateAccountIdentity, saveWorkspaceTemplate,
    canPublishTemplates, publishWorkspaceTemplate, loadWorkspaceData, loadWorkspaceMenuData, saveWorkspaceState } = workspaceGateway;
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [historyNotice,setHistoryNotice]=useState<string|null>(null);
  const [workspaceLoadFailure, setWorkspaceLoadFailure] = useState<{ userId: string; message: string } | null>(null);

  const [workspaceData, setWorkspaceData] = useState<LoadedWorkspaceData | null>(null);
  const [products, setProductsRaw] = useState<Product[]>([]);
  const [style, setStyleRaw] = useState<MenuStyle>(INITIAL_STYLE);
  const [templates, setTemplatesRaw] = useState<MenuStyle[]>(PRESET_TEMPLATES);
  const [catalogAdminId, setCatalogAdminId] = useState<string>();
  const durableTemplates = useRef(new Map<string, MenuStyle[]>());
  const [sortOption, setSortOption] = useState<SortOption>(DEFAULT_SORT_OPTION);
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const [isMenuActionLoading, setIsMenuActionLoading] = useState(false);
  const skipNextPersistRef = useRef(true);
  const persistFirstDirtyRef = useRef<number | null>(null);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPersistPayloadRef = useRef<PersistPayload | null>(null);
  const lastSavedSignatureRef = useRef('');
  const isSavingRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const persistNowRef = useRef<() => Promise<void>>(async () => {});
  const flushPendingSaveRef = useRef<() => void>(() => {});
  const workspaceLoadRequestRef = useRef(0);
  const activeMenuIdRef = useRef<string | null>(null);
  useEffect(()=>{
    const update=(event:Event)=>{const detail=(event as CustomEvent<{menuId:string;warning:string|null}>).detail;if(!detail||detail.menuId!==activeMenuIdRef.current)return;setHistoryNotice(detail.warning?'Cardápio salvo; histórico temporariamente indisponível. '+getErrorMessage(new Error(detail.warning),''):null);};
    document.addEventListener('automenu:history-warning',update);return()=>document.removeEventListener('automenu:history-warning',update);
  },[]);
  const menuCacheRef = useRef<Record<string, LoadedWorkspaceData>>({});
  const menuSavedSignatureCacheRef = useRef<Record<string, string>>({});
  const prefetchingMenuIdsRef = useRef<Set<string>>(new Set());
  const pendingPersistActionLabelRef = useRef<string | null>(null);
  const menuIdsBeingDeleted = useRef<Set<string> | null>(null);
  const menuOperation = useRef(false);
  const menuHistoryScope = useRef<string | undefined>(undefined);
  const applyMenuHistory = useRef<(action: MenuHistoryAction, direction: 'undo' | 'redo') => Promise<boolean>>(async () => false);
  const { setProducts, setStyle, setProductsAndStyle, undo, redo, canUndo, canRedo, clearHistory, recordAction, handleProductEditChange } =
    useEditorHistory({ products, style, sortOption, setProductsRaw, setStyleRaw, pendingPersistActionLabel: pendingPersistActionLabelRef });

  const setTemplates = useCallback((value: SetStateAction<MenuStyle[]>) => {
    setTemplatesRaw(value);
  }, []);

  const activeGesture = useRef(false);
  useEffect(() => {
    const start = () => { activeGesture.current = true; };
    const stop = () => { activeGesture.current = false; };
    document.addEventListener('pointerdown', start); document.addEventListener('pointerup', stop); document.addEventListener('pointercancel', stop);
    document.addEventListener('compositionstart', start); document.addEventListener('compositionend', stop); window.addEventListener('blur', stop);
    return () => { document.removeEventListener('pointerdown',start); document.removeEventListener('pointerup',stop); document.removeEventListener('pointercancel',stop); document.removeEventListener('compositionstart',start); document.removeEventListener('compositionend',stop); window.removeEventListener('blur',stop); };
  }, []);

  const persistNow = useCallback(async () => {
    const payload = latestPersistPayloadRef.current;
    if (!payload || menuIdsBeingDeleted.current?.has(payload.menuId)) return;

    const signature = getPersistSignature(payload);
    if (signature === lastSavedSignatureRef.current) {
      return;
    }

    if (isSavingRef.current) {
      queuedSaveRef.current = true;
      return;
    }

    if (activeGesture.current) {
      writeLocalPendingSnapshot(payload);
      persistTimeoutRef.current = setTimeout(() => void persistNowRef.current(), SAVE_DEBOUNCE_MS);
      return;
    }
    isSavingRef.current = true;

    try {
      const result = await saveWorkspaceStateWithRetry(payload, saveWorkspaceState);
      if (latestPersistPayloadRef.current?.menuId === result.menu.id) latestPersistPayloadRef.current.expectedWrite = result.menu.revisionWriteVersion;
      if (revisions && activeMenuIdRef.current !== payload.menuId) void revisions.finalize(payload.menuId).catch(() => {});
      result.templates = mergeDurableTemplates(result.templates, durableTemplates.current.get(payload.workspaceId));

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

      persistFirstDirtyRef.current = null;
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

        setLoadError(null);
        if (pendingPersistActionLabelRef.current === payload.actionLabel) {
          pendingPersistActionLabelRef.current = null;
        }
      } else {
        queuedSaveRef.current = true;
      }
    } catch (error) {
      writeLocalPendingSnapshot(latestPersistPayloadRef.current?.menuId === payload.menuId ? latestPersistPayloadRef.current : payload);
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (!isOffline) {
        setLoadError(getErrorMessage(error, SAVE_ERROR_MESSAGE));
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

  const hydrateWorkspaceState = useCallback((data: LoadedWorkspaceData, options: { preserveSavedSignature?: boolean; knownSavedSignature?: string } = {}) => {
    const pendingSnapshot = readLocalPendingSnapshot(data.workspace.id, data.menu.id);
    const pendingUpdatedAt = pendingSnapshot ? Date.parse(pendingSnapshot.updatedAt) : 0;
    const serverUpdatedAt = Date.parse(data.currentVersion.createdAt || '') || 0;
    const shouldRestorePending = Boolean(pendingSnapshot && (revisions || pendingUpdatedAt > serverUpdatedAt));
    const snapshot = shouldRestorePending && pendingSnapshot
      ? normalizeWorkspaceClientState(pendingSnapshot)
      : data;
    const restoredState = {
      ...snapshot,
      style: withMenuRuleFallback(snapshot.style, data.workspace.settings),
      templates: mergeDurableTemplates(mergeDurableTemplates(snapshot.templates, data.templates),
        durableTemplates.current.get(data.workspace.id)),
    };
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
      menu: shouldRestorePending && pendingSnapshot?.expectedWrite !== undefined && revisions ? {...data.menu,revisionWriteVersion:pendingSnapshot.expectedWrite} : data.menu,
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
    setWorkspaceData(hydratedData);
    setProductsRaw(restoredState.products);
    setStyleRaw(restoredState.style);
    setTemplatesRaw(restoredState.templates);
    setSortOption({
      ...restoredState.sortOption,
      field: revisions ? restoredState.sortOption.field : restoredState.sortOption.field === 'price' ? 'price' : 'name',
    });
    const scope = `${data.profile.userId}:${data.workspace.id}`;
    clearHistory(menuHistoryScope.current === scope);
    menuHistoryScope.current = scope;
  }, [clearHistory]);

  const loadWorkspace = useCallback(async (userId: string, menuId?: string | null) => {
    const requestId = ++workspaceLoadRequestRef.current;
    const baselineMenuId = activeMenuIdRef.current;
    const baselineData = baselineMenuId ? menuCacheRef.current[baselineMenuId] : null;
    const baselineSignature = baselineMenuId
      ? menuSavedSignatureCacheRef.current[baselineMenuId] || (baselineData ? getPersistSignature(baselineData) : null)
      : null;
    setIsWorkspaceLoading(true);
    setLoadError(null);
    setWorkspaceLoadFailure(null);

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
      const message = getErrorMessage(error, 'Não foi possível carregar seus cardápios.');
      setWorkspaceLoadFailure({ userId, message });
      setLoadError(message);
    } finally {
      if (requestId === workspaceLoadRequestRef.current) {
        setIsWorkspaceLoading(false);
      }
    }
  }, [hydrateWorkspaceState]);

  useEffect(() => {
    if (!workspaceData) return;

    menuCacheRef.current[workspaceData.menu.id] = {
      ...workspaceData,
      products,
      style,
      templates,
      sortOption,
    };
  }, [products, sortOption, style, templates, workspaceData]);

  useEffect(() => {
    if (!isConfigured()) {
      setIsAuthLoading(false);
      return;
    }

    let mounted = true;
    let revision = 0;
    let inFlight = false;
    let deadline: number | undefined;
    const refresh = () => {
      if (inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      const request = ++revision;
      deadline = window.setTimeout(() => {
        if (!mounted || request !== revision) return;
        inFlight = false;
        revision++;
        setIsAuthLoading(false);
        setLoadError('A conexão demorou para responder. Verifique a internet e tente novamente.');
      }, 12000);
      void getInitialSession().then(current => {
        if (!mounted || request !== revision) return;
        setSession(current);
        if (current) setLoadError(null);
      }).catch(error => {
        if (mounted && request === revision) setLoadError(getErrorMessage(error, 'Falha ao verificar a sessão.'));
      }).finally(() => {
        if (!mounted || request !== revision) return;
        window.clearTimeout(deadline);
        inFlight = false;
        setIsAuthLoading(false);
      });
    };
    const unsubscribe = subscribeToAuth(nextSession => {
      if (!mounted) return;
      revision++;
      window.clearTimeout(deadline);
      inFlight = false;
      setIsAuthLoading(false);
      setSession(nextSession);
      setAuthError(null);
      if (nextSession) setLoadError(null);
    });

    refresh();
    document.addEventListener('visibilitychange', refresh);
    document.addEventListener('resume', refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('online', refresh);
    return () => {
      mounted = false;
      window.clearTimeout(deadline);
      unsubscribe();
      document.removeEventListener('visibilitychange', refresh);
      document.removeEventListener('resume', refresh);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [getInitialSession, isConfigured, subscribeToAuth]);

  const authenticatedUserId = session?.user.id || null;

  useEffect(() => {
    if (!authenticatedUserId) return;
    let cancelled = false;
    setCatalogAdminId(undefined);
    void canPublishTemplates().then(allowed => {
      if (!cancelled && allowed) setCatalogAdminId(authenticatedUserId);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [authenticatedUserId, session?.user.email, canPublishTemplates]);

  useEffect(() => {
    if (!authenticatedUserId) {
      workspaceLoadRequestRef.current += 1;
      setIsWorkspaceLoading(false);
      activeMenuIdRef.current = null;
      menuCacheRef.current = {};
      menuSavedSignatureCacheRef.current = {};
      prefetchingMenuIdsRef.current.clear();
      setWorkspaceLoadFailure(null);
      setWorkspaceData(null);
      setProductsRaw([]);
      setStyleRaw(INITIAL_STYLE);
      durableTemplates.current.clear();
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
        menu.id === activeMenuIdRef.current ||
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
          if (cancelled || !prefetchingMenuIdsRef.current.has(menu.id)) return;

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
    if (!session || !workspaceData || menuIdsBeingDeleted.current?.has(workspaceData.menu.id)) {
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
      expectedWrite: workspaceData.menu.revisionWriteVersion,
      operationId: latestPersistPayloadRef.current?.menuId === workspaceData.menu.id && getPersistSignature(latestPersistPayloadRef.current) === getPersistSignature({products,style,templates,sortOption})
        ? latestPersistPayloadRef.current.operationId : revisionOperationId(),
    };
    latestPersistPayloadRef.current = payload;
    const signature = getPersistSignature(payload);

    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      lastSavedSignatureRef.current = signature;
      return;
    }

    if (signature === lastSavedSignatureRef.current) {
      return;
    }

    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      writeLocalPendingSnapshot(payload);
      return;
    }

    persistTimeoutRef.current = setTimeout(() => {
      void persistNowRef.current();
    }, Math.max(0, Math.min(SAVE_DEBOUNCE_MS, 5000 - (Date.now() - (persistFirstDirtyRef.current ||= Date.now())))));

    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
    };
  }, [products, session, sortOption, style, templates, workspaceData]);

  const flushPendingSave = useCallback(() => {
    const payload = latestPersistPayloadRef.current;
    if (!payload || menuIdsBeingDeleted.current?.has(payload.menuId)) return;

    const signature = getPersistSignature(payload);
    if (signature === lastSavedSignatureRef.current) {
      if (revisions) void revisions.finalize(payload.menuId).catch(() => {});
      return;
    }

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
    if (activeGesture.current) {
      writeLocalPendingSnapshot(payload);
      persistTimeoutRef.current = setTimeout(() => void persistNowRef.current(), SAVE_DEBOUNCE_MS);
      return;
    }
    isSavingRef.current = true;

    void saveWorkspaceStateWithRetry(payload, saveWorkspaceState)
      .then((result) => {
        if (revisions) void revisions.finalize(payload.menuId).catch(() => {});
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
          setLoadError(null);
        }
      })
      .catch((error) => {
        const latestPayload = latestPersistPayloadRef.current;
        if (latestPayload?.menuId === payload.menuId) {
          setLoadError(getErrorMessage(error, SAVE_ERROR_MESSAGE));
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

    if (!getHasPendingChanges()) return latestPersistPayloadRef.current?.expectedWrite;

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
    if (getHasPendingChanges()) throw new Error('Alterações ainda não salvas no servidor. Estado local preservado.');
    return latestPersistPayloadRef.current?.expectedWrite;
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const payload = latestPersistPayloadRef.current;
      if (!payload || getPersistSignature(payload) === lastSavedSignatureRef.current) return;

      flushPendingSaveRef.current();
      event.preventDefault();
      event.returnValue = '';
    };

    const saveWhenHidden = () => {
      if (document.visibilityState === 'hidden') flushPendingSaveRef.current();
    };
    const saveOnPageHide = () => flushPendingSaveRef.current();
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', saveOnPageHide);
    document.addEventListener('visibilitychange', saveWhenHidden);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', saveOnPageHide);
      document.removeEventListener('visibilitychange', saveWhenHidden);
    };
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

  const cancelWorkspaceRefresh = () => {
    if (!isWorkspaceLoading) return;
    workspaceLoadRequestRef.current += 1;
    setIsWorkspaceLoading(false);
  };

  const handleSignOut = async () => {
    cancelWorkspaceRefresh();
    try {
      await forceSaveCurrentMenu();
      if (revisions && workspaceData) await revisions.finalize(workspaceData.menu.id);
      await signOutCurrentUser();
      clearHistory();
      menuHistoryScope.current = undefined;
      setWorkspaceData(null);
      setLoadError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Falha ao sair da conta.'));
    }
  };

  const handleSaveSettings = async (values: { fullName: string; workspaceName: string }) => {
    if (!session || !workspaceData) return;
    cancelWorkspaceRefresh();
    setIsSettingsSaving(true);
    try {
      const updated = await updateAccountIdentity({
        userId: session.user.id, workspaceId: workspaceData.workspace.id, ...values,
      });
      setWorkspaceData(previous => previous ? {
        ...previous,
        profile: { ...previous.profile, fullName: updated.fullName },
        workspace: { ...previous.workspace, name: updated.workspaceName },
      } : previous);
    } finally {
      setIsSettingsSaving(false);
    }
  };

  const rememberTemplate = (workspaceId: string, userId: string, saved: MenuStyle) => {
    if (menuHistoryScope.current !== `${userId}:${workspaceId}`) return;
    durableTemplates.current.set(workspaceId, mergeDurableTemplates(durableTemplates.current.get(workspaceId) || [], [saved]));
    setTemplatesRaw(current => mergeDurableTemplates(current, [saved]));
    for (const cached of Object.values(menuCacheRef.current)) {
      if (cached.workspace.id === workspaceId) cached.templates = mergeDurableTemplates(cached.templates, [saved]);
    }
  };

  const handlePublishTemplate = async (templateId: string) => {
    if (!session || !workspaceData || catalogAdminId !== session.user.id) throw new Error('Publicação indisponível.');
    const workspaceId = workspaceData.workspace.id;
    const published = await publishWorkspaceTemplate({ workspaceId, templateId });
    rememberTemplate(workspaceId, session.user.id, published);
  };

  const handleSaveTemplate = async (name: string, description: string, id: string, publish = false) => {
    if (!session || !workspaceData) throw new Error('Cardápio indisponível.');
    const workspaceId = workspaceData.workspace.id;
    const template = createWorkspaceTemplate(style, workspaceData.menu.name, name, description, id);
    const saved = await saveWorkspaceTemplate({ workspaceId, userId: session.user.id, template });
    rememberTemplate(workspaceId, session.user.id, saved);
    if (publish) await handlePublishTemplate(saved.id);
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
      closeProfileMenu();
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
    setIsWorkspaceLoading(false);
    const cachedData = menuCacheRef.current[menuId];
    const cachedSignature = cachedData ? getPersistSignature(cachedData) : null;
    const cachedSavedSignature = menuSavedSignatureCacheRef.current[menuId] || null;
    const cachedIsDirty = Boolean(cachedSignature && cachedSavedSignature && cachedSignature !== cachedSavedSignature);

    activeMenuIdRef.current = menuId;
    setIsMenuActionLoading(!cachedData);
    setLoadError(null);
    showStylePanel();
    closeProfileMenu();
    saveCurrentMenuInBackground();

    if (cachedData) {
      hydrateWorkspaceState({ ...cachedData, profile: workspaceData.profile, workspace: workspaceData.workspace },
        { preserveSavedSignature: true });
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
      if (!cachedData) activeMenuIdRef.current = workspaceData.menu.id;
      setLoadError(getErrorMessage(error, 'Falha ao trocar cardápio.'));
    } finally {
      if (requestId === workspaceLoadRequestRef.current) {
        setIsMenuActionLoading(false);
      }
    }
  };

  const performCreateMenu = async (name: string, sourceMenuId: string | null) => {
    if (!session || !workspaceData) return;

    cancelWorkspaceRefresh();
    setIsMenuActionLoading(true);
    setLoadError(null);
    showStylePanel();
    closeProfileMenu();

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
      closeCreateMenu();
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Falha ao criar cardápio.'));
    } finally {
      setIsMenuActionLoading(false);
    }
  };

  const recordMenuAction = (action: MenuHistoryAction) => recordAction({
    undo: () => applyMenuHistory.current(action, 'undo'),
    redo: () => applyMenuHistory.current(action, 'redo'),
  });

  const syncMenuList = (update: (menus: Menu[]) => Menu[]) => {
    const apply = (data: LoadedWorkspaceData): LoadedWorkspaceData => {
      const menus = update(data.menus);
      return { ...data, menus, menu: menus.find(menu => menu.id === data.menu.id) || data.menu };
    };
    setWorkspaceData(previous => previous && apply(previous));
    for (const [id, data] of Object.entries(menuCacheRef.current)) menuCacheRef.current[id] = apply(data);
    if (session) {
      const cached = readWorkspaceViewCache(session.user.id);
      if (cached) scheduleWorkspaceViewCacheWrite(session.user.id, apply(cached.data));
    }
  };

  const handleRenameMenu = async (menuId: string, name: string, record = true) => {
    if (!workspaceData || menuOperation.current) return false;
    const previousName = workspaceData.menus.find(menu => menu.id === menuId)?.name;
    if (!previousName) return false;
    const nextName = name.trim() || 'Cardápio';
    if (nextName === previousName) return true;

    cancelWorkspaceRefresh();
    menuOperation.current = true;
    setIsMenuActionLoading(true);
    setLoadError(null);
    try {
      while (isSavingRef.current) await waitForSaveRetry(100);
      const renamedMenu = await renameWorkspaceMenu({ workspaceId: workspaceData.workspace.id, menuId, name: nextName });
      syncMenuList(menus => menus.map(menu => menu.id === renamedMenu.id ? renamedMenu : menu));
      if (record) recordMenuAction({ type: 'rename', id: menuId, previousName, name: renamedMenu.name });
      return true;
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Falha ao renomear cardápio.'));
      return false;
    } finally {
      menuOperation.current = false;
      setIsMenuActionLoading(false);
    }
  };

  const handleDeleteMenus = async (menuIds: string[], record = true) => {
    if (!session || !workspaceData || menuOperation.current || menuIdsBeingDeleted.current) return false;
    const requestedIds = new Set(menuIds);
    const removedMenus = workspaceData.menus.filter(menu => requestedIds.has(menu.id));
    const ids = new Set(removedMenus.map(menu => menu.id));
    if (!ids.size) return false;

    cancelWorkspaceRefresh();
    const { workspace } = workspaceData;
    const userId = session.user.id;
    const deletingActiveMenu = ids.has(workspaceData.menu.id);
    menuOperation.current = true;
    setIsMenuActionLoading(true);
    setLoadError(null);
    if (deletingActiveMenu) await forceSaveCurrentMenu();
    const pendingActivePayload = deletingActiveMenu ? latestPersistPayloadRef.current : null;
    menuIdsBeingDeleted.current = ids;

    if (deletingActiveMenu) {
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = null;
      latestPersistPayloadRef.current = null;
    }

    try {
      while (isSavingRef.current) await waitForSaveRetry(100);
      await deleteWorkspaceMenus({ workspaceId: workspace.id, menuIds: [...ids] });
    } catch (error) {
      menuIdsBeingDeleted.current = null;
      menuOperation.current = false;
      if (pendingActivePayload) {
        latestPersistPayloadRef.current = pendingActivePayload;
        persistTimeoutRef.current = setTimeout(() => void persistNowRef.current(), SAVE_DEBOUNCE_MS);
      }
      setLoadError(getErrorMessage(error, 'Falha ao excluir os cardápios.'));
      setIsMenuActionLoading(false);
      return false;
    }

    try {
      const withoutDeletedMenus = (data: LoadedWorkspaceData) => ({
        ...data, menus: data.menus.filter(menu => !ids.has(menu.id)),
      });
      for (const id of ids) {
        delete menuCacheRef.current[id];
        delete menuSavedSignatureCacheRef.current[id];
        prefetchingMenuIdsRef.current.delete(id);
      }
      for (const [id, data] of Object.entries(menuCacheRef.current)) {
        menuCacheRef.current[id] = withoutDeletedMenus(data);
      }
      const cached = readWorkspaceViewCache(userId);
      if (deletingActiveMenu || (cached && ids.has(cached.data.menu.id))) clearWorkspaceViewCache(userId);
      else if (cached) scheduleWorkspaceViewCacheWrite(userId, withoutDeletedMenus(cached.data));

      if (deletingActiveMenu) {
        activeMenuIdRef.current = null;
        setWorkspaceData(null);
        await loadWorkspace(userId, workspaceData.menus.find(menu => !ids.has(menu.id))?.id);
      } else {
        setWorkspaceData(previous => previous && withoutDeletedMenus(previous));
      }
    } finally {
      menuIdsBeingDeleted.current = null;
      menuOperation.current = false;
      setIsMenuActionLoading(false);
    }
    if (record) recordMenuAction({ type: 'delete', menus: removedMenus, activeMenuId: deletingActiveMenu ? workspaceData.menu.id : undefined });
    return true;
  };

  applyMenuHistory.current = async (action, direction) => {
    if (action.type === 'rename') {
      return handleRenameMenu(action.id, direction === 'undo' ? action.previousName : action.name, false);
    }
    if (direction === 'redo') return handleDeleteMenus(action.menus.map(menu => menu.id), false);
    if (!workspaceData || !session || menuOperation.current) return false;
    cancelWorkspaceRefresh();
    menuOperation.current = true;
    setIsMenuActionLoading(true);
    setLoadError(null);
    try {
      await restoreWorkspaceMenus({ workspaceId: workspaceData.workspace.id, menus: action.menus });
      syncMenuList(menus => Array.from(new Map([...menus, ...action.menus].map(menu => [menu.id, menu])).values())
        .sort((left, right) => (left.createdAt || '').localeCompare(right.createdAt || '')));
      if (action.activeMenuId) {
        await forceSaveCurrentMenu();
        await loadWorkspace(session.user.id, action.activeMenuId);
      }
      return true;
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Falha ao restaurar os cardápios.'));
      return false;
    } finally {
      menuOperation.current = false;
      setIsMenuActionLoading(false);
    }
  };

  const editProtectionBusy = useRef(false);
  const protectLogicalEdit = (nextProducts: Product[], nextStyle: MenuStyle, apply: () => void) => {
    if (editProtectionBusy.current) return;
    const priority = classifyChange({products,style} as unknown as Json, {products:nextProducts,style:nextStyle} as unknown as Json);
    if (!workspaceGateway || !workspaceData || !revisions || priority < 2) { apply(); return; }
    editProtectionBusy.current = true;
    setIsMenuActionLoading(true);
    void (async () => {
      try { await forceSaveCurrentMenu(); await revisions.beforeOperation(workspaceData.menu.id); apply(); }
      catch (error) { setLoadError(getErrorMessage(error, 'Alteração bloqueada: não foi possível preservar a versão anterior.')); }
      finally { editProtectionBusy.current = false; setIsMenuActionLoading(false); }
    })();
  };
  const guardedProducts = (value: SetStateAction<Product[]>) => {
    if (!revisions) { setProducts(value); return; }
    const next = typeof value === 'function' ? value(products) : value;
    protectLogicalEdit(next, style, () => setProducts(value));
  };
  const guardedStyle = (value: SetStateAction<MenuStyle>) => {
    if (!revisions) { setStyle(value); return; }
    const next = typeof value === 'function' ? value(style) : value;
    protectLogicalEdit(products, next, () => setStyle(value));
  };
  const guardedProductsAndStyle = (nextProducts: Product[], nextStyle: MenuStyle, actionLabel?: string) => {
    protectLogicalEdit(nextProducts, nextStyle, () => setProductsAndStyle(nextProducts,nextStyle,actionLabel));
  };

  const reloadCurrentMenu = async () => {
    if (!session || !workspaceData) return;
    clearLocalPendingSnapshot(workspaceData.workspace.id, workspaceData.menu.id);
    clearHistory();
    delete menuCacheRef.current[workspaceData.menu.id];
    await loadWorkspace(session.user.id, workspaceData.menu.id);
  };

  const refreshMenuList = async () => {
    if (!workspaceData || !workspaceGateway.listWorkspaceMenus) return;
    const menus = await workspaceGateway.listWorkspaceMenus(workspaceData.workspace.id);
    setWorkspaceData(previous => previous ? {...previous,menus} : previous);
  };

  const resolveWriteConflict = async (choice: 'server' | 'local') => {
    if (!workspaceData || !revisions || !session) return;
    const message = choice === 'server'
      ? 'Descartar as alterações pendentes neste dispositivo e carregar o estado salvo no servidor?'
      : 'Usar as alterações deste dispositivo? O estado do servidor será preservado no histórico antes da substituição.';
    if (!window.confirm(message)) return;
    setIsMenuActionLoading(true);
    try {
      if (choice === 'server') await reloadCurrentMenu();
      else {
        const writeVersion = await revisions.currentWrite(workspaceData.menu.id);
        const payload = latestPersistPayloadRef.current;
        if (!payload) return;
        payload.expectedWrite = writeVersion; payload.operationId = revisionOperationId(); payload.actionLabel = 'Resolução manual de conflito';
        pendingPersistActionLabelRef.current = payload.actionLabel;
        setWorkspaceData(previous => previous ? {...previous,menu:{...previous.menu,revisionWriteVersion:writeVersion}} : previous);
        await forceSaveCurrentMenu();
      }
      setLoadError(null);
    } catch(error) { setLoadError(getErrorMessage(error,'Não foi possível resolver o conflito. Alterações locais preservadas.')); }
    finally { setIsMenuActionLoading(false); }
  };

  return {
    saveStatus: (getPersistSignature({products,style,templates,sortOption}) === lastSavedSignatureRef.current && !isWorkspaceLoading ? 'saved' : 'pending') as 'saved' | 'pending',
    historyNotice,setHistoryNotice,
    resolveWriteConflict, refreshMenuList,
    reloadCurrentMenu,
    session, isAuthLoading, isAuthSubmitting, authError, loadError, setLoadError, isConfigured,
    workspaceLoadError: workspaceLoadFailure?.userId === authenticatedUserId ? workspaceLoadFailure?.message : null,
    workspaceData, products, style, templates, sortOption, setSortOption, isSettingsSaving, isMenuActionLoading,
    setProducts: revisions ? guardedProducts : setProducts, setStyle: revisions ? guardedStyle : setStyle, setProductsAndStyle: revisions ? guardedProductsAndStyle : setProductsAndStyle, setTemplates, undo, redo, canUndo: canUndo && !isMenuActionLoading, canRedo: canRedo && !isMenuActionLoading, handleProductEditChange,
    handleSignIn, handleSignUp, handleSignOut, handleSaveSettings, handleSaveTemplate, handleRequestPasswordReset, handleUpdatePassword,
    onPublishTemplate: authenticatedUserId && catalogAdminId === authenticatedUserId ? handlePublishTemplate : undefined,
    handleSelectMenu, performCreateMenu, handleRenameMenu, handleDeleteMenus, forceSaveCurrentMenu,
  };
}
