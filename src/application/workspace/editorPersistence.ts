import { revisionOperationId } from '../revisions/operationId';
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
  expectedWrite?: number;
  operationId?: string;
}

export const getPersistSignature = (payload: Pick<PersistPayload, 'products' | 'style' | 'templates' | 'sortOption'>) =>
  JSON.stringify({
    products: payload.products,
    style: payload.style,
    templates: payload.templates.filter(template => !template.catalogSourceTemplateId
      && (template.scope !== 'workspace' || template.sourceType !== 'user')),
    sortOption: payload.sortOption,
  });

const SAVE_RETRY_DELAYS_MS = [600, 1600, 3200];

export const waitForSaveRetry = (delayMs: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayMs));

export const saveWorkspaceStateWithRetry = async (
  payload: PersistPayload,
  saveWorkspaceState: WorkspaceGateway['saveWorkspaceState'],
) => {
  if (payload.operationId && Number(payload.operationId.split('_')[0]) < Date.now()-6*86400000) payload.operationId = undefined;
  const operationId = payload.operationId ||= revisionOperationId();
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
        expectedWrite: payload.expectedWrite, operationId,
      });
    } catch (error) {
      lastError = error;
      if ((error as any)?.code === '40001') throw error;
      if (attempt === SAVE_RETRY_DELAYS_MS.length) break;
      await waitForSaveRetry(SAVE_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError;
};
