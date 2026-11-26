import { revisionOperationId } from '../../application/revisions/operationId';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, HelpCircle, History, Loader2, Lock, RotateCcw, Save, X } from 'lucide-react';
import type { RevisionGateway } from '../../application/revisions/contracts';
import { AuthorizedLru } from '../../application/revisions/authorizedLru';
import type { HistoryStatus, RevisionFilter, RevisionMetadata } from '../../domain/revisions/model';
import type { WorkspaceMenuContent } from '../../application/workspace/workspaceGateway';
import { getErrorMessage } from '../../application/errorMessages';
import { ReadOnlyCanvas } from './RevisionReadOnlyCanvas';
import { lockModalScrolling } from '../common/modalScroll';
export interface PersistentHistoryProps {
    gateway: RevisionGateway;
    workspaceId: string;
    menuId: string;
    expectedWrite: number;
    onClose: () => void;
    onFlush: () => Promise<void | number>;
    onRestored: () => Promise<void>;
    onCopyCreated: () => Promise<void>;
    saveStatus?: 'saved' | 'pending';
    actorId?: string;
    splitCategoryAcrossPages?: boolean;
}
const label = (r: RevisionMetadata) => r.name || r.event_tags[0] || (r.kind === 'published' ? 'Cardápio publicado' : `Revisão ${r.sequence}`);
const date = (r: RevisionMetadata) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(r.created_at));
function groupLabel(instant: string) { const date = new Date(instant), today = new Date(), yesterday = new Date(); yesterday.setDate(today.getDate() - 1); return date.toDateString() === today.toDateString() ? 'Hoje' : date.toDateString() === yesterday.toDateString() ? 'Ontem' : new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date); }
export function PersistentRevisionHistory({ gateway, workspaceId, menuId, expectedWrite, onClose, onFlush, onRestored, onCopyCreated, saveStatus, actorId, splitCategoryAcrossPages }: PersistentHistoryProps) {
    const [filter, setFilter] = useState<RevisionFilter>('all'), [items, setItems] = useState<RevisionMetadata[]>([]), [status, setStatus] = useState<HistoryStatus | null>(null), [cursor, setCursor] = useState<number | null>(null);
    const [selected, setSelected] = useState<RevisionMetadata | null>(null), [preview, setPreview] = useState<WorkspaceMenuContent | null>(null), [scale, setScale] = useState(window.innerWidth < 768 ? .28 : .78);
    const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
    const [form, setForm] = useState(false), [name, setName] = useState(''), [defaultName, setDefaultName] = useState(true), [help, setHelp] = useState(false), [confirm, setConfirm] = useState<'restore' | 'unprotect' | null>(null), [rename, setRename] = useState<string | null>(null);
    const [since, setSince] = useState(''), [until, setUntil] = useState(''), [refresh, setRefresh] = useState(0);
    const selectionWrite = useRef(expectedWrite);
    const operation = useRef<string | null>(null), request = useRef<AbortController | null>(null), listRequest = useRef<AbortController | null>(null), cache = useRef(new AuthorizedLru<WorkspaceMenuContent>(workspaceId));
    const helpRef = useRef<HTMLDivElement>(null), dialogRef = useRef<HTMLDivElement | null>(null), panelRef = useRef<HTMLElement | null>(null), busyRef = useRef(busy);
    busyRef.current = busy;
    useEffect(() => {
        if (!selected || !dialogRef.current)
            return;
        const dialog = dialogRef.current, previous = document.activeElement as HTMLElement | null;
        dialog.querySelector<HTMLButtonElement>('button')?.focus();
        const keyboard = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !busyRef.current) {
                event.preventDefault();
                request.current?.abort();
                setSelected(null);
                setPreview(null);
                setLoading(false);
                setConfirm(null);
                return;
            }
            if (event.key !== 'Tab')
                return;
            const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(element => element.getClientRects().length);
            const first = controls[0], last = controls[controls.length - 1];
            if (!first)
                return;
            if (!dialog.contains(document.activeElement) || event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            }
        };
        document.addEventListener('keydown', keyboard, true);
        return () => { document.removeEventListener('keydown', keyboard, true); queueMicrotask(() => { if (previous?.isConnected)
            previous.focus();
        else
            panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus(); }); };
    }, [selected?.id]);
    useEffect(() => {
        if (!help)
            return;
        const close = (e: PointerEvent) => {
            if (!helpRef.current?.contains(e.target as Node))
                setHelp(false);
        };
        document.addEventListener('pointerdown', close);
        return () => document.removeEventListener('pointerdown', close);
    }, [help]);
    useEffect(() => {
        listRequest.current?.abort();
        const controller = new AbortController();
        listRequest.current = controller;
        setLoading(true);
        setError(null);
        setItems([]);
        setCursor(null);
        gateway.page({ menuId, filter, since: since ? `${since}T00:00:00Z` : undefined, until: until ? `${until}T23:59:59.999Z` : undefined, signal: controller.signal }).then(page => {
            if (controller.signal.aborted)
                return;
            setItems(page.items);
            setCursor(page.nextCursor);
            setStatus(page.status);
        }).catch(e => {
            if (!controller.signal.aborted)
                setError(getErrorMessage(e, 'Falha ao carregar histórico.'));
        }).finally(() => {
            if (!controller.signal.aborted)
                setLoading(false);
        });
        return () => controller.abort();
    }, [menuId, filter, since, until, refresh, gateway]);
    useEffect(() => () => { request.current?.abort(); listRequest.current?.abort(); cache.current.clear(); }, [menuId, workspaceId]);
    const choose = async (revision: RevisionMetadata) => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setSelected(revision);
        setPreview(null);
        setError(null);
        setConfirm(null);
        setRename(null);
        const key = `${revision.schema_version}:${revision.state_hash}`;
        setLoading(true);
        try {
            await onFlush();
            selectionWrite.current = await gateway.currentWrite(menuId);
            const cached = cache.current.get(workspaceId, key);
            if (cached) {
                setPreview(cached);
                return;
            }
            const document = await gateway.load({ menuId, revisionId: revision.id, workspaceId, signal: controller.signal }) as unknown as WorkspaceMenuContent;
            if (!controller.signal.aborted) {
                setPreview(document);
                cache.current.set(workspaceId, key, document, new TextEncoder().encode(JSON.stringify(document)).length);
            }
        }
        catch (e) {
            if (!controller.signal.aborted)
                setError(getErrorMessage(e, 'Revisão indisponível.'));
        }
        finally {
            if (!controller.signal.aborted)
                setLoading(false);
        }
    };
    const act = async (fn: () => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            await fn();
        }
        catch (e) {
            if ((e as Error)?.name !== 'AbortError')
                setError(getErrorMessage(e, 'Não foi possível concluir.'));
        }
        finally {
            setBusy(false);
        }
    };
    const manual = () => void act(async () => { const currentWrite = await onFlush(); operation.current ||= revisionOperationId(); await gateway.manual({ menuId, name: name.trim(), defaultName, expectedWrite: typeof currentWrite === 'number' ? currentWrite : expectedWrite, operationId: operation.current }); operation.current = null; setForm(false); setRefresh(n => n + 1); setNotice('Versão protegida salva.'); });
    const protect = (protect: boolean) => void act(async () => {
        if (!selected)
            return;
        await gateway.protect({ menuId, revisionId: selected.id, protect, confirmed: !protect, name: rename === null ? undefined : rename.trim(), operationId: revisionOperationId() });
        setConfirm(null);
        setSelected(null);
        setPreview(null);
        setRefresh(n => n + 1);
    });
    const restore = () => void act(async () => {
        if (!selected)
            return;
        await onFlush();
        operation.current ||= revisionOperationId();
        await gateway.restore({ menuId, revisionId: selected.id, expectedWrite: selectionWrite.current, operationId: operation.current });
        operation.current = null;
        await onRestored();
        setSelected(null);
        setPreview(null);
        setConfirm(null);
        setRefresh(n => n + 1);
        setNotice('Versão restaurada. Publique novamente para atualizar o link virtual.');
    });
    const copy = () => void act(async () => {
        if (!selected)
            return;
        operation.current ||= revisionOperationId();
        await gateway.copy({ menuId, revisionId: selected.id, operationId: operation.current });
        await onCopyCreated();
        operation.current = null;
        setNotice('Cópia independente criada, sem publicação.');
    });
    const loadMore = () => void act(async () => {
        listRequest.current?.abort();
        const controller = new AbortController();
        listRequest.current = controller;
        const page = await gateway.page({ menuId, filter, cursor, since: since ? `${since}T00:00:00Z` : undefined, until: until ? `${until}T23:59:59.999Z` : undefined, signal: controller.signal });
        if (controller.signal.aborted)
            return;
        setItems(rows => [...rows, ...page.items]);
        setCursor(page.nextCursor);
        setStatus(page.status);
    });
    const groups = items.reduce<Array<{
        label: string;
        items: RevisionMetadata[];
    }>>((groups, item) => {
        const title = groupLabel(item.created_at), last = groups[groups.length - 1];
        if (last?.label === title)
            last.items.push(item);
        else
            groups.push({ label: title, items: [item] });
        return groups;
    }, []);
    const feedback = <>{error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}{notice && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{notice}</p>}</>;
    if (selected)
        return <div ref={element => { dialogRef.current = element; return lockModalScrolling(element); }} role="dialog" aria-modal="true" aria-label="Prévia histórica" className="fixed inset-0 z-[1300] flex flex-col bg-slate-200">
  <header className="flex shrink-0 items-center gap-2 border-b bg-white p-3"><button aria-label="Voltar à versão atual" disabled={busy} onClick={() => { request.current?.abort(); setSelected(null); setPreview(null); setLoading(false); setConfirm(null); }} className="rounded-xl border p-2"><ArrowLeft size={18}/></button><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">Visualizando versão de {date(selected)}</p><p className="truncate text-xs text-slate-500">{label(selected)} · somente leitura</p></div><button disabled={busy || !preview} onClick={() => setConfirm('restore')} className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><RotateCcw size={15} className="mr-1 inline"/>Restaurar</button><button disabled={busy || !preview} onClick={copy} className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-40"><Copy size={15} className="mr-1 inline"/>Criar cópia</button></header>
  <div className="flex flex-wrap items-center gap-2 border-b bg-white px-3 pb-2 text-xs">
   <button disabled={busy || selected.protection === 'original'} className="rounded-lg border px-2 py-1.5 disabled:opacity-40" onClick={() => selected.protection ? setConfirm('unprotect') : setRename(selected.name || 'Versão protegida')}><Lock size={13} className="mr-1 inline"/>{selected.protection ? 'Remover proteção' : 'Nomear/fixar'}</button>
   {selected.protection && <button disabled={busy} onClick={() => setRename(selected.name || '')} className="rounded-lg border px-2 py-1.5">Renomear</button>}
   {rename !== null && <form className="flex gap-1" onSubmit={e => { e.preventDefault(); protect(true); }}><input aria-label="Nome da revisão" maxLength={100} value={rename} onChange={e => setRename(e.target.value)} className="min-w-0 rounded-lg border px-2 py-1"/><button disabled={busy || !rename.trim()} className="rounded-lg bg-indigo-600 p-1.5 text-white"><Check size={15}/></button><button type="button" aria-label="Cancelar nome" onClick={() => setRename(null)}><X size={15}/></button></form>}
  </div>
  {confirm && <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 p-3 text-xs"><p className="min-w-44 flex-1">{confirm === 'restore' ? 'Restaurar esta versão? O estado atual será preservado. O link publicado só muda com uma nova publicação.' : 'Remover proteção? Esta versão voltará à retenção automática e poderá ser compactada se o limite for ultrapassado.'}</p><button disabled={busy} onClick={() => setConfirm(null)} className="rounded-lg border px-3 py-2">Cancelar</button><button disabled={busy} onClick={confirm === 'restore' ? restore : () => protect(false)} className="rounded-lg bg-indigo-600 px-3 py-2 font-bold text-white">Confirmar</button></div>}
  <div className="space-y-1 bg-white px-3">{feedback}</div><div className="relative min-h-0 flex-1">{preview && <ReadOnlyCanvas preview={preview} scale={scale} setScale={setScale} splitCategoryAcrossPages={splitCategoryAcrossPages}/>} {loading && <div role="status" className="absolute inset-0 flex items-center justify-center bg-white/60"><Loader2 className="animate-spin text-indigo-600"/></div>}</div>
 </div>;
    return <aside ref={panelRef} role="region" aria-label="Histórico de revisões" className="fixed bottom-20 right-2 top-20 z-[1200] flex w-[min(380px,calc(100vw-16px))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
  <header className="flex shrink-0 items-center gap-2 border-b px-4 py-3"><History size={18} className="text-indigo-600"/><h2 className="flex-1 whitespace-nowrap text-sm font-bold">Histórico de revisões</h2><div ref={helpRef} className="relative"><button aria-label="Política do histórico" aria-expanded={help} onClick={() => setHelp(v => !v)} className="p-1 text-slate-500"><HelpCircle size={17}/></button>{help && <p role="tooltip" className="absolute right-0 top-9 z-20 w-64 rounded-xl bg-slate-900 p-3 text-xs leading-relaxed text-white shadow-xl">O AutoMenu agrupa alterações e mantém até {status?.maxAutomatic || 1000} revisões automáticas por cardápio. Ao atingir o limite, preserva períodos ativos e eventos relevantes. Versões protegidas não são compactadas. A idade, sozinha, não apaga revisões.</p>}</div><button aria-label="Fechar histórico" onClick={onClose} className="p-1 text-slate-500"><X size={18}/></button></header>
  <div className="shrink-0 px-3 pt-3"><div role="tablist" aria-label="Filtrar revisões" className="flex rounded-xl bg-slate-100 p-1">{([['all', 'Todas'], ['protected', 'Protegidas'], ['important', 'Importantes']] as const).map(([key, text]) => <button key={key} role="tab" aria-selected={filter === key} onClick={() => { setFilter(key); setForm(false); operation.current = null; }} className={`flex-1 rounded-lg py-2 text-xs font-semibold ${filter === key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>{text}</button>)}</div>
  {filter === 'protected' && <div className="mt-2"><button disabled={busy || !!status?.pausedReason} onClick={() => { setForm(v => !v); setName(`Versão ${status?.nextManual || 1}`); setDefaultName(true); operation.current = null; }} className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 py-2 text-xs font-bold text-indigo-700 disabled:opacity-40"><Save size={15}/>Salvar versão</button>
   {form && <form className="mt-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-2.5" onSubmit={e => { e.preventDefault(); manual(); }}><label className="block text-xs font-semibold">Nome da versão<input autoFocus maxLength={100} value={name} onChange={e => { setName(e.target.value); setDefaultName(false); operation.current = null; }} className="mt-1 w-full rounded-lg border bg-white px-2.5 py-2 text-sm"/></label><div className="mt-2 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => { setForm(false); operation.current = null; }} className="rounded-lg border bg-white px-2.5 py-1.5 text-xs">Cancelar</button><button disabled={busy || !name.trim()} className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-40">{busy ? 'Salvando…' : 'Salvar'}</button></div></form>}
   <p className="mt-2 text-[11px] text-slate-500">{status?.protected || 0} de {status?.maxProtected || 100} versões protegidas · original separada</p></div>}
  <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2 text-[11px]"><span className="font-semibold text-slate-700">Versão atual</span><span className="text-slate-500">{saveStatus === 'saved' ? 'Salva no servidor' : saveStatus === 'pending' ? 'Alterações pendentes' : 'Edição atual'}</span></div>
  {status && <p className="mt-2 text-[11px] text-slate-500">{status.automatic} de {status.maxAutomatic} automáticas · {status.protected} protegidas{status.compacted > 0 ? ' · Histórico compactado segundo a política.' : ''}</p>}
  {status?.pausedReason && <p role="status" className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{status.pausedReason}{status.migrating && <button type="button" onClick={() => setRefresh(n => n + 1)} className="ml-2 font-semibold underline">Atualizar lista</button>}</p>}
  <div className="my-2 flex gap-2 text-[11px]"><label className="min-w-0 flex-1 text-slate-500">De<input aria-label="Data inicial" type="date" value={since} onChange={e => setSince(e.target.value)} className="mt-1 w-full rounded-lg border px-2 py-1.5"/></label><label className="min-w-0 flex-1 text-slate-500">Até<input aria-label="Data final" type="date" value={until} onChange={e => setUntil(e.target.value)} className="mt-1 w-full rounded-lg border px-2 py-1.5"/></label></div>{feedback}</div>
  <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">{loading && <div role="status" className="flex justify-center p-5"><Loader2 className="animate-spin text-indigo-600"/></div>}{groups.map(group => <details key={group.label} open><summary className="sticky top-0 cursor-pointer bg-white py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">{group.label}</summary><div className="space-y-1">{group.items.map(r => <button key={r.id} onClick={() => void choose(r)} className="w-full rounded-xl border border-transparent px-3 py-2.5 text-left hover:border-indigo-200 hover:bg-indigo-50"><span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">{r.protection && <Lock size={12}/>}{label(r)}</span><span className="mt-1 block text-[10px] text-slate-500">{date(r)}{r.actor_id && r.actor_id === actorId ? ' · Você' : ''}</span></button>)}</div></details>)}{!loading && !items.length && <p className="py-6 text-center text-xs text-slate-500">Nenhuma revisão neste filtro.</p>}{cursor && <button disabled={busy} onClick={loadMore} className="mt-2 w-full rounded-xl border py-2 text-xs font-semibold disabled:opacity-40">Carregar mais</button>}</div>
 </aside>;
}
