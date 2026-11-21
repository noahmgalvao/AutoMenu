import { MINI_FOOD_INK, miniFoodArtwork, type MiniFoodKind } from './miniFoods';

const tile = (width: number, height: number, content: string) =>
  'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>`,
  );

const flecks = (count: number, width: number, height: number, draw: (x: number, y: number, index: number) => string) =>
  Array.from({ length: count }, (_, index) =>
    draw(3 + (index * 37.73) % (width - 6), 3 + (index * index * 7.39 + index * 11.7) % (height - 6), index)).join('');

const paper = (ink: string, count: number) => tile(97, 89, `<g fill="${ink}" opacity=".13">${flecks(count, 97, 89, (x, y, i) =>
  `<ellipse cx="${x}" cy="${y}" rx="${i % 3 === 0 ? 1.2 : .55}" ry=".55"/>`)}</g>`);

const patterns = {
  'natural-paper': ['Papel natural', paper('#8b7359', 92)],
  'rice-paper': ['Papel arroz', paper('#9a8c71', 64)],
  'linen-fine': ['Linho fino', tile(16, 16, '<path d="M0 3H16M0 11H16M3 0V16M11 0V16" stroke="#857260" stroke-width=".65" opacity=".15"/><path d="M0 7H16M7 0V16M0 15H16M15 0V16" stroke="#fff" opacity=".22"/>')],
  'kraft-grain': ['Kraft granulado', tile(103, 101, `<g stroke="#69401f" opacity=".2" stroke-linecap="round">${flecks(54, 103, 101, (x, y, i) => `<path d="M${x} ${y}l${i % 4} ${i % 3 - 1}" stroke-width=".65"/>`)}</g>`)],
  'chalk-dust': ['Pó de lousa', tile(147, 131, `<ellipse cx="72" cy="68" rx="65" ry="46" fill="#ede8da" opacity=".025"/><g fill="#faf3dd" opacity=".16">${flecks(103, 147, 131, (x, y) => `<circle cx="${x}" cy="${y}" r=".65"/>`)}</g>`)],
  'mini-terrazzo': ['Terrazzo miúdo', tile(155, 129, flecks(23, 155, 129, (x, y, i) => `<path transform="translate(${x} ${y}) rotate(${i * 41})" d="M-2 1Q-3-3 1-2L4 0Q5 2 1 3Z" fill="${['#8e604f', '#556a79', '#af6a7c'][i % 3]}" opacity=".19"/>`))],
  'fine-marble': ['Mármore de veios finos', tile(240, 144, '<g fill="none" stroke="#9f8b82" opacity=".21"><path d="M0 41C70 41 54 116 116 85S183 41 240 41M0 46C67 46 57 120 118 90S187 46 240 46" stroke-width=".85"/><path d="M49 65Q72 73 104 52T159 57" stroke-width=".5"/></g>')],
  'smoked-wood': ['Madeira defumada', tile(194, 95, '<g fill="none" stroke="#b28467" opacity=".23"><path d="M0 17C52 17 49 33 102 23S150 17 194 17M0 32C58 32 87 42 119 35S160 32 194 32M0 63C32 63 67 54 101 58S141 63 194 63M0 70C32 70 67 61 101 65S141 70 194 70"/><ellipse cx="105" cy="20" rx="16" ry="3"/></g>')],
  'tonal-waves': ['Ondas em tom sobre tom', tile(160, 90, '<path d="M0 22Q20 22 40 30T80 38T120 30T160 22M0 64Q20 64 40 72T80 80T120 72T160 64" fill="none" stroke="#5295a2" stroke-width="2" opacity=".17"/>')],
  'botanical-sketch': ['Botânico em traço', tile(168, 126, '<g fill="none" stroke="#648354" opacity=".22" stroke-linecap="round"><path d="M26 44Q39 30 43 15M33 36Q14 32 23 23Q33 25 33 36M39 26Q48 12 53 21Q51 27 39 26"/><path d="M118 92Q110 78 104 75M114 85Q122 70 128 79Q126 85 114 85M108 79Q92 83 94 73Q101 70 108 79"/></g>')],
  'vichy-soft': ['Vichy delicado', tile(64, 64, '<g fill="#a54955" opacity=".095"><path d="M0 0H32V64H0Z"/></g><g fill="#a54955" opacity=".095"><path d="M0 0H64V32H0Z"/></g>')],
  'halftone-print': ['Retícula de impressão', tile(36, 36, '<g fill="#503440" opacity=".17"><circle cx="8" cy="8" r="2"/><circle cx="26" cy="8" r="1.2"/><circle cx="8" cy="26" r="1.2"/><circle cx="26" cy="26" r="2.35"/></g>')],
} as const;

export const TEXTURE_OPTIONS = Object.entries(patterns).map(([id, [name]]) => ({ name, url: `texture:${id}` }));
export const isTextureToken = (value?: string) => Boolean(value?.startsWith('texture:'));
export const getTextureTile = (value: string) => patterns[value.slice('texture:'.length) as keyof typeof patterns]?.[1];

export const MINI_FOOD_MIX = 'mini-food:mix';
export type MiniFoodTextureKind = MiniFoodKind | typeof MINI_FOOD_MIX;
export const mixTextureToken = `texture:${MINI_FOOD_MIX}`;
const miniFoodMix: MiniFoodKind[] = ['mini-food:burger', 'mini-food:pizzaCalabresa', 'mini-food:sushi', 'mini-food:espresso', 'mini-food:juice', 'mini-food:popsicle'];

export function miniFoodTextureTile(kind: MiniFoodTextureKind, color = MINI_FOOD_INK, size = 100) {
  const scale = Math.max(.6, Math.min(1.6, Number(size) / 100 || 1));
  const mix = kind === MINI_FOOD_MIX;
  const positions = mix ? [[19, 23], [87, 25], [156, 30], [37, 104], [108, 93], [178, 112]] : [[30, 32], [87, 79]];
  return tile(mix ? 220 : 118, mix ? 157 : 118, positions.map(([x, y], index) => {
    const angle = [-9, 12, -17, 9, 21, -12][index];
    const factor = (index % 2 ? .92 : 1.18) * scale;
    const food = kind === MINI_FOOD_MIX ? miniFoodMix[index] : kind;
    return `<g opacity="${index % 2 ? .12 : .16}" transform="translate(${x} ${y}) rotate(${angle}) scale(${factor}) translate(-12 -12)">${miniFoodArtwork(food, color)}</g>`;
  }).join(''));
}
