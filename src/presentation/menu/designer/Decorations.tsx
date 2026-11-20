import React from 'react';
import { List, Minus, Square } from 'lucide-react';
import { canvasShapeUrl } from '../../../domain/menu/canvasShapes';
import { isMiniFoodKind, miniFoodIconUrl } from '../../../domain/menu/miniFoods';
import { MarkerControls, standardMarkers } from './MarkerControls';
import type { MenuBorder, MenuBorderScope, MenuBorderSide, MenuMarker, MenuStyle } from '../../../domain/menu/model';
import { resolveMenuPageDimensions } from '../../../domain/menu/pageSetup';
import { resolveMenuMargins } from '../../../domain/menu/styleRules';
import { getProductCardCornerRadii, getProductCardRadius, getProductPhotoFrameRadius } from '../canvas/templateStyles';
import { ColorPicker } from './ColorPicker';
import { FontSizeInput } from './FontSizeInput';
import { fitBorder, type BorderGeometry } from '../../../domain/menu/borderFitting';
import { observeBorderGeometry } from './borderGeometry';

const sides: { id: MenuBorderSide; label: string }[] = [
  { id: 'top', label: 'Acima' }, { id: 'right', label: 'Direita' },
  { id: 'bottom', label: 'Abaixo' }, { id: 'left', label: 'Esquerda' },
];

const patterns: [MenuBorder['pattern'], string][] = [
  ['solid', 'Contínua'], ['dashed', 'Tracejada'], ['dotted', 'Pontilhada'], ['double', 'Dupla'],
];

function activeBorder(style: MenuStyle, scope: MenuBorderScope, id?: string) {
  return scope === 'freeText' ? style.freeTextBorders?.[id || ''] : style.borders?.[scope];
}

export function getSurfaceFill(style: MenuStyle, scope: MenuBorderScope, id?: string) {
  if (scope === 'product') return style.cardBackgroundColorOverride ? style.cardBackgroundColor : undefined;
  if (scope === 'freeText') return style.freeTextFills?.[id || ''];
  return style.fills?.[scope];
}

export function withSurfaceFill(style: MenuStyle, scope: MenuBorderScope, id: string | undefined, color?: string): MenuStyle {
  if (scope === 'product') return { ...style, cardBackgroundColor: color, cardBackgroundColorOverride: Boolean(color), name: 'Custom' };
  if (scope === 'freeText' && !id) return style;
  const field = scope === 'freeText' ? 'freeTextFills' : 'fills';
  const key = scope === 'freeText' ? id! : scope;
  const values: Record<string, string> = { ...style[field] };
  if (color) values[key] = color;
  else delete values[key];
  return { ...style, [field]: values, name: 'Custom' };
}

export function getBorderOverride(style: MenuStyle, scope: MenuBorderScope, id?: string) {
  return activeBorder(style, scope, id) ? 'true' : undefined;
}

export function getBorderConfiguration(style: MenuStyle, scope: MenuBorderScope, id?: string): MenuBorder {
  const existing = activeBorder(style, scope, id);
  if (existing) return existing;
  const border: MenuBorder = { sides: [], color: style.primaryColor, thickness: 1, length: 100, radius: 0, offset: 0, pattern: 'solid' };
  const all = sides.map(side => side.id);
  if (scope === 'header') {
    switch (style.design?.header) {
      case 'centered': {
        const { widthPx } = resolveMenuPageDimensions(style);
        const { left, right } = resolveMenuMargins(style);
        return { ...border, sides: ['top'], thickness: 2, length: Math.max(5, Math.min(100, Math.round(4800 / Math.max(48, widthPx - left - right)))) };
      }
      case 'left': return { ...border, sides: ['left'], thickness: 4 };
      case 'split': return { ...border, sides: ['bottom'], thickness: 3 };
      case 'hero': return { ...border, sides: ['bottom'], thickness: 4 };
      case 'banner': return { ...border, sides: ['top', 'bottom'], thickness: 3 };
    }
  }
  if (scope === 'category') {
    switch (style.design?.category) {
      case 'underline': return { ...border, sides: ['bottom'], thickness: 2 };
      case 'filled': return { ...border, sides: ['left'], thickness: 4 };
      case 'pill': return { ...border, sides: all, radius: 40 };
      case 'ribbon': return { ...border, sides: ['top', 'bottom'] };
      case 'numbered': return { ...border, sides: ['bottom'] };
    }
  }
  if (scope === 'product') {
    const rounded = { ...border, radius: getProductCardRadius(style) };
    if (style.design?.card === 'bordered') return { ...rounded, sides: all };
    if (style.design?.card === 'full-bleed') return { ...rounded, sides: ['bottom'], thickness: 3 };
    if (style.design?.product === 'editorial') return { ...border, sides: ['bottom'] };
    if ((!style.design && style.layoutMode !== 'list') || (style.design?.card === 'flat' && style.layoutMode === 'cards')) {
      return { ...rounded, sides: all, color: '#e2e8f0' };
    }
    return rounded;
  }
  if (scope === 'price') {
    if (style.design?.price === 'badge') return { ...border, sides: all, radius: 3 };
    if (style.design?.price === 'pill') return { ...border, sides: all, radius: 24 };
    if (style.design?.price === 'highlight') return { ...border, sides: ['bottom'], thickness: 3 };
    if (!style.design && style.layoutMode !== 'list') return { ...border, sides: all, radius: 24, color: '#e2e8f0' };
  }
  if (scope === 'productImage') {
    const radius = style.productImageFrame === 'rounded' ? 12 : style.productImageFrame === 'arch' ? 8 : 0;
    return style.design?.product === 'featured' ? { ...border, sides: ['bottom'], thickness: 3, radius } : { ...border, radius };
  }
  return border;
}

export function BorderDecoration({ style, scope, id }: { style: MenuStyle; scope: MenuBorderScope; id?: string }) {
  const border = activeBorder(style, scope, id);
  return border?.sides.length ? <SafeBorder border={border} scope={scope} style={style} /> : null;
}

function findBorderSurface(scope?: MenuBorderScope, id?: string) {
  const selector = `[data-menu-border-surface="${scope}"]`;
  const target = id ? document.getElementById(id) : null;
  return target?.closest<HTMLElement>(selector)
    ?? target?.querySelector<HTMLElement>(selector)
    ?? document.querySelector<HTMLElement>(`[data-menu-print-page] ${selector}`);
}

function useBorderGeometry(enabled: boolean, scope?: MenuBorderScope, id?: string, anchor?: React.RefObject<HTMLElement | null>) {
  const [geometry, setGeometry] = React.useState<BorderGeometry | null>(null);
  React.useLayoutEffect(() => {
    setGeometry(null);
    if (!enabled) return;
    const surface = anchor?.current?.parentElement ?? findBorderSurface(scope, id);
    if (!surface) return;
    return observeBorderGeometry(surface, (next) => setGeometry((current) => (
      JSON.stringify(current) === JSON.stringify(next) ? current : next
    )));
  }, [anchor, enabled, id, scope]);
  return geometry;
}

function SafeBorder({ border, scope, style }: { border: MenuBorder; scope: MenuBorderScope; style: MenuStyle }) {
  const anchor = React.useRef<HTMLSpanElement>(null);
  const geometry = useBorderGeometry(true, undefined, undefined, anchor);
  const fitted = geometry && fitBorder(border, geometry);
  let cornerRadii: string | undefined;
  if (fitted && fitted.border.length === 100 && geometry?.enclosesSurface) {
    if (scope === 'product') {
      const radius = fitted.border.radius;
      cornerRadii = getProductCardCornerRadii(style, radius ? Math.max(0, radius + fitted.border.offset) : 0);
    } else if (scope === 'productImage') {
      cornerRadii = getProductPhotoFrameRadius(style.productImageFrame, fitted.border.radius);
    }
  }
  return <>
    <span ref={anchor} hidden />
    {fitted && <BorderShape border={fitted.border} outsets={fitted.outsets} cornerRadii={cornerRadii} />}
  </>;
}

function BorderShape({ border, outsets, cornerRadii }: { border: MenuBorder; outsets?: Record<MenuBorderSide, number>; cornerRadii?: string }) {
  if (!border.sides.length) return null;
  const stroke = `${border.thickness}px ${border.pattern} ${border.color}`;
  const inset = (side: MenuBorderSide) => -(outsets?.[side] ?? border.offset);
  if (border.length === 100) {
    return <span data-menu-border aria-hidden="true" className="pointer-events-none absolute z-[1]" style={{
      top: inset('top'), right: inset('right'), bottom: inset('bottom'), left: inset('left'),
      borderTop: border.sides.includes('top') ? stroke : undefined,
      borderRight: border.sides.includes('right') ? stroke : undefined,
      borderBottom: border.sides.includes('bottom') ? stroke : undefined,
      borderLeft: border.sides.includes('left') ? stroke : undefined,
      borderRadius: cornerRadii ?? border.radius,
    }} />;
  }
  return <>{border.sides.map(side => {
    const horizontal = side === 'top' || side === 'bottom';
    return <span key={side} data-menu-border aria-hidden="true" className="pointer-events-none absolute z-[1]" style={{
      [side]: inset(side),
      [horizontal ? 'left' : 'top']: `${(100 - border.length) / 2}%`,
      [horizontal ? 'width' : 'height']: `${border.length}%`,
      [horizontal ? 'height' : 'width']: border.thickness,
      [horizontal ? 'borderTop' : 'borderLeft']: stroke,
      borderRadius: border.radius,
    }} />;
  })}</>;
}

export function getMarker(style: MenuStyle, scope: 'category' | 'product'): MenuMarker {
  return style.markers?.[scope] || (scope === 'category' && style.design?.category === 'numbered' ? 'number-padded' : 'none');
}

export function MenuMarkerGlyph({ marker, index, color, fontSize }: { marker: MenuMarker; index: number; color: string; fontSize: number }) {
  if (marker === 'none') return null;
  if (typeof marker === 'object' || isMiniFoodKind(marker)) {
    const url = typeof marker === 'object' ? canvasShapeUrl(marker.shape) : miniFoodIconUrl(marker);
    return <img data-menu-marker aria-hidden="true" alt="" src={url} className="shrink-0 object-contain"
      style={{ width: fontSize, height: fontSize }} />;
  }
  const number = Math.max(1, index + 1);
  const framed = marker === 'number-circle' || marker === 'number-square' || marker === 'number-padded';
  const content = marker === 'number' ? `${number}.` : marker === 'number-padded' ? String(number).padStart(2, '0')
    : framed ? number : standardMarkers.find(([id]) => marker === id)?.[2];
  return <span data-menu-marker aria-hidden="true" className="inline-flex shrink-0 items-center justify-center font-semibold tabular-nums" style={{
    color,
    border: framed ? '1px solid currentColor' : undefined,
    borderRadius: marker === 'number-circle' ? 999 : marker === 'number-square' ? 2 : undefined,
    minWidth: framed ? '1.55em' : undefined,
    paddingInline: framed ? '0.24em' : undefined,
    fontSize: framed ? fontSize * 0.85 : fontSize,
    fontFamily: marker === 'number-padded' ? 'monospace' : undefined,
    lineHeight: framed ? 1.45 : 1,
  }}>{content}</span>;
}

interface DecorationProps {
  style: MenuStyle;
  setStyle: React.Dispatch<React.SetStateAction<MenuStyle>>;
  scope: MenuBorderScope;
  id?: string;
  showBorder?: boolean;
  showMarker?: boolean;
  children?: React.ReactNode;
  targetElementId?: string;
  sidebar?: boolean;
  divider?: { label: string; picker: React.ReactNode };
  borderTargets?: { scope: MenuBorderScope; label: string; elementId: string }[];
  onGroupBorderPanelChange?: (open: boolean) => void;
}

const borderPresets: { id: string; label: string; sides: MenuBorderSide[] }[] = [
  { id: 'outline', label: 'Contorno', sides: sides.map(({ id }) => id) },
  { id: 'horizontal', label: 'Horizontais', sides: ['top', 'bottom'] },
  { id: 'vertical', label: 'Verticais', sides: ['left', 'right'] },
  { id: 'top', label: 'Somente superior', sides: ['top'] },
  { id: 'bottom', label: 'Somente inferior', sides: ['bottom'] },
  { id: 'left', label: 'Somente esquerda', sides: ['left'] },
  { id: 'right', label: 'Somente direita', sides: ['right'] },
  { id: 'none', label: 'Sem borda', sides: [] },
];

const borderValues = [
  ['thickness', 'Espessura (px)'],
  ['length', 'Comprimento (%)'],
  ['radius', 'Arredondamento (px)'],
  ['offset', 'Distância (px)'],
] as const;

export function DecorationControls({ style, setStyle, scope: baseScope, id, showBorder = true, showMarker = true, children, targetElementId, sidebar = false, divider, borderTargets, onGroupBorderPanelChange }: DecorationProps) {
  const [panel, setPanel] = React.useState<'line' | 'border' | 'marker' | null>(null);
  const [targetScope, setTargetScope] = React.useState(baseScope);
  const [customScope, setCustomScope] = React.useState<MenuBorderScope | null>(null);
  const borderTabId = React.useId();
  const selectedTarget = borderTargets?.find((target) => target.scope === targetScope);
  const scope = baseScope === 'category' && targetScope === 'categoryGroup'
    ? 'categoryGroup'
    : selectedTarget?.scope ?? baseScope;
  const border = getBorderConfiguration(style, scope, id);
  const surfaceId = selectedTarget?.elementId || targetElementId || (id
    ? baseScope === 'category' ? `category-header-${id}` : `product-container-${id}`
    : undefined);
  const geometry = useBorderGeometry(panel === 'border', scope, surfaceId);
  const fitted = geometry && fitBorder(border, geometry);
  const activePreset = borderPresets.find((preset) => preset.sides.length === border.sides.length && preset.sides.every((side) => border.sides.includes(side)));
  const selectedPreset = customScope === scope ? 'custom' : (activePreset?.id ?? 'custom');
  const isGroupBorderOpen = showBorder && panel === 'border' && scope === 'categoryGroup';
  React.useLayoutEffect(() => {
    onGroupBorderPanelChange?.(isGroupBorderOpen);
  }, [isGroupBorderOpen, onGroupBorderPanelChange]);

  const change = (update: Partial<MenuBorder>) => {
    if (update.offset !== undefined && update.offset > (fitted?.border.offset ?? border.offset) && border.sides.length) {
      findBorderSurface(scope, surfaceId)?.dispatchEvent(new Event('automenu:border-offset-increase', { bubbles: true }));
    }
    setStyle(previous => {
      const next = { ...getBorderConfiguration(previous, scope, id), ...update };
      const safeBorder = geometry ? { ...fitBorder(next, geometry).border, sides: next.sides } : next;
      return scope === 'freeText'
        ? { ...previous, freeTextBorders: { ...previous.freeTextBorders, [id!]: safeBorder }, name: 'Custom' }
        : { ...previous, borders: { ...previous.borders, [scope]: safeBorder }, name: 'Custom' };
    });
  };
  const markerScope = baseScope === 'category' || baseScope === 'product' ? baseScope : null;
  const markerLabel = markerScope === 'category' ? 'Marcadores das categorias' : 'Marcadores dos produtos';
  const borderLabel = baseScope === 'header' ? 'Borda do título e subtítulo' : baseScope === 'price' ? 'Borda do preço'
    : baseScope === 'productImage' ? 'Borda da foto' : 'Borda';
  const buttonClass = (active: boolean) => `grid place-items-center border transition-colors ${sidebar
    ? 'min-h-12 min-w-0 flex-1 content-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-semibold'
    : 'size-6 shrink-0 rounded'} ${active ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`;
  const iconSize = sidebar ? 16 : 14;

  return <div data-sidebar-decorations={sidebar ? baseScope : undefined} className={sidebar ? 'space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5' : 'space-y-2'}>
    <div className={sidebar ? 'flex items-stretch gap-2' : `flex flex-wrap items-center gap-1 ${children ? 'justify-center' : ''}`}>
      {children}
      {divider && <button type="button" title={divider.label} aria-label={divider.label} aria-expanded={panel === 'line'}
        className={buttonClass(panel === 'line')} onClick={() => setPanel(panel === 'line' ? null : 'line')}>
        <Minus size={iconSize} />
        {sidebar && 'Linha'}
      </button>}
      {showBorder && <button type="button" title={borderLabel} aria-label={borderLabel} aria-expanded={panel === 'border'}
        className={buttonClass(panel === 'border')} onClick={() => {
          const opening = panel !== 'border';
          if (opening && !activeBorder(style, scope, id) && !border.sides.length) change({ sides: borderPresets[0].sides });
          setPanel(opening ? 'border' : null);
        }}><Square size={iconSize} />{sidebar && 'Borda'}</button>}
      {markerScope && showMarker && <button type="button" title={markerLabel} aria-label={markerLabel} aria-expanded={panel === 'marker'}
        className={buttonClass(panel === 'marker')} onClick={() => setPanel(panel === 'marker' ? null : 'marker')}>
        <List size={iconSize} />
        {sidebar && 'Marcadores'}
      </button>}
    </div>
    {panel === 'line' && divider?.picker}
    {showBorder && panel === 'border' && <div data-border-panel className="space-y-2 rounded-md border border-slate-200 bg-white p-2">
      {baseScope === 'category' && (
        <div role="tablist" aria-label="Borda da categoria" className="flex rounded-md bg-slate-100 p-0.5">
          {(['category', 'categoryGroup'] as const).map((tab) => (
            <button key={tab} id={`${borderTabId}-${tab}`} type="button" role="tab"
              aria-selected={scope === tab} aria-controls={borderTabId} tabIndex={scope === tab ? 0 : -1}
              onClick={() => setTargetScope(tab)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                const next = tab === 'category' ? 'categoryGroup' : 'category';
                setTargetScope(next);
                document.getElementById(`${borderTabId}-${next}`)?.focus();
              }}
              className={`flex-1 rounded px-2 py-1.5 text-xs font-medium ${scope === tab ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}`}>
              {tab === 'category' ? 'Texto da categoria' : 'Grupo'}
            </button>
          ))}
        </div>
      )}
      <div id={baseScope === 'category' ? borderTabId : undefined} role={baseScope === 'category' ? 'tabpanel' : undefined}
        aria-labelledby={baseScope === 'category' ? `${borderTabId}-${scope}` : undefined} className="space-y-2">
      {borderTargets && borderTargets.length > 1 && <select aria-label="Aplicar borda em" value={scope}
        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"
        onChange={(event) => setTargetScope(event.target.value as MenuBorderScope)}>
        {borderTargets.map((target) => <option key={target.scope} value={target.scope}>{target.label}</option>)}
      </select>}
      <div className="space-y-1.5">
        {selectedPreset === 'custom' && <div className="flex flex-wrap gap-1" aria-label="Lados individuais da borda" role="group">
          {sides.map(({ id, label }) => {
            const active = border.sides.includes(id);
            return <button type="button" key={id} title={label} aria-label={label} aria-pressed={active}
              className={`rounded border px-1.5 py-1 text-[11px] ${active ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}
              onClick={() => change({ sides: active ? border.sides.filter(side => side !== id) : [...border.sides, id] })}>{label}</button>;
          })}
        </div>}
        <select aria-label="Lados da borda" value={selectedPreset}
          className="h-8 w-full rounded-md border border-slate-200 text-xs"
          onChange={(event) => {
            const preset = borderPresets.find(({ id }) => id === event.target.value);
            if (preset) {
              if (customScope === scope) setCustomScope(null);
              change({ sides: preset.sides });
            } else {
              setCustomScope(scope);
            }
          }}>
          {borderPresets.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          <option value="custom">Personalizada</option>
        </select>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600">Cor da borda
        <ColorPicker value={border.color} onChange={color => change({ color })} label="Cor da borda" />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600">Cor de preenchimento
        <ColorPicker label="Cor de preenchimento" value={getSurfaceFill(style, scope, id) || (scope === 'product' ? style.cardBackgroundColor : undefined) || '#ffffff'}
          preview={scope === 'product' && style.layoutMode !== 'list' ? 'cards' : undefined}
          onChange={color => setStyle(previous => withSurfaceFill(previous, scope, id, color))} />
      </div>
      <select aria-label="Traço da borda" value={border.pattern} onChange={event => change({ pattern: event.target.value as MenuBorder['pattern'] })}
        className="h-8 w-full rounded-md border border-slate-200 text-xs">
        {patterns.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      {borderValues.map(([key, label]) => {
        const value = fitted?.border[key] ?? border[key];
        const [min, max] = fitted?.limits[key] ?? [value, value];
        return (
        <div key={key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2">
          <label className="text-xs font-medium text-slate-600">
            {label}
            <input type="range" min={min} max={max} value={value}
              className="block w-full accent-indigo-600" onChange={event => change({ [key]: event.currentTarget.valueAsNumber })} />
          </label>
          <FontSizeInput label={label} min={min} max={max} value={value} onChange={value => change({ [key]: value })} />
        </div>
        );
      })}
      {activeBorder(style, scope, id) && <button type="button" className="text-xs font-semibold text-indigo-700"
        onClick={() => {
          if (customScope === scope) setCustomScope(null);
          setStyle(previous => scope === 'freeText'
            ? { ...previous, freeTextBorders: Object.fromEntries(Object.entries(previous.freeTextBorders || {}).filter(([key]) => key !== id)) }
            : { ...previous, borders: { ...previous.borders, [scope]: undefined } });
        }}>Restaurar borda do modelo</button>}
      </div>
    </div>}
    {markerScope && showMarker && panel === 'marker' && <MarkerControls label={markerLabel} color={style.primaryColor}
      marker={getMarker(style, markerScope)}
      onChange={marker => setStyle(previous => ({ ...previous, markers: { ...previous.markers, [markerScope]: marker }, name: 'Custom' }))}
      onRevert={(id, fallback) => setStyle(previous => {
        const current = getMarker(previous, markerScope);
        if (typeof current !== 'object' || current.id !== id) return previous;
        return { ...previous, markers: { ...previous.markers, [markerScope]: fallback }, name: 'Custom' };
      })}
      onRemove={id => setStyle(previous => {
        const category = getMarker(previous, 'category');
        const product = getMarker(previous, 'product');
        const matchesCategory = typeof category === 'object' && category.id === id;
        const matchesProduct = typeof product === 'object' && product.id === id;
        if (!matchesCategory && !matchesProduct) return previous;
        return {
          ...previous,
          name: 'Custom',
          markers: {
            ...previous.markers,
            ...(matchesCategory ? { category: 'none' } : {}),
            ...(matchesProduct ? { product: 'none' } : {}),
          },
        };
      })} />}
  </div>;
}
