import React, { useState } from 'react';
import { A4_HEIGHT_PX, A4_WIDTH_PX } from '../../utils/menuPagination';
import { getImageLayerIndexes } from '../../utils/imageLayers';
import { InteractionProps, SelectionItem } from './types';

const NEW_PAGE_SWITCH_THRESHOLD_PX = 96;
type ImageResizeDirection = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
type ImageResizeSnapshot = {
    x: number;
    y: number;
    width: number;
    aspectRatio: number;
};

const getRenderedPages = () => {
    if (typeof document === 'undefined') return [];
    return Array.from(document.querySelectorAll<HTMLElement>('[data-menu-print-page="true"][data-page-index]'))
        .map((element) => ({
            element,
            pageIndex: Number(element.dataset.pageIndex ?? 0),
            rect: element.getBoundingClientRect(),
        }))
        .sort((left, right) => left.pageIndex - right.pageIndex);
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const useImageManipulation = (
    props: InteractionProps, 
    handleSelection: (
        type: 'product' | 'category' | 'freeText' | 'addedImage' | null,
        id: string | null,
        options?: { shiftKey?: boolean; ctrlKey?: boolean }
    ) => void,
    selectedItems: SelectionItem[] = []
) => {
    const { onStyleUpdate, scale, style } = props;
    const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
    const imageDragCleanupRef = React.useRef<(() => void) | null>(null);
    const imageResizeCleanupRef = React.useRef<(() => void) | null>(null);
    const imageResizeSessionRef = React.useRef<{
        sourceId: string;
        direction: ImageResizeDirection;
        images: Map<string, ImageResizeSnapshot>;
    } | null>(null);

    const getBatchImageIds = (imgId: string) => {
        const selectedImageIds = selectedItems
            .filter((item) => item.type === 'addedImage')
            .map((item) => item.id);
        return selectedImageIds.includes(imgId) && selectedImageIds.length > 1 ? selectedImageIds : [imgId];
    };

    const handleImageDragStart = (e: React.PointerEvent, imgId: string) => {
        e.preventDefault();
        e.stopPropagation();
        imageDragCleanupRef.current?.();
        document.body.dataset.automenuImageInteraction = 'drag';
        setDraggedImageId(imgId);
        handleSelection('addedImage', imgId, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey });
        
        const el = e.currentTarget as HTMLElement;
        try {
            el.setPointerCapture(e.pointerId);
        } catch {
            // Pointer capture can fail if the browser has already cancelled the touch.
        }
        const startX = Number(e.clientX);
        const startY = Number(e.clientY);
        const rect = el.getBoundingClientRect();
        const parentEl = el.parentElement;
        
        if (!parentEl) {
            delete document.body.dataset.automenuImageInteraction;
            setDraggedImageId(null);
            return;
        }
        
        const currentScale: number = (typeof scale === 'number' && scale > 0) ? scale : 1;
        const pointerOffsetX = (startX - Number(rect.left)) / currentScale;
        const pointerOffsetY = (startY - Number(rect.top)) / currentScale;
        const imageHeight = Math.max(1, Number(rect.height) / currentScale);

        const handlePointerMove = (moveEvent: PointerEvent) => {
            if (moveEvent.cancelable) moveEvent.preventDefault();
            const moveX = Number(moveEvent.clientX);
            const moveY = Number(moveEvent.clientY);

            if (onStyleUpdate) {
               const pages = getRenderedPages();
               const pageCount = Math.max(1, ...pages.map((page) => page.pageIndex + 1));
               const pageAtPointer = pages.find((page) => (
                   moveX >= page.rect.left &&
                   moveX <= page.rect.right &&
                   moveY >= page.rect.top &&
                   moveY <= page.rect.bottom
               ));

               onStyleUpdate(prev => {
                   let nextBlankPages = prev.blankPages || [];
                   const nextImages = prev.addedImages?.map(img => {
                       if (img.id !== imgId) return img;

                       const currentPageIndex = img.pageIndex || 0;
                       const currentPage = pages.find((page) => page.pageIndex === currentPageIndex) || pages[0];
                       const hasExistingNextPage = pages.some((page) => page.pageIndex > currentPageIndex);
                       const shouldCreateNextPage = Boolean(
                           currentPage &&
                           !hasExistingNextPage &&
                           (
                               moveX > currentPage.rect.right + NEW_PAGE_SWITCH_THRESHOLD_PX ||
                               moveY > currentPage.rect.bottom + NEW_PAGE_SWITCH_THRESHOLD_PX
                           )
                       );
                       let targetPageIndex = currentPageIndex;
                       let targetPage = currentPage;
                       let newX = currentPage ? ((moveX - currentPage.rect.left) / currentScale) - pointerOffsetX : img.x;
                       let newY = currentPage ? ((moveY - currentPage.rect.top) / currentScale) - pointerOffsetY : img.y;

                       if (pageAtPointer) {
                           targetPageIndex = pageAtPointer.pageIndex;
                           targetPage = pageAtPointer;
                           newX = ((moveX - targetPage.rect.left) / currentScale) - pointerOffsetX;
                           newY = ((moveY - targetPage.rect.top) / currentScale) - pointerOffsetY;
                       } else if (shouldCreateNextPage) {
                           targetPageIndex = currentPageIndex + 1;
                           newX = 0;
                           newY = 0;
                       }

                        targetPageIndex = Math.max(0, targetPageIndex);
                        if (targetPageIndex >= pageCount && !nextBlankPages.some((page) => page.index === targetPageIndex)) {
                            nextBlankPages = [...nextBlankPages, { id: crypto.randomUUID(), index: targetPageIndex, fixedPosition: true }];
                        }

                       return {
                           ...img,
                           pageIndex: targetPageIndex,
                           x: clamp(newX, 0, Math.max(0, A4_WIDTH_PX - img.width)),
                           y: clamp(newY, 0, Math.max(0, A4_HEIGHT_PX - imageHeight)),
                       };
                   });

                   return {
                       ...prev,
                       blankPages: nextBlankPages,
                       addedImages: nextImages,
                       name: 'Custom'
                   };
               });
            }
        };

        const cleanupDrag = () => {
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
        const handlePointerUp = cleanupDrag;

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
            const imageIds = new Set(getBatchImageIds(imgId));
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
        const releaseResizeInteraction = () => {
            window.removeEventListener('pointerup', releaseResizeInteraction);
            window.removeEventListener('pointercancel', releaseResizeInteraction);
            delete document.body.dataset.automenuImageInteraction;
            imageResizeCleanupRef.current = null;
        };
        window.addEventListener('pointerup', releaseResizeInteraction);
        window.addEventListener('pointercancel', releaseResizeInteraction);
        imageResizeCleanupRef.current = releaseResizeInteraction;
        const imageIds = new Set(getBatchImageIds(imgId));
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
                x: Number.isFinite(x) ? clamp(x, 0, A4_WIDTH_PX) : 0,
                y: Number.isFinite(y) ? clamp(y, 0, A4_HEIGHT_PX) : 0,
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

    const resizeImageFromCorner = (
        imgId: string,
        direction: ImageResizeDirection,
        deltaWidth: number
    ) => {
        if (!onStyleUpdate || !Number.isFinite(deltaWidth)) return;
        if (
            !imageResizeSessionRef.current
            || imageResizeSessionRef.current.sourceId !== imgId
            || imageResizeSessionRef.current.direction !== direction
        ) {
            startImageResize(imgId, direction);
        }

        const session = imageResizeSessionRef.current;
        if (!session) return;
        const resizesFromLeft = direction === 'topLeft' || direction === 'bottomLeft';
        const resizesFromTop = direction === 'topLeft' || direction === 'topRight';

        onStyleUpdate(prev => ({
            ...prev,
            addedImages: prev.addedImages?.map(img => {
                const snapshot = session.images.get(img.id);
                if (!snapshot) return img;

                const aspectRatio = Number.isFinite(snapshot.aspectRatio) && snapshot.aspectRatio > 0
                    ? snapshot.aspectRatio
                    : 1;
                const currentHeight = snapshot.width * aspectRatio;
                const horizontalLimit = resizesFromLeft
                    ? snapshot.x + snapshot.width
                    : A4_WIDTH_PX - snapshot.x;
                const verticalLimit = resizesFromTop
                    ? (snapshot.y + currentHeight) / aspectRatio
                    : (A4_HEIGHT_PX - snapshot.y) / aspectRatio;
                const safeHorizontalLimit = Number.isFinite(horizontalLimit) ? horizontalLimit : snapshot.width;
                const safeVerticalLimit = Number.isFinite(verticalLimit) ? verticalLimit : snapshot.width;
                const maxWidth = Math.max(50, Math.min(safeHorizontalLimit, safeVerticalLimit));
                const width = clamp(snapshot.width + deltaWidth, 50, maxWidth);
                const height = width * aspectRatio;
                const x = resizesFromLeft ? (snapshot.x + snapshot.width) - width : snapshot.x;
                const y = resizesFromTop ? (snapshot.y + currentHeight) - height : snapshot.y;
                if (![width, height, x, y].every(Number.isFinite)) return img;

                return {
                    ...img,
                    width,
                    x,
                    y,
                };
            }),
            name: 'Custom'
        }));
    };

    const stopImageResize = (
        imgId: string,
        direction: ImageResizeDirection,
        finalWidth: number
    ) => {
        const sourceSnapshot = imageResizeSessionRef.current?.images.get(imgId);
        if (sourceSnapshot && Number.isFinite(finalWidth) && finalWidth > 0) {
            resizeImageFromCorner(imgId, direction, finalWidth - sourceSnapshot.width);
        }
        imageResizeSessionRef.current = null;
        imageResizeCleanupRef.current?.();
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
            const imageIds = new Set(getBatchImageIds(imgId));
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

        const imageIds = getBatchImageIds(imgId);
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
        draggedImageId, setDraggedImageId,
        handleImageDragStart,
        handleResizeImage,
        resizeImageByDelta,
        startImageResize,
        resizeImageFromCorner,
        stopImageResize,
        handleRemoveImage,
        handleLayerImage
    };
};
