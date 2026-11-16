import React from 'react';
import { Loader2 } from 'lucide-react';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { loadPublicMenuPublication } from '../services/workspaceService';
import type { MenuPublication } from '../types';

type PdfDocumentLike = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<any>;
  destroy: () => Promise<void>;
};

const waitForRetry = (signal: AbortSignal, milliseconds: number) => new Promise<void>((resolve, reject) => {
  const timeout = window.setTimeout(resolve, milliseconds);
  signal.addEventListener('abort', () => {
    window.clearTimeout(timeout);
    reject(new DOMException('Aborted', 'AbortError'));
  }, { once: true });
});

const MobilePdfPage: React.FC<{ document: PdfDocumentLike; pageNumber: number }> = ({ document, pageNumber }) => {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [page, setPage] = React.useState<any>(null);
  const [width, setWidth] = React.useState(0);
  const [visible, setVisible] = React.useState(false);
  const [aspectRatio, setAspectRatio] = React.useState(210 / 297);

  React.useEffect(() => {
    let cancelled = false;
    void document.getPage(pageNumber).then((loadedPage) => {
      if (cancelled) return;
      const viewport = loadedPage.getViewport({ scale: 1 });
      setAspectRatio(viewport.width / viewport.height);
      setPage(loadedPage);
    });
    return () => { cancelled = true; };
  }, [document, pageNumber]);

  React.useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const resizeObserver = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true);
    }, { rootMargin: '700px 0px' });
    resizeObserver.observe(wrapper);
    intersectionObserver.observe(wrapper);
    return () => {
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, []);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!page || !canvas || !visible || width <= 0) return;
    const baseViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / baseViewport.width });
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    const renderTask = page.render({
      canvas,
      canvasContext: context,
      viewport,
      transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
    });
    void renderTask.promise.catch((error: unknown) => {
      if ((error as Error).name !== 'RenderingCancelledException') console.error(error);
    });
    return () => renderTask.cancel();
  }, [page, visible, width]);

  return (
    <div ref={wrapperRef} className="relative w-full overflow-hidden bg-white shadow-sm" style={{ aspectRatio }}>
      {!visible && <div className="absolute inset-0 animate-pulse bg-slate-100" />}
      <canvas ref={canvasRef} className="block max-w-full" aria-label={`Página ${pageNumber}`} />
    </div>
  );
};

const MobilePdfViewer: React.FC<{ bytes: ArrayBuffer }> = ({ bytes }) => {
  const [document, setDocument] = React.useState<PdfDocumentLike | null>(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    let loadedDocument: PdfDocumentLike | null = null;
    let loadingTask: { promise: Promise<PdfDocumentLike>; destroy: () => Promise<void> } | null = null;
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }) as unknown as typeof loadingTask;
        loadedDocument = await loadingTask!.promise;
        if (!cancelled) setDocument(loadedDocument);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
      void loadedDocument?.destroy();
    };
  }, [bytes]);

  if (error) return <div className="flex min-h-dvh items-center justify-center p-6 text-center text-sm text-slate-500">Não foi possível renderizar este PDF.</div>;
  if (!document) return <div className="flex min-h-dvh items-center justify-center"><Loader2 className="animate-spin text-indigo-600" size={28} /></div>;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 bg-slate-200 p-2.5">
      {Array.from({ length: document.numPages }, (_, index) => (
        <MobilePdfPage key={index + 1} document={document} pageNumber={index + 1} />
      ))}
    </div>
  );
};

export const PublicMenuPage: React.FC = () => {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const restaurantSlug = decodeURIComponent(parts[1] || '');
  const menuSlug = decodeURIComponent(parts[2] || '');
  const query = React.useMemo(() => new URLSearchParams(window.location.search), []);
  const portableSnapshotUrl = query.get('source');
  const publishingStartedAt = Number(query.get('publishing') || 0);
  const previousPublicationUpdatedAt = query.get('previousPublication');
  const [publication, setPublication] = React.useState<MenuPublication | null>(null);
  const [inlinePdfUrl, setInlinePdfUrl] = React.useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = React.useState<ArrayBuffer | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isMobile, setIsMobile] = React.useState(() => window.matchMedia('(max-width: 767px)').matches);

  React.useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobile(media.matches);
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void (async () => {
      try {
        let result: Awaited<ReturnType<typeof loadPublicMenuPublication>> = null;
        const deadline = Date.now() + 90_000;
        do {
          result = await loadPublicMenuPublication({ restaurantSlug, menuSlug, portableSnapshotUrl });
          const isNewPublication = Boolean(
            result?.publication.pdfUrl
            && (!previousPublicationUpdatedAt || result.publication.updatedAt !== previousPublicationUpdatedAt),
          );
          if (!publishingStartedAt || isNewPublication) break;
          await waitForRetry(controller.signal, 900);
        } while (Date.now() < deadline);

        if (!result?.publication.pdfUrl) {
          setError('Cardápio não encontrado.');
          return;
        }
        setPublication(result.publication);
        document.title = result.publication.pdfFilename.replace(/\.pdf$/i, '') || 'Cardápio';

        const response = await fetch(result.publication.pdfUrl, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Falha ao carregar PDF');
        const bytes = await response.arrayBuffer();
        setPdfBytes(bytes);
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        setInlinePdfUrl(objectUrl);
      } catch (loadError) {
        if ((loadError as Error).name !== 'AbortError') setError('Não foi possível abrir este cardápio.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [menuSlug, portableSnapshotUrl, previousPublicationUpdatedAt, publishingStartedAt, restaurantSlug]);

  if (loading) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-slate-100">
        <Loader2 className="animate-spin text-indigo-600" size={28} />
        {publishingStartedAt > 0 && <p className="text-sm font-medium text-slate-500">Publicando cardápio...</p>}
      </div>
    );
  }

  if (!publication?.pdfUrl || !pdfBytes) {
    return (
      <div className="flex h-dvh items-center justify-center bg-slate-100 p-6">
        <div className="rounded-3xl bg-white p-8 text-center shadow-xl">
          <h1 className="font-bold text-slate-900">Cardápio indisponível</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="h-dvh w-screen overflow-auto bg-slate-200">
      {isMobile ? (
        <MobilePdfViewer bytes={pdfBytes} />
      ) : (
        <iframe
          title="Cardápio em PDF"
          src={`${inlinePdfUrl || publication.pdfUrl}#view=Fit&zoom=page-fit&toolbar=0&navpanes=0`}
          className="block h-full w-full border-0 bg-white"
        />
      )}
    </main>
  );
};
