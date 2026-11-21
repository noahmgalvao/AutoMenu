import { getTextureTile, isTextureToken, MINI_FOOD_MIX, miniFoodTextureTile, mixTextureToken, TEXTURE_OPTIONS, type MiniFoodTextureKind } from './textureTiles';
import { MINI_FOODS, miniFoodTextureUrl, type MiniFoodKind } from './miniFoods';
import type { FontSizeLimits, MenuContentSpacing, MenuMargins, Product, MenuStyle } from './model';

export const DEFAULT_FONT_SIZE_LIMITS: FontSizeLimits = {
  menuTitle: 120,
  menuSubtitle: 50,
  category: 50,
  productName: 50,
  productPrice: 60,
  productDescription: 35,
  freeText: 70,
};

export const DEFAULT_MINIMUM_FONT_SIZE = 15;

export const DEFAULT_MENU_MARGINS: MenuMargins = {
  top: 48,
  bottom: 48,
  left: 48,
  right: 48,
  columnGap: 32,
};

export const DEFAULT_MENU_CONTENT_SPACING: MenuContentSpacing = {
  headerToContent: 20,
  categoryToProduct: 16,
  productNameToDescription: 4,
  betweenProducts: 16,
  productNameToPrice: 4,
};

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: '1',
    name: 'Hamburguer Classico',
    description: 'Carne angus, cheddar, alface, tomate e molho da casa.',
    price: 13,
    category: 'Hamburgueres',
    image: ''
  },
  {
    id: '2',
    name: 'Batata Trufada',
    description: 'Batatas crocantes com azeite trufado e parmesao.',
    price: 7,
    category: 'Acompanhamentos',
    image: ''
  },
  {
    id: '3',
    name: 'Salada Caesar',
    description: 'Alface romana, croutons, parmesao e molho caesar.',
    price: 10,
    category: 'Saladas',
    image: ''
  },
  {
    id: '4',
    name: 'Bolo Vulcao de Chocolate',
    description: 'Bolo quente de chocolate com recheio cremoso e sorvete.',
    price: 9,
    category: 'Sobremesas',
    image: ''
  },
  {
    id: '5',
    name: 'Pizza Margherita',
    description: 'Molho de tomate, mozzarella fresca e manjericao.',
    price: 15,
    category: 'Pizzas',
    image: ''
  }
];

export { PRESET_TEMPLATES } from '../templates/templateCatalog';
export const NO_TEMPLATE_ID = 'sem-modelo';

// Classic design from constants.ts at 1610606, independent of the library.
export const INITIAL_STYLE: MenuStyle = {
  id: NO_TEMPLATE_ID, name: 'Sem modelo', appliedTemplateId: null,
  menuTitle: 'CARDÁPIO', menuSubtitle: 'Seleção da Casa',
  fontFamily: 'Inter', backgroundColor: '#ffffff', textColor: '#111827', primaryColor: '#3730a3',
  cardBackgroundColor: '#f8fafc', backgroundImage: '', layoutMode: 'list',
  columnCount: 1, categoryColumnCount: 1, hiddenProductIds: [],
  showImages: true, showCategoryImages: true, imageScale: 1, categoryImageScale: 1,
  showPrices: true, showCurrencySymbol: true, showPageNumbers: true, priceDecimalPlaces: 'auto', priceDecimalSeparator: ',',
  pageSetup: { preset: 'A4', orientation: 'portrait', widthMm: 210, heightMm: 297 },
  pagePadding: 56, itemGap: 18, globalRadius: 16,
  margins: { top: 56, right: 56, bottom: 56, left: 56, columnGap: DEFAULT_MENU_MARGINS.columnGap },
  contentSpacing: { ...DEFAULT_MENU_CONTENT_SPACING, headerToContent: 28, categoryToProduct: 14, betweenProducts: 18 },
  minimumFontSize: DEFAULT_MINIMUM_FONT_SIZE, fontSizeLimits: DEFAULT_FONT_SIZE_LIMITS, revisedFontSizeDefaults: true,
  allowSameWordBreak: false, splitCategoryAcrossPages: false, productsCanChangeCategory: false,
  elementStyles: {
    menuTitle: { fontSize: 44, fontWeight: '700', color: '#111827', textAlign: 'center', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
    menuSubtitle: { fontSize: 16, fontWeight: '500', color: '#4b5563', textAlign: 'center', marginBottom: 28 },
    category: { fontSize: 22, fontWeight: '700', textAlign: 'left', color: '#3730a3', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 },
    productName: { fontSize: 18, fontWeight: '700', textAlign: 'left', color: '#111827' },
    productPrice: { fontSize: 18, fontWeight: '700', textAlign: 'right', color: '#047857' },
    productDescription: { fontSize: 14, fontWeight: '400', textAlign: 'left', color: '#4b5563', lineHeight: 1.45 },
  },
};

export const createClassicMenuStyle = () => structuredClone(INITIAL_STYLE);

const LEGACY_MINI_FOOD_TEXTURES: { kind: MiniFoodKind; url: string }[] = [
  { kind: 'mini-food:burger', url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3OTQiIGhlaWdodD0iMTEyMyIgdmlld0JveD0iMCAwIDc5NCAxMTIzIj48cmVjdCB3aWR0aD0iNzk0IiBoZWlnaHQ9IjExMjMiIGZpbGw9IiNmZmZhZjMiLz48ZGVmcz48ZyBpZD0iaSI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOWEzNDEyIiBzdHJva2Utd2lkdGg9IjEuOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNNCAxNWgxNmE0IDQgMCAwIDEgLTQgNGgtOGE0IDQgMCAwIDEgLTQgLTQiLz48cGF0aCBkPSJNMTIgNGMzLjc4MyAwIDYuOTUzIDIuMTMzIDcuNzg2IDVoLTE1LjU3MmMuODMzIC0yLjg2NyA0LjAwMyAtNSA3Ljc4NiAtNSIvPjxwYXRoIGQ9Ik01IDEyaDE0Ii8+PC9nPjwvZz48cGF0dGVybiBpZD0icCIgd2lkdGg9IjExOCIgaGVpZ2h0PSIxMTgiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiPjx1c2UgaHJlZj0iI2kiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE2IDE4KSBzY2FsZSgxLjE4KSByb3RhdGUoLTkgMTIgMTIpIiBvcGFjaXR5PSIuMTYiLz48dXNlIGhyZWY9IiNpIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSg3NiA2OCkgc2NhbGUoLjkyKSByb3RhdGUoMTIgMTIgMTIpIiBvcGFjaXR5PSIuMTIiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSI3OTQiIGhlaWdodD0iMTEyMyIgZmlsbD0idXJsKCNwKSIvPjwvc3ZnPg==' },
  { kind: 'mini-food:pizzaCalabresa', url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3OTQiIGhlaWdodD0iMTEyMyIgdmlld0JveD0iMCAwIDc5NCAxMTIzIj48cmVjdCB3aWR0aD0iNzk0IiBoZWlnaHQ9IjExMjMiIGZpbGw9IiNmZmY3ZWQiLz48ZGVmcz48ZyBpZD0iaSI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjYjkxYzFjIiBzdHJva2Utd2lkdGg9IjEuOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTIgMjEuNWMtMy4wNCAwIC01Ljk1MiAtLjcxNCAtOC41IC0xLjk4M2w4LjUgLTE2LjUxN2w4LjUgMTYuNTE3YTE5LjA5IDE5LjA5IDAgMCAxIC04LjUgMS45ODMiLz48cGF0aCBkPSJNNS4zOCAxNS44NjZhMTQuOTQgMTQuOTQgMCAwIDAgNi44MTUgMS42MzRhMTQuOTQ0IDE0Ljk0NCAwIDAgMCA2LjUwMiAtMS40NzkiLz48cGF0aCBkPSJNMTMgMTEuMDF2LS4wMSIvPjxwYXRoIGQ9Ik0xMSAxNHYtLjAxIi8+PC9nPjwvZz48cGF0dGVybiBpZD0icCIgd2lkdGg9IjExOCIgaGVpZ2h0PSIxMTgiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiPjx1c2UgaHJlZj0iI2kiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE2IDE4KSBzY2FsZSgxLjE4KSByb3RhdGUoLTkgMTIgMTIpIiBvcGFjaXR5PSIuMTYiLz48dXNlIGhyZWY9IiNpIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSg3NiA2OCkgc2NhbGUoLjkyKSByb3RhdGUoMTIgMTIgMTIpIiBvcGFjaXR5PSIuMTIiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSI3OTQiIGhlaWdodD0iMTEyMyIgZmlsbD0idXJsKCNwKSIvPjwvc3ZnPg==' },
  { kind: 'mini-food:sushi', url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3OTQiIGhlaWdodD0iMTEyMyIgdmlld0JveD0iMCAwIDc5NCAxMTIzIj48cmVjdCB3aWR0aD0iNzk0IiBoZWlnaHQ9IjExMjMiIGZpbGw9IiNmOGZhZmMiLz48ZGVmcz48ZyBpZD0iaSI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOTkxYjFiIiBzdHJva2Utd2lkdGg9IjEuOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSI1IiB5PSI2IiB3aWR0aD0iMTQiIGhlaWdodD0iMTIiIHJ4PSI0Ii8+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMy41Ii8+PHBhdGggZD0iTTguNSAxMmg3Ii8+PHBhdGggZD0iTTEyIDguNXY3Ii8+PC9nPjwvZz48cGF0dGVybiBpZD0icCIgd2lkdGg9IjExOCIgaGVpZ2h0PSIxMTgiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiPjx1c2UgaHJlZj0iI2kiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE2IDE4KSBzY2FsZSgxLjE4KSByb3RhdGUoLTkgMTIgMTIpIiBvcGFjaXR5PSIuMTYiLz48dXNlIGhyZWY9IiNpIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSg3NiA2OCkgc2NhbGUoLjkyKSByb3RhdGUoMTIgMTIgMTIpIiBvcGFjaXR5PSIuMTIiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSI3OTQiIGhlaWdodD0iMTEyMyIgZmlsbD0idXJsKCNwKSIvPjwvc3ZnPg==' },
  { kind: 'mini-food:popsicle', url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3OTQiIGhlaWdodD0iMTEyMyIgdmlld0JveD0iMCAwIDc5NCAxMTIzIj48cmVjdCB3aWR0aD0iNzk0IiBoZWlnaHQ9IjExMjMiIGZpbGw9IiNmZmYxZjciLz48ZGVmcz48ZyBpZD0iaSI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjYmUxODVkIiBzdHJva2Utd2lkdGg9IjEuOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTIgMjEuNXYtNC41Ii8+PHBhdGggZD0iTTggMTdoOHYtMTBhNCA0IDAgMSAwIC04IDB2MTAiLz48cGF0aCBkPSJNOCAxMC41bDggLTMuNSIvPjxwYXRoIGQ9Ik04IDE0LjVsOCAtMy41Ii8+PC9nPjwvZz48cGF0dGVybiBpZD0icCIgd2lkdGg9IjExOCIgaGVpZ2h0PSIxMTgiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiPjx1c2UgaHJlZj0iI2kiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE2IDE4KSBzY2FsZSgxLjE4KSByb3RhdGUoLTkgMTIgMTIpIiBvcGFjaXR5PSIuMTYiLz48dXNlIGhyZWY9IiNpIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSg3NiA2OCkgc2NhbGUoLjkyKSByb3RhdGUoMTIgMTIgMTIpIiBvcGFjaXR5PSIuMTIiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSI3OTQiIGhlaWdodD0iMTEyMyIgZmlsbD0idXJsKCNwKSIvPjwvc3ZnPg==' },
  { kind: 'mini-food:juice', url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3OTQiIGhlaWdodD0iMTEyMyIgdmlld0JveD0iMCAwIDc5NCAxMTIzIj48cmVjdCB3aWR0aD0iNzk0IiBoZWlnaHQ9IjExMjMiIGZpbGw9IiNmZmZiZWIiLz48ZGVmcz48ZyBpZD0iaSI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOTI0MDBlIiBzdHJva2Utd2lkdGg9IjEuOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNOSAyMWg2YTEgMSAwIDAgMCAxIC0xdi0zLjYyNWMwIC0xLjM5NyAuMjkgLTIuNzc1IC44NDUgLTQuMDI1bC4zMSAtLjdjLjU1NiAtMS4yNSAuODQ1IC0yLjI1MyAuODQ1IC0zLjY1di00YTEgMSAwIDAgMCAtMSAtMWgtMTBhMSAxIDAgMCAwIC0xIDF2NGMwIDEuMzk3IC4yOSAyLjQgLjg0NSAzLjY1bC4zMSAuN2E5LjkzMSA5LjkzMSAwIDAgMSAuODQ1IDQuMDI1djMuNjI1YTEgMSAwIDAgMCAxIDEiLz48cGF0aCBkPSJNNiA4aDEyIi8+PC9nPjwvZz48cGF0dGVybiBpZD0icCIgd2lkdGg9IjExOCIgaGVpZ2h0PSIxMTgiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiPjx1c2UgaHJlZj0iI2kiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE2IDE4KSBzY2FsZSgxLjE4KSByb3RhdGUoLTkgMTIgMTIpIiBvcGFjaXR5PSIuMTYiLz48dXNlIGhyZWY9IiNpIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSg3NiA2OCkgc2NhbGUoLjkyKSByb3RhdGUoMTIgMTIgMTIpIiBvcGFjaXR5PSIuMTIiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSI3OTQiIGhlaWdodD0iMTEyMyIgZmlsbD0idXJsKCNwKSIvPjwvc3ZnPg==' },
  { kind: 'mini-food:espresso', url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3OTQiIGhlaWdodD0iMTEyMyIgdmlld0JveD0iMCAwIDc5NCAxMTIzIj48cmVjdCB3aWR0aD0iNzk0IiBoZWlnaHQ9IjExMjMiIGZpbGw9IiNmZmY3ZWQiLz48ZGVmcz48ZyBpZD0iaSI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjN2MyZDEyIiBzdHJva2Utd2lkdGg9IjEuOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMyAxNGMuODMgLjY0MiAyLjA3NyAxLjAxNyAzLjUgMWMxLjQyMyAuMDE3IDIuNjcgLS4zNTggMy41IC0xYy44MyAtLjY0MiAyLjA3NyAtMS4wMTcgMy41IC0xYzEuNDIzIC0uMDE3IDIuNjcgLjM1OCAzLjUgMSIvPjxwYXRoIGQ9Ik04IDNhMi40IDIuNCAwIDAgMCAtMSAyYTIuNCAyLjQgMCAwIDAgMSAyIi8+PHBhdGggZD0iTTEyIDNhMi40IDIuNCAwIDAgMCAtMSAyYTIuNCAyLjQgMCAwIDAgMSAyIi8+PHBhdGggZD0iTTMgMTBoMTR2NWE2IDYgMCAwIDEgLTYgNmgtMmE2IDYgMCAwIDEgLTYgLTZ2LTUiLz48cGF0aCBkPSJNMTYuNzQ2IDE2LjcyNmEzIDMgMCAxIDAgLjI1MiAtNS41NTUiLz48L2c+PC9nPjxwYXR0ZXJuIGlkPSJwIiB3aWR0aD0iMTE4IiBoZWlnaHQ9IjExOCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHVzZSBocmVmPSIjaSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTYgMTgpIHNjYWxlKDEuMTgpIHJvdGF0ZSgtOSAxMiAxMikiIG9wYWNpdHk9Ii4xNiIvPjx1c2UgaHJlZj0iI2kiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDc2IDY4KSBzY2FsZSguOTIpIHJvdGF0ZSgxMiAxMiAxMikiIG9wYWNpdHk9Ii4xMiIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9Ijc5NCIgaGVpZ2h0PSIxMTIzIiBmaWxsPSJ1cmwoI3ApIi8+PC9zdmc+' }
];

const removeMiniFoodBackgroundColor = (url: string) => {
  if (!url.startsWith('data:image/svg+xml;base64,') || typeof atob !== 'function' || typeof btoa !== 'function') {
    return url;
  }

  const svg = atob(url.slice('data:image/svg+xml;base64,'.length));
  const transparentSvg = svg.replace(/<rect width="794" height="1123" fill="#[a-f0-9]+"\/>/i, '');
  return `data:image/svg+xml;base64,${btoa(transparentSvg)}`;
};

export const MINI_FOOD_BACKGROUNDS = [
  { name: 'Mix', url: mixTextureToken },
  ...MINI_FOODS.map(food => ({ name: food.name, url: `texture:${food.kind}` })),
].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
const miniFoodTextures = new Map<string, MiniFoodTextureKind>(
  MINI_FOODS.flatMap(({ kind }) => [[miniFoodTextureUrl(kind), kind], [`texture:${kind}`, kind]]),
);
miniFoodTextures.set(mixTextureToken, MINI_FOOD_MIX);
const transparentMiniFoodUrls = new Map<string, string>();

for (const { kind, url } of LEGACY_MINI_FOOD_TEXTURES) {
  const transparent = removeMiniFoodBackgroundColor(url);
  transparentMiniFoodUrls.set(url, transparent);
  miniFoodTextures.set(transparent, kind);
}

const localPaperTokens = new Map([
  ['https://www.transparenttextures.com/patterns/natural-paper.png', 'texture:natural-paper'],
  ['https://www.transparenttextures.com/patterns/rice-paper.png', 'texture:rice-paper'],
]);
export const normalizeTextureUrl = (url = '') => localPaperTokens.get(url) ?? transparentMiniFoodUrls.get(url) ?? url;
export const getMiniFoodTextureKind = (url?: string) => miniFoodTextures.get(normalizeTextureUrl(url));
export const isMiniFoodTexture = (url?: string) => getMiniFoodTextureKind(url) !== undefined;

export function resolveTexture(value?: string, color?: string, size?: number) {
  const url = normalizeTextureUrl(value);
  const food = getMiniFoodTextureKind(url);
  if (food) return { url: miniFoodTextureTile(food, color, size), tiled: true };
  if (isTextureToken(url)) return { url: getTextureTile(url) || '', tiled: true };
  return { url, tiled: false };
}

export const SAMPLE_BACKGROUNDS = [
  { name: 'Sem textura', url: '' },
  ...TEXTURE_OPTIONS,
  { name: 'Mini comidas', url: 'texture:mini-food:burger' },
];

export const FONTS = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Nunito',
  'Quicksand',
  'Raleway',
  'Work Sans',
  'Source Sans 3',
  'DM Sans',
  'Manrope',
  'Urbanist',
  'Mulish',
  'Playfair Display',
  'Cormorant Garamond',
  'Libre Baskerville',
  'Merriweather',
  'Lora',
  'Crimson Text',
  'Prata',
  'Cinzel',
  'Bodoni Moda',
  'Oswald',
  'Bebas Neue',
  'Anton',
  'Archivo Black',
  'Barlow Condensed',
  'Roboto Condensed',
  'Fjalla One',
  'Pacifico',
  'Dancing Script',
  'Great Vibes',
  'Satisfy',
  'Caveat',
  'Lobster',
  'Courgette',
  'Fredoka',
  'Baloo 2',
  'Righteous',
  'Rye',
  'Bangers',
  'Amatic SC',
  'Permanent Marker',
  'Orbitron',
  'Exo 2',
  'Rajdhani',
  'Space Grotesk',
  'Noto Sans JP',
  'Noto Serif',
  'Alegreya',
  'Rubik',
  'Kanit',
  'Josefin Sans',
  'Cabin',
  'Arvo',
  'Bitter',
  'Kalam',
  'M PLUS Rounded 1c'
];
