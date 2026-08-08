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
  Images,
  ImagePlus,
  Loader2,
  RotateCcw,
  ScanLine,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import type { MenuImportMode } from '../../types';
import {
  cropDocumentPage,
  detectDocumentCorners,
  DocumentCorners,
  getDefaultDocumentCorners,
  getScannerImageInfo,
} from '../../utils/documentScanner';

type CornerName = keyof DocumentCorners;
type FlowScreen = 'camera' | 'editor';

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
  onImport: (files: File[], mode: MenuImportMode) => Promise<void> | void;
}

export interface MenuImportFlowHandle {
  start: () => void;
}

const IMPORT_MODES: Array<{
  value: MenuImportMode;
  label: string;
  description: string;
}> = [
  {
    value: 'complete',
    label: 'Importação completa',
    description: 'Produtos e visual',
  },
  {
    value: 'products',
    label: 'Apenas produtos',
    description: 'Categorias e produtos',
  },
  {
    value: 'visual',
    label: 'Apenas visual',
    description: 'Fundo, fontes e imagens',
  },
];

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 767px)').matches
    || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
};

const ImportModeSelector: React.FC<{
  value: MenuImportMode;
  onChange: (mode: MenuImportMode) => void;
  dark?: boolean;
}> = ({ value, onChange, dark = false }) => (
  <fieldset className="grid grid-cols-3 gap-2" aria-label="Tipo de importação">
    {IMPORT_MODES.map((mode) => {
      const selected = mode.value === value;
      return (
        <label
          key={mode.value}
          className={`relative min-w-0 cursor-pointer rounded-xl border px-2 py-2.5 text-center transition-colors ${
            selected
              ? dark
                ? 'border-white bg-white text-slate-950'
                : 'border-indigo-600 bg-indigo-50 text-indigo-800'
              : dark
                ? 'border-white/30 bg-black/30 text-white'
                : 'border-slate-200 bg-white text-slate-600'
          }`}
        >
          <input
            type="radio"
            name="menu-import-mode"
            value={mode.value}
            checked={selected}
            onChange={() => onChange(mode.value)}
            className="sr-only"
          />
          <span className="block text-[11px] font-bold leading-tight">{mode.label}</span>
          <span className={`mt-1 hidden text-[9px] leading-tight sm:block ${
            selected && dark ? 'text-slate-600' : selected ? 'text-indigo-600' : dark ? 'text-white/70' : 'text-slate-400'
          }`}>
            {mode.description}
          </span>
          {selected && (
            <span className={`absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full ${
              dark ? 'bg-slate-950 text-white' : 'bg-indigo-600 text-white'
            }`}>
              <Check size={10} strokeWidth={3} />
            </span>
          )}
        </label>
      );
    })}
  </fieldset>
);

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

export const MenuImportFlow = forwardRef<MenuImportFlowHandle, MenuImportFlowProps>(
  ({ disabled = false, onImport }, ref) => {
    const [visible, setVisible] = useState(false);
    const [screen, setScreen] = useState<FlowScreen>('editor');
    const [mode, setMode] = useState<MenuImportMode>('complete');
    const [pages, setPages] = useState<PendingPage[]>([]);
    const [activePageId, setActivePageId] = useState<string | null>(null);
    const [cameraError, setCameraError] = useState('');
    const [preparing, setPreparing] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

    const galleryInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const pagesRef = useRef<PendingPage[]>([]);
    const editorViewportRef = useRef<HTMLDivElement>(null);
    const draggingCornerRef = useRef<{ name: CornerName; pointerId: number } | null>(null);

    const stopCamera = useCallback(() => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    }, []);

    const clearPages = useCallback(() => {
      setPages((currentPages) => {
        currentPages.forEach((page) => URL.revokeObjectURL(page.previewUrl));
        return [];
      });
      setActivePageId(null);
    }, []);

    const close = useCallback(() => {
      if (submitting) return;
      stopCamera();
      clearPages();
      setVisible(false);
      setCameraError('');
      setPreparing(false);
    }, [clearPages, stopCamera, submitting]);

    const openGallery = useCallback(() => {
      if (!disabled && !submitting) galleryInputRef.current?.click();
    }, [disabled, submitting]);

    const start = useCallback(() => {
      if (disabled) return;
      setMode('complete');
      setCameraError('');

      if (isMobileDevice()) {
        setScreen('camera');
        setVisible(true);
        return;
      }

      openGallery();
    }, [disabled, openGallery]);

    useImperativeHandle(ref, () => ({ start }), [start]);

    const detectPage = useCallback(async (page: PendingPage) => {
      const corners = await detectDocumentCorners(page.previewUrl, page.width, page.height);
      setPages((currentPages) => currentPages.map((currentPage) => (
        currentPage.id === page.id
          ? { ...currentPage, corners, detecting: false }
          : currentPage
      )));
    }, []);

    const appendFiles = useCallback(async (files: File[]) => {
      const imageFiles = files.filter((file) => file.type.startsWith('image/'));
      if (imageFiles.length === 0) return;

      setPreparing(true);
      stopCamera();

      try {
        const newPages = await Promise.all(imageFiles.map(async (file): Promise<PendingPage> => {
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
        }));

        setPages((currentPages) => [...currentPages, ...newPages]);
        setActivePageId(newPages[0].id);
        setScreen('editor');
        setVisible(true);
        await Promise.all(newPages.map(detectPage));
      } catch (error) {
        console.error(error);
        alert('Não foi possível abrir uma das imagens selecionadas.');
      } finally {
        setPreparing(false);
      }
    }, [detectPage, stopCamera]);

    const handleGalleryChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      event.target.value = '';
      void appendFiles(files);
    }, [appendFiles]);

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
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
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

    useEffect(() => {
      pagesRef.current = pages;
    }, [pages]);

    useEffect(() => () => {
      stopCamera();
      pagesRef.current.forEach((page) => URL.revokeObjectURL(page.previewUrl));
    }, [stopCamera]);

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
        const file = new File([blob], `cardapio-${Date.now()}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });
        void appendFiles([file]);
      }, 'image/jpeg', 0.96);
    }, [appendFiles]);

    const activePage = pages.find((page) => page.id === activePageId) || pages[0] || null;

    const displayGeometry = useMemo(() => {
      if (!activePage || viewportSize.width <= 0 || viewportSize.height <= 0) return null;
      const scale = Math.min(
        viewportSize.width / activePage.width,
        viewportSize.height / activePage.height,
      );
      const width = activePage.width * scale;
      const height = activePage.height * scale;
      return {
        scale,
        width,
        height,
        left: (viewportSize.width - width) / 2,
        top: (viewportSize.height - height) / 2,
      };
    }, [activePage, viewportSize]);

    const updateActiveCorners = useCallback((
      updater: (corners: DocumentCorners, page: PendingPage) => DocumentCorners,
    ) => {
      if (!activePage) return;
      setPages((currentPages) => currentPages.map((page) => (
        page.id === activePage.id
          ? { ...page, corners: updater(page.corners, page) }
          : page
      )));
    }, [activePage]);

    const handleCornerPointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
      const dragging = draggingCornerRef.current;
      const viewport = editorViewportRef.current;
      if (!dragging || dragging.pointerId !== event.pointerId || !viewport || !activePage || !displayGeometry) {
        return;
      }

      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const sourceX = (event.clientX - rect.left - displayGeometry.left) / displayGeometry.scale;
      const sourceY = (event.clientY - rect.top - displayGeometry.top) / displayGeometry.scale;

      updateActiveCorners((corners, page) => ({
        ...corners,
        [dragging.name]: constrainCorner(
          dragging.name,
          { x: sourceX, y: sourceY },
          corners,
          page.width,
          page.height,
        ),
      }));
    }, [activePage, displayGeometry, updateActiveCorners]);

    const redetectActivePage = useCallback(async () => {
      if (!activePage) return;
      setPages((currentPages) => currentPages.map((page) => (
        page.id === activePage.id ? { ...page, detecting: true } : page
      )));
      await detectPage({ ...activePage, detecting: true });
    }, [activePage, detectPage]);

    const removePage = useCallback((pageId: string) => {
      setPages((currentPages) => {
        const removedIndex = currentPages.findIndex((page) => page.id === pageId);
        const removed = currentPages[removedIndex];
        if (removed) URL.revokeObjectURL(removed.previewUrl);
        const nextPages = currentPages.filter((page) => page.id !== pageId);
        setActivePageId((currentActiveId) => (
          currentActiveId === pageId
            ? nextPages[Math.min(Math.max(0, removedIndex), nextPages.length - 1)]?.id || null
            : currentActiveId
        ));
        return nextPages;
      });
    }, []);

    const addAnotherPage = useCallback(() => {
      if (isMobileDevice()) {
        setCameraError('');
        setScreen('camera');
        return;
      }
      openGallery();
    }, [openGallery]);

    const submit = useCallback(async () => {
      if (pages.length === 0 || pages.some((page) => page.detecting)) return;
      setSubmitting(true);

      try {
        const croppedFiles: File[] = [];
        for (const page of pages) {
          croppedFiles.push(await cropDocumentPage(page.file, page.previewUrl, page.corners));
        }
        await onImport(croppedFiles, mode);
        stopCamera();
        clearPages();
        setVisible(false);
      } catch (error) {
        console.error(error);
        alert(error instanceof Error ? error.message : 'Não foi possível preparar as páginas.');
      } finally {
        setSubmitting(false);
      }
    }, [clearPages, mode, onImport, pages, stopCamera]);

    const renderCamera = () => (
      <div className="fixed inset-0 z-[1000] flex flex-col overflow-hidden bg-black text-white">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/80 pointer-events-none" />

        <header
          className="relative z-10 flex items-center justify-between px-4 pb-3 pt-4"
          style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
        >
          <button
            type="button"
            onClick={close}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 backdrop-blur"
            aria-label="Fechar câmera"
          >
            <X size={24} />
          </button>
          <div className="rounded-full bg-black/50 px-4 py-2 text-sm font-bold backdrop-blur">
            Página {pages.length + 1}
          </div>
          <button
            type="button"
            onClick={openGallery}
            className="flex h-11 items-center gap-2 rounded-full bg-black/50 px-4 text-sm font-bold backdrop-blur"
          >
            <Images size={20} />
            Galeria
          </button>
        </header>

        <div className="relative z-10 mt-auto space-y-4 px-4 pb-5">
          {cameraError && (
            <div className="rounded-xl bg-red-600/90 px-4 py-3 text-center text-sm font-medium">
              {cameraError}
            </div>
          )}
          <div className="rounded-2xl bg-black/55 p-3 backdrop-blur-md">
            <ImportModeSelector value={mode} onChange={setMode} dark />
          </div>
          <div
            className="grid grid-cols-3 items-center"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <button
              type="button"
              onClick={openGallery}
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur"
              aria-label="Abrir galeria"
            >
              <Images size={24} />
            </button>
            <button
              type="button"
              onClick={capturePhoto}
              className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 shadow-xl"
              aria-label="Tirar foto"
            >
              <span className="h-16 w-16 rounded-full bg-white" />
            </button>
            {pages.length > 0 ? (
              <button
                type="button"
                onClick={() => setScreen('editor')}
                className="mx-auto flex h-12 min-w-12 items-center justify-center rounded-xl bg-white px-3 text-sm font-bold text-slate-950"
              >
                Revisar ({pages.length})
              </button>
            ) : <span />}
          </div>
        </div>
      </div>
    );

    const renderEditor = () => {
      const cornerLabels: Record<CornerName, string> = {
        topLeft: 'Canto superior esquerdo',
        topRight: 'Canto superior direito',
        bottomRight: 'Canto inferior direito',
        bottomLeft: 'Canto inferior esquerdo',
      };

      return (
        <div className="fixed inset-0 z-[1000] flex flex-col bg-slate-950 text-white">
          <header
            className="flex flex-none items-center gap-3 border-b border-white/10 bg-slate-950 px-3 py-3"
            style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
          >
            <button
              type="button"
              onClick={close}
              disabled={submitting}
              className="flex h-10 w-10 flex-none items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-40"
              aria-label="Fechar editor"
            >
              <X size={23} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-bold">
                <ScanLine size={19} className="text-indigo-400" />
                Ajustar página
              </div>
              <p className="truncate text-xs text-slate-400">
                Arraste os quatro cantos até as bordas do cardápio
              </p>
            </div>
            <div className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold">
              {pages.findIndex((page) => page.id === activePage?.id) + 1}/{pages.length}
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <aside className="order-2 flex flex-none gap-2 overflow-x-auto border-t border-white/10 bg-slate-900 p-2 md:order-1 md:w-28 md:flex-col md:overflow-y-auto md:border-r md:border-t-0">
              {pages.map((page, index) => (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => setActivePageId(page.id)}
                  className={`relative h-20 w-16 flex-none overflow-hidden rounded-lg border-2 md:h-28 md:w-full ${
                    page.id === activePage?.id ? 'border-indigo-400' : 'border-transparent'
                  }`}
                >
                  <img src={page.previewUrl} alt={`Página ${index + 1}`} className="h-full w-full object-cover" />
                  <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold">
                    {index + 1}
                  </span>
                  {page.detecting && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/55">
                      <Loader2 size={18} className="animate-spin" />
                    </span>
                  )}
                </button>
              ))}
              <button
                type="button"
                onClick={addAnotherPage}
                disabled={submitting}
                className="flex h-20 w-16 flex-none flex-col items-center justify-center rounded-lg border border-dashed border-white/30 text-[10px] font-bold text-slate-300 hover:border-indigo-400 hover:text-white md:h-24 md:w-full"
              >
                <ImagePlus size={22} />
                Adicionar
              </button>
            </aside>

            <main className="order-1 flex min-h-0 flex-1 flex-col md:order-2">
              <div ref={editorViewportRef} className="relative min-h-0 flex-1 overflow-hidden bg-black">
                {activePage && displayGeometry && (
                  <>
                    <img
                      src={activePage.previewUrl}
                      alt="Página para recorte"
                      draggable={false}
                      className="absolute select-none"
                      style={{
                        left: displayGeometry.left,
                        top: displayGeometry.top,
                        width: displayGeometry.width,
                        height: displayGeometry.height,
                      }}
                    />
                    <svg
                      className="absolute pointer-events-none"
                      style={{
                        left: displayGeometry.left,
                        top: displayGeometry.top,
                        width: displayGeometry.width,
                        height: displayGeometry.height,
                      }}
                      viewBox={`0 0 ${activePage.width} ${activePage.height}`}
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <defs>
                        <mask id={`scanner-mask-${activePage.id}`}>
                          <rect width={activePage.width} height={activePage.height} fill="white" />
                          <polygon
                            points={[
                              activePage.corners.topLeft,
                              activePage.corners.topRight,
                              activePage.corners.bottomRight,
                              activePage.corners.bottomLeft,
                            ].map((point) => `${point.x},${point.y}`).join(' ')}
                            fill="black"
                          />
                        </mask>
                      </defs>
                      <rect
                        width={activePage.width}
                        height={activePage.height}
                        fill="rgba(0,0,0,0.58)"
                        mask={`url(#scanner-mask-${activePage.id})`}
                      />
                      <polygon
                        points={[
                          activePage.corners.topLeft,
                          activePage.corners.topRight,
                          activePage.corners.bottomRight,
                          activePage.corners.bottomLeft,
                        ].map((point) => `${point.x},${point.y}`).join(' ')}
                        fill="none"
                        stroke="#818cf8"
                        strokeWidth={Math.max(3, 4 / displayGeometry.scale)}
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>

                    {(Object.keys(activePage.corners) as CornerName[]).map((cornerName) => {
                      const point = activePage.corners[cornerName];
                      return (
                        <button
                          key={cornerName}
                          type="button"
                          aria-label={cornerLabels[cornerName]}
                          className="absolute z-10 h-11 w-11 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-4 border-white bg-indigo-500 shadow-[0_0_0_2px_rgba(79,70,229,0.9),0_4px_12px_rgba(0,0,0,0.5)]"
                          style={{
                            left: displayGeometry.left + (point.x * displayGeometry.scale),
                            top: displayGeometry.top + (point.y * displayGeometry.scale),
                          }}
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            draggingCornerRef.current = { name: cornerName, pointerId: event.pointerId };
                            event.currentTarget.setPointerCapture(event.pointerId);
                          }}
                          onPointerMove={handleCornerPointerMove}
                          onPointerUp={(event) => {
                            if (draggingCornerRef.current?.pointerId === event.pointerId) {
                              draggingCornerRef.current = null;
                            }
                            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                              event.currentTarget.releasePointerCapture(event.pointerId);
                            }
                          }}
                          onPointerCancel={() => {
                            draggingCornerRef.current = null;
                          }}
                        />
                      );
                    })}
                  </>
                )}

                {(preparing || activePage?.detecting) && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45">
                    <div className="flex items-center gap-2 rounded-full bg-slate-950/90 px-4 py-2 text-sm font-bold">
                      <Loader2 size={18} className="animate-spin text-indigo-400" />
                      Detectando bordas...
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-none items-center justify-between gap-2 border-t border-white/10 bg-slate-900 px-3 py-2">
                <button
                  type="button"
                  onClick={() => void redetectActivePage()}
                  disabled={!activePage || activePage.detecting || submitting}
                  className="flex h-10 items-center gap-2 rounded-lg bg-white/10 px-3 text-xs font-bold hover:bg-white/15 disabled:opacity-40"
                >
                  <RotateCcw size={16} />
                  Detectar novamente
                </button>
                <button
                  type="button"
                  onClick={() => activePage && removePage(activePage.id)}
                  disabled={pages.length <= 1 || submitting}
                  className="flex h-10 items-center gap-2 rounded-lg px-3 text-xs font-bold text-red-300 hover:bg-red-500/10 disabled:opacity-30"
                >
                  <Trash2 size={16} />
                  Excluir
                </button>
              </div>
            </main>
          </div>

          <footer
            className="flex-none space-y-3 border-t border-white/10 bg-white p-3 text-slate-900"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <ImportModeSelector value={mode} onChange={setMode} />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={addAnotherPage}
                disabled={submitting}
                className="flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-700 disabled:opacity-40"
              >
                <ImagePlus size={18} />
                Inserir mais páginas
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={pages.length === 0 || pages.some((page) => page.detecting) || submitting}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-bold text-white shadow-lg disabled:opacity-50"
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                {submitting ? 'Importando...' : `Enviar ${pages.length} página${pages.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </footer>
        </div>
      );
    };

    return createPortal(
      <>
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleGalleryChange}
        />
        {visible && (screen === 'camera' ? renderCamera() : renderEditor())}
      </>,
      document.body,
    );
  },
);

MenuImportFlow.displayName = 'MenuImportFlow';
