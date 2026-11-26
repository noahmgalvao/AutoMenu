import type { FontSizeLimitKey, MenuStyle, Product } from '../../../domain/menu/model';
import { clampFontSize, clampPhotoScale, MIN_PHOTO_SCALE, MAX_PHOTO_SCALE, resolveMinimumFontSize, resolveFontSizeLimits } from '../../../domain/menu/styleRules';
import type { SelectionItem } from '../interactions/types';
import type { CanvasScaleTarget } from './CanvasTransformHandles';

type PhotoScaleField = 'imageScale' | 'categoryImageScale';
type ScaleChange = {
    style?: Pick<MenuStyle, 'elementStyles' | PhotoScaleField>;
    products?: Map<string, Pick<Product, 'styles' | 'freeTextWidth'>>;
};

const defaultSize: Record<FontSizeLimitKey, number> = {
    menuTitle: 48, menuSubtitle: 18, category: 24, productName: 18, productDescription: 14, productPrice: 18, freeText: 18,
};

export function captureCanvasObjectScale(style: MenuStyle, target: CanvasScaleTarget, products: Product[], width: number, onLimit?: () => void,
    selection: readonly SelectionItem[] = [target],
) {
    const categories = new Set(selection.filter(item => item.type === 'category').map(item => item.id));
    const productIds = new Set(selection.filter(item => item.type === 'product' || item.type === 'freeText').map(item => item.id));
    const selected = products.filter(product => !style.hiddenProductIds.includes(product.id)
        && (categories.has(product.category) || productIds.has(product.id)));
    const regular = selected.filter(product => !product.isFreeText);
    const freeTexts = selected.filter(product => product.isFreeText);
    const fields: Exclude<FontSizeLimitKey, 'freeText'>[] = [];
    const photos: PhotoScaleField[] = [];

    if (target.headingFields) fields.push(...target.headingFields);
    if (categories.size) {
        fields.push('category');
        if (style.showCategoryImages !== false && [...categories].some(id => style.categoryImages?.[id]?.url)) photos.push('categoryImageScale');
    }
    if (regular.length) {
        fields.push('productName');
        if (regular.some(product => product.description?.trim())) fields.push('productDescription');
        if (style.showPrices !== false) fields.push('productPrice');
        if (style.showImages && regular.some(product => product.image)) photos.push('imageScale');
    }

    const sharedSizes = fields.map(field => ({
        field, size: clampFontSize(style, field, style.elementStyles?.[field]?.fontSize, defaultSize[field]),
    }));
    const localSizes = freeTexts.map(product => ({
        product,
        size: clampFontSize(style, 'freeText', (product.styles || style.elementStyles?.productName)?.fontSize, defaultSize.freeText),
    }));
    const photoSizes = photos.map(field => ({ field, size: clampPhotoScale(style[field] || 1) }));

    const minimumFont = resolveMinimumFontSize(style);
    const fontLimits = resolveFontSizeLimits(style);
    const fontSizes = [...sharedSizes, ...localSizes.map(item => ({ field: 'freeText' as const, size: item.size }))];
    const minimum = Math.min(...fontSizes.map(({ size }) => minimumFont / size), ...photoSizes.map(({ size }) => MIN_PHOTO_SCALE / size));
    const maximum = Math.max(...fontSizes.map(({ field, size }) => Math.max(minimumFont, fontLimits[field]) / size),
        ...photoSizes.map(({ size }) => MAX_PHOTO_SCALE / size));
    let pastLimit = false;

    return (factor: number): ScaleChange | undefined => {
        if (!Number.isFinite(factor)) return undefined;
        factor = Math.max(0, factor);
        const limited = minimum <= maximum && factor !== 1 && (factor <= minimum || factor >= maximum);
        if (limited && !pastLimit) onLimit?.();
        pastLimit = limited;
        if (factor === 1) return undefined;

        const elementStyles = { ...style.elementStyles };
        let changesStyle = false;
        for (const { field, size } of sharedSizes) {
            const fontSize = clampFontSize(style, field, size * factor, size);
            if (fontSize === size) continue;
            elementStyles[field] = { ...elementStyles[field], fontSize };
            changesStyle = true;
        }

        const photoChanges: Partial<Record<PhotoScaleField, number>> = {};
        for (const { field, size } of photoSizes) {
            const nextSize = clampPhotoScale(Math.round(size * factor * 1000) / 1000);
            if (nextSize === size) continue;
            photoChanges[field] = nextSize;
            changesStyle = true;
        }

        const productChanges = new Map<string, Pick<Product, 'styles' | 'freeTextWidth'>>();
        for (const { product, size } of localSizes) {
            const fontSize = clampFontSize(style, 'freeText', size * factor, size);
            if (fontSize === size) continue;
            productChanges.set(product.id, {
                styles: { ...(product.styles || style.elementStyles?.productName), fontSize },
                freeTextWidth: product.freeTextWidth || (target.type === 'freeText' ? width : undefined),
            });
        }

        if (!changesStyle && !productChanges.size) return undefined;
        return {
            style: changesStyle ? { elementStyles, ...photoChanges } : undefined,
            products: productChanges.size ? productChanges : undefined,
        };
    };
}
