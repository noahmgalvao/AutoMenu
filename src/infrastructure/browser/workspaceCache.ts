import type { MenuStyle, Product, SortOption } from '../../domain/menu/model';
import type { LoadedWorkspaceData } from '../../domain/workspace/model';
import { getPersistSignature, type PersistPayload } from '../../application/workspace/editorPersistence';

interface LocalPendingSnapshot {
  expectedWrite?: number;
  operationId?: string;
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

export const readWorkspaceViewCache = (userId: string): WorkspaceViewCache | null => {
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

export const scheduleWorkspaceViewCacheWrite = (userId: string, data: LoadedWorkspaceData) => {
  if (typeof window === 'undefined') return;
  window.setTimeout(() => writeWorkspaceViewCache(userId, data), 0);
};

export const clearWorkspaceViewCache = (userId: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(getWorkspaceViewCacheKey(userId));
  } catch {
    // Sem ação necessária quando o armazenamento local está indisponível.
  }
};

export const readLastActiveMenuId = (userId: string) => {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage.getItem(getLastActiveMenuStorageKey(userId));
  } catch {
    return null;
  }
};

export const writeLastActiveMenuId = (userId: string, menuId: string) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(getLastActiveMenuStorageKey(userId), menuId);
  } catch {
    // O cardápio continua funcionando mesmo quando o armazenamento local está indisponível.
  }
};

export const readLocalPendingSnapshot = (workspaceId: string, menuId: string): LocalPendingSnapshot | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(getPendingStorageKey(workspaceId, menuId));
    return raw ? JSON.parse(raw) as LocalPendingSnapshot : null;
  } catch {
    return null;
  }
};

export const writeLocalPendingSnapshot = (payload: PersistPayload) => {
  if (typeof window === 'undefined') return false;

  const snapshot: LocalPendingSnapshot = {
    expectedWrite: payload.expectedWrite, operationId: payload.operationId,
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

export const clearLocalPendingSnapshot = (workspaceId: string, menuId: string) => {
  if (typeof window !== 'undefined') {
    try { window.localStorage.removeItem(getPendingStorageKey(workspaceId, menuId)); }
    catch { /* Storage restrictions do not block loading the latest server state. */ }
  }
};
