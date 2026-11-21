import type { SortOption, Product, MenuStyle } from '../../domain/menu/model';
import type { WorkspaceBootstrapData, MenuEditorState } from '../../domain/workspace/model';
import { PRESET_TEMPLATES, createClassicMenuStyle } from '../../domain/menu/defaults';
import { FREE_TEXT_PREFIX } from '../../domain/menu/flow';
import { roundPrice, resolvePriceCurrencySymbol, resolvePriceDecimalPlaces, resolvePriceDecimalSeparator } from '../../domain/menu/price';
import { roundFontSize, resolveFontSizeLimits, resolveMinimumFontSize, clampPhotoScale } from '../../domain/menu/styleRules';
import { normalizeTemplateDesign } from '../../domain/templates/templateDesign';
import { normalizeMenuPageSetup } from '../../domain/menu/pageSetup';

export const DEFAULT_SORT_OPTION: SortOption = { field: 'name', direction: 'asc' };

export const PRESET_TEMPLATE_IDS = new Set(PRESET_TEMPLATES.map((template) => template.id));

export const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export const isRecord = (value: unknown): value is Record<string, any> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export const normalizePersistedProducts = (value: unknown): Product[] => {
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
        freeTextWidth: isFreeText && Number.isFinite(Number(product.freeTextWidth))
          ? Math.max(36, Math.min(2000, Number(product.freeTextWidth)))
          : undefined,
        styles: isRecord(product.styles) && Number.isFinite(Number(product.styles.fontSize))
          ? { ...product.styles, fontSize: roundFontSize(product.styles.fontSize) }
          : product.styles,
      } satisfies Product;
    });
};

export const slugify = (value: string) => {
  const sanitized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || `item-${crypto.randomUUID().slice(0, 8)}`;
};

export const withStyleDefaults = (style: MenuStyle | null | undefined): MenuStyle => {
  const base = createClassicMenuStyle();
  const source = isRecord(style) ? style as Partial<MenuStyle> : {};
  const layoutMode = source.layoutMode === 'grid' && !source.design ? 'cards' : source.layoutMode || base.layoutMode;
  const stringArray = (value: unknown) => (
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  );
  const customProductOrder = isRecord(source.customProductOrder)
    ? Object.fromEntries(
        Object.entries(source.customProductOrder).map(([category, ids]) => [category, stringArray(ids)])
      )
    : {};
  const withRoundedFontSize = (baseStyle: Record<string, any> | undefined, sourceStyle: Record<string, any> | undefined) => {
    const merged = { ...(isRecord(sourceStyle) ? sourceStyle : baseStyle || {}) };
    return Number.isFinite(Number(merged.fontSize))
      ? { ...merged, fontSize: roundFontSize(merged.fontSize) }
      : merged;
  };

  return {
    ...base,
    ...source,
    layoutMode,
    appliedTemplateId: style ? source.appliedTemplateId : base.appliedTemplateId,
    splitCategoryAcrossPages: style ? source.splitCategoryAcrossPages : base.splitCategoryAcrossPages,
    productsCanChangeCategory: style ? source.productsCanChangeCategory : base.productsCanChangeCategory,
    margins: source.margins ?? (style ? undefined : base.margins),
    design: normalizeTemplateDesign(source.design),
    catalogMetadata: source.catalogMetadata,
    templateVersionId: source.templateVersionId,
    cardBackgroundColor: typeof source.cardBackgroundColor === 'string' ? source.cardBackgroundColor : base.cardBackgroundColor,
    hiddenProductIds: stringArray(source.hiddenProductIds),
    customCategoryOrder: stringArray(source.customCategoryOrder),
    customProductOrder,
    manualProductOrder: source.manualProductOrder === true || undefined,
    categoryPlacements: isRecord(source.categoryPlacements)
      ? source.categoryPlacements as MenuStyle['categoryPlacements']
      : {},
    floatingText: Array.isArray(source.floatingText) ? source.floatingText.filter(isRecord) as any : [],
    addedImages: Array.isArray(source.addedImages) ? source.addedImages.filter(isRecord) as any : [],
    categoryImages: isRecord(source.categoryImages)
      ? Object.fromEntries(Object.entries(source.categoryImages).filter(([, image]) => isRecord(image))) as MenuStyle['categoryImages']
      : {},
    pageBackgrounds: Array.isArray(source.pageBackgrounds) ? source.pageBackgrounds.filter(isRecord) as any : [],
    menuBackgroundPhoto: isRecord(source.menuBackgroundPhoto) && typeof source.menuBackgroundPhoto.url === 'string'
      && source.menuBackgroundPhoto.url ? source.menuBackgroundPhoto : undefined,
    pageBreaks: stringArray(source.pageBreaks),
    pageSetup: normalizeMenuPageSetup(source.pageSetup),
    fontSizeLimits: {
      ...resolveFontSizeLimits({ ...base, ...source } as MenuStyle),
      ...(!source.revisedFontSizeDefaults && source.fontSizeLimits?.productDescription === 30 ? { productDescription: 35 } : {}),
      ...(!source.revisedFontSizeDefaults && source.fontSizeLimits?.freeText === 50 ? { freeText: 70 } : {}),
    },
    revisedFontSizeDefaults: true,
    minimumFontSize: resolveMinimumFontSize({ ...base, ...source } as MenuStyle),
    allowSameWordBreak: source.allowSameWordBreak === true,
    priceDecimalPlaces: resolvePriceDecimalPlaces(source.priceDecimalPlaces),
    priceDecimalSeparator: resolvePriceDecimalSeparator(source.priceDecimalSeparator),
    priceCurrencySymbol: resolvePriceCurrencySymbol(source.priceCurrencySymbol),
    showPrices: source.showPrices !== false,
    showCurrencySymbol: source.showCurrencySymbol !== false,
    showPageNumbers: source.showPageNumbers !== false,
    showCategoryImages: source.showCategoryImages !== false,
    categoryImageScale: clampPhotoScale(
      [source.categoryImageScale, source.imageScale, base.imageScale]
        .map(value => Number(value ?? NaN)).find(Number.isFinite) ?? 1
    ),
    contentSpacing: source.contentSpacing ?? (style ? undefined : base.contentSpacing),
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

export const assignTemplateMetadata = (templates: MenuStyle[]) =>
  templates.filter(isRecord).map((template) => {
    const isSystem = template.scope ? template.scope === 'system' : PRESET_TEMPLATE_IDS.has(template.id);
    return withStyleDefaults({
      ...template,
      scope: template.scope || (isSystem ? 'system' : 'workspace'),
      sourceType: template.sourceType || (isSystem ? 'preset' : 'user'),
      isLocked: template.isLocked ?? isSystem,
    });
  });

export const assignCategoryIds = (products: Product[]) => {
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

export const mergeTemplates = (workspaceTemplates: MenuStyle[], systemTemplates: MenuStyle[]) => {
  const localSystemTemplates = assignTemplateMetadata(cloneJson(PRESET_TEMPLATES));
  const remoteById = new Map(systemTemplates.map((template) => [template.id, template]));
  const resolvedSystemTemplates = localSystemTemplates.map((template) => {
    const remote = remoteById.get(template.id);
    return remote && remote.templateVersionId === template.templateVersionId && remote.catalogMetadata
      ? { ...template, catalogMetadata: remote.catalogMetadata }
      : template;
  });
  const workspaceIds = new Set(workspaceTemplates.map((template) => template.id));

  return [
    ...workspaceTemplates,
    ...resolvedSystemTemplates.filter((template) => !workspaceIds.has(template.id)),
  ];
};

export const createRenderSnapshot = (products: Product[], style: MenuStyle, sortOption: SortOption) => ({
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

export const createEditorState = (style: MenuStyle, freeTextProducts: Product[], sortOption: SortOption): MenuEditorState => ({
  style,
  freeTextProducts,
  sortOption,
});

export const describeRevisionChange = (previousSnapshot: Record<string, any> | null, nextSnapshot: Record<string, any>) => {
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

export const productComparisonSignature = (products: Product[]) => JSON.stringify(
  canonicalizeMenuValue(products.filter((product) => !product.isFreeText).sort((left, right) => left.id.localeCompare(right.id))),
);


export function withMenuRuleFallback(style: MenuStyle, legacy?: Pick<MenuStyle, 'splitCategoryAcrossPages' | 'productsCanChangeCategory'>): MenuStyle {
  return {
    ...style,
    splitCategoryAcrossPages: style.splitCategoryAcrossPages ?? legacy?.splitCategoryAcrossPages ?? false,
    productsCanChangeCategory: style.productsCanChangeCategory ?? legacy?.productsCanChangeCategory ?? false,
  };
}
