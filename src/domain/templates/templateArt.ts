import { createCanvasShape } from '../menu/canvasShapes';
import type { CanvasShapeKind, MenuBorder, MenuStyle } from '../menu/model';
import type { TemplateDesign } from './model';

type ArtDirection = Partial<Omit<MenuStyle, 'design' | 'elementStyles' | 'margins' | 'contentSpacing'>> & {
  design?: Partial<TemplateDesign>;
  elementStyles?: Partial<MenuStyle['elementStyles']>;
  margins?: Partial<NonNullable<MenuStyle['margins']>>;
  contentSpacing?: Partial<NonNullable<MenuStyle['contentSpacing']>>;
};

const headings = (title: boolean, subtitle: boolean) => ({ menuTitle: title, menuSubtitle: subtitle });
const border = (color: string, thickness = 1, radius = 0, sides: MenuBorder['sides'] = ['top', 'bottom', 'left', 'right']): MenuBorder =>
  ({ sides, color, thickness, length: 100, radius, offset: 0, pattern: 'solid' });
const decoration = (kind: CanvasShapeKind, color: string, x: number, y: number, width: number, ratio = 1, rotation = 0) => ({
  shape: { ...createCanvasShape(kind, color.slice(0, 7)), ratio, rotation }, x, y, width,
  opacity: color.length === 9 ? parseInt(color.slice(7), 16) / 255 : undefined,
  height: ratio <= .05 ? (y === 0 ? 1 : .76) : undefined,
});
const texture = (name: string) => ({ backgroundImage: `texture:${name}` });
const leftPhoto = { productPhotoAlignmentDefault: 'left' } as const;
const rightPhoto = { productPhotoAlignmentDefault: 'right' } as const;
const noSubtitle = headings(true, false);
const onlySubtitle = headings(false, true);
const withoutHeadings = headings(false, false);
const mono = { fontFamily: 'IBM Plex Mono', fontWeight: '700' } as const;

const art = {
  'moderno-limpo': {
    name: 'Editorial Essencial', templateHeadingVisibility: noSubtitle, showCategoryImages: false,
    design: { header: 'centered' }, productDividerStyle: 'solid',
    elementStyles: { menuTitle: { textAlign: 'center', letterSpacing: 4, textTransform: 'uppercase', fontSize: 54 } },
  },
  'swiss-grid': {
    name: 'Grade Suíça', categoryColumnWidths: [60, 40], markers: { category: 'number-square' },
    elementStyles: { productPrice: mono, menuSubtitle: { textAlign: 'right', letterSpacing: 2 } },
  },
  'monochrome-studio': {
    name: 'Estúdio Monocromático', templateHeadingVisibility: onlySubtitle, showCategoryImages: false,
    borders: { product: border('#1b1b1b', 3) }, fills: { price: '#191919' },
    elementStyles: { productName: { fontSize: 24 }, productPrice: { color: '#ffffff', fontSize: 18 }, menuSubtitle: { fontSize: 22, letterSpacing: 5, textTransform: 'uppercase' } },
  },
  'nordic-natural': {
    name: 'Mesa Nórdica', ...texture('linen-fine'), ...leftPhoto,
    imageScale: .65, productImageFrame: 'circle', contentSpacing: { categoryToProduct: 23, betweenProducts: 19 },
    elementStyles: { category: { fontSize: 25, letterSpacing: 1 }, productPrice: { textAlign: 'center' } },
  },
  'typo-bold': {
    name: 'Letras Grandes', templateHeadingVisibility: noSubtitle, categoryDividerStyle: 'strong',
    design: { header: 'banner', price: 'pill' }, fills: { price: '#f0c5a8' },
    elementStyles: { menuTitle: { fontSize: 88, textAlign: 'center', textTransform: 'uppercase' }, productName: { fontSize: 25 }, productPrice: { fontSize: 23, color: '#6e2917' } },
  },
  'coffee-lab': {
    name: 'Laboratório do Café', templateHeadingVisibility: onlySubtitle, categoryColumnWidths: [50, 50],
    productDividerStyle: 'dotted', design: { header: 'banner' },
    elementStyles: { menuSubtitle: { ...mono, fontSize: 25, textAlign: 'center', letterSpacing: 2 }, productPrice: mono },
  },
  'delivery-express': {
    name: 'Entrega Expressa', templateHeadingVisibility: withoutHeadings, showCategoryImages: false,
    fills: { category: '#d9edff', price: '#123c68' }, design: { price: 'badge' },
    elementStyles: { productPrice: { color: '#ffffff', fontSize: 21 }, productDescription: { lineHeight: 1.55 } },
  },
  'fit-kitchen': {
    name: 'Cozinha Equilibrada', categoryDividerStyle: 'accent', productCardShape: 'square',
    design: { price: 'inline' }, elementStyles: { productName: { textAlign: 'left' }, productPrice: { textAlign: 'center' } },
    contentSpacing: { productNameToDescription: 8 },
  },
  'tokyo-minimal': {
    name: 'Tóquio Minimal', templateHeadingVisibility: noSubtitle, categoryColumnWidths: [28, 44, 28],
    design: { header: 'left' }, margins: { columnGap: 31 },
    templateDecoration: [decoration('rectangle', '#a1324128', .275, .19, .003, .01), decoration('rectangle', '#a1324128', .722, .19, .003, .01)],
    elementStyles: { menuTitle: { fontSize: 49 }, productPrice: mono },
  },
  'bento-moderno': {
    name: 'Bento Modular', productCardShape: 'square', templateHeadingVisibility: noSubtitle, categoryColumnWidths: [50, 50],
    elementStyles: { menuTitle: { fontSize: 39 }, productPrice: { color: '#1a5849', fontSize: 17 } },
  },
  'bistro-elegante': {
    name: 'Bistrô Clássico', ...texture('linen-fine'), categoryDividerStyle: 'ornamental',
    elementStyles: { category: { textTransform: 'uppercase', letterSpacing: 2.5, fontSize: 26 }, menuSubtitle: { fontSize: 15 } },
  },
  'noir-gourmet': {
    name: 'Noir Gourmet', categoryColumnWidths: [55, 45], design: { header: 'left', price: 'right' },
    borders: { header: border('#c78253', 1, 0, ['bottom']), category: border('#c78253', 1, 0, ['bottom']) },
    contentSpacing: { headerToContent: 42 }, elementStyles: { productPrice: { color: '#f0d1af' } },
  },
  'maison-paris': {
    name: 'Maison Paris', ...texture('fine-marble'), productImageFrame: 'arch', productCardShape: 'rounded',
    design: { header: 'left' }, borders: { product: border('#bb8693', 1, 12) },
    elementStyles: { menuTitle: { textAlign: 'left' }, productDescription: { italic: true, fontSize: 15 } },
  },
  'trattoria-toscana': {
    name: 'Trattoria Toscana', ...texture('vichy-soft'), ...leftPhoto, fills: { header: '#963c28' },
    elementStyles: { menuTitle: { color: '#fff8e8' }, menuSubtitle: { color: '#fff1da' } },
  },
  'steakhouse-premium': {
    name: 'Reserva da Brasa', ...texture('smoked-wood'), design: { card: 'elevated' }, cardBackgroundColor: '#332722',
    productImageFrame: 'rounded', elementStyles: { productPrice: { fontSize: 25, color: '#ffd6a5' } },
  },
  'cacau-premium': {
    name: 'Cacau Reserva', ...texture('fine-marble'), templateHeadingVisibility: noSubtitle, showCategoryImages: false,
    templateDecoration: [decoration('diamond', '#e2bc7c25', .03, .03, .19), decoration('diamond', '#e2bc7c25', .78, .84, .19)],
    design: { header: 'centered', price: 'right' }, elementStyles: { menuTitle: { textAlign: 'center', letterSpacing: 3 } },
  },
  'asian-fusion': {
    name: 'Fusão Asiática', design: { image: 'background' }, productImageFrame: 'template', cardBackgroundColor: '#303239',
    textContrastFills: { productName: '#24252a' }, elementStyles: { category: { fontSize: 21 }, productPrice: { fontSize: 16 } },
  },
  'mediterranean-coast': {
    name: 'Costa Mediterrânea', ...texture('tonal-waves'), ...leftPhoto, categoryColumnWidths: [63, 37], productImageFrame: 'fill', productPhotoRatio: 1,
    elementStyles: { menuSubtitle: { letterSpacing: 3 }, productDescription: { lineHeight: 1.6 } },
  },
  'frutos-do-mar': {
    name: 'Maré Alta', showImages: false, showCategoryImages: true, categoryPhotoAlignmentDefault: 'center', categoryImageScale: 2.2,
    categoryPhotoRatio: 2.45, ...texture('tonal-waves'), layoutMode: 'list', design: { header: 'centered', price: 'pill', image: 'none', product: 'classic' },
    fills: { price: '#a4e1dc' }, elementStyles: { menuTitle: { textAlign: 'center' }, productPrice: { color: '#143a42' } },
  },
  'landscape-premium': {
    name: 'Carta de Vinhos', categoryColumnWidths: [30, 40, 30], showCategoryImages: false,
    borders: { categoryGroup: border('#977452', 1, 0, ['right']) }, elementStyles: { productPrice: mono },
  },
  'cafe-aconchegante': {
    name: 'Café Atelier', ...texture('mini-food:espresso'), miniFoodTextureColor: '#85664f', miniFoodTextureScale: 76,
    productImageFrame: 'rounded', productCardShape: 'soft', markers: { category: 'circle' },
  },
  'brunch-garden': {
    name: 'Brunch no Jardim', ...texture('botanical-sketch'), categoryImageScale: .65,
    borders: { productImage: border('#e9f2d9', 3, 10) }, productImageFrame: 'rounded',
    contentSpacing: { headerToContent: 36 },
  },
  'padaria-artesanal': {
    name: 'Pão de Forno', ...texture('kraft-grain'), categoryColumnWidths: [56, 44],
    markers: { category: 'mini-food:croissant' }, elementStyles: { menuTitle: { fontSize: 42, textTransform: 'uppercase' } },
  },
  'bakery-market': {
    name: 'Vitrine da Padaria', productCardShape: 'square', productPhotoRatio: 1.5,
    fills: { price: '#f3dab3' }, elementStyles: { productPrice: { color: '#633522' } },
  },
  'patisserie-rose': {
    name: 'Pâtisserie Rosé', ...texture('rice-paper'), productImageFrame: 'rounded',
    elementStyles: { menuTitle: { fontSize: 60 }, productPrice: { italic: true, fontFamily: 'Playfair Display' } },
    borders: { header: border('#c3869b'), product: border('#d8aeb9', 1, 9) },
    templateDecoration: [decoration('ellipse', '#a35b7622', -.08, -.055, .23), decoration('ellipse', '#a35b7622', .85, .88, .23)],
  },
  'doceria-charmosa': {
    name: 'Doce Encanto', ...texture('mini-food:brigadeiro'), ...rightPhoto, miniFoodTextureScale: 66,
    columnCount: 1, layoutMode: 'list', imageScale: .58, productImageFrame: 'circle', design: { image: 'left', product: 'classic', header: 'left' },
    elementStyles: { menuTitle: { textAlign: 'left', fontSize: 47 }, productName: { fontFamily: 'Fredoka' } },
  },
  'gelato-pop': {
    name: 'Gelato Pop', ...texture('mini-terrazzo'), templateHeadingVisibility: noSubtitle, design: { header: 'banner', price: 'pill' },
    productPhotoRatio: 1, fills: { price: '#f4b3cb' }, elementStyles: { menuTitle: { textAlign: 'center', letterSpacing: 1 }, productPrice: { color: '#54223b' } },
  },
  'donut-playground': {
    name: 'Clube do Donut', productImageFrame: 'circle', productCardShape: 'soft',
    borders: { product: border('#98639e', 3, 24) }, templateDecoration: [decoration('ellipse', '#e590bd30', -.075, .45, .28), decoration('ellipse', '#879fee33', .81, .6, .26)],
    fills: { price: '#fee2f0' },
  },
  'acai-tropical': {
    name: 'Açaí Tropical', ...texture('mini-food:acai'), miniFoodTextureScale: 145, columnCount: 2, productImageFrame: 'rounded', productPhotoRatio: 1.45,
    templateDecoration: [decoration('ellipse', '#a069e424', -.19, .52, .38, 1.5, -25), decoration('ellipse', '#8056aa25', .83, .61, .43, 1.4, -25)],
    design: { price: 'badge' }, fills: { price: '#632784' }, elementStyles: { productPrice: { color: '#fff5ff', fontSize: 22 } },
  },
  'tropical-fresh': {
    name: 'Sucos do Quintal', ...texture('tonal-waves'), productImageFrame: 'arch', productCardShape: 'arch',
    markers: { category: 'mini-food:juice' }, borders: { product: border('#79a99a', 1, 30) },
    elementStyles: { menuTitle: { fontSize: 51 }, menuSubtitle: { letterSpacing: 0 } },
  },
  'pizzaria-italiana': {
    name: 'Forno da Vila', ...texture('mini-food:pizzaCalabresa'), ...leftPhoto, productDividerStyle: 'double',
    design: { price: 'right' }, imageScale: .9,
  },
  'burger-pop': {
    name: 'Hamburgueria da Esquina', ...texture('chalk-dust'), productPhotoAlignmentDefault: 'center',
    markers: { category: 'mini-food:burger' }, design: { price: 'badge' }, fills: { price: '#ffc556' },
    elementStyles: { productPrice: { color: '#382309', fontSize: 23 } },
  },
  'smash-house': {
    name: 'Smash de Balcão', layoutMode: 'cards', templateHeadingVisibility: noSubtitle, productCardShape: 'square',
    fills: { category: '#f0bb45' }, elementStyles: { category: { color: '#502c13' }, menuTitle: { fontSize: 45 }, productPrice: mono },
  },
  'hot-dog-diner': {
    name: 'Cachorro-Quente Retrô', ...texture('vichy-soft'), ...leftPhoto, showImages: true, categoryColumnWidths: [62, 38],
    design: { image: 'left' }, imageScale: .55, templateHeadingVisibility: noSubtitle, elementStyles: { menuTitle: { fontSize: 44 } },
  },
  'bbq-smokehouse': {
    name: 'Defumados da Casa', ...texture('smoked-wood'), templateHeadingVisibility: noSubtitle, productImageFrame: 'template',
    textContrastFills: { productName: '#201b18' }, fills: { price: '#a75a32' }, elementStyles: { productPrice: { color: '#fff6e9' } },
  },
  'churrasco-na-brasa': {
    name: 'Churrasco na Brasa', ...texture('kraft-grain'), ...leftPhoto, categoryColumnWidths: [58, 42],
    markers: { category: 'diamond' }, productDividerStyle: 'dashed',
  },
  'brasil-regional': {
    name: 'Comida da Terra', categoryColumnWidths: [65, 35], ...texture('natural-paper'),
    templateDecoration: Array.from({ length: 6 }, (_, index) => decoration('diamond', '#94623539', .055 + index * .035, .94, .022)),
    fills: { category: '#ecd6a5' }, design: { price: 'right' },
  },
  'boteco-vintage': {
    name: 'Boteco da Esquina', ...texture('chalk-dust'), backgroundColor: '#272d28', textColor: '#fff4de', primaryColor: '#f4b76a',
    design: { header: 'banner' }, categoryDividerStyle: 'dotted', productDividerStyle: 'dotted', showCategoryImages: false,
    elementStyles: { menuTitle: { textTransform: 'uppercase', textAlign: 'center', letterSpacing: 3 } },
  },
  'cantina-familiar': {
    name: 'Cantina de Bairro', ...leftPhoto, design: { image: 'left', header: 'banner' }, productImageFrame: 'rounded',
    borders: { product: border('#d3a693', 1, 15) }, fills: { price: '#f7e0d1' },
  },
  'feira-mercado': {
    name: 'Feira & Mercado', ...texture('halftone-print'), templateHeadingVisibility: noSubtitle,
    templateDecoration: [decoration('ellipse', '#47813d28', -.08, .7, .27, .6, 30), decoration('ellipse', '#efb23442', .88, .16, .23, .6, -30)],
    fills: { price: '#e9cb82' }, elementStyles: { menuTitle: { fontSize: 46 }, productPrice: { color: '#4e3117' } },
  },
  'pizza-urbana': {
    name: 'Pizza de Rua', templateHeadingVisibility: noSubtitle,
    templateDecoration: [decoration('rectangle', '#a6002723', -.15, .53, .5, 3, -42), decoration('rectangle', '#a6002720', .78, .69, .44, 3, -42)],
    fills: { price: '#a60027' }, elementStyles: { productPrice: { color: '#fff7d9', fontSize: 21 } },
  },
  'street-food-neon': {
    name: 'Rua Neon', productImageFrame: 'template', textContrastFills: { productName: '#1b1729', productDescription: '#1b1729' },
    templateDecoration: [decoration('rectangle', '#5df8ba77', .018, .038, .003, .01), decoration('rectangle', '#e580ff77', .975, .038, .003, .01)],
    design: { background: 'solid' }, borders: { header: border('#a5efc6', 1, 0, ['bottom']) }, elementStyles: { menuTitle: { letterSpacing: 3 } },
  },
  'food-truck-color': {
    name: 'Food Truck em Cores', ...texture('mini-food:mix'), miniFoodTextureScale: 64, miniFoodTextureColor: '#765054',
    templateDecoration: [decoration('rectangle', '#bf5a882f', 0, 0, .026, .044), decoration('rectangle', '#2b93a630', .973, 0, .027, .044)],
    design: { price: 'badge' }, fills: { price: '#8a2454' }, elementStyles: { productPrice: { color: '#fff8e5', fontSize: 22 } },
  },
  'tex-mex-fiesta': {
    name: 'Fiesta de Rua', ...leftPhoto, categoryColumnWidths: [60, 40],
    markers: { category: { id: 'fiesta-geometria', shape: createCanvasShape('diamond', '#983818') } },
    fills: { category: '#f9ce77' }, borders: { category: border('#b13c20', 2, 0, ['left']) },
  },
  'sushi-minimal': {
    name: 'Sushi Zen', templateHeadingVisibility: withoutHeadings, markers: { category: 'number-padded' },
    borders: { category: border('#a12d38', 1, 0, ['bottom']) },
    templateDecoration: [decoration('ellipse', '#a12d3818', .82, .033, .16), decoration('ellipse', '#a12d381c', .9, .14, .06)],
    design: { background: 'solid' }, showCategoryImages: false,
  },
  'ramen-house': {
    name: 'Casa do Ramen', ...texture('mini-food:yakisoba'), miniFoodTextureScale: 70, design: { price: 'pill' }, fills: { header: '#743c29' },
    elementStyles: { menuTitle: { color: '#fff1dc' }, menuSubtitle: { color: '#ffe1bd' } },
  },
  'healthy-fresh': {
    name: 'Tigelas Verdes', ...texture('botanical-sketch'), ...rightPhoto, categoryColumnWidths: [55, 45],
    productImageFrame: 'circle', imageScale: .6, borders: { category: border('#667e4d', 4, 5, ['left']) },
  },
  'menu-board': {
    name: 'Painel de Balcão', templateHeadingVisibility: noSubtitle, design: { background: 'solid', price: 'badge' }, fills: { price: '#803a22' },
    elementStyles: { productName: { fontSize: 23 }, productPrice: { color: '#fff1bc', fontSize: 31 } },
  },
  'menu-board-industrial': {
    name: 'Painel Industrial', ...texture('chalk-dust'), categoryColumnCount: 3, columnCount: 1, categoryColumnWidths: [38, 34, 28],
    showImages: false, showCategoryImages: false, layoutMode: 'list', design: { image: 'none', product: 'compact', price: 'right' },
    templateDecoration: [decoration('rectangle', '#d7a65a40', .375, .17, .003, .01), decoration('rectangle', '#d7a65a40', .69, .17, .003, .01)],
    elementStyles: { productPrice: { ...mono, color: '#fff4d0', fontSize: 20 } },
  },
  'photo-magazine': {
    name: 'Revista à Mesa', ...leftPhoto, categoryColumnCount: 2, categoryColumnWidths: [64, 36], columnCount: 1, layoutMode: 'list',
    showCategoryImages: true, categoryPhotoAlignmentDefault: 'center', categoryImageScale: 1.6, categoryPhotoRatio: 2.2,
    productPhotoRatio: 1.3, design: { image: 'left', product: 'editorial', price: 'right' },
    contentSpacing: { headerToContent: 40, categoryToProduct: 24 }, elementStyles: { productDescription: { fontFamily: 'Lora', italic: true } },
  },
} satisfies Record<string, ArtDirection>;

export function refineTemplate(style: MenuStyle): MenuStyle {
  const direction = (art as Record<string, ArtDirection>)[style.id];
  const { elementStyles, design, margins, contentSpacing, ...fields } = direction;
  const effectiveDesign = { ...style.design!, ...design };
  const ratio = effectiveDesign.imageRatio.split(':').map(Number);
  return {
    ...style, ...fields, design: effectiveDesign,
    margins: { ...style.margins!, ...margins },
    contentSpacing: { ...style.contentSpacing!, ...contentSpacing },
    imageScale: fields.imageScale ?? (effectiveDesign.image === 'top' || effectiveDesign.image === 'cover' ? 1.35 : style.imageScale),
    elementStyles: Object.fromEntries(Object.entries(style.elementStyles).map(([key, element]) =>
      [key, { ...element, color: element?.color === style.textColor && fields.textColor ? fields.textColor
        : element?.color === style.primaryColor && fields.primaryColor ? fields.primaryColor : element?.color,
        ...elementStyles?.[key as keyof MenuStyle['elementStyles']] }])) as MenuStyle['elementStyles'],
    productPhotoRatio: fields.productPhotoRatio ?? ratio[0] / ratio[1],
    catalogMetadata: {
      ...style.catalogMetadata!, layoutFamily: effectiveDesign.product,
      keywords: [...style.catalogMetadata!.keywords, style.name],
    },
  };
}
