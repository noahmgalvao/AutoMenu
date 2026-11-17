import React from 'react';
import { ChevronDown, SquareDashed } from 'lucide-react';
import type { MenuBorder, MenuBorderScope, MenuBorderSide, MenuMarker, MenuStyle } from '../../types';
import { resolveMenuPageDimensions } from '../../utils/pageSetup';
import { resolveMenuMargins } from '../../utils/styleRules';
import { ColorPicker } from './ColorPicker';

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
  if (!border?.sides.length) return null;
  const stroke = `${border.thickness}px ${border.pattern} ${border.color}`;
  const inset = -border.offset;
  if (border.length === 100) {
    return <span aria-hidden="true" className="pointer-events-none absolute z-[1]" style={{
      inset,
      borderTop: border.sides.includes('top') ? stroke : undefined,
      borderRight: border.sides.includes('right') ? stroke : undefined,
      borderBottom: border.sides.includes('bottom') ? stroke : undefined,
      borderLeft: border.sides.includes('left') ? stroke : undefined,
      borderRadius: border.radius,
    }} />;
  }
  return <>{border.sides.map(side => {
    const horizontal = side === 'top' || side === 'bottom';
    return <span key={side} aria-hidden="true" className="pointer-events-none absolute z-[1]" style={{
      [side]: inset,
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

export function MenuMarkerGlyph({ marker, index, color }: { marker: MenuMarker; index: number; color: string }) {
  if (marker === 'none') return null;
  const number = Math.max(1, index + 1);
  const framed = marker === 'number-circle' || marker === 'number-square' || marker === 'number-padded';
  const content = marker === 'number' ? `${number}.` : marker === 'number-padded' ? String(number).padStart(2, '0')
    : framed ? number : markers.find(([id]) => marker === id)?.[2];
  return <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center font-semibold tabular-nums" style={{
    color,
    border: framed ? '1px solid currentColor' : undefined,
    borderRadius: marker === 'number-circle' ? 999 : marker === 'number-square' ? 2 : undefined,
    minWidth: framed ? '1.55em' : undefined,
    paddingInline: framed ? '0.24em' : undefined,
    fontSize: framed ? '0.8em' : '1em',
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
}

export function DecorationControls({ style, setStyle, scope, id, showBorder = true, showMarker = true }: DecorationProps) {
  const border = getBorderConfiguration(style, scope, id);
  const change = (update: Partial<MenuBorder>) => setStyle(previous => {
    const next = { ...getBorderConfiguration(previous, scope, id), ...update };
    return scope === 'freeText'
      ? { ...previous, freeTextBorders: { ...previous.freeTextBorders, [id!]: next }, name: 'Custom' }
      : { ...previous, borders: { ...previous.borders, [scope]: next }, name: 'Custom' };
  });
  const markerScope = scope === 'category' || scope === 'product' ? scope : null;
  const markerLabel = markerScope === 'category' ? 'Marcadores das categorias' : 'Marcadores dos produtos';
  const label = scope === 'header' ? 'Borda do título e subtítulo' : scope === 'price' ? 'Borda do preço'
    : scope === 'productImage' ? 'Borda da foto' : 'Borda';
  return <div className="space-y-2">
    {showBorder && <details className="group/border rounded-lg border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-xs font-semibold text-slate-700">
        <SquareDashed size={15} /> {label}
        <ChevronDown size={14} className="ml-auto group-open/border:rotate-180" />
      </summary>
      <div className="space-y-2 border-t border-slate-100 p-2">
        <div className="grid grid-cols-2 gap-1" aria-label="Lados da borda">
          {sides.map(side => <button key={side.id} type="button" aria-pressed={border.sides.includes(side.id)}
            onClick={() => change({ sides: border.sides.includes(side.id) ? border.sides.filter(item => item !== side.id) : [...border.sides, side.id] })}
            className={`min-h-8 rounded-md border px-1 text-xs ${border.sides.includes(side.id) ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200'}`}>{side.label}</button>)}
        </div>
        <div className="flex items-center gap-2">
          <ColorPicker value={border.color} onChange={color => change({ color })} label="Cor da borda" />
          <select aria-label="Traço da borda" value={border.pattern} onChange={event => change({ pattern: event.target.value as MenuBorder['pattern'] })}
            className="h-8 w-full rounded-md border border-slate-200 text-xs">
            {patterns.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {([
            ['thickness', 'Espessura (px)', 1, 32], ['length', 'Comprimento (%)', 5, 100],
            ['radius', 'Arredondamento (px)', 0, 200], ['offset', 'Distância (px)', -60, 100],
          ] as const).map(([key, label, min, max]) => (
            <label className="text-[10px] text-slate-600" key={key}>{label}
              <input type="number" min={min} max={max} key={border[key]} defaultValue={border[key]}
                className="mt-0.5 h-8 w-full rounded-md border border-slate-200 px-1.5 text-xs"
                onBlur={event => {
                  const value = event.currentTarget.valueAsNumber;
                  if (Number.isFinite(value) && value !== border[key]) change({ [key]: Math.max(min, Math.min(max, value)) });
                }} onKeyDown={event => {
                  if (event.key === 'Enter') { event.stopPropagation(); event.currentTarget.blur(); }
                }} />
            </label>
          ))}
        </div>
        {activeBorder(style, scope, id) && <button type="button" className="text-xs font-semibold text-indigo-700"
          onClick={() => setStyle(previous => scope === 'freeText'
            ? { ...previous, freeTextBorders: Object.fromEntries(Object.entries(previous.freeTextBorders || {}).filter(([key]) => key !== id)) }
            : { ...previous, borders: { ...previous.borders, [scope]: undefined } })}>Restaurar borda do modelo</button>}
      </div>
    </details>}
    {markerScope && showMarker && <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
      {markerLabel}
      <select aria-label={markerLabel} value={getMarker(style, markerScope)} className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white text-xs"
        onChange={event => {
          const marker = event.target.value as MenuMarker;
          setStyle(previous => ({ ...previous, markers: { ...previous.markers, [markerScope]: marker }, name: 'Custom' }));
        }}>
        {markers.map(([key, label, glyph]) => <option key={key} value={key}>{glyph} {label}</option>)}
      </select>
    </label>}
  </div>;
}
