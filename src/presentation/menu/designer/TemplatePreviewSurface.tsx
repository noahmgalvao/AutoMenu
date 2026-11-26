import { useMenuPageMeasurements } from '../canvas/useMenuPageMeasurements';
import { Heart } from 'lucide-react';
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { INITIAL_PRODUCTS, NO_TEMPLATE_ID } from '../../../domain/menu/defaults';
import type { MenuStyle, Product, SortOption } from '../../../domain/menu/model';
import { useMenuData } from '../interactions/useMenuData';
import { applyTemplateToCurrentStyle } from '../../../application/templates/templateApplication';
import { calculatePagination, finalizeMenuPages, getMenuTypographyScale, getFittedMenuSpacing, getFittedMenuProducts, getTypicalMenuFontSize } from '../../../domain/menu/menuPagination';
import { resolveMenuPageDimensions } from '../../../domain/menu/pageSetup';
import { MenuPage } from '../canvas/MenuPage';
import { DynamicFontLoader } from '../canvas/MenuPreview';
import { useResponsivePrices } from '../canvas/useResponsivePrices';

const sampleImage = (base: string, topping: string, herb: string) =>
  'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 360 240">
    <defs><radialGradient id="table"><stop stop-color="#f6e9d7"/><stop offset="1" stop-color="${base}"/></radialGradient></defs>
    <rect width="360" height="240" fill="url(#table)"/>
    <ellipse cx="183" cy="126" rx="103" ry="102" fill="#2f241b" opacity=".15"/>
    <circle cx="180" cy="119" r="99" fill="#efe5cf" stroke="#fff9ee" stroke-width="9"/>
    <circle cx="180" cy="119" r="77" fill="${base}" opacity=".54"/>
    ${Array.from({ length: 10 }, (_, i) => {
      const angle = i * 2.4;
      const radius = 12 + i * 5.5;
      const x = 180 + Math.cos(angle) * radius;
      const y = 119 + Math.sin(angle) * radius;
      return `<ellipse cx="${x}" cy="${y}" rx="17" ry="12" fill="${topping}" stroke="${base}" stroke-width="3" transform="rotate(${i * 31} ${x} ${y})"/>
      <ellipse cx="${x + 7}" cy="${y - 6}" rx="7" ry="2" fill="${herb}" transform="rotate(${i * 44} ${x + 7} ${y - 6})"/>`;
    }).join('')}</svg>`,
  );

export const sampleProducts: Product[] = [
  { id: 'sample-1', category: 'Entradas', name: 'Burrata da casa', description: 'Tomates assados, manjericão e azeite extravirgem.', price: 38, image: sampleImage('#db976f', '#f1c19c', '#576343') },
  { id: 'sample-2', category: 'Entradas', name: 'Crostini de cogumelos', description: 'Pão rústico, cogumelos salteados e tomilho.', price: 29 },
  { id: 'sample-3', category: 'Principais', name: 'Risoto de abóbora', description: 'Arroz arbóreo, queijo curado e manteiga de sálvia.', price: 62, image: sampleImage('#dca769', '#b86c39', '#495939') },
  { id: 'sample-4', category: 'Principais', name: 'Peixe grelhado', description: 'Legumes da estação e molho de limão.', price: 74, image: sampleImage('#9ca98e', '#e7bc8f', '#486246') },
  { id: 'sample-5', category: 'Sobremesas', name: 'Tarte de frutas', description: 'Massa amanteigada com frutas da estação.', price: 27, image: sampleImage('#ca9b8d', '#ac4f54', '#6e6f44') },
  { id: 'sample-6', category: 'Sobremesas', name: 'Creme de baunilha', description: 'Baunilha natural e crocante de amêndoas.', price: 25 },
];

interface TemplatePreviewProps {
  current: MenuStyle;
  template: MenuStyle;
  products: Product[];
  sortOption: SortOption;
  pageIndex: number;
  onPageChange: (index: number) => void;
  heart: number;
  onHeartEnd: () => void;
  thumbnail?: boolean;
}

export const TemplatePreviewSurface = memo(function TemplatePreviewSurface({
  current, template, products, sortOption, pageIndex, onPageChange, heart, onHeartEnd, thumbnail,
}: TemplatePreviewProps) {
  const sample = products.length === 0;
  const content = sample ? (template.id === NO_TEMPLATE_ID ? INITIAL_PRODUCTS : sampleProducts) : products;
  const style = useMemo(() => {
    const applied = applyTemplateToCurrentStyle(current, template);
    return sample ? { ...applied, menuTitle: 'Casa Aurora', menuSubtitle: 'Cozinha da estação' } : applied;
  }, [current, template, sample]);
  const { groupedProductsBase, sortedCategoriesBase } = useMenuData({ products: content, style, sortOption });
  const [measuredHeights, setMeasuredHeights] = useState<ReadonlyMap<string, number>>(() => new Map());
  const typographyScale = useMemo(() => getMenuTypographyScale(style, groupedProductsBase, sortedCategoriesBase),
    [style, groupedProductsBase, sortedCategoriesBase]);
  const pages = useMemo(() => {
    const placements = { ...style.categoryPositions, ...style.categoryPlacements };
    const calculated = calculatePagination(
      content, style, groupedProductsBase, sortedCategoriesBase,
      Object.keys(placements).length > 0 ? placements : null, { typographyScale, measuredHeights },
    );
    return finalizeMenuPages(calculated, style, content);
  }, [content, style, groupedProductsBase, sortedCategoriesBase, measuredHeights, typographyScale]);
  const { widthPx, heightPx } = resolveMenuPageDimensions(style);
  const stage = useRef<HTMLDivElement>(null);
  useResponsivePrices(stage, style);
  const [scale, setScale] = useState(0);
  const lastPage = Math.max(0, pages.length - 1);
  const visibleIndex = Math.min(pageIndex, lastPage);
  useMenuPageMeasurements(stage, pages, style.columnCount, setMeasuredHeights, typographyScale, getTypicalMenuFontSize(style), scale > 0 ? visibleIndex : undefined);
  useLayoutEffect(() => {
    if (pageIndex !== visibleIndex) onPageChange(visibleIndex);
  }, [onPageChange, pageIndex, visibleIndex]);
  const fonts = useMemo(() => [style.fontFamily, ...Object.values(style.elementStyles)
    .flatMap((element) => element?.fontFamily ? [element.fontFamily] : [])], [style]);
  const readOnlyHandlers = useMemo(() => ({
    readOnly: true, groupedProducts: groupedProductsBase, sortedCategories: sortedCategoriesBase,
  }), [groupedProductsBase, sortedCategoriesBase]);

  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const update = () => setScale(Math.min(element.clientWidth / widthPx, element.clientHeight / heightPx));
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [widthPx, heightPx]);

  return (
    <div className="template-immersive-preview">
      <DynamicFontLoader fonts={fonts} />
      <div ref={stage} className="relative grid min-h-0 flex-1 place-items-center overflow-hidden" role="img" aria-label={`Prévia de ${template.name}, página ${visibleIndex + 1} de ${pages.length}`}>
        {scale > 0 && <div inert style={{ width: widthPx * scale, height: heightPx * scale }}>
          <div style={{ width: widthPx, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <MenuPage pageIndex={visibleIndex} page={pages[visibleIndex]} style={getFittedMenuSpacing(style, typographyScale)} products={getFittedMenuProducts(content, typographyScale)}
              handlers={readOnlyHandlers} pageCount={pages.length} needsOverlay={!!style.sourceImage && !style.design}
              onAddPage={() => undefined} onDeletePage={() => undefined} onSetPageNumbersVisible={() => undefined} readOnly />
          </div>
        </div>}
        {heart > 0 && <div key={heart} data-discover-like-heart className="template-discover-like-heart"
          aria-hidden="true" onAnimationEnd={onHeartEnd}><Heart fill="currentColor" /></div>}
      </div>
      {!thumbnail && pages.length > 1 && <nav aria-label="Páginas da prévia" className="template-discover-pages" data-template-preview-controls>
        <button type="button" className="rounded-md p-2 hover:bg-white/15 disabled:opacity-40" disabled={visibleIndex === 0}
          onClick={() => onPageChange(visibleIndex - 1)} aria-label="Página anterior">←</button>
        <span>Página {visibleIndex + 1} / {pages.length}</span>
        <button type="button" className="rounded-md p-2 hover:bg-white/15 disabled:opacity-40" disabled={visibleIndex === pages.length - 1}
          onClick={() => onPageChange(visibleIndex + 1)} aria-label="Próxima página">→</button>
      </nav>}
    </div>
  );
});
