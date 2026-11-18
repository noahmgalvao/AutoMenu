import type { MenuStyle, Product, SortOption } from '../../domain/menu/model';
import type { WorkspaceGateway } from './workspaceGateway';

export interface PersistPayload {
  workspaceId: string;
  userId: string;
  menuId: string;
  products: Product[];
  style: MenuStyle;
  templates: MenuStyle[];
  sortOption: SortOption;
  actionLabel?: string;
}

export const getPersistSignature = (payload: Pick<PersistPayload, 'products' | 'style' | 'templates' | 'sortOption'>) =>
  JSON.stringify({
    products: payload.products,
    style: payload.style,
    templates: payload.templates,
    sortOption: payload.sortOption,
  });

const SAVE_RETRY_DELAYS_MS = [600, 1600, 3200];

export const waitForSaveRetry = (delayMs: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayMs));

export const saveWorkspaceStateWithRetry = async (
  payload: PersistPayload,
  saveWorkspaceState: WorkspaceGateway['saveWorkspaceState'],
) => {
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
