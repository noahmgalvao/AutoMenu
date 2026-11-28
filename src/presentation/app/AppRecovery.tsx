import { requestAppReload } from '../../infrastructure/browser/appLifecycle';
import { Component, type ReactNode } from 'react';

export function AppLoading() {
  return <main className="automenu-loading" data-automenu-loading>
    <span className="automenu-loading-dot" aria-hidden="true" />
    <p role="status">Carregando...</p>
  </main>;
}

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

  componentDidCatch() { requestAppReload('render'); }

  render() {
    if (!this.state.failed) return this.props.children;
    const close = this.props.close;
    return (
      <div className={close ? 'fixed inset-0 z-[150] grid place-items-center bg-slate-950/30 p-4' : 'grid min-h-dvh place-items-center bg-slate-100 p-4'}>
        <section role="alert" className="max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
          <h1 className="font-semibold text-slate-900">Não foi possível abrir {close ? 'o painel' : 'o AutoMenu'}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">A recuperação automática foi tentada. Verifique a conexão para continuar.</p><div className="mt-4 flex gap-3">
            <button type="button" onClick={() => window.__automenuRecovery?.reload('manual', true) || window.location.reload()} className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white">Recarregar</button>
            {close && <button type="button" onClick={() => { this.setState({ failed: false }); close(); }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Fechar</button>}
          </div>
        </section>
      </div>
    );
  }
}
