import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PersistentRevisionHistory } from '../../src/presentation/app/PersistentRevisionHistory';
import { INITIAL_STYLE } from '../../src/domain/menu/defaults';
import type { RevisionGateway } from '../../src/application/revisions/contracts';
import type { RevisionMetadata, RevisionPage } from '../../src/domain/revisions/model';
import '../../src/presentation/styles.css';
const seed: RevisionMetadata[] = Array.from({ length: 65 }, (_, i) => ({ id: `r${i}`, menu_id: 'm', sequence: i + 1, created_at: new Date(Date.UTC(2026, 10, 26, 0, i)).toISOString(), actor_id: null, kind: 'checkpoint', priority: i % 5 === 0 ? 2 : 0, event_tags: [], name: null, protection: i === 0 ? 'original' : null, state_hash: `h${i}`, state_id: `s${i}`, schema_version: 1, source_revision_id: null }));
const historicalDocument = { products: Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `Produto ${i}`, category: `Categoria ${Math.floor(i / 3)}`, description: 'Descrição de ingredientes', price: 12 })), style: { ...INITIAL_STYLE, menuTitle: 'Menu histórico', blankPages: [{ id: 'extra', index: 1, fixedPosition: true }] }, sortOption: { field: 'category', direction: 'asc' } };
function Fixture() {
    const [open, setOpen] = useState(true), [calls, setCalls] = useState<string[]>([]);
    const gateway = useMemo(() => {
        let counter = 0;
        let rows = structuredClone(seed);
        const operations = new Map<string, any>();
        const log = (name: string) => setCalls(c => [...c, name]);
        return {
            page: async ({ filter, cursor, signal }) => {
                log(`page:${filter}:${cursor || 0}`);
                await new Promise(r => setTimeout(r, 25));
                if (signal?.aborted)
                    throw new DOMException('Aborted', 'AbortError');
                const all = rows.filter(r => (filter === 'all' || filter === 'protected' && r.protection || filter === 'important' && r.priority >= 2) && (!cursor || r.sequence < cursor)).sort((a, b) => b.sequence - a.sequence);
                return { items: all.slice(0, 30), nextCursor: all.length > 30 ? all[29].sequence : null, status: { automatic: rows.filter(r => !r.protection).length, protected: counter, original: 1, nextManual: counter + 1, maxAutomatic: 1000, maxProtected: 100, compacted: 0, pausedReason: null, unavailableMetrics: ['disk', 'egress'] } } as RevisionPage;
            },
            load: async ({ revisionId, signal }) => {
                log(`load:${revisionId}`);
                await new Promise(r => setTimeout(r, revisionId === 'r64' ? 150 : 5));
                if (signal?.aborted)
                    throw new DOMException('Aborted', 'AbortError');
                return { ...historicalDocument, style: { ...historicalDocument.style, menuTitle: `Preview ${revisionId}` } } as any;
            },
            manual: async (input) => {
                log('manual');
                if (operations.has(input.operationId))
                    return operations.get(input.operationId);
                if (input.name === 'Falhar')
                    throw new Error('Failed to fetch');
                counter++;
                const r = { ...rows[rows.length - 1], id: `manual${counter}`, sequence: 100 + counter, protection: 'user' as const, name: input.defaultName ? `Versão ${counter}` : input.name };
                rows = [...rows, r];
                operations.set(input.operationId, r);
                return r;
            },
            protect: async (input) => {
                log('protect');
                const r = rows.find(r => r.id === input.revisionId)!;
                r.protection = input.protect ? 'user' : null;
                if (input.name)
                    r.name = input.name;
                return r;
            },
            restore: async () => { log('restore'); }, copy: async () => { log('copy'); return { menuId: 'copy' }; }, beforeOperation: async () => { }, currentWrite: async () => 0, finalize: async () => { },
        } satisfies RevisionGateway;
    }, []);
    return <><button onClick={() => setOpen(true)}>Abrir histórico</button><p data-testid="calls">{calls.join('|')}</p><p data-testid="editor">Editor continua disponível</p>{open && <PersistentRevisionHistory gateway={gateway} workspaceId="w" menuId="m" expectedWrite={0} onClose={() => setOpen(false)} onFlush={async () => { }} onRestored={async () => { }} onCopyCreated={async () => { }}/>}</>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
