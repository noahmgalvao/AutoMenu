import { DesignerSheetExpansionContext } from '../common/useBottomSheetDrag';
import { withMenuRuleFallback } from '../../application/workspace/state';
import { DesignerTapButton } from '../common/DesignerTapButton';
import { MenuMultiSelectionProvider } from '../menu/interactions/MenuMultiSelection';
import { preventBrowserContextMenu } from '../common/noBrowserSelection';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check, ChefHat, History, Loader2, Paintbrush, Plus, ShoppingCart, X } from 'lucide-react';
import MenuDesigner from '../menu/MenuDesigner';
import { AuthScreen } from '../account/AuthScreen';
import { ProfileMenu } from '../account/ProfileMenu';
import { PublishButton, type PublishButtonProps } from '../publishing/PublishButton';
import { PublishModal } from '../publishing/PublishModal';
import { CreateMenuModal } from './CreateMenuModal';
import { RevisionHistoryModal } from './RevisionHistoryModal';
import { useMenuPublishing } from '../publishing/useMenuPublishing';
import { AppLoading, AppRecovery, PanelLoading } from './AppRecovery';
import { useWorkspaceEditor } from './useWorkspaceEditor';
const loadProductDesigner = () => import('../products/ProductDesigner').then((module) => ({
  default: module.ProductDesigner,
}));
const ProductDesigner = React.lazy(loadProductDesigner);
const SettingsModal = React.lazy(() => import('../account/SettingsModal').then((module) => ({
  default: module.SettingsModal,
})));

function PublishedLinkNotice({ button, onDismiss }: {
  button: React.RefObject<HTMLButtonElement | null>;
  onDismiss: () => void;
}) {
  const [position, setPosition] = useState({ top: 0, right: 0 });
  React.useLayoutEffect(() => {
    const anchor = button.current;
    if (!anchor) return;
    const update = () => {
      const bounds = anchor.getBoundingClientRect();
      setPosition({ top: Math.max(8, bounds.bottom + 8), right: Math.max(8, window.innerWidth - bounds.right) });
    };
    update();
    window.addEventListener('resize', update);
    const header = anchor.closest('[data-site-header]');
    header?.addEventListener('transitionend', update);
    return () => {
      window.removeEventListener('resize', update);
      header?.removeEventListener('transitionend', update);
    };
  }, [button]);

  return createPortal(
    <div role="status" className="fixed z-[10030]" style={position}>
      <button type="button" onClick={onDismiss} className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm">
        <Check size={14} /> Link publicado
      </button>
    </div>,
    document.body,
  );
}

const App: React.FC = () => {
  const [isRulesLayoutEditing, setRulesLayoutEditing] = useState(false);
  const [designerExpanded, setDesignerExpanded] = useState(false);
  const [activePanel, setActivePanel] = useState<'product' | 'style' | null>('style');
  const [hasOpenedProductDesigner, setHasOpenedProductDesigner] = useState(false);
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [isRevisionHistoryOpen, setIsRevisionHistoryOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const handleSelectedPages = useCallback((indexes: number[]) => {
    setSelectedPages(previous => previous.length === indexes.length && previous.every((id, index) => id === indexes[index]) ? previous : indexes);
  }, []);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [menuNameEdit, setMenuNameEdit] = useState<{ id: string; name: string } | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollIdleTimer = useRef<number | undefined>(undefined);
  const restoreNavigation = useCallback(() => {
    window.clearTimeout(scrollIdleTimer.current);
    scrollIdleTimer.current = undefined;
    setIsScrolling(false);
  }, []);
  const handleCanvasScroll = useCallback(() => {
    setIsScrolling(true);
    window.clearTimeout(scrollIdleTimer.current);
    scrollIdleTimer.current = window.setTimeout(restoreNavigation, 500);
  }, [restoreNavigation]);

  const [isMenuImportOpen, setIsMenuImportOpen] = useState(false);
  const {
    session, isAuthLoading, isAuthSubmitting, authError, loadError, setLoadError, workspaceLoadError, isConfigured,
    workspaceData, products, style, templates, sortOption, setSortOption, isSettingsSaving, isMenuActionLoading,
    setProducts, setStyle, setProductsAndStyle, setTemplates, undo, redo, canUndo, canRedo, handleProductEditChange,
    handleSignIn, handleSignUp, handleSignOut, handleSaveSettings, handleSaveTemplate, onPublishTemplate, handleRequestPasswordReset, handleUpdatePassword,
    handleSelectMenu, performCreateMenu, handleRenameMenu, handleDeleteMenus, forceSaveCurrentMenu, reloadCurrentMenu, refreshMenuList, saveStatus, historyNotice, setHistoryNotice,
  } = useWorkspaceEditor({
    showStylePanel: () => setActivePanel('style'),
    closeProfileMenu: () => setIsProfileMenuOpen(false),
    closeCreateMenu: () => setIsCreateMenuOpen(false),
  });

  useEffect(() => {
    restoreNavigation();
  }, [workspaceData?.menu.id, isMenuImportOpen, restoreNavigation]);

  useEffect(() => {
    window.addEventListener('focus', restoreNavigation);
    document.addEventListener('visibilitychange', restoreNavigation);
    return () => {
      window.clearTimeout(scrollIdleTimer.current);
      window.removeEventListener('focus', restoreNavigation);
      document.removeEventListener('visibilitychange', restoreNavigation);
    };
  }, [restoreNavigation]);

  useEffect(() => {
    if (!workspaceData || hasOpenedProductDesigner) return;
    let cancelled = false;
    void loadProductDesigner().then(() => {
      if (!cancelled) setHasOpenedProductDesigner(true);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hasOpenedProductDesigner, workspaceData]);

  const handleCreateMenu = () => {
    if (!workspaceData) return;
    setIsProfileMenuOpen(false);
    setIsCreateMenuOpen(true);
  };

  const toggleProductDesigner = () => {
    restoreNavigation();
    setHasOpenedProductDesigner(true);
    setActivePanel(current => current === 'product' ? null : 'product');
  };

  const toggleMenuDesigner = () => {
    restoreNavigation();
    setActivePanel(current => current === 'style' ? null : 'style');
  };

  const publishButton = useRef<HTMLButtonElement>(null);
  const publishInvoker = useRef<HTMLElement | null>(null);
  const publishing = useMenuPublishing({ session, workspaceData, products, style, sortOption });
  const { isPublishOpen, setIsPublishOpen, publishedLinkNotice, dismissPublishedLinkNotice, fileExportRef } = publishing;
  const publishControl: PublishButtonProps = {
    tone: publishing.tone,
    busy: publishing.isPublishing,
    onClick: event => {
      publishInvoker.current = event.currentTarget;
      dismissPublishedLinkNotice();
      setIsPublishOpen(true);
    },
  };

  if (!isConfigured()) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-white rounded-3xl shadow-xl border border-slate-200 p-8 space-y-4">
          <div className="flex items-center gap-3 text-slate-900">
            <AlertCircle className="w-6 h-6 text-amber-500" />
            <h1 className="text-xl font-semibold">Serviço indisponível</h1>
          </div>
          <p className="text-sm text-slate-500">Tente novamente mais tarde.</p>
        </div>
      </div>
    );
  }

  if (isAuthLoading || (session && !workspaceData && !workspaceLoadError)) {
    return <AppLoading />;
  }

  if (!session) {
    return <AuthScreen onSignIn={handleSignIn} onSignUp={handleSignUp} loading={isAuthSubmitting} error={authError ?? loadError} />;
  }

  if (!workspaceData) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-white rounded-3xl shadow-xl border border-slate-200 p-8 space-y-4">
          <div className="flex items-center gap-3 text-slate-900">
            <AlertCircle className="w-6 h-6 text-red-500" />
            <h1 className="text-xl font-semibold">Não foi possível abrir o cardápio</h1>
          </div>
          <p className="text-slate-600">{workspaceLoadError}</p>
          <button type="button" onClick={() => window.__automenuRecovery?.reload('manual', true) || window.location.reload()}
            className="mr-2 rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white">Tentar novamente</button>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  return (
    <DesignerSheetExpansionContext.Provider value={{expanded:designerExpanded,setExpanded:setDesignerExpanded}}>
    <MenuMultiSelectionProvider>
    <div className="h-screen bg-slate-50 flex flex-col font-sans text-slate-900 overflow-hidden relative"
      style={{ '--automenu-max-sheet-height': 'calc(100dvh - 4rem)' } as React.CSSProperties}>
      <nav data-site-header data-no-browser-selection onContextMenu={preventBrowserContextMenu} className={`fixed md:absolute top-0 left-0 right-0 bg-white border-b border-slate-200 h-16 ${isMenuImportOpen ? 'z-[1100]' : 'z-[60]'} transition-transform duration-300 ${isMenuImportOpen ? 'translate-y-0' : isScrolling ? '-translate-y-full md:translate-y-0' : 'translate-y-0'}`}>
        <div className="w-full px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden md:block bg-indigo-600 p-2 rounded-lg">
              <ChefHat className="text-white w-6 h-6" />
            </div>
            {!isMenuImportOpen && (
              <button
                onClick={() => void handleCreateMenu()}
                disabled={isMenuActionLoading}
                className="md:hidden grid size-10 shrink-0 place-items-center text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                title="Novo cardápio"
              >
                {isMenuActionLoading ? <Loader2 size={24} className="animate-spin" /> : <Plus size={24} />}
              </button>
            )}
            <div className="min-w-0">
              <div className="font-bold text-xl bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600 hidden sm:block">
                AutoMenu AI
              </div>
              <div className="text-xs text-slate-500 flex items-center gap-1 min-w-0">
                {menuNameEdit?.id === workspaceData.menu.id ? (
                  <input autoFocus aria-label="Nome do cardápio" value={menuNameEdit.name} maxLength={120}
                    className="w-full min-w-0 rounded-md border border-indigo-300 px-1.5 py-1 text-sm text-slate-800"
                    onFocus={event => event.currentTarget.select()}
                    onChange={event => setMenuNameEdit({ id: workspaceData.menu.id, name: event.target.value })}
                    onBlur={() => {
                      setMenuNameEdit(null);
                      if (menuNameEdit.name.trim()) void handleRenameMenu(menuNameEdit.id, menuNameEdit.name);
                    }}
                    onKeyDown={event => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                      if (event.key === 'Escape') { event.stopPropagation(); setMenuNameEdit(null); }
                    }} />
                ) : <button type="button" title="Renomear cardápio" data-menu-name className="min-w-0 truncate text-left hover:text-indigo-700"
                  onClick={() => setMenuNameEdit({ id: workspaceData.menu.id, name: workspaceData.menu.name })}>
                  {workspaceData.menu.name}
                </button>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setIsRevisionHistoryOpen(true)} className="h-10 w-10 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center" title="Histórico de revisões"><History size={18} /></button>
            <PublishButton header buttonRef={publishButton} {...publishControl} />
            <ProfileMenu
              profile={workspaceData.profile}
              workspace={workspaceData.workspace}
              menus={workspaceData.menus}
              activeMenuId={workspaceData.menu.id}
              isOpen={isProfileMenuOpen}
              loading={isMenuActionLoading}
              onToggle={() => setIsProfileMenuOpen((prev) => !prev)}
              onClose={() => setIsProfileMenuOpen(false)}
              onSelectMenu={(menuId) => void handleSelectMenu(menuId)}
              onCreateMenu={() => void handleCreateMenu()}
              onRenameMenu={async (id, name) => { await handleRenameMenu(id, name); }}
              onDeleteMenus={handleDeleteMenus}
              onOpenSettings={() => {
                setIsProfileMenuOpen(false);
                setIsSettingsOpen(true);
              }}
              onSignOut={() => void handleSignOut()}
            />
          </div>
        </div>
      </nav>

      {publishedLinkNotice && <PublishedLinkNotice button={publishButton} onDismiss={dismissPublishedLinkNotice} />}
      <PublishModal key={workspaceData.menu.id} publishing={publishing}
        title={workspaceData.menu.name} pageCount={pageCount} selectedPages={selectedPages} restoreFocus={publishInvoker} />

      <CreateMenuModal
        open={isCreateMenuOpen}
        menus={workspaceData.menus}
        defaultName={`Cardápio ${workspaceData.menus.length + 1}`}
        loading={isMenuActionLoading}
        onClose={() => setIsCreateMenuOpen(false)}
        onCreate={(name, sourceMenuId) => void performCreateMenu(name, sourceMenuId)}
      />

      <RevisionHistoryModal
        open={isRevisionHistoryOpen}
        workspaceId={workspaceData.workspace.id}
        menuId={workspaceData.menu.id}
        splitCategoryAcrossPages={workspaceData.workspace.settings.splitCategoryAcrossPages}
        saveStatus={saveStatus}
        actorId={session.user.id}
        expectedWrite={workspaceData.menu.revisionWriteVersion}
        onFlush={forceSaveCurrentMenu}
        onRestored={reloadCurrentMenu}
        onCopyCreated={refreshMenuList}
        onClose={() => setIsRevisionHistoryOpen(false)}
        onRestore={(revision) => {
          setProducts(revision.products);
          setStyle(withMenuRuleFallback(revision.style, workspaceData.workspace.settings));
          setSortOption(revision.sortOption);
          setIsRevisionHistoryOpen(false);
        }}
      />

      {isSettingsOpen && (
        <AppRecovery close={() => setIsSettingsOpen(false)}><React.Suspense fallback={<PanelLoading />}>
          <SettingsModal
            open
            profile={workspaceData.profile}
            workspace={workspaceData.workspace}
            email={session.user.email || ''}
            saving={isSettingsSaving}
            onClose={() => setIsSettingsOpen(false)}
            onSave={handleSaveSettings}
            onRequestPasswordReset={handleRequestPasswordReset}
            onUpdatePassword={handleUpdatePassword}
          />
        </React.Suspense></AppRecovery>
      )}

      {historyNotice && !loadError && !isPublishOpen && <div role="status" aria-label="Estado do histórico" className="absolute top-20 right-4 z-40 flex max-w-sm items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-lg"><span>{historyNotice}</span><button type="button" aria-label="Fechar aviso do histórico" onClick={()=>setHistoryNotice(null)}><X size={15}/></button></div>}

      {loadError && !loadError.startsWith('Conflito:') && !isPublishOpen && (
        <div className="absolute top-20 right-4 z-40 flex w-[min(24rem,calc(100%-2rem))] items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg">
          <span className="min-w-0 flex-1">{loadError}</span>

          <button type="button" onClick={() => setLoadError(null)} className="-mr-1 -mt-1 rounded-lg p-1 text-red-500 hover:bg-red-100 hover:text-red-700" title="Fechar mensagem" aria-label="Fechar mensagem">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex-grow flex overflow-hidden relative">
        <div className="hidden md:flex flex-col items-center gap-4 w-16 bg-white border-r border-slate-200 py-4 z-40">
          {!isMenuImportOpen && (
            <button
              onClick={() => void handleCreateMenu()}
              disabled={isMenuActionLoading}
              className="grid size-11 place-items-center rounded-xl border border-indigo-600 bg-transparent text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
              title="Novo cardápio"
            >
              {isMenuActionLoading ? <Loader2 size={24} className="animate-spin" /> : <Plus size={24} />}
            </button>
          )}
          <button
            onClick={toggleMenuDesigner}
            className={`p-3 rounded-xl transition-all ${activePanel === 'style' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-50'}`}
            title="Designer visual"
          >
            <Paintbrush size={24} />
          </button>
          <button
            onClick={toggleProductDesigner}
            className={`p-3 rounded-xl transition-all ${activePanel === 'product' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-50'}`}
            title="Designer de produtos"
          >
            <ShoppingCart size={24} />
          </button>
        </div>

        {hasOpenedProductDesigner && (
          <AppRecovery close={() => { setHasOpenedProductDesigner(false); setActivePanel(null); }}><React.Suspense fallback={<PanelLoading />}>
            <ProductDesigner
              products={products}
              setProducts={setProducts}
              style={style}
              setStyle={setStyle}
              setTemplates={setTemplates}
              templates={templates}
              onRulesLayoutEditingChange={setRulesLayoutEditing}
              sortOption={sortOption}
              isOpen={activePanel === 'product'}
              onClose={() => setActivePanel(null)}
              workspaceId={workspaceData.workspace.id}
              currentUserId={session.user.id}
              currentMenuId={workspaceData.menu.id}
              publishControl={publishControl}
              onImportVisibilityChange={setIsMenuImportOpen}
            />
          </React.Suspense></AppRecovery>
        )}

        <div className="flex-1 min-w-0 h-full relative">
          <MenuDesigner
            products={products}
            style={style}
            setStyle={setStyle}
            setProducts={setProducts}
            setProductsAndStyle={setProductsAndStyle}
            templates={templates}
            onSaveTemplate={handleSaveTemplate}
            onPublishTemplate={onPublishTemplate}
            sortOption={sortOption}
            setSortOption={setSortOption}
            undo={undo}
            redo={redo}
            onProductEditChange={handleProductEditChange}
            canUndo={canUndo}
            canRedo={canRedo}
            isOpen={activePanel === 'style'}
            isProductDesignerOpen={activePanel === 'product'}
            onRulesLayoutEditingChange={setRulesLayoutEditing}
            onOpenVisual={() => setActivePanel('style')}
            fileExportRef={fileExportRef}
            exportTitle={workspaceData.menu.name}
            onExportablePagesChange={setPageCount}
            onSelectedPagesChange={handleSelectedPages}
            publishControl={publishControl}
            onClose={() => setActivePanel(null)}
            onCanvasScroll={handleCanvasScroll}
            workspaceId={workspaceData.workspace.id}
            currentUserId={session.user.id}
            currentMenuId={workspaceData.menu.id}
          />
        </div>
      </div>

      <div
        data-mobile-designer-navigation
        className={`md:hidden fixed bottom-0 left-0 right-0 ${isRulesLayoutEditing ? 'hidden' : 'flex'} h-16 bg-white border-t border-slate-200 z-50 transition-transform duration-300 ${isScrolling && !activePanel ? 'translate-y-full' : 'translate-y-0'}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <DesignerTapButton type="button" data-mobile-designer-tab aria-controls="designer-sheet-visual"
          onClick={toggleMenuDesigner} onSwipeUp={() => setActivePanel('style')} aria-pressed={activePanel === 'style'}>
          <span className="designer-tab-icon"><Paintbrush size={18} /></span>
          <span>Visual</span>
        </DesignerTapButton>
        <DesignerTapButton type="button" data-mobile-designer-tab aria-controls="designer-sheet-products"
          onClick={toggleProductDesigner} onSwipeUp={() => {
            setHasOpenedProductDesigner(true);
            setActivePanel('product');
          }} aria-pressed={activePanel === 'product'}>
          <span className="designer-tab-icon"><ShoppingCart size={18} /></span>
          <span>Produtos</span>
        </DesignerTapButton>
      </div>
    </div>
    </MenuMultiSelectionProvider>
    </DesignerSheetExpansionContext.Provider>
  );
};

export default App;
