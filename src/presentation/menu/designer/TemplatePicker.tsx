import React, { memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowUp, Check, ChevronDown, Grid2X2, Heart, Search, X } from 'lucide-react';
import type { MenuStyle, Product, SortOption } from '../../../domain/menu/model';
import { useTemplateFavorites } from './useTemplateFavorites';
import { getAppliedTemplateId } from '../../../application/templates/templateApplication';
import { getTemplateColors, getTemplateDesignAttributes } from '../canvas/templateStyles';
import { filterTemplates, stepTemplate, swipeDirection, TEMPLATE_TABS, type TemplateTab } from '../../../domain/templates/templateBrowse';
import { resolveMenuPageDimensions } from '../../../domain/menu/pageSetup';
import { TemplatePreviewSurface } from './TemplatePreviewSurface';

interface Props {
  current: MenuStyle;
  templates: MenuStyle[];
  products: Product[];
  sortOption: SortOption;
  userId: string;
  splitCategoryAcrossPages?: boolean;
  applyTemplate: (template: MenuStyle) => void;
}

const focusStyle = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500';
const actionStyle = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold ' + focusStyle;
type Favorites = ReturnType<typeof useTemplateFavorites>;

const Thumbnail = memo(function Thumbnail({ template }: { template: MenuStyle }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const dimensions = resolveMenuPageDimensions(template);
  useEffect(() => {
    const target = ref.current;
    if (!target) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setVisible(true);
      observer.disconnect();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className="template-thumbnail-stage grid h-full w-full place-items-center overflow-hidden bg-slate-100 p-1">
      {visible && <div {...getTemplateDesignAttributes(template)} className="template-thumbnail" style={{
        ...getTemplateColors(template),
        backgroundColor: template.backgroundColor, color: template.textColor,
        aspectRatio: dimensions.widthPx / dimensions.heightPx,
        width: dimensions.widthPx <= dimensions.heightPx ? '70%' : '100%',
      } as React.CSSProperties}>
        <div data-template-header><strong data-menu-heading="title">{template.name}</strong></div>
        <div className="template-thumbnail-sections" style={{ gridTemplateColumns: `repeat(${template.categoryColumnCount || 1}, 1fr)` }}>
          {Array.from({ length: Math.max(2, template.categoryColumnCount || 1) }, (_, group) => (
            <div key={group} className="min-w-0">
              <div data-template-category>{group === 0 ? 'Da casa' : group === 1 ? 'Especiais' : 'Doces'}</div>
              <div className="template-thumbnail-sections" style={{ gridTemplateColumns: `repeat(${template.columnCount}, 1fr)` }}>
                {Array.from({ length: Math.max(2, template.columnCount) }, (_, item) => (
                  <div key={item} data-template-card className="template-thumbnail-product">
                    {template.showImages && <div data-template-image />}
                    <i /><b data-template-price /><i />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>}
    </div>
  );
});

function FavoriteButton({ template, favorites, discovery = false }: {
  template: MenuStyle; favorites: Favorites; discovery?: boolean;
}) {
  const active = favorites.ids.has(template.id);
  return <button type="button" aria-pressed={active}
    aria-label={`${active ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}: ${template.name}`}
    className={discovery ? 'template-discover-like ' + focusStyle
      : actionStyle + (active ? ' text-rose-600 hover:bg-rose-50' : ' text-slate-500 hover:bg-slate-100')}
    onClick={() => favorites.toggle(template.id, template.name)}>
    <Heart size={discovery ? 29 : 17} strokeWidth={discovery ? 1.8 : 2} fill={active ? 'currentColor' : 'none'} aria-hidden="true" />
  </button>;
}

function Filters({ query, setQuery, tab, setTab, gallery = false }: {
  query: string; setQuery: (query: string) => void; tab: TemplateTab; setTab: (tab: TemplateTab) => void; gallery?: boolean;
}) {
  return <div className={gallery ? 'template-gallery-filters' : 'space-y-2'}>
    <label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 focus-within:border-indigo-500">
      <Search size={16} aria-hidden="true" className="shrink-0 text-slate-500" />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar modelos"
        aria-label="Pesquisar modelos" className="w-full min-w-0 bg-transparent text-sm outline-none" />
    </label>
    <div role="group" aria-label="Filtrar modelos" className="flex flex-wrap gap-1">
      {TEMPLATE_TABS.map(([value, label]) => (
        <button key={value} type="button" aria-pressed={value === tab} onClick={() => setTab(value)}
          className={`min-h-8 rounded-md px-2 text-xs font-semibold ${focusStyle} ${tab === value ? 'bg-indigo-100 text-indigo-800' : 'text-slate-600 hover:bg-slate-100'}`}>
          {label}
        </button>
      ))}
    </div>
  </div>;
}

function TemplateOption({ template, active, favorites, choose, gallery }: {
  template: MenuStyle; active: boolean; favorites: Favorites;
  choose: () => void; gallery?: boolean;
}) {
  const pendingChoice = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(pendingChoice.current), []);
  return <div data-template-option={template.id} className={gallery ? "template-gallery-tile" : `relative flex min-w-0 rounded-lg border ${active ? 'border-indigo-400 bg-indigo-50' : 'border-transparent hover:bg-slate-50'}`} data-current={active || undefined}>
    <button type="button" aria-current={active || undefined}
      className={`flex min-w-0 flex-1 gap-2 rounded-lg p-2 text-left ${gallery ? 'flex-col' : 'items-center'} ${focusStyle}`}
      onClick={(event) => {
        if (!gallery || event.detail === 0) { choose(); return; }
        if (pendingChoice.current) {
          clearTimeout(pendingChoice.current);
          pendingChoice.current = undefined;
          favorites.toggle(template.id, template.name);
          return;
        }
        pendingChoice.current = setTimeout(() => {
          pendingChoice.current = undefined;
          choose();
        }, 280);
      }}>
      <div className={`shrink-0 overflow-hidden rounded-md ${gallery ? 'template-gallery-thumbnail w-full' : 'h-16 w-14'}`}><Thumbnail template={template} /></div>
      <div className={`min-w-0 ${gallery ? 'pr-9' : ''}`}>
        <div className="truncate text-sm font-semibold">{template.name}</div>
        <div className="template-option-description line-clamp-2 text-xs text-slate-600">{template.catalogMetadata?.description || 'Modelo do seu workspace'}</div>
        {!gallery && <div className="mt-1 truncate text-[10px] font-semibold text-indigo-700">
          {template.scope === 'system' ? 'Pronto' : template.sourceType === 'ai_import' ? 'Importado' : 'Meu modelo'}
          {template.catalogMetadata?.tags.length ? ' · ' + template.catalogMetadata.tags.join(' · ') : ''}
        </div>}
      </div>
    </button>
    <div className={gallery ? 'absolute bottom-1 right-1' : 'shrink-0 self-center'}>
      <FavoriteButton template={template} favorites={favorites} />
    </div>
  </div>;
}

function Discover({ current, products, sortOption, splitCategoryAcrossPages, applyTemplate, query, setQuery,
  tab, setTab, results, favorites, onClose,
}: Props & {
  query: string; setQuery: (query: string) => void; tab: TemplateTab; setTab: (tab: TemplateTab) => void;
  results: MenuStyle[]; favorites: Favorites; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [focusId, setFocusId] = useState(getAppliedTemplateId(current));
  const [gallery, setGallery] = useState(false);
  const gesture = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const wheel = useRef({ at: -Infinity, delta: 0, handled: false });
  const [drag, setDrag] = useState(0);
  const [direction, setDirection] = useState(0);
  const [hint, setHint] = useState(results.length > 1);
  const lastTap = useRef(0);
  const pointerKind = useRef('');
  const tapTarget = useRef<{ button: HTMLButtonElement; x: number; y: number; pointerId: number } | null>(null);
  const lastTouchClick = useRef<{ button: HTMLButtonElement; at: number } | null>(null);
  const titleId = useId();
  const focused = results.find((template) => template.id === focusId) || results[0];

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    node.showModal();
    node.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('popstate', onClose);
    return () => {
      window.removeEventListener('popstate', onClose);
      document.body.style.overflow = previousOverflow;
      node.close();
    };
  }, [onClose]);

  useEffect(() => {
    const timer = window.setTimeout(() => setHint(false), 2900);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => { dialog.current?.focus(); }, [gallery]);

  useEffect(() => {
    const items = Array.from(list.current?.querySelectorAll<HTMLElement>('[data-template-option]') || []);
    items.find((item) => item.dataset.templateOption === focused?.id)?.scrollIntoView({ block: 'nearest' });
  }, [focused?.id, gallery]);

  const step = (delta: number) => {
    setHint(false);
    const id = stepTemplate(results, focused?.id, delta);
    if (id && id !== focused?.id) {
      setDirection(delta);
      setFocusId(id);
    }
  };
  const openGallery = () => {
    setHint(false);
    setGallery(true);
  };
  const apply = () => {
    if (!focused) return;
    applyTemplate(focused);
    onClose();
  };

  return createPortal(
    <dialog ref={dialog} data-no-browser-selection tabIndex={-1} aria-labelledby={titleId} className="template-discover" style={{ '--discover-accent': focused?.primaryColor } as React.CSSProperties}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onPointerDownCapture={(event) => {
        if (event.pointerType !== 'touch' || !event.isPrimary) return;
        const button = (event.target as HTMLElement).closest('button');
        tapTarget.current = button?.disabled || !button ? null : {
          button, x: event.clientX, y: event.clientY, pointerId: event.pointerId,
        };
      }}
      onPointerCancelCapture={() => { tapTarget.current = null; }}
      onPointerUpCapture={(event) => {
        const tap = tapTarget.current;
        if (!tap || event.pointerId !== tap.pointerId) return;
        tapTarget.current = null;
        if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 12) return;
        if (!tap.button.contains(event.target as Node)) return;
        // Touch browsers can suppress the compatibility click following a swipe.
        lastTouchClick.current = { button: tap.button, at: performance.now() };
        tap.button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
      }}
      onClickCapture={(event) => {
        const tap = lastTouchClick.current;
        if (event.nativeEvent.isTrusted && event.detail > 0 && tap?.button.contains(event.target as Node)
            && performance.now() - tap.at < 550) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
        if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
        if (gallery) return;
        if (event.key === 'Enter' && !(event.target as HTMLElement).closest('button')) {
          event.preventDefault();
          apply();
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          step(event.key === 'ArrowDown' ? 1 : -1);
        }
      }}>
      <h2 id={titleId} className="sr-only">Descobrir modelos</h2>
      {gallery ? <section className="template-gallery" aria-label="Catálogo">
        <header className="template-gallery-header">
          <div className="template-gallery-heading">
            <button type="button" className={`template-gallery-back ${focusStyle}`} aria-label="Voltar à prévia" onClick={() => setGallery(false)}>
              <ArrowLeft size={21} aria-hidden="true" />
            </button>
            <h3>Todos os modelos</h3>
            <button type="button" className={`template-gallery-back ${focusStyle}`} aria-label="Cancelar" onClick={onClose}>
              <X size={21} aria-hidden="true" />
            </button>
          </div>
          <Filters {...{ query, setQuery, tab, setTab }} gallery />
        </header>
        <div ref={list} className="template-gallery-list">
          {results.map(template => <TemplateOption key={template.id} template={template} active={focused?.id === template.id}
            favorites={favorites} gallery choose={() => { setDirection(0); setFocusId(template.id); setGallery(false); }} />)}
          {!results.length && <p className="template-gallery-empty">Nenhum modelo encontrado.</p>}
        </div>
      </section> : <>
        {focused ? <div className="template-discover-surface" aria-label="Prévia do modelo"
          onDoubleClick={event => {
            if (pointerKind.current !== 'touch' && !(event.target as HTMLElement).closest('[data-template-preview-controls]')) {
              favorites.toggle(focused.id, focused.name);
            }
          }}
          onWheel={event => {
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            const now = performance.now();
            if (now - wheel.current.at > 220) wheel.current = { at: now, delta: 0, handled: false };
            wheel.current.at = now;
            if (wheel.current.handled) return;
            wheel.current.delta += event.deltaY * (event.deltaMode ? 30 : 1);
            if (Math.abs(wheel.current.delta) >= 32) {
              wheel.current.handled = true;
              step(Math.sign(wheel.current.delta));
            }
          }}
          onPointerDown={event => {
            if (!event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest('[data-template-preview-controls]')) return;
            pointerKind.current = event.pointerType;
            gesture.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => {
            const start = gesture.current;
            if (!start || event.pointerId !== start.pointerId) return;
            const dy = event.clientY - start.y;
            if (Math.abs(dy) < 8 || Math.abs(dy) <= Math.abs(event.clientX - start.x)) return;
            setHint(false);
            setDrag(Math.max(-96, Math.min(96, dy * .38)));
          }}
          onPointerCancel={() => { gesture.current = null; setDrag(0); }}
          onPointerUp={event => {
            const start = gesture.current;
            if (!start || event.pointerId !== start.pointerId) return;
            gesture.current = null;
            setDrag(0);
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            const next = swipeDirection(dx, dy);
            if (next) { lastTap.current = 0; step(next); return; }
            if (event.pointerType !== 'touch' || Math.hypot(dx, dy) > 12) return;
            const now = Date.now();
            if (now - lastTap.current < 280) { favorites.toggle(focused.id, focused.name); lastTap.current = 0; }
            else lastTap.current = now;
          }}>
          <div className="template-discover-drag" data-dragging={Boolean(drag)} style={{ transform: `translateY(${drag}px)` }}>
            <div key={focused.id} className="template-discover-slide" style={{ '--discover-enter': `${direction * 8}vh` } as React.CSSProperties}>
              <TemplatePreviewSurface current={current} template={focused} products={products}
                sortOption={sortOption} splitCategoryAcrossPages={splitCategoryAcrossPages} />
            </div>
          </div>
        </div> : <p className="template-discover-empty">Nenhum modelo encontrado.</p>}
        {hint && focused && <div className="template-discover-hint" role="status">
          <ArrowUp size={26} aria-hidden="true" />
          <span>Arraste para cima para ver o próximo</span>
        </div>}
        <div className="template-discover-actions">
          {focused && <FavoriteButton discovery template={focused} favorites={favorites} />}
          <button type="button" className={`template-discover-all ${focusStyle}`} onClick={openGallery}>
            <Grid2X2 size={21} aria-hidden="true" />
            Ver todos
          </button>
        </div>
        <footer className="template-discover-footer">
          <button type="button" className={`template-discover-cancel ${focusStyle}`} onClick={onClose}>
            <X size={19} aria-hidden="true" /> Cancelar
          </button>
          <button type="button" className={`template-discover-apply ${focusStyle}`} onClick={apply} disabled={!focused}>
            <Check size={21} aria-hidden="true" /> Aplicar
          </button>
        </footer>
      </>}
      <span className="sr-only" role="status">{favorites.announcement}</span>
    </dialog>, document.body,
  );
}

export function TemplatePicker(props: Props) {
  const { current, templates, userId, applyTemplate } = props;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [discover, setDiscover] = useState(false);
  const [tab, setTab] = useState<TemplateTab>('all');
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useId();
  const favorites = useTemplateFavorites(userId);
  const currentId = getAppliedTemplateId(current);
  const selectedTemplate = templates.find(template => template.id === currentId);

  useEffect(() => {
    if (!pickerOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [pickerOpen]);

  const closeDiscovery = React.useCallback(() => {
    if (history.state?.templateDiscovery === panel) history.back();
    setDiscover(false);
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  }, [panel]);

  const results = useMemo(() => filterTemplates(templates, tab, query, favorites.ids), [templates, tab, query, favorites.ids]);

  return <div ref={root} className="space-y-2" onKeyDown={(event) => {
    if (!pickerOpen) return;
    event.stopPropagation();
    if (event.key === 'Escape') {
      setPickerOpen(false);
      trigger.current?.focus();
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[data-template-option] > button') || []);
    if (!buttons.length) return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[index < 0 ? 0 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))].focus();
  }}>
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Modelos</h3>
      <button type="button" className={actionStyle + ' min-h-8 bg-indigo-50 text-indigo-700'}
        onClick={() => {
          history.pushState({ ...history.state, templateDiscovery: panel }, '');
          setPickerOpen(false);
          setDiscover(true);
        }}><Grid2X2 size={14} /> Descobrir</button>
    </div>
    <button type="button" ref={trigger} aria-controls={panel} aria-expanded={pickerOpen}
      onClick={() => setPickerOpen((open) => !open)}
      className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold ${focusStyle}`}>
      {selectedTemplate && <div className="my-1 h-20 w-16 shrink-0 overflow-hidden rounded-md"><Thumbnail template={selectedTemplate} /></div>}
      <span className="min-w-0 flex-1 truncate text-left">{selectedTemplate?.name || 'Escolher modelo'}</span>
      <ChevronDown size={16} className="shrink-0" />
    </button>
    {pickerOpen && <div id={panel} className="space-y-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <Filters {...{ query, setQuery, tab, setTab }} />
      <div className="max-h-64 space-y-1 overflow-auto overscroll-y-auto">
        {results.map((template) => <TemplateOption key={template.id} template={template} active={currentId === template.id}
          favorites={favorites} choose={() => { applyTemplate(template); setPickerOpen(false); trigger.current?.focus(); }} />)}
        {results.length === 0 && <p className="p-3 text-sm text-slate-600">Nenhum modelo encontrado.</p>}
      </div>
      <span className="sr-only" role="status">{favorites.announcement}</span>
    </div>}
    {discover && <Discover {...props} {...{ query, setQuery, tab, setTab, results, favorites }} onClose={closeDiscovery} />}
  </div>;
}
