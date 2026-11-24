import { withMenuRuleFallback } from '../../application/workspace/state';
import { DesignerTapButton } from '../common/DesignerTapButton';
import { MenuMultiSelectionProvider } from '../menu/interactions/MenuMultiSelection';
import { preventBrowserContextMenu } from '../common/noBrowserSelection';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ChefHat, History, Loader2, Paintbrush, Plus, Send, ShoppingCart, X } from 'lucide-react';
import MenuDesigner from '../menu/MenuDesigner';
import { AuthScreen } from '../account/AuthScreen';
import { ProfileMenu } from '../account/ProfileMenu';
import { PublishModal } from '../publishing/PublishModal';
import type { VirtualLinkControls } from '../publishing/VirtualLinkSection';
import { CreateMenuModal } from './CreateMenuModal';
import { RevisionHistoryModal } from './RevisionHistoryModal';
import type { PrintCanvasOptions } from '../menu/designer/PrintCanvasModal';
import { getPublicationUrl } from '../publishing/publicationUrl';
import { useMenuPublishing } from '../publishing/useMenuPublishing';
import { useWorkspaceEditor } from './useWorkspaceEditor';
const loadProductDesigner = () => import('../products/ProductDesigner').then((module) => ({
  default: module.ProductDesigner,
}));
const ProductDesigner = React.lazy(loadProductDesigner);
const SettingsModal = React.lazy(() => import('../account/SettingsModal').then((module) => ({
  default: module.SettingsModal,
})));

const App: React.FC = () => {
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
  const scrollDistance = useRef(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollIdleTimer = useRef<number | undefined>(undefined);
  const restoreNavigation = useCallback(() => {
    window.clearTimeout(scrollIdleTimer.current);
    scrollIdleTimer.current = undefined;
    scrollDistance.current = 0;
    setIsScrolling(false);
  }, []);
  const handleCanvasScroll = useCallback((verticalDelta: number) => {
    if (verticalDelta < 0) {
      restoreNavigation();
      return;
    }
    scrollDistance.current += verticalDelta;
    if (scrollDistance.current >= 48) setIsScrolling(true);
    window.clearTimeout(scrollIdleTimer.current);
    scrollIdleTimer.current = window.setTimeout(restoreNavigation, 500);
  }, [restoreNavigation]);

  const [isMenuImportOpen, setIsMenuImportOpen] = useState(false);
  const {
    session, isAuthLoading, isAuthSubmitting, authError, loadError, setLoadError, workspaceLoadError, isConfigured,
    workspaceData, products, style, templates, sortOption, setSortOption, isSettingsSaving, isMenuActionLoading,
    setProducts, setStyle, setProductsAndStyle, setTemplates, undo, redo, canUndo, canRedo, handleProductEditChange,
    handleSignIn, handleSignUp, handleSignOut, handleSaveSettings, handleSaveTemplate, onPublishTemplate, handleRequestPasswordReset, handleUpdatePassword,
    handleSelectMenu, performCreateMenu, handleRenameMenu, handleDeleteMenus, forceSaveCurrentMenu,
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
    });
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

  const {
    printRequestId, printRequestMode, publication, isPublishOpen, setIsPublishOpen, isPublishing, publishAction,
    publishFeedback, buttonResults, fileExportRef, hasPublishedChanges, requestPrint,
    preparePdf, prepareJpg, handleLinkAction, handlePublishConfirm, handlePdfAction, handleJpgAction,
    handlePublicationSlugChange, handlePrintComplete, handlePrintError, handlePrintCancel,
  } = useMenuPublishing({ session, workspaceData, forceSaveCurrentMenu, setLoadError, products, style, sortOption });

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
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-700">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Carregando ambiente...</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return <AuthScreen onSignIn={handleSignIn} onSignUp={handleSignUp} loading={isAuthSubmitting} error={authError} />;
  }

  if (!workspaceData) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-white rounded-3xl shadow-xl border border-slate-200 p-8 space-y-4">
          <div className="flex items-center gap-3 text-slate-900">
            <AlertCircle className="w-6 h-6 text-red-500" />
            <h1 className="text-xl font-semibold">Falha ao carregar o ambiente</h1>
          </div>
          <p className="text-slate-600">{workspaceLoadError}</p>
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

  const virtualLinkControls: VirtualLinkControls = {
    loading: isPublishing,
    hasPublication: Boolean(publication),
    publicUrl: publication ? getPublicationUrl(publication) : null,
    publicationMenuSlug: publication?.menuSlug,
    activeAction: publishAction,
    feedback: publishFeedback,
    buttonResults,
    onLinkAction: action => void handleLinkAction(action),
    onSaveMenuSlug: menuSlug => void handlePublicationSlugChange(menuSlug),
  };

  return (
    <MenuMultiSelectionProvider>
    <div className="h-screen bg-slate-50 flex flex-col font-sans text-slate-900 overflow-hidden relative"
      style={{ '--automenu-max-sheet-height': 'calc(100dvh - 4rem)' } as React.CSSProperties}>
      <nav data-site-header data-no-browser-selection onContextMenu={preventBrowserContextMenu} className={`absolute top-0 left-0 right-0 bg-white border-b border-slate-200 h-16 ${isMenuImportOpen ? 'z-[1100]' : 'z-[60]'} transition-transform duration-300 ${isMenuImportOpen ? 'translate-y-0' : isScrolling ? '-translate-y-full md:translate-y-0' : 'translate-y-0'}`}>
        <div className="w-full px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden md:block bg-indigo-600 p-2 rounded-lg">
              <ChefHat className="text-white w-6 h-6" />
            </div>
            {!isMenuImportOpen && (
              <button
                onClick={() => void handleCreateMenu()}
                disabled={isMenuActionLoading}
                className="md:hidden grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
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
            <button
              type="button"
              onClick={() => setIsPublishOpen(true)}
              disabled={isPublishing}
              className={`h-10 px-3 sm:px-4 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-60 ${publication && hasPublishedChanges
                ? 'border border-amber-400 bg-amber-50 text-amber-800 shadow-sm shadow-amber-100 hover:bg-amber-100'
                : publication
                  ? 'border border-emerald-400 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100 hover:bg-emerald-100'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {isPublishing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              <span className="hidden sm:inline">Publicar</span>
            </button>
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

      <PublishModal
        {...virtualLinkControls}
        open={isPublishOpen}
        preferenceKey={`automenu:publish-options:${session.user.id}`}
        hasPendingChanges={Boolean(publication && hasPublishedChanges)}
        onClose={() => setIsPublishOpen(false)}
        onConfirm={(options) => void handlePublishConfirm(options)}
        onPdfAction={handlePdfAction}
        onJpgAction={handleJpgAction}
        pageCount={pageCount}
        selectedPages={selectedPages}
        preparePdf={preparePdf}
        prepareJpg={prepareJpg}
        error={loadError}
      />

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
        onClose={() => setIsRevisionHistoryOpen(false)}
        onRestore={(revision) => {
          setProducts(revision.products);
          setStyle(withMenuRuleFallback(revision.style, workspaceData.workspace.settings));
          setSortOption(revision.sortOption);
          setIsRevisionHistoryOpen(false);
        }}
      />

      {isSettingsOpen && (
        <React.Suspense fallback={null}>
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
        </React.Suspense>
      )}

      {loadError && !isPublishOpen && (
        <div className="absolute top-20 right-4 z-40 flex max-w-md items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg">
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
              className="grid size-11 place-items-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
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
          <React.Suspense fallback={null}>
            <ProductDesigner
              products={products}
              setProducts={setProducts}
              style={style}
              setStyle={setStyle}
              setTemplates={setTemplates}
              sortOption={sortOption}
              isOpen={activePanel === 'product'}
              onClose={() => setActivePanel(null)}
              workspaceId={workspaceData.workspace.id}
              currentUserId={session.user.id}
              currentMenuId={workspaceData.menu.id}
              onPdfClick={() => requestPrint('download')}
              onImportVisibilityChange={setIsMenuImportOpen}
            />
          </React.Suspense>
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
            onOpenVisual={() => setActivePanel('style')}
            printRequestId={printRequestId}
            printRequestMode={printRequestMode}
            onPrintComplete={(result) => void handlePrintComplete(result)}
            onPrintError={handlePrintError}
            onPrintCancel={handlePrintCancel}
            silentPrintOptions={publication?.pdfOptions as Partial<PrintCanvasOptions> | undefined}
            fileExportRef={fileExportRef}
            onExportablePagesChange={setPageCount}
            onSelectedPagesChange={handleSelectedPages}
            virtualLinkControls={virtualLinkControls}
            onClose={() => setActivePanel(null)}
            onCanvasScroll={handleCanvasScroll}
            workspaceId={workspaceData.workspace.id}
            currentUserId={session.user.id}
            currentMenuId={workspaceData.menu.id}
          />
        </div>
      </div>

      <div
        className={`md:hidden fixed bottom-0 left-0 right-0 flex h-16 bg-white border-t border-slate-200 z-50 transition-transform duration-300 ${isScrolling && !activePanel ? 'translate-y-full' : 'translate-y-0'}`}
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
  );
};

export default App;
