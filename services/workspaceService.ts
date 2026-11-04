import {
  AddedImage,
  Asset,
  Category,
  CategoryImage,
  LoadedWorkspaceData,
  Menu,
  MenuEditorState,
  MenuProductSource,
  MenuProductSync,
  MenuPublication,
  MenuStyle,
  MenuVersion,
  Product,
  Profile,
  SaveWorkspaceResult,
  SortOption,
  Template,
  TemplateVersion,
  Workspace,
  WorkspaceBootstrapData,
} from '../types';
import { INITIAL_PRODUCTS, INITIAL_STYLE, isMiniFoodTexture, normalizeTextureUrl, PRESET_TEMPLATES } from '../constants';
import { getSupabaseClient } from './supabaseClient';
import { FREE_TEXT_PREFIX } from '../utils/menuPagination';
import {
  registerExternalAsset,
  resolveAssetMapForIds,
  resolveStorageFileUrl,
  uploadDataUrlAsset,
  uploadPortablePublication,
  uploadPublicationPdf,
} from './storageService';
import {
  resolvePriceDecimalPlaces,
  resolvePriceDecimalSeparator,
  roundPrice,
} from '../utils/price';
import { resolveFontSizeLimits, resolveMinimumFontSize, roundFontSize } from '../utils/styleRules';
import { normalizeMenuPageSetup } from '../utils/pageSetup';
import { getErrorMessage } from '../utils/errors';

const LOCAL_STORAGE_KEYS = {
  products: 'automenu_products',
  style: 'automenu_style',
  templates: 'automenu_templates',
  migrated: 'automenu_supabase_migrated',
} as const;

const DEFAULT_SORT_OPTION: SortOption = { field: 'name', direction: 'asc' };
const PRESET_TEMPLATE_IDS = new Set(PRESET_TEMPLATES.map((template) => template.id));

const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const isRecord = (value: unknown): value is Record<string, any> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const normalizePersistedProducts = (value: unknown): Product[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter((product): product is Record<string, any> => (
      isRecord(product) && typeof product.id === 'string' && product.id.length > 0
    ))
    .map((product) => {
      const isFreeText = Boolean(product.isFreeText);
      const category = typeof product.category === 'string' && product.category.length > 0
        ? product.category
        : isFreeText
          ? `${FREE_TEXT_PREFIX}${product.id}`
          : 'Sem categoria';
      const numericPrice = Number(product.price);

      return {
        ...product,
        id: product.id,
        name: typeof product.name === 'string' ? product.name : '',
        description: typeof product.description === 'string' ? product.description : '',
        price: Number.isFinite(numericPrice) ? roundPrice(numericPrice) : 0,
        category,
        categoryId: isFreeText ? null : product.categoryId,
        image: typeof product.image === 'string' ? product.image : '',
        isFreeText,
        styles: isRecord(product.styles) && Number.isFinite(Number(product.styles.fontSize))
          ? { ...product.styles, fontSize: roundFontSize(product.styles.fontSize) }
          : product.styles,
      } satisfies Product;
    });
};

const slugify = (value: string) => {
  const sanitized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || `item-${crypto.randomUUID().slice(0, 8)}`;
};

const isDataUrl = (value?: string) => Boolean(value?.startsWith('data:'));
const isRemoteUrl = (value?: string) => Boolean(value && /^https?:\/\//i.test(value));

const addAssetId = (assetIds: Set<string>, assetId?: string | null) => {
  if (assetId) assetIds.add(assetId);
};

const collectStyleAssetIds = (style?: Partial<MenuStyle> | null) => {
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

const collectProductAssetIds = (products?: Product[] | null) => {
  const assetIds = new Set<string>();
  (Array.isArray(products) ? products : []).forEach((product) => addAssetId(assetIds, product.imageAssetId));
  return assetIds;
};

const collectEditorStateAssetIds = (editorState?: Partial<MenuEditorState> | null) => {
  const assetIds = collectStyleAssetIds(editorState?.style);
  collectProductAssetIds(editorState?.freeTextProducts as Product[] | undefined).forEach((assetId) => assetIds.add(assetId));
  return assetIds;
};

const collectTemplateAssetIds = (versions: TemplateVersion[]) => {
  const assetIds = new Set<string>();
  versions.forEach((version) => {
    collectStyleAssetIds(version.styleState).forEach((assetId) => assetIds.add(assetId));
    addAssetId(assetIds, version.previewAssetId);
  });
  return assetIds;
};

const resolveWorkspaceAssetMap = (workspaceId: string, assetIds: Iterable<string>) =>
  resolveAssetMapForIds(workspaceId, Array.from(assetIds));

const parseLocalStorage = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const markLocalStateAsMigrated = () => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LOCAL_STORAGE_KEYS.migrated, 'true');
  }
};

const mapProfileRow = (row: any): Profile => ({
  userId: row.user_id,
  fullName: row.full_name,
  defaultWorkspaceId: row.default_workspace_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapWorkspaceRow = (row: any): Workspace => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  ownerUserId: row.owner_user_id,
  status: row.status,
  settings: {
    splitCategoryAcrossPages: Boolean(row.settings?.split_category_across_pages),
    productsCanChangeCategory: Boolean(row.settings?.productsCanChangeCategory),
  },
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const updateAccountIdentity = async ({
  userId,
  workspaceId,
  fullName,
  workspaceName,
}: {
  userId: string;
  workspaceId: string;
  fullName: string;
  workspaceName: string;
}) => {
  const supabase = getSupabaseClient();
  const normalizedFullName = fullName.trim();
  const normalizedWorkspaceName = workspaceName.trim();

  if (!normalizedFullName || !normalizedWorkspaceName) {
    throw new Error('Preencha o nome do responsável e do restaurante.');
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ full_name: normalizedFullName })
    .eq('user_id', userId);

  if (profileError) throw profileError;

  const { error: workspaceError } = await supabase
    .from('workspaces')
    .update({ name: normalizedWorkspaceName })
    .eq('id', workspaceId);

  if (workspaceError) throw workspaceError;

  return { fullName: normalizedFullName, workspaceName: normalizedWorkspaceName };
};

export const updateWorkspaceRuleSettings = async ({
  workspaceId,
  splitCategoryAcrossPages,
  productsCanChangeCategory,
}: {
  workspaceId: string;
  splitCategoryAcrossPages: boolean;
  productsCanChangeCategory: boolean;
}) => {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('workspaces')
    .update({
      settings: {
        split_category_across_pages: splitCategoryAcrossPages,
        productsCanChangeCategory,
      },
    })
    .eq('id', workspaceId);

  if (error) throw error;

  return { splitCategoryAcrossPages, productsCanChangeCategory };
};

export const updateAccountSettings = async ({
  userId,
  workspaceId,
  fullName,
  workspaceName,
  splitCategoryAcrossPages,
  productsCanChangeCategory,
}: {
  userId: string;
  workspaceId: string;
  fullName: string;
  workspaceName: string;
  splitCategoryAcrossPages: boolean;
  productsCanChangeCategory: boolean;
}) => {
  const supabase = getSupabaseClient();
  const normalizedFullName = fullName.trim();
  const normalizedWorkspaceName = workspaceName.trim();

  if (!normalizedFullName || !normalizedWorkspaceName) {
    throw new Error('Preencha o nome do responsável e do restaurante.');
  }

  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .update({ full_name: normalizedFullName })
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (profileError) throw profileError;

  const { data: workspaceRow, error: workspaceError } = await supabase
    .from('workspaces')
    .update({
      name: normalizedWorkspaceName,
      settings: { 
        split_category_across_pages: splitCategoryAcrossPages,
        productsCanChangeCategory: productsCanChangeCategory
      },
    })
    .eq('id', workspaceId)
    .select('*')
    .maybeSingle();

  if (workspaceError) throw workspaceError;
  if (!profileRow || !workspaceRow) {
      throw new Error("Não foi possível salvar as configurações. Tente recarregar a página.");
  }

  return {
    profile: mapProfileRow(profileRow),
    workspace: mapWorkspaceRow(workspaceRow),
  };
};

const mapMenuRow = (row: any): Menu => ({
  id: row.id,
  workspaceId: row.workspace_id,
  name: row.name,
  status: row.status,
  currentDraftVersionId: row.current_draft_version_id,
  publishedVersionId: row.published_version_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapMenuVersionRow = (row: any, editorState = row.editor_state): MenuVersion => ({
  id: row.id,
  menuId: row.menu_id,
  versionNumber: row.version_number,
  versionType: row.version_type,
  editorState,
  renderSnapshot: row.render_snapshot || {},
  createdBy: row.created_by,
  createdAt: row.created_at,
  actionLabel: row.action_label || null,
});

const mapPublicationRow = (row: any, pdfUrl: string | null = null): MenuPublication => ({
  id: row.id,
  menuId: row.menu_id,
  workspaceId: row.workspace_id,
  restaurantSlug: row.restaurant_slug,
  menuSlug: row.menu_slug,
  publishedVersionId: row.published_version_id,
  pdfAssetId: row.pdf_asset_id,
  pdfBucket: row.pdf_bucket || 'menu-assets',
  pdfPath: row.pdf_path || null,
  pdfUrl,
  pdfFilename: row.pdf_filename || 'cardapio.pdf',
  pdfOptions: row.pdf_options || {},
  snapshot: row.snapshot || {},
  contentSignature: row.content_signature,
  portableSnapshotUrl: null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapCategoryRow = (row: any): Category => ({
  id: row.id,
  workspaceId: row.workspace_id,
  name: row.name,
  slug: row.slug,
  position: row.position,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapTemplateRow = (row: any): Template => ({
  id: row.id,
  workspaceId: row.workspace_id,
  scope: row.scope,
  name: row.name,
  sourceType: row.source_type,
  currentVersionId: row.current_version_id,
  isLocked: row.is_locked,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapTemplateVersionRow = (row: any): TemplateVersion => ({
  id: row.id,
  templateId: row.template_id,
  versionNumber: row.version_number,
  styleState: row.style_state,
  previewAssetId: row.preview_asset_id,
  createdAt: row.created_at,
});

const withStyleDefaults = (style: MenuStyle | null | undefined): MenuStyle => {
  const base = cloneJson(INITIAL_STYLE);
  const source = isRecord(style) ? style as Partial<MenuStyle> : {};
  const layoutMode = source.layoutMode === 'grid' ? 'cards' : source.layoutMode || base.layoutMode;
  const stringArray = (value: unknown) => (
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  );
  const customProductOrder = isRecord(source.customProductOrder)
    ? Object.fromEntries(
        Object.entries(source.customProductOrder).map(([category, ids]) => [category, stringArray(ids)])
      )
    : {};
  const withRoundedFontSize = (baseStyle: Record<string, any> | undefined, sourceStyle: Record<string, any> | undefined) => {
    const merged = { ...(baseStyle || {}), ...(sourceStyle || {}) };
    return Number.isFinite(Number(merged.fontSize))
      ? { ...merged, fontSize: roundFontSize(merged.fontSize) }
      : merged;
  };

  return {
    ...base,
    ...source,
    layoutMode,
    cardBackgroundColor: typeof source.cardBackgroundColor === 'string' ? source.cardBackgroundColor : base.cardBackgroundColor,
    hiddenProductIds: stringArray(source.hiddenProductIds),
    customCategoryOrder: stringArray(source.customCategoryOrder),
    customProductOrder,
    categoryPlacements: isRecord(source.categoryPlacements)
      ? source.categoryPlacements as MenuStyle['categoryPlacements']
      : {},
    floatingText: Array.isArray(source.floatingText) ? source.floatingText.filter(isRecord) as any : [],
    addedImages: Array.isArray(source.addedImages) ? source.addedImages.filter(isRecord) as any : [],
    categoryImages: isRecord(source.categoryImages)
      ? Object.fromEntries(Object.entries(source.categoryImages).filter(([, image]) => isRecord(image))) as MenuStyle['categoryImages']
      : {},
    pageBackgrounds: Array.isArray(source.pageBackgrounds) ? source.pageBackgrounds.filter(isRecord) as any : [],
    pageBreaks: stringArray(source.pageBreaks),
    pageSetup: normalizeMenuPageSetup(source.pageSetup),
    fontSizeLimits: resolveFontSizeLimits({ ...base, ...source } as MenuStyle),
    minimumFontSize: resolveMinimumFontSize({ ...base, ...source } as MenuStyle),
    allowSameWordBreak: source.allowSameWordBreak === true,
    priceDecimalPlaces: resolvePriceDecimalPlaces(source.priceDecimalPlaces),
    priceDecimalSeparator: resolvePriceDecimalSeparator(source.priceDecimalSeparator),
    showPrices: source.showPrices !== false,
    showCurrencySymbol: source.showCurrencySymbol !== false,
    showPageNumbers: source.showPageNumbers !== false,
    showCategoryImages: source.showCategoryImages !== false,
    categoryImageScale: Number.isFinite(Number(source.categoryImageScale))
      ? Math.max(0.5, Math.min(2, Number(source.categoryImageScale)))
      : 1,
    margins: {
      ...(base.margins || {}),
      ...(isRecord(source.margins) ? source.margins : {}),
    } as MenuStyle['margins'],
    contentSpacing: {
      ...(base.contentSpacing || {}),
      ...(isRecord(source.contentSpacing) ? source.contentSpacing : {}),
    } as MenuStyle['contentSpacing'],
    elementStyles: {
      ...base.elementStyles,
      ...(isRecord(source.elementStyles) ? source.elementStyles : {}),
      menuTitle: withRoundedFontSize(base.elementStyles.menuTitle, source.elementStyles?.menuTitle),
      menuSubtitle: withRoundedFontSize(base.elementStyles.menuSubtitle, source.elementStyles?.menuSubtitle),
      pageNumber: withRoundedFontSize(base.elementStyles.pageNumber, source.elementStyles?.pageNumber),
      category: withRoundedFontSize(base.elementStyles.category, source.elementStyles?.category),
      productName: withRoundedFontSize(base.elementStyles.productName, source.elementStyles?.productName),
      productPrice: withRoundedFontSize(base.elementStyles.productPrice, source.elementStyles?.productPrice),
      productDescription: withRoundedFontSize(base.elementStyles.productDescription, source.elementStyles?.productDescription),
    },
  };
};

const assignTemplateMetadata = (templates: MenuStyle[]) =>
  templates.filter(isRecord).map((template) => {
    const isSystem = PRESET_TEMPLATE_IDS.has(template.id);
    return withStyleDefaults({
      ...template,
      scope: template.scope || (isSystem ? 'system' : 'workspace'),
      sourceType: template.sourceType || (isSystem ? 'preset' : 'user'),
      isLocked: template.isLocked ?? isSystem,
    });
  });

const assignCategoryIds = (products: Product[]) => {
  const categoryIdsByName = new Map<string, string>();

  return normalizePersistedProducts(products).map((product) => {
    if (product.isFreeText) {
      return { ...product, categoryId: null };
    }

    const existingId = product.categoryId || categoryIdsByName.get(product.category);
    const categoryId = existingId || crypto.randomUUID();
    categoryIdsByName.set(product.category, categoryId);

    return {
      ...product,
      categoryId,
    };
  });
};

export const normalizeWorkspaceClientState = (state: Partial<WorkspaceBootstrapData> | null | undefined): WorkspaceBootstrapData => {
  const source = isRecord(state) ? state : {};
  const templates = assignTemplateMetadata(Array.isArray(source.templates) ? source.templates as MenuStyle[] : []);
  const sortOption = isRecord(source.sortOption)
    && (source.sortOption.field === 'name' || source.sortOption.field === 'price')
    && (source.sortOption.direction === 'asc' || source.sortOption.direction === 'desc')
      ? source.sortOption as SortOption
      : DEFAULT_SORT_OPTION;

  return {
    products: assignCategoryIds(normalizePersistedProducts(source.products)),
    style: withStyleDefaults(source.style as MenuStyle | undefined),
    templates: mergeTemplates(
      templates.filter((template) => template.scope === 'workspace'),
      templates.filter((template) => template.scope === 'system'),
    ),
    sortOption,
  };
};

const getLocalBootstrapData = (): WorkspaceBootstrapData => {
  const localProducts = parseLocalStorage<Product[]>(LOCAL_STORAGE_KEYS.products, cloneJson(INITIAL_PRODUCTS));
  const localStyle = parseLocalStorage<MenuStyle>(LOCAL_STORAGE_KEYS.style, cloneJson(INITIAL_STYLE));
  const localTemplates = assignTemplateMetadata(parseLocalStorage<MenuStyle[]>(LOCAL_STORAGE_KEYS.templates, cloneJson(PRESET_TEMPLATES)));

  return {
    products: assignCategoryIds(localProducts),
    style: withStyleDefaults(localStyle),
    templates: mergeTemplates(
      localTemplates.filter((template) => template.scope === 'workspace'),
      localTemplates.filter((template) => template.scope === 'system'),
    ),
    sortOption: DEFAULT_SORT_OPTION,
  };
};

const mergeTemplates = (workspaceTemplates: MenuStyle[], systemTemplates: MenuStyle[]) => {
  const localSystemTemplates = assignTemplateMetadata(cloneJson(PRESET_TEMPLATES));
  const localSystemIds = new Set(localSystemTemplates.map((template) => template.id));
  const resolvedSystemTemplates = [
    ...localSystemTemplates,
    ...systemTemplates.filter((template) => !localSystemIds.has(template.id)),
  ];
  const workspaceIds = new Set(workspaceTemplates.map((template) => template.id));

  return [
    ...workspaceTemplates,
    ...resolvedSystemTemplates.filter((template) => !workspaceIds.has(template.id)),
  ];
};

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

const normalizeProductAssets = async (workspaceId: string, userId: string, products: Product[]) => {
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

const normalizeStyleAssets = async (workspaceId: string, userId: string, style: MenuStyle) => {
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

const hydrateStyleAssets = (style: MenuStyle, assetUrlMap: Map<string, string>) => {
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

const hydrateProductAssets = (products: Product[], assetUrlMap: Map<string, string>) =>
  normalizePersistedProducts(products).map((product) => ({
    ...product,
    image: product.imageAssetId ? assetUrlMap.get(product.imageAssetId) || product.image || '' : product.image || '',
  }));

const createRenderSnapshot = (products: Product[], style: MenuStyle, sortOption: SortOption) => ({
  savedAt: new Date().toISOString(),
  products,
  style,
  sortOption,
});

const canonicalizeMenuValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalizeMenuValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'savedAt')
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalizeMenuValue(item)]),
    );
  }
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}`;
    } catch {
      return value;
    }
  }
  return value;
};

export const getMenuContentSignature = (products: Product[], style: MenuStyle, sortOption: SortOption) => {
  const serialized = JSON.stringify(canonicalizeMenuValue({ products, style, sortOption }));
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const createEditorState = (style: MenuStyle, freeTextProducts: Product[], sortOption: SortOption): MenuEditorState => ({
  style,
  freeTextProducts,
  sortOption,
});

const resolveProductRowsForApp = (
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

const resolveEditorStateForApp = (editorState: Partial<MenuEditorState> | null | undefined, assetUrlMap: Map<string, string>) => {
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

const ensurePrimaryMenu = async (workspaceId: string) => {
  const supabase = getSupabaseClient();
  const { data: existingMenu, error } = await supabase
    .from('menus')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (existingMenu) {
    if (existingMenu.name === 'Main Menu') {
      const { data: renamedMenu, error: renameError } = await supabase
        .from('menus')
        .update({ name: 'Cardápio 1' })
        .eq('id', existingMenu.id)
        .select('*')
        .single();

      if (renameError) {
        throw renameError;
      }

      return mapMenuRow(renamedMenu);
    }

    return mapMenuRow(existingMenu);
  }

  const { data: createdMenu, error: createError } = await supabase
    .from('menus')
    .insert({
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      name: 'Cardápio 1',
      status: 'draft',
    })
    .select('*')
    .single();

  if (createError) {
    throw createError;
  }

  return mapMenuRow(createdMenu);
};

const listWorkspaceMenus = async (workspaceId: string) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('menus')
    .select('*')
    .eq('workspace_id', workspaceId)
    .neq('status', 'archived')
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map(mapMenuRow);
};

export const renameWorkspaceMenu = async ({
  workspaceId,
  menuId,
  name,
}: {
  workspaceId: string;
  menuId: string;
  name: string;
}) => {
  const supabase = getSupabaseClient();
  const trimmedName = name.trim() || 'Cardápio';

  const { data, error } = await supabase
    .from('menus')
    .update({ name: trimmedName })
    .eq('id', menuId)
    .eq('workspace_id', workspaceId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapMenuRow(data);
};

export const deleteWorkspaceMenu = async ({
  workspaceId,
  menuId,
}: {
  workspaceId: string;
  menuId: string;
}) => {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('menus')
    .delete()
    .eq('id', menuId)
    .eq('workspace_id', workspaceId);

  if (error) throw error;
};

const createInitialMenuVersionPayload = () => {
  const products = assignCategoryIds(cloneJson(INITIAL_PRODUCTS));
  const style = withStyleDefaults(cloneJson(INITIAL_STYLE));
  const sortOption = DEFAULT_SORT_OPTION;

  return {
    editorState: createEditorState(style, [], sortOption),
    renderSnapshot: createRenderSnapshot(products, style, sortOption),
  };
};

const initializeWorkspaceMenu = async (menu: Menu, userId: string) => {
  if (menu.currentDraftVersionId) {
    return menu;
  }

  const supabase = getSupabaseClient();
  const { editorState, renderSnapshot } = createInitialMenuVersionPayload();
  const { versionId } = await insertMenuVersionWithRetry({
    menuId: menu.id,
    userId,
    editorState,
    renderSnapshot,
    actionLabel: 'Cardápio criado',
  });

  const { data: updatedMenuRow, error: updateError } = await supabase
    .from('menus')
    .update({ current_draft_version_id: versionId })
    .eq('id', menu.id)
    .is('current_draft_version_id', null)
    .select('*')
    .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  if (updatedMenuRow) {
    return mapMenuRow(updatedMenuRow);
  }

  const { data: currentMenuRow, error: currentMenuError } = await supabase
    .from('menus')
    .select('*')
    .eq('id', menu.id)
    .single();

  if (currentMenuError) {
    throw currentMenuError;
  }

  return mapMenuRow(currentMenuRow);
};

const isMissingMenuRecoveryFunction = (error: any) => {
  const message = String(error?.message || error?.details || '');
  return error?.code === 'PGRST202'
    || (/ensure_my_workspace_menu/i.test(message) && /function|schema cache/i.test(message));
};

const ensureWorkspaceMenuForCurrentUser = async ({
  workspaceId,
  userId,
  menuId,
}: {
  workspaceId: string;
  userId: string;
  menuId?: string | null;
}) => {
  const supabase = getSupabaseClient();
  const { editorState, renderSnapshot } = createInitialMenuVersionPayload();
  const { data, error } = await supabase.rpc('ensure_my_workspace_menu', {
    requested_workspace_id: workspaceId,
    requested_menu_id: menuId || null,
    initial_editor_state: editorState,
    initial_render_snapshot: renderSnapshot,
  });

  if (!error) {
    const menuRow = Array.isArray(data) ? data[0] : data;
    if (!menuRow || menuRow.workspace_id !== workspaceId) {
      throw new Error('Não foi possível recuperar o cardápio padrão deste ambiente.');
    }

    return mapMenuRow(menuRow);
  }

  if (!isMissingMenuRecoveryFunction(error)) {
    throw error;
  }

  const menus = await listWorkspaceMenus(workspaceId);
  if (menus.length === 0) {
    return createWorkspaceMenu({ workspaceId, userId, name: 'Cardápio 1' });
  }

  const selectedMenu = menus.find((candidate) => candidate.id === menuId) || menus[0];
  return initializeWorkspaceMenu(selectedMenu, userId);
};

export const createWorkspaceMenu = async ({
  workspaceId,
  userId,
  name,
  sourceMenuId,
}: {
  workspaceId: string;
  userId: string;
  name: string;
  sourceMenuId?: string | null;
}) => {
  const supabase = getSupabaseClient();
  const menuId = crypto.randomUUID();

  const { data: menuRow, error } = await supabase
    .from('menus')
    .insert({
      id: menuId,
      workspace_id: workspaceId,
      name,
      status: 'draft',
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  if (sourceMenuId) {
    const { data: sourceMenu, error: sourceMenuError } = await supabase
      .from('menus')
      .select('current_draft_version_id')
      .eq('id', sourceMenuId)
      .eq('workspace_id', workspaceId)
      .single();
    if (sourceMenuError) throw sourceMenuError;

    const { data: sourceVersion, error: sourceVersionError } = await supabase
      .from('menu_versions')
      .select('*')
      .eq('id', sourceMenu.current_draft_version_id)
      .single();
    if (sourceVersionError) throw sourceVersionError;

    const { versionId } = await insertMenuVersionWithRetry({
      menuId,
      userId,
      editorState: cloneJson(sourceVersion.editor_state),
      renderSnapshot: cloneJson(sourceVersion.render_snapshot),
      actionLabel: 'Cardápio criado a partir de outro cardápio',
    });
    const { data: copiedMenu, error: copiedMenuError } = await supabase
      .from('menus')
      .update({ current_draft_version_id: versionId })
      .eq('id', menuId)
      .select('*')
      .single();
    if (copiedMenuError) throw copiedMenuError;
    return mapMenuRow(copiedMenu);
  }

  return initializeWorkspaceMenu(mapMenuRow(menuRow), userId);
};

const resolveActiveMenu = async (workspaceId: string, menuId?: string | null) => {
  if (!menuId) {
    return ensurePrimaryMenu(workspaceId);
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('menus')
    .select('*')
    .eq('id', menuId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return mapMenuRow(data);
  }

  return ensurePrimaryMenu(workspaceId);
};

export const loadWorkspaceMenuData = async ({
  userId,
  profile,
  workspace,
  templates,
  menuId,
}: {
  userId: string;
  profile: Profile;
  workspace: Workspace;
  templates: MenuStyle[];
  menuId: string;
}): Promise<LoadedWorkspaceData> => {
  const supabase = getSupabaseClient();
  const menus = await listWorkspaceMenus(workspace.id);
  if (menus.length === 0) {
    return loadWorkspaceData(userId, menuId);
  }
  const menu = menus.find((candidate) => candidate.id === menuId) || menus[0];

  if (!menu.currentDraftVersionId) {
    return loadWorkspaceData(userId, menuId);
  }

  const { data: currentVersionRow, error: versionError } = await supabase
    .from('menu_versions')
    .select('*')
    .eq('id', menu.currentDraftVersionId)
    .maybeSingle();

  if (versionError) {
    throw versionError;
  }

  if (!currentVersionRow) {
    return loadWorkspaceData(userId, menuId);
  }

  const rawSnapshotProducts = Array.isArray(currentVersionRow.render_snapshot?.products)
    ? currentVersionRow.render_snapshot.products as Product[]
    : null;
  const assetIds = collectEditorStateAssetIds(currentVersionRow.editor_state);
  collectProductAssetIds(rawSnapshotProducts).forEach((assetId) => assetIds.add(assetId));
  let categoryData: any[] | null = null;
  let productData: any[] | null = null;

  if (!rawSnapshotProducts) {
    const [{ data: loadedCategoryData, error: categoryError }, { data: loadedProductData, error: productError }] = await Promise.all([
      supabase.from('catalog_categories').select('*').eq('workspace_id', workspace.id).order('position', { ascending: true }),
      supabase.from('catalog_products').select('*').eq('workspace_id', workspace.id).order('sort_index', { ascending: true }),
    ]);

    if (categoryError) throw categoryError;
    if (productError) throw productError;

    categoryData = loadedCategoryData || [];
    productData = loadedProductData || [];
    productData.forEach((row) => addAssetId(assetIds, row.primary_asset_id));
  }

  const assetUrlMap = await resolveWorkspaceAssetMap(workspace.id, assetIds);
  const editorState = resolveEditorStateForApp(currentVersionRow.editor_state, assetUrlMap);
  let snapshotProducts = rawSnapshotProducts ? hydrateProductAssets(rawSnapshotProducts, assetUrlMap) : null;

  if (!snapshotProducts) {
    const categories = (categoryData || []).map(mapCategoryRow);
    snapshotProducts = [
      ...resolveProductRowsForApp(categories, productData || [], assetUrlMap),
      ...editorState.freeTextProducts,
    ];
  }

  const currentVersion: MenuVersion = {
    id: currentVersionRow.id,
    menuId: currentVersionRow.menu_id,
    versionNumber: currentVersionRow.version_number,
    versionType: currentVersionRow.version_type,
    editorState,
    renderSnapshot: currentVersionRow.render_snapshot || {},
    createdBy: currentVersionRow.created_by,
    createdAt: currentVersionRow.created_at,
  };

  return {
    profile,
    workspace,
    menus,
    menu,
    currentVersion,
    products: snapshotProducts,
    style: editorState.style,
    templates,
    sortOption: editorState.sortOption,
  };
};

const loadTemplatesForWorkspace = async (workspaceId: string) => {
  const supabase = getSupabaseClient();
  const [{ data: systemRows, error: systemError }, { data: workspaceRows, error: workspaceError }] = await Promise.all([
    supabase.from('templates').select('*').eq('scope', 'system').order('created_at', { ascending: true }),
    supabase.from('templates').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: true }),
  ]);

  if (systemError) {
    throw systemError;
  }

  if (workspaceError) {
    throw workspaceError;
  }

  const templateRows = [...(systemRows || []), ...(workspaceRows || [])].map(mapTemplateRow);
  const versionIds = templateRows.map((template) => template.currentVersionId).filter(Boolean);

  let versionRows: TemplateVersion[] = [];
  if (versionIds.length > 0) {
    const { data, error } = await supabase.from('template_versions').select('*').in('id', versionIds);
    if (error) {
      throw error;
    }
    versionRows = (data || []).map(mapTemplateVersionRow);
  }

  const assetUrlMap = await resolveWorkspaceAssetMap(workspaceId, collectTemplateAssetIds(versionRows));
  const versionsById = new Map(versionRows.map((version) => [version.id, version]));
  const resolvedTemplates = templateRows
    .map((template) => {
      const version = template.currentVersionId ? versionsById.get(template.currentVersionId) : undefined;
      const fallbackPreset = PRESET_TEMPLATES.find((preset) => preset.id === template.id);
      const styleState = version?.styleState || fallbackPreset;

      if (!styleState) {
        return null;
      }

      return hydrateStyleAssets(
        withStyleDefaults({
          ...styleState,
          id: template.id,
          name: template.name,
          scope: template.scope,
          sourceType: template.sourceType,
          templateVersionId: version?.id || null,
          isLocked: template.isLocked,
        }),
        assetUrlMap,
      );
    })
    .filter(Boolean) as MenuStyle[];

  const workspaceTemplates = resolvedTemplates.filter((template) => template.scope === 'workspace');
  const systemTemplates = resolvedTemplates.filter((template) => template.scope === 'system');

  return mergeTemplates(workspaceTemplates, systemTemplates);
};

const syncWorkspaceTemplates = async (workspaceId: string, userId: string, templates: MenuStyle[]) => {
  const supabase = getSupabaseClient();
  const workspaceTemplates = assignTemplateMetadata(templates).filter((template) => template.scope === 'workspace');

  const normalizedTemplates = await Promise.all(
    workspaceTemplates.map(async (template) => {
      const normalizedStyle = await normalizeStyleAssets(workspaceId, userId, template);
      return {
        ...normalizedStyle,
        scope: 'workspace' as const,
        sourceType: normalizedStyle.sourceType || 'user',
        templateVersionId: normalizedStyle.templateVersionId || `${normalizedStyle.id}::v1`,
        isLocked: false,
      };
    }),
  );

  const templateRows = normalizedTemplates.map((template) => ({
    id: template.id,
    workspace_id: workspaceId,
    scope: 'workspace',
    name: template.name,
    source_type: template.sourceType || 'user',
    is_locked: false,
  }));

  const templateRowsWithVersion = normalizedTemplates.map((template) => ({
    ...templateRows.find((row) => row.id === template.id)!,
    current_version_id: template.templateVersionId,
  }));

  const versionRows = normalizedTemplates.map((template) => ({
    id: template.templateVersionId,
    template_id: template.id,
    version_number: 1,
    style_state: template,
    preview_asset_id: template.backgroundAssetId || null,
  }));

  if (templateRows.length > 0) {
    const { error: upsertTemplateError } = await supabase.from('templates').upsert(templateRows, { onConflict: 'id' });
    if (upsertTemplateError) {
      throw upsertTemplateError;
    }

    const { error: upsertVersionError } = await supabase
      .from('template_versions')
      .upsert(versionRows, { onConflict: 'id' });

    if (upsertVersionError) {
      throw upsertVersionError;
    }

    const { error: updateTemplateVersionError } = await supabase
      .from('templates')
      .upsert(templateRowsWithVersion, { onConflict: 'id' });

    if (updateTemplateVersionError) {
      throw updateTemplateVersionError;
    }
  }

  const { data: existingRows, error: existingError } = await supabase
    .from('templates')
    .select('id')
    .eq('workspace_id', workspaceId);

  if (existingError) {
    throw existingError;
  }

  const liveIds = new Set(normalizedTemplates.map((template) => template.id));
  const idsToDelete = (existingRows || []).map((row) => row.id).filter((id) => !liveIds.has(id));
  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase.from('templates').delete().in('id', idsToDelete);
    if (deleteError) {
      throw deleteError;
    }
  }

  return mergeTemplates(normalizedTemplates, []);
};

const resolveCategoriesForSave = async (
  workspaceId: string,
  products: Product[],
  categoryOrder: string[],
) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('catalog_categories')
    .select('*')
    .eq('workspace_id', workspaceId);

  if (error) {
    throw error;
  }

  const existingCategories = (data || []).map(mapCategoryRow);
  const existingById = new Map(existingCategories.map((category) => [category.id, category]));
  const grouped = new Map<string, Product[]>();

  products.forEach((product) => {
    const current = grouped.get(product.category) || [];
    current.push(product);
    grouped.set(product.category, current);
  });

  const orderedNames = Array.from(new Set([
    ...categoryOrder.filter((category) => grouped.has(category)),
    ...Array.from(grouped.keys()).filter((category) => !categoryOrder.includes(category)).sort((a, b) => a.localeCompare(b)),
  ]));

  const usedCategoryIds = new Set<string>();
  const categoriesForSave = orderedNames.map((categoryName, index) => {
    const categoryProducts = grouped.get(categoryName) || [];
    const candidateIds = categoryProducts
      .map((product) => product.categoryId)
      .filter((value): value is string => Boolean(value && existingById.has(value)));

    const chosenId =
      candidateIds.find((categoryId) => !usedCategoryIds.has(categoryId)) ||
      existingCategories.find((category) => category.name === categoryName && !usedCategoryIds.has(category.id))?.id ||
      crypto.randomUUID();

    usedCategoryIds.add(chosenId);

    return {
      id: chosenId,
      workspace_id: workspaceId,
      name: categoryName,
      position: index,
      is_active: true,
    };
  });

  const existingSlugOwners = new Map(existingCategories.map((category) => [category.slug, category.id]));
  const usedSlugs = new Set<string>();
  const categoryRows = categoriesForSave.map((category) => {
    const baseSlug = slugify(category.name);
    let slug = baseSlug;
    let suffix = 2;

    while (
      usedSlugs.has(slug) ||
      (existingSlugOwners.has(slug) && existingSlugOwners.get(slug) !== category.id)
    ) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    usedSlugs.add(slug);
    return { ...category, slug };
  });

  const categoryIdByName = new Map(categoryRows.map((row) => [row.name, row.id]));
  const normalizedProducts = products.map((product) => ({
    ...product,
    categoryId: categoryIdByName.get(product.category) || product.categoryId || null,
  }));

  return {
    existingCategories,
    categoryRows,
    normalizedProducts,
  };
};

const waitForRetry = (delayMs: number) => new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));

const isVersionConflictError = (error: any) => {
  const message = String(error?.message || error?.details || '');
  return error?.code === '23505' || /duplicate key|menu_versions/i.test(message);
};

const isMissingSchemaObjectError = (error: any, objectName: string) => {
  const message = String(error?.message || error?.details || error?.hint || '');
  return error?.code === 'PGRST205' || (message.includes(objectName) && /schema cache|could not find/i.test(message));
};

const isMissingActionLabelError = (error: any) => {
  const message = String(error?.message || error?.details || error?.hint || '');
  return message.includes('action_label') && (error?.code === 'PGRST204' || /schema cache|column/i.test(message));
};

const insertMenuVersionWithRetry = async ({
  menuId,
  userId,
  editorState,
  renderSnapshot,
  versionType = 'snapshot',
  actionLabel = 'Alteração salva',
}: {
  menuId: string;
  userId: string;
  editorState: MenuEditorState;
  renderSnapshot: ReturnType<typeof createRenderSnapshot>;
  versionType?: MenuVersion['versionType'];
  actionLabel?: string;
}) => {
  const supabase = getSupabaseClient();
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data: latestVersionRow, error: latestVersionError } = await supabase
      .from('menu_versions')
      .select('version_number')
      .eq('menu_id', menuId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestVersionError) {
      throw latestVersionError;
    }

    const versionNumber = Number(latestVersionRow?.version_number || 0) + 1;
    const versionId = crypto.randomUUID();
    const versionPayload = {
      id: versionId,
      menu_id: menuId,
      version_number: versionNumber,
      version_type: versionType,
      editor_state: editorState,
      render_snapshot: renderSnapshot,
      created_by: userId,
      action_label: actionLabel,
    };
    let { error: insertVersionError } = await supabase.from('menu_versions').insert(versionPayload);
    if (insertVersionError && isMissingActionLabelError(insertVersionError)) {
      const { action_label: _actionLabel, ...legacyPayload } = versionPayload;
      const legacyResult = await supabase.from('menu_versions').insert(legacyPayload);
      insertVersionError = legacyResult.error;
    }

    if (!insertVersionError) {
      return { versionId, versionNumber };
    }

    lastError = insertVersionError;
    if (!isVersionConflictError(insertVersionError) || attempt === 3) {
      throw insertVersionError;
    }

    await waitForRetry(120 * (attempt + 1));
  }

  throw lastError;
};

const propagateSyncedProducts = async ({
  workspaceId,
  sourceMenuId,
  sourceMenuName,
  userId,
  sourceProducts,
}: {
  workspaceId: string;
  sourceMenuId: string;
  sourceMenuName: string;
  userId: string;
  sourceProducts: Product[];
}) => {
  const supabase = getSupabaseClient();
  const { data: sourceLinks, error: sourceLinksError } = await supabase
    .from('menu_product_sync_links')
    .select('target_menu_id, product_id')
    .eq('workspace_id', workspaceId)
    .eq('source_menu_id', sourceMenuId);
  if (sourceLinksError) throw sourceLinksError;

  const targetLinks = new Map<string, Set<string>>();
  (sourceLinks || []).forEach((row) => {
    const ids = targetLinks.get(row.target_menu_id) || new Set<string>();
    ids.add(row.product_id);
    targetLinks.set(row.target_menu_id, ids);
  });
  if (targetLinks.size === 0) return;

  const { data: targetMenus, error: targetMenusError } = await supabase
    .from('menus')
    .select('*')
    .in('id', Array.from(targetLinks.keys()))
    .neq('status', 'archived');
  if (targetMenusError) throw targetMenusError;

  const sourceById = new Map(sourceProducts.filter((product) => !product.isFreeText).map((product) => [product.id, product]));
  await Promise.all((targetMenus || []).map(async (targetMenuRow) => {
    if (!targetMenuRow.current_draft_version_id) return;
    const { data: targetVersion, error: targetVersionError } = await supabase
      .from('menu_versions')
      .select('*')
      .eq('id', targetMenuRow.current_draft_version_id)
      .single();
    if (targetVersionError) throw targetVersionError;

    const linkedIds = targetLinks.get(targetMenuRow.id) || new Set<string>();
    const currentProducts = normalizePersistedProducts(targetVersion.render_snapshot?.products);
    const presentIds = new Set<string>();
    const nextProducts = currentProducts.flatMap((product) => {
      if (!linkedIds.has(product.id)) return [product];
      const sourceProduct = sourceById.get(product.id);
      if (!sourceProduct) return [];
      presentIds.add(product.id);
      return [cloneJson(sourceProduct)];
    });
    linkedIds.forEach((productId) => {
      const sourceProduct = sourceById.get(productId);
      if (sourceProduct && !presentIds.has(productId)) nextProducts.push(cloneJson(sourceProduct));
    });

    const editorState = targetVersion.editor_state as MenuEditorState;
    const nextEditorState = createEditorState(
      editorState.style,
      nextProducts.filter((product) => product.isFreeText),
      editorState.sortOption || DEFAULT_SORT_OPTION,
    );
    const nextSnapshot = createRenderSnapshot(
      nextProducts,
      editorState.style,
      editorState.sortOption || DEFAULT_SORT_OPTION,
    );
    const { versionId } = await insertMenuVersionWithRetry({
      menuId: targetMenuRow.id,
      userId,
      editorState: nextEditorState,
      renderSnapshot: nextSnapshot,
      actionLabel: `Produtos sincronizados de ${sourceMenuName}`,
    });
    const { error: updateTargetError } = await supabase
      .from('menus')
      .update({ current_draft_version_id: versionId, status: 'draft' })
      .eq('id', targetMenuRow.id);
    if (updateTargetError) throw updateTargetError;
  }));
};

const describeRevisionChange = (previousSnapshot: Record<string, any> | null, nextSnapshot: Record<string, any>) => {
  if (!previousSnapshot) return 'Cardápio criado';
  const previousProducts = normalizePersistedProducts(previousSnapshot.products);
  const nextProducts = normalizePersistedProducts(nextSnapshot.products);
  const previousIds = new Set(previousProducts.map((product) => product.id));
  const nextIds = new Set(nextProducts.map((product) => product.id));
  const added = nextProducts.filter((product) => !previousIds.has(product.id)).length;
  const removed = previousProducts.filter((product) => !nextIds.has(product.id)).length;
  const labels: string[] = [];
  if (added) labels.push(`${added} produto${added === 1 ? '' : 's'} adicionado${added === 1 ? '' : 's'}`);
  if (removed) labels.push(`${removed} produto${removed === 1 ? '' : 's'} removido${removed === 1 ? '' : 's'}`);
  if (!added && !removed && productComparisonSignature(previousProducts) !== productComparisonSignature(nextProducts)) labels.push('Produtos atualizados');
  if (JSON.stringify(canonicalizeMenuValue(previousSnapshot.style)) !== JSON.stringify(canonicalizeMenuValue(nextSnapshot.style))) labels.push('Visual atualizado');
  if (JSON.stringify(previousSnapshot.sortOption) !== JSON.stringify(nextSnapshot.sortOption)) labels.push('Ordenação atualizada');
  return labels.slice(0, 2).join(' · ') || 'Alteração salva';
};

export const saveWorkspaceState = async ({
  workspaceId,
  userId,
  menuId,
  products,
  style,
  templates,
  sortOption,
  actionLabel = 'Alteração salva',
}: {
  workspaceId: string;
  userId: string;
  menuId?: string | null;
  products: Product[];
  style: MenuStyle;
  templates: MenuStyle[];
  sortOption: SortOption;
  actionLabel?: string;
}): Promise<SaveWorkspaceResult> => {
  const supabase = getSupabaseClient();
  const normalizedProducts = await normalizeProductAssets(workspaceId, userId, assignCategoryIds(products));
  const normalizedStyle = await normalizeStyleAssets(workspaceId, userId, withStyleDefaults(style));
  const normalizedTemplates = await syncWorkspaceTemplates(workspaceId, userId, templates);

  const catalogProducts = normalizedProducts.filter((product) => !product.isFreeText);
  const freeTextProducts = normalizedProducts.filter((product) => product.isFreeText);
  const categoryOrder = (normalizedStyle.customCategoryOrder || []).filter((category) => !category.startsWith('ft_'));

  const { existingCategories, categoryRows, normalizedProducts: productsWithCategoryIds } = await resolveCategoriesForSave(
    workspaceId,
    catalogProducts,
    categoryOrder,
  );

  if (categoryRows.length > 0) {
    const { error: upsertCategoryError } = await supabase
      .from('catalog_categories')
      .upsert(categoryRows, { onConflict: 'id' });

    if (upsertCategoryError) {
      throw upsertCategoryError;
    }
  }

  const catalogRows = productsWithCategoryIds.map((product, index) => ({
    id: product.id,
    workspace_id: workspaceId,
    category_id: product.categoryId,
    name: product.name,
    description: product.description,
    base_price: roundPrice(product.price),
    primary_asset_id: product.imageAssetId || null,
    sort_index: index,
    is_active: true,
  }));

  if (catalogRows.length > 0) {
    const { error: upsertProductError } = await supabase
      .from('catalog_products')
      .upsert(catalogRows, { onConflict: 'id' });

    if (upsertProductError) {
      throw upsertProductError;
    }
  }

  const { data: existingProductRows, error: existingProductError } = await supabase
    .from('catalog_products')
    .select('id')
    .eq('workspace_id', workspaceId);

  if (existingProductError) {
    throw existingProductError;
  }

  const liveProductIds = new Set(productsWithCategoryIds.map((product) => product.id));
  const productsToDelete = (existingProductRows || []).map((row) => row.id).filter((id) => !liveProductIds.has(id));
  if (productsToDelete.length > 0) {
    const { error: deleteProductError } = await supabase.from('catalog_products').delete().in('id', productsToDelete);
    if (deleteProductError) {
      throw deleteProductError;
    }
  }

  const liveCategoryIds = new Set(categoryRows.map((row) => row.id));
  const categoriesToDelete = existingCategories.map((category) => category.id).filter((id) => !liveCategoryIds.has(id));
  if (categoriesToDelete.length > 0) {
    const { error: deleteCategoryError } = await supabase.from('catalog_categories').delete().in('id', categoriesToDelete);
    if (deleteCategoryError) {
      throw deleteCategoryError;
    }
  }

  const activeMenu = await resolveActiveMenu(workspaceId, menuId);
  const editorState = createEditorState(normalizedStyle, freeTextProducts, sortOption);
  const renderSnapshot = createRenderSnapshot([...productsWithCategoryIds, ...freeTextProducts], normalizedStyle, sortOption);
  let resolvedActionLabel = actionLabel;
  if (actionLabel === 'Alteração salva' && activeMenu.currentDraftVersionId) {
    const { data: previousVersion } = await supabase
      .from('menu_versions')
      .select('render_snapshot')
      .eq('id', activeMenu.currentDraftVersionId)
      .maybeSingle();
    resolvedActionLabel = describeRevisionChange(previousVersion?.render_snapshot || null, renderSnapshot);
  }
  const { versionId: currentVersionId, versionNumber: nextVersionNumber } = await insertMenuVersionWithRetry({
    menuId: activeMenu.id,
    userId,
    editorState,
    renderSnapshot,
    actionLabel: resolvedActionLabel,
  });

  const { data: menuRow, error: updateMenuError } = await supabase
    .from('menus')
    .update({
      name: activeMenu.name,
      status: 'draft',
      current_draft_version_id: currentVersionId,
    })
    .eq('id', activeMenu.id)
    .select('*')
    .single();

  if (updateMenuError) {
    throw updateMenuError;
  }

  await propagateSyncedProducts({
    workspaceId,
    sourceMenuId: activeMenu.id,
    sourceMenuName: activeMenu.name,
    userId,
    sourceProducts: [...productsWithCategoryIds, ...freeTextProducts],
  });

  const savedMenu = mapMenuRow(menuRow);
  const savedVersion: MenuVersion = {
    id: currentVersionId,
    menuId: savedMenu.id,
    versionNumber: nextVersionNumber,
    versionType: 'snapshot',
    editorState,
    renderSnapshot,
    createdBy: userId,
    createdAt: new Date().toISOString(),
    actionLabel: resolvedActionLabel,
  };

  return {
    menu: savedMenu,
    currentVersion: savedVersion,
    products: [...productsWithCategoryIds, ...freeTextProducts],
    style: normalizedStyle,
    templates: mergeTemplates(
      normalizedTemplates.filter((template) => template.scope === 'workspace'),
      normalizedTemplates.filter((template) => template.scope === 'system'),
    ),
    sortOption,
  };
};

const bootstrapWorkspaceFromLocalState = async (workspaceId: string, userId: string) => {
  const localState = getLocalBootstrapData();
  const menu = await ensurePrimaryMenu(workspaceId);

  const result = await saveWorkspaceState({
    workspaceId,
    userId,
    menuId: menu.id,
    products: localState.products,
    style: localState.style,
    templates: localState.templates,
    sortOption: localState.sortOption,
  });

  markLocalStateAsMigrated();
  return result;
};

export const loadWorkspaceData = async (userId: string, menuId?: string | null): Promise<LoadedWorkspaceData> => {
  const supabase = getSupabaseClient();
  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (profileError) {
    throw profileError;
  }

  const profile = mapProfileRow(profileRow);
  if (!profile.defaultWorkspaceId) {
    throw new Error('Nenhum workspace associado ao usuário autenticado.');
  }

  const { data: workspaceRow, error: workspaceError } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', profile.defaultWorkspaceId)
    .single();

  if (workspaceError) {
    throw workspaceError;
  }

  const workspace = mapWorkspaceRow(workspaceRow);
  const templatesPromise = loadTemplatesForWorkspace(workspace.id);
  let menus = await listWorkspaceMenus(workspace.id);
  let menu: Menu;
  if (menus.length === 0) {
    menu = await ensureWorkspaceMenuForCurrentUser({
      workspaceId: workspace.id,
      userId,
    });
    menus = [menu];
  } else {
    menu = (menuId ? menus.find((candidate) => candidate.id === menuId) : undefined) || menus[0];
    if (!menu.currentDraftVersionId) {
      menu = await ensureWorkspaceMenuForCurrentUser({
        workspaceId: workspace.id,
        userId,
        menuId: menu.id,
      });
    }
    if (!menus.some((candidate) => candidate.id === menu.id)) {
      menus = await listWorkspaceMenus(workspace.id);
    } else {
      menus = menus.map((candidate) => candidate.id === menu.id ? menu : candidate);
    }
  }

  let currentVersionRow: any = null;
  let templates: MenuStyle[] | null = null;
  if (menu.currentDraftVersionId) {
    const [{ data, error }, loadedTemplates] = await Promise.all([
      supabase
        .from('menu_versions')
        .select('*')
        .eq('id', menu.currentDraftVersionId)
        .maybeSingle(),
      templatesPromise,
    ]);

    if (error) throw error;

    currentVersionRow = data;
    templates = loadedTemplates;
    const rawSnapshotProducts = currentVersionRow && Array.isArray(currentVersionRow.render_snapshot?.products)
      ? currentVersionRow.render_snapshot.products as Product[]
      : null;
    const assetIds = collectEditorStateAssetIds(currentVersionRow?.editor_state);
    collectProductAssetIds(rawSnapshotProducts).forEach((assetId) => assetIds.add(assetId));
    const assetUrlMap = await resolveWorkspaceAssetMap(workspace.id, assetIds);
    const editorState = currentVersionRow ? resolveEditorStateForApp(currentVersionRow.editor_state, assetUrlMap) : null;
    const snapshotProducts = currentVersionRow && rawSnapshotProducts
      ? hydrateProductAssets(rawSnapshotProducts, assetUrlMap)
      : null;

    if (currentVersionRow && snapshotProducts) {
      const currentVersion: MenuVersion = {
        id: currentVersionRow.id,
        menuId: currentVersionRow.menu_id,
        versionNumber: currentVersionRow.version_number,
        versionType: currentVersionRow.version_type,
        editorState: editorState!,
        renderSnapshot: currentVersionRow.render_snapshot || {},
        createdBy: currentVersionRow.created_by,
        createdAt: currentVersionRow.created_at,
      };

      return {
        profile,
        workspace,
        menus,
        menu,
        currentVersion,
        products: snapshotProducts,
        style: editorState!.style,
        templates,
        sortOption: editorState!.sortOption,
      };
    }
  }

  templates = templates || await templatesPromise;

  if (!currentVersionRow) {
    const bootstrapped = await bootstrapWorkspaceFromLocalState(workspace.id, userId);
    return {
      profile,
      workspace,
      menus: await listWorkspaceMenus(workspace.id),
      menu: bootstrapped.menu,
      currentVersion: bootstrapped.currentVersion,
      products: bootstrapped.products,
      style: bootstrapped.style,
      templates: bootstrapped.templates,
      sortOption: bootstrapped.sortOption,
    };
  }

  const [{ data: categoryData, error: categoryError }, { data: productData, error: productError }] = await Promise.all([
    supabase.from('catalog_categories').select('*').eq('workspace_id', workspace.id).order('position', { ascending: true }),
    supabase.from('catalog_products').select('*').eq('workspace_id', workspace.id).order('sort_index', { ascending: true }),
  ]);

  if (categoryError) throw categoryError;
  if (productError) throw productError;

  const assetIds = collectEditorStateAssetIds(currentVersionRow.editor_state);
  (productData || []).forEach((row) => addAssetId(assetIds, row.primary_asset_id));
  const assetUrlMap = await resolveWorkspaceAssetMap(workspace.id, assetIds);
  const editorState = resolveEditorStateForApp(currentVersionRow.editor_state, assetUrlMap);
  const categories = (categoryData || []).map(mapCategoryRow);
  const snapshotProducts = [
    ...resolveProductRowsForApp(categories, productData || [], assetUrlMap),
    ...editorState.freeTextProducts,
  ];
  const currentVersion: MenuVersion = {
    id: currentVersionRow.id,
    menuId: currentVersionRow.menu_id,
    versionNumber: currentVersionRow.version_number,
    versionType: currentVersionRow.version_type,
    editorState: editorState,
    renderSnapshot: currentVersionRow.render_snapshot || {},
    createdBy: currentVersionRow.created_by,
    createdAt: currentVersionRow.created_at,
  };

  return {
    profile,
    workspace,
    menus,
    menu,
    currentVersion,
    products: snapshotProducts,
    style: editorState.style,
    templates,
    sortOption: editorState.sortOption,
  };
};

const hydrateSnapshot = async (workspaceId: string, snapshot: Record<string, any>) => {
  const snapshotProducts = normalizePersistedProducts(snapshot.products);
  const snapshotStyle = withStyleDefaults(snapshot.style || INITIAL_STYLE);
  const assetIds = collectStyleAssetIds(snapshotStyle);
  collectProductAssetIds(snapshotProducts).forEach((assetId) => assetIds.add(assetId));
  const assetUrlMap = await resolveWorkspaceAssetMap(workspaceId, assetIds);
  return {
    products: hydrateProductAssets(snapshotProducts, assetUrlMap),
    style: hydrateStyleAssets(snapshotStyle, assetUrlMap),
    sortOption: (snapshot.sortOption || DEFAULT_SORT_OPTION) as SortOption,
  };
};

export const listMenuRevisions = async (menuId: string) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('menu_versions')
    .select('*')
    .eq('menu_id', menuId)
    .order('version_number', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => mapMenuVersionRow(row));
};

export const loadMenuRevisionState = async ({
  workspaceId,
  versionId,
}: {
  workspaceId: string;
  versionId: string;
}) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('menu_versions')
    .select('*')
    .eq('id', versionId)
    .single();
  if (error) throw error;
  return hydrateSnapshot(workspaceId, data.render_snapshot || {});
};

const productComparisonSignature = (products: Product[]) => JSON.stringify(
  canonicalizeMenuValue(products.filter((product) => !product.isFreeText).sort((left, right) => left.id.localeCompare(right.id))),
);

export const listMenuProductSources = async ({
  workspaceId,
  currentMenuId,
  currentProducts,
}: {
  workspaceId: string;
  currentMenuId: string;
  currentProducts: Product[];
}): Promise<MenuProductSource[]> => {
  const menus = await listWorkspaceMenus(workspaceId);
  const currentSignature = productComparisonSignature(currentProducts);
  const sources = await Promise.all(menus.filter((menu) => menu.id !== currentMenuId).map(async (menu) => {
    if (!menu.currentDraftVersionId) return null;
    const state = await loadMenuRevisionState({ workspaceId, versionId: menu.currentDraftVersionId });
    const products = state.products.filter((product) => !product.isFreeText);
    if (products.length === 0 || productComparisonSignature(products) === currentSignature) return null;
    return { menu, products } satisfies MenuProductSource;
  }));
  return sources.filter(Boolean) as MenuProductSource[];
};

export const linkSyncedMenuProducts = async ({
  workspaceId,
  sourceMenuId,
  targetMenuId,
  productIds,
}: {
  workspaceId: string;
  sourceMenuId: string;
  targetMenuId: string;
  productIds: string[];
}) => {
  const uniqueIds = Array.from(new Set(productIds));
  if (uniqueIds.length === 0) return;
  const supabase = getSupabaseClient();
  const rows = uniqueIds.flatMap((productId) => [
    { workspace_id: workspaceId, source_menu_id: sourceMenuId, target_menu_id: targetMenuId, product_id: productId },
    { workspace_id: workspaceId, source_menu_id: targetMenuId, target_menu_id: sourceMenuId, product_id: productId },
  ]);
  const { error } = await supabase.from('menu_product_sync_links').upsert(rows, { onConflict: 'source_menu_id,target_menu_id,product_id' });
  if (error) throw error;
};

export const listMenuProductSyncs = async ({
  workspaceId,
  currentMenuId,
}: {
  workspaceId: string;
  currentMenuId: string;
}): Promise<MenuProductSync[]> => {
  const supabase = getSupabaseClient();
  const { data: links, error: linksError } = await supabase
    .from('menu_product_sync_links')
    .select('target_menu_id, product_id')
    .eq('workspace_id', workspaceId)
    .eq('source_menu_id', currentMenuId);
  if (linksError) throw linksError;

  const counts = new Map<string, Set<string>>();
  (links || []).forEach((link) => {
    const productIds = counts.get(link.target_menu_id) || new Set<string>();
    productIds.add(link.product_id);
    counts.set(link.target_menu_id, productIds);
  });
  if (counts.size === 0) return [];

  const { data: menus, error: menusError } = await supabase
    .from('menus')
    .select('*')
    .in('id', Array.from(counts.keys()))
    .neq('status', 'archived');
  if (menusError) throw menusError;

  return (menus || []).map((menuRow) => ({
    menu: mapMenuRow(menuRow),
    productCount: counts.get(menuRow.id)?.size || 0,
  }));
};

export const unlinkSyncedMenuProducts = async ({
  workspaceId,
  sourceMenuId,
  targetMenuId,
}: {
  workspaceId: string;
  sourceMenuId: string;
  targetMenuId: string;
}) => {
  const supabase = getSupabaseClient();
  const directions = [
    [sourceMenuId, targetMenuId],
    [targetMenuId, sourceMenuId],
  ] as const;
  const results = await Promise.all(directions.map(([sourceId, targetId]) => (
    supabase
      .from('menu_product_sync_links')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('source_menu_id', sourceId)
      .eq('target_menu_id', targetId)
  )));
  const error = results.find((result) => result.error)?.error;
  if (error) throw error;
};

const resolvePublicationPdfUrl = async (row: any) => {
  if (row?.pdf_bucket && row?.pdf_path) {
    return resolveStorageFileUrl(row.pdf_bucket, row.pdf_path);
  }
  if (!row?.pdf_asset_id) return null;
  const urls = await resolveAssetMapForIds(row.workspace_id, [row.pdf_asset_id]);
  return urls.get(row.pdf_asset_id) || null;
};

const getPortablePublicationStorageKey = (menuId: string) => `automenu:portable-publication:${menuId}`;

const readPortablePublication = (menuId: string): MenuPublication | null => {
  try {
    const stored = window.localStorage.getItem(getPortablePublicationStorageKey(menuId));
    if (!stored) return null;
    const publication = JSON.parse(stored) as MenuPublication;
    return publication.menuId === menuId && publication.portableSnapshotUrl ? publication : null;
  } catch {
    return null;
  }
};

const savePortablePublication = (publication: MenuPublication) => {
  try {
    window.localStorage.setItem(getPortablePublicationStorageKey(publication.menuId), JSON.stringify(publication));
  } catch {
    // The public link still works even when local preference storage is unavailable.
  }
};

export const updatePortablePublicationMenuSlug = (publication: MenuPublication, menuSlug: string) => {
  const updated = { ...publication, menuSlug: slugify(menuSlug), updatedAt: new Date().toISOString() };
  savePortablePublication(updated);
  return updated;
};

export const getMenuPublication = async (menuId: string): Promise<MenuPublication | null> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('menu_publications')
    .select('*')
    .eq('menu_id', menuId)
    .maybeSingle();
  if (error && isMissingSchemaObjectError(error, 'menu_publications')) return readPortablePublication(menuId);
  if (error) throw error;
  if (!data) return null;
  return mapPublicationRow(data, await resolvePublicationPdfUrl(data));
};

export const publishWorkspaceMenu = async ({
  workspace,
  menu,
  userId,
  products,
  style,
  sortOption,
  pdfBlob,
  pdfFilename,
  pdfOptions,
}: {
  workspace: Workspace;
  menu: Menu;
  userId: string;
  products: Product[];
  style: MenuStyle;
  sortOption: SortOption;
  pdfBlob: Blob;
  pdfFilename: string;
  pdfOptions: Record<string, unknown>;
}): Promise<MenuPublication> => {
  const supabase = getSupabaseClient();
  const runStep = async <T,>(label: string, action: () => Promise<T>) => {
    try {
      return await action();
    } catch (error) {
      throw new Error(`${label}: ${getErrorMessage(error, 'erro inesperado')}`);
    }
  };
  const releaseId = crypto.randomUUID();
  let publicationTableAvailable = true;
  let existing: MenuPublication | null = null;
  const publicationLookup = await supabase
    .from('menu_publications')
    .select('*')
    .eq('menu_id', menu.id)
    .maybeSingle();
  if (publicationLookup.error && isMissingSchemaObjectError(publicationLookup.error, 'menu_publications')) {
    publicationTableAvailable = false;
    existing = readPortablePublication(menu.id);
  } else if (publicationLookup.error) {
    throw new Error(`Falha ao consultar a publicação: ${getErrorMessage(publicationLookup.error, 'erro inesperado')}`);
  } else {
    existing = publicationLookup.data ? mapPublicationRow(publicationLookup.data) : null;
  }
  const uploaded = await runStep('Falha ao enviar o PDF', () => uploadPublicationPdf({
    workspaceId: workspace.id,
    menuId: menu.id,
    releaseId,
    file: new File([pdfBlob], pdfFilename, { type: 'application/pdf' }),
  }));

  const editorState = createEditorState(style, products.filter((product) => product.isFreeText), sortOption);
  const renderSnapshot = createRenderSnapshot(products, style, sortOption);
  const { versionId } = await runStep('Falha ao criar a versão publicada', () => insertMenuVersionWithRetry({
    menuId: menu.id,
    userId,
    editorState,
    renderSnapshot,
    versionType: 'published',
    actionLabel: 'Cardápio publicado',
  }));
  const contentSignature = getMenuContentSignature(products, style, sortOption);
  const baseSlug = slugify(menu.name);
  const uniqueBaseSlug = `${baseSlug}-${menu.id.slice(0, 8)}`;

  if (!publicationTableAvailable) {
    const now = new Date().toISOString();
    const portableBase: MenuPublication = {
      id: existing?.id || crypto.randomUUID(),
      menuId: menu.id,
      workspaceId: workspace.id,
      restaurantSlug: workspace.slug,
      menuSlug: existing?.menuSlug || uniqueBaseSlug,
      publishedVersionId: versionId,
      pdfAssetId: null,
      pdfBucket: uploaded.bucket,
      pdfPath: uploaded.path,
      pdfUrl: uploaded.url,
      pdfFilename,
      pdfOptions,
      snapshot: renderSnapshot,
      contentSignature,
      portableSnapshotUrl: null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    const portableFile = await runStep('Falha ao criar o link público', () => uploadPortablePublication({
      workspaceId: workspace.id,
      menuId: menu.id,
      releaseId,
      publication: { publication: portableBase },
    }));
    const portablePublication = { ...portableBase, portableSnapshotUrl: portableFile.url };
    const { error: menuUpdateError } = await supabase
      .from('menus')
      .update({ published_version_id: versionId, status: 'published' })
      .eq('id', menu.id);
    if (menuUpdateError) throw new Error(`Falha ao concluir a publicação: ${getErrorMessage(menuUpdateError, 'erro inesperado')}`);
    savePortablePublication(portablePublication);
    return portablePublication;
  }

  const assetIds = collectStyleAssetIds(style);
  collectProductAssetIds(products).forEach((assetId) => assetIds.add(assetId));

  const { error: menuUpdateError } = await supabase
    .from('menus')
    .update({ published_version_id: versionId, status: 'published' })
    .eq('id', menu.id);
  if (menuUpdateError) throw new Error(`Falha ao concluir a publicação: ${getErrorMessage(menuUpdateError, 'erro inesperado')}`);

  let publicationRow: any = null;
  let lastError: any = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const menuSlug = existing?.menuSlug || (attempt === 0 ? uniqueBaseSlug : `${uniqueBaseSlug}-${attempt + 1}`);
    const payload = {
      id: existing?.id || crypto.randomUUID(),
      menu_id: menu.id,
      workspace_id: workspace.id,
      restaurant_slug: workspace.slug,
      menu_slug: menuSlug,
      published_version_id: versionId,
      pdf_asset_id: null,
      pdf_bucket: uploaded.bucket,
      pdf_path: uploaded.path,
      pdf_filename: pdfFilename,
      pdf_options: pdfOptions,
      snapshot: renderSnapshot,
      asset_ids: Array.from(assetIds),
      content_signature: contentSignature,
    };
    const { data, error } = await supabase
      .from('menu_publications')
      .upsert(payload, { onConflict: 'menu_id' })
      .select('*')
      .single();
    if (!error) {
      publicationRow = data;
      break;
    }
    lastError = error;
    if (existing || error.code !== '23505') {
      throw new Error(`Falha ao salvar o link público: ${getErrorMessage(error, 'erro inesperado')}`);
    }
  }
  if (!publicationRow) throw lastError || new Error('Não foi possível criar o link público.');

  return mapPublicationRow(publicationRow, uploaded.url);
};

export const loadPublicMenuPublication = async ({
  restaurantSlug,
  menuSlug,
  portableSnapshotUrl,
}: {
  restaurantSlug: string;
  menuSlug: string;
  portableSnapshotUrl?: string | null;
}) => {
  if (portableSnapshotUrl) {
    const response = await fetch(portableSnapshotUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('O link público expirou ou está indisponível. Publique o cardápio novamente.');
    const payload = await response.json() as { publication?: MenuPublication };
    if (!payload.publication?.pdfUrl || !payload.publication.workspaceId) throw new Error('Publicação inválida.');
    const publication: MenuPublication = {
      ...payload.publication,
      restaurantSlug,
      menuSlug,
      portableSnapshotUrl,
    };
    const snapshot = publication.snapshot || {};
    return {
      publication,
      products: normalizePersistedProducts(snapshot.products),
      style: withStyleDefaults((snapshot.style as MenuStyle | undefined) || INITIAL_STYLE),
      sortOption: (snapshot.sortOption || DEFAULT_SORT_OPTION) as SortOption,
    };
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('menu_publications')
    .select('*')
    .eq('restaurant_slug', restaurantSlug)
    .eq('menu_slug', menuSlug)
    .maybeSingle();
  if (error && isMissingSchemaObjectError(error, 'menu_publications')) return null;
  if (error) throw error;
  if (!data) return null;
  const hydrated = await hydrateSnapshot(data.workspace_id, data.snapshot || {});
  return {
    publication: mapPublicationRow(data, await resolvePublicationPdfUrl(data)),
    ...hydrated,
  };
};

export const updatePublicationMenuSlug = async ({
  publicationId,
  menuSlug,
}: {
  publicationId: string;
  menuSlug: string;
}) => {
  const supabase = getSupabaseClient();
  const normalizedSlug = slugify(menuSlug);
  const { data, error } = await supabase
    .from('menu_publications')
    .update({ menu_slug: normalizedSlug })
    .eq('id', publicationId)
    .select('*')
    .single();
  if (error?.code === '23505') throw new Error('Este endereço já está em uso. Escolha outro nome.');
  if (error) throw error;
  return mapPublicationRow(data, await resolvePublicationPdfUrl(data));
};

export const canEditPublishedMenu = async (workspaceId: string) => {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from('workspace_members')
    .select('workspace_id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);
  if (error) return false;
  return Boolean(count);
};

export const createAiImportJob = async ({
  workspaceId,
  sourceAssetId,
  createdTemplateId,
  createdMenuId,
  normalizedResult,
}: {
  workspaceId: string;
  sourceAssetId: string | null;
  createdTemplateId?: string | null;
  createdMenuId?: string | null;
  normalizedResult: Record<string, unknown>;
}) => {
  const supabase = getSupabaseClient();
  const payload = {
    id: crypto.randomUUID(),
    workspace_id: workspaceId,
    source_asset_id: sourceAssetId,
    status: 'completed',
    provider: 'google',
    model: 'gemini-2.5-flash',
    raw_response: normalizedResult,
    normalized_result: normalizedResult,
    created_template_id: createdTemplateId || null,
    created_menu_id: createdMenuId || null,
  };

  const { error } = await supabase.from('ai_import_jobs').insert(payload);
  if (error) {
    throw error;
  }
};
