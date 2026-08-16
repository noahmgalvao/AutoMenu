import { FontSizeLimits, MenuContentSpacing, MenuMargins, Product, MenuStyle } from './types';

export const DEFAULT_FONT_SIZE_LIMITS: FontSizeLimits = {
  menuTitle: 120,
  menuSubtitle: 50,
  category: 50,
  productName: 50,
  productPrice: 60,
  productDescription: 30,
  freeText: 50,
};

export const DEFAULT_MINIMUM_FONT_SIZE = 10;

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
    price: 12.99,
    category: 'Hamburgueres',
    image: 'https://picsum.photos/200/200?random=1'
  },
  {
    id: '2',
    name: 'Batata Trufada',
    description: 'Batatas crocantes com azeite trufado e parmesao.',
    price: 6.50,
    category: 'Acompanhamentos',
    image: 'https://picsum.photos/200/200?random=2'
  },
  {
    id: '3',
    name: 'Salada Caesar',
    description: 'Alface romana, croutons, parmesao e molho caesar.',
    price: 10.00,
    category: 'Saladas',
    image: 'https://picsum.photos/200/200?random=3'
  },
  {
    id: '4',
    name: 'Bolo Vulcao de Chocolate',
    description: 'Bolo quente de chocolate com recheio cremoso e sorvete.',
    price: 8.99,
    category: 'Sobremesas',
    image: 'https://picsum.photos/200/200?random=4'
  },
  {
    id: '5',
    name: 'Pizza Margherita',
    description: 'Molho de tomate, mozzarella fresca e manjericao.',
    price: 14.50,
    category: 'Pizzas',
    image: 'https://picsum.photos/200/200?random=5'
  }
];

const DEFAULT_ELEMENT_STYLES = {
  category: { fontSize: 24, fontWeight: '700' as const, textAlign: 'left' as const },
  productName: { fontSize: 18, fontWeight: '700' as const, textAlign: 'left' as const },
  productPrice: { fontSize: 18, fontWeight: '700' as const, textAlign: 'right' as const },
  productDescription: { fontSize: 14, fontWeight: '400' as const, textAlign: 'left' as const },
};

const createTemplate = (template: Omit<MenuStyle, 'scope' | 'sourceType' | 'isLocked' | 'customCategoryOrder' | 'customProductOrder' | 'hiddenProductIds' | 'floatingText' | 'pageBreaks'>): MenuStyle => ({
  scope: 'system',
  sourceType: 'preset',
  isLocked: true,
  customCategoryOrder: [],
  customProductOrder: {},
  categoryPlacements: {},
  hiddenProductIds: [],
  floatingText: [],
  pageBreaks: [],
  cardBackgroundColor: '#ffffff',
  fontSizeLimits: { ...DEFAULT_FONT_SIZE_LIMITS },
  minimumFontSize: DEFAULT_MINIMUM_FONT_SIZE,
  allowSameWordBreak: false,
  margins: {
    ...DEFAULT_MENU_MARGINS,
    top: template.pagePadding ?? DEFAULT_MENU_MARGINS.top,
    bottom: template.pagePadding ?? DEFAULT_MENU_MARGINS.bottom,
    left: template.pagePadding ?? DEFAULT_MENU_MARGINS.left,
    right: template.pagePadding ?? DEFAULT_MENU_MARGINS.right,
  },
  contentSpacing: {
    ...DEFAULT_MENU_CONTENT_SPACING,
    headerToContent: template.elementStyles.menuSubtitle?.marginBottom
      ?? DEFAULT_MENU_CONTENT_SPACING.headerToContent,
    categoryToProduct: template.elementStyles.category?.marginBottom
      ?? DEFAULT_MENU_CONTENT_SPACING.categoryToProduct,
    betweenProducts: template.itemGap ?? DEFAULT_MENU_CONTENT_SPACING.betweenProducts,
  },
  ...template,
});

export const PRESET_TEMPLATES: MenuStyle[] = [
  createTemplate({
    id: 'moderno-limpo',
    name: 'Moderno Limpo',
    menuTitle: 'CARDÁPIO',
    menuSubtitle: 'Seleção da Casa',
    fontFamily: 'Inter',
    primaryColor: '#3730a3',
    backgroundColor: '#ffffff',
    textColor: '#111827',
    layoutMode: 'list',
    showImages: true,
    columnCount: 1,
    backgroundImage: '',
    cardBackgroundColor: '#f8fafc',
    pagePadding: 56,
    globalRadius: 16,
    itemGap: 18,
    elementStyles: {
      menuTitle: { fontSize: 44, fontWeight: '700', color: '#111827', textAlign: 'center', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
      menuSubtitle: { fontSize: 16, fontWeight: '500', color: '#4b5563', textAlign: 'center', marginBottom: 28 },
      category: { ...DEFAULT_ELEMENT_STYLES.category, color: '#3730a3', fontSize: 22, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 },
      productName: { ...DEFAULT_ELEMENT_STYLES.productName, color: '#111827', fontSize: 18 },
      productPrice: { ...DEFAULT_ELEMENT_STYLES.productPrice, color: '#047857', fontSize: 18 },
      productDescription: { ...DEFAULT_ELEMENT_STYLES.productDescription, color: '#4b5563', lineHeight: 1.45 }
    }
  }),
  createTemplate({
    id: 'bistro-elegante',
    name: 'Bistrô Elegante',
    menuTitle: 'BISTRÔ',
    menuSubtitle: 'Experiência de Alta Gastronomia',
    fontFamily: 'Playfair Display',
    primaryColor: '#facc15',
    backgroundColor: '#181512',
    textColor: '#fff7ed',
    layoutMode: 'list',
    showImages: false,
    columnCount: 2,
    backgroundImage: '',
    cardBackgroundColor: '#292524',
    pagePadding: 64,
    globalRadius: 18,
    itemGap: 20,
    elementStyles: {
      menuTitle: { fontSize: 48, fontWeight: '700', color: '#fff7ed', textAlign: 'center', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 6 },
      menuSubtitle: { fontSize: 17, fontWeight: '400', color: '#facc15', textAlign: 'center', marginBottom: 30 },
      category: { ...DEFAULT_ELEMENT_STYLES.category, color: '#facc15', textAlign: 'center', fontSize: 26, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 },
      productName: { ...DEFAULT_ELEMENT_STYLES.productName, color: '#fff7ed', fontSize: 18 },
      productPrice: { ...DEFAULT_ELEMENT_STYLES.productPrice, color: '#facc15', fontSize: 18 },
      productDescription: { ...DEFAULT_ELEMENT_STYLES.productDescription, color: '#d6d3d1', lineHeight: 1.45 }
    }
  }),
  createTemplate({
    id: 'cafe-aconchegante',
    name: 'Café Aconchegante',
    menuTitle: 'CAFÉ',
    menuSubtitle: 'Cafés e Delícias',
    fontFamily: 'Lato',
    primaryColor: '#7c2d12',
    backgroundColor: '#fff7ed',
    textColor: '#3b2416',
    layoutMode: 'cards',
    showImages: true,
    columnCount: 2,
    backgroundImage: '',
    cardBackgroundColor: '#fffbeb',
    pagePadding: 52,
    globalRadius: 20,
    itemGap: 18,
    elementStyles: {
      menuTitle: { fontSize: 46, fontWeight: '700', color: '#3b2416', textAlign: 'center', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
      menuSubtitle: { fontSize: 16, fontWeight: '500', color: '#7c2d12', textAlign: 'center', marginBottom: 26 },
      category: { ...DEFAULT_ELEMENT_STYLES.category, color: '#7c2d12', textAlign: 'center', fontSize: 24, textTransform: 'uppercase', marginBottom: 14 },
      productName: { ...DEFAULT_ELEMENT_STYLES.productName, color: '#3b2416', textAlign: 'center', fontSize: 18 },
      productPrice: { ...DEFAULT_ELEMENT_STYLES.productPrice, color: '#047857', textAlign: 'center', fontSize: 18 },
      productDescription: { ...DEFAULT_ELEMENT_STYLES.productDescription, color: '#6b3f2a', textAlign: 'center', lineHeight: 1.45 }
    }
  }),
  createTemplate({
    id: 'pizzaria-italiana',
    name: 'Pizzaria Italiana',
    menuTitle: 'LA PIZZA',
    menuSubtitle: 'Forno a Lenha',
    fontFamily: 'Bebas Neue',
    primaryColor: '#dc2626',
    backgroundColor: '#fff7ed',
    textColor: '#3f2416',
    layoutMode: 'cards',
    showImages: true,
    columnCount: 2,
    backgroundImage: '',
    cardBackgroundColor: '#ffffff',
    pagePadding: 52,
    globalRadius: 18,
    itemGap: 18,
    elementStyles: {
      menuTitle: { fontSize: 50, fontWeight: '700', color: '#7f1d1d', textAlign: 'center', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
      menuSubtitle: { fontSize: 18, fontWeight: '600', color: '#166534', textAlign: 'center', marginBottom: 26 },
      category: { ...DEFAULT_ELEMENT_STYLES.category, color: '#166534', textAlign: 'center', fontSize: 30, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 },
      productName: { ...DEFAULT_ELEMENT_STYLES.productName, color: '#7f1d1d', fontSize: 20 },
      productPrice: { ...DEFAULT_ELEMENT_STYLES.productPrice, color: '#b91c1c', fontSize: 18 },
      productDescription: { ...DEFAULT_ELEMENT_STYLES.productDescription, color: '#6b2d1a', lineHeight: 1.45 }
    }
  }),
  createTemplate({
    id: 'sushi-minimal',
    name: 'Sushi Minimalista',
    menuTitle: 'SUSHI',
    menuSubtitle: 'Seleção Oriental',
    fontFamily: 'Noto Sans JP',
    primaryColor: '#991b1b',
    backgroundColor: '#f8fafc',
    textColor: '#111827',
    layoutMode: 'list',
    showImages: false,
    columnCount: 2,
    backgroundImage: '',
    cardBackgroundColor: '#ffffff',
    pagePadding: 64,
    globalRadius: 16,
    itemGap: 20,
    elementStyles: {
      menuTitle: { fontSize: 48, fontWeight: '700', color: '#111827', textAlign: 'center', letterSpacing: 4, textTransform: 'uppercase', marginBottom: 6 },
      menuSubtitle: { fontSize: 15, fontWeight: '500', color: '#991b1b', textAlign: 'center', marginBottom: 30 },
      category: { ...DEFAULT_ELEMENT_STYLES.category, color: '#991b1b', fontSize: 23, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 16 },
      productName: { ...DEFAULT_ELEMENT_STYLES.productName, color: '#111827', fontSize: 18 },
      productPrice: { ...DEFAULT_ELEMENT_STYLES.productPrice, color: '#991b1b' },
      productDescription: { ...DEFAULT_ELEMENT_STYLES.productDescription, color: '#374151', lineHeight: 1.5 }
    }
  }),
  createTemplate({
    id: 'burger-pop',
    name: 'Hambúrguer Artesanal',
    menuTitle: 'HAMBÚRGUER',
    menuSubtitle: 'Artesanal e Crocante',
    fontFamily: 'Fredoka',
    primaryColor: '#9a3412',
    backgroundColor: '#fff7ed',
    textColor: '#431407',
    layoutMode: 'cards',
    showImages: true,
    columnCount: 3,
    backgroundImage: '',
    cardBackgroundColor: '#ffffff',
    pagePadding: 48,
    globalRadius: 22,
    itemGap: 16,
    elementStyles: {
      menuTitle: { fontSize: 46, fontWeight: '700', color: '#431407', textAlign: 'center', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
      menuSubtitle: { fontSize: 16, fontWeight: '600', color: '#9a3412', textAlign: 'center', marginBottom: 24 },
      category: { ...DEFAULT_ELEMENT_STYLES.category, color: '#9a3412', textAlign: 'center', fontSize: 24, textTransform: 'uppercase', marginBottom: 12 },
      productName: { ...DEFAULT_ELEMENT_STYLES.productName, color: '#431407', textAlign: 'center', fontSize: 17 },
      productPrice: { ...DEFAULT_ELEMENT_STYLES.productPrice, color: '#047857', textAlign: 'center', fontSize: 17 },
      productDescription: { ...DEFAULT_ELEMENT_STYLES.productDescription, color: '#7c2d12', textAlign: 'center', lineHeight: 1.4 }
    }
  }),
  createTemplate({
    id: 'steakhouse-premium',
    name: 'Churrascaria Premium',
    menuTitle: 'CARNES',
    menuSubtitle: 'Cortes Nobres',
    fontFamily: 'Oswald',
    primaryColor: '#f59e0b',
    backgroundColor: '#16120f',
    textColor: '#fef3c7',
    layoutMode: 'list',
    showImages: false,
    columnCount: 2,
    backgroundImage: '',
    cardBackgroundColor: '#241c16',
    pagePadding: 64,
    globalRadius: 14,
    itemGap: 20,
    elementStyles: {
      menuTitle: { fontSize: 50, fontWeight: '700', color: '#fef3c7', textAlign: 'center', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 6 },
      menuSubtitle: { fontSize: 17, fontWeight: '500', color: '#f59e0b', textAlign: 'center', marginBottom: 30 },
      category: { ...DEFAULT_ELEMENT_STYLES.category, color: '#f59e0b', fontSize: 25, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 },
      productName: { ...DEFAULT_ELEMENT_STYLES.productName, color: '#fef3c7', fontSize: 18 },
      productPrice: { ...DEFAULT_ELEMENT_STYLES.productPrice, color: '#fbbf24', fontSize: 18 },
      productDescription: { ...DEFAULT_ELEMENT_STYLES.productDescription, color: '#d6d3d1', lineHeight: 1.45 }
    }
  }),
  createTemplate({
    id: 'doceria-charmosa',
    name: 'Doceria Charmosa',
    menuTitle: 'DOCES',
    menuSubtitle: 'Feitos com Carinho',
    fontFamily: 'Quicksand',
    primaryColor: '#9d174d',
    backgroundColor: '#fff1f7',
    textColor: '#831843',
    layoutMode: 'cards',
    showImages: true,
    columnCount: 3,
    backgroundImage: '',
    cardBackgroundColor: '#ffffff',
    pagePadding: 48,
    globalRadius: 24,
    itemGap: 16,
    elementStyles: {
      menuTitle: { fontSize: 46, fontWeight: '700', color: '#831843', textAlign: 'center', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
      menuSubtitle: { fontSize: 16, fontWeight: '600', color: '#9d174d', textAlign: 'center', marginBottom: 24 },
      category: { ...DEFAULT_ELEMENT_STYLES.category, color: '#9d174d', textAlign: 'center', fontSize: 24, textTransform: 'uppercase', marginBottom: 12 },
      productName: { ...DEFAULT_ELEMENT_STYLES.productName, color: '#831843', textAlign: 'center', fontSize: 17 },
      productPrice: { ...DEFAULT_ELEMENT_STYLES.productPrice, color: '#9d174d', textAlign: 'center', fontSize: 17 },
      productDescription: { ...DEFAULT_ELEMENT_STYLES.productDescription, color: '#7a1f45', textAlign: 'center', lineHeight: 1.4 }
    }
  }),
  createTemplate({
    id: 'healthy-fresh',
    name: 'Saudável Fresco',
    menuTitle: 'FRESCO',
    menuSubtitle: 'Leve, Natural e Colorido',
    fontFamily: 'Nunito',
    primaryColor: '#166534',
    backgroundColor: '#f0fdf4',
    textColor: '#052e16',
    layoutMode: 'cards',
    showImages: true,
    columnCount: 2,
    backgroundImage: '',
    cardBackgroundColor: '#ffffff',
    pagePadding: 52,
    globalRadius: 22,
    itemGap: 18,
    elementStyles: {
      menuTitle: { fontSize: 46, fontWeight: '700', color: '#052e16', textAlign: 'center', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
      menuSubtitle: { fontSize: 16, fontWeight: '600', color: '#166534', textAlign: 'center', marginBottom: 24 },
      category: { ...DEFAULT_ELEMENT_STYLES.category, color: '#166534', fontSize: 24, textTransform: 'uppercase', marginBottom: 14 },
      productName: { ...DEFAULT_ELEMENT_STYLES.productName, color: '#052e16', fontSize: 18 },
      productPrice: { ...DEFAULT_ELEMENT_STYLES.productPrice, color: '#166534', fontSize: 18 },
      productDescription: { ...DEFAULT_ELEMENT_STYLES.productDescription, color: '#166534', lineHeight: 1.45 }
    }
  }),
  createTemplate({
    id: 'padaria-artesanal',
    name: 'Padaria Artesanal',
    menuTitle: 'PADARIA',
    menuSubtitle: 'Pães, Cafés e Afeto',
    fontFamily: 'Merriweather',
    primaryColor: '#854d0e',
    backgroundColor: '#fefce8',
    textColor: '#422006',
    layoutMode: 'list',
    showImages: true,
    columnCount: 2,
    backgroundImage: '',
    cardBackgroundColor: '#fff8e1',
    pagePadding: 58,
    globalRadius: 16,
    itemGap: 18,
    elementStyles: {
      menuTitle: { fontSize: 48, fontWeight: '700', color: '#422006', textAlign: 'center', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
      menuSubtitle: { fontSize: 16, fontWeight: '500', color: '#854d0e', textAlign: 'center', marginBottom: 28 },
      category: { ...DEFAULT_ELEMENT_STYLES.category, color: '#854d0e', fontSize: 24, textTransform: 'uppercase', marginBottom: 14 },
      productName: { ...DEFAULT_ELEMENT_STYLES.productName, color: '#422006', fontSize: 18 },
      productPrice: { ...DEFAULT_ELEMENT_STYLES.productPrice, color: '#713f12', fontSize: 18 },
      productDescription: { ...DEFAULT_ELEMENT_STYLES.productDescription, color: '#6b3f16', lineHeight: 1.45 }
    }
  })
];

export const INITIAL_STYLE: MenuStyle = PRESET_TEMPLATES[0];

const BACKGROUND_TEXTURES = [
  { name: 'Sem textura', url: '' },
  { name: 'Papel natural', url: 'https://www.transparenttextures.com/patterns/natural-paper.png' },
  { name: 'Papel arroz', url: 'https://www.transparenttextures.com/patterns/rice-paper.png' },
  { name: 'Azulejo discreto', url: 'https://www.transparenttextures.com/patterns/gplay.png' },
  { name: 'Diamantes suaves', url: 'https://www.transparenttextures.com/patterns/diamond-upholstery.png' },
  { name: 'Mini comidas', url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3OTQiIGhlaWdodD0iMTEyMyIgdmlld0JveD0iMCAwIDc5NCAxMTIzIj48cmVjdCB3aWR0aD0iNzk0IiBoZWlnaHQ9IjExMjMiIGZpbGw9IiNmZmZhZjMiLz48ZGVmcz48ZyBpZD0iaSI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOWEzNDEyIiBzdHJva2Utd2lkdGg9IjEuOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNNCAxNWgxNmE0IDQgMCAwIDEgLTQgNGgtOGE0IDQgMCAwIDEgLTQgLTQiLz48cGF0aCBkPSJNMTIgNGMzLjc4MyAwIDYuOTUzIDIuMTMzIDcuNzg2IDVoLTE1LjU3MmMuODMzIC0yLjg2NyA0LjAwMyAtNSA3Ljc4NiAtNSIvPjxwYXRoIGQ9Ik01IDEyaDE0Ii8+PC9nPjwvZz48cGF0dGVybiBpZD0icCIgd2lkdGg9IjExOCIgaGVpZ2h0PSIxMTgiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiPjx1c2UgaHJlZj0iI2kiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE2IDE4KSBzY2FsZSgxLjE4KSByb3RhdGUoLTkgMTIgMTIpIiBvcGFjaXR5PSIuMTYiLz48dXNlIGhyZWY9IiNpIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSg3NiA2OCkgc2NhbGUoLjkyKSByb3RhdGUoMTIgMTIgMTIpIiBvcGFjaXR5PSIuMTIiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSI3OTQiIGhlaWdodD0iMTEyMyIgZmlsbD0idXJsKCNwKSIvPjwvc3ZnPg==' },
  { name: 'Mini pizzas', url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3OTQiIGhlaWdodD0iMTEyMyIgdmlld0JveD0iMCAwIDc5NCAxMTIzIj48cmVjdCB3aWR0aD0iNzk0IiBoZWlnaHQ9IjExMjMiIGZpbGw9IiNmZmY3ZWQiLz48ZGVmcz48ZyBpZD0iaSI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjYjkxYzFjIiBzdHJva2Utd2lkdGg9IjEuOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTIgMjEuNWMtMy4wNCAwIC01Ljk1MiAtLjcxNCAtOC41IC0xLjk4M2w4LjUgLTE2LjUxN2w4LjUgMTYuNTE3YTE5LjA5IDE5LjA5IDAgMCAxIC04LjUgMS45ODMiLz48cGF0aCBkPSJNNS4zOCAxNS44NjZhMTQuOTQgMTQuOTQgMCAwIDAgNi44MTUgMS42MzRhMTQuOTQ0IDE0Ljk0NCAwIDAgMCA2LjUwMiAtMS40NzkiLz48cGF0aCBkPSJNMTMgMTEuMDF2LS4wMSIvPjxwYXRoIGQ9Ik0xMSAxNHYtLjAxIi8+PC9nPjwvZz48cGF0dGVybiBpZD0icCIgd2lkdGg9IjExOCIgaGVpZ2h0PSIxMTgiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiPjx1c2UgaHJlZj0iI2kiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE2IDE4KSBzY2FsZSgxLjE4KSByb3RhdGUoLTkgMTIgMTIpIiBvcGFjaXR5PSIuMTYiLz48dXNlIGhyZWY9IiNpIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSg3NiA2OCkgc2NhbGUoLjkyKSByb3RhdGUoMTIgMTIgMTIpIiBvcGFjaXR5PSIuMTIiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSI3OTQiIGhlaWdodD0iMTEyMyIgZmlsbD0idXJsKCNwKSIvPjwvc3ZnPg==' },
  { name: 'Mini sushi', url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3OTQiIGhlaWdodD0iMTEyMyIgdmlld0JveD0iMCAwIDc5NCAxMTIzIj48cmVjdCB3aWR0aD0iNzk0IiBoZWlnaHQ9IjExMjMiIGZpbGw9IiNmOGZhZmMiLz48ZGVmcz48ZyBpZD0iaSI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOTkxYjFiIiBzdHJva2Utd2lkdGg9IjEuOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSI1IiB5PSI2IiB3aWR0aD0iMTQiIGhlaWdodD0iMTIiIHJ4PSI0Ii8+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMy41Ii8+PHBhdGggZD0iTTguNSAxMmg3Ii8+PHBhdGggZD0iTTEyIDguNXY3Ii8+PC9nPjwvZz48cGF0dGVybiBpZD0icCIgd2lkdGg9IjExOCIgaGVpZ2h0PSIxMTgiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiPjx1c2UgaHJlZj0iI2kiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE2IDE4KSBzY2FsZSgxLjE4KSByb3RhdGUoLTkgMTIgMTIpIiBvcGFjaXR5PSIuMTYiLz48dXNlIGhyZWY9IiNpIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSg3NiA2OCkgc2NhbGUoLjkyKSByb3RhdGUoMTIgMTIgMTIpIiBvcGFjaXR5PSIuMTIiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSI3OTQiIGhlaWdodD0iMTEyMyIgZmlsbD0idXJsKCNwKSIvPjwvc3ZnPg==' },
  { name: 'Mini doces', url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3OTQiIGhlaWdodD0iMTEyMyIgdmlld0JveD0iMCAwIDc5NCAxMTIzIj48cmVjdCB3aWR0aD0iNzk0IiBoZWlnaHQ9IjExMjMiIGZpbGw9IiNmZmYxZjciLz48ZGVmcz48ZyBpZD0iaSI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjYmUxODVkIiBzdHJva2Utd2lkdGg9IjEuOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTIgMjEuNXYtNC41Ii8+PHBhdGggZD0iTTggMTdoOHYtMTBhNCA0IDAgMSAwIC04IDB2MTAiLz48cGF0aCBkPSJNOCAxMC41bDggLTMuNSIvPjxwYXRoIGQ9Ik04IDE0LjVsOCAtMy41Ii8+PC9nPjwvZz48cGF0dGVybiBpZD0icCIgd2lkdGg9IjExOCIgaGVpZ2h0PSIxMTgiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiPjx1c2UgaHJlZj0iI2kiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE2IDE4KSBzY2FsZSgxLjE4KSByb3RhdGUoLTkgMTIgMTIpIiBvcGFjaXR5PSIuMTYiLz48dXNlIGhyZWY9IiNpIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSg3NiA2OCkgc2NhbGUoLjkyKSByb3RhdGUoMTIgMTIgMTIpIiBvcGFjaXR5PSIuMTIiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSI3OTQiIGhlaWdodD0iMTEyMyIgZmlsbD0idXJsKCNwKSIvPjwvc3ZnPg==' },
  { name: 'Mini bebidas', url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3OTQiIGhlaWdodD0iMTEyMyIgdmlld0JveD0iMCAwIDc5NCAxMTIzIj48cmVjdCB3aWR0aD0iNzk0IiBoZWlnaHQ9IjExMjMiIGZpbGw9IiNmZmZiZWIiLz48ZGVmcz48ZyBpZD0iaSI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOTI0MDBlIiBzdHJva2Utd2lkdGg9IjEuOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNOSAyMWg2YTEgMSAwIDAgMCAxIC0xdi0zLjYyNWMwIC0xLjM5NyAuMjkgLTIuNzc1IC44NDUgLTQuMDI1bC4zMSAtLjdjLjU1NiAtMS4yNSAuODQ1IC0yLjI1MyAuODQ1IC0zLjY1di00YTEgMSAwIDAgMCAtMSAtMWgtMTBhMSAxIDAgMCAwIC0xIDF2NGMwIDEuMzk3IC4yOSAyLjQgLjg0NSAzLjY1bC4zMSAuN2E5LjkzMSA5LjkzMSAwIDAgMSAuODQ1IDQuMDI1djMuNjI1YTEgMSAwIDAgMCAxIDEiLz48cGF0aCBkPSJNNiA4aDEyIi8+PC9nPjwvZz48cGF0dGVybiBpZD0icCIgd2lkdGg9IjExOCIgaGVpZ2h0PSIxMTgiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiPjx1c2UgaHJlZj0iI2kiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE2IDE4KSBzY2FsZSgxLjE4KSByb3RhdGUoLTkgMTIgMTIpIiBvcGFjaXR5PSIuMTYiLz48dXNlIGhyZWY9IiNpIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSg3NiA2OCkgc2NhbGUoLjkyKSByb3RhdGUoMTIgMTIgMTIpIiBvcGFjaXR5PSIuMTIiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSI3OTQiIGhlaWdodD0iMTEyMyIgZmlsbD0idXJsKCNwKSIvPjwvc3ZnPg==' },
  { name: 'Mini café', url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3OTQiIGhlaWdodD0iMTEyMyIgdmlld0JveD0iMCAwIDc5NCAxMTIzIj48cmVjdCB3aWR0aD0iNzk0IiBoZWlnaHQ9IjExMjMiIGZpbGw9IiNmZmY3ZWQiLz48ZGVmcz48ZyBpZD0iaSI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjN2MyZDEyIiBzdHJva2Utd2lkdGg9IjEuOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMyAxNGMuODMgLjY0MiAyLjA3NyAxLjAxNyAzLjUgMWMxLjQyMyAuMDE3IDIuNjcgLS4zNTggMy41IC0xYy44MyAtLjY0MiAyLjA3NyAtMS4wMTcgMy41IC0xYzEuNDIzIC0uMDE3IDIuNjcgLjM1OCAzLjUgMSIvPjxwYXRoIGQ9Ik04IDNhMi40IDIuNCAwIDAgMCAtMSAyYTIuNCAyLjQgMCAwIDAgMSAyIi8+PHBhdGggZD0iTTEyIDNhMi40IDIuNCAwIDAgMCAtMSAyYTIuNCAyLjQgMCAwIDAgMSAyIi8+PHBhdGggZD0iTTMgMTBoMTR2NWE2IDYgMCAwIDEgLTYgNmgtMmE2IDYgMCAwIDEgLTYgLTZ2LTUiLz48cGF0aCBkPSJNMTYuNzQ2IDE2LjcyNmEzIDMgMCAxIDAgLjI1MiAtNS41NTUiLz48L2c+PC9nPjxwYXR0ZXJuIGlkPSJwIiB3aWR0aD0iMTE4IiBoZWlnaHQ9IjExOCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHVzZSBocmVmPSIjaSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTYgMTgpIHNjYWxlKDEuMTgpIHJvdGF0ZSgtOSAxMiAxMikiIG9wYWNpdHk9Ii4xNiIvPjx1c2UgaHJlZj0iI2kiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDc2IDY4KSBzY2FsZSguOTIpIHJvdGF0ZSgxMiAxMiAxMikiIG9wYWNpdHk9Ii4xMiIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9Ijc5NCIgaGVpZ2h0PSIxMTIzIiBmaWxsPSJ1cmwoI3ApIi8+PC9zdmc+' }
];

const removeMiniFoodBackgroundColor = (url: string) => {
  if (!url.startsWith('data:image/svg+xml;base64,') || typeof atob !== 'function' || typeof btoa !== 'function') {
    return url;
  }

  const svg = atob(url.slice('data:image/svg+xml;base64,'.length));
  const transparentSvg = svg.replace(/<rect width="794" height="1123" fill="#[a-f0-9]+"\/>/i, '');
  return `data:image/svg+xml;base64,${btoa(transparentSvg)}`;
};

const miniFoodSourceTextures = BACKGROUND_TEXTURES.filter((texture) => texture.name.startsWith('Mini '));
const transparentMiniFoodUrls = new Map(
  miniFoodSourceTextures.map((texture) => [texture.url, removeMiniFoodBackgroundColor(texture.url)]),
);

export const MINI_FOOD_BACKGROUNDS = miniFoodSourceTextures.map((texture) => ({
  ...texture,
  name: texture.name === 'Mini comidas' ? 'Mini hamburguer' : texture.name,
  url: transparentMiniFoodUrls.get(texture.url) || texture.url,
}));

export const normalizeTextureUrl = (url?: string) => transparentMiniFoodUrls.get(url || '') || url || '';

export const isMiniFoodTexture = (url?: string) => {
  const normalizedUrl = normalizeTextureUrl(url);
  return MINI_FOOD_BACKGROUNDS.some((texture) => texture.url === normalizedUrl);
};

export const SAMPLE_BACKGROUNDS = [
  ...BACKGROUND_TEXTURES.filter((texture) => !texture.name.startsWith('Mini ')),
  { name: 'Mini comidas', url: MINI_FOOD_BACKGROUNDS[0].url },
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
