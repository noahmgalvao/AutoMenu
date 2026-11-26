import { revisionOperationId } from '../../application/revisions/operationId';
import type { RevisionGateway } from '../../application/revisions/contracts';
import { getSupabaseClient } from '../supabase/client';
export const historyV12Enabled = () => import.meta.env.VITE_HISTORY_V12_ENABLED !== 'false';
export async function revisionRequest<T = any>(action: string, input: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const { data: { session }, error } = await getSupabaseClient().auth.getSession();
    if (error)
        throw error;
    if (!session)
        throw new Error('Sessão expirada. Entre novamente.');
    const endpoint = import.meta.env.VITE_REVISION_BACKEND === 'node' ? '/api/revisions' : `${String(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, '')}/functions/v1/menu-revisions`;
    const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...input }), signal });
    let result: any;
    try {
        result = await response.json();
    }
    catch {
        throw new Error(response.status === 413 ? 'Documento excede o limite de requisição da hospedagem.' : `Serviço de histórico indisponível (HTTP ${response.status}).`);
    }
    if (!response.ok) {
        const error = new Error(result.error || 'Histórico indisponível.') as Error & {
            code?: string;
        };
        error.code = result.code || (response.status === 409 ? '40001' : undefined);
        throw error;
    }
    return result;
}
export const revisionGateway: RevisionGateway = {
    page: ({ signal, ...input }) => revisionRequest('page', input, signal), load: async ({ signal, ...input }) => {
        const document = await revisionRequest('load', input, signal);
        if (signal?.aborted)
            throw new DOMException('Aborted', 'AbortError');
        return document;
    },
    manual: input => revisionRequest('manual', input), protect: input => revisionRequest('protect', input), restore: input => revisionRequest('restore', input), copy: input => revisionRequest('copy', input),
    beforeOperation: async (menuId) => { await revisionRequest('before-operation', { menuId, operationId: revisionOperationId() }); },
    currentWrite: async (menuId) => (await revisionRequest('status', { menuId })).writeVersion,
    finalize: async (menuId) => { await revisionRequest('finalize', { menuId, operationId: revisionOperationId() }); },
};
