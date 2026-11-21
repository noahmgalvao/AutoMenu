import { INITIAL_STYLE } from '../../domain/menu/defaults';
import type { MenuStyle } from '../../domain/menu/model';
import { resolveMenuPageDimensions } from '../../domain/menu/pageSetup';

const portableKeys = [
  'design', 'fontFamily', 'primaryColor', 'backgroundColor', 'textColor', 'backgroundImage', 'backgroundAssetId',
  'miniFoodTextureColor', 'miniFoodTextureScale', 'templateBackgroundFit', 'templateDecoration',
  'templateHeadingVisibility', 'productPhotoAlignmentDefault', 'categoryPhotoAlignmentDefault', 'categoryPhotoRatio', 'productPhotoRatio',
  'layoutMode', 'showImages', 'showCategoryImages', 'imageScale', 'categoryImageScale', 'productImageFrame',
  'productCardShape', 'cardBackgroundColor', 'cardBackgroundColorOverride', 'columnCount', 'categoryColumnCount',
  'categoryColumnWidths', 'pageSetup', 'pagePadding', 'margins', 'contentSpacing', 'itemGap', 'globalRadius',
  'borders', 'fills', 'markers', 'productDividerStyle', 'categoryDividerStyle', 'textContrastFills',
  'fontSizeLimits', 'minimumFontSize', 'revisedFontSizeDefaults', 'allowSameWordBreak', 'splitCategoryAcrossPages',
  'productsCanChangeCategory', 'priceDecimalPlaces', 'priceDecimalSeparator', 'priceCurrencySymbol', 'showPrices',
  'showCurrencySymbol', 'showPageNumbers', 'elementStyles', 'elementColorOverrides', 'contentLayer',
] as const satisfies readonly (keyof MenuStyle)[];

const contrastRoles = new Set(['menuTitle', 'menuSubtitle', 'category', 'productName', 'productDescription', 'productPrice']);

export function projectTemplateStyle(style: MenuStyle) {
  const portable = Object.fromEntries(portableKeys.map(key => [key, style[key]])) as Pick<MenuStyle, typeof portableKeys[number]>;
  portable.textContrastFills = style.textContrastFills && Object.fromEntries(
    Object.entries(style.textContrastFills).filter(([key]) => contrastRoles.has(key)),
  );
  return structuredClone(portable);
}

export function createWorkspaceTemplate(style: MenuStyle, menuName: string, name: string, description: string, id: string): MenuStyle {
  const portable = projectTemplateStyle(style);
  const dimensions = resolveMenuPageDimensions(style);
  const decorations = (style.addedImages || []).flatMap(image => {
    if (!image.repeatAsBackground || !image.shape) return [];
    const { text: _text, ...shape } = image.shape;
    return [{ shape, x: image.x / dimensions.widthPx, y: image.y / dimensions.heightPx, width: image.width / dimensions.widthPx }];
  });
  if (style.menuBackgroundPhoto?.assetId) {
    portable.backgroundAssetId = style.menuBackgroundPhoto.assetId;
    portable.backgroundImage = style.menuBackgroundPhoto.url;
    portable.templateBackgroundFit = 'fill';
  } else if (portable.backgroundImage?.includes('/object/sign/') && !portable.backgroundAssetId) {
    portable.backgroundImage = undefined;
  }
  return {
    ...portable, id, name: name.trim() || (menuName.trim() ? `Modelo de ${menuName.trim()}` : 'Meu modelo'),
    templateDescription: description.trim() || undefined,
    scope: 'workspace', sourceType: 'user', isLocked: false, templateVersionId: `${id}::v1`,
    menuTitle: '', menuSubtitle: '', hiddenProductIds: [],
    splitCategoryAcrossPages: portable.splitCategoryAcrossPages ?? INITIAL_STYLE.splitCategoryAcrossPages,
    productsCanChangeCategory: portable.productsCanChangeCategory ?? INITIAL_STYLE.productsCanChangeCategory,
    templateDecoration: [...(portable.templateDecoration || []), ...decorations],
  };
}
