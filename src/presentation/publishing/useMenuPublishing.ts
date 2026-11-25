import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AuthSession } from '../../application/account/authGateway';
import { getErrorMessage } from '../../application/errorMessages';
import type { PublicationAvailability } from '../../application/publishing/publicationGateway';
import { getMenuContentSignature } from '../../application/workspace/state';
import type { WorkspaceMenuContent } from '../../application/workspace/workspaceGateway';
import { getDefaultPublicationSlug, normalizePublicationSlug } from '../../domain/publishing/publicationSlug';
import type { LoadedWorkspaceData, MenuPublication } from '../../domain/workspace/model';
import { copyText, createQrCodeBlob, downloadBlob, shareFiles } from '../../infrastructure/browser/shareFiles';
import { useAppServices } from '../app/AppServicesProvider';
import type { CanvasFileExports } from '../menu/designer/useCanvasFileExports';
import { getPublicationUrl, getShareablePublicationUrl } from './publicationUrl';
import { useButtonFeedback } from './useButtonFeedback';

export type LinkAction = 'copy-link' | 'share-link' | 'download-qr' | 'share-qr';
export type PublicationTone = 'neutral' | 'pending' | 'synced' | 'failed';

interface MenuPublishingOptions extends WorkspaceMenuContent {
  session: AuthSession | null;
  workspaceData: LoadedWorkspaceData | null;
}

interface LinkState {
  menuId: string | undefined;
  record: MenuPublication | null;
  availability: PublicationAvailability | null;
  publishedSignature?: string;
  failure?: string;
}

export function useMenuPublishing({ session, workspaceData, products, style, sortOption }: MenuPublishingOptions) {
  const { publications } = useAppServices();
  const menuId = workspaceData?.menu.id;
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [state, setState] = useState<LinkState>({ menuId, record: null, availability: 'checking' });
  const [addressDraft, setAddressDraft] = useState<{ menuId: string; value: string }>();
  const [runningMenus, setRunningMenus] = useState<ReadonlySet<string>>(() => new Set());
  const [publishedLinkNotice, setPublishedLinkNotice] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<LinkAction>();
  const actionRef = useRef<LinkAction | undefined>(undefined);
  const jobs = useRef(new Map<string, Promise<MenuPublication>>());
  const confirmed = useRef(new Map<string, string>());
  const lastChecked = useRef<{ id: string; time: number } | undefined>(undefined);
  const activeMenu = useRef(menuId);
  activeMenu.current = menuId;
  const fileExportRef = useRef<CanvasFileExports>(null);
  const { results: buttonResults, show: showButtonResult } = useButtonFeedback();
  const contentSignature = useMemo(() => getMenuContentSignature(products, style, sortOption), [products, style, sortOption]);

  const refresh = useCallback(async (id: string, cancelled: () => boolean) => {
    if (jobs.current.has(id)) return;
    if (lastChecked.current?.id === id && Date.now() - lastChecked.current.time < 20_000) return;
    lastChecked.current = { id, time: Date.now() };
    const stillCurrent = () => activeMenu.current === id && !cancelled() && !jobs.current.has(id);
    const previous = confirmed.current.get(id);
    let record: MenuPublication | null = null;
    try {
      record = await publications.getMenuPublication(id);
      if (!stillCurrent() || confirmed.current.get(id) !== previous) return;
      if (!record) {
        setState({ menuId: id, record: null, availability: null });
        return;
      }
      setState(current => ({ menuId: id, record, availability: current.record?.id === record?.id ? current.availability : 'checking' }));
      const result = await publications.verifyPublicMenuPublication(record);
      if (stillCurrent() && confirmed.current.get(id) === previous) {
        setState({ menuId: id, record, availability: result.availability, publishedSignature: result.contentSignature });
      }
    } catch {
      if (stillCurrent() && confirmed.current.get(id) === previous) {
        setState(current => ({ menuId: id, record: record ?? (current.menuId === id ? current.record : null), availability: 'unknown' }));
      }
    }
  }, [publications]);

  useEffect(() => {
    setPublishedLinkNotice(false);
    setActionError(null);
    if (!menuId) return;
    let cancelled = false;
    const check = () => void refresh(menuId, () => cancelled);
    const reconnect = () => { lastChecked.current = undefined; check(); };
    check();
    window.addEventListener('online', reconnect);
    return () => {
      cancelled = true;
      if (lastChecked.current?.id === menuId) lastChecked.current = undefined;
      window.removeEventListener('online', reconnect);
    };
  }, [menuId, refresh]);

  useEffect(() => {
    if (!isPublishOpen || !menuId) return;
    const timer = window.setTimeout(() => { void refresh(menuId, () => false); }, 250);
    return () => window.clearTimeout(timer);
  }, [isPublishOpen, menuId, refresh]);

  useEffect(() => {
    if (!publishedLinkNotice) return;
    const timer = window.setTimeout(() => setPublishedLinkNotice(false), 5000);
    return () => window.clearTimeout(timer);
  }, [publishedLinkNotice]);

  const current: LinkState = state.menuId === menuId ? state : { menuId, record: null, availability: 'checking' };
  const publication = current.record;
  const defaultMenuSlug = getDefaultPublicationSlug(workspaceData?.menu.name ?? '');
  const publicUrl = publication ? getPublicationUrl(publication) : null;
  const sharedUrl = publication ? getShareablePublicationUrl(publication) : null;
  const draft = addressDraft?.menuId === menuId ? addressDraft?.value : undefined;
  const linkEnding = draft ?? publication?.menuSlug ?? defaultMenuSlug;
  const requestedSlug = normalizePublicationSlug(linkEnding) || defaultMenuSlug;
  const pending = Boolean(publication && (requestedSlug !== publication.menuSlug
    || (current.publishedSignature ?? publication.contentSignature) !== contentSignature));
  const isPublishing = Boolean(menuId && runningMenus.has(menuId));
  const tone: PublicationTone = current.failure || current.availability === 'offline' ? 'failed'
    : pending ? 'pending' : current.availability === 'online' ? 'synced' : 'neutral';

  const updateLinkEnding = (value: string) => {
    if (!menuId) return;
    setAddressDraft({ menuId, value });
    if (current.failure) setState(previous => ({ ...previous, failure: undefined }));
  };

  const publish = (): Promise<MenuPublication> => {
    if (!workspaceData || !menuId || !session) return Promise.reject(new Error('O cardápio ainda está carregando.'));
    const running = jobs.current.get(menuId);
    if (running) return running;
    const requested = !publication && requestedSlug === defaultMenuSlug ? undefined : requestedSlug;
    const task = publications.publishWorkspaceMenu({
      workspace: workspaceData.workspace, menu: workspaceData.menu, userId: session.user.id,
      products, style, sortOption, menuSlug: requested,
    }).then(published => {
      confirmed.current.set(menuId, `${published.publishedVersionId}:${published.menuSlug}`);
      if (activeMenu.current === menuId) {
        setAddressDraft(previous => previous === addressDraft ? undefined : previous);
        lastChecked.current = { id: menuId, time: Date.now() };
        setState({ menuId, record: published, availability: 'online', publishedSignature: published.contentSignature });
        setPublishedLinkNotice(true);
      }
      return published;
    }, error => {
      if (activeMenu.current === menuId) {
        setState(previous => ({ ...previous, menuId, failure: getErrorMessage(error, 'Não foi possível publicar o cardápio.') }));
      }
      throw error;
    }).finally(() => {
      jobs.current.delete(menuId);
      setRunningMenus(new Set(jobs.current.keys()));
    });
    jobs.current.set(menuId, task);
    setRunningMenus(new Set(jobs.current.keys()));
    setPublishedLinkNotice(false);
    setActionError(null);
    setState(previous => ({ ...previous, menuId, failure: undefined }));
    return task;
  };

  const handleLinkAction = async (action: LinkAction) => {
    if (!publicUrl || !sharedUrl || !publication || actionRef.current) return;
    actionRef.current = action;
    setBusyAction(action);
    setActionError(null);
    try {
      if (action === 'share-link' && navigator.share) {
        try {
          await navigator.share({ title: publication.pdfFilename.replace(/\.pdf$/i, ''), url: publicUrl });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
        }
      }
      if (action === 'copy-link' || action === 'share-link') {
        await copyText(publicUrl);
        showButtonResult(action, 'Copiado');
        return;
      }
      const qr = await createQrCodeBlob(sharedUrl);
      const file = new File([qr], `qrcode-${publication.menuSlug}.png`, { type: 'image/png' });
      if (action === 'share-qr') {
        try { if (await shareFiles('QR Code do cardápio', [file])) return; } catch { /* Offer the file as a download. */ }
      }
      downloadBlob(file, file.name);
      showButtonResult(action, 'Baixado');
    } catch (error) {
      if (activeMenu.current === menuId) setActionError(getErrorMessage(error, 'Não foi possível concluir a ação.'));
    } finally {
      actionRef.current = undefined;
      setBusyAction(undefined);
    }
  };

  return {
    isPublishOpen, setIsPublishOpen, isPublishing, tone, pending,
    availability: current.availability, publicationError: current.failure, linkActionError: actionError,
    publication, publicUrl, sharedUrl, linkEnding, updateLinkEnding, defaultMenuSlug, contentSignature, fileExportRef,
    publishedLinkNotice, dismissPublishedLinkNotice: () => setPublishedLinkNotice(false),
    publish, handleLinkAction, busyAction, buttonResults,
  };
}

export type MenuPublishing = ReturnType<typeof useMenuPublishing>;
