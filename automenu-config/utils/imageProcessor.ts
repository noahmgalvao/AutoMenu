import type {
    BoundingBox,
    ExtractedImage,
    MenuCategory,
} from '../types';

const MIN_ERASE_PADDING = 32;
const MAX_ERASE_PADDING = 72;
const SPATIAL_ROW_TOLERANCE = 30;

type CanvasImageSourceInput = File | string;
type SpatialElement = { boundingBox?: BoundingBox };

const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:\/\//i.test(src)) {
        image.crossOrigin = 'anonymous';
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível carregar a imagem.'));
    image.src = src;
});

const withImageSource = async <T>(
    source: CanvasImageSourceInput,
    operation: (src: string) => Promise<T>,
): Promise<T> => {
    if (typeof source === 'string') {
        return operation(source);
    }

    const objectUrl = URL.createObjectURL(source);
    try {
        return await operation(objectUrl);
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
};

const clampBoundingBox = (
    box: BoundingBox,
    imageWidth: number,
    imageHeight: number,
    padding = 0,
): BoundingBox | null => {
    const rawX = Number(box?.x);
    const rawY = Number(box?.y);
    const rawWidth = Number(box?.width);
    const rawHeight = Number(box?.height);

    if (
        ![rawX, rawY, rawWidth, rawHeight].every(Number.isFinite)
        || rawWidth <= 0
        || rawHeight <= 0
    ) {
        return null;
    }

    const left = Math.max(0, Math.floor(rawX - padding));
    const top = Math.max(0, Math.floor(rawY - padding));
    const right = Math.min(imageWidth, Math.ceil(rawX + rawWidth + padding));
    const bottom = Math.min(imageHeight, Math.ceil(rawY + rawHeight + padding));

    if (right <= left || bottom <= top) {
        return null;
    }

    return {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
    };
};

const getErasePadding = (box: BoundingBox) => Math.max(
    MIN_ERASE_PADDING,
    Math.min(
        MAX_ERASE_PADDING,
        Math.round(Math.max(Number(box.width) || 0, Number(box.height) || 0) * 0.11),
    ),
);

const boxesTouchOrOverlap = (left: BoundingBox, right: BoundingBox) => (
    left.x <= right.x + right.width
    && left.x + left.width >= right.x
    && left.y <= right.y + right.height
    && left.y + left.height >= right.y
);

const mergeOverlappingBoxes = (boxes: BoundingBox[]): BoundingBox[] => {
    const merged: BoundingBox[] = [];

    boxes.forEach((candidate) => {
        let next = { ...candidate };
        let mergedExisting = true;

        while (mergedExisting) {
            mergedExisting = false;
            for (let index = merged.length - 1; index >= 0; index -= 1) {
                const current = merged[index];
                if (!boxesTouchOrOverlap(current, next)) continue;

                const left = Math.min(current.x, next.x);
                const top = Math.min(current.y, next.y);
                const right = Math.max(current.x + current.width, next.x + next.width);
                const bottom = Math.max(current.y + current.height, next.y + next.height);
                next = {
                    x: left,
                    y: top,
                    width: right - left,
                    height: bottom - top,
                };
                merged.splice(index, 1);
                mergedExisting = true;
            }
        }

        merged.push(next);
    });

    return merged;
};

const createRemovalMask = (
    imageWidth: number,
    imageHeight: number,
    boxes: BoundingBox[],
): Uint8Array => {
    const mask = new Uint8Array(imageWidth * imageHeight);

    boxes.forEach((box) => {
        const left = Math.max(0, box.x);
        const top = Math.max(0, box.y);
        const right = Math.min(imageWidth, box.x + box.width);
        const bottom = Math.min(imageHeight, box.y + box.height);

        for (let y = top; y < bottom; y += 1) {
            mask.fill(1, (y * imageWidth) + left, (y * imageWidth) + right);
        }
    });

    return mask;
};

const getDominantUnmaskedColor = (
    pixels: Uint8ClampedArray,
    removalMask: Uint8Array,
) => {
    const histogram = new Uint32Array(4096);
    for (let pixelIndex = 0; pixelIndex < removalMask.length; pixelIndex += 1) {
        if (removalMask[pixelIndex] === 1) continue;
        const offset = pixelIndex * 4;
        const key = ((pixels[offset] >> 4) << 8)
            | ((pixels[offset + 1] >> 4) << 4)
            | (pixels[offset + 2] >> 4);
        histogram[key] += 1;
    }

    let dominantKey = 0;
    for (let key = 1; key < histogram.length; key += 1) {
        if (histogram[key] > histogram[dominantKey]) dominantKey = key;
    }

    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 0;
    let count = 0;
    for (let pixelIndex = 0; pixelIndex < removalMask.length; pixelIndex += 1) {
        if (removalMask[pixelIndex] === 1) continue;
        const offset = pixelIndex * 4;
        const key = ((pixels[offset] >> 4) << 8)
            | ((pixels[offset + 1] >> 4) << 4)
            | (pixels[offset + 2] >> 4);
        if (key !== dominantKey) continue;
        red += pixels[offset];
        green += pixels[offset + 1];
        blue += pixels[offset + 2];
        alpha += pixels[offset + 3];
        count += 1;
    }

    const divisor = Math.max(1, count);
    return [
        Math.round(red / divisor),
        Math.round(green / divisor),
        Math.round(blue / divisor),
        Math.round(alpha / divisor) || 255,
    ] as const;
};

const fillRemovalMask = (
    sourcePixels: Uint8ClampedArray,
    removalMask: Uint8Array,
    imageWidth: number,
    imageHeight: number,
) => {
    const outputPixels = new Uint8ClampedArray(sourcePixels);
    const pixelCount = imageWidth * imageHeight;
    const known = new Uint8Array(pixelCount);
    const queued = new Uint8Array(pixelCount);
    let removalCount = 0;

    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
        if (removalMask[pixelIndex] === 0) {
            known[pixelIndex] = 1;
        } else {
            removalCount += 1;
        }
    }
    if (removalCount === 0) return outputPixels;

    const visitNeighbors = (
        pixelIndex: number,
        visitor: (neighborIndex: number) => void,
    ) => {
        const x = pixelIndex % imageWidth;
        const y = Math.floor(pixelIndex / imageWidth);
        const minimumX = Math.max(0, x - 1);
        const maximumX = Math.min(imageWidth - 1, x + 1);
        const minimumY = Math.max(0, y - 1);
        const maximumY = Math.min(imageHeight - 1, y + 1);

        for (let neighborY = minimumY; neighborY <= maximumY; neighborY += 1) {
            for (let neighborX = minimumX; neighborX <= maximumX; neighborX += 1) {
                if (neighborX === x && neighborY === y) continue;
                visitor((neighborY * imageWidth) + neighborX);
            }
        }
    };

    let frontier: number[] = [];
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
        if (removalMask[pixelIndex] === 0) continue;
        let touchesKnownPixel = false;
        visitNeighbors(pixelIndex, (neighborIndex) => {
            if (known[neighborIndex] === 1) touchesKnownPixel = true;
        });
        if (touchesKnownPixel) {
            queued[pixelIndex] = 1;
            frontier.push(pixelIndex);
        }
    }

    let filledCount = 0;
    while (frontier.length > 0) {
        frontier.forEach((pixelIndex) => {
            let red = 0;
            let green = 0;
            let blue = 0;
            let alpha = 0;
            let count = 0;

            visitNeighbors(pixelIndex, (neighborIndex) => {
                if (known[neighborIndex] === 0) return;
                const offset = neighborIndex * 4;
                red += outputPixels[offset];
                green += outputPixels[offset + 1];
                blue += outputPixels[offset + 2];
                alpha += outputPixels[offset + 3];
                count += 1;
            });

            if (count === 0) return;
            const offset = pixelIndex * 4;
            outputPixels[offset] = Math.round(red / count);
            outputPixels[offset + 1] = Math.round(green / count);
            outputPixels[offset + 2] = Math.round(blue / count);
            outputPixels[offset + 3] = Math.round(alpha / count);
        });

        frontier.forEach((pixelIndex) => {
            known[pixelIndex] = 1;
            filledCount += 1;
        });

        const nextFrontier: number[] = [];
        frontier.forEach((pixelIndex) => {
            visitNeighbors(pixelIndex, (neighborIndex) => {
                if (
                    removalMask[neighborIndex] === 0
                    || known[neighborIndex] === 1
                    || queued[neighborIndex] === 1
                ) {
                    return;
                }
                queued[neighborIndex] = 1;
                nextFrontier.push(neighborIndex);
            });
        });
        frontier = nextFrontier;
    }

    if (filledCount < removalCount) {
        const fallbackColor = getDominantUnmaskedColor(sourcePixels, removalMask);
        for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
            if (removalMask[pixelIndex] === 0 || known[pixelIndex] === 1) continue;
            const offset = pixelIndex * 4;
            outputPixels[offset] = fallbackColor[0];
            outputPixels[offset + 1] = fallbackColor[1];
            outputPixels[offset + 2] = fallbackColor[2];
            outputPixels[offset + 3] = fallbackColor[3];
        }
    }

    return outputPixels;
};

const smoothFilledRegions = (
    pixels: Uint8ClampedArray,
    removalMask: Uint8Array,
    imageWidth: number,
    imageHeight: number,
    passes = 2,
) => {
    let minimumX = imageWidth;
    let minimumY = imageHeight;
    let maximumX = -1;
    let maximumY = -1;
    for (let pixelIndex = 0; pixelIndex < removalMask.length; pixelIndex += 1) {
        if (removalMask[pixelIndex] === 0) continue;
        const x = pixelIndex % imageWidth;
        const y = Math.floor(pixelIndex / imageWidth);
        minimumX = Math.min(minimumX, x);
        minimumY = Math.min(minimumY, y);
        maximumX = Math.max(maximumX, x);
        maximumY = Math.max(maximumY, y);
    }
    if (maximumX < minimumX || maximumY < minimumY) return pixels;

    let current = new Uint8ClampedArray(pixels);
    for (let pass = 0; pass < passes; pass += 1) {
        const next = new Uint8ClampedArray(current);
        for (let y = minimumY; y <= maximumY; y += 1) {
            for (let x = minimumX; x <= maximumX; x += 1) {
                const pixelIndex = (y * imageWidth) + x;
                if (removalMask[pixelIndex] === 0) continue;

                let red = 0;
                let green = 0;
                let blue = 0;
                let alpha = 0;
                let weightTotal = 0;
                for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
                    const sourceY = Math.max(0, Math.min(imageHeight - 1, y + deltaY));
                    for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
                        const sourceX = Math.max(0, Math.min(imageWidth - 1, x + deltaX));
                        const sourceIndex = (sourceY * imageWidth) + sourceX;
                        if (removalMask[sourceIndex] === 0 && (Math.abs(deltaX) + Math.abs(deltaY)) < 2) {
                            continue;
                        }
                        const weight = deltaX === 0 && deltaY === 0 ? 4 : 1;
                        const offset = sourceIndex * 4;
                        red += current[offset] * weight;
                        green += current[offset + 1] * weight;
                        blue += current[offset + 2] * weight;
                        alpha += current[offset + 3] * weight;
                        weightTotal += weight;
                    }
                }
                const destinationOffset = pixelIndex * 4;
                next[destinationOffset] = Math.round(red / Math.max(1, weightTotal));
                next[destinationOffset + 1] = Math.round(green / Math.max(1, weightTotal));
                next[destinationOffset + 2] = Math.round(blue / Math.max(1, weightTotal));
                next[destinationOffset + 3] = Math.round(alpha / Math.max(1, weightTotal));
            }
        }
        current = next;
    }
    return current;
};

const patchBoundingBox = (
    context: CanvasRenderingContext2D,
    sourcePixels: Uint8ClampedArray,
    removalMask: Uint8Array,
    imageWidth: number,
    imageHeight: number,
    box: BoundingBox,
    fallbackSourceIndex: number,
) => {
    const leftSources = new Int32Array(box.height);
    const rightSources = new Int32Array(box.height);
    const topSources = new Int32Array(box.width);
    const bottomSources = new Int32Array(box.width);
    leftSources.fill(-1);
    rightSources.fill(-1);
    topSources.fill(-1);
    bottomSources.fill(-1);

    for (let localY = 0; localY < box.height; localY += 1) {
        const y = box.y + localY;
        let leftX = box.x - 1;
        while (leftX >= 0 && removalMask[(y * imageWidth) + leftX] === 1) {
            leftX -= 1;
        }
        if (leftX >= 0) {
            leftSources[localY] = (y * imageWidth) + leftX;
        }

        let rightX = box.x + box.width;
        while (rightX < imageWidth && removalMask[(y * imageWidth) + rightX] === 1) {
            rightX += 1;
        }
        if (rightX < imageWidth) {
            rightSources[localY] = (y * imageWidth) + rightX;
        }
    }

    for (let localX = 0; localX < box.width; localX += 1) {
        const x = box.x + localX;
        let topY = box.y - 1;
        while (topY >= 0 && removalMask[(topY * imageWidth) + x] === 1) {
            topY -= 1;
        }
        if (topY >= 0) {
            topSources[localX] = (topY * imageWidth) + x;
        }

        let bottomY = box.y + box.height;
        while (bottomY < imageHeight && removalMask[(bottomY * imageWidth) + x] === 1) {
            bottomY += 1;
        }
        if (bottomY < imageHeight) {
            bottomSources[localX] = (bottomY * imageWidth) + x;
        }
    }

    const patch = context.createImageData(box.width, box.height);
    const patchPixels = patch.data;

    for (let localY = 0; localY < box.height; localY += 1) {
        const y = box.y + localY;

        for (let localX = 0; localX < box.width; localX += 1) {
            const x = box.x + localX;
            let nearestSourceIndex = fallbackSourceIndex;
            let nearestDistance = Number.POSITIVE_INFINITY;

            const leftSourceIndex = leftSources[localY];
            if (leftSourceIndex >= 0) {
                const distance = x - (leftSourceIndex % imageWidth);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestSourceIndex = leftSourceIndex;
                }
            }

            const rightSourceIndex = rightSources[localY];
            if (rightSourceIndex >= 0) {
                const distance = (rightSourceIndex % imageWidth) - x;
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestSourceIndex = rightSourceIndex;
                }
            }

            const topSourceIndex = topSources[localX];
            if (topSourceIndex >= 0) {
                const distance = y - Math.floor(topSourceIndex / imageWidth);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestSourceIndex = topSourceIndex;
                }
            }

            const bottomSourceIndex = bottomSources[localX];
            if (bottomSourceIndex >= 0) {
                const distance = Math.floor(bottomSourceIndex / imageWidth) - y;
                if (distance < nearestDistance) {
                    nearestSourceIndex = bottomSourceIndex;
                }
            }

            const destinationOffset = ((localY * box.width) + localX) * 4;
            if (nearestSourceIndex < 0) {
                patchPixels[destinationOffset] = 0;
                patchPixels[destinationOffset + 1] = 0;
                patchPixels[destinationOffset + 2] = 0;
                patchPixels[destinationOffset + 3] = 0;
                continue;
            }

            const sourceOffset = nearestSourceIndex * 4;
            patchPixels[destinationOffset] = sourcePixels[sourceOffset];
            patchPixels[destinationOffset + 1] = sourcePixels[sourceOffset + 1];
            patchPixels[destinationOffset + 2] = sourcePixels[sourceOffset + 2];
            patchPixels[destinationOffset + 3] = sourcePixels[sourceOffset + 3];
        }
    }

    context.putImageData(patch, box.x, box.y);
};

export const getImageDimensions = async (
    imageSource: CanvasImageSourceInput,
): Promise<{ width: number; height: number }> => withImageSource(imageSource, async (src) => {
    const image = await loadImage(src);
    return {
        width: image.naturalWidth,
        height: image.naturalHeight,
    };
});

/**
 * Remove as regiões detectadas usando somente Canvas. A máscara global impede
 * que qualquer pixel marcado para remoção seja reutilizado em outro remendo.
 */
export const createCleanBackground = async (
    originalImageSrc: string,
    elements: BoundingBox[],
): Promise<string> => {
    const image = await loadImage(originalImageSrc);
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = image.naturalWidth;
    sourceCanvas.height = image.naturalHeight;

    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!sourceContext) {
        throw new Error('Não foi possível criar o contexto Canvas de origem.');
    }
    sourceContext.drawImage(image, 0, 0);

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = image.naturalWidth;
    outputCanvas.height = image.naturalHeight;

    const outputContext = outputCanvas.getContext('2d');
    if (!outputContext) {
        throw new Error('Não foi possível criar o contexto Canvas de saída.');
    }
    outputContext.imageSmoothingEnabled = false;
    outputContext.drawImage(sourceCanvas, 0, 0);

    const validBoxes = mergeOverlappingBoxes(elements
        .map((box) => clampBoundingBox(
            box,
            image.naturalWidth,
            image.naturalHeight,
            getErasePadding(box),
        ))
        .filter((box): box is BoundingBox => box !== null));

    const removalMask = createRemovalMask(
        image.naturalWidth,
        image.naturalHeight,
        validBoxes,
    );
    const sourcePixels = sourceContext.getImageData(
        0,
        0,
        image.naturalWidth,
        image.naturalHeight,
    ).data;
    const filledPixels = smoothFilledRegions(fillRemovalMask(
        sourcePixels,
        removalMask,
        image.naturalWidth,
        image.naturalHeight,
    ), removalMask, image.naturalWidth, image.naturalHeight);
    const filledImageData = outputContext.createImageData(
        image.naturalWidth,
        image.naturalHeight,
    );
    filledImageData.data.set(filledPixels);
    outputContext.putImageData(filledImageData, 0, 0);

    return outputCanvas.toDataURL('image/png');
};

/**
 * Recorta um ativo visual em pixels absolutos usando somente HTML5 Canvas.
 */
export const cropImage = async (
    imageSource: CanvasImageSourceInput,
    box: BoundingBox,
): Promise<string> => withImageSource(imageSource, async (src) => {
    const image = await loadImage(src);
    const safeBox = clampBoundingBox(box, image.naturalWidth, image.naturalHeight);
    if (!safeBox) {
        throw new Error('BoundingBox inválido para recorte.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = safeBox.width;
    canvas.height = safeBox.height;

    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Não foi possível criar o contexto Canvas de recorte.');
    }

    context.drawImage(
        image,
        safeBox.x,
        safeBox.y,
        safeBox.width,
        safeBox.height,
        0,
        0,
        safeBox.width,
        safeBox.height,
    );
    return canvas.toDataURL('image/png');
});

type DecorationProcessingOptions = {
    foregroundType?: ExtractedImage['type'];
    exclusionBoxes?: BoundingBox[];
};

const EXTRACTION_SAMPLE_MARGIN = 16;
const EXTRACTION_EXCLUSION_PADDING = 4;
const MIN_FOREGROUND_ALPHA = 16;

const colorDistanceSquared = (
    pixels: Uint8ClampedArray,
    offset: number,
    red: number,
    green: number,
    blue: number,
) => {
    const deltaRed = pixels[offset] - red;
    const deltaGreen = pixels[offset + 1] - green;
    const deltaBlue = pixels[offset + 2] - blue;
    return (deltaRed * deltaRed) + (deltaGreen * deltaGreen) + (deltaBlue * deltaBlue);
};

const estimateAdjacentBackground = (
    sourcePixels: Uint8ClampedArray,
    imageWidth: number,
    imageHeight: number,
    box: BoundingBox,
) => {
    const sampleIndexes: number[] = [];
    const left = Math.max(0, box.x - EXTRACTION_SAMPLE_MARGIN);
    const top = Math.max(0, box.y - EXTRACTION_SAMPLE_MARGIN);
    const right = Math.min(imageWidth, box.x + box.width + EXTRACTION_SAMPLE_MARGIN);
    const bottom = Math.min(imageHeight, box.y + box.height + EXTRACTION_SAMPLE_MARGIN);
    const boxRight = box.x + box.width;
    const boxBottom = box.y + box.height;

    for (let y = top; y < bottom; y += 2) {
        for (let x = left; x < right; x += 2) {
            const isOutsideTarget = x < box.x || x >= boxRight || y < box.y || y >= boxBottom;
            if (isOutsideTarget) sampleIndexes.push((y * imageWidth) + x);
        }
    }

    if (sampleIndexes.length === 0) {
        for (let x = box.x; x < boxRight; x += 1) {
            sampleIndexes.push((box.y * imageWidth) + x);
            sampleIndexes.push(((boxBottom - 1) * imageWidth) + x);
        }
        for (let y = box.y + 1; y < boxBottom - 1; y += 1) {
            sampleIndexes.push((y * imageWidth) + box.x);
            sampleIndexes.push((y * imageWidth) + boxRight - 1);
        }
    }

    const histogram = new Uint32Array(4096);
    sampleIndexes.forEach((pixelIndex) => {
        const offset = pixelIndex * 4;
        const key = ((sourcePixels[offset] >> 4) << 8)
            | ((sourcePixels[offset + 1] >> 4) << 4)
            | (sourcePixels[offset + 2] >> 4);
        histogram[key] += 1;
    });

    let dominantKey = 0;
    for (let key = 1; key < histogram.length; key += 1) {
        if (histogram[key] > histogram[dominantKey]) dominantKey = key;
    }

    let redTotal = 0;
    let greenTotal = 0;
    let blueTotal = 0;
    let dominantCount = 0;
    sampleIndexes.forEach((pixelIndex) => {
        const offset = pixelIndex * 4;
        const key = ((sourcePixels[offset] >> 4) << 8)
            | ((sourcePixels[offset + 1] >> 4) << 4)
            | (sourcePixels[offset + 2] >> 4);
        if (key !== dominantKey) return;
        redTotal += sourcePixels[offset];
        greenTotal += sourcePixels[offset + 1];
        blueTotal += sourcePixels[offset + 2];
        dominantCount += 1;
    });

    const divisor = Math.max(1, dominantCount);
    const red = redTotal / divisor;
    const green = greenTotal / divisor;
    const blue = blueTotal / divisor;
    let varianceTotal = 0;

    sampleIndexes.forEach((pixelIndex) => {
        const offset = pixelIndex * 4;
        const key = ((sourcePixels[offset] >> 4) << 8)
            | ((sourcePixels[offset + 1] >> 4) << 4)
            | (sourcePixels[offset + 2] >> 4);
        if (key === dominantKey) {
            varianceTotal += colorDistanceSquared(sourcePixels, offset, red, green, blue);
        }
    });

    const deviation = Math.sqrt(varianceTotal / divisor);
    return {
        red,
        green,
        blue,
        tolerance: Math.max(30, Math.min(72, 24 + (deviation * 2.5))),
    };
};

const removeIntersectingElements = (
    pixels: Uint8ClampedArray,
    cropBox: BoundingBox,
    exclusions: BoundingBox[],
) => {
    exclusions.forEach((exclusion) => {
        const left = Math.max(
            cropBox.x,
            Math.floor(Number(exclusion.x) - EXTRACTION_EXCLUSION_PADDING),
        );
        const top = Math.max(
            cropBox.y,
            Math.floor(Number(exclusion.y) - EXTRACTION_EXCLUSION_PADDING),
        );
        const right = Math.min(
            cropBox.x + cropBox.width,
            Math.ceil(Number(exclusion.x) + Number(exclusion.width) + EXTRACTION_EXCLUSION_PADDING),
        );
        const bottom = Math.min(
            cropBox.y + cropBox.height,
            Math.ceil(Number(exclusion.y) + Number(exclusion.height) + EXTRACTION_EXCLUSION_PADDING),
        );
        if (right <= left || bottom <= top) return;

        for (let y = top; y < bottom; y += 1) {
            const localY = y - cropBox.y;
            for (let x = left; x < right; x += 1) {
                pixels[((localY * cropBox.width) + (x - cropBox.x)) * 4 + 3] = 0;
            }
        }
    });
};

const removeSmallForegroundComponents = (
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    foregroundType: ExtractedImage['type'] = 'other',
) => {
    const pixelCount = width * height;
    const labels = new Int32Array(pixelCount);
    const queue = new Int32Array(pixelCount);
    const areas = [0];
    let componentId = 0;

    for (let start = 0; start < pixelCount; start += 1) {
        if (labels[start] !== 0 || pixels[(start * 4) + 3] <= MIN_FOREGROUND_ALPHA) continue;

        componentId += 1;
        let queueStart = 0;
        let queueEnd = 1;
        let area = 0;
        queue[0] = start;
        labels[start] = componentId;

        while (queueStart < queueEnd) {
            const current = queue[queueStart];
            queueStart += 1;
            area += 1;
            const x = current % width;
            const y = Math.floor(current / width);

            for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
                const nextY = y + deltaY;
                if (nextY < 0 || nextY >= height) continue;
                for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
                    if (deltaX === 0 && deltaY === 0) continue;
                    const nextX = x + deltaX;
                    if (nextX < 0 || nextX >= width) continue;
                    const next = (nextY * width) + nextX;
                    if (labels[next] !== 0 || pixels[(next * 4) + 3] <= MIN_FOREGROUND_ALPHA) continue;
                    labels[next] = componentId;
                    queue[queueEnd] = next;
                    queueEnd += 1;
                }
            }
        }

        areas[componentId] = area;
    }

    if (componentId === 0) return;
    let largestArea = 0;
    areas.forEach((area) => {
        if (area > largestArea) largestArea = area;
    });
    const minimumRatio = foregroundType === 'food'
        ? 0.025
        : foregroundType === 'illustration' || foregroundType === 'other'
            ? 0.006
            : 0.004;
    const minimumArea = Math.max(12, largestArea * minimumRatio);

    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
        const label = labels[pixelIndex];
        if (label > 0 && areas[label] < minimumArea) {
            pixels[(pixelIndex * 4) + 3] = 0;
        }
    }
};

export const processDecoration = (
    imageSource: CanvasImageSourceInput,
    box: BoundingBox,
    options: DecorationProcessingOptions = {},
): Promise<string> => withImageSource(imageSource, async (src) => {
    const image = await loadImage(src);
    const safeBox = clampBoundingBox(box, image.naturalWidth, image.naturalHeight);
    if (!safeBox) throw new Error('BoundingBox inválido para extração.');

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = image.naturalWidth;
    sourceCanvas.height = image.naturalHeight;
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!sourceContext) throw new Error('Não foi possível criar o contexto Canvas de extração.');
    sourceContext.drawImage(image, 0, 0);
    const sourcePixels = sourceContext.getImageData(
        0,
        0,
        image.naturalWidth,
        image.naturalHeight,
    ).data;

    const canvas = document.createElement('canvas');
    canvas.width = safeBox.width;
    canvas.height = safeBox.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Não foi possível criar o contexto Canvas do recorte.');
    context.drawImage(
        image,
        safeBox.x,
        safeBox.y,
        safeBox.width,
        safeBox.height,
        0,
        0,
        safeBox.width,
        safeBox.height,
    );

    const imageData = context.getImageData(0, 0, safeBox.width, safeBox.height);
    const pixels = imageData.data;
    const originalPixels = new Uint8ClampedArray(pixels);
    const background = estimateAdjacentBackground(
        sourcePixels,
        image.naturalWidth,
        image.naturalHeight,
        safeBox,
    );
    const backgroundMask = new Uint8Array(safeBox.width * safeBox.height);
    const queue = new Int32Array(safeBox.width * safeBox.height);
    const toleranceSquared = background.tolerance * background.tolerance;
    let queueStart = 0;
    let queueEnd = 0;

    const enqueueBackground = (pixelIndex: number) => {
        if (backgroundMask[pixelIndex] === 1) return;
        const offset = pixelIndex * 4;
        const x = pixelIndex % safeBox.width;
        const y = Math.floor(pixelIndex / safeBox.width);
        const preserveOutlines = options.foregroundType !== 'food';
        if (preserveOutlines) {
            let maximumNeighborDistance = 0;
            const neighbors = [
                x > 0 ? pixelIndex - 1 : -1,
                x + 1 < safeBox.width ? pixelIndex + 1 : -1,
                y > 0 ? pixelIndex - safeBox.width : -1,
                y + 1 < safeBox.height ? pixelIndex + safeBox.width : -1,
            ];
            neighbors.forEach((neighbor) => {
                if (neighbor < 0) return;
                const neighborOffset = neighbor * 4;
                const distance = colorDistanceSquared(
                    pixels,
                    neighborOffset,
                    pixels[offset],
                    pixels[offset + 1],
                    pixels[offset + 2],
                );
                maximumNeighborDistance = Math.max(maximumNeighborDistance, distance);
            });
            const edgeThreshold = Math.max(12, background.tolerance * 0.32);
            if (maximumNeighborDistance > edgeThreshold * edgeThreshold) return;
        }
        if (colorDistanceSquared(
            pixels,
            offset,
            background.red,
            background.green,
            background.blue,
        ) > toleranceSquared) return;
        backgroundMask[pixelIndex] = 1;
        queue[queueEnd] = pixelIndex;
        queueEnd += 1;
    };

    for (let x = 0; x < safeBox.width; x += 1) {
        enqueueBackground(x);
        enqueueBackground(((safeBox.height - 1) * safeBox.width) + x);
    }
    for (let y = 1; y < safeBox.height - 1; y += 1) {
        enqueueBackground(y * safeBox.width);
        enqueueBackground((y * safeBox.width) + safeBox.width - 1);
    }

    while (queueStart < queueEnd) {
        const current = queue[queueStart];
        queueStart += 1;
        const x = current % safeBox.width;
        const y = Math.floor(current / safeBox.width);
        if (x > 0) enqueueBackground(current - 1);
        if (x + 1 < safeBox.width) enqueueBackground(current + 1);
        if (y > 0) enqueueBackground(current - safeBox.width);
        if (y + 1 < safeBox.height) enqueueBackground(current + safeBox.width);
    }

    for (let pixelIndex = 0; pixelIndex < backgroundMask.length; pixelIndex += 1) {
        if (backgroundMask[pixelIndex] === 1) pixels[(pixelIndex * 4) + 3] = 0;
    }

    for (let pixelIndex = 0; pixelIndex < backgroundMask.length; pixelIndex += 1) {
        if (backgroundMask[pixelIndex] === 1) continue;
        const x = pixelIndex % safeBox.width;
        const y = Math.floor(pixelIndex / safeBox.width);
        const touchesBackground = (
            (x > 0 && backgroundMask[pixelIndex - 1] === 1)
            || (x + 1 < safeBox.width && backgroundMask[pixelIndex + 1] === 1)
            || (y > 0 && backgroundMask[pixelIndex - safeBox.width] === 1)
            || (y + 1 < safeBox.height && backgroundMask[pixelIndex + safeBox.width] === 1)
        );
        if (!touchesBackground) continue;

        const offset = pixelIndex * 4;
        const distance = Math.sqrt(colorDistanceSquared(
            pixels,
            offset,
            background.red,
            background.green,
            background.blue,
        ));
        const transitionStart = background.tolerance * 0.65;
        const transitionEnd = background.tolerance * 1.5;
        const featheredAlpha = Math.round(
            Math.max(0, Math.min(1, (distance - transitionStart) / (transitionEnd - transitionStart))) * 255,
        );
        pixels[offset + 3] = Math.min(pixels[offset + 3], featheredAlpha);
    }

    removeIntersectingElements(pixels, safeBox, options.exclusionBoxes || []);
    removeSmallForegroundComponents(
        pixels,
        safeBox.width,
        safeBox.height,
        options.foregroundType,
    );

    let retainedPixelCount = 0;
    for (let pixelIndex = 0; pixelIndex < backgroundMask.length; pixelIndex += 1) {
        if (pixels[(pixelIndex * 4) + 3] > MIN_FOREGROUND_ALPHA) retainedPixelCount += 1;
    }
    const minimumRetainedPixels = Math.max(8, Math.round(backgroundMask.length * 0.0015));
    if (retainedPixelCount < minimumRetainedPixels && options.foregroundType !== 'food') {
        pixels.set(originalPixels);
        const conservativeTolerance = Math.min(16, Math.max(8, background.tolerance * 0.24));
        const conservativeToleranceSquared = conservativeTolerance * conservativeTolerance;
        for (let pixelIndex = 0; pixelIndex < backgroundMask.length; pixelIndex += 1) {
            const offset = pixelIndex * 4;
            if (colorDistanceSquared(
                pixels,
                offset,
                background.red,
                background.green,
                background.blue,
            ) <= conservativeToleranceSquared) {
                pixels[offset + 3] = 0;
            }
        }
        removeIntersectingElements(pixels, safeBox, options.exclusionBoxes || []);
    }
    context.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
});

export const sortSpatialElements = <T extends SpatialElement>(
    elements: T[],
    rowTolerance = SPATIAL_ROW_TOLERANCE,
): T[] => {
    const positioned = elements
        .map((element, originalIndex) => ({ element, originalIndex }))
        .filter(({ element }) => Boolean(element.boundingBox))
        .sort((left, right) => {
            const leftBox = left.element.boundingBox as BoundingBox;
            const rightBox = right.element.boundingBox as BoundingBox;
            return leftBox.y - rightBox.y
                || leftBox.x - rightBox.x
                || left.originalIndex - right.originalIndex;
        });
    const unpositioned = elements.filter((element) => !element.boundingBox);
    const rows: Array<{ anchorY: number; entries: typeof positioned }> = [];

    positioned.forEach((entry) => {
        const y = (entry.element.boundingBox as BoundingBox).y;
        const currentRow = rows[rows.length - 1];
        if (!currentRow || y - currentRow.anchorY > rowTolerance) {
            rows.push({ anchorY: y, entries: [entry] });
        } else {
            currentRow.entries.push(entry);
        }
    });

    const sortedPositioned = rows.flatMap((row) => (
        row.entries
            .sort((left, right) => {
                const leftBox = left.element.boundingBox as BoundingBox;
                const rightBox = right.element.boundingBox as BoundingBox;
                return leftBox.x - rightBox.x
                    || leftBox.y - rightBox.y
                    || left.originalIndex - right.originalIndex;
            })
            .map(({ element }) => element)
    ));

    return [...sortedPositioned, ...unpositioned];
};

const sortSpatialColumns = <T extends SpatialElement>(
    elements: T[],
    requestedColumnCount: number,
): T[] => {
    const positioned = elements
        .map((element, originalIndex) => ({ element, originalIndex }))
        .filter(({ element }) => Boolean(element.boundingBox))
        .sort((left, right) => {
            const leftBox = left.element.boundingBox as BoundingBox;
            const rightBox = right.element.boundingBox as BoundingBox;
            return leftBox.x - rightBox.x
                || leftBox.y - rightBox.y
                || left.originalIndex - right.originalIndex;
        });
    const unpositioned = elements.filter((element) => !element.boundingBox);
    const columnCount = Math.max(1, Math.min(
        Math.round(requestedColumnCount),
        positioned.length,
    ));
    if (columnCount <= 1 || positioned.length <= 1) {
        return sortSpatialElements(elements);
    }

    const gaps = positioned.slice(0, -1)
        .map((entry, index) => {
            const currentX = (entry.element.boundingBox as BoundingBox).x;
            const nextX = (positioned[index + 1].element.boundingBox as BoundingBox).x;
            return { cutAfter: index, gap: nextX - currentX };
        })
        .filter(({ gap }) => gap > SPATIAL_ROW_TOLERANCE)
        .sort((left, right) => right.gap - left.gap)
        .slice(0, columnCount - 1)
        .map(({ cutAfter }) => cutAfter)
        .sort((left, right) => left - right);

    if (gaps.length === 0) return sortSpatialElements(elements);

    const columns: typeof positioned[] = [];
    let columnStart = 0;
    gaps.forEach((cutAfter) => {
        columns.push(positioned.slice(columnStart, cutAfter + 1));
        columnStart = cutAfter + 1;
    });
    columns.push(positioned.slice(columnStart));

    const sortedPositioned = columns.flatMap((column) => (
        column
            .sort((left, right) => {
                const leftBox = left.element.boundingBox as BoundingBox;
                const rightBox = right.element.boundingBox as BoundingBox;
                return leftBox.y - rightBox.y
                    || leftBox.x - rightBox.x
                    || left.originalIndex - right.originalIndex;
            })
            .map(({ element }) => element)
    ));

    return [...sortedPositioned, ...unpositioned];
};

export const sortMenuElements = (
    categories: MenuCategory[],
    categoryColumnCount = 1,
): MenuCategory[] => (
    categoryColumnCount > 1
        ? sortSpatialColumns(categories, categoryColumnCount)
        : sortSpatialElements(categories)
).map((category) => ({
    ...category,
    products: sortSpatialElements(category.products),
}));
