import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getErrorMessage } from '../../application/errorMessages';
import type { AuthSession } from '../../application/account/authGateway';
import type { WorkspaceMenuContent } from '../../application/workspace/workspaceGateway';
import { getMenuContentSignature } from '../../application/workspace/state';
import type { LoadedWorkspaceData, MenuPublication } from '../../domain/workspace/model';
import type { PdfExportResult } from '../../infrastructure/browser/pdfExport';
import { copyText, createQrCodeBlob, downloadBlob } from '../../infrastructure/browser/shareFiles';
import { useAppServices } from '../app/AppServicesProvider';
import { getExpectedPublicationUrl, getPublicationUrl } from './publicationUrl';

type PrintRequestMode = 'download' | 'download-direct' | 'share-direct' | 'publish' | 'publish-silent';
type PublishLinkAction = 'copy-link' | 'share-link' | 'download-qr' | 'share-qr' | 'open-link';
type PublishAction = PublishLinkAction | 'publish' | 'pdf-options' | 'download-pdf' | 'share-pdf' | 'save-slug' | null;
type CachedPdfExport = {
  contentSignature: string;
  result: PdfExportResult;
};

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
  const cachedPdfExportRef = useRef<CachedPdfExport | null>(null);
  const pendingPrintContentSignatureRef = useRef<string | null>(null);
  const currentContentSignatureRef = useRef('');

  useEffect(() => {
    const resetPublishingState = () => {
      setIsPublishing(false);
      setPrintRequestMode('download');
      setPublishAction(null);
      pendingPublishActionRef.current = null;
      pendingPrintContentSignatureRef.current = null;
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
  currentContentSignatureRef.current = contentSignature;
  const hasPublishedChanges = Boolean(publication && publication.contentSignature !== contentSignature);

  useEffect(() => {
    if (cachedPdfExportRef.current?.contentSignature !== contentSignature) {
      cachedPdfExportRef.current = null;
    }
    if (pendingPrintContentSignatureRef.current
      && pendingPrintContentSignatureRef.current !== contentSignature) {
      pendingPrintContentSignatureRef.current = null;
    }
  }, [contentSignature]);

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
    pendingPrintContentSignatureRef.current = contentSignature;
    setPrintRequestMode(mode);
    setPrintRequestId((prev) => prev + 1);
  };

  const performPublishedLinkAction = useCallback(async (
    published: MenuPublication,
    action: PublishLinkAction,
    afterPublish = false,
  ) => {
    const url = getPublicationUrl(published);
    const qrFilename = `qrcode-${published.menuSlug || 'cardapio'}.png`;

    if (action === 'open-link') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (action === 'copy-link') {
      await copyText(url);
      showPublishFeedback('Copiado');
      return;
    }

    if (action === 'share-link') {
      if (navigator.share) {
        try {
          await navigator.share({ title: published.pdfFilename.replace(/\.pdf$/i, ''), url });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            if (afterPublish) showPublishFeedback('Link publicado');
            return;
          }
          if (afterPublish && error instanceof DOMException && error.name === 'NotAllowedError') {
            showPublishFeedback('Publicado. Toque novamente para compartilhar.');
            return;
          }
        }
      }
      await copyText(url);
      showPublishFeedback('Link copiado');
      return;
    }

    const qrBlob = await createQrCodeBlob(url);
    if (action === 'share-qr') {
      const file = new File([qrBlob], qrFilename, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ title: 'QR code do cardápio', files: [file] });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            if (afterPublish) showPublishFeedback('Link publicado');
            return;
          }
          if (afterPublish && error instanceof DOMException && error.name === 'NotAllowedError') {
            showPublishFeedback('Publicado. Toque novamente para compartilhar o QR.');
            return;
          }
        }
      }
    }
    downloadBlob(qrBlob, qrFilename);
    showPublishFeedback('QR code baixado');
  }, [showPublishFeedback]);

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

  const handlePublishConfirm = async ({ pdf, virtualLink }: { pdf: boolean; virtualLink: boolean }) => {
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

  const sharePdfResult = async (result: PdfExportResult, generatedAfterClick: boolean) => {
    const file = new File([result.blob], result.filename, { type: 'application/pdf' });
    const webShareNavigator = navigator as unknown as {
      share?: Navigator['share'];
      canShare?: Navigator['canShare'];
    };
    let canUseFileShare = false;
    try {
      canUseFileShare = Boolean(
        webShareNavigator.share
        && (!webShareNavigator.canShare || webShareNavigator.canShare({ files: [file] }))
      );
    } catch {
      canUseFileShare = false;
    }

    if (!canUseFileShare) {
      downloadBlob(result.blob, result.filename);
      showPublishFeedback('PDF baixado');
      return;
    }

    try {
      await webShareNavigator.share?.({ title: result.filename.replace(/\.pdf$/i, ''), files: [file] });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (generatedAfterClick && error instanceof DOMException && error.name === 'NotAllowedError') {
        showPublishFeedback('PDF pronto. Toque novamente para compartilhar.');
        return;
      }
      setLoadError(getErrorMessage(error, 'Não foi possível compartilhar o PDF.'));
    }
  };

  const handlePdfAction = async (action: 'options' | 'download' | 'share') => {
    setPublishAction(action === 'options' ? 'pdf-options' : action === 'download' ? 'download-pdf' : 'share-pdf');
    setLoadError(null);

    if (action === 'share') {
      const cachedPdf = cachedPdfExportRef.current;
      if (cachedPdf?.contentSignature === contentSignature) {
        try {
          await sharePdfResult(cachedPdf.result, false);
        } finally {
          setPublishAction(null);
        }
        return;
      }
    }

    requestPrint(action === 'options' ? 'download' : action === 'download' ? 'download-direct' : 'share-direct');
    if (action === 'options') window.setTimeout(() => setPublishAction(null), 0);
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
    const generatedForSignature = pendingPrintContentSignatureRef.current;
    pendingPrintContentSignatureRef.current = null;
    const generatedPdfIsCurrent = Boolean(
      generatedForSignature
      && generatedForSignature === currentContentSignatureRef.current
    );
    const isPublication = printRequestMode === 'publish' || printRequestMode === 'publish-silent';
    if (!isPublication && generatedPdfIsCurrent && generatedForSignature) {
      cachedPdfExportRef.current = { contentSignature: generatedForSignature, result };
    }

    if (printRequestMode === 'download-direct') {
      setPrintRequestMode('download');
      setPublishAction(null);
      showPublishFeedback('PDF baixado');
      return;
    }

    if (printRequestMode === 'share-direct') {
      if (!generatedPdfIsCurrent) {
        setPrintRequestMode('download');
        setPublishAction(null);
        showPublishFeedback('O cardápio mudou. Toque novamente para compartilhar.');
        return;
      }
      try {
        await sharePdfResult(result, true);
      } finally {
        setPrintRequestMode('download');
        setPublishAction(null);
      }
      return;
    }

    if (!isPublication) return;
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
    setPublishAction(null);
    if (!pendingAction) {
      showPublishFeedback('Link publicado');
      return;
    }

    try {
      await performPublishedLinkAction(published, pendingAction, true);
    } catch (error) {
      setLoadError(getErrorMessage(error, 'O link foi publicado, mas a ação não foi concluída.'));
    }
  };

  const handlePrintError = (error: unknown) => {
    pendingPrintContentSignatureRef.current = null;
    if (printRequestMode === 'publish' || printRequestMode === 'publish-silent') {
      setIsPublishing(false);
      pendingPublishActionRef.current = null;
    }
    setPublishAction(null);
    setPrintRequestMode('download');
    setLoadError(getErrorMessage(error, 'Falha ao gerar o PDF.'));
  };
  const handlePrintCancel = () => {
    pendingPrintContentSignatureRef.current = null;
    setIsPublishing(false);
    setPublishAction(null);
    pendingPublishActionRef.current = null;
    setPrintRequestMode('download');
  };

  return {
    printRequestId, printRequestMode, publication, isPublishOpen, setIsPublishOpen, isPublishing, publishAction,
    publishFeedback, hasPublishedChanges, requestPrint, handleLinkAction, handlePublishConfirm, handlePdfAction,
    handlePublicationSlugChange, handlePrintComplete, handlePrintError, handlePrintCancel,
  };
}
