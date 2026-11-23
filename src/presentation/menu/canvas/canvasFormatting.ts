import { getItemFormattingStyle } from '../../../domain/menu/itemFormatting';
import { applyCanvasShapeParameters, getCanvasShapeParameters, type CanvasShapeParameters } from '../../../domain/menu/canvasShapes';
import type { CategoryDividerStyle, ElementStyle, MenuBorder, MenuMarker, MenuStyle, Product } from '../../../domain/menu/model';
import { getBorderConfiguration, getMarker, getSurfaceFill, withSurfaceFill } from '../designer/Decorations';
import { resolveCategoryDivider, resolveProductDivider } from './categoryDividers';

export type FormatObject = {
    type: 'category' | 'product' | 'freeText' | 'addedImage' | 'menuTitle' | 'menuSubtitle';
    id: string;
};

type ProductFormat = Pick<MenuStyle, 'productCardShape' | 'productImageFrame'>
    & Pick<MenuStyle['elementStyles'], 'productPrice' | 'productDescription'> & {
    priceFill?: string;
    photoFill?: string;
    priceBorder: MenuBorder;
    photoBorder: MenuBorder;
    photoFlips?: NonNullable<MenuStyle['productImageFlips']>[string];
};

export type CanvasFormat =
    | { type: 'addedImage'; width: number; flipHorizontal?: boolean; flipVertical?: boolean; shape?: CanvasShapeParameters }
    | { type: 'text'; text: ElementStyle; border: MenuBorder; fill?: string; groupFill?: string; marker?: MenuMarker; divider?: CategoryDividerStyle;
        groupBorder?: MenuBorder; product?: ProductFormat; freeTextWidth?: number };

const copyBorder = (border: MenuBorder): MenuBorder => ({ ...border, sides: [...border.sides] });

export function captureCanvasFormat(source: FormatObject, style: MenuStyle, products: Product[]): CanvasFormat | null {
    const { type, id } = source;
    if (type === 'addedImage') {
        const image = style.addedImages?.find(item => item.id === id);
        return image ? {
            type, width: image.width, flipHorizontal: image.flipHorizontal, flipVertical: image.flipVertical,
            shape: image.shape && getCanvasShapeParameters(image.shape),
        } : null;
    }

    if (type === 'category' || type === 'product') style = getItemFormattingStyle(style, type, id);
    const product = products.find(item => item.id === id);
    const borderScope = type === 'menuTitle' || type === 'menuSubtitle' ? 'header' : type;
    const fill = getSurfaceFill(style, borderScope, id);
    const border = copyBorder(getBorderConfiguration(style, borderScope, id));
    const textStyle = type === 'freeText' ? product?.styles ?? style.elementStyles.productName
        : style.elementStyles[type === 'product' ? 'productName' : type];
    const text = {
        fontFamily: style.fontFamily,
        color: borderScope === 'header' || type === 'category' ? style.primaryColor : style.textColor,
        ...textStyle,
    };

    if (type === 'category') return {
        type: 'text', text, border, fill, marker: getMarker(style, 'category'), divider: resolveCategoryDivider(style, id),
        groupFill: getSurfaceFill(style, 'categoryGroup'),
        groupBorder: copyBorder(getBorderConfiguration(style, 'categoryGroup')),
    };
    if (type === 'product') return {
        type: 'text', text, border, fill, marker: getMarker(style, 'product'), divider: resolveProductDivider(style, id),
        product: {
            productPrice: { ...style.elementStyles.productPrice },
            productDescription: { ...style.elementStyles.productDescription },
            priceFill: getSurfaceFill(style, 'price'), photoFill: getSurfaceFill(style, 'productImage'),
            priceBorder: copyBorder(getBorderConfiguration(style, 'price')),
            photoBorder: copyBorder(getBorderConfiguration(style, 'productImage')),
            productCardShape: style.productCardShape,
            productImageFrame: style.productImageFrame,
            photoFlips: style.productImageFlips?.[id] && { ...style.productImageFlips[id] },
        },
    };
    return { type: 'text', text, border, fill, freeTextWidth: type === 'freeText' ? product?.freeTextWidth : undefined };
}

export const acceptsCanvasFormat = (format: CanvasFormat, target: FormatObject) =>
    (format.type === 'addedImage') === (target.type === 'addedImage');

export function applyCanvasFormat(style: MenuStyle, format: CanvasFormat, targets: FormatObject[]): MenuStyle {
    if (format.type === 'addedImage') {
        const ids = new Set(targets.map(target => target.id));
        return {
            ...style, name: 'Custom',
            addedImages: style.addedImages?.map(image => {
                if (!ids.has(image.id)) return image;
                const updated = { ...image, width: format.width, flipHorizontal: format.flipHorizontal, flipVertical: format.flipVertical };
                return format.shape ? applyCanvasShapeParameters(updated, format.shape) : updated;
            }),
        };
    }

    const next = { ...style, name: 'Custom', elementStyles: { ...style.elementStyles }, borders: { ...style.borders } };
    for (const { type, id } of targets) {
        if (type === 'addedImage') continue;
        const scope = type === 'menuTitle' || type === 'menuSubtitle' ? 'header' : type;
        Object.assign(next, withSurfaceFill(next, scope, id, format.fill));
        if (type === 'freeText') {
            next.freeTextBorders = { ...next.freeTextBorders, [id]: copyBorder(format.border) };
            continue;
        }

        const key = type === 'product' ? 'productName' : type;
        next.elementStyles[key] = { ...format.text };
        next.elementColorOverrides = { ...next.elementColorOverrides, [key]: true };
        if (type === 'menuTitle' || type === 'menuSubtitle') {
            next.borders.header = copyBorder(format.border);
            continue;
        }

        next.borders[type] = copyBorder(type === 'product' && !format.border.sides.length && format.groupBorder?.sides.length
            ? format.groupBorder : format.border);
        if (format.marker) next.markers = { ...next.markers, [type]: format.marker };
        if (type === 'category') {
            if (format.divider) next.categoryDividerStyles = { ...next.categoryDividerStyles, [id]: format.divider };
            if (format.groupBorder) {
                next.borders.categoryGroup = copyBorder(format.groupBorder);
                next.fills = { ...next.fills, categoryGroup: format.groupFill };
            }
        } else {
            if (format.divider) next.productDividerStyle = format.divider;
            if (!format.product) continue;
            const { productPrice, productDescription, priceBorder, photoBorder, photoFlips, productCardShape, productImageFrame } = format.product;
            next.elementStyles.productPrice = { ...productPrice };
            next.elementStyles.productDescription = { ...productDescription };
            next.fills = { ...next.fills, price: format.product.priceFill, productImage: format.product.photoFill };
            next.borders.price = copyBorder(priceBorder);
            next.borders.productImage = copyBorder(photoBorder);
            next.productCardShape = productCardShape;
            next.productImageFrame = productImageFrame;
            next.productImageFlips = { ...next.productImageFlips, [id]: { ...photoFlips } };
        }
    }
    return next;
}
