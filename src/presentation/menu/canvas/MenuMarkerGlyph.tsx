import { Ban } from 'lucide-react';
import { canvasShapeUrl } from '../../../domain/menu/canvasShapes';
import { isMiniFoodKind, miniFoodIconUrl, type MiniFoodKind } from '../../../domain/menu/miniFoods';
import type { CustomMenuMarker, MenuMarker } from '../../../domain/menu/model';

export const standardMarkers: [Exclude<MenuMarker, CustomMenuMarker | MiniFoodKind>, string, string][] = [
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

export function MenuMarkerGlyph({ marker, index, color, fontSize, preview = false }: { marker: MenuMarker; index: number; color: string; fontSize: number; preview?: boolean }) {
  if (marker === 'none') return preview ? <Ban aria-hidden="true" size={fontSize} className="text-slate-400" /> : null;
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
