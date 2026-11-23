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
type PublishAction = PublishLinkAction | 'publish' | 'download-pdf' | 'share-pdf' | 'download-jpg' | 'share-jpg' | 'save-slug' | null;
export type JpgAction = 'download' | 'share';
export type PublishOptions = { pdf: boolean; jpgPages: number[] | null; virtualLink: boolean };

interface MenuPublishingOptions extends WorkspaceMenuContent {
  session: AuthSession | null;
  workspaceData: LoadedWorkspaceData | null;
  forceSaveCurrentMenu: () => Promise<void>;
  setLoadError: (message: string | null) => void;
}

export function useMenuPublishing({ session, workspaceData, forceSaveCurrentMenu, setLoadError, products, style, sortOption }: MenuPublishingOptions) {
  const { publications: { getMenuPublication, publishWorkspaceMenu, updatePublicationMenuSlug, updatePortablePublicationMenuSlug } } = useAppServices();
  const [printRequestId, setPrintRequestId] = useState(0);
  const [printRequestMode, setPrintRequestMode] = useState<PrintRequestMode>('download');
  const [publication, setPublication] = useState<MenuPublication | null>(null);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishAction, setPublishAction] = useState<PublishAction>(null);
  const [publishFeedback, setPublishFeedback] = useState<string | null>(null);
  const pendingPublishActionRef = useRef<PublishLinkAction | null>(null);
  const publishFeedbackTimeoutRef = useRef<number | null>(null);
  const { results: buttonResults, show: showButtonResult } = useButtonFeedback();
  const fileExportRef = useRef<CanvasFileExports>(null);

  useEffect(() => {
    const resetPublishingState = () => {
      setIsPublishing(false);
      setPrintRequestMode('download');
      setPublishAction(null);
      pendingPublishActionRef.current = null;
    };
    window.addEventListener('pageshow', resetPublishingState);
    return () => window.removeEventListener('pageshow', resetPublishingState);
  }, []);

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
    setPrintRequestMode(mode);
    setPrintRequestId((prev) => prev + 1);
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

  const handleLinkAction = async (action: PublishLinkAction) => {
    setPublishAction(action);
    setLoadError(null);

    if (publication) {
      try {
        await performPublishedLinkAction(publication, action);
      } catch (error) {
        setLoadError(getErrorMessage(error, 'Não foi possível concluir a ação.'));
      } finally {
        setPublishAction(null);
      }
      return;
    }

    pendingPublishActionRef.current = action;
    setIsPublishing(true);
    try {
      await forceSaveCurrentMenu();
      requestPrint('publish-silent');
    } catch (error) {
      pendingPublishActionRef.current = null;
      setPublishAction(null);
      setIsPublishing(false);
      setLoadError(getErrorMessage(error, 'Falha ao preparar a publicação.'));
    }
  };

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
      if (!await shareFiles(title, files)) throw new Error('Este navegador não permite compartilhar arquivos JPG.');
      return;
    }
    await downloadJpgFiles(files, title);
    showButtonResult('download-jpg', 'Baixado');
  };

  const handleJpgAction = async (action: JpgAction, indexes: number[]) => {
    setPublishAction(action === 'download' ? 'download-jpg' : 'share-jpg');
    setLoadError(null);
    try {
      await exportJpg(action, indexes);
    } catch (error) {
      setLoadError(error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'O navegador bloqueou o compartilhamento de arquivos JPG.'
        : getErrorMessage(error, 'Não foi possível exportar as imagens JPG.'));
    } finally {
      setPublishAction(null);
    }
  };

  const handlePublishConfirm = async ({ pdf, jpgPages, virtualLink }: PublishOptions) => {
    if (!pdf && !virtualLink) {
      if (jpgPages) await handleJpgAction('download', jpgPages);
      return;
    }
    if (jpgPages) void exportJpg('download', jpgPages).catch(error => {
      setLoadError(getErrorMessage(error, 'Não foi possível baixar as imagens JPG.'));
    });
    if (!virtualLink) {
      setIsPublishOpen(false);
      requestPrint('download');
      return;
    }
    if (!workspaceData) return;

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

    pendingPublishActionRef.current = null;
    setPublishAction('publish');
    setIsPublishing(true);
    setLoadError(null);
    try {
      await forceSaveCurrentMenu();
      requestPrint(pdf ? 'publish' : 'publish-silent');
    } catch (error) {
      setPublishAction(null);
      setIsPublishing(false);
      setLoadError(getErrorMessage(error, 'Falha ao preparar a publicação.'));
    }
  };

  const handlePdfAction = async (action: 'options' | 'download' | 'share') => {
    setLoadError(null);
    if (action === 'options') {
      requestPrint('download');
      return;
    }
    setPublishAction(action === 'download' ? 'download-pdf' : 'share-pdf');

    try {
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
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Não foi possível exportar o PDF.'));
    } finally {
      setPublishAction(null);
    }
  };

  const handlePublicationSlugChange = async (menuSlug: string) => {
    if (!publication || menuSlug.trim() === publication.menuSlug) return;
    setPublishAction('save-slug');
    setLoadError(null);
    try {
      const updated = publication.portableSnapshotUrl
        ? updatePortablePublicationMenuSlug(publication, menuSlug)
        : await updatePublicationMenuSlug({ publicationId: publication.id, menuSlug });
      setPublication(updated);
      showPublishFeedback('Endereço atualizado');
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Não foi possível atualizar o endereço.'));
    } finally {
      setPublishAction(null);
    }
  };

  const handlePrintComplete = async (result: PdfExportResult) => {
    if (printRequestMode !== 'publish' && printRequestMode !== 'publish-silent') return;
    if (!workspaceData || !session) {
      pendingPublishActionRef.current = null;
      setPublishAction(null);
      setIsPublishing(false);
      return;
    }
    let published: MenuPublication;
    try {
      published = await publishWorkspaceMenu({
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
      setPublication(published);
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Falha ao publicar cardápio.'));
      pendingPublishActionRef.current = null;
      setPublishAction(null);
      setIsPublishing(false);
      setPrintRequestMode('download');
      return;
    }

    const pendingAction = pendingPublishActionRef.current;
    pendingPublishActionRef.current = null;
    setIsPublishing(false);
    setPrintRequestMode('download');
    if (!pendingAction) {
      setPublishAction(null);
      showPublishFeedback('Link publicado');
      return;
    }

    try {
      await performPublishedLinkAction(published, pendingAction);
    } catch (error) {
      setLoadError(getErrorMessage(error, 'O link foi publicado, mas a ação não foi concluída.'));
    } finally {
      setPublishAction(null);
    }
  };

  const handlePrintError = (error: unknown) => {
    if (printRequestMode === 'publish' || printRequestMode === 'publish-silent') {
      setIsPublishing(false);
      pendingPublishActionRef.current = null;
    }
    setPublishAction(null);
    setPrintRequestMode('download');
    setLoadError(getErrorMessage(error, 'Falha ao gerar o PDF.'));
  };
  const handlePrintCancel = () => {
    setIsPublishing(false);
    setPublishAction(null);
    pendingPublishActionRef.current = null;
    setPrintRequestMode('download');
  };

  return {
    printRequestId, printRequestMode, publication, isPublishOpen, setIsPublishOpen, isPublishing, publishAction,
    publishFeedback, buttonResults, fileExportRef, hasPublishedChanges, requestPrint,
    preparePdf, prepareJpg, handleLinkAction, handlePublishConfirm, handlePdfAction, handleJpgAction,
    handlePublicationSlugChange, handlePrintComplete, handlePrintError, handlePrintCancel,
  };
}
