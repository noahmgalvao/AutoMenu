import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { getErrorMessage } from '../../../application/errorMessages';

export function MenuDesignDialog({ title, children, close, busy = false }: {
  title: string; children: ReactNode; close: () => void; busy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useLayoutEffect(() => {
    const node = dialog.current;
    const trigger = document.activeElement;
    node?.showModal();
    return () => {
      node?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(<dialog ref={dialog} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) close(); }}
    className="m-auto w-[min(34rem,calc(100%-2rem))] max-h-[84dvh] overflow-auto overscroll-contain rounded-2xl bg-white text-slate-800 shadow-xl backdrop:bg-slate-950/50">
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
      <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
      <button type="button" aria-label="Fechar" disabled={busy} onClick={close} className="rounded-lg p-2 hover:bg-slate-100"><X size={18} /></button>
    </header>
    {children}
  </dialog>, document.body);
}

export const designDialogButton = 'rounded-lg px-4 py-2 text-sm font-semibold';

export function SaveTemplateDialog({ close, save }: {
  close: () => void; save: (name: string, description: string, id: string) => Promise<void>;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  return <MenuDesignDialog title="Salvar como modelo" close={close} busy={saving}>
    <form className="space-y-4 p-5" onSubmit={async event => {
      event.preventDefault();
      if (pending.current) return;
      pending.current = true;
      setSaving(true);
      setError('');
      try {
        await save(name, description, id);
      } catch (cause) {
        setError(getErrorMessage(cause, 'Não foi possível salvar o modelo.'));
        pending.current = false;
        setSaving(false);
      }
    }}>
      <label className="grid gap-1.5 text-sm font-medium">Nome (opcional)
        <input autoFocus value={name} disabled={saving} onChange={event => setName(event.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2" />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">Descrição (opcional)
        <textarea value={description} disabled={saving} onChange={event => setDescription(event.target.value)}
          className="min-h-24 rounded-lg border border-slate-300 px-3 py-2" />
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <footer className="flex justify-end gap-2">
        <button type="button" disabled={saving} onClick={close} className={designDialogButton + ' border border-slate-200'}>Cancelar</button>
        <button disabled={saving} className={designDialogButton + ' bg-indigo-700 text-white disabled:opacity-60'}>{saving ? 'Salvando…' : 'Salvar modelo'}</button>
      </footer>
    </form>
  </MenuDesignDialog>;
}
