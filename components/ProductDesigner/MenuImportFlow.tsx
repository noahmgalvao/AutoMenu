import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  FileImage,
  ImagePlus,
  Images,
  LayoutTemplate,
  List,
  Loader2,
  RefreshCw,
  ScanLine,
  Trash2,
  X,
} from 'lucide-react';
import type { MenuImportMode, MenuStyle, Product, SortOption } from '../../types';
import {
  createMenuImportEditorStyle,
  finalizeMenuImport,
  FinalizedMenuImport,
  ProcessedMenuImport,
} from '../../services/menuImportService';
import {
  cropDocumentPage,
  detectDocumentCorners,
  DocumentCorners,
  getDefaultDocumentCorners,
  getScannerImageInfo,
} from '../../utils/documentScanner';
import { FREE_TEXT_PREFIX } from '../../utils/menuPagination';
import { useProductDesignerLogic } from '../../hooks/useProductDesignerLogic';
import { MenuPreview } from '../MenuPreview';
import { ProductList } from './ProductList';

type CornerName = keyof DocumentCorners;
type FlowScreen = 'camera' | 'editor';
type FileIntent = 'initial' | 'add' | 'replace';
type PreviewTab = 'menu' | 'items';

interface PendingPage {
  id: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  corners: DocumentCorners;
  detecting: boolean;
}

interface MenuImportFlowProps {
  disabled?: boolean;
  sortOption: SortOption;
  workspaceId: string;
  currentUserId: string;
  currentMenuId: string;
  productsCanChangeCategory?: boolean;
  splitCategoryAcrossPages?: boolean;
  onPrepare: (files: File[], mode: MenuImportMode) => Promise<ProcessedMenuImport>;
  onComplete: (processed: ProcessedMenuImport, finalized: FinalizedMenuImport) => void;
}

export interface MenuImportFlowHandle {
  start: () => void;
}

const IMPORT_MODES: Array<{
  value: MenuImportMode;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { value: 'complete', label: 'Importação completa', description: 'Produtos e visual', icon: FileImage },
  { value: 'products', label: 'Apenas produtos', description: 'Categorias e produtos', icon: List },
  { value: 'visual', label: 'Apenas visual', description: 'Fundo, fontes e imagens', icon: LayoutTemplate },
];

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 767px)').matches
    || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
};

const constrainCorner = (
  name: CornerName,
  point: { x: number; y: number },
  corners: DocumentCorners,
  width: number,
  height: number,
) => {
  const minimumGap = Math.max(8, Math.min(width, height) * 0.015);
  let minimumX = 0;
  let maximumX = width;
  let minimumY = 0;
  let maximumY = height;

  if (name === 'topLeft') {
    maximumX = corners.topRight.x - minimumGap;
    maximumY = corners.bottomLeft.y - minimumGap;
  } else if (name === 'topRight') {
    minimumX = corners.topLeft.x + minimumGap;
    maximumY = corners.bottomRight.y - minimumGap;
  } else if (name === 'bottomRight') {
    minimumX = corners.bottomLeft.x + minimumGap;
    minimumY = corners.topRight.y + minimumGap;
  } else {
    maximumX = corners.bottomRight.x - minimumGap;
    minimumY = corners.topLeft.y + minimumGap;
  }

  return {
    x: Math.max(minimumX, Math.min(maximumX, point.x)),
    y: Math.max(minimumY, Math.min(maximumY, point.y)),
  };
};

const PreviewCanvas: React.FC<{
  products: Product[];
  style: MenuStyle;
  sortOption: SortOption;
  splitCategoryAcrossPages?: boolean;
  productsCanChangeCategory?: boolean;
}> = ({ products, style, sortOption, splitCategoryAcrossPages, productsCanChangeCategory }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.42);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateScale = () => {
      const width = container.getBoundingClientRect().width;
      setScale(Math.max(0.22, Math.min(0.58, (width - 24) / 930)));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="h-full min-h-0 overflow-auto rounded-2xl bg-slate-200/60 custom-scrollbar">
      <div className="w-fit min-w-[794px] origin-top-left" style={{ transform: `scale(${scale})` }}>
        <MenuPreview
          products={products}
          style={style}
          sortOption={sortOption}
          splitCategoryAcrossPages={splitCategoryAcrossPages}
          productsCanChangeCategory={productsCanChangeCategory}
          readOnly
        />
      </div>
    </div>
  );
};

const ImportedItemsEditor: React.FC<{
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  style: MenuStyle;
  setStyle: React.Dispatch<React.SetStateAction<MenuStyle>>;
  sortOption: SortOption;
  workspaceId: string;
  currentUserId: string;
  currentMenuId: string;
  productsCanChangeCategory?: boolean;
}> = ({
  products,
  setProducts,
  style,
  setStyle,
  sortOption,
  workspaceId,
  currentUserId,
  currentMenuId,
  productsCanChangeCategory,
}) => {
  const logic = useProductDesignerLogic({
    products,
    setProducts,
    style,
    setStyle,
    sortOption,
    workspaceId,
    currentUserId,
    currentMenuId,
    productsCanChangeCategory,
  });
  const grouped = useMemo(() => (
    Object.fromEntries(
      Object.entries(logic.handlers.groupedProducts).map(([category, categoryProducts]) => [
        category,
        (categoryProducts as Product[]).filter((product) => !product.isFreeText),
      ]),
    ) as Record<string, Product[]>
  ), [logic.handlers.groupedProducts]);
  const categories = logic.handlers.sortedCategories.filter((category: string) => (
    !category.startsWith(FREE_TEXT_PREFIX) && (grouped[category]?.length || 0) > 0
  ));

  return (
    <div
      className="h-full min-h-0 overflow-y-auto overflow-x-hidden rounded-2xl border border-slate-200 bg-slate-50 p-4 custom-scrollbar"
      onPointerDownCapture={() => { document.body.dataset.automenuDeleteContext = 'import-preview'; }}
    >
      {categories.length > 0 ? (
        <ProductList
          categories={categories}
          grouped={grouped}
          style={style}
          handlers={logic.handlers}
          collapsedCategories={logic.collapsedCategories}
          toggleCollapse={logic.toggleCollapse}
          editModeId={logic.editModeId}
          menuOpenId={logic.menuOpenId}
          setMenuOpenId={logic.setMenuOpenId}
          formData={logic.formData}
          setFormData={logic.setFormData}
          newItemDraft={logic.newItemDraft}
          startEdit={logic.startEdit}
          saveEdit={logic.saveEdit}
          cancelEdit={logic.cancelEdit}
          remove={logic.remove}
          handleToggleVisibility={logic.handleToggleVisibility}
          initiateAdd={logic.initiateAdd}
          onProductImageClick={logic.onProductImageClick}
          onRemoveProductImage={logic.onRemoveProductImage}
        />
      ) : (
        <div className="flex h-full min-h-56 items-center justify-center text-center text-sm text-slate-500">
          Nenhum produto foi encontrado neste scan.
        </div>
      )}
      <input
        ref={logic.productFileInputRef}
        type="file"
        className="hidden"
        onChange={logic.handleProductImageUpload}
        accept="image/*"
      />
    </div>
  );
};

export const MenuImportFlow = forwardRef<MenuImportFlowHandle, MenuImportFlowProps>(
  ({
    disabled = false,
    sortOption,
    workspaceId,
    currentUserId,
    currentMenuId,
    productsCanChangeCategory,
    splitCategoryAcrossPages,
    onPrepare,
    onComplete,
  }, ref) => {
    const [visible, setVisible] = useState(false);
    const [screen, setScreen] = useState<FlowScreen>('editor');
    const [mode, setMode] = useState<MenuImportMode>('complete');
    const [pages, setPages] = useState<PendingPage[]>([]);
    const [activePageId, setActivePageId] = useState<string | null>(null);
    const [cameraError, setCameraError] = useState('');
    const [preparing, setPreparing] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [processingError, setProcessingError] = useState('');
    const [previewResult, setPreviewResult] = useState<ProcessedMenuImport | null>(null);
    const [previewStale, setPreviewStale] = useState(false);
    const [previewTab, setPreviewTab] = useState<PreviewTab>('menu');
    const [draftProducts, setDraftProducts] = useState<Product[]>([]);
    const [draftStyle, setDraftStyle] = useState<MenuStyle | null>(null);
    const [draftDirty, setDraftDirty] = useState(false);
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

    const galleryInputRef = useRef<HTMLInputElement>(null);
    const fileIntentRef = useRef<FileIntent>('initial');
    const cameraIntentRef = useRef<'initial' | 'add'>('initial');
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const pagesRef = useRef<PendingPage[]>([]);
    const editorViewportRef = useRef<HTMLDivElement>(null);
    const draggingCornerRef = useRef<{ name: CornerName; pointerId: number } | null>(null);

    const busy = preparing || processing;

    const stopCamera = useCallback(() => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    }, []);

    const disposePages = useCallback((pagesToDispose: PendingPage[]) => {
      pagesToDispose.forEach((page) => URL.revokeObjectURL(page.previewUrl));
    }, []);

    const clearPages = useCallback(() => {
      setPages((currentPages) => {
        disposePages(currentPages);
        return [];
      });
      setActivePageId(null);
    }, [disposePages]);

    const resetPreview = useCallback(() => {
      setPreviewResult(null);
      setDraftProducts([]);
      setDraftStyle(null);
      setDraftDirty(false);
      setPreviewStale(false);
      setProcessingError('');
      setPreviewTab('menu');
    }, []);

    const close = useCallback(() => {
      if (busy) return;
      stopCamera();
      clearPages();
      resetPreview();
      setVisible(false);
      setCameraError('');
      document.body.dataset.automenuDeleteContext = 'product-designer';
    }, [busy, clearPages, resetPreview, stopCamera]);

    const openFilePicker = useCallback((intent: FileIntent) => {
      if (disabled || busy) return;
      fileIntentRef.current = intent;
      galleryInputRef.current?.click();
    }, [busy, disabled]);

    const start = useCallback(() => {
      if (disabled) return;
      stopCamera();
      clearPages();
      resetPreview();
      setMode('complete');
      setCameraError('');

      if (isMobileDevice()) {
        cameraIntentRef.current = 'initial';
        setScreen('camera');
        setVisible(true);
        return;
      }
      openFilePicker('initial');
    }, [clearPages, disabled, openFilePicker, resetPreview, stopCamera]);

    useImperativeHandle(ref, () => ({ start }), [start]);

    const createPendingPage = useCallback(async (file: File): Promise<PendingPage> => {
      const info = await getScannerImageInfo(file);
      return {
        id: crypto.randomUUID(),
        file,
        previewUrl: info.url,
        width: info.width,
        height: info.height,
        corners: getDefaultDocumentCorners(info.width, info.height),
        detecting: true,
      };
    }, []);

    const detectPage = useCallback(async (page: PendingPage): Promise<PendingPage> => {
      const corners = await detectDocumentCorners(page.previewUrl, page.width, page.height);
      return { ...page, corners, detecting: false };
    }, []);

    const runProcessing = useCallback(async (
      sourcePages: PendingPage[],
      selectedMode: MenuImportMode,
      confirmDraftReplacement = true,
    ) => {
      if (sourcePages.length === 0 || sourcePages.some((page) => page.detecting)) return;
      if (confirmDraftReplacement && draftDirty && !window.confirm('O novo scan substituirá as edições feitas neste preview. Continuar?')) return;

      setProcessing(true);
      setProcessingError('');
      setPreviewStale(true);
      try {
        const croppedFiles: File[] = [];
        for (const page of sourcePages) {
          croppedFiles.push(await cropDocumentPage(page.file, page.previewUrl, page.corners));
        }
        const processed = await onPrepare(croppedFiles, selectedMode);
        setPreviewResult(processed);
        setDraftProducts(processed.importedProducts);
        setDraftStyle(createMenuImportEditorStyle(processed));
        setDraftDirty(false);
        setPreviewStale(false);
        setPreviewTab(selectedMode === 'products' ? 'items' : 'menu');
      } catch (error) {
        console.error(error);
        setProcessingError(error instanceof Error ? error.message : 'Não foi possível processar o cardápio.');
        setPreviewStale(true);
      } finally {
        setProcessing(false);
      }
    }, [draftDirty, onPrepare]);

    const handleIncomingFiles = useCallback(async (files: File[], intent: FileIntent) => {
      const imageFiles = files.filter((file) => file.type.startsWith('image/'));
      if (imageFiles.length === 0) return;
      const selectedFiles = intent === 'initial' ? imageFiles : imageFiles.slice(0, 1);

      setPreparing(true);
      setProcessingError('');
      stopCamera();
      try {
        const pendingPages = await Promise.all(selectedFiles.map(createPendingPage));
        if (intent === 'initial') {
          disposePages(pagesRef.current);
          setPages(pendingPages);
          setActivePageId(pendingPages[0]?.id || null);
          setMode('complete');
          setPreviewTab('menu');
          setScreen('editor');
          setVisible(true);
          const detectedPages = await Promise.all(pendingPages.map(detectPage));
          setPages(detectedPages);
          setPreparing(false);
          await runProcessing(detectedPages, 'complete', false);
          return;
        }

        const detectedPage = await detectPage(pendingPages[0]);
        if (intent === 'replace') {
          setPages((currentPages) => currentPages.map((page) => {
            if (page.id !== activePageId) return page;
            URL.revokeObjectURL(page.previewUrl);
            return detectedPage;
          }));
        } else {
          setPages((currentPages) => [...currentPages, detectedPage]);
        }
        setActivePageId(detectedPage.id);
        setScreen('editor');
        setVisible(true);
        setPreviewStale(true);
      } catch (error) {
        console.error(error);
        setProcessingError('Não foi possível abrir ou detectar a imagem selecionada.');
      } finally {
        setPreparing(false);
      }
    }, [activePageId, createPendingPage, detectPage, disposePages, runProcessing, stopCamera]);

    const handleGalleryChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      const intent = fileIntentRef.current;
      event.target.value = '';
      void handleIncomingFiles(files, intent);
    }, [handleIncomingFiles]);

    useEffect(() => {
      if (!visible || screen !== 'camera') {
        stopCamera();
        return;
      }
      let cancelled = false;
      setCameraError('');
      const openCamera = async () => {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraError('A câmera não está disponível neste navegador. Use a galeria.');
          return;
        }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          });
          if (cancelled) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }
        } catch (error) {
          console.warn('Falha ao abrir a câmera.', error);
          setCameraError('Permita o acesso à câmera ou escolha uma imagem da galeria.');
        }
      };
      void openCamera();
      return () => {
        cancelled = true;
        stopCamera();
      };
    }, [screen, stopCamera, visible]);

    useEffect(() => {
      const viewport = editorViewportRef.current;
      if (!viewport || !visible || screen !== 'editor') return;
      const updateSize = () => {
        const rect = viewport.getBoundingClientRect();
        setViewportSize({ width: rect.width, height: rect.height });
      };
      updateSize();
      const observer = new ResizeObserver(updateSize);
      observer.observe(viewport);
      return () => observer.disconnect();
    }, [screen, visible]);

    useEffect(() => { pagesRef.current = pages; }, [pages]);
    useEffect(() => {
      if (!visible) return;
      const previousContext = document.body.dataset.automenuDeleteContext;
      document.body.dataset.automenuDeleteContext = 'import-preview';
      return () => {
        if (previousContext) document.body.dataset.automenuDeleteContext = previousContext;
        else delete document.body.dataset.automenuDeleteContext;
      };
    }, [visible]);
    useEffect(() => () => {
      stopCamera();
      disposePages(pagesRef.current);
    }, [disposePages, stopCamera]);

    const capturePhoto = useCallback(() => {
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) {
        setCameraError('A câmera ainda está iniciando.');
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const file = new File([blob], `cardapio-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
        void handleIncomingFiles([file], cameraIntentRef.current);
      }, 'image/jpeg', 0.96);
    }, [handleIncomingFiles]);

    const activePage = pages.find((page) => page.id === activePageId) || pages[0] || null;
    const displayGeometry = useMemo(() => {
      if (!activePage || viewportSize.width <= 0 || viewportSize.height <= 0) return null;
      const scale = Math.min(viewportSize.width / activePage.width, viewportSize.height / activePage.height);
      const width = activePage.width * scale;
      const height = activePage.height * scale;
      return { scale, width, height, left: (viewportSize.width - width) / 2, top: (viewportSize.height - height) / 2 };
    }, [activePage, viewportSize]);

    const updateActiveCorners = useCallback((
      updater: (corners: DocumentCorners, page: PendingPage) => DocumentCorners,
    ) => {
      if (!activePage) return;
      setPages((currentPages) => currentPages.map((page) => (
        page.id === activePage.id ? { ...page, corners: updater(page.corners, page) } : page
      )));
      setPreviewStale(true);
    }, [activePage]);

    const handleCornerPointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
      const dragging = draggingCornerRef.current;
      const viewport = editorViewportRef.current;
      if (!dragging || dragging.pointerId !== event.pointerId || !viewport || !activePage || !displayGeometry) return;
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const sourceX = (event.clientX - rect.left - displayGeometry.left) / displayGeometry.scale;
      const sourceY = (event.clientY - rect.top - displayGeometry.top) / displayGeometry.scale;
      updateActiveCorners((corners, page) => ({
        ...corners,
        [dragging.name]: constrainCorner(dragging.name, { x: sourceX, y: sourceY }, corners, page.width, page.height),
      }));
    }, [activePage, displayGeometry, updateActiveCorners]);

    const redetectActivePage = useCallback(async () => {
      if (!activePage || busy) return;
      setPages((currentPages) => currentPages.map((page) => (
        page.id === activePage.id ? { ...page, detecting: true } : page
      )));
      try {
        const detectedPage = await detectPage({ ...activePage, detecting: true });
        setPages((currentPages) => currentPages.map((page) => (
          page.id === activePage.id ? detectedPage : page
        )));
        setPreviewStale(true);
      } catch (error) {
        console.error(error);
        setProcessingError('Não foi possível detectar novamente as bordas desta página.');
        setPages((currentPages) => currentPages.map((page) => (
          page.id === activePage.id ? { ...page, detecting: false } : page
        )));
      }
    }, [activePage, busy, detectPage]);

    const removePage = useCallback((pageId: string) => {
      if (pages.length <= 1 || busy) return;
      setPages((currentPages) => {
        const removedIndex = currentPages.findIndex((page) => page.id === pageId);
        const removed = currentPages[removedIndex];
        if (removed) URL.revokeObjectURL(removed.previewUrl);
        const nextPages = currentPages.filter((page) => page.id !== pageId);
        setActivePageId((currentActiveId) => (
          currentActiveId === pageId ? nextPages[Math.min(removedIndex, nextPages.length - 1)]?.id || null : currentActiveId
        ));
        return nextPages;
      });
      setPreviewStale(true);
    }, [busy, pages.length]);

    const addAnotherPage = useCallback(() => {
      if (busy) return;
      if (isMobileDevice()) {
        cameraIntentRef.current = 'add';
        setCameraError('');
        setScreen('camera');
        return;
      }
      openFilePicker('add');
    }, [busy, openFilePicker]);

    const handleModeChange = useCallback((nextMode: MenuImportMode) => {
      if (nextMode === mode || busy) return;
      setMode(nextMode);
      setPreviewTab(nextMode === 'products' ? 'items' : 'menu');
      if (previewResult) setPreviewStale(true);
    }, [busy, mode, previewResult]);

    const updateDraftProducts: React.Dispatch<React.SetStateAction<Product[]>> = useCallback((value) => {
      setDraftProducts(value);
      setDraftDirty(true);
    }, []);

    const updateDraftStyle: React.Dispatch<React.SetStateAction<MenuStyle>> = useCallback((value) => {
      setDraftStyle((current) => {
        if (!current) return current;
        return typeof value === 'function' ? value(current) : value;
      });
      setDraftDirty(true);
    }, []);

    const finalizedPreview = useMemo(() => (
      previewResult && draftStyle ? finalizeMenuImport(previewResult, draftProducts, draftStyle) : null
    ), [draftProducts, draftStyle, previewResult]);

    const complete = useCallback(() => {
      if (!previewResult || !finalizedPreview || previewStale || busy) return;
      onComplete(previewResult, finalizedPreview);
      stopCamera();
      clearPages();
      resetPreview();
      setVisible(false);
      document.body.dataset.automenuDeleteContext = 'product-designer';
    }, [busy, clearPages, finalizedPreview, onComplete, previewResult, previewStale, resetPreview, stopCamera]);

    const renderCamera = () => (
      <div className="fixed inset-0 z-[1000] flex flex-col overflow-hidden bg-black text-white">
        <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/80" />
        <header className="relative z-10 flex items-center justify-between px-4 pb-3 pt-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
          <button type="button" onClick={close} className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 backdrop-blur" aria-label="Fechar câmera"><X size={24} /></button>
          <div className="rounded-full bg-black/50 px-4 py-2 text-sm font-bold backdrop-blur">Página {cameraIntentRef.current === 'add' ? pages.length + 1 : 1}</div>
          <button type="button" onClick={() => openFilePicker(cameraIntentRef.current)} className="flex h-11 items-center gap-2 rounded-full bg-black/50 px-4 text-sm font-bold backdrop-blur"><Images size={20} />Galeria</button>
        </header>
        <div className="relative z-10 mt-auto space-y-4 px-4 pb-5">
          {cameraError && <div className="rounded-xl bg-red-600/90 px-4 py-3 text-center text-sm font-medium">{cameraError}</div>}
          <div className="grid grid-cols-3 items-center" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <button type="button" onClick={() => openFilePicker(cameraIntentRef.current)} className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur" aria-label="Abrir galeria"><Images size={24} /></button>
            <button type="button" onClick={capturePhoto} className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 shadow-xl" aria-label="Tirar foto"><span className="h-16 w-16 rounded-full bg-white" /></button>
            {pages.length > 0 ? <button type="button" onClick={() => setScreen('editor')} className="mx-auto flex h-12 min-w-12 items-center justify-center rounded-xl bg-white px-3 text-sm font-bold text-slate-950">Revisar ({pages.length})</button> : <span />}
          </div>
        </div>
      </div>
    );

    const renderOriginalImage = () => {
      const cornerLabels: Record<CornerName, string> = {
        topLeft: 'Canto superior esquerdo',
        topRight: 'Canto superior direito',
        bottomRight: 'Canto inferior direito',
        bottomLeft: 'Canto inferior esquerdo',
      };
      return (
        <section className="flex min-h-0 flex-col gap-3">
          <h2 className="text-center text-xl font-bold text-slate-900">Imagem Original</h2>
          <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
            <button type="button" onClick={() => void runProcessing(pages, mode)} disabled={busy || pages.length === 0 || pages.some((page) => page.detecting)} className="flex min-h-16 flex-col items-center justify-center gap-1 border-r border-slate-100 px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40">
              {processing ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}Escanear Novamente
            </button>
            <button type="button" onClick={() => void redetectActivePage()} disabled={busy || !activePage} className="flex min-h-16 flex-col items-center justify-center gap-1 border-r border-slate-100 px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40"><ScanLine size={20} />Detectar Bordas</button>
            <button type="button" onClick={() => openFilePicker('replace')} disabled={busy || !activePage} className="flex min-h-16 flex-col items-center justify-center gap-1 px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40"><FileImage size={20} />Substituir Arquivo</button>
          </div>
          <div ref={editorViewportRef} className="relative h-[52vh] min-h-[360px] overflow-hidden rounded-2xl bg-slate-950 shadow-xl lg:h-[calc(100vh-235px)] lg:min-h-[430px]">
            {activePage && displayGeometry && (
              <>
                <img src={activePage.previewUrl} alt="Página para recorte" draggable={false} className="absolute select-none" style={{ left: displayGeometry.left, top: displayGeometry.top, width: displayGeometry.width, height: displayGeometry.height }} />
                <svg className="pointer-events-none absolute" style={{ left: displayGeometry.left, top: displayGeometry.top, width: displayGeometry.width, height: displayGeometry.height }} viewBox={`0 0 ${activePage.width} ${activePage.height}`} preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <mask id={`scanner-mask-${activePage.id}`}>
                      <rect width={activePage.width} height={activePage.height} fill="white" />
                      <polygon points={[activePage.corners.topLeft, activePage.corners.topRight, activePage.corners.bottomRight, activePage.corners.bottomLeft].map((point) => `${point.x},${point.y}`).join(' ')} fill="black" />
                    </mask>
                  </defs>
                  <rect width={activePage.width} height={activePage.height} fill="rgba(0,0,0,0.58)" mask={`url(#scanner-mask-${activePage.id})`} />
                  <polygon points={[activePage.corners.topLeft, activePage.corners.topRight, activePage.corners.bottomRight, activePage.corners.bottomLeft].map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#7c3aed" strokeWidth={Math.max(3, 4 / displayGeometry.scale)} vectorEffect="non-scaling-stroke" />
                </svg>
                {(Object.keys(activePage.corners) as CornerName[]).map((cornerName) => {
                  const point = activePage.corners[cornerName];
                  return (
                    <button
                      key={cornerName}
                      type="button"
                      aria-label={cornerLabels[cornerName]}
                      disabled={busy}
                      className="absolute z-10 h-8 w-8 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-[5px] border-white bg-violet-600 shadow-[0_0_0_2px_rgba(124,58,237,0.9),0_4px_12px_rgba(0,0,0,0.5)] disabled:opacity-50"
                      style={{ left: displayGeometry.left + (point.x * displayGeometry.scale), top: displayGeometry.top + (point.y * displayGeometry.scale) }}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        draggingCornerRef.current = { name: cornerName, pointerId: event.pointerId };
                        event.currentTarget.setPointerCapture(event.pointerId);
                      }}
                      onPointerMove={handleCornerPointerMove}
                      onPointerUp={(event) => {
                        if (draggingCornerRef.current?.pointerId === event.pointerId) draggingCornerRef.current = null;
                        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                      }}
                      onPointerCancel={() => { draggingCornerRef.current = null; }}
                    />
                  );
                })}
              </>
            )}
            {(preparing || activePage?.detecting) && <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 text-white"><div className="flex items-center gap-2 rounded-full bg-slate-950/90 px-4 py-2 text-sm font-bold"><Loader2 size={18} className="animate-spin text-violet-400" />Detectando bordas...</div></div>}
          </div>
        </section>
      );
    };

    const renderProcessingOptions = () => (
      <section className="flex min-h-0 flex-col justify-center gap-5 lg:pt-20">
        <div>
          <h2 className="mb-3 text-center text-xl font-bold text-slate-900">Opções de Processamento</h2>
          <fieldset className="grid grid-cols-3 gap-2" aria-label="Tipo de importação">
            {IMPORT_MODES.map((importMode) => {
              const selected = importMode.value === mode;
              const Icon = importMode.icon;
              return (
                <label key={importMode.value} className={`relative flex min-h-28 min-w-0 cursor-pointer flex-col items-center justify-center rounded-2xl border p-2 text-center shadow-md transition-all ${selected ? 'border-violet-600 bg-violet-50 text-violet-800 ring-1 ring-violet-600' : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300'} ${busy ? 'pointer-events-none opacity-50' : ''}`}>
                  <input type="radio" name="menu-import-mode" value={importMode.value} checked={selected} onChange={() => handleModeChange(importMode.value)} className="sr-only" />
                  <Icon size={25} className="mb-2" />
                  <span className="text-xs font-bold leading-tight">{importMode.label}</span>
                  <span className="mt-1 hidden text-[10px] leading-tight text-slate-400 xl:block">{importMode.description}</span>
                  {selected && <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-white"><Check size={12} strokeWidth={3} /></span>}
                </label>
              );
            })}
          </fieldset>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Páginas</span><span className="text-xs text-slate-400">{pages.length}</span></div>
          <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
            {pages.map((page, index) => (
              <div
                key={page.id}
                role="button"
                tabIndex={busy ? -1 : 0}
                onClick={() => { if (!busy) setActivePageId(page.id); }}
                onKeyDown={(event) => {
                  if (!busy && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    setActivePageId(page.id);
                  }
                }}
                className={`group relative h-24 w-16 flex-none overflow-hidden rounded-xl border-2 bg-slate-100 transition-all ${page.id === activePage?.id ? 'border-violet-600 ring-2 ring-violet-200' : 'border-transparent hover:border-violet-300'} ${busy ? 'opacity-50' : 'cursor-pointer'}`}
                aria-label={`Selecionar página ${index + 1}`}
              >
                <img src={page.previewUrl} alt={`Página ${index + 1}`} className="h-full w-full object-cover" />
                <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">{index + 1}</span>
                {pages.length > 1 && (
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); removePage(page.id); }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        removePage(page.id);
                      }
                    }}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white opacity-100 shadow md:opacity-0 md:group-hover:opacity-100"
                    aria-label={`Excluir página ${index + 1}`}
                  ><Trash2 size={12} /></button>
                )}
                {page.detecting && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-white"><Loader2 size={18} className="animate-spin" /></span>}
              </div>
            ))}
            <button type="button" onClick={addAnotherPage} disabled={busy} className="flex h-24 w-20 flex-none flex-col items-center justify-center rounded-xl border border-dashed border-violet-300 bg-violet-50 text-[11px] font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-40"><ImagePlus size={24} />Adicionar Página</button>
          </div>
        </div>
        {previewStale && previewResult && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-800">Alterações pendentes. Use “Escanear Novamente” para atualizar o preview.</div>}
      </section>
    );

    const renderPreview = () => {
      const showMenuTab = mode !== 'products';
      const showItemsTab = mode !== 'visual';
      return (
        <section className="flex min-h-0 flex-col gap-3">
          <h2 className="text-center text-xl font-bold text-slate-900">Preview do Resultado</h2>
          <div className="mx-auto flex rounded-full border border-slate-200 bg-white p-1 shadow-lg">
            {showMenuTab && <button type="button" onClick={() => setPreviewTab('menu')} className={`rounded-full px-5 py-2 text-sm font-bold transition-all ${previewTab === 'menu' ? 'bg-violet-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}>Ver Cardápio</button>}
            {showItemsTab && <button type="button" onClick={() => setPreviewTab('items')} className={`rounded-full px-5 py-2 text-sm font-bold transition-all ${previewTab === 'items' ? 'bg-violet-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}>Ver Itens</button>}
          </div>
          <div className="relative h-[58vh] min-h-[420px] lg:h-[calc(100vh-235px)] lg:min-h-[430px]">
            {finalizedPreview && previewTab === 'menu' && <PreviewCanvas products={finalizedPreview.products} style={finalizedPreview.style} sortOption={sortOption} splitCategoryAcrossPages={splitCategoryAcrossPages} productsCanChangeCategory={productsCanChangeCategory} />}
            {previewResult && draftStyle && previewTab === 'items' && (
              <ImportedItemsEditor products={draftProducts} setProducts={updateDraftProducts} style={draftStyle} setStyle={updateDraftStyle} sortOption={sortOption} workspaceId={workspaceId} currentUserId={currentUserId} currentMenuId={currentMenuId} productsCanChangeCategory={productsCanChangeCategory} />
            )}
            {!previewResult && !processing && <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center text-sm text-slate-500">O resultado aparecerá aqui após o processamento.</div>}
            {processing && <div className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-white/90 backdrop-blur-sm"><div className="text-center"><Loader2 size={36} className="mx-auto mb-3 animate-spin text-violet-600" /><p className="font-bold text-slate-800">Processando cardápio...</p><p className="mt-1 text-xs text-slate-500">Produtos, imagens e visual estão sendo preparados.</p></div></div>}
            {previewStale && previewResult && !processing && <div className="absolute inset-0 z-20 flex cursor-not-allowed items-center justify-center rounded-2xl bg-slate-950/25 backdrop-blur-[1px]"><span className="rounded-full bg-white px-4 py-2 text-sm font-bold text-amber-700 shadow-lg">Preview desatualizado</span></div>}
          </div>
          {processingError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{processingError}</div>}
        </section>
      );
    };

    const renderEditor = () => (
      <div className="fixed inset-0 z-[1000] flex flex-col overflow-hidden bg-slate-100 text-slate-900" onPointerDownCapture={() => { document.body.dataset.automenuDeleteContext = 'import-preview'; }}>
        <button type="button" onClick={close} disabled={busy} className="absolute right-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg hover:text-slate-900 disabled:opacity-40" style={{ marginTop: 'env(safe-area-inset-top)' }} aria-label="Fechar importação"><X size={23} /></button>
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-16 custom-scrollbar md:px-6 lg:overflow-hidden lg:pb-24">
          <div className="mx-auto grid max-w-[1700px] gap-7 lg:h-full lg:grid-cols-[minmax(300px,1fr)_300px_minmax(360px,1fr)]">
            {renderOriginalImage()}
            {renderProcessingOptions()}
            {renderPreview()}
          </div>
        </main>
        <footer className="absolute inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:px-6" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="hidden text-xs text-slate-500 sm:block">{previewResult && !previewStale ? `${previewResult.productCount} produtos · ${previewResult.pageCount} página${previewResult.pageCount === 1 ? '' : 's'}` : 'Revise o resultado antes de concluir.'}</div>
          <button type="button" onClick={complete} disabled={!previewResult || !finalizedPreview || previewStale || busy} className="ml-auto flex h-12 items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 text-sm font-bold text-white shadow-lg transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"><Check size={19} />Concluir Importação</button>
        </footer>
      </div>
    );

    return createPortal(
      <>
        <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryChange} />
        {visible && (screen === 'camera' ? renderCamera() : renderEditor())}
      </>,
      document.body,
    );
  },
);

MenuImportFlow.displayName = 'MenuImportFlow';