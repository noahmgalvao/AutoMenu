import type { MenuImportMode, BoundingBox } from '../../domain/imports/model';
import type { Product, MenuStyle, CategoryImage } from '../../domain/menu/model';
import type { MenuImportDependencies } from './menuImportGateway';
import type { ProcessedMenuImport } from './importReview';
import {
  getImportPageDimensions,
  type AnalyzedPage,
  isBoundingBox,
  type ProcessedImage,
  getDecorationExclusions,
  getCategoryImageTarget,
  getCategoryImageSize,
  getAnalyzedPageColumnGeometry,
  getLargeGapCategoryPositions,
  getCategoryHeaderBox,
  getScaledVerticalGap,
  getMedian,
  estimateFontSizeFromBoundingBox,
  estimateProductPriceFontSize,
} from './importGeometry';
import { sortMenuElements, sortSpatialElements } from '../../domain/imports/spatialOrder';
import { roundPrice } from '../../domain/menu/price';
import { buildFreeTextProduct, mergeImportedProducts, getImportedFreeTextPageIndex } from './importedProducts';
import { normalizeEntityName } from '../../domain/imports/entityNames';
import { normalizeColumnWidths } from '../../domain/menu/categoryColumns';
import { resolveFontSizeLimits, clampFontSize } from '../../domain/menu/styleRules';

export interface ProcessMenuImportOptions {
  files: File[];
  importMode: MenuImportMode;
  currentProducts: Product[];
  currentStyle: MenuStyle;
  workspaceId: string;
  userId: string;
  menuId: string;
}

export const processMenuImport = async ({
  files,
  importMode,
  currentProducts,
  currentStyle,
  workspaceId,
  userId,
  menuId,
}: ProcessMenuImportOptions, {
  analyzeMenuImage, fileToGenerativePart, uploadDataUrlAsset, uploadFileAsset,
  createCleanBackground, getImageDimensions, processDecoration,
}: Omit<MenuImportDependencies, 'createAiImportJob'>): Promise<ProcessedMenuImport> => {
  if (files.length === 0) throw new Error('Nenhuma página foi selecionada.');

  const importsProducts = importMode !== 'visual';
  const importsVisual = importMode !== 'products';
  const pageDimensions = getImportPageDimensions(currentStyle);
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
        ...category.products.flatMap((product) => {
          const hasCompleteTextBoxes = Boolean(
            product.nameBoundingBox
            && product.priceBoundingBox
            && (!product.description || product.descriptionBoundingBox),
          );
          const textBoxes = [
            product.nameBoundingBox,
            product.descriptionBoundingBox,
            product.priceBoundingBox,
          ].filter(isBoundingBox);
          return hasCompleteTextBoxes ? textBoxes : [product.boundingBox];
        }),
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
              x: (boundingBox.x / imageDimensions.width) * pageDimensions.widthPx,
              y: (boundingBox.y / imageDimensions.height) * pageDimensions.heightPx,
              width: (boundingBox.width / imageDimensions.width) * pageDimensions.widthPx,
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
      page.freeTextElements.map((freeText) => buildFreeTextProduct(
        freeText,
        page.pageIndex,
        pageDimensions,
      ))
    ))
    : [];
  const mergedImport = mergeImportedProducts(
    currentProducts,
    extractedProducts,
    currentStyle,
  );
  const finalProducts = [...mergedImport.products, ...freeTextProducts];
  const availableCategoryByKey = new Map<string, string>();
  (importsProducts ? finalProducts : currentProducts).forEach((product) => {
    if (!product.isFreeText) availableCategoryByKey.set(normalizeEntityName(product.category), product.category);
  });
  const categoryImages: Record<string, CategoryImage> = {};
  Object.entries(currentStyle.categoryImages || {}).forEach(([category, image]) => {
    const resolvedCategory = availableCategoryByKey.get(normalizeEntityName(category));
    if (resolvedCategory) categoryImages[resolvedCategory] = image;
  });
  const categoryLinkedImageIds = new Set<string>();
  const importedCategoryImageNames = new Set<string>();
  analyzedPages.forEach((page) => {
    page.processedImages.forEach((processedImage) => {
      const categoryName = getCategoryImageTarget(page, processedImage, availableCategoryByKey);
      if (!categoryName || importedCategoryImageNames.has(categoryName)) return;
      categoryImages[categoryName] = {
        url: processedImage.addedImage.url,
        assetId: processedImage.addedImage.assetId,
        ...getCategoryImageSize(page, processedImage, pageDimensions),
      };
      importedCategoryImageNames.add(categoryName);
      categoryLinkedImageIds.add(processedImage.addedImage.id);
    });
  });
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
  const pageColumnGeometry = analyzedPages.map((page) => (
    getAnalyzedPageColumnGeometry(page, pageDimensions)
  ));
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
        getLargeGapCategoryPositions(
          page,
          geometry,
          mergedImport.categoryNameByKey,
          pageDimensions,
        ),
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
    const scaledVerticalMetric = (value: unknown, fallback: number) => (
      importedMetric(value, fallback) * pageDimensions.verticalScale
    );
    const scaledHorizontalMetric = (value: unknown, fallback: number) => (
      importedMetric(value, fallback) * pageDimensions.horizontalScale
    );
    const fallbackPadding = importedMetric(layout.contentPadding, 48);
    const margins = {
      top: Math.min(
        300 * pageDimensions.verticalScale,
        Math.max(0, scaledVerticalMetric(layout.marginTop, fallbackPadding)),
      ),
      bottom: Math.min(
        300 * pageDimensions.verticalScale,
        Math.max(0, scaledVerticalMetric(layout.marginBottom, fallbackPadding)),
      ),
      left: Math.min(
        300 * pageDimensions.horizontalScale,
        Math.max(0, scaledHorizontalMetric(layout.marginLeft, fallbackPadding)),
      ),
      right: Math.min(
        300 * pageDimensions.horizontalScale,
        Math.max(0, scaledHorizontalMetric(layout.marginRight, fallbackPadding)),
      ),
      columnGap: Math.min(
        300 * pageDimensions.horizontalScale,
        Math.max(0, scaledHorizontalMetric(layout.columnGap, 32)),
      ),
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
    const measuredTitleToSubtitle = getScaledVerticalGap(
      firstPage,
      titleBox,
      subtitleBox,
      pageDimensions,
    );
    const measuredHeaderToContent = getScaledVerticalGap(
      firstPage,
      subtitleBox || titleBox,
      firstCategoryBox,
      pageDimensions,
    );
    const contentSpacing = {
      headerToContent: Math.min(
        200 * pageDimensions.verticalScale,
        Math.max(0, measuredHeaderToContent ?? scaledVerticalMetric(spacing.headerToContent, 20)),
      ),
      categoryToProduct: Math.min(
        200 * pageDimensions.verticalScale,
        Math.max(0, scaledVerticalMetric(spacing.categoryToFirstProduct, 16)),
      ),
      productNameToDescription: Math.min(
        200 * pageDimensions.verticalScale,
        Math.max(0, scaledVerticalMetric(spacing.productNameToDescription, 4)),
      ),
      betweenProducts: Math.min(
        200 * pageDimensions.verticalScale,
        Math.max(0, scaledVerticalMetric(spacing.betweenProducts, 16)),
      ),
      productNameToPrice: Math.min(
        200 * pageDimensions.horizontalScale,
        Math.max(0, scaledHorizontalMetric(spacing.productNameToPrice, 4)),
      ),
    };
    const fontLimits = resolveFontSizeLimits(currentStyle);
    const categoryFontMeasurement = getMedian(analyzedPages.flatMap((page) => (
      page.categories.map((category) => estimateFontSizeFromBoundingBox(
        page,
        category.boundingBox,
        category.name,
        pageDimensions,
        1.16,
      ))
    )));
    const productNameFontMeasurement = getMedian(analyzedPages.flatMap((page) => (
      page.categories.flatMap((category) => category.products.map((product) => (
        estimateFontSizeFromBoundingBox(
          page,
          product.nameBoundingBox,
          product.name,
          pageDimensions,
          1.18,
        )
      )))
    )));
    const productDescriptionFontMeasurement = getMedian(analyzedPages.flatMap((page) => (
      page.categories.flatMap((category) => category.products.map((product) => (
        estimateFontSizeFromBoundingBox(
          page,
          product.descriptionBoundingBox,
          product.description,
          pageDimensions,
          1.32,
        )
      )))
    )));
    const productPriceFontMeasurement = getMedian(analyzedPages.flatMap((page) => (
      page.categories.flatMap((category) => category.products.map((product) => (
        estimateProductPriceFontSize(page, product, pageDimensions)
      )))
    )));
    const titleFontMeasurement = estimateFontSizeFromBoundingBox(
      firstPage,
      typography.mainTitle?.boundingBox,
      typography.mainTitle?.text || '',
      pageDimensions,
      1.14,
    );
    const subtitleFontMeasurement = typography.subtitle?.exists
      ? estimateFontSizeFromBoundingBox(
        firstPage,
        typography.subtitle?.boundingBox,
        typography.subtitle?.text || '',
        pageDimensions,
        1.2,
      )
      : null;
    const importedFontSize = (
      key: Parameters<typeof clampFontSize>[1],
      value: unknown,
      fallback: number,
      measuredValue?: number | null,
    ) => {
      const modelValue = Number(value) * pageDimensions.uniformScale;
      const scaledFallback = fallback * pageDimensions.uniformScale;
      const hasModelValue = Number.isFinite(modelValue) && modelValue > 0;
      const hasMeasuredValue = Number.isFinite(measuredValue) && Number(measuredValue) > 0;
      const preciseValue = hasMeasuredValue
        ? hasModelValue
          ? (Number(measuredValue) * 0.78) + (modelValue * 0.22)
          : Number(measuredValue)
        : hasModelValue
          ? modelValue
          : scaledFallback;
      return clampFontSize(currentStyle, key, preciseValue, scaledFallback);
    };

    importedStyle = {
      ...currentStyle,
      id: crypto.randomUUID(),
      name: `Design IA (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
      scope: 'workspace',
      sourceType: 'ai_import',
      templateVersionId: null,
      appliedTemplateId: undefined,
      appliedTemplateVersionId: null,
      templateBackgroundFit: undefined,
      catalogMetadata: undefined,
      design: undefined,
      isLocked: false,
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
      categoryImages,
      addedImages: processedImages
        .filter(({ addedImage }) => !categoryLinkedImageIds.has(addedImage.id))
        .map(({ addedImage }) => addedImage),
      layoutMode: 'list',
      showImages: false,
      columnCount: 1,
      categoryColumnCount,
      categoryPlacements: importsProducts ? categoryPlacements : currentStyle.categoryPlacements,
      categoryPositions: importsProducts ? categoryPositions : currentStyle.categoryPositions,
      categoryColumnWidths,
      pagePadding: (margins.top + margins.bottom + margins.left + margins.right) / 4,
      margins,
      globalRadius: importedMetric(layout.globalRadius, 0) * pageDimensions.uniformScale,
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
            ? Math.min(
              200 * pageDimensions.verticalScale,
              Math.max(0, measuredTitleToSubtitle ?? scaledVerticalMetric(spacing.titleToSubtitle, 10)),
            )
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

export async function prepareMenuImport(options: ProcessMenuImportOptions, dependencies: MenuImportDependencies) {
  const imported = await processMenuImport(options, dependencies);
  await dependencies.createAiImportJob({
    workspaceId: options.workspaceId,
    sourceAssetId: imported.sourceAssetId,
    createdMenuId: options.menuId,
    normalizedResult: imported.normalizedResult,
  });
  return imported;
}
