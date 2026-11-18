import type { Dispatch, SetStateAction } from 'react';
import type { MenuStyle, Product } from '../../../domain/menu/model';
import type { MenuPageSetup } from '../../../domain/menu/pageModel';
import { convertMenuPageSetup } from '../../../domain/menu/convertMenuPageSetup';

const getRenderedAddedImageAspectRatios = () => {
  const ratios = new Map<string, number>();
  if (typeof document === 'undefined') return ratios;

  document.querySelectorAll<HTMLElement>('[data-added-image-id]').forEach((container) => {
    const imageId = container.dataset.addedImageId;
    const image = container.querySelector<HTMLImageElement>('img');
    if (!imageId || !image) return;
    const renderedRect = image.getBoundingClientRect();
    const width = image.naturalWidth || renderedRect.width;
    const height = image.naturalHeight || renderedRect.height;
    if (width > 0 && height > 0) ratios.set(imageId, height / width);
  });

  return ratios;
};

export function updateCanvasPageSetup(setStyle: Dispatch<SetStateAction<MenuStyle>>, nextSetup: MenuPageSetup, products: readonly Product[]) {
  const ratios = getRenderedAddedImageAspectRatios();
  setStyle(previous => convertMenuPageSetup(previous, nextSetup, ratios, products));
}
