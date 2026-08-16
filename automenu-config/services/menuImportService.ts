import type {
  AddedImage,
  BoundingBox,
  ExtractedImage,
  MenuImportMode,
  MenuStyle,
  Product,
} from '../types';
import { analyzeMenuImage, fileToGenerativePart } from './geminiService';
import { uploadDataUrlAsset, uploadFileAsset } from './storageService';
import {
  createCleanBackground,
  getImageDimensions,
  processDecoration,
  sortMenuElements,
  sortSpatialElements,
} from '../utils/imageProcessor';
import { isUnmodifiedInitialProduct } from '../utils/pristineItems';
import { clampFontSize, resolveFontSizeLimits } from '../utils/styleRules';
import { FREE_TEXT_PREFIX } from '../utils/menuPagination';
import { normalizeColumnWidths } from '../utils/categoryColumns';
import { roundPrice } from '../utils/price';

export interface ProcessMenuImportOptions {
  files: File[];
  importMode: MenuImportMode;
  currentProducts: Product[];
  currentStyle: MenuStyle;
  workspaceId: string;
  userId: string;
  menuId: string;
}

export interface ProcessedMenuImport {
  importMode: MenuImportMode;
  products: Product[] | null;
  style: MenuStyle | null;
  orderStyle: Pick<
    MenuStyle,
    'customCategoryOrder' | 'customProductOrder' | 'hiddenProductIds' | 'pageBreaks' | 'categoryPlacements' | 'categoryPositions' | 'categoryColumnWidths'
  > | null;
  sourceAssetId: string;
  normalizedResult: Record<string, unknown>;
  productCount: number;
  imageCount: number;
  pageCount: number;
  previewProducts: Product[];
  previewStyle: MenuStyle;
  importedProducts: Product[];
  importedProductIds: string[];
}

export interface FinalizedMenuImport {
  products: Product[];
  style: MenuStyle;
}

export const deriveProcessedMenuImportMode = (
  processed: ProcessedMenuImport,
  mode: MenuImportMode,
  currentProducts: Product[],
  currentStyle: MenuStyle,
): ProcessedMenuImport | null => {
  if (mode === processed.importMode) return processed;
  if (processed.importMode !== 'complete') return null;

  if (mode === 'products') {
    const previewProducts = processed.previewProducts.filter((product) => !product.isFreeText);
    const previewStyle: MenuStyle = {
      ...currentStyle,
      ...(processed.orderStyle || {}),
      name: processed.orderStyle ? 'Custom' : currentStyle.name,
    };
    return {
      ...processed,
      importMode: 'products',
      products: previewProducts,
      style: null,
      previewProducts,
      previewStyle,
      normalizedResult: { ...processed.normalizedResult, importMode: 'products' },
    };
  }

  const importedStyle = processed.style;
  if (!importedStyle) return null;
  const previewStyle: MenuStyle = {
    ...importedStyle,
    categoryPlacements: currentStyle.categoryPlacements,
    categoryPositions: currentStyle.categoryPositions,
    customCategoryOrder: currentStyle.customCategoryOrder,
    customProductOrder: currentStyle.customProductOrder,
    hiddenProductIds: currentStyle.hiddenProductIds,
    pageBreaks: currentStyle.pageBreaks,
  };
  return {
    ...processed,
    importMode: 'visual',
    products: null,
    style: previewStyle,
    orderStyle: null,
    previewProducts: currentProducts,
    previewStyle,
    importedProducts: [],
    importedProductIds: [],
    normalizedResult: { ...processed.normalizedResult, importMode: 'visual' },
  };
};

type AnalysisResult = Awaited<ReturnType<typeof analyzeMenuImage>>;

interface ProcessedImage {
  addedImage: AddedImage;
  extractedImage: ExtractedImage;
}

interface AnalyzedPage {
  pageIndex: number;
  sourceUpload: Awaited<ReturnType<typeof uploadFileAsset>>;
  result: AnalysisResult;
  imageDimensions: { width: number; height: number };
  categories: AnalysisResult['categories'];
  freeTextElements: any[];
  processedImages: ProcessedImage[];
  background?: {
    url: string;
    assetId: string;
  };
}

const isBoundingBox = (value: any): value is BoundingBox => (
  value
  && [value.x, value.y, value.width, value.height].every((coordinate) => (
    Number.isFinite(Number(coordinate))
  ))
  && Number(value.width) > 0
  && Number(value.height) > 0
);

const getBoundingBoxIntersectionRatio = (target: BoundingBox, candidate: BoundingBox) => {
  const left = Math.max(target.x, candidate.x);
  const top = Math.max(target.y, candidate.y);
  const right = Math.min(target.x + target.width, candidate.x + candidate.width);
  const bottom = Math.min(target.y + target.height, candidate.y + candidate.height);
  if (right <= left || bottom <= top) return 0;
  return ((right - left) * (bottom - top)) / Math.max(1, target.width * target.height);
};

const getDecorationExclusions = (
  target: BoundingBox,
  candidates: BoundingBox[],
) => candidates.filter((candidate) => (
  candidate !== target
  && getBoundingBoxIntersectionRatio(target, candidate) > 0
  && getBoundingBoxIntersectionRatio(target, candidate) < 0.72
));

const getAnalyzedPageColumnGeometry = (page: AnalyzedPage) => {
  const layout = page.result.styleSuggestion?.layout || {};
  const columnCount = [1, 2, 3].includes(Number(layout.categoryColumnCount))
    ? Number(layout.categoryColumnCount)
    : 1;
  const categoryCenters = page.categories
    .map((category) => category.boundingBox
      ? category.boundingBox.x + (category.boundingBox.width / 2)
      : null)
    .filter((center): center is number => Number.isFinite(center))
    .sort((left, right) => left - right);
  let centers = Array.from({ length: columnCount }, (_, index) => (
    ((index + 0.5) / columnCount) * page.imageDimensions.width
  ));

  if (categoryCenters.length >= columnCount) {
    centers = Array.from({ length: columnCount }, (_, index) => (
      categoryCenters[Math.min(
        categoryCenters.length - 1,
        Math.round(((index + 0.5) / columnCount) * categoryCenters.length - 0.5),
      )]
    ));
    for (let iteration = 0; iteration < 12; iteration += 1) {
      const groups = Array.from({ length: columnCount }, () => [] as number[]);
      categoryCenters.forEach((center) => {
        const closestIndex = centers.reduce((bestIndex, candidate, index) => (
          Math.abs(center - candidate) < Math.abs(center - centers[bestIndex])
            ? index
            : bestIndex
        ), 0);
        groups[closestIndex].push(center);
      });
      centers = centers.map((center, index) => (
        groups[index].length > 0
          ? groups[index].reduce((sum, value) => sum + value, 0) / groups[index].length
          : center
      )).sort((left, right) => left - right);
    }
  }

  const modelWidths: number[] | undefined = Array.isArray(layout.categoryColumnWidths)
    ? layout.categoryColumnWidths.map((width: unknown) => Number(width))
    : undefined;
  let widths: number[];
  if (
    modelWidths?.length === columnCount
    && modelWidths.every((width) => Number.isFinite(width) && width > 0)
  ) {
    widths = normalizeColumnWidths(modelWidths, columnCount);
  } else {
    const left = Math.max(
      0,
      (Number(layout.marginLeft) || 0) / 794 * page.imageDimensions.width,
    );
    const right = Math.min(
      page.imageDimensions.width,
      page.imageDimensions.width - ((Number(layout.marginRight) || 0) / 794 * page.imageDimensions.width),
    );
    const boundaries = [
      left,
      ...centers.slice(0, -1).map((center, index) => (center + centers[index + 1]) / 2),
      right,
    ];
    widths = normalizeColumnWidths(
      boundaries.slice(0, -1).map((boundary, index) => Math.max(1, boundaries[index + 1] - boundary)),
      columnCount,
    );
  }

  return {
    columnCount,
    centers,
    widths,
    getColumnIndex: (centerX: number) => centers.reduce((bestIndex, center, index) => (
      Math.abs(centerX - center) < Math.abs(centerX - centers[bestIndex])
        ? index
        : bestIndex
    ), 0),
  };
};

const estimateFontSizeFromBoundingBox = (
  page: AnalyzedPage,
  box: BoundingBox | undefined,
  text: string,
  lineHeight = 1.2,
) => {
  if (!box) return null;
  const height = (box.height / page.imageDimensions.height) * 1123;
  const width = (box.width / page.imageDimensions.width) * 794;
  if (height <= 0 || width <= 0) return null;

  const explicitLineCount = Math.max(1, String(text || '').split(/\r?\n/).length);
  const compactTextLength = Math.max(1, String(text || '').replace(/\s+/g, ' ').trim().length);
  const maximumLineCount = Math.min(6, Math.max(explicitLineCount, String(text || '').trim().split(/\s+/).length));
  const visibleGlyphRatio = 0.82;
  let bestSize = height / (visibleGlyphRatio + ((explicitLineCount - 1) * lineHeight));
  let bestScore = Number.POSITIVE_INFINITY;

  for (let lineCount = explicitLineCount; lineCount <= maximumLineCount; lineCount += 1) {
    const candidateSize = height / (visibleGlyphRatio + ((lineCount - 1) * lineHeight));
    const estimatedCharactersPerLine = width / Math.max(1, candidateSize * 0.54);
    const estimatedLines = Math.max(explicitLineCount, Math.ceil(compactTextLength / Math.max(1, estimatedCharactersPerLine)));
    const score = Math.abs(estimatedLines - lineCount) + (lineCount - explicitLineCount) * 0.04;
    if (score < bestScore) {
      bestScore = score;
      bestSize = candidateSize;
    }
  }

  return Number.isFinite(bestSize) ? bestSize : null;
};

const getMedian = (values: Array<number | null | undefined>) => {
  const sorted = values
    .filter((value): value is number => Number.isFinite(value) && Number(value) > 0)
    .sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const estimateFontSizeFromKnownLines = (
  page: AnalyzedPage,
  box: BoundingBox | undefined,
  lineCount: number,
  lineHeight = 1.18,
) => {
  if (!box) return null;
  const height = (box.height / page.imageDimensions.height) * 1123;
  const lines = Math.max(1, Math.round(Number(lineCount) || 1));
  const size = height / (0.82 + ((lines - 1) * lineHeight));
  return Number.isFinite(size) && size > 0 ? size : null;
};

const getScaledVerticalGap = (
  page: AnalyzedPage,
  upperBox: BoundingBox | undefined,
  lowerBox: BoundingBox | undefined,
) => {
  if (!upperBox || !lowerBox) return null;
  const sourceGap = lowerBox.y - (upperBox.y + upperBox.height);
  if (!Number.isFinite(sourceGap) || sourceGap < 0) return null;
  return (sourceGap / page.imageDimensions.height) * 1123;
};

const getCategoryHeaderBox = (category: AnalysisResult['categories'][number]) => (
  category.nameBoundingBox || category.boundingBox
);

const getCategoryBlockBottom = (category: AnalysisResult['categories'][number]) => {
  const boxes = [
    getCategoryHeaderBox(category),
    ...category.products.flatMap((product) => [
      product.boundingBox,
      product.nameBoundingBox,
      product.descriptionBoundingBox,
      product.priceBoundingBox,
    ]),
  ].filter(isBoundingBox);
  return boxes.reduce((bottom, box) => Math.max(bottom, box.y + box.height), 0);
};

const getLargeGapCategoryPositions = (
  page: AnalyzedPage,
  geometry: ReturnType<typeof getAnalyzedPageColumnGeometry>,
  categoryNameByKey: Map<string, string>,
) => {
  const positions: NonNullable<MenuStyle['categoryPositions']> = {};
  const categoriesByColumn = Array.from({ length: geometry.columnCount }, () => [] as AnalysisResult['categories']);

  page.categories.forEach((category) => {
    const box = getCategoryHeaderBox(category);
    if (!box) return;
    const centerX = box.x + (box.width / 2);
    categoriesByColumn[geometry.getColumnIndex(centerX)].push(category);
  });

  categoriesByColumn.forEach((categories, columnIndex) => {
    const ordered = categories.sort((left, right) => (
      (getCategoryHeaderBox(left)?.y || 0) - (getCategoryHeaderBox(right)?.y || 0)
    ));
    const gaps = ordered.slice(1).map((category, index) => {
      const box = getCategoryHeaderBox(category);
      const previousBottom = getCategoryBlockBottom(ordered[index]);
      if (!box) return null;
      const gap = ((box.y - previousBottom) / page.imageDimensions.height) * 1123;
      return Number.isFinite(gap) && gap >= 0 ? gap : null;
    });

    ordered.slice(1).forEach((category, index) => {
      const box = getCategoryHeaderBox(category);
      if (!box) return;
      const previousBottom = getCategoryBlockBottom(ordered[index]);
      const gap = ((box.y - previousBottom) / page.imageDimensions.height) * 1123;
      const peerGaps = gaps
        .filter((peerGap, gapIndex): peerGap is number => gapIndex !== index && peerGap !== null)
        .sort((left, right) => left - right);
      const baselineSample = peerGaps.slice(0, Math.max(1, Math.ceil(peerGaps.length / 2)));
      const typicalGap = baselineSample.length > 0 ? (getMedian(baselineSample) || 16) : 16;
      const largeGapThreshold = Math.max(72, typicalGap + 48, typicalGap * 1.8);
      if (!Number.isFinite(gap) || gap < largeGapThreshold) return;
      const categoryName = categoryNameByKey.get(normalizeEntityName(category.name)) || category.name;
      positions[categoryName] = {
        pageIndex: page.pageIndex,
        columnIndex,
        y: Math.max(0, Math.round((box.y / page.imageDimensions.height) * 1123)),
      };
    });
  });

  return positions;
};

const buildFreeTextProduct = (
  freeText: any,
  pageIndex: number,
): Product => {
  const id = crypto.randomUUID();
  return {
    id,
    name: String(freeText.text || ''),
    price: 0,
    description: '',
    category: `${FREE_TEXT_PREFIX}imported_page_${pageIndex}_${id}`,
    categoryId: null,
    image: '',
    isFreeText: true,
    customMarginTop: 10,
    boundingBox: isBoundingBox(freeText.boundingBox) ? freeText.boundingBox : undefined,
    styles: {
      fontSize: freeText.fontSize,
      color: freeText.color,
      textAlign: freeText.alignment || 'left',
      fontFamily: freeText.fontFamily,
      fontWeight: freeText.fontWeight,
      textTransform: freeText.textTransform,
    },
  };
};

const getImportedFreeTextPageIndex = (category: string) => {
  const match = /^(?:ft_imported_page_|ft_zone_imported_page_)(\d+)(?:_|$)/.exec(category);
  return match ? Number(match[1]) : 0;
};

interface MergedImportedProducts {
  products: Product[];
  customCategoryOrder: string[];
  customProductOrder: Record<string, string[]>;
  hiddenProductIds: string[];
  categoryNameByKey: Map<string, string>;
  importedProductIds: string[];
}

const normalizeEntityName = (value: string) => (
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR')
);

const appendUnique = <T,>(values: T[], value: T) => {
  if (!values.includes(value)) values.push(value);
};

export const mergeImportedProducts = (
  currentProducts: Product[],
  importedProducts: Product[],
  currentStyle: MenuStyle,
): MergedImportedProducts => {
  const removesUntouchedInitialProducts = importedProducts.length > 0;
  const existingProducts = currentProducts.filter((product) => (
    !product.isFreeText
    && !(removesUntouchedInitialProducts && isUnmodifiedInitialProduct(product))
  ));
  const existingCategoryNameByKey = new Map<string, string>();
  const existingCategoryIdByKey = new Map<string, string>();

  existingProducts.forEach((product) => {
    const categoryKey = normalizeEntityName(product.category);
    if (!categoryKey) return;
    if (!existingCategoryNameByKey.has(categoryKey)) {
      existingCategoryNameByKey.set(categoryKey, product.category);
    }
    if (product.categoryId && !existingCategoryIdByKey.has(categoryKey)) {
      existingCategoryIdByKey.set(categoryKey, product.categoryId);
    }
  });

  const existingCategoryOrder: string[] = [];
  (currentStyle.customCategoryOrder || []).forEach((category) => {
    const canonicalName = existingCategoryNameByKey.get(normalizeEntityName(category));
    if (canonicalName) appendUnique(existingCategoryOrder, canonicalName);
  });
  existingProducts.forEach((product) => {
    appendUnique(existingCategoryOrder, product.category);
  });

  const existingProductOrderByCategory = new Map<string, Product[]>();
  existingCategoryOrder.forEach((category) => {
    const categoryKey = normalizeEntityName(category);
    const categoryProducts = existingProducts.filter((product) => (
      normalizeEntityName(product.category) === categoryKey
    ));
    const productsById = new Map(categoryProducts.map((product) => [product.id, product]));
    const ordered: Product[] = [];

    (currentStyle.customProductOrder?.[category] || []).forEach((productId) => {
      const product = productsById.get(productId);
      if (product && !ordered.includes(product)) ordered.push(product);
    });
    categoryProducts.forEach((product) => {
      if (!ordered.includes(product)) ordered.push(product);
    });
    existingProductOrderByCategory.set(categoryKey, ordered);
  });

  const categoryNameByKey = new Map(existingCategoryNameByKey);
  const categoryIdByKey = new Map(existingCategoryIdByKey);
  const resolvedProductByKey = new Map<string, Product>();
  existingProducts.forEach((product) => {
    const lookupKey = `${normalizeEntityName(product.category)}\u0000${normalizeEntityName(product.name)}`;
    if (!resolvedProductByKey.has(lookupKey)) {
      resolvedProductByKey.set(lookupKey, product);
    }
  });

  const resolvedProductById = new Map(existingProducts.map((product) => [product.id, product]));
  const importedCategoryOrder: string[] = [];
  const importedProductIdsByCategory = new Map<string, string[]>();

  importedProducts.forEach((importedProduct) => {
    const categoryKey = normalizeEntityName(importedProduct.category);
    const productKey = normalizeEntityName(importedProduct.name);
    if (!categoryKey || !productKey) return;

    let categoryName = categoryNameByKey.get(categoryKey);
    if (!categoryName) {
      categoryName = importedProduct.category;
      categoryNameByKey.set(categoryKey, categoryName);
    }
    if (!categoryIdByKey.has(categoryKey)) {
      categoryIdByKey.set(categoryKey, importedProduct.categoryId || crypto.randomUUID());
    }
    appendUnique(importedCategoryOrder, categoryName);

    const lookupKey = `${categoryKey}\u0000${productKey}`;
    const existingProduct = resolvedProductByKey.get(lookupKey);
    let resolvedProduct: Product;

    if (existingProduct) {
      const hasSameImportedData = (
        existingProduct.description === importedProduct.description
        && Number(existingProduct.price) === Number(importedProduct.price)
      );
      resolvedProduct = hasSameImportedData
        ? existingProduct
        : {
          ...existingProduct,
          description: importedProduct.description,
          price: roundPrice(importedProduct.price),
        };
    } else {
      resolvedProduct = {
        ...importedProduct,
        category: categoryName,
        categoryId: categoryIdByKey.get(categoryKey) || importedProduct.categoryId,
      };
    }

    resolvedProductByKey.set(lookupKey, resolvedProduct);
    resolvedProductById.set(resolvedProduct.id, resolvedProduct);
    const importedIds = importedProductIdsByCategory.get(categoryKey) || [];
    appendUnique(importedIds, resolvedProduct.id);
    importedProductIdsByCategory.set(categoryKey, importedIds);
  });

  const customCategoryOrder = [...importedCategoryOrder];
  existingCategoryOrder.forEach((category) => appendUnique(customCategoryOrder, category));

  const customProductOrder: Record<string, string[]> = {};
  customCategoryOrder.forEach((category) => {
    const categoryKey = normalizeEntityName(category);
    const orderedIds = [...(importedProductIdsByCategory.get(categoryKey) || [])];
    (existingProductOrderByCategory.get(categoryKey) || []).forEach((product) => {
      appendUnique(orderedIds, product.id);
    });
    customProductOrder[category] = orderedIds;
  });

  const products: Product[] = [];
  customCategoryOrder.forEach((category) => {
    (customProductOrder[category] || []).forEach((productId) => {
      const product = resolvedProductById.get(productId);
      if (product && !products.some((candidate) => candidate.id === product.id)) {
        products.push(product);
      }
    });
  });

  const retainedProductIds = new Set(products.map((product) => product.id));
  return {
    products,
    customCategoryOrder,
    customProductOrder,
    hiddenProductIds: (currentStyle.hiddenProductIds || [])
      .filter((productId) => retainedProductIds.has(productId)),
    categoryNameByKey,
    importedProductIds: Array.from(importedProductIdsByCategory.values()).flat(),
  };
};

export const processMenuImport = async ({
  files,
  importMode,
  currentProducts,
  currentStyle,
  workspaceId,
  userId,
  menuId,
}: ProcessMenuImportOptions): Promise<ProcessedMenuImport> => {
  if (files.length === 0) throw new Error('Nenhuma página foi selecionada.');

  const importsProducts = importMode !== 'visual';
  const importsVisual = importMode !== 'products';
  const A4_WIDTH = 794;
  const A4_HEIGHT = 1123;
  const analyzedPages: AnalyzedPage[] = [];

  for (let pageIndex = 0; pageIndex < files.length; pageIndex += 1) {
    const file = files[pageIndex];
    const sourceUpload = await uploadFileAsset({
      workspaceId,
      userId,
      bucket: 'ai-imports',
      assetType: 'ai_source_image',
      file,
      metadata: { menu_id: menuId, page_index: pageIndex },
    });
    const base64 = await fileToGenerativePart(file);
    const originalImageBase64 = `data:${file.type || 'image/png'};base64,${base64}`;
    const imageDimensions = await getImageDimensions(originalImageBase64);
    const result = await analyzeMenuImage(
      base64,
      file.type || 'image/png',
      imageDimensions,
    );
    const aiStyle = result.styleSuggestion || {};
    const typography = aiStyle.typography || {};
    const detectedCategoryColumnCount = Number(aiStyle.layout?.categoryColumnCount) || 1;
    const freeTextElements = Array.isArray(aiStyle.freeTextElements)
      ? aiStyle.freeTextElements
      : [];
    const allBoundingBoxes: BoundingBox[] = [
      ...result.categories.flatMap((category) => [
        category.nameBoundingBox || category.boundingBox,
        ...category.products.map((product) => product.boundingBox),
      ]),
      ...result.extractedImages.map((image) => image.boundingBox),
      typography.mainTitle?.boundingBox,
      typography.subtitle?.exists ? typography.subtitle?.boundingBox : undefined,
      ...freeTextElements.map((element: any) => element.boundingBox),
    ].filter(isBoundingBox);
    const categories = sortMenuElements(result.categories, detectedCategoryColumnCount);
    const sortedImages = sortSpatialElements(result.extractedImages);
    const sortedFreeTextElements = sortSpatialElements(freeTextElements);

    let background: AnalyzedPage['background'];
    if (importsVisual) {
      const cleanedBackground = await createCleanBackground(
        originalImageBase64,
        allBoundingBoxes,
      );
      const uploadedBackground = await uploadDataUrlAsset({
        workspaceId,
        userId,
        bucket: 'menu-assets',
        assetType: 'menu_background',
        dataUrl: cleanedBackground,
        fileName: `fundo-importado-${pageIndex + 1}.png`,
        metadata: {
          menu_id: menuId,
          page_index: pageIndex,
          source_asset_id: sourceUpload.asset.id,
        },
      });
      background = {
        url: uploadedBackground.url,
        assetId: uploadedBackground.asset.id,
      };
    }

    const processedImages: ProcessedImage[] = importsVisual
      ? (await Promise.all(sortedImages.map(async (image): Promise<ProcessedImage | null> => {
        const boundingBox = image.boundingBox;
        if (!boundingBox) return null;

        try {
          const cropBase64 = await processDecoration(file, boundingBox, {
            foregroundType: image.type,
            exclusionBoxes: getDecorationExclusions(boundingBox, allBoundingBoxes),
          });
          const uploadedCrop = await uploadDataUrlAsset({
            workspaceId,
            userId,
            bucket: 'ai-imports',
            assetType: 'ai_extracted_asset',
            dataUrl: cropBase64,
            fileName: `${image.id}.png`,
            metadata: {
              menu_id: menuId,
              page_index: pageIndex,
              description: image.description,
              type: image.type,
              bounding_box: boundingBox,
            },
          });

          return {
            addedImage: {
              id: image.id,
              url: uploadedCrop.url,
              assetId: uploadedCrop.asset.id,
              x: (boundingBox.x / imageDimensions.width) * A4_WIDTH,
              y: (boundingBox.y / imageDimensions.height) * A4_HEIGHT,
              width: (boundingBox.width / imageDimensions.width) * A4_WIDTH,
              pageIndex,
              zIndex: 1,
              boundingBox,
            },
            extractedImage: {
              ...image,
              url: uploadedCrop.url,
            },
          } satisfies ProcessedImage;
        } catch (cropError) {
          console.warn('Falha ao recortar imagem extraída:', cropError);
          return null;
        }
      }))).filter((processedImage): processedImage is ProcessedImage => processedImage !== null)
      : [];

    analyzedPages.push({
      pageIndex,
      sourceUpload,
      result,
      imageDimensions,
      categories,
      freeTextElements: sortedFreeTextElements,
      processedImages,
      background,
    });
  }

  const firstPage = analyzedPages[0];
  const firstAiStyle = firstPage.result.styleSuggestion || {};
  const colors = firstAiStyle.globalColors || {};
  const layout = firstAiStyle.layout || {};
  const typography = firstAiStyle.typography || {};
  const spacing = firstAiStyle.spacing || {};
  const sortedCategories = analyzedPages.flatMap((page) => page.categories);
  const processedImages = analyzedPages.flatMap((page) => page.processedImages);

  const extractedProducts: Product[] = sortedCategories.flatMap((category) => (
    category.products.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: roundPrice(product.price),
      category: category.name,
      categoryId: category.id,
      image: '',
      boundingBox: product.boundingBox,
      nameBoundingBox: product.nameBoundingBox,
      descriptionBoundingBox: product.descriptionBoundingBox,
      priceBoundingBox: product.priceBoundingBox,
      priceLineCount: product.priceLineCount,
      extractedImages: processedImages
        .map(({ extractedImage }) => extractedImage)
        .filter((image) => (
          image.relatedProductName === product.name
          && (!image.relatedCategoryName || image.relatedCategoryName === category.name)
        )),
    }))
  ));
  const freeTextProducts = importMode === 'complete'
    ? analyzedPages.flatMap((page) => (
      page.freeTextElements.map((freeText) => buildFreeTextProduct(freeText, page.pageIndex))
    ))
    : [];
  const mergedImport = mergeImportedProducts(
    currentProducts,
    extractedProducts,
    currentStyle,
  );
  const finalProducts = [...mergedImport.products, ...freeTextProducts];
  const customProductOrder: Record<string, string[]> = {
    ...mergedImport.customProductOrder,
  };
  freeTextProducts.forEach((product) => {
    customProductOrder[product.category] = [
      ...(customProductOrder[product.category] || []),
      product.id,
    ];
  });

  const importedCategoryOrder = Array.from(new Set([
    ...mergedImport.customCategoryOrder,
    ...freeTextProducts.map((product) => product.category),
  ]));
  const pageColumnGeometry = analyzedPages.map(getAnalyzedPageColumnGeometry);
  const categoryPlacements = importsProducts
    ? analyzedPages.reduce<Record<string, { pageIndex: number; columnIndex: number }>>((placements, page) => {
      const geometry = pageColumnGeometry[page.pageIndex];
      page.categories.forEach((category) => {
        const mergedCategoryName = mergedImport.categoryNameByKey.get(normalizeEntityName(category.name))
          || category.name;
        if (placements[mergedCategoryName]) return;
        const centerX = (category.boundingBox?.x || 0) + ((category.boundingBox?.width || 0) / 2);
        const columnIndex = geometry.getColumnIndex(centerX);
        placements[mergedCategoryName] = { pageIndex: page.pageIndex, columnIndex };
      });
      return placements;
    }, {})
    : currentStyle.categoryPlacements;
  if (importsProducts && categoryPlacements) {
    freeTextProducts.forEach((product) => {
      const pageIndex = getImportedFreeTextPageIndex(product.category);
      const page = analyzedPages[pageIndex];
      const geometry = pageColumnGeometry[pageIndex];
      const centerX = (product.boundingBox?.x || 0) + ((product.boundingBox?.width || 0) / 2);
      categoryPlacements[product.category] = {
        pageIndex,
        columnIndex: page && geometry
          ? geometry.getColumnIndex(centerX)
          : 0,
      };
    });
  }
  const categoryPositions = importsProducts
    ? analyzedPages.reduce<NonNullable<MenuStyle['categoryPositions']>>((positions, page) => {
      const geometry = pageColumnGeometry[page.pageIndex];
      Object.assign(
        positions,
        getLargeGapCategoryPositions(page, geometry, mergedImport.categoryNameByKey),
      );
      return positions;
    }, {})
    : currentStyle.categoryPositions;
  const globalColumnCount = pageColumnGeometry[0]?.columnCount || 1;
  const compatiblePageWidths = pageColumnGeometry
    .filter((geometry) => geometry.columnCount === globalColumnCount)
    .map((geometry) => geometry.widths);
  const categoryColumnWidths = normalizeColumnWidths(
    Array.from({ length: globalColumnCount }, (_, columnIndex) => (
      compatiblePageWidths.reduce((sum, widths) => sum + (widths[columnIndex] || 0), 0)
      / Math.max(1, compatiblePageWidths.length)
    )),
    globalColumnCount,
  );
  const pageBreaks = analyzedPages.slice(1).map((page) => (
    mergedImport.categoryNameByKey.get(normalizeEntityName(page.categories[0]?.name || ''))
    || (
      importMode === 'complete'
        ? freeTextProducts.find((product) => getImportedFreeTextPageIndex(product.category) === page.pageIndex)?.category || ''
        : ''
    )
  )).filter(Boolean);
  const orderStyle: ProcessedMenuImport['orderStyle'] = importsProducts
    ? {
      customCategoryOrder: importedCategoryOrder,
      customProductOrder,
      hiddenProductIds: mergedImport.hiddenProductIds,
      pageBreaks,
      categoryPlacements,
      categoryPositions,
      categoryColumnWidths,
    }
    : null;

  let importedStyle: MenuStyle | null = null;
  if (importsVisual) {
    const categoryColumnCount = [1, 2, 3].includes(Number(layout.categoryColumnCount))
      ? Number(layout.categoryColumnCount) as 1 | 2 | 3
      : 1;
    const primaryColor = colors.primary || '#000000';
    const textColor = colors.text || '#1f2937';
    const importedMetric = (value: unknown, fallback: number) => {
      if (value === null || value === undefined || value === '') return fallback;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const fallbackPadding = importedMetric(layout.contentPadding, 48);
    const margins = {
      top: Math.min(300, Math.max(0, importedMetric(layout.marginTop, fallbackPadding))),
      bottom: Math.min(300, Math.max(0, importedMetric(layout.marginBottom, fallbackPadding))),
      left: Math.min(300, Math.max(0, importedMetric(layout.marginLeft, fallbackPadding))),
      right: Math.min(300, Math.max(0, importedMetric(layout.marginRight, fallbackPadding))),
      columnGap: Math.min(300, Math.max(0, importedMetric(layout.columnGap, 32))),
    };
    const titleBox = isBoundingBox(typography.mainTitle?.boundingBox)
      ? typography.mainTitle.boundingBox as BoundingBox
      : undefined;
    const subtitleBox = typography.subtitle?.exists && isBoundingBox(typography.subtitle?.boundingBox)
      ? typography.subtitle.boundingBox as BoundingBox
      : undefined;
    const firstCategoryBox = firstPage.categories
      .map(getCategoryHeaderBox)
      .filter(isBoundingBox)
      .sort((left, right) => left.y - right.y)[0];
    const measuredTitleToSubtitle = getScaledVerticalGap(firstPage, titleBox, subtitleBox);
    const measuredHeaderToContent = getScaledVerticalGap(
      firstPage,
      subtitleBox || titleBox,
      firstCategoryBox,
    );
    const contentSpacing = {
      headerToContent: Math.min(200, Math.max(0, measuredHeaderToContent ?? importedMetric(spacing.headerToContent, 20))),
      categoryToProduct: Math.min(200, Math.max(0, importedMetric(spacing.categoryToFirstProduct, 16))),
      productNameToDescription: Math.min(200, Math.max(0, importedMetric(spacing.productNameToDescription, 4))),
      betweenProducts: Math.min(200, Math.max(0, importedMetric(spacing.betweenProducts, 16))),
      productNameToPrice: Math.min(200, Math.max(0, importedMetric(spacing.productNameToPrice, 4))),
    };
    const fontLimits = resolveFontSizeLimits(currentStyle);
    const categoryFontMeasurement = getMedian(analyzedPages.flatMap((page) => (
      page.categories.map((category) => estimateFontSizeFromBoundingBox(
        page,
        category.boundingBox,
        category.name,
        1.16,
      ))
    )));
    const productNameFontMeasurement = getMedian(analyzedPages.flatMap((page) => (
      page.categories.flatMap((category) => category.products.map((product) => (
        estimateFontSizeFromBoundingBox(page, product.nameBoundingBox, product.name, 1.18)
      )))
    )));
    const productDescriptionFontMeasurement = getMedian(analyzedPages.flatMap((page) => (
      page.categories.flatMap((category) => category.products.map((product) => (
        estimateFontSizeFromBoundingBox(page, product.descriptionBoundingBox, product.description, 1.32)
      )))
    )));
    const productPriceFontMeasurement = getMedian(analyzedPages.flatMap((page) => (
      page.categories.flatMap((category) => category.products.map((product) => (
        estimateFontSizeFromKnownLines(page, product.priceBoundingBox, product.priceLineCount || 1, 1.18)
      )))
    )));
    const titleFontMeasurement = estimateFontSizeFromBoundingBox(
      firstPage,
      typography.mainTitle?.boundingBox,
      typography.mainTitle?.text || '',
      1.14,
    );
    const subtitleFontMeasurement = typography.subtitle?.exists
      ? estimateFontSizeFromBoundingBox(
        firstPage,
        typography.subtitle?.boundingBox,
        typography.subtitle?.text || '',
        1.2,
      )
      : null;
    const importedFontSize = (
      key: Parameters<typeof clampFontSize>[1],
      value: unknown,
      fallback: number,
      measuredValue?: number | null,
    ) => {
      const modelValue = Number(value);
      const hasModelValue = Number.isFinite(modelValue) && modelValue > 0;
      const hasMeasuredValue = Number.isFinite(measuredValue) && Number(measuredValue) > 0;
      const preciseValue = hasMeasuredValue
        ? hasModelValue
          ? (Number(measuredValue) * 0.78) + (modelValue * 0.22)
          : Number(measuredValue)
        : hasModelValue
          ? modelValue
          : fallback;
      return clampFontSize(currentStyle, key, preciseValue, fallback);
    };

    importedStyle = {
      ...currentStyle,
      id: crypto.randomUUID(),
      name: `Design IA (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
      scope: 'workspace',
      sourceType: 'ai_import',
      menuTitle: typography.mainTitle?.text || '',
      menuSubtitle: (typography.subtitle?.exists && typography.subtitle?.text)
        ? typography.subtitle.text
        : '',
      fontFamily: typography.mainTitle?.fontFamily || currentStyle.fontFamily || 'Inter',
      primaryColor,
      backgroundColor: 'transparent',
      textColor,
      backgroundImage: firstPage.background?.url || currentStyle.backgroundImage,
      backgroundAssetId: firstPage.background?.assetId || currentStyle.backgroundAssetId,
      pageBackgrounds: analyzedPages.slice(1)
        .filter((page) => Boolean(page.background))
        .map((page) => ({
          pageIndex: page.pageIndex,
          url: page.background!.url,
          assetId: page.background!.assetId,
        })),
      sourceImage: firstPage.sourceUpload.url,
      sourceAssetId: firstPage.sourceUpload.asset.id,
      addedImages: processedImages.map(({ addedImage }) => addedImage),
      contentLayer: 'front',
      layoutMode: 'list',
      showImages: false,
      columnCount: 1,
      categoryColumnCount,
      categoryPlacements: importsProducts ? categoryPlacements : currentStyle.categoryPlacements,
      categoryPositions: importsProducts ? categoryPositions : currentStyle.categoryPositions,
      categoryColumnWidths,
      pagePadding: (margins.top + margins.bottom + margins.left + margins.right) / 4,
      margins,
      globalRadius: layout.globalRadius ?? 0,
      itemGap: contentSpacing.betweenProducts,
      contentSpacing,
      fontSizeLimits: fontLimits,
      customCategoryOrder: importsProducts
        ? importedCategoryOrder
        : currentStyle.customCategoryOrder,
      customProductOrder: importsProducts
        ? customProductOrder
        : currentStyle.customProductOrder,
      hiddenProductIds: importsProducts
        ? mergedImport.hiddenProductIds
        : currentStyle.hiddenProductIds,
      pageBreaks: importsProducts ? pageBreaks : currentStyle.pageBreaks,
      elementStyles: {
        menuTitle: {
          ...currentStyle.elementStyles.menuTitle,
          fontFamily: typography.mainTitle?.fontFamily,
          fontSize: importedFontSize('menuTitle', typography.mainTitle?.fontSize, 48, titleFontMeasurement),
          color: typography.mainTitle?.color || primaryColor,
          textAlign: typography.mainTitle?.alignment || 'center',
          textTransform: typography.mainTitle?.textTransform || 'uppercase',
          fontWeight: '700',
          marginBottom: typography.subtitle?.exists
            ? Math.min(200, Math.max(0, measuredTitleToSubtitle ?? importedMetric(spacing.titleToSubtitle, 10)))
            : (currentStyle.elementStyles.menuTitle?.marginBottom ?? 10),
        },
        menuSubtitle: {
          ...currentStyle.elementStyles.menuSubtitle,
          fontFamily: typography.subtitle?.fontFamily,
          fontSize: importedFontSize('menuSubtitle', typography.subtitle?.fontSize, 18, subtitleFontMeasurement),
          color: typography.subtitle?.color || textColor,
          textAlign: typography.mainTitle?.alignment || 'center',
          textTransform: 'none',
          marginBottom: contentSpacing.headerToContent,
        },
        pageNumber: currentStyle.elementStyles.pageNumber,
        category: {
          ...currentStyle.elementStyles.category,
          fontFamily: typography.category?.fontFamily,
          fontSize: importedFontSize('category', typography.category?.fontSize, 24, categoryFontMeasurement),
          fontWeight: '700',
          textAlign: typography.category?.alignment || 'left',
          color: typography.category?.color || primaryColor,
          textTransform: typography.category?.textTransform || 'uppercase',
          marginBottom: contentSpacing.categoryToProduct,
        },
        productName: {
          ...currentStyle.elementStyles.productName,
          fontFamily: typography.productName?.fontFamily,
          fontSize: importedFontSize('productName', typography.productName?.fontSize, 16, productNameFontMeasurement),
          fontWeight: typography.productName?.fontWeight || '600',
          textAlign: 'left',
          color: typography.productName?.color || textColor,
          textTransform: 'none',
        },
        productPrice: {
          ...currentStyle.elementStyles.productPrice,
          fontFamily: typography.productPrice?.fontFamily,
          fontSize: importedFontSize('productPrice', typography.productPrice?.fontSize, 16, productPriceFontMeasurement),
          fontWeight: '700',
          textAlign: 'right',
          color: typography.productPrice?.color || colors.secondary || primaryColor,
        },
        productDescription: {
          ...currentStyle.elementStyles.productDescription,
          fontFamily: typography.productDescription?.fontFamily,
          fontSize: importedFontSize('productDescription', typography.productDescription?.fontSize, 12, productDescriptionFontMeasurement),
          fontWeight: '400',
          textAlign: 'left',
          color: typography.productDescription?.color || textColor,
          italic: typography.productDescription?.fontStyle === 'italic',
        },
      },
    };
  }

  const previewProducts = importsProducts ? finalProducts : currentProducts;
  const previewStyle: MenuStyle = importedStyle || {
    ...currentStyle,
    ...(orderStyle || {}),
    name: orderStyle ? 'Custom' : currentStyle.name,
  };
  const importedProductIdSet = new Set(mergedImport.importedProductIds);
  const importedProducts = finalProducts.filter((product) => (
    !product.isFreeText && importedProductIdSet.has(product.id)
  ));

  return {
    importMode,
    products: importsProducts ? finalProducts : null,
    style: importedStyle,
    orderStyle,
    sourceAssetId: firstPage.sourceUpload.asset.id,
    normalizedResult: {
      importMode,
      pageCount: analyzedPages.length,
      categories: sortedCategories,
      products: extractedProducts,
      extractedImages: processedImages.map(({ extractedImage }) => extractedImage),
      styleSuggestions: analyzedPages.map((page) => page.result.styleSuggestion),
      pendingTemplateId: importedStyle?.id || null,
    },
    productCount: extractedProducts.length,
    imageCount: processedImages.length,
    pageCount: analyzedPages.length,
    previewProducts,
    previewStyle,
    importedProducts,
    importedProductIds: mergedImport.importedProductIds,
  };
};

const unique = <T,>(values: T[]) => Array.from(new Set(values));

const getOrderedCategories = (products: Product[], style: MenuStyle) => {
  const presentCategories = unique(products.map((product) => product.category));
  return [
    ...(style.customCategoryOrder || []).filter((category) => presentCategories.includes(category)),
    ...presentCategories.filter((category) => !(style.customCategoryOrder || []).includes(category)),
  ];
};

const getOrderedProductIds = (products: Product[], style: MenuStyle, category: string) => {
  const categoryProducts = products.filter((product) => product.category === category);
  const presentIds = categoryProducts.map((product) => product.id);
  return [
    ...(style.customProductOrder?.[category] || []).filter((id) => presentIds.includes(id)),
    ...presentIds.filter((id) => !(style.customProductOrder?.[category] || []).includes(id)),
  ];
};

export const createMenuImportEditorStyle = (processed: ProcessedMenuImport): MenuStyle => {
  const importedIdSet = new Set(processed.importedProductIds);
  const categories = getOrderedCategories(processed.importedProducts, processed.previewStyle);
  return {
    ...processed.previewStyle,
    customCategoryOrder: categories,
    customProductOrder: Object.fromEntries(categories.map((category) => [
      category,
      getOrderedProductIds(processed.importedProducts, processed.previewStyle, category),
    ])),
    hiddenProductIds: (processed.previewStyle.hiddenProductIds || [])
      .filter((productId) => importedIdSet.has(productId)),
  };
};

export const finalizeMenuImport = (
  processed: ProcessedMenuImport,
  editedImportedProducts: Product[],
  editedImportStyle: MenuStyle,
): FinalizedMenuImport => {
  if (processed.importMode === 'visual') {
    return {
      products: processed.previewProducts,
      style: processed.previewStyle,
    };
  }

  const originalImportedIdSet = new Set(processed.importedProductIds);
  const retainedProducts = processed.previewProducts.filter((product) => (
    !originalImportedIdSet.has(product.id)
  ));
  const products = [...editedImportedProducts, ...retainedProducts];
  const editedCategories = getOrderedCategories(editedImportedProducts, editedImportStyle);
  const retainedCategories = getOrderedCategories(retainedProducts, processed.previewStyle)
    .filter((category) => !editedCategories.includes(category));
  const customCategoryOrder = [...editedCategories, ...retainedCategories];
  const customProductOrder = Object.fromEntries(customCategoryOrder.map((category) => {
    const editedIds = getOrderedProductIds(editedImportedProducts, editedImportStyle, category);
    const retainedIds = getOrderedProductIds(retainedProducts, processed.previewStyle, category)
      .filter((id) => !editedIds.includes(id));
    return [category, [...editedIds, ...retainedIds]];
  }));
  const editedProductIdSet = new Set(editedImportedProducts.map((product) => product.id));
  const hiddenProductIds = unique([
    ...(processed.previewStyle.hiddenProductIds || [])
      .filter((productId) => !originalImportedIdSet.has(productId)),
    ...(editedImportStyle.hiddenProductIds || [])
      .filter((productId) => editedProductIdSet.has(productId)),
  ]);

  return {
    products,
    style: {
      ...processed.previewStyle,
      customCategoryOrder,
      customProductOrder,
      hiddenProductIds,
    },
  };
};
