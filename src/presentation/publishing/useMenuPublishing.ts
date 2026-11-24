import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getErrorMessage } from '../../application/errorMessages';
import type { AuthSession } from '../../application/account/authGateway';
import type { WorkspaceMenuContent } from '../../application/workspace/workspaceGateway';
import { getMenuContentSignature } from '../../application/workspace/state';
import type { LoadedWorkspaceData, MenuPublication } from '../../domain/workspace/model';
import type { PdfExportResult } from '../../infrastructure/browser/pdfExport';
import { copyText, createQrCodeBlob, downloadBlob, downloadJpgFiles, shareFiles } from '../../infrastructure/browser/shareFiles';
import { useAppServices } from '../app/AppServicesProvider';
import type { CanvasFileExports } from '../menu/designer/useCanvasFileExports';
import { useButtonFeedback } from './useButtonFeedback';
import { getExpectedPublicationUrl, getPublicationUrl } from './publicationUrl';

type PrintRequestMode = 'download' | 'publish' | 'publish-silent';
type PublishLinkAction = 'copy-link' | 'share-link' | 'download-qr' | 'share-qr' | 'open-link';
export type PublishAction = PublishLinkAction | 'publish' | 'download-pdf' | 'share-pdf' | 'download-jpg' | 'share-jpg' | 'save-slug';
export type JpgAction = 'download' | 'share';
export type PublishOptions = { pdf: boolean; jpgPages: number[] | null; virtualLink: boolean };

interface PublicationJob {
  menuId: string;
  requestId?: number;
  promise: Promise<MenuPublication>;
  resolve: (publication: MenuPublication) => void;
  reject: (error: unknown) => void;
}

interface MenuPublishingOptions extends WorkspaceMenuContent {
  session: AuthSession | null;
  workspaceData: LoadedWorkspaceData | null;
  forceSaveCurrentMenu: () => Promise<void>;
  setLoadError: (message: string | null) => void;
}

export function useMenuPublishing({ session, workspaceData, forceSaveCurrentMenu, setLoadError, products, style, sortOption }: MenuPublishingOptions) {
  const { publications: { getMenuPublication, publishWorkspaceMenu, updatePublicationMenuSlug, updatePortablePublicationMenuSlug } } = useAppServices();
  const [{ id: printRequestId, mode: printRequestMode }, setPrintRequest] = useState<{ id: number; mode: PrintRequestMode }>({ id: 0, mode: 'download' });
  const lastPrintRequestId = useRef(0);
  const [publication, setPublication] = useState<MenuPublication | null>(null);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [busyActions, setBusyActions] = useState<ReadonlySet<PublishAction>>(() => new Set());
  const actionsInProgress = useRef(new Set<PublishAction>());
  const [publishFeedback, setPublishFeedback] = useState<string | null>(null);
  const publicationJob = useRef<PublicationJob | null>(null);
  const publishFeedbackTimeoutRef = useRef<number | null>(null);
  const { results: buttonResults, show: showButtonResult } = useButtonFeedback();
  const fileExportRef = useRef<CanvasFileExports>(null);

  useEffect(() => () => {
    if (publishFeedbackTimeoutRef.current) window.clearTimeout(publishFeedbackTimeoutRef.current);
  }, []);

  useEffect(() => {
    const menuId = workspaceData?.menu.id;
    if (!menuId) {
      setPublication(null);
      return;
    }
    let cancelled = false;
    setPublication(null);
    void getMenuPublication(menuId)
      .then((result) => { if (!cancelled) setPublication(result); })
      .catch((error) => { if (!cancelled) setLoadError(getErrorMessage(error, 'Falha ao carregar publicação.')); });
    return () => { cancelled = true; };
  }, [getMenuPublication, setLoadError, workspaceData?.menu.id]);

  const contentSignature = useMemo(
    () => getMenuContentSignature(products, style, sortOption),
    [products, style, sortOption],
  );
  const hasPublishedChanges = Boolean(publication && publication.contentSignature !== contentSignature);

  useEffect(() => {
    if (!publication) return;
    void createQrCodeBlob(getPublicationUrl(publication)).catch(() => undefined);
  }, [publication?.id, publication?.menuSlug, publication?.portableSnapshotUrl, publication?.updatedAt]);

  const showPublishFeedback = useCallback((message: string) => {
    if (publishFeedbackTimeoutRef.current) window.clearTimeout(publishFeedbackTimeoutRef.current);
    setPublishFeedback(message);
    publishFeedbackTimeoutRef.current = window.setTimeout(() => setPublishFeedback(null), 2200);
  }, []);

  const requestPrint = (mode: PrintRequestMode = 'download') => {
    const id = ++lastPrintRequestId.current;
    setPrintRequest({ id, mode });
    return id;
  };

  const runAction = async (action: PublishAction, run: () => Promise<void>, fallback: string) => {
    const actions = actionsInProgress.current;
    if (actions.has(action)) return;
    actions.add(action);
    setBusyActions(new Set(actions));
    setLoadError(null);
    try {
      await run();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setLoadError(getErrorMessage(error, fallback));
    } finally {
      actions.delete(action);
      setBusyActions(new Set(actions));
    }
  };

  const clearPublicationJob = useCallback((job: PublicationJob) => {
    if (publicationJob.current !== job) return false;
    publicationJob.current = null;
    setIsPublishing(false);
    return true;
  }, []);

  const cancelPublication = useCallback((job: PublicationJob) => {
    if (clearPublicationJob(job)) job.reject(new DOMException('Publicação cancelada.', 'AbortError'));
  }, [clearPublicationJob]);

  const menuId = workspaceData?.menu.id;
  useEffect(() => () => {
    const job = publicationJob.current;
    if (job && job.menuId === menuId) cancelPublication(job);
  }, [cancelPublication, menuId]);

  const getOrStartPublication = (pdfOptions = false) => {
    const pending = publicationJob.current;
    if (pending && pending.menuId === menuId) return pending.promise;
    if (!menuId || !session) return Promise.reject(new Error('O cardápio ainda está carregando.'));

    let resolve!: PublicationJob['resolve'];
    let reject!: PublicationJob['reject'];
    const promise = new Promise<MenuPublication>((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    const job: PublicationJob = { menuId, promise, resolve, reject };
    publicationJob.current = job;
    setIsPublishing(true);
    void forceSaveCurrentMenu()
      .then(() => {
        if (publicationJob.current === job) job.requestId = requestPrint(pdfOptions ? 'publish' : 'publish-silent');
      })
      .catch(error => {
        if (clearPublicationJob(job)) job.reject(error);
      });
    return promise;
  };

  const performPublishedLinkAction = useCallback(async (
    published: MenuPublication,
    action: PublishLinkAction,
  ) => {
    const url = getPublicationUrl(published);
    const qrFilename = `qrcode-${published.menuSlug || 'cardapio'}.png`;

    if (action === 'open-link') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (action === 'copy-link') {
      await copyText(url);
      showButtonResult(action, 'Copiado');
      return;
    }

    if (action === 'share-link') {
      if (navigator.share) {
        try {
          await navigator.share({ title: published.pdfFilename.replace(/\.pdf$/i, ''), url });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }
        }
      }
      await copyText(url);
      showButtonResult(action, 'Copiado');
      return;
    }

    const qrBlob = await createQrCodeBlob(url);
    if (action === 'share-qr') {
      const file = new File([qrBlob], qrFilename, { type: 'image/png' });
      try {
        if (await shareFiles('QR code do cardápio', [file])) return;
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'NotAllowedError')) throw error;
      }
    }
    downloadBlob(qrBlob, qrFilename);
    showButtonResult(action, 'Baixado');
  }, [showButtonResult]);

  const handleLinkAction = (action: PublishLinkAction) => runAction(action, async () => {
    const published = publication ?? await getOrStartPublication();
    await performPublishedLinkAction(published, action);
  }, 'Não foi possível concluir a ação.');

  const getFileExports = () => {
    if (!fileExportRef.current) throw new Error('O cardápio ainda está carregando.');
    return fileExportRef.current;
  };

  const preparePdf = useCallback(() => {
    if (fileExportRef.current) void Promise.resolve(fileExportRef.current.pdf()).catch(() => undefined);
  }, []);

  const prepareJpg = useCallback((indexes: readonly number[]) => {
    if (fileExportRef.current && indexes.length) void Promise.resolve(fileExportRef.current.jpg(indexes)).catch(() => undefined);
  }, []);

  const exportJpg = async (action: JpgAction, indexes: number[]) => {
    const prepared = getFileExports().jpg(indexes);
    const files = prepared instanceof Promise ? await prepared : prepared;
    const title = files[0].name.replace(/-pagina-\d+\.jpg$/i, '');
    if (action === 'share') {
      try {
        if (!await shareFiles(title, files)) throw new Error('Este navegador não permite compartilhar arquivos JPG.');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          setLoadError('O navegador bloqueou o compartilhamento de arquivos JPG.');
          return;
        }
        throw error;
      }
      return;
    }
    await downloadJpgFiles(files, title);
    showButtonResult('download-jpg', 'Baixado');
  };

  const handleJpgAction = (action: JpgAction, indexes: number[]) => runAction(
    action === 'download' ? 'download-jpg' : 'share-jpg',
    () => exportJpg(action, indexes),
    'Não foi possível exportar as imagens JPG.',
  );

  const handlePublishConfirm = async ({ pdf, jpgPages, virtualLink }: PublishOptions) => {
    if (!pdf && !virtualLink) {
      if (jpgPages) await handleJpgAction('download', jpgPages);
      return;
    }
    if (jpgPages) void handleJpgAction('download', jpgPages);
    if (!virtualLink) {
      setIsPublishOpen(false);
      requestPrint('download');
      return;
    }
    if (!workspaceData || publicationJob.current || actionsInProgress.current.has('save-slug')) return;

    const publishingStartedAt = Date.now();
    const canonicalUrl = publication
      ? getPublicationUrl(publication).split('?')[0]
      : getExpectedPublicationUrl({
          restaurantSlug: workspaceData.workspace.slug,
          menuName: workspaceData.menu.name,
          menuId: workspaceData.menu.id,
        });
    const loadingUrl = new URL(canonicalUrl);
    loadingUrl.searchParams.set('publishing', String(publishingStartedAt));
    if (publication?.updatedAt) loadingUrl.searchParams.set('previousPublication', publication.updatedAt);
    window.open(loadingUrl.toString(), '_blank', 'noopener,noreferrer');

    await runAction('publish', async () => {
      await getOrStartPublication(pdf);
      showPublishFeedback('Link publicado');
    }, 'Falha ao publicar cardápio.');
  };

  const handlePdfAction = async (action: 'options' | 'download' | 'share') => {
    setLoadError(null);
    if (action === 'options') {
      requestPrint('download');
      return;
    }
    await runAction(action === 'download' ? 'download-pdf' : 'share-pdf', async () => {
      const prepared = getFileExports().pdf();
      const result = prepared instanceof Promise ? await prepared : prepared;
      if (action === 'share') {
        const file = new File([result.blob], result.filename, { type: 'application/pdf' });
        try {
          if (await shareFiles(result.filename.replace(/\.pdf$/i, ''), [file])) return;
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'NotAllowedError')) throw error;
        }
      }
      downloadBlob(result.blob, result.filename);
      showButtonResult(action === 'download' ? 'download-pdf' : 'share-pdf', 'Baixado');
    }, 'Não foi possível exportar o PDF.');
  };

  const handlePublicationSlugChange = async (menuSlug: string) => {
    if (!publication || publicationJob.current || menuSlug.trim() === publication.menuSlug) return;
    await runAction('save-slug', async () => {
      const updated = publication.portableSnapshotUrl
        ? updatePortablePublicationMenuSlug(publication, menuSlug)
        : await updatePublicationMenuSlug({ publicationId: publication.id, menuSlug });
      setPublication(updated);
      showPublishFeedback('Endereço atualizado');
    }, 'Não foi possível atualizar o endereço.');
  };

  const handlePrintComplete = async (result: PdfExportResult, requestId: number) => {
    const job = publicationJob.current;
    if (!job || job.requestId !== requestId || job.menuId !== workspaceData?.menu.id || !session) return;
    try {
      const published = await publishWorkspaceMenu({
        workspace: workspaceData.workspace,
        menu: workspaceData.menu,
        userId: session.user.id,
        products,
        style,
        sortOption,
        pdfBlob: result.blob,
        pdfFilename: result.filename,
        pdfOptions: {},
      });
      if (!clearPublicationJob(job)) return;
      setPublication(published);
      job.resolve(published);
    } catch (error) {
      if (clearPublicationJob(job)) job.reject(error);
    }
  };

  const handlePrintError = (error: unknown, requestId: number) => {
    const job = publicationJob.current;
    if (job?.requestId === requestId && clearPublicationJob(job)) job.reject(error);
  };

  const handlePrintCancel = (requestId: number) => {
    const job = publicationJob.current;
    if (job?.requestId === requestId) cancelPublication(job);
  };

  return {
    printRequestId, printRequestMode, publication, isPublishOpen, setIsPublishOpen, isPublishing, busyActions,
    publishFeedback, buttonResults, fileExportRef, hasPublishedChanges, requestPrint,
    preparePdf, prepareJpg, handleLinkAction, handlePublishConfirm, handlePdfAction, handleJpgAction,
    handlePublicationSlugChange, handlePrintComplete, handlePrintError, handlePrintCancel,
  };
}
