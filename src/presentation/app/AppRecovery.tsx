import { Component, type ReactNode } from 'react';

export function PanelLoading() {
  return <div role="status" className="fixed inset-x-0 bottom-16 z-[150] mx-auto w-fit rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-lg">
    Carregando painel…
  </div>;
}

export class AppRecovery extends Component<{ children: ReactNode; close?: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const close = this.props.close;
    return (
      <div className={close ? 'fixed inset-0 z-[150] grid place-items-center bg-slate-950/30 p-4' : 'grid min-h-dvh place-items-center bg-slate-100 p-4'}>
        <section role="alert" className="max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
          <h1 className="font-semibold text-slate-900">Falha ao carregar {close ? 'o painel' : 'o AutoMenu'}</h1>
          <div className="mt-4 flex gap-3">
            <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white">Recarregar</button>
            {close && <button type="button" onClick={() => { this.setState({ failed: false }); close(); }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Fechar</button>}
          </div>
        </section>
      </div>
    );
  }
}
