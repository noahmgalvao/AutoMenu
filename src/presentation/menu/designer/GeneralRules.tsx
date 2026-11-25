import { useEffect, useId, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Check, ChevronRight, Columns2, PanelBottom, PanelLeft, PanelRight, PanelTop, Pencil, RotateCcw, Settings, X } from 'lucide-react';
import { BooleanSwitch } from '../../common/BooleanSwitch';
import type { FontSizeLimitKey, MenuContentSpacing, MenuMargins, MenuStyle } from '../../../domain/menu/model';
import {
  MIN_CONFIGURABLE_FONT_SIZE, resolveFontSizeLimits, resolveMenuContentSpacing,
  resolveMenuMargins, resolveMinimumFontSize, roundFontSize,
} from '../../../domain/menu/styleRules';
import { FontSizeInput } from './FontSizeInput';
import { MenuDesignDialog, designDialogButton } from './MenuDesignDialog';

type RulesLayoutSection = 'spacing' | 'margins';

const sectionNames = { spacing: 'Espaçamentos', margins: 'Margens' } as const;
const layoutSections = ['spacing', 'margins'] as const;
const tabs = ['Layout', 'Avançadas'] as const;
const spacingRows = [
  { key: 'headerToContent', label: 'Cabeçalho', next: 'Primeira categoria' },
  { key: 'categoryToProduct', label: 'Categoria', next: 'Produto' },
  { key: 'productNameToDescription', label: 'Nome', next: 'Descrição' },
  { key: 'betweenProducts', label: 'Entre produtos' },
  { key: 'productToNextCategory', label: 'Produto', next: 'Próxima categoria' },
  { key: 'productNameToPrice', label: 'Nome', next: 'Preço' },
] satisfies ReadonlyArray<{ key: keyof MenuContentSpacing; label: string; next?: string }>;
const marginRows = [
  { key: 'top', label: 'Superior', Icon: PanelTop },
  { key: 'bottom', label: 'Inferior', Icon: PanelBottom },
  { key: 'left', label: 'Esquerda', Icon: PanelLeft },
  { key: 'right', label: 'Direita', Icon: PanelRight },
  { key: 'columnGap', label: 'Entre colunas', Icon: Columns2 },
] satisfies ReadonlyArray<{ key: keyof MenuMargins; label: string; Icon: typeof PanelTop }>;

type LayoutRow = { key: string; label: string; next?: string; Icon?: typeof PanelTop; value: number };
type LayoutValues = Pick<MenuStyle, 'margins' | 'pagePadding' | 'contentSpacing' | 'itemGap'>;

const layoutValues = ({ margins, pagePadding, contentSpacing, itemGap }: MenuStyle): LayoutValues =>
  ({ margins, pagePadding, contentSpacing, itemGap });


type RulesProps = {
  style: MenuStyle;
  setStyle: Dispatch<SetStateAction<MenuStyle>>;
};

const RuleNumberInput: React.FC<{
  value: number;
  label: string;
  min?: number;
  max?: number;
  normalizeValue?: (value: number) => number;
  onChange: (value: number) => void;
}> = ({ value, label, min = 0, max = 300, normalizeValue, onChange }) => (
  <div className="grid content-between justify-items-start gap-1 text-xs text-slate-700">
    <span>{label}</span>
    <FontSizeInput label={label} value={value} min={min} max={max} showStepButtons stepSubject=""
      onChange={next => onChange(normalizeValue ? normalizeValue(next) : next)}
      className="!w-12 bg-white text-center font-semibold tabular-nums text-slate-700"
    />
  </div>
);

function AdvancedRules({ style, setStyle }: RulesProps) {
  const fontSizeLimits = resolveFontSizeLimits(style);
  const minimumFontSize = resolveMinimumFontSize(style);
  const fontLimitRows: Array<{ key: FontSizeLimitKey; label: string }> = [
    { key: 'menuTitle', label: 'Título' },
    { key: 'menuSubtitle', label: 'Subtítulo' },
    { key: 'category', label: 'Nome das categorias' },
    { key: 'productName', label: 'Nome dos produtos' },
    { key: 'productPrice', label: 'Preço dos produtos' },
    { key: 'productDescription', label: 'Descrições dos produtos' },
    { key: 'freeText', label: 'Texto livre' },
  ];
  const updateFontLimit = (key: FontSizeLimitKey, value: number) => {
    const normalizedValue = roundFontSize(value);
    setStyle((previous) => {
      const nextElementStyles = { ...previous.elementStyles };
      if (key !== 'freeText') {
        const elementKey = key as keyof MenuStyle['elementStyles'];
        const currentElementStyle = nextElementStyles[elementKey];
        if (currentElementStyle?.fontSize && currentElementStyle.fontSize > normalizedValue) {
          nextElementStyles[elementKey] = { ...currentElementStyle, fontSize: normalizedValue };
        }
      }
      return {
        ...previous,
        fontSizeLimits: { ...resolveFontSizeLimits(previous), [key]: normalizedValue },
        elementStyles: nextElementStyles,
        name: 'Custom',
      };
    });
  };

  return (
    <section className="space-y-3">
      {([
        ['showPrices', 'Mostrar preços no cardápio', true],
        ['splitCategoryAcrossPages', 'Continuar categoria na página seguinte', false],
        ['productsCanChangeCategory', 'Permitir mudar produto de categoria ao arrastar', false],
        ['allowSameWordBreak', 'Permitir quebra de linha na mesma palavra', false,
          'Ex.: permitir “HAMBU” / “RGUER” em duas linhas.'],
      ] as const).map(([key, label, fallback, description]) => (
        <BooleanSwitch key={key} label={label} value={style[key] ?? fallback} description={description}
          className="border-slate-200 bg-slate-50"
          onChange={value => setStyle(previous => ({ ...previous, [key]: value, name: 'Custom' }))} />
      ))}

      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h4 className="text-xs font-bold text-slate-600">Limite de tamanho das fontes</h4>
        <div className="border-b border-slate-200 pb-2">
          <RuleNumberInput
            label="Mínimo geral"
            value={minimumFontSize}
            min={MIN_CONFIGURABLE_FONT_SIZE}
            max={300}
            normalizeValue={roundFontSize}
            onChange={(value) => setStyle((previous) => ({
              ...previous,
              minimumFontSize: value,
              fontSizeLimits: (() => {
                const limits = resolveFontSizeLimits(previous);
                return {
                  menuTitle: Math.max(value, limits.menuTitle),
                  menuSubtitle: Math.max(value, limits.menuSubtitle),
                  category: Math.max(value, limits.category),
                  productName: Math.max(value, limits.productName),
                  productPrice: Math.max(value, limits.productPrice),
                  productDescription: Math.max(value, limits.productDescription),
                  freeText: Math.max(value, limits.freeText),
                };
              })(),
              elementStyles: Object.fromEntries(
                Object.entries(previous.elementStyles).map(([key, elementStyle]) => [
                  key,
                  elementStyle?.fontSize && elementStyle.fontSize < value
                    ? { ...elementStyle, fontSize: value }
                    : elementStyle,
                ]),
              ) as MenuStyle['elementStyles'],
              name: 'Custom',
            }))}
          />
        </div>
        <h4 className="pt-1 text-xs font-bold text-slate-600">Limites máximos</h4>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {fontLimitRows.map(({ key, label }) => (
            <RuleNumberInput key={key} label={label} value={fontSizeLimits[key]} min={minimumFontSize} max={300}
              normalizeValue={roundFontSize} onChange={(value) => updateFontLimit(key, value)} />
          ))}
        </div>
      </div>

    </section>
  );
}

function layoutRows(style: MenuStyle, section: RulesLayoutSection): LayoutRow[] {
  if (section === 'spacing') {
    const spacing = resolveMenuContentSpacing(style);
    return spacingRows.map(row => ({ ...row, value: spacing[row.key] }));
  }
  const margins = resolveMenuMargins(style);
  return marginRows.map(row => ({ ...row, value: margins[row.key] }));
}

function LayoutLabel({ row: { label, next, Icon } }: { row: LayoutRow }) {
  return <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
    {Icon && <Icon size={14} className="shrink-0 text-indigo-500" aria-hidden="true" />}
    <span>{label}</span>
    {next && <span className="inline-flex min-w-0 items-start gap-0.5">
      <ChevronRight size={13} strokeWidth={2.5} className="mt-0.5 shrink-0 text-indigo-500" aria-hidden="true" />
      <span>{next}</span>
    </span>}
  </span>;
}

const iconButton = 'grid size-9 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100';

function ResetSectionButton({ section, reset }: { section: RulesLayoutSection; reset: () => void }) {
  const label = `Reiniciar ${sectionNames[section].toLowerCase()}`;
  return <button type="button" onClick={reset} aria-label={label} title={label}
    className={iconButton}><RotateCcw size={17} /></button>;
}

function GeneralRulesDialog({
  style, setStyle, close, edit, reset, restoreDefaults,
}: RulesProps & {
  close: () => void;
  edit: (section: RulesLayoutSection) => void;
  reset: (section: RulesLayoutSection) => void;
  restoreDefaults: () => void;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]>('Layout');
  const id = useId();
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const tabId = (index: number) => `${id}-tab-${index}`;
  const activeIndex = tabs.indexOf(tab);

  return <MenuDesignDialog title="Regras gerais" close={close} dismissOnBackdrop
    footer={<footer className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
      <button type="button" onClick={restoreDefaults} className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold text-slate-600 hover:bg-slate-100">
        <RotateCcw size={16} /> Restaurar Padrão
      </button>
      <button type="button" onClick={close} className={designDialogButton + ' bg-indigo-700 text-white'}>Fechar</button>
    </footer>}
  >
    <div className="touch-pan-y px-4 py-3 sm:px-5"
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest('button, input')) return;
        swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }}
      onPointerCancel={() => { swipe.current = null; }}
      onPointerUp={event => {
        const start = swipe.current;
        swipe.current = null;
        if (start?.id !== event.pointerId) return;
        const x = event.clientX - start.x;
        const y = event.clientY - start.y;
        if (Math.abs(x) > 42 && Math.abs(x) > Math.abs(y) * 1.3) setTab(x < 0 ? 'Avançadas' : 'Layout');
      }}
    >
      <div role="tablist" aria-label="Regras gerais" className="sticky -top-3 z-[1] mb-3 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1"
        onKeyDown={event => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const index = 1 - activeIndex;
          setTab(tabs[index]);
          document.getElementById(tabId(index))?.focus();
        }}
      >
        {tabs.map((name, index) =>
          <button key={name} type="button" id={tabId(index)} role="tab"
            aria-controls={`${id}-panel`} aria-selected={tab === name} tabIndex={tab === name ? 0 : -1}
            onClick={() => setTab(name)}
            className={`rounded-md py-2 text-sm font-semibold ${tab === name ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
            {name}
          </button>
        )}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={tabId(activeIndex)}>
        {tab === 'Layout' ? <div className="space-y-3">
          {layoutSections.map(section =>
            <section key={section} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <header className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{sectionNames[section]}</h3>
                <div className="flex gap-1">
                  <ResetSectionButton section={section} reset={() => reset(section)} />
                  <button type="button" onClick={() => edit(section)} aria-label={`Editar ${sectionNames[section].toLowerCase()}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-100 px-3 text-xs font-semibold text-indigo-700 hover:bg-indigo-200">
                    <Pencil size={14} /> Editar
                  </button>
                </div>
              </header>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                {layoutRows(style, section).map(row =>
                  <div key={row.key} className="flex items-baseline justify-between gap-1.5 text-xs">
                    <dt className="text-slate-600"><LayoutLabel row={row} /></dt>
                    <dd className="font-semibold tabular-nums text-slate-800">{row.value}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}
        </div> : <AdvancedRules style={style} setStyle={setStyle} />}
      </div>
    </div>
  </MenuDesignDialog>;
}

function RulesLayoutEditor({
  style, setStyle, section, changeSection, reset, close, cancel, confirm,
}: RulesProps & {
  section: RulesLayoutSection;
  changeSection: (section: RulesLayoutSection) => void;
  reset: () => void;
  close: () => void;
  cancel: () => void;
  confirm: () => void;
}) {
  const id = useId();
  const tabId = (target: RulesLayoutSection) => `${id}-${target}`;
  const panelId = `${id}-fields`;
  const fields = useRef<HTMLDivElement>(null);

  const selectTab = (target: RulesLayoutSection) => {
    changeSection(target);
    if (fields.current) fields.current.scrollTop = 0;
  };

  return <section aria-labelledby={tabId(section)} className="flex min-h-0 flex-1 flex-col bg-slate-50 text-slate-800">
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2.5">
      <div role="tablist" aria-label="Edição de layout" className="flex min-w-0 gap-0.5 rounded-xl bg-slate-100 p-1"
        onKeyDown={event => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const next = section === 'margins' ? 'spacing' : 'margins';
          selectTab(next);
          document.getElementById(tabId(next))?.focus();
        }}
      >
        {layoutSections.map(target => (
          <button key={target} type="button" role="tab" id={tabId(target)}
            aria-selected={section === target} aria-controls={panelId} autoFocus={section === target} tabIndex={section === target ? 0 : -1}
            onClick={() => selectTab(target)}
            className={`min-h-8 rounded-lg px-2 text-xs font-semibold tracking-tight sm:px-3 sm:text-sm ${section === target
              ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80' : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'}`}>
            {sectionNames[target]}
          </button>
        ))}
      </div>
      <div className="flex shrink-0 gap-0.5">
        <GeneralRulesButton open={confirm} />
        <ResetSectionButton section={section} reset={reset} />
        <button type="button" onClick={close} aria-label="Fechar regras gerais" title="Fechar regras gerais"
          className={iconButton}><X size={18} /></button>
      </div>
    </header>
    <div ref={fields} role="tabpanel" id={panelId} aria-labelledby={tabId(section)}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
      <div key={section} className="grid grid-cols-2 gap-2.5">
        {layoutRows(style, section).map(row => (
          <div key={row.key} className="grid min-w-0 content-between gap-2 rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-xs">
            <div className="text-xs font-semibold leading-snug text-slate-700"><LayoutLabel row={row} /></div>
            <FontSizeInput variant="layout" label={row.next ? `${row.label} até ${row.next.toLowerCase()}` : row.label}
              value={row.value} min={0} max={section === 'spacing' ? 200 : 300} showStepButtons stepSubject=""
              onChange={next => setStyle(previous => section === 'spacing' ? {
                ...previous, name: 'Custom', contentSpacing: { ...resolveMenuContentSpacing(previous), [row.key]: next },
              } : {
                ...previous, name: 'Custom', margins: { ...resolveMenuMargins(previous), [row.key]: next },
              })}
            />
          </div>
        ))}
      </div>
    </div>
    <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5 md:pb-2.5">
      <button type="button" onClick={cancel}
        className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        Cancelar
      </button>
      <button type="button" onClick={confirm} title="Voltar às regras gerais"
        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800">
        <Check size={17} strokeWidth={2.5} /> Confirmar
      </button>
    </footer>
  </section>;
}

export function GeneralRulesButton({ open }: { open: () => void }) {
  return <button type="button" onClick={open} onPointerDown={event => event.stopPropagation()}
    aria-label="Configurações do cardápio" title="Configurações do cardápio"
    className="grid h-8 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100">
    <Settings size={16} />
  </button>;
}

export function useGeneralRules({
  style, setStyle, isOpen, restoreDefaults, prepareEditor, onLayoutEditingChange,
}: RulesProps & {
  isOpen: boolean;
  restoreDefaults: () => void;
  prepareEditor: () => void;
  onLayoutEditingChange?: (editing: boolean) => void;
}) {
  const [snapshot, setSnapshot] = useState<MenuStyle | null>(null);
  const [edit, setEdit] = useState<{ section: RulesLayoutSection; original: LayoutValues } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSnapshot(null);
      setEdit(null);
    }
  }, [isOpen]);

  const editing = isOpen && snapshot !== null && edit !== null;
  useLayoutEffect(() => {
    if (!editing) return;
    onLayoutEditingChange?.(true);
    return () => onLayoutEditingChange?.(false);
  }, [editing, onLayoutEditingChange]);

  const close = () => {
    setSnapshot(null);
    setEdit(null);
  };

  const reset = (target: RulesLayoutSection) => {
    if (!snapshot) return;
    if (target === 'margins') {
      if (style.margins === snapshot.margins && style.pagePadding === snapshot.pagePadding) return;
      setStyle(current => ({ ...current, margins: snapshot.margins, pagePadding: snapshot.pagePadding, name: 'Custom' }));
    } else {
      if (style.contentSpacing === snapshot.contentSpacing && style.itemGap === snapshot.itemGap) return;
      setStyle(current => ({ ...current, contentSpacing: snapshot.contentSpacing, itemGap: snapshot.itemGap, name: 'Custom' }));
    }
  };

  const cancelEdit = () => {
    if (!edit) return;
    const { original } = edit;
    if (style.margins !== original.margins || style.pagePadding !== original.pagePadding
      || style.contentSpacing !== original.contentSpacing || style.itemGap !== original.itemGap) {
      setStyle(current => ({ ...current, ...original }));
    }
    setEdit(null);
  };

  return {
    open: () => setSnapshot(style),
    editor: editing && <RulesLayoutEditor
      style={style} setStyle={setStyle} section={edit.section}
      changeSection={section => setEdit({ ...edit, section })}
      reset={() => reset(edit.section)} close={close} cancel={cancelEdit} confirm={() => setEdit(null)}
    />,
    dialog: isOpen && snapshot && !edit && <GeneralRulesDialog
      style={style} setStyle={setStyle} close={close} reset={reset} restoreDefaults={restoreDefaults}
      edit={section => { prepareEditor(); setEdit({ section, original: layoutValues(style) }); }}
    />,
  };
}
