import React from 'react';
import { List, Square } from 'lucide-react';
import type { MenuBorder, MenuBorderScope, MenuBorderSide, MenuMarker, MenuStyle } from '../../types';
import { resolveMenuPageDimensions } from '../../utils/pageSetup';
import { resolveMenuMargins } from '../../utils/styleRules';
import { ColorPicker } from './ColorPicker';
import { FontSizeInput } from './FontSizeInput';
import { fitBorder, observeBorderGeometry, type BorderGeometry } from './borderGeometry';

const sides: { id: MenuBorderSide; label: string }[] = [
  { id: 'top', label: 'Acima' }, { id: 'right', label: 'Direita' },
  { id: 'bottom', label: 'Abaixo' }, { id: 'left', label: 'Esquerda' },
];

const patterns: [MenuBorder['pattern'], string][] = [
  ['solid', 'Contínua'], ['dashed', 'Tracejada'], ['dotted', 'Pontilhada'], ['double', 'Dupla'],
];

const markers: [MenuMarker, string, string][] = [
  ['none', 'Sem marcador', '—'],
  ['dot', 'Ponto', '•'],
  ['circle', 'Círculo', '○'],
  ['diamond', 'Losango', '◆'],
  ['arrow', 'Seta', '→'],
  ['check', 'Visto', '✓'],
  ['dash', 'Traço', '–'],
  ['number', 'Número com ponto', '1.'],
  ['number-circle', 'Número em círculo', '①'],
  ['number-square', 'Número em quadrado', '1'],
  ['number-padded', 'Número com zero', '01'],
];

function activeBorder(style: MenuStyle, scope: MenuBorderScope, id?: string) {
  return scope === 'freeText' ? style.freeTextBorders?.[id || ''] : style.borders?.[scope];
}

export function getBorderOverride(style: MenuStyle, scope: MenuBorderScope, id?: string) {
  return activeBorder(style, scope, id) ? 'true' : undefined;
}

function getBorderConfiguration(style: MenuStyle, scope: MenuBorderScope, id?: string): MenuBorder {
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
    const rounded = { ...border, radius: style.globalRadius ?? 12 };
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
  if (scope === 'productImage' && style.design?.product === 'featured') return { ...border, sides: ['bottom'], thickness: 3 };
  return border;
}

export function BorderDecoration({ style, scope, id }: { style: MenuStyle; scope: MenuBorderScope; id?: string }) {
  const border = activeBorder(style, scope, id);
  return border?.sides.length ? <SafeBorder border={border} /> : null;
}

function useBorderGeometry(enabled: boolean, scope?: MenuBorderScope, id?: string, anchor?: React.RefObject<HTMLElement | null>) {
  const [geometry, setGeometry] = React.useState<BorderGeometry | null>(null);
  React.useLayoutEffect(() => {
    if (!enabled) return;
    const selector = `[data-menu-border-surface="${scope}"]`;
    const target = id ? document.getElementById(id) : null;
    const surface = anchor?.current?.parentElement
      ?? target?.closest<HTMLElement>(selector)
      ?? target?.querySelector<HTMLElement>(selector)
      ?? document.querySelector<HTMLElement>(`[data-menu-print-page] ${selector}`);
    if (!surface) return;
    return observeBorderGeometry(surface, (next) => setGeometry((current) => (
      JSON.stringify(current) === JSON.stringify(next) ? current : next
    )));
  }, [anchor, enabled, id, scope]);
  return geometry;
}

function SafeBorder({ border }: { border: MenuBorder }) {
  const anchor = React.useRef<HTMLSpanElement>(null);
  const geometry = useBorderGeometry(true, undefined, undefined, anchor);
  const fitted = geometry && fitBorder(border, geometry);
  return <>
    <span ref={anchor} hidden />
    {fitted && <BorderShape border={fitted.border} outsets={fitted.outsets} />}
  </>;
}

function BorderShape({ border, outsets }: { border: MenuBorder; outsets?: Record<MenuBorderSide, number> }) {
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
      borderRadius: border.radius,
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
  const number = Math.max(1, index + 1);
  const framed = marker === 'number-circle' || marker === 'number-square' || marker === 'number-padded';
  const content = marker === 'number' ? `${number}.` : marker === 'number-padded' ? String(number).padStart(2, '0')
    : framed ? number : markers.find(([id]) => marker === id)?.[2];
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

const edgeClasses: Record<MenuBorderSide, string> = {
  top: 'inset-x-7 top-0 h-5 border-b-2',
  right: 'inset-y-5 right-0 w-7 border-l-2',
  bottom: 'inset-x-7 bottom-0 h-5 border-t-2',
  left: 'inset-y-5 left-0 w-7 border-r-2',
};

export function DecorationControls({ style, setStyle, scope, id, showBorder = true, showMarker = true, children, targetElementId }: DecorationProps) {
  const [panel, setPanel] = React.useState<'border' | 'marker' | null>(null);
  const border = getBorderConfiguration(style, scope, id);
  const geometry = useBorderGeometry(panel === 'border', scope, targetElementId || (id ? `product-container-${id}` : undefined));
  const fitted = geometry && fitBorder(border, geometry);
  const preview = fitted?.border ?? border;
  const activePreset = borderPresets.find((preset) => preset.sides.length === border.sides.length && preset.sides.every((side) => border.sides.includes(side)));
  const change = (update: Partial<MenuBorder>) => setStyle(previous => {
    const next = { ...getBorderConfiguration(previous, scope, id), ...update };
    const safeBorder = geometry ? { ...fitBorder(next, geometry).border, sides: next.sides } : next;
    return scope === 'freeText'
      ? { ...previous, freeTextBorders: { ...previous.freeTextBorders, [id!]: safeBorder }, name: 'Custom' }
      : { ...previous, borders: { ...previous.borders, [scope]: safeBorder }, name: 'Custom' };
  });
  const markerScope = scope === 'category' || scope === 'product' ? scope : null;
  const markerLabel = markerScope === 'category' ? 'Marcadores das categorias' : 'Marcadores dos produtos';
  const borderLabel = scope === 'header' ? 'Borda do título e subtítulo' : scope === 'price' ? 'Borda do preço'
    : scope === 'productImage' ? 'Borda da foto' : 'Borda';
  const buttonClass = (active: boolean) => `grid size-6 shrink-0 place-items-center rounded border ${active ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`;

  return <div className="space-y-2">
    <div className={`flex flex-wrap items-center gap-1 ${children ? 'justify-center' : ''}`}>
      {children}
      {showBorder && <button type="button" title={borderLabel} aria-label={borderLabel} aria-expanded={panel === 'border'}
        className={buttonClass(panel === 'border')} onClick={() => {
          const opening = panel !== 'border';
          if (opening && !activeBorder(style, scope, id) && !border.sides.length) change({ sides: borderPresets[0].sides });
          setPanel(opening ? 'border' : null);
        }}><Square size={14} /></button>}
      {markerScope && showMarker && <button type="button" title={markerLabel} aria-label={markerLabel} aria-expanded={panel === 'marker'}
        className={buttonClass(panel === 'marker')} onClick={() => setPanel(panel === 'marker' ? null : 'marker')}>
        <List size={14} />
      </button>}
    </div>
    {showBorder && panel === 'border' && <div data-border-panel className="space-y-2 rounded-md border border-slate-200 bg-white p-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="relative h-20 overflow-hidden rounded bg-slate-50" aria-label="Prévia e lados da borda" role="group">
          <div className="pointer-events-none absolute inset-x-7 inset-y-6">
            <BorderShape border={{ ...preview, thickness: Math.min(7, preview.thickness / 2), offset: Math.max(-7, Math.min(12, preview.offset / 5)) }} />
          </div>
          {sides.map(({ id, label }) => {
            const active = border.sides.includes(id);
            return <button type="button" key={id} title={label} aria-label={label} aria-pressed={active}
              className={`absolute ${edgeClasses[id]} ${active ? 'border-indigo-500 bg-indigo-100/50 hover:bg-indigo-100' : 'border-slate-200 hover:bg-slate-200'}`}
              onClick={() => change({ sides: active ? border.sides.filter(side => side !== id) : [...border.sides, id] })} />;
          })}
        </div>
        <select aria-label="Lados da borda" value={activePreset?.id ?? 'custom'}
          className="h-8 min-w-0 self-center rounded-md border border-slate-200 text-xs"
          onChange={(event) => {
            const preset = borderPresets.find(({ id }) => id === event.target.value);
            if (preset) change({ sides: preset.sides });
          }}>
          {!activePreset && <option value="custom" disabled>Personalizada</option>}
          {borderPresets.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <ColorPicker value={border.color} onChange={color => change({ color })} label="Cor da borda" />
        <select aria-label="Traço da borda" value={border.pattern} onChange={event => change({ pattern: event.target.value as MenuBorder['pattern'] })}
          className="h-8 w-full rounded-md border border-slate-200 text-xs">
          {patterns.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
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
        onClick={() => setStyle(previous => scope === 'freeText'
          ? { ...previous, freeTextBorders: Object.fromEntries(Object.entries(previous.freeTextBorders || {}).filter(([key]) => key !== id)) }
          : { ...previous, borders: { ...previous.borders, [scope]: undefined } })}>Restaurar borda do modelo</button>}
    </div>}
    {markerScope && showMarker && panel === 'marker' && <select aria-label={markerLabel} value={getMarker(style, markerScope)}
      className="h-8 w-full rounded-md border border-slate-200 bg-white text-xs"
      onChange={event => {
        const marker = event.target.value as MenuMarker;
        setStyle(previous => ({ ...previous, markers: { ...previous.markers, [markerScope]: marker }, name: 'Custom' }));
      }}>
      {markers.map(([key, label, glyph]) => <option key={key} value={key}>{glyph} {label}</option>)}
    </select>}
  </div>;
}
