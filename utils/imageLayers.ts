import type { AddedImage } from '../types';

const ADDED_IMAGE_DEFAULT_Z_INDEX = 11;
const ADDED_IMAGE_FRONT_BASE_Z_INDEX = 40;
const ADDED_IMAGE_BACK_Z_INDEX = 1;
const ADDED_IMAGE_MIN_FOREGROUND_Z_INDEX = 3;

export const getImageLayerIndexes = (
    images: AddedImage[],
    ids: string[],
    direction: 'front' | 'back'
) => {
    const idSet = new Set(ids);
    const selectedImages = images.filter((image) => idSet.has(image.id));

    if (direction === 'front') {
        const maxZ = Math.max(
            ADDED_IMAGE_FRONT_BASE_Z_INDEX,
            ...images.map((image) => image.zIndex ?? ADDED_IMAGE_DEFAULT_Z_INDEX)
        );
        return new Map(selectedImages.map((image, index) => [image.id, maxZ + index + 1]));
    }

    const nextLayers = new Map<string, number>();
    selectedImages.forEach((image) => nextLayers.set(image.id, ADDED_IMAGE_BACK_Z_INDEX));
    images
        .filter((image) => !idSet.has(image.id))
        .sort((left, right) => (
            (left.zIndex ?? ADDED_IMAGE_DEFAULT_Z_INDEX) - (right.zIndex ?? ADDED_IMAGE_DEFAULT_Z_INDEX)
        ))
        .forEach((image, index) => {
            const minLayer = ADDED_IMAGE_MIN_FOREGROUND_Z_INDEX + index;
            if ((image.zIndex ?? ADDED_IMAGE_DEFAULT_Z_INDEX) < minLayer) {
                nextLayers.set(image.id, minLayer);
            }
        });

    return nextLayers;
};
