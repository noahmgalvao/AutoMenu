import type { AddedImage, MenuStyle } from './model';

export const getImageLayer = (image: AddedImage) =>
    image.repeatAsBackground || (image.zIndex ?? 1) < 3 ? 1 : 3;

export const getContentLayer = (style: MenuStyle) => style.contentLayer === 'front' ? 4 : 2;

export const getFreeTextLayer = (style: MenuStyle, id: string) =>
    style.freeTextBackgrounds?.[id] ? 1 : style.freeTextLayers?.[id] ?? 2;

export const hasForegroundImage = (style: MenuStyle) =>
    style.addedImages?.some(image => getImageLayer(image) === 3) ?? false;

export const getImageLayerIndexes = (images: AddedImage[], ids: string[], direction: 'front' | 'back') => {
    const selected = new Set(ids);
    const target = direction === 'front' ? 3 : 1;
    return new Map(images.filter(image => selected.has(image.id) && !image.repeatAsBackground && getImageLayer(image) !== target)
        .map(image => [image.id, target]));
};

export function canMoveImageLayer(images: AddedImage[], ids: string[], direction: 'front' | 'back') {
    return getImageLayerIndexes(images, ids, direction).size > 0;
}
