import type { AddedImage, MenuStyle } from '../../domain/menu/model';
import type { ExtractedImage, BoundingBox } from '../../domain/imports/model';
import type { UploadedAsset } from '../assets/assetUploads';
import type { AnalysisResult } from './menuImportGateway';
import { resolveMenuPageDimensions } from '../../domain/menu/pageSetup';
import { normalizeColumnWidths } from '../../domain/menu/categoryColumns';
import { normalizeEntityName } from '../../domain/imports/entityNames';

export interface ProcessedImage {
  addedImage: AddedImage;
  extractedImage: ExtractedImage;
}

export interface AnalyzedPage {
  pageIndex: number;
  sourceUpload: UploadedAsset;
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

export interface ImportPageDimensions {
  widthPx: number;
  heightPx: number;
  horizontalScale: number;
  verticalScale: number;
  uniformScale: number;
}

const ANALYSIS_REFERENCE_PAGE_DIMENSIONS = resolveMenuPageDimensions();

export const getImportPageDimensions = (style: MenuStyle): ImportPageDimensions => {
  const { widthPx, heightPx } = resolveMenuPageDimensions(style);
  return {
    widthPx,
    heightPx,
    horizontalScale: widthPx / ANALYSIS_REFERENCE_PAGE_DIMENSIONS.widthPx,
    verticalScale: heightPx / ANALYSIS_REFERENCE_PAGE_DIMENSIONS.heightPx,
    uniformScale: Math.min(widthPx, heightPx)
      / Math.min(
        ANALYSIS_REFERENCE_PAGE_DIMENSIONS.widthPx,
        ANALYSIS_REFERENCE_PAGE_DIMENSIONS.heightPx,
      ),
  };
};

export const isBoundingBox = (value: any): value is BoundingBox => (
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

export const getDecorationExclusions = (
  target: BoundingBox,
  candidates: BoundingBox[],
) => candidates.filter((candidate) => (
  candidate !== target
  && getBoundingBoxIntersectionRatio(target, candidate) > 0
  && getBoundingBoxIntersectionRatio(target, candidate) < 0.72
));

export const getAnalyzedPageColumnGeometry = (
  page: AnalyzedPage,
  pageDimensions: ImportPageDimensions,
) => {
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
      ((Number(layout.marginLeft) || 0) * pageDimensions.horizontalScale)
        / pageDimensions.widthPx * page.imageDimensions.width,
    );
    const right = Math.min(
      page.imageDimensions.width,
      page.imageDimensions.width - (
        ((Number(layout.marginRight) || 0) * pageDimensions.horizontalScale)
          / pageDimensions.widthPx * page.imageDimensions.width
      ),
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

export const estimateFontSizeFromBoundingBox = (
  page: AnalyzedPage,
  box: BoundingBox | undefined,
  text: string,
  pageDimensions: ImportPageDimensions,
  lineHeight = 1.2,
) => {
  if (!box) return null;
  const height = (box.height / page.imageDimensions.height) * pageDimensions.heightPx;
  const width = (box.width / page.imageDimensions.width) * pageDimensions.widthPx;
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

export const getMedian = (values: Array<number | null | undefined>) => {
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
  pageDimensions: ImportPageDimensions,
  lineHeight = 1.18,
) => {
  if (!box) return null;
  const height = (box.height / page.imageDimensions.height) * pageDimensions.heightPx;
  const lines = Math.max(1, Math.round(Number(lineCount) || 1));
  const size = height / (0.82 + ((lines - 1) * lineHeight));
  return Number.isFinite(size) && size > 0 ? size : null;
};

export const estimateProductPriceFontSize = (
  page: AnalyzedPage,
  product: AnalysisResult['categories'][number]['products'][number],
  pageDimensions: ImportPageDimensions,
) => {
  const directEstimate = estimateFontSizeFromKnownLines(
    page,
    product.priceBoundingBox,
    product.priceLineCount || 1,
    pageDimensions,
    1.18,
  );
  if (!directEstimate || !product.priceBoundingBox) return directEstimate;

  const nameEstimate = estimateFontSizeFromBoundingBox(
    page,
    product.nameBoundingBox,
    product.name,
    pageDimensions,
    1.18,
  );
  if (!nameEstimate) return directEstimate;

  const typography = page.result.styleSuggestion?.typography || {};
  const modelPriceSize = Number(typography.productPrice?.fontSize);
  const modelNameSize = Number(typography.productName?.fontSize);
  const modelRatio = Number.isFinite(modelPriceSize) && modelPriceSize > 0
    && Number.isFinite(modelNameSize) && modelNameSize > 0
    ? Math.max(0.6, Math.min(1.6, modelPriceSize / modelNameSize))
    : 1;
  const expectedSize = nameEstimate * modelRatio;
  if (directEstimate >= expectedSize * 0.72 && directEstimate <= expectedSize * 1.35) {
    return directEstimate;
  }

  const scaledHeight = (product.priceBoundingBox.height / page.imageDimensions.height)
    * pageDimensions.heightPx;
  const reportedLines = Math.max(1, Math.min(6, Math.round(Number(product.priceLineCount) || 1)));
  let bestSize = directEstimate;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let lines = 1; lines <= 6; lines += 1) {
    const candidateSize = scaledHeight / (0.82 + ((lines - 1) * 1.18));
    if (!Number.isFinite(candidateSize) || candidateSize <= 0) continue;
    const ratioScore = Math.abs(Math.log(candidateSize / Math.max(1, expectedSize)));
    const linePenalty = Math.abs(lines - reportedLines) * 0.08;
    const score = ratioScore + linePenalty;
    if (score < bestScore) {
      bestScore = score;
      bestSize = candidateSize;
    }
  }

  return Math.max(expectedSize * 0.65, Math.min(expectedSize * 1.5, bestSize));
};

export const getScaledVerticalGap = (
  page: AnalyzedPage,
  upperBox: BoundingBox | undefined,
  lowerBox: BoundingBox | undefined,
  pageDimensions: ImportPageDimensions,
) => {
  if (!upperBox || !lowerBox) return null;
  const sourceGap = lowerBox.y - (upperBox.y + upperBox.height);
  if (!Number.isFinite(sourceGap) || sourceGap < 0) return null;
  return (sourceGap / page.imageDimensions.height) * pageDimensions.heightPx;
};

export const getCategoryHeaderBox = (category: AnalysisResult['categories'][number]) => (
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

export const getLargeGapCategoryPositions = (
  page: AnalyzedPage,
  geometry: ReturnType<typeof getAnalyzedPageColumnGeometry>,
  categoryNameByKey: Map<string, string>,
  pageDimensions: ImportPageDimensions,
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
      const gap = ((box.y - previousBottom) / page.imageDimensions.height)
        * pageDimensions.heightPx;
      return Number.isFinite(gap) && gap >= 0 ? gap : null;
    });

    ordered.slice(1).forEach((category, index) => {
      const box = getCategoryHeaderBox(category);
      if (!box) return;
      const previousBottom = getCategoryBlockBottom(ordered[index]);
      const gap = ((box.y - previousBottom) / page.imageDimensions.height)
        * pageDimensions.heightPx;
      const peerGaps = gaps
        .filter((peerGap, gapIndex): peerGap is number => gapIndex !== index && peerGap !== null)
        .sort((left, right) => left - right);
      const baselineSample = peerGaps.slice(0, Math.max(1, Math.ceil(peerGaps.length / 2)));
      const defaultGap = 16 * pageDimensions.verticalScale;
      const typicalGap = baselineSample.length > 0 ? (getMedian(baselineSample) || defaultGap) : defaultGap;
      const largeGapThreshold = Math.max(
        72 * pageDimensions.verticalScale,
        typicalGap + (48 * pageDimensions.verticalScale),
        typicalGap * 1.8,
      );
      if (!Number.isFinite(gap) || gap < largeGapThreshold) return;
      const categoryName = categoryNameByKey.get(normalizeEntityName(category.name)) || category.name;
      positions[categoryName] = {
        pageIndex: page.pageIndex,
        columnIndex,
        y: Math.max(0, Math.round(
          (box.y / page.imageDimensions.height) * pageDimensions.heightPx,
        )),
      };
    });
  });

  return positions;
};

export const getCategoryImageTarget = (
  page: AnalyzedPage,
  processedImage: ProcessedImage,
  availableCategoryByKey: Map<string, string>,
) => {
  const image = processedImage.extractedImage;
  if (image.relatedProductName || !['icon', 'logo', 'illustration'].includes(image.type)) {
    return null;
  }

  const explicitCategory = availableCategoryByKey.get(normalizeEntityName(image.relatedCategoryName || ''));
  if (explicitCategory) return explicitCategory;
  if (!image.boundingBox) return null;

  const imageBox = image.boundingBox;
  const imageCenterX = imageBox.x + (imageBox.width / 2);
  const imageCenterY = imageBox.y + (imageBox.height / 2);
  let nearest: { name: string; score: number } | null = null;

  for (const category of page.categories) {
    const categoryName = availableCategoryByKey.get(normalizeEntityName(category.name));
    const categoryBox = category.nameBoundingBox || category.boundingBox;
    if (!categoryName || !categoryBox) continue;

    const categoryCenterX = categoryBox.x + (categoryBox.width / 2);
    const categoryCenterY = categoryBox.y + (categoryBox.height / 2);
    const verticalDistance = Math.abs(imageCenterY - categoryCenterY);
    const horizontalGap = imageBox.x + imageBox.width < categoryBox.x
      ? categoryBox.x - (imageBox.x + imageBox.width)
      : categoryBox.x + categoryBox.width < imageBox.x
        ? imageBox.x - (categoryBox.x + categoryBox.width)
        : 0;
    const maximumVerticalDistance = Math.max(28, categoryBox.height * 1.25, imageBox.height * 1.25);
    const maximumHorizontalGap = Math.max(72, categoryBox.height * 4, imageBox.width * 3);
    if (verticalDistance > maximumVerticalDistance || horizontalGap > maximumHorizontalGap) continue;

    const score = verticalDistance + (horizontalGap * 0.75) + (Math.abs(imageCenterX - categoryCenterX) * 0.05);
    if (!nearest || score < nearest.score) nearest = { name: categoryName, score };
  }

  return nearest?.name || null;
};

export const getCategoryImageSize = (
  page: AnalyzedPage,
  image: ProcessedImage,
  pageDimensions: ImportPageDimensions,
) => {
  const box = image.extractedImage.boundingBox;
  if (!box) {
    const fallbackSize = Math.round(36 * pageDimensions.uniformScale);
    return { width: fallbackSize, height: fallbackSize };
  }
  const rawWidth = (box.width / page.imageDimensions.width) * pageDimensions.widthPx;
  const rawHeight = (box.height / page.imageDimensions.height) * pageDimensions.heightPx;
  const largestEdge = Math.max(1, rawWidth, rawHeight);
  const maximumEdge = 72 * pageDimensions.uniformScale;
  const minimumEdge = 18 * pageDimensions.uniformScale;
  const minimumRenderedEdge = 12 * pageDimensions.uniformScale;
  const scale = Math.min(
    maximumEdge / largestEdge,
    Math.max(1, minimumEdge / largestEdge),
  );
  return {
    width: Math.max(minimumRenderedEdge, Math.round(rawWidth * scale)),
    height: Math.max(minimumRenderedEdge, Math.round(rawHeight * scale)),
  };
};
