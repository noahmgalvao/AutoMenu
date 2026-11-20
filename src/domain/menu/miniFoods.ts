// Outline drawings share a 24 × 24 grid so they read at marker size and in a repeated texture.
const drawings = {
  acai: ['Açaí na tigela', '<path d="M3 12h18c-1 5-4 8-9 8s-8-3-9-8Zm2 0a7 7 0 0 1 14 0M9 9h.1m3-2h.1m2 3h.1m3 0h.1"/>'],
  onionRings: ['Anéis de cebola', '<circle cx="9" cy="8" r="5"/><circle cx="9" cy="8" r="2.4"/><path d="M13 9a6 6 0 1 1-6 5"/><circle cx="15" cy="15" r="2.6"/>'],
  fries: ['Batata frita', '<path d="M4 10l2 11h12l2-11h-4l-1 3H9l-1-3H4Zm2 0V5h3v5m0 1V3h3v10m0-2V5h3v7m0-1V4h3v6"/>'],
  rib: ['Costela barbecue', '<path d="M4 9c1-3 7-6 13-6l4 3-4 8-3 1-2 4c-1 2-4 1-3-1l1-2-3 1-1 3c-1 2-4 1-3-1l2-5Zm3 2 10-4m-8 7 7-3"/>'],
  steak: ['Bife grelhado', '<path d="M8 4c5-2 12 1 13 6 2 5-2 9-8 10-5 1-10-1-10-5 0-3 3-4 4-6 0-2-1-4 1-5Z M8 14l6-6m-3 8 7-7m-3 7 4-4"/>'],
  layerCake: ['Bolo em fatia', '<path d="m3 11 13-7 5 6v10H3V11Zm0 0h18M3 15h18m-9-9c0-2 2-3 3-2"/>'],
  brigadeiro: ['Brigadeiro', '<path d="M5 13a7 7 0 0 1 14 0m-15 0h16l-3 7H7l-3-7Zm4-3 1 1m2-4 1 1m2 2 1 1m1-3 1 1m-7 6 1 5m3-5-1 5"/>'],
  brownie: ['Brownie', '<path d="m3 10 7-6 11 4v8l-7 5-11-4v-7Zm0 0 11 4 7-6m-7 6v7M8 11l2-3 2 2 3-2 2 2"/>'],
  burrito: ['Burrito', '<path d="m4 13 9-10 7 2 1 7-9 9-7-1Zm9-10 1 5 5 1 2 3M4 13l7 2 1 6m4-15h.1m2 1h.1m-1-3h.1"/>'],
  hotDog: ['Cachorro-quente', '<path d="M4 13 13 4c3-3 7-1 7 2 2 1 2 4 0 6l-8 8c-3 3-8 0-7-3-2-1-2-3-1-4Zm2 4L18 5m-9 9v-3h4V8h3"/>'],
  espresso: ['Café expresso', '<path d="M5 9h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V9Zm12 1h3a2.5 2.5 0 0 1 0 5h-3M3 21h18M9 6c-2-1 2-2 0-4m4 4c-2-1 2-2 0-4"/>'],
  cappuccino: ['Cappuccino', '<path d="M3 10h16c0 5-3 8-8 8s-8-3-8-8Zm16 0h2a2 2 0 0 1 0 4h-3M3 21h17M5 10c0-4 3-6 6-5 3-1 6 1 6 5m-8 0 2-2 2 2"/>'],
  iceCreamCone: ['Casquinha de sorvete', '<path d="M6 12a6 6 0 1 1 12 0H6Zm1 0 5 9 5-9m-7 0 4 5m1-5-4 6"/>'],
  beer: ['Cerveja', '<path d="M5 9h12v11H5V9Zm12 2h3a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-3M5 9c-3-2 0-5 2-4 1-3 5-3 6 0 3-1 6 1 4 4M9 12v5m4-5v5"/>'],
  barbecue: ['Churrasco no espeto', '<path d="m3 21 4-4m10-10 4-4M5 14l4-4 5 5-4 4Zm5-5 4-4 5 5-4 4Zm-4 3 6 6m0-11 6 6"/>'],
  churros: ['Churros', '<path d="m4 15 9-11 4 3-9 11Zm7 3 7-10 4 3-7 10Zm-5-2 9-11m-2 14 7-10M5 6h.1m3-2h.1m12 0h.1"/>'],
  cocktail: ['Coquetel', '<path d="M3 6h18l-9 10-9-10Zm9 10v5m-4 0h8M7 10h10m-4 0 4-7h4"/>'],
  cookie: ['Cookie', '<path d="M20 9c-4 1-6-2-5-5-5-3-12 2-12 8a9 9 0 0 0 18 1l-1-4ZM8 9h1m3 4h1m-5 3h1m7 1h1"/>'],
  coxinha: ['Coxinha', '<path d="M12 3c1 4 7 7 7 12a7 7 0 1 1-14 0c0-5 6-8 7-12ZM8 15c0 2 1 3 2 3"/>'],
  croissant: ['Croissant', '<path d="M3 17c0-7 4-12 9-12s9 5 9 12c-2-2-5-3-9-3s-7 1-9 3Zm5-11 1 8m7-8-1 8M5 9l2 6m12-6-2 6"/>'],
  popsicle: ['Picolé', '<path d="M7 16V8a5 5 0 0 1 10 0v8H7Zm4 0v4a1 1 0 0 0 2 0v-4M8 8l8-2M8 12l8-2"/>'],
  spaghetti: ['Espaguete', '<path d="M3 14h18c-1 4-4 6-9 6s-8-2-9-6Zm3 0c0-8 12-8 12 0m-10 0c0-5 8-5 8 0m-6 0c0-2 4-2 4 0m0-8 5-3m-3 5 5-3"/>'],
  esfiha: ['Esfiha', '<path d="M3 16 10 5c1-2 3-2 4 0l7 11c1 2 0 4-2 4H5c-2 0-3-2-2-4Zm4 0 5-8 5 8H7Zm4-2h.1m3 1h.1"/>'],
  feijoada: ['Feijoada', '<path d="M3 12h18l-2 7H5l-2-7Zm-1 0c0-2 4-3 10-3s10 1 10 3M7 11h.1m4 1h.1m4-1h.1m2 1h.1M9 6c-2-1 2-2 0-4m5 4c-2-1 2-2 0-4"/>'],
  frappe: ['Frappé', '<path d="M6 10h12l-2 11H8L6 10Zm1 0a5 5 0 0 1 10 0m-4-5 3-3h4M9 13l5 4m0-5-4 5"/>'],
  friedChicken: ['Frango frito', '<path d="M9 15C5 11 11 3 16 3c4 0 6 4 4 8-1 3-5 6-9 6l-2 2c0 2-2 3-3 1-2 0-3-2-1-3l4-2Zm5-7 1-1m1 5 1-1"/>'],
  burger: ['Hambúrguer', '<path d="M4 15h16a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Zm.2-6A8 6 0 0 1 12 4a8 6 0 0 1 7.8 5H4.2ZM5 12h14"/>'],
  hotRoll: ['Hot roll', '<ellipse cx="12" cy="8" rx="8" ry="4"/><ellipse cx="12" cy="8" rx="3" ry="1.5"/><path d="M4 8v8c0 3 4 4 8 4s8-1 8-4V8M7 14h.1m2 3h.1m5-2h.1m3 2h.1"/>'],
  lasagna: ['Lasanha', '<path d="m3 9 7-5 11 4v8l-7 5-11-4V9Zm0 0 11 4 7-5M3 13l11 4 7-5m-7 1v8M9 8h.1m3-1h.1m2 3h.1"/>'],
  lemonade: ['Limonada', '<path d="M4 8h13l-2 13H6L4 8Zm1 5h11m-5-3 3-8h4m-1 9a4 4 0 1 0 0-8m2 3-2 2m2-2 3 1"/>'],
  milkshake: ['Milk-shake', '<path d="M6 11h12l-2 10H8l-2-10Zm1 0C4 8 8 7 9 7c-1-2 2-4 4-3 0 1 2 2 3 2 2 1 3 3 1 5m-4-7 3-2h3m-8 12 1 4"/>'],
  nachos: ['Nachos', '<path d="m3 18 5-11 6 10-11 1Zm8-9 8-4 2 11-5-2m-2 5 4-6 4 6h-8Zm-7-4h.1m3-2h.1m7-4h.1"/>'],
  nuggets: ['Nuggets', '<path d="M4 12c-2-2-1-6 2-7 2-1 4-1 5 1 2 2 0 6-3 7-2 1-3 0-4-1Zm8 3c0-3 3-6 6-5 3 0 4 4 2 6-1 3-4 5-6 3-2-1-2-2-2-4Zm-5-6h.1m11 5h.1"/>'],
  cheeseBread: ['Pão de queijo', '<path d="M3 15c0-4 3-7 7-7s7 3 7 7c0 3-2 5-7 5s-7-2-7-5Zm10-7c2-4 8-3 8 2 0 3-2 4-4 4M7 13h.1m4 0h.1m-2 3h.1m8-7h.1"/>'],
  pastel: ['Pastel', '<path d="m4 14 9-10 8 7-9 10-8-7Zm2 1 9-10m-4 15 9-10M8 15l5 4m-2-10 5 4"/>'],
  fish: ['Peixe grelhado', '<path d="M3 12c4-6 10-7 14-3l4-3v12l-4-3c-4 4-10 3-14-3Zm5-1h.1m3-2 2 3-2 3"/>'],
  pizzaCalabresa: ['Pizza de calabresa', '<path d="M12 21 3 7c5-5 13-5 18 0l-9 14ZM5 10c4-3 10-3 14 0"/><circle cx="9" cy="11" r="1.3"/><circle cx="14" cy="12" r="1.3"/><circle cx="12" cy="16" r="1.3"/>'],
  poke: ['Poke', '<path d="M3 12h18c-1 5-4 8-9 8s-8-3-9-8ZM5 12V8l4-2 3 2 4-2 3 2v4m-10 0V9m6 3V9m0-3 5-3m-2 3 4-2"/>'],
  kibbeh: ['Quibe', '<path d="M3 12c4-4 6-7 9-7s5 3 9 7c-4 4-6 7-9 7s-5-3-9-7Zm6 0 3-3m-1 6 4-4"/>'],
  soda: ['Refrigerante', '<path d="M8 3h8m-8 0v3L6 8v12l2 1h8l2-1V8l-2-2V3M6 10h12M6 17h12m-8-3c2-2 3 2 5 0"/>'],
  springRoll: ['Rolinho primavera', '<path d="m4 14 10-9c2-2 6-1 7 1 1 2 0 4-2 6l-9 8-6-6Zm10-9 6 6M6 12l6 6m3-10 2-1m0 3 2-1"/>'],
  caesar: ['Salada Caesar', '<path d="M3 13h18c-1 4-4 7-9 7s-8-3-9-7Zm2 0V8c0-2 3-3 4-1 1-4 6-4 7 0 2-2 4 0 3 3v3m-9-1 2-2 2 2"/>'],
  sandwich: ['Sanduíche', '<path d="M3 12c3-5 10-8 16-7 3 1 3 3 1 5L6 16c-3 1-5-2-3-4Zm0 2 1 4c1 2 4 2 6 1l10-5 1-4M8 11l2-3m3 1 2-3"/>'],
  juice: ['Suco de laranja', '<path d="M4 9h13l-2 12H6L4 9Zm1 4h11m-5-4 3-6h4m-1 6h5a5 5 0 0 0-5-5v5Zm1-3 2 2"/>'],
  sundae: ['Sundae', '<path d="M4 10h16l-3 6H7l-3-6Zm8 6v4m-4 1h8M6 10a6 6 0 0 1 12 0m-5-6 2-2m-4 5 2 3m2-3 1 3"/>'],
  sushi: ['Sushi', '<ellipse cx="12" cy="8" rx="8" ry="4"/><circle cx="12" cy="8" r="1.5"/><path d="M4 8v8c0 2 4 4 8 4s8-2 8-4V8"/>'],
  taco: ['Taco', '<path d="M3 17A9 9 0 0 1 21 17H3Zm1-3c0-2 2-3 4-2-1-3 2-5 4-3 2-2 4-1 5 1 2 0 4 2 4 4M8 14h.1m4-2h.1m4 2h.1"/>'],
  tapioca: ['Tapioca', '<path d="M3 14c2-6 13-10 17-4l1 3c-5 5-13 7-18 4v-3Zm1 2c5 1 13-2 16-6M7 12h.1m4-2h.1m3 2 2-2"/>'],
  temaki: ['Temaki', '<path d="m5 10 7 11 8-12c-2-3-12-3-15 1Zm1-1C4 6 8 3 10 5c1-3 4-3 6 0 3-1 5 1 4 4m-12 5 8-2m-5-4 2-2"/>'],
  yakisoba: ['Yakisoba', '<path d="M3 12h18l-2 8H5l-2-8Zm3 0c-2-6 5-7 5-3s4 3 4 0m-2-1 6-5m-2 7 5-5M8 16h8"/>'],
} as const;

export type MiniFoodId = keyof typeof drawings;
export type MiniFoodKind = `mini-food:${MiniFoodId}`;

export const MINI_FOODS = (Object.keys(drawings) as MiniFoodId[])
  .map(id => ({ id, name: drawings[id][0], kind: `mini-food:${id}` as const }))
  .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

export function isMiniFoodKind(kind: string): kind is MiniFoodKind {
  return kind.startsWith('mini-food:') && Object.prototype.hasOwnProperty.call(drawings, kind.slice('mini-food:'.length));
}

export const MINI_FOOD_INK = '#9a3412';

const drawing = (kind: MiniFoodKind) => drawings[kind.slice('mini-food:'.length) as MiniFoodId][1];
const ink = `fill="none" stroke="${MINI_FOOD_INK}" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"`;
export const miniFoodArtwork = (kind: MiniFoodKind) => `<g ${ink}>${drawing(kind)}</g>`;

function svgUrl(svg: string) {
  return `data:image/svg+xml,${encodeURIComponent(svg).replace(/\(/g, '%28').replace(/\)/g, '%29')}`;
}

export function miniFoodIconUrl(kind: MiniFoodKind) {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${ink}>${drawing(kind)}</svg>`);
}

export function miniFoodTextureUrl(kind: MiniFoodKind) {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123" viewBox="0 0 794 1123"><defs><pattern id="tile" width="118" height="118" patternUnits="userSpaceOnUse"><g ${ink}><g transform="translate(16 18) rotate(-9 12 12) scale(1.18)" opacity=".16">${drawing(kind)}</g><g transform="translate(76 68) rotate(12 12 12) scale(.92)" opacity=".12">${drawing(kind)}</g></g></pattern></defs><rect width="794" height="1123" fill="url(#tile)"/></svg>`);
}
