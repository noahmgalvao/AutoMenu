import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { Check, Download, Send, Share2, X } from 'lucide-react';
import { getErrorMessage } from '../../application/errorMessages';
import { exportProfiles, normalizeExportSettings, type ExportFormat, type ExportSettings, type ImageFormat } from '../../domain/publishing/exportProfiles';
import { resolveImagePages, type ImagePages } from '../../domain/publishing/imagePages';
import { downloadImageFiles, shareFiles } from '../../infrastructure/browser/shareFiles';
import { BooleanSwitch } from '../common/BooleanSwitch';
import { lockModalScrolling } from '../common/modalScroll';
import { ExportPagePicker } from './ExportPagePicker';
import { CustomExportSettings, ExportProfilePicker } from './ExportProfiles';
import { ActionButton, normalizedDraft, PublicationAddressField, PublicationStatus, VirtualLinkSection } from './VirtualLinkSection';
import { useButtonFeedback } from './useButtonFeedback';
import type { MenuPublishing } from './useMenuPublishing';

const tabs = ['Link virtual', 'PDF', 'Imagem'] as const;
const formats = ['PNG', 'JPG', 'TIFF'] as const;
const allPages: ImagePages = { mode: 'all' };

function Segments<T extends string>({ options, value, label, onChange }: {
  options: readonly T[]; value: T; label: string; onChange: (value: T) => void;
}) {
  const navigate = (event: KeyboardEvent, option: T) => {
    const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (!direction) return;
    event.preventDefault();
    const index = (options.indexOf(option) + direction + options.length) % options.length;
    onChange(options[index]);
    const group = event.currentTarget.parentElement;
    group?.querySelectorAll('button')[index]?.focus();
  };
  return <div aria-label={label} role="group" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
    {options.map(option => <button key={option} type="button" aria-pressed={option === value}
      onClick={() => onChange(option)} onKeyDown={event => navigate(event, option)}
      className={`min-h-9 rounded-lg px-1 text-xs font-bold transition-[background-color,transform] active:scale-[.97] [-webkit-tap-highlight-color:transparent] ${option === value
        ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-white/60'}`}>{option}</button>)}
  </div>;
}

type ProfileState = Partial<Record<ExportFormat, { id: string; custom: ExportSettings }>>;
interface Generated { key: string; files: File[]; paired: boolean; }

export function PublishModal({ publishing, pageCount, selectedPages, restoreFocus, title }: {
  publishing: MenuPublishing;
  pageCount: number;
  selectedPages: readonly number[];
  restoreFocus: RefObject<HTMLElement | null>;
  title: string;
}) {
  const { isPublishOpen: open, setIsPublishOpen, fileExportRef, publication, defaultMenuSlug, contentSignature } = publishing;
  const [tab, setTab] = useState<typeof tabs[number]>('Link virtual');
  const [imageFormat, setImageFormat] = useState<ImageFormat>('PNG');
  const [profiles, setProfiles] = useState<ProfileState>({});
  const [pageChoice, setPageChoice] = useState<ImagePages>(allPages);
  const [alsoPublish, setAlsoPublish] = useState(false);
  const [edited, setEdited] = useState<string>();
  const [generated, setGenerated] = useState<Generated>();
  const [exportError, setExportError] = useState<{ key: string; message: string }>();
  const [running, setRunning] = useState<string>();
  const [fileAction, setFileAction] = useState<'download' | 'share'>();
  const runningRef = useRef(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const { results, show } = useButtonFeedback();

  const activeSlug = publication?.menuSlug || defaultMenuSlug;
  const draft = edited ?? activeSlug;
  const format = tab === 'PDF' ? 'PDF' : imageFormat;
  const profileSet = exportProfiles[format];
  const state = profiles[format];
  const profile = profileSet.options.find(candidate => candidate.id === (state?.id ?? profileSet.initial))!;
  const custom = state?.custom ?? profile.settings!;
  const settings = normalizeExportSettings(format, profile.settings ?? custom);
  const indexes = resolveImagePages(pageChoice, pageCount, selectedPages);
  const key = JSON.stringify([format, profile.id, settings, indexes, contentSignature, title]);
  const valid = generated?.key === key ? generated : undefined;

  useEffect(() => {
    if (!open) return;
    const target = restoreFocus.current;
    closeButton.current?.focus({ preventScroll: true });
    return () => target?.focus({ preventScroll: true });
  }, [open, restoreFocus]);

  useEffect(() => {
    if (publication && edited !== undefined && normalizedDraft(edited, defaultMenuSlug) === publication.menuSlug) setEdited(undefined);
  }, [publication, edited, defaultMenuSlug]);

  const close = () => {
    setIsPublishOpen(false);
    setTab('Link virtual');
    setImageFormat('PNG');
    setPageChoice(allPages);
  };
  const generate = async () => {
    if (runningRef.current || !indexes.length || (alsoPublish && publishing.isPublishing)) return;
    runningRef.current = true;
    setRunning(key);
    setGenerated(undefined);
    setExportError(undefined);
    const slug = publication?.menuSlug ?? normalizedDraft(draft, defaultMenuSlug);
    if (alsoPublish) {
      void publishing.publish(slug).catch(() => undefined);
    }
    try {
      const exporter = fileExportRef.current;
      if (!exporter) throw new Error('O cardápio ainda está carregando.');
      const files = await exporter.generate(format, settings, indexes);
      setGenerated({ key, files, paired: alsoPublish });
    } catch (error) {
      setExportError({ key, message: error instanceof Error ? error.message : 'Não foi possível gerar o arquivo.' });
    } finally {
      runningRef.current = false;
      setRunning(undefined);
    }
  };

  const useFile = async (action: 'download' | 'share') => {
    if (!valid || fileAction) return;
    setFileAction(action);
    setExportError(undefined);
    const [first] = valid.files;
    const archiveName = first.name.replace(/-pagina-\d+\.[a-z]+$/i, '');
    try {
      if (action === 'share') {
        try { if (await shareFiles(first.name, valid.files)) return; } catch { /* Offer download instead. */ }
      }
      await downloadImageFiles(valid.files, archiveName);
      show(key, 'Baixado');
    } catch (error) {
      setExportError({ key, message: getErrorMessage(error, 'Não foi possível concluir a ação do arquivo.') });
    } finally {
      setFileAction(undefined);
    }
  };

  if (!open) return null;
  const pageSizes = tab !== 'Link virtual' ? fileExportRef.current?.pageSizes() ?? [] : [];
  const generateLabel = `${alsoPublish ? 'Publicar e gerar' : 'Gerar'} ${format}`;

  return <div ref={lockModalScrolling} className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/45 p-3"
    onPointerDown={event => { if (event.currentTarget === event.target) close(); }}>
    <div role="dialog" aria-modal="true" aria-label="Publicar"
      className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); close(); }
        if (event.key !== 'Tab') return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]',
        )).filter(element => element.tabIndex >= 0 && element.getClientRects().length);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && event.target === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && event.target === last) { event.preventDefault(); first?.focus(); }
      }}>
      <header className="shrink-0 border-b border-slate-100 px-4 pb-3 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Send size={16} className="text-indigo-600" /> Publicar</h2>
          <button type="button" ref={closeButton} onClick={close} aria-label="Fechar publicação"
            className="grid size-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-600 [-webkit-tap-highlight-color:transparent]"><X size={18} /></button>
        </div>
        <Segments options={tabs} value={tab} label="Opções de publicação" onChange={setTab} />
      </header>
      <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain p-4">
        {tab === 'Link virtual' ? <VirtualLinkSection publishing={publishing} draft={draft} onDraft={setEdited} /> : <>
          {tab === 'Imagem' && <Segments options={formats} value={imageFormat} label="Formato da imagem" onChange={setImageFormat} />}
          <ExportProfilePicker key={format} format={format} value={profile.id} custom={normalizeExportSettings(format, custom)}
            pages={indexes.flatMap(index => pageSizes[index] ? [pageSizes[index]] : [])}
            onSelect={next => setProfiles(current => ({
              ...current, [format]: { id: next.id, custom: next.settings ?? settings },
            }))} />
          {profile.id === 'custom' && <CustomExportSettings format={format} settings={custom}
            onChange={next => setProfiles(current => ({ ...current, [format]: { id: 'custom', custom: next } }))} />}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-slate-700">Páginas</div>
            <ExportPagePicker format={format} choice={pageChoice} pageCount={pageCount} selectedPages={selectedPages} onChange={setPageChoice} />
          </div>
          <BooleanSwitch label={publication ? 'Sincronizar também o link virtual' : 'Publicar também o link virtual'}
            value={alsoPublish} onChange={setAlsoPublish} className="border-slate-200 bg-slate-50" />
          {alsoPublish && <div className="space-y-2">
            <PublicationStatus publishing={publishing} />
            <PublicationAddressField publishing={publishing} draft={publication?.menuSlug ?? draft} onDraft={setEdited} editable={!publication} />
            {publishing.publicationError && <p role="alert" className="text-xs font-semibold text-red-700">{publishing.publicationError}</p>}
          </div>}
          {exportError?.key === key && <p role="alert" className="text-xs font-semibold text-red-700">{exportError.message}</p>}
        </>}
      </div>
      {tab !== 'Link virtual' && <footer className="grid shrink-0 gap-2 border-t border-slate-100 bg-white p-3">
        {(!valid || (alsoPublish && (!valid.paired || publishing.publicationError))) && <ActionButton label={generateLabel} primary loading={running === key || (alsoPublish && publishing.isPublishing)}
          disabled={Boolean(running) || !indexes.length || (alsoPublish && publishing.isPublishing)} onClick={() => void generate()} />}
        {valid && <div className="grid gap-2 rounded-xl bg-slate-50 p-2.5">
          <div role="status" className="flex min-w-0 items-center gap-2 text-xs">
            <Check size={16} className="shrink-0 text-emerald-700" />
            <div className="min-w-0">
              <div className="font-semibold text-slate-700">Geração concluída</div>
              <div className="break-all text-slate-500">{valid.files.length === 1 ? valid.files[0].name
                : `${valid.files[0].name.replace(/-pagina-\d+\.[a-z]+$/i, '')}.zip · ${valid.files.length} imagens`}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ActionButton label="Baixar" primary icon={<Download size={15} />} disabled={!!fileAction}
              loading={fileAction === 'download'} result={results[key]} onClick={() => void useFile('download')} />
            <ActionButton label="Compartilhar" icon={<Share2 size={15} />} disabled={!!fileAction}
              loading={fileAction === 'share'} onClick={() => void useFile('share')} />
          </div>
        </div>}
      </footer>}
    </div>
  </div>;
}
