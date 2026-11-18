import type { MenuStyle, Product, AddedImage, CategoryImage } from '../../../domain/menu/model';
import type { MenuEditorState, TemplateVersion, Asset, Category } from '../../../domain/workspace/model';
import { isRecord, withStyleDefaults, normalizePersistedProducts, cloneJson, DEFAULT_SORT_OPTION } from '../../../application/workspace/state';
import { resolveAssetMapForIds, uploadDataUrlAsset, registerExternalAsset } from '../assets';
import { isMiniFoodTexture, normalizeTextureUrl, INITIAL_STYLE } from '../../../domain/menu/defaults';
import { roundPrice } from '../../../domain/menu/price';

const isDataUrl = (value?: string) => Boolean(value?.startsWith('data:'));

const isRemoteUrl = (value?: string) => Boolean(value && /^https?:\/\//i.test(value));

export const addAssetId = (assetIds: Set<string>, assetId?: string | null) => {
  if (assetId) assetIds.add(assetId);
};

export const collectStyleAssetIds = (style?: Partial<MenuStyle> | null) => {
  const assetIds = new Set<string>();
  if (!isRecord(style)) return assetIds;

  addAssetId(assetIds, style.backgroundAssetId);
  addAssetId(assetIds, style.sourceAssetId);
  (Array.isArray(style.pageBackgrounds) ? style.pageBackgrounds : []).forEach((background) => {
    if (isRecord(background)) addAssetId(assetIds, background.assetId);
  });
  (Array.isArray(style.addedImages) ? style.addedImages : []).forEach((image) => {
    if (isRecord(image)) addAssetId(assetIds, image.assetId);
  });
  Object.values(isRecord(style.categoryImages) ? style.categoryImages : {}).forEach((image) => {
    if (isRecord(image)) addAssetId(assetIds, image.assetId as string | null | undefined);
  });

  return assetIds;
};

export const collectProductAssetIds = (products?: Product[] | null) => {
  const assetIds = new Set<string>();
  (Array.isArray(products) ? products : []).forEach((product) => addAssetId(assetIds, product.imageAssetId));
  return assetIds;
};

export const collectEditorStateAssetIds = (editorState?: Partial<MenuEditorState> | null) => {
  const assetIds = collectStyleAssetIds(editorState?.style);
  collectProductAssetIds(editorState?.freeTextProducts as Product[] | undefined).forEach((assetId) => assetIds.add(assetId));
  return assetIds;
};

export const collectTemplateAssetIds = (versions: TemplateVersion[]) => {
  const assetIds = new Set<string>();
  versions.forEach((version) => {
    collectStyleAssetIds(version.styleState).forEach((assetId) => assetIds.add(assetId));
    addAssetId(assetIds, version.previewAssetId);
  });
  return assetIds;
};

export const resolveWorkspaceAssetMap = (workspaceId: string, assetIds: Iterable<string>) =>
  resolveAssetMapForIds(workspaceId, Array.from(assetIds));

const ensureAssetReference = async ({
  url,
  existingAssetId,
  workspaceId,
  userId,
  assetType,
  bucket,
  metadata,
}: {
  url?: string;
  existingAssetId?: string | null;
  workspaceId: string;
  userId: string;
  assetType: Asset['assetType'];
  bucket: 'product-images' | 'menu-assets' | 'ai-imports';
  metadata?: Record<string, unknown>;
}) => {
  if (!url) {
    return { assetId: null, url: '' };
  }

  if (isDataUrl(url)) {
    const { asset, url: signedUrl } = await uploadDataUrlAsset({
      assetId: existingAssetId || crypto.randomUUID(),
      workspaceId,
      userId,
      bucket,
      assetType,
      dataUrl: url,
      fileName: `${assetType}.png`,
      metadata,
    });

    return { assetId: asset.id, url: signedUrl };
  }

  if (existingAssetId) {
    return { assetId: existingAssetId, url };
  }

  if (isRemoteUrl(url)) {
    const { asset } = await registerExternalAsset({
      assetId: existingAssetId || crypto.randomUUID(),
      workspaceId,
      userId,
      assetType,
      url,
      metadata,
    });

    return { assetId: asset.id, url };
  }

  return { assetId: existingAssetId || null, url };
};

export const normalizeProductAssets = async (workspaceId: string, userId: string, products: Product[]) => {
  return Promise.all(
    products.map(async (product) => {
      if (product.isFreeText) {
        return { ...product, categoryId: null };
      }

      const assetRef = await ensureAssetReference({
        url: product.image,
        existingAssetId: product.imageAssetId,
        workspaceId,
        userId,
        assetType: 'product_image',
        bucket: 'product-images',
        metadata: { product_id: product.id },
      });

      return {
        ...product,
        image: assetRef.url || product.image || '',
        imageAssetId: assetRef.assetId,
      };
    }),
  );
};

export const normalizeStyleAssets = async (workspaceId: string, userId: string, style: MenuStyle) => {
  const backgroundRef = isMiniFoodTexture(style.backgroundImage)
    ? { assetId: null, url: normalizeTextureUrl(style.backgroundImage) }
    : await ensureAssetReference({
        url: style.backgroundImage,
        existingAssetId: style.backgroundAssetId,
        workspaceId,
        userId,
        assetType: 'menu_background',
        bucket: 'menu-assets',
        metadata: { style_id: style.id },
      });

  const sourceRef = await ensureAssetReference({
    url: style.sourceImage,
    existingAssetId: style.sourceAssetId,
    workspaceId,
    userId,
    assetType: 'ai_source_image',
    bucket: 'ai-imports',
    metadata: { style_id: style.id },
  });

  const pageBackgrounds = await Promise.all(
    (style.pageBackgrounds || []).map(async (background) => {
      const assetRef = await ensureAssetReference({
        url: background.url,
        existingAssetId: background.assetId,
        workspaceId,
        userId,
        assetType: 'menu_background',
        bucket: 'menu-assets',
        metadata: { style_id: style.id, page_index: background.pageIndex },
      });

      return {
        ...background,
        assetId: assetRef.assetId,
        url: assetRef.url || background.url,
      };
    }),
  );

  const addedImages: AddedImage[] = await Promise.all(
    (style.addedImages || []).map(async (image) => {
      if (image.shape) return image;
      const assetRef = await ensureAssetReference({
        url: image.url,
        existingAssetId: image.assetId,
        workspaceId,
        userId,
        assetType: 'added_image',
        bucket: 'menu-assets',
        metadata: { page_index: image.pageIndex },
      });

      return {
        ...image,
        assetId: assetRef.assetId,
        url: assetRef.url || image.url,
      };
    }),
  );

  const categoryImages: Record<string, CategoryImage> = Object.fromEntries(await Promise.all(
    Object.entries(style.categoryImages || {}).map(async ([category, image]) => {
      const assetRef = await ensureAssetReference({
        url: image.url,
        existingAssetId: image.assetId,
        workspaceId,
        userId,
        assetType: 'added_image',
        bucket: 'menu-assets',
        metadata: { style_id: style.id, category_name: category, role: 'category_image' },
      });
      return [category, {
        ...image,
        assetId: assetRef.assetId,
        url: assetRef.url || image.url,
      } satisfies CategoryImage] as const;
    }),
  ));

  return withStyleDefaults({
    ...style,
    backgroundAssetId: backgroundRef.assetId,
    backgroundImage: backgroundRef.url || style.backgroundImage,
    sourceAssetId: sourceRef.assetId,
    sourceImage: sourceRef.url || style.sourceImage,
    pageBackgrounds,
    addedImages,
    categoryImages,
  });
};

export const hydrateStyleAssets = (style: MenuStyle, assetUrlMap: Map<string, string>) => {
  const nextStyle = withStyleDefaults(style);

  return {
    ...nextStyle,
    backgroundImage: nextStyle.backgroundAssetId ? assetUrlMap.get(nextStyle.backgroundAssetId) || nextStyle.backgroundImage || '' : nextStyle.backgroundImage || '',
    sourceImage: nextStyle.sourceAssetId ? assetUrlMap.get(nextStyle.sourceAssetId) || nextStyle.sourceImage || '' : nextStyle.sourceImage || '',
    pageBackgrounds: (nextStyle.pageBackgrounds || []).map((background) => ({
      ...background,
      url: background.assetId ? assetUrlMap.get(background.assetId) || background.url : background.url,
    })),
    addedImages: (nextStyle.addedImages || []).map((image) => ({
      ...image,
      url: image.assetId ? assetUrlMap.get(image.assetId) || image.url : image.url,
    })),
    categoryImages: Object.fromEntries(Object.entries(nextStyle.categoryImages || {}).map(([category, image]) => [
      category,
      {
        ...image,
        url: image.assetId ? assetUrlMap.get(image.assetId) || image.url : image.url,
      },
    ])),
  };
};

export const hydrateProductAssets = (products: Product[], assetUrlMap: Map<string, string>) =>
  normalizePersistedProducts(products).map((product) => ({
    ...product,
    image: product.imageAssetId ? assetUrlMap.get(product.imageAssetId) || product.image || '' : product.image || '',
  }));

export const resolveProductRowsForApp = (
  categoryRows: Category[],
  productRows: any[],
  assetUrlMap: Map<string, string>,
) => {
  const categoriesById = new Map(categoryRows.map((category) => [category.id, category]));

  return productRows.map((row) => {
    const category = categoriesById.get(row.category_id);
    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      price: roundPrice(row.base_price),
      category: category?.name || 'Uncategorized',
      categoryId: row.category_id,
      imageAssetId: row.primary_asset_id,
      image: row.primary_asset_id ? assetUrlMap.get(row.primary_asset_id) || '' : '',
    } satisfies Product;
  });
};

export const resolveEditorStateForApp = (editorState: Partial<MenuEditorState> | null | undefined, assetUrlMap: Map<string, string>) => {
  const normalizedStyle = hydrateStyleAssets(withStyleDefaults(editorState?.style || cloneJson(INITIAL_STYLE)), assetUrlMap);
  const rawFreeTextProducts = Array.isArray(editorState?.freeTextProducts)
    ? editorState.freeTextProducts.map((product) => isRecord(product) ? { ...product, isFreeText: true } : product)
    : [];
  const freeTextProducts = normalizePersistedProducts(rawFreeTextProducts).map((product) => ({
    ...product,
    categoryId: null,
    image: product.imageAssetId ? assetUrlMap.get(product.imageAssetId) || product.image || '' : product.image || '',
  }));

  return {
    style: normalizedStyle,
    freeTextProducts,
    sortOption: editorState?.sortOption || DEFAULT_SORT_OPTION,
  };
};
