import type { FontSizeLimitKey, MenuStyle, Product } from '../../../domain/menu/model';
import { clampFontSize, clampPhotoScale, MAX_PHOTO_SCALE, MIN_PHOTO_SCALE, resolveFontSizeLimits, resolveMinimumFontSize } from '../../../domain/menu/styleRules';
import type { CanvasScaleTarget } from './CanvasTransformHandles';

type PhotoScaleField = 'imageScale' | 'categoryImageScale';
type ScaleChange = {
    style?: Pick<MenuStyle, 'elementStyles' | PhotoScaleField>;
    products?: Map<string, Pick<Product, 'styles' | 'freeTextWidth'>>;
};

const defaultSize: Record<FontSizeLimitKey, number> = {
    menuTitle: 48, menuSubtitle: 18, category: 24, productName: 18, productDescription: 14, productPrice: 18, freeText: 18,
};

export function captureCanvasObjectScale(style: MenuStyle, target: CanvasScaleTarget, products: Product[], width: number) {
    const selected = products.filter(product => !style.hiddenProductIds.includes(product.id)
        && (target.type === 'category' ? product.category === target.id : product.id === target.id));
    const regular = selected.filter(product => !product.isFreeText);
    const freeTexts = selected.filter(product => product.isFreeText);
    const fields: Exclude<FontSizeLimitKey, 'freeText'>[] = [];
    const photos: PhotoScaleField[] = [];

    if (target.headingFields) fields.push(...target.headingFields);
    if (target.type === 'category') {
        fields.push('category');
        if (style.showCategoryImages !== false && style.categoryImages?.[target.id]?.url) photos.push('categoryImageScale');
    }
    if (regular.length && (target.type === 'category' || target.type === 'product')) {
        fields.push('productName');
        if (regular.some(product => product.description?.trim())) fields.push('productDescription');
        if (style.showPrices !== false) fields.push('productPrice');
        if (style.showImages && regular.some(product => product.image)) photos.push('imageScale');
    }

    const minimum = resolveMinimumFontSize(style);
    const maximum = resolveFontSizeLimits(style);
    const sharedSizes = fields.map(field => ({
        field, size: clampFontSize(style, field, style.elementStyles?.[field]?.fontSize, defaultSize[field]),
    }));
    const localSizes = freeTexts.map(product => ({
        product, field: 'freeText' as const,
        size: clampFontSize(style, 'freeText', (product.styles || style.elementStyles?.productName)?.fontSize, defaultSize.freeText),
    }));
    const photoSizes = photos.map(field => ({ field, size: clampPhotoScale(style[field] || 1) }));
    const allTextSizes = [...sharedSizes, ...localSizes];
    const minFactor = Math.max(...allTextSizes.map(({ size }) => minimum / size),
        ...photoSizes.map(({ size }) => MIN_PHOTO_SCALE / size));
    const maxFactor = Math.min(...allTextSizes.map(({ field, size }) => Math.max(minimum, maximum[field]) / size),
        ...photoSizes.map(({ size }) => MAX_PHOTO_SCALE / size));

    return (requestedFactor: number): ScaleChange | undefined => {
        const factor = Math.max(minFactor, Math.min(maxFactor, requestedFactor));
        if (!Number.isFinite(factor) || Math.abs(1 - factor) < .001) return undefined;
        const elementStyles = { ...style.elementStyles };
        for (const { field, size } of sharedSizes) {
            elementStyles[field] = { ...elementStyles[field], fontSize: clampFontSize(style, field, size * factor, size) };
        }
        const photoChanges = Object.fromEntries(photoSizes.map(({ field, size }) => [
            field, clampPhotoScale(Math.round(size * factor * 1000) / 1000),
        ]));
        const productChanges = new Map(localSizes.map(({ product, size }) => [
            product.id, {
                styles: { ...(product.styles || style.elementStyles?.productName), fontSize: clampFontSize(style, 'freeText', size * factor, size) },
                freeTextWidth: product.freeTextWidth || (target.type === 'freeText' ? width : undefined),
            },
        ]));
        return {
            style: fields.length || photos.length ? { elementStyles, ...photoChanges } : undefined,
            products: productChanges.size ? productChanges : undefined,
        };
    };
}
