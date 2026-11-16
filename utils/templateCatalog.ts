import type { MenuPageSetup, MenuStyle, TemplateDesign } from '../types';
import { normalizeMenuPageSetup } from './pageSetup';

type Composition = [TemplateDesign['header'], TemplateDesign['category'], TemplateDesign['product'], TemplateDesign['image'], TemplateDesign['imageRatio'], TemplateDesign['price'], TemplateDesign['card'], TemplateDesign['divider'], TemplateDesign['background']];
type Recipe = [
  id: string, name: string, segment: string, description: string, font: string,
  paper: string, ink: string, accent: string, preset: MenuPageSetup['preset'],
  orientation: MenuPageSetup['orientation'], categories: 1 | 2 | 3, products: 1 | 2 | 3,
  composition: Composition, margin: number, gap: number, title: number,
];

const recipes: Recipe[] = [
  ["moderno-limpo", "Minimal Editorial", "Editorial", "Lista serifada com fios finos e margens largas.", "Cormorant Garamond", "#faf7ef", "#25211d", "#80533e", "A4", "portrait", 1, 1, ["left", "underline", "editorial", "none", "4:3", "right", "flat", "solid", "solid"], 58, 18, 58],
  ["swiss-grid", "Swiss Grid", "Editorial", "Duas colunas numeradas de alinhamento rígido.", "Inter", "#f7f4ee", "#171717", "#ac2026", "A4", "portrait", 2, 1, ["split", "numbered", "compact", "none", "1:1", "right", "flat", "solid", "solid"], 42, 8, 52],
  ["monochrome-studio", "Monochrome Studio", "Editorial", "Cartões geométricos em preto e branco.", "Archivo Black", "#f6f6f6", "#161616", "#303030", "Letter", "portrait", 1, 2, ["banner", "filled", "card", "none", "1:1", "badge", "bordered", "none", "accent-blocks"], 39, 14, 48],
  ["nordic-natural", "Nordic Natural", "Editorial", "Papel natural com pequenas imagens laterais.", "Mulish", "#f3efe6", "#272e28", "#45664d", "A5", "portrait", 1, 1, ["left", "plain", "classic", "left", "1:1", "inline", "flat", "none", "texture"], 30, 14, 44],
  ["typo-bold", "Typo Bold", "Editorial", "Título de impacto e preços alinhados.", "Archivo Black", "#f9f5e8", "#24140d", "#aa3c1c", "Letter", "portrait", 1, 1, ["hero", "numbered", "compact", "none", "4:3", "highlight", "flat", "dotted", "split"], 37, 7, 77],
  ["bistro-elegante", "Bistro Classique", "Restaurante", "Cabeçalho central e separadores ornamentais.", "Playfair Display", "#fff8e9", "#2d2220", "#7b423b", "A4", "portrait", 1, 1, ["centered", "plain", "editorial", "none", "4:3", "right", "flat", "ornamental", "texture"], 63, 20, 55],
  ["noir-gourmet", "Noir Gourmet", "Restaurante", "Duas colunas escuras com detalhes dourados.", "Cormorant Garamond", "#181613", "#fff8e5", "#edc583", "A4", "landscape", 2, 1, ["split", "underline", "editorial", "none", "4:3", "inline", "flat", "ornamental", "solid"], 48, 17, 60],
  ["maison-paris", "Maison Paris", "Restaurante", "Molduras delicadas e fotografia vertical.", "Baskervville", "#fff6ef", "#352225", "#874960", "A4", "portrait", 1, 2, ["centered", "ribbon", "featured", "cover", "3:4", "right", "bordered", "solid", "solid"], 46, 14, 65],
  ["trattoria-toscana", "Trattoria Toscana", "Restaurante", "Faixa terracota e duas seções em paisagem.", "Lora", "#f8ebd5", "#38261b", "#874328", "A4", "landscape", 2, 1, ["banner", "ribbon", "classic", "left", "4:3", "right", "flat", "solid", "texture"], 44, 13, 58],
  ["steakhouse-premium", "Steakhouse Reserve", "Churrasco", "Cortes em cartões escuros com preços fortes.", "Barlow Condensed", "#191919", "#fff8ef", "#f5aa74", "A3", "landscape", 1, 3, ["left", "filled", "featured", "cover", "16:9", "highlight", "full-bleed", "none", "solid"], 49, 16, 73],
  ["cafe-aconchegante", "Café Atelier", "Café e padaria", "Duas colunas de cartões com foto no topo.", "DM Serif Display", "#f7efe0", "#40291f", "#86553c", "A4", "portrait", 1, 2, ["left", "pill", "card", "top", "4:3", "pill", "soft", "none", "solid"], 41, 16, 58],
  ["coffee-lab", "Coffee Lab", "Café e padaria", "Lista técnica compacta e divisórias pontilhadas.", "IBM Plex Mono", "#f2f6f3", "#1f3330", "#356763", "A5", "portrait", 2, 1, ["split", "numbered", "compact", "none", "1:1", "inline", "flat", "dotted", "solid"], 26, 6, 43],
  ["brunch-garden", "Brunch Garden", "Café e padaria", "Grade botânica com fotografia panorâmica.", "Fraunces", "#f4f4e7", "#253522", "#496d45", "A4", "portrait", 1, 2, ["hero", "underline", "card", "top", "16:9", "pill", "elevated", "none", "accent-blocks"], 38, 20, 67],
  ["padaria-artesanal", "Padaria Artesanal", "Café e padaria", "Textura de papel, serifas e duas colunas.", "Baskervville", "#f2e3c7", "#3a261a", "#86542b", "A4", "portrait", 2, 1, ["centered", "underline", "classic", "none", "4:3", "right", "flat", "ornamental", "texture"], 46, 16, 57],
  ["bakery-market", "Bakery Market", "Café e padaria", "Três cartões por linha com etiquetas de preço.", "Barlow", "#fff6e5", "#35291e", "#975015", "A4", "landscape", 1, 3, ["split", "filled", "card", "top", "1:1", "badge", "bordered", "none", "split"], 33, 10, 54],
  ["patisserie-rose", "Pâtisserie Rosé", "Doces", "Fotos verticais em molduras delicadas.", "Playfair Display", "#fff2f4", "#45252c", "#975068", "A4", "portrait", 1, 2, ["centered", "plain", "card", "top", "3:4", "inline", "bordered", "ornamental", "texture"], 49, 13, 57],
  ["doceria-charmosa", "Doce Encanto", "Doces", "Faixa ornamental e cartões arredondados.", "Quicksand", "#fff3e9", "#492744", "#903971", "A5", "portrait", 1, 2, ["banner", "pill", "card", "top", "16:9", "pill", "soft", "ornamental", "solid"], 28, 11, 46],
  ["gelato-pop", "Gelato Pop", "Doces", "Fotos quadradas, blocos de cor e preços em selo.", "Outfit", "#fff4ba", "#332344", "#a42a63", "A4", "portrait", 1, 3, ["hero", "filled", "card", "cover", "1:1", "badge", "full-bleed", "none", "accent-blocks"], 33, 11, 66],
  ["cacau-premium", "Cacau Premium", "Doces", "Lista editorial sobre fundo chocolate.", "Cormorant Garamond", "#261a16", "#fff1df", "#efd09c", "A5", "portrait", 1, 1, ["left", "ribbon", "editorial", "none", "3:4", "highlight", "flat", "solid", "solid"], 34, 16, 52],
  ["donut-playground", "Donut Playground", "Doces", "Três cartões arredondados com preços em pílulas.", "Nunito", "#eaf3ff", "#362b5a", "#953f75", "A4", "landscape", 1, 3, ["centered", "pill", "card", "top", "1:1", "pill", "elevated", "none", "split"], 33, 12, 66],
  ["pizzaria-italiana", "Pizza Napoletana", "Pizza e lanches", "Lista com fotos laterais e acentos italianos.", "Lora", "#fff4dd", "#39261d", "#a12b25", "A4", "portrait", 1, 1, ["banner", "underline", "classic", "left", "4:3", "inline", "flat", "solid", "solid"], 39, 16, 62],
  ["pizza-urbana", "Pizza Urbana", "Pizza e lanches", "Cartaz horizontal com fotos de capa.", "Archivo Black", "#fff0cd", "#211c19", "#a60027", "A4", "landscape", 1, 2, ["hero", "numbered", "featured", "cover", "16:9", "badge", "full-bleed", "none", "split"], 34, 14, 70],
  ["burger-pop", "Burger Garage", "Pizza e lanches", "Cartões de contraste alto e preços destacados.", "Barlow Condensed", "#222320", "#fff2d8", "#ffbd4b", "A4", "portrait", 1, 2, ["banner", "ribbon", "featured", "cover", "4:3", "highlight", "full-bleed", "solid", "texture"], 35, 14, 72],
  ["smash-house", "Smash House", "Pizza e lanches", "Três cartões densos por linha com etiquetas.", "Archivo Black", "#f8eb92", "#30261c", "#9b401b", "A4", "landscape", 1, 3, ["split", "filled", "compact", "top", "16:9", "badge", "bordered", "none", "solid"], 25, 8, 59],
  ["hot-dog-diner", "Hot Dog Diner", "Pizza e lanches", "Faixas retrô, preço lateral e lista compacta.", "Barlow", "#fff2df", "#293346", "#a92636", "Letter", "portrait", 2, 1, ["banner", "pill", "compact", "none", "1:1", "pill", "flat", "dotted", "texture"], 28, 7, 56],
  ["bbq-smokehouse", "BBQ Smokehouse", "Churrasco", "Fotografia em fundo e tipografia robusta.", "Oswald", "#272220", "#fff6e9", "#f4b184", "A3", "landscape", 1, 3, ["banner", "filled", "featured", "background", "16:9", "badge", "full-bleed", "none", "solid"], 43, 14, 68],
  ["churrasco-na-brasa", "Churrasco na Brasa", "Churrasco", "Duas colunas com textura e seções por corte.", "Roboto Slab", "#f5e6d4", "#372519", "#983d2a", "A4", "portrait", 2, 1, ["split", "ribbon", "classic", "left", "1:1", "right", "flat", "dotted", "texture"], 39, 15, 50],
  ["street-food-neon", "Street Food Neon", "Comida de rua", "Painel escuro, fotos e acentos luminosos.", "Space Grotesk", "#181626", "#f5edff", "#a5efc6", "screen", "landscape", 1, 2, ["hero", "numbered", "featured", "background", "16:9", "pill", "bordered", "none", "accent-blocks"], 30, 13, 64],
  ["food-truck-color", "Food Truck Color", "Comida de rua", "Três cartões por linha e preços grandes.", "Rubik", "#fff4ca", "#27264a", "#8a2454", "A3", "landscape", 1, 3, ["banner", "pill", "card", "top", "4:3", "highlight", "elevated", "none", "accent-blocks"], 45, 15, 75],
  ["tex-mex-fiesta", "Tex-Mex Fiesta", "Comida de rua", "Duas seções em blocos e fotos laterais.", "Chivo", "#fff3d9", "#432a21", "#a23c25", "Letter", "landscape", 2, 1, ["left", "filled", "classic", "left", "1:1", "badge", "soft", "solid", "split"], 32, 12, 62],
  ["sushi-minimal", "Sushi Zen", "Ásia", "Lista em papel claro com categorias numeradas.", "Noto Serif", "#fcfaf1", "#2d2824", "#a12d38", "A4", "portrait", 1, 1, ["left", "numbered", "editorial", "none", "4:3", "right", "flat", "solid", "texture"], 62, 20, 55],
  ["tokyo-minimal", "Tokyo Minimal", "Ásia", "Três colunas de categorias e cabeçalho dividido.", "Space Grotesk", "#f6f2ea", "#222426", "#9b3141", "A3", "landscape", 3, 1, ["split", "underline", "editorial", "none", "3:4", "inline", "flat", "none", "solid"], 46, 17, 71],
  ["ramen-house", "Ramen House", "Ásia", "Faixa quente e cartões com imagens largas.", "DM Sans", "#ffedd6", "#3a211a", "#9a3a25", "A4", "portrait", 1, 2, ["banner", "filled", "card", "cover", "16:9", "badge", "soft", "none", "solid"], 37, 16, 62],
  ["bento-moderno", "Bento Moderno", "Ásia", "Grade modular, fotos quadradas e preços em selo.", "Inter", "#f4f7f0", "#23372b", "#2b6957", "A4", "landscape", 2, 2, ["split", "numbered", "card", "top", "1:1", "badge", "bordered", "none", "solid"], 30, 9, 55],
  ["asian-fusion", "Asian Fusion", "Ásia", "Composição fotográfica horizontal em duas colunas.", "Bricolage Grotesque", "#25282e", "#fbf6e8", "#f3aa83", "A3", "landscape", 1, 2, ["split", "underline", "featured", "cover", "16:9", "pill", "full-bleed", "solid", "split"], 43, 22, 78],
  ["tropical-fresh", "Tropical Fresh", "Natural", "Cartões leves, fotos e tons tropicais.", "DM Sans", "#ecf9ec", "#214636", "#24745c", "A4", "portrait", 1, 2, ["hero", "pill", "card", "top", "4:3", "inline", "soft", "none", "accent-blocks"], 36, 15, 65],
  ["healthy-fresh", "Green Bowl", "Natural", "Lista natural em duas colunas e fotos pequenas.", "Mulish", "#f2f5e7", "#2a3e26", "#576f2d", "A4", "portrait", 2, 1, ["left", "pill", "classic", "left", "1:1", "right", "flat", "none", "solid"], 41, 13, 54],
  ["fit-kitchen", "Fit Kitchen", "Natural", "Grade objetiva em paisagem com imagens horizontais.", "Barlow", "#f6faee", "#293a26", "#42672a", "A4", "landscape", 1, 3, ["split", "underline", "compact", "top", "16:9", "inline", "bordered", "solid", "solid"], 27, 8, 52],
  ["acai-tropical", "Açaí Tropical", "Natural", "Três cartões suaves e preço em destaque.", "Rubik", "#f5e8ff", "#351b4a", "#783185", "A4", "landscape", 1, 3, ["hero", "ribbon", "card", "cover", "1:1", "highlight", "soft", "none", "accent-blocks"], 32, 12, 66],
  ["mediterranean-coast", "Mediterranean Coast", "Restaurante", "Editorial horizontal em azul e areia.", "Baskervville", "#f8f1df", "#233749", "#315f81", "A4", "landscape", 2, 1, ["centered", "plain", "editorial", "left", "4:3", "right", "flat", "ornamental", "split"], 47, 17, 60],
  ["brasil-regional", "Brasil Regional", "Regional", "Textura artesanal e categorias em faixa.", "Alegreya", "#faf0d8", "#3d301d", "#8a531f", "A4", "portrait", 2, 1, ["banner", "ribbon", "editorial", "none", "1:1", "inline", "flat", "ornamental", "texture"], 44, 16, 61],
  ["boteco-vintage", "Boteco Vintage", "Regional", "Três colunas compactas com preços alinhados.", "Oswald", "#f4e6c9", "#392e22", "#8b3530", "A3", "landscape", 3, 1, ["centered", "filled", "compact", "none", "4:3", "right", "flat", "dotted", "texture"], 36, 7, 76],
  ["cantina-familiar", "Cantina Familiar", "Regional", "Cartões com fotos e preços em pílulas.", "Nunito", "#fff3e5", "#4a2f26", "#a14632", "Letter", "portrait", 1, 2, ["centered", "ribbon", "card", "top", "4:3", "pill", "soft", "solid", "solid"], 36, 16, 62],
  ["frutos-do-mar", "Frutos do Mar", "Regional", "Fotografia panorâmica com contraste marítimo.", "Playfair Display", "#103042", "#f1fbff", "#87d2d8", "A4", "portrait", 1, 1, ["hero", "underline", "featured", "background", "16:9", "right", "full-bleed", "ornamental", "solid"], 38, 17, 63],
  ["feira-mercado", "Feira & Mercado", "Regional", "Etiquetas e cartões modulares em página quadrada.", "Work Sans", "#fff4d3", "#312523", "#855018", "Square", "portrait", 1, 2, ["split", "numbered", "card", "top", "1:1", "badge", "elevated", "dotted", "accent-blocks"], 30, 10, 52],
  ["delivery-express", "Delivery Express", "Painéis", "Lista compacta com preços em destaque.", "Inter", "#f8fbff", "#172532", "#1d568c", "A5", "portrait", 1, 1, ["split", "filled", "compact", "none", "1:1", "highlight", "flat", "solid", "solid"], 24, 6, 44],
  ["menu-board", "Menu Board 16:9", "Painéis", "Tipografia de painel e grade de três colunas.", "Archivo Black", "#fff1bc", "#241d13", "#8b371c", "screen", "landscape", 1, 3, ["left", "filled", "featured", "top", "16:9", "highlight", "soft", "none", "split"], 30, 10, 68],
  ["menu-board-industrial", "Menu Board Industrial", "Painéis", "Painel de alto contraste com cartões escuros.", "Barlow Condensed", "#1d2122", "#faf9f1", "#f5b75d", "screen", "landscape", 1, 3, ["banner", "numbered", "card", "top", "4:3", "badge", "bordered", "solid", "texture"], 29, 9, 66],
  ["photo-magazine", "Photo Magazine", "Editorial", "Imagens protagonistas e recortes de revista.", "Instrument Serif", "#f9f5ec", "#271e21", "#934639", "A3", "portrait", 1, 2, ["hero", "plain", "featured", "cover", "3:4", "inline", "full-bleed", "none", "solid"], 45, 20, 90],
  ["landscape-premium", "Landscape Premium", "Editorial", "Cabeçalho dividido e três colunas arejadas.", "Instrument Serif", "#f7f4ea", "#252c2e", "#6f5340", "A3", "landscape", 3, 1, ["split", "ribbon", "editorial", "none", "16:9", "right", "bordered", "ornamental", "solid"], 56, 23, 81],
];

export const CATALOG_VERSION = 2;
export const LEGACY_TEMPLATE_IDS = new Map([
  ['modern-clean', 'moderno-limpo'], ['elegant-dark', 'bistro-elegante'],
  ['casual-grid', 'cafe-aconchegante'], ['rustic-cards', 'padaria-artesanal'],
]);

export const PRESET_TEMPLATES: MenuStyle[] = recipes.map((recipe, index) => {
  const [id, name, segment, description, fontFamily, backgroundColor, textColor, primaryColor, preset,
    orientation, categoryColumnCount, columnCount, composition, margin, gap, title] = recipe;
  const [header, category, product, image, imageRatio, price, card, divider, background] = composition;
  const align = header === 'centered' || header === 'banner' ? 'center' : 'left';
  const compact = categoryColumnCount > 1 || columnCount > 1 || product === 'compact';
  return {
    id, name, scope: 'system', sourceType: 'preset', isLocked: true, templateVersionId: id + '::catalog-v2',
    catalogMetadata: {
      description, category: segment, layoutFamily: product, pagePreset: preset, orientation,
      tags: [segment, orientation === 'landscape' ? 'Paisagem' : 'Retrato', preset],
      keywords: [fontFamily, product, image, header, categoryColumnCount + ' colunas', columnCount + ' produtos por linha'],
      sortOrder: index + 1, catalogVersion: CATALOG_VERSION,
    },
    pageSetup: normalizeMenuPageSetup({ preset, orientation }),
    design: { schemaVersion: 2, header, category, product, image, imageRatio, price, card, divider, background },
    menuTitle: 'Cardápio', menuSubtitle: 'Especialidades da casa',
    backgroundColor, textColor, primaryColor, fontFamily,
    cardBackgroundColor: backgroundColor,
    layoutMode: product === 'card' || product === 'featured' ? 'cards' : columnCount > 1 ? 'grid' : 'list',
    showImages: image !== 'none', categoryColumnCount, columnCount, hiddenProductIds: [],
    globalRadius: card === 'soft' ? 18 : card === 'elevated' ? 12 : card === 'bordered' ? 4 : 0,
    imageScale: compact ? 0.8 : 1,
    margins: { top: margin, right: margin, bottom: margin, left: margin, columnGap: compact ? 18 : 28 },
    contentSpacing: { headerToContent: gap + 10, categoryToProduct: gap, productNameToDescription: 3, betweenProducts: gap, productNameToPrice: 6 },
    elementStyles: {
      menuTitle: { fontSize: title, color: textColor, fontWeight: '700', textAlign: align, marginBottom: 6 },
      menuSubtitle: { fontSize: compact ? 16 : 18, color: textColor, textAlign: align, fontFamily: 'Inter', letterSpacing: 1 },
      category: { fontSize: compact ? 23 : 30, fontWeight: '700', color: primaryColor, textAlign: 'left' },
      productName: { fontSize: compact ? 17 : 22, color: textColor, fontWeight: '700' },
      productPrice: { fontSize: price === 'highlight' ? 22 : 16, color: primaryColor, fontWeight: '700', textAlign: 'right', fontFamily: 'Inter' },
      productDescription: { fontSize: compact ? 13 : 15, color: textColor, fontFamily: product === 'editorial' ? 'Inter' : fontFamily, lineHeight: 1.4 },
    },
  };
});
