import { useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppServicesProvider } from '../../src/presentation/app/AppServicesProvider';
import { browserServices } from '../../src/composition/browserServices';
import { INITIAL_STYLE } from '../../src/domain/menu/defaults';
import { PRESET_TEMPLATES } from '../../src/domain/templates/templateCatalog';
import { applyTemplateToCurrentStyle } from '../../src/application/templates/templateApplication';
import { sampleProducts } from '../../src/presentation/menu/designer/TemplatePreviewSurface';
import { MenuPreview } from '../../src/presentation/menu/canvas/MenuPreview';
import { exportMenuPagesToPdf } from '../../src/infrastructure/browser/pdfExport';
import { resolveMenuPageDimensions } from '../../src/domain/menu/pageSetup';
import '../../src/presentation/styles.css';

const library = [...PRESET_TEMPLATES, INITIAL_STYLE];

function CatalogReview() {
  const [{ index, adverse }, setReview] = useState({ index: 0, adverse: false });
  const template = library[index];
  const products = adverse ? Array.from({ length: 24 }, (_, position) => {
    const product = sampleProducts[position % sampleProducts.length];
    return { ...product, id: `adverse-${position}`, category: `${product.category} · ${position % 4 + 1}`,
      name: position % 4 === 0 ? 'Especial da casa com crocante de castanhas e legumes no forno' : product.name,
      price: position % 3 === 0 ? 12345.67 : product.price,
      description: position % 4 === 0 ? product.description.repeat(3) : product.description,
      image: position % 5 === 0 ? product.image : undefined };
  }) : sampleProducts;
  const style = applyTemplateToCurrentStyle({
    ...INITIAL_STYLE,
    menuTitle: adverse ? 'Casa Aurora · Cozinha de todo dia' : 'Casa Aurora',
    menuSubtitle: adverse ? 'Ingredientes de pequenos produtores · almoços e jantares de quarta a domingo' : 'Cozinha da estação',
    categoryImages: adverse ? {} : {
      Principais: { url: sampleProducts[2].image!, width: 360, height: 240 },
      Sobremesas: { url: sampleProducts[4].image!, width: 360, height: 240 },
    },
  }, template);
  useLayoutEffect(() => {
    Object.assign(window, {
      reviewTemplate: (index: number, adverse: boolean) => setReview({ index, adverse }),
      reviewMenuPdf: async () => {
        const { setup, widthMm, heightMm } = resolveMenuPageDimensions(style);
        const result = await exportMenuPagesToPdf({
          title: template.name, download: false,
          pageElements: [...document.querySelectorAll<HTMLElement>('[data-menu-print-page]')],
          currentPageIndex: 0,
          options: { orientation: setup.orientation, paperSize: setup.preset === 'screen' ? 'custom' : setup.preset,
            customPaperWidthMm: widthMm, customPaperHeightMm: heightMm, marginPreset: '0', customMarginMm: 0,
            scaleMode: 'actual', customScale: 100, bleedMm: 0, pageRange: '', pageMode: 'all',
            cropMarks: false, pageNumbers: true, printBackgrounds: true, grayscale: false, includeCanvasShadow: false },
        });
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(result.blob);
        });
      },
    });
  }, [style, template]);
  return <main data-catalog-review={`${index}:${adverse}`}>
    <MenuPreview key={`${index}-${adverse}`} products={products} style={style}
      sortOption={{ field: 'name', direction: 'asc' }} />
  </main>;
}

createRoot(document.getElementById('root')!).render(
  <AppServicesProvider services={browserServices}><CatalogReview /></AppServicesProvider>,
);
