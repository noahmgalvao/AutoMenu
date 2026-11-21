import { clearCanvasAlignment } from './canvasAlignment';
import React, { useState } from 'react';
import { getImageLayerIndexes } from '../../../domain/menu/imageLayers';
import { getSelectedLayerIds } from '../../../domain/menu/canvasShapes';
import { InteractionProps, SelectionItem, TOUCH_LONG_PRESS_MS } from './types';
import { resolveMenuPageDimensions } from '../../../domain/menu/pageSetup';
import { alignLayerMove, captureImageDrag, getRenderedImageDragPages, IMAGE_DRAG_THRESHOLD_PX, moveDraggedLayers } from './imageDragMotion';

type ImageResizeDirection = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
type ImageResizeSnapshot = {
    x: number;
    y: number;
    width: number;
    aspectRatio: number;
};
type ImageResizePosition = Pick<ImageResizeSnapshot, 'x' | 'y' | 'width'>;

function renderResizePreview(positions: Map<string, ImageResizePosition>, sourceId?: string) {
    document.querySelectorAll<HTMLElement>('[data-added-image-id], [data-image-selection-overlay]').forEach(element => {
        const id = element.dataset.addedImageId || element.dataset.imageSelectionOverlay;
        const position = id && positions.get(id);
        if (!position) return;
        element.style.left = `${position.x}px`;
        element.style.top = `${position.y}px`;
        element.style.width = `${position.width}px`;
        const resizer = element.firstElementChild;
        if (element.dataset.imageSelectionOverlay && id !== sourceId && resizer instanceof HTMLElement) {
            resizer.style.width = `${position.width}px`;
        }
    });
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const useImageManipulation = (
    props: InteractionProps, 
    handleSelection: (
        type: 'product' | 'category' | 'freeText' | 'addedImage' | null,
        id: string | null,
        options?: { shiftKey?: boolean; ctrlKey?: boolean; backgroundPage?: number }
    ) => void,
    selectedItems: SelectionItem[] = [],
    multiSelectMode = false,
) => {
    const { onStyleUpdate, onImageEditEnd, scale, style } = props;
    const { widthPx: pageWidthPx, heightPx: pageHeightPx } = resolveMenuPageDimensions(style);
    const [imageEditPage, setImageEditPage] = React.useState<{ id: string; pageIndex: number } | null>(null);
    const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
    const imageDragCleanupRef = React.useRef<(() => void) | null>(null);
    const imageResizeCleanupRef = React.useRef<(() => void) | null>(null);
    const imageResizeSessionRef = React.useRef<{
        sourceId: string;
        direction: ImageResizeDirection;
        images: Map<string, ImageResizeSnapshot>;
    } | null>(null);

    const getBatchImageIds = (imgId: string) => getSelectedLayerIds(selectedItems, imgId);

    const handleImageDragStart = (e: React.PointerEvent, imgId: string, pageIndex = 0) => {
        if (!e.isPrimary || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        imageDragCleanupRef.current?.();
        document.body.dataset.automenuImageInteraction = 'drag';
        setDraggedImageId(imgId);
        setImageEditPage({ id: imgId, pageIndex });
        handleSelection('addedImage', imgId, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey, backgroundPage: pageIndex });
        
        const el = e.currentTarget as HTMLElement;
        try {
            el.setPointerCapture(e.pointerId);
        } catch {
            // Pointer capture can fail if the browser has already cancelled the touch.
        }
        const startX = Number(e.clientX);
        const startY = Number(e.clientY);
        const pointerId = e.pointerId;
        let moved = false;
        let openedMenu = false;
        const longPress = e.pointerType === 'touch' ? window.setTimeout(() => {
            openedMenu = true;
            window.dispatchEvent(new CustomEvent('automenu:canvas-drag-ready', {
                detail: { type: 'addedImage', id: imgId, x: startX, y: startY },
            }));
        }, TOUCH_LONG_PRESS_MS) : undefined;
        window.dispatchEvent(new CustomEvent('automenu:canvas-drag-move'));
        const rect = el.getBoundingClientRect();
        const parentEl = el.parentElement;
        
        if (!parentEl) {
            window.clearTimeout(longPress);
            delete document.body.dataset.automenuImageInteraction;
            setDraggedImageId(null);
            return;
        }
        
        const currentScale: number = (typeof scale === 'number' && scale > 0) ? scale : 1;
        const drag = captureImageDrag(imgId, pageIndex, rect, { x: startX, y: startY }, currentScale, el);

        const handlePointerMove = (moveEvent: PointerEvent) => {
            if (moveEvent.pointerId !== pointerId) return;
            if (moveEvent.cancelable) moveEvent.preventDefault();
            const moveX = Number(moveEvent.clientX);
            const moveY = Number(moveEvent.clientY);
            if (!moved) {
                if (Math.hypot(moveX - startX, moveY - startY) < IMAGE_DRAG_THRESHOLD_PX) return;
                moved = true;
                window.clearTimeout(longPress);
                window.dispatchEvent(new CustomEvent('automenu:canvas-drag-move'));
            }

            if (onStyleUpdate) {
                const pages = getRenderedImageDragPages();
                const point = alignLayerMove({ drag, point: { x: moveX, y: moveY } }, pages, new Set([imgId]));
                onStyleUpdate(previous => ({
                    ...previous,
                    ...moveDraggedLayers(previous, [{ drag, point }], pages),
                    name: 'Custom',
                }));
            }
        };

        const cleanupDrag = () => {
            clearCanvasAlignment();
            window.clearTimeout(longPress);
            try {
                if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
            } catch {
                // Element may have unmounted before cleanup.
            }
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
            delete document.body.dataset.automenuImageInteraction;
            imageDragCleanupRef.current = null;
            setDraggedImageId(null);
        };
        const handlePointerUp = (event: PointerEvent) => {
            if (event.pointerId !== pointerId) return;
            cleanupDrag();
            if (event.type === 'pointerup' && (moved || (!openedMenu && !multiSelectMode && !e.shiftKey && !e.ctrlKey && !e.metaKey))) {
                onImageEditEnd?.(imgId);
            }
        };

        window.addEventListener('pointermove', handlePointerMove, { passive: false });
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
        imageDragCleanupRef.current = cleanupDrag;
    };

    const handleResizeImage = (e: React.MouseEvent, imgId: string, delta: number) => {
        e.stopPropagation();
        resizeImageByDelta(imgId, delta);
    };

    const resizeImageByDelta = (imgId: string, delta: number) => {
        if (!delta) return;
        if (onStyleUpdate) {
            const imageIds = getBatchImageIds(imgId);
            onStyleUpdate(prev => ({
                ...prev,
                addedImages: prev.addedImages?.map(img => {
                    if (imageIds.has(img.id)) return { ...img, width: Math.max(50, img.width + delta) };
                    return img;
                }),
                name: 'Custom'
            }));
        }
    };

    const startImageResize = (
        imgId: string,
        direction: ImageResizeDirection
    ) => {
        imageDragCleanupRef.current?.();
        imageResizeCleanupRef.current?.();
        document.body.dataset.automenuImageInteraction = 'resize';
        const releaseResizeInteraction = (event?: PointerEvent) => {
            window.removeEventListener('pointerup', releaseResizeInteraction);
            window.removeEventListener('pointercancel', releaseResizeInteraction);
            delete document.body.dataset.automenuImageInteraction;
            imageResizeCleanupRef.current = null;
            if (event?.type === 'pointercancel' && imageResizeSessionRef.current) {
                renderResizePreview(imageResizeSessionRef.current.images);
                imageResizeSessionRef.current = null;
            }
        };
        window.addEventListener('pointerup', releaseResizeInteraction);
        window.addEventListener('pointercancel', releaseResizeInteraction);
        imageResizeCleanupRef.current = releaseResizeInteraction;
        const imageIds = getBatchImageIds(imgId);
        const renderedAspectRatios = new Map<string, number>();
        (style.addedImages || []).forEach((imageStyle) => {
            if (!imageIds.has(imageStyle.id)) return;
            const imageElement = Array.from(document.querySelectorAll<HTMLElement>('[data-added-image-id]'))
                .find((element) => element.dataset.addedImageId === imageStyle.id)
                ?.querySelector<HTMLImageElement>('img');
            if (!imageElement) return;

            const ratio = imageElement.naturalWidth > 0 && imageElement.naturalHeight > 0
                ? imageElement.naturalHeight / imageElement.naturalWidth
                : imageElement.offsetWidth > 0
                    ? imageElement.offsetHeight / imageElement.offsetWidth
                    : 1;
            renderedAspectRatios.set(
                imageStyle.id,
                Number.isFinite(ratio) && ratio > 0 ? ratio : 1
            );
        });

        const images = new Map<string, ImageResizeSnapshot>();
        (style.addedImages || []).forEach((image) => {
            if (!imageIds.has(image.id)) return;
            const x = Number(image.x);
            const y = Number(image.y);
            const width = Number(image.width);
            images.set(image.id, {
                x: Number.isFinite(x) ? clamp(x, 0, pageWidthPx) : 0,
                y: Number.isFinite(y) ? clamp(y, 0, pageHeightPx) : 0,
                width: Number.isFinite(width) && width > 0 ? width : 50,
                aspectRatio: renderedAspectRatios.get(image.id) || 1,
            });
        });
        imageResizeSessionRef.current = images.size > 0
            ? { sourceId: imgId, direction, images }
            : null;
        if (!imageResizeSessionRef.current) {
            releaseResizeInteraction();
        }
    };

    const getResizePositions = (imgId: string, direction: ImageResizeDirection, finalWidth: number) => {
        const session = imageResizeSessionRef.current;
        const source = session?.images.get(imgId);
        if (!session || !source || session.sourceId !== imgId || session.direction !== direction
            || !Number.isFinite(finalWidth) || finalWidth <= 0) return null;

        const delta = finalWidth - source.width;
        const fromLeft = direction === 'topLeft' || direction === 'bottomLeft';
        const fromTop = direction === 'topLeft' || direction === 'topRight';
        const positions = new Map<string, ImageResizePosition>();
        for (const [id, snapshot] of session.images) {
            const { x, y, width, aspectRatio } = snapshot;
            const right = x + width;
            const bottom = y + width * aspectRatio;
            const horizontalLimit = fromLeft ? right : pageWidthPx - x;
            const verticalLimit = (fromTop ? bottom : pageHeightPx - y) / aspectRatio;
            const nextWidth = clamp(width + delta, 50, Math.max(50, Math.min(horizontalLimit, verticalLimit)));
            positions.set(id, { width: nextWidth, x: fromLeft ? right - nextWidth : x, y: fromTop ? bottom - nextWidth * aspectRatio : y });
        }
        return positions;
    };

    const previewImageResize = (imgId: string, direction: ImageResizeDirection, finalWidth: number) => {
        const positions = getResizePositions(imgId, direction, finalWidth);
        if (positions) renderResizePreview(positions, imgId);
    };

    const stopImageResize = (imgId: string, direction: ImageResizeDirection, finalWidth: number) => {
        const positions = getResizePositions(imgId, direction, finalWidth);
        const source = imageResizeSessionRef.current?.images.get(imgId);
        imageResizeSessionRef.current = null;
        imageResizeCleanupRef.current?.();
        if (!positions || !source || !onStyleUpdate) return;

        renderResizePreview(positions);
        const changed = source.width !== positions.get(imgId)?.width || finalWidth !== Math.round(source.width);
        if (!changed) return;
        onStyleUpdate(previous => ({
            ...previous,
            addedImages: previous.addedImages?.map(image => {
                const position = positions.get(image.id);
                return position ? { ...image, ...position } : image;
            }),
            name: 'Custom',
        }));
        onImageEditEnd?.(imgId);
    };

    React.useEffect(() => () => {
        imageDragCleanupRef.current?.();
        imageResizeCleanupRef.current?.();
        imageResizeSessionRef.current = null;
        delete document.body.dataset.automenuImageInteraction;
    }, []);

    const handleRemoveImage = (e: React.MouseEvent, imgId: string) => {
        e.stopPropagation();
        if (onStyleUpdate) {
            const imageIds = getBatchImageIds(imgId);
            onStyleUpdate(prev => ({
                ...prev,
                addedImages: prev.addedImages?.filter(img => !imageIds.has(img.id)),
                name: 'Custom'
            }));
        }
        handleSelection(null, null);
    };

    const handleLayerImage = (e: React.MouseEvent, imgId: string, direction: 'front' | 'back') => {
        e.stopPropagation();
        if (!onStyleUpdate) return;

        const imageIds = Array.from(getBatchImageIds(imgId));
        const imageIdSet = new Set(imageIds);
        onStyleUpdate(prev => {
            const images = prev.addedImages || [];
            const layerIndexes = getImageLayerIndexes(images, imageIds, direction);

            return {
                ...prev,
                addedImages: images.map((img) => (
                    imageIdSet.has(img.id)
                        ? { ...img, zIndex: layerIndexes.get(img.id) ?? img.zIndex }
                        : layerIndexes.has(img.id)
                            ? { ...img, zIndex: layerIndexes.get(img.id) }
                        : img
                )),
                name: 'Custom',
            };
        });
    };

    return {
        imageEditPage,
        draggedImageId, setDraggedImageId,
        handleImageDragStart,
        handleResizeImage,
        resizeImageByDelta,
        startImageResize,
        previewImageResize,
        stopImageResize,
        handleRemoveImage,
        handleLayerImage
    };
};
