import { isMiniFoodKind } from '../../../domain/menu/miniFoods';
import { canvasShapeUrl, getCanvasShapeDimensions, getCanvasShapeTextLayout, shapeTextColor } from '../../../domain/menu/canvasShapes';
import { blendColor, contrastRatio, nearestContrastingColor, type ContrastSample, type RGB } from '../../../domain/menu/textContrast';
import type { AddedImage, MenuStyle, Product } from '../../../domain/menu/model';

type SharedText = 'menuTitle' | 'menuSubtitle' | 'category' | 'productName' | 'productDescription' | 'productPrice';
type TextScope = SharedText | 'freeText' | 'shape';
type TextBox = { left: number; top: number; right: number; bottom: number };
type TextEntry = {
    scope: TextScope;
    id: string;
    label: string;
    boxes: TextBox[];
    color: RGB;
    opacity: number;
    minimum: number;
    element: HTMLElement;
    page: HTMLElement;
    image?: AddedImage;
};
export type ContrastTip = Pick<TextEntry, 'scope' | 'id' | 'label'> & { key: string; color: string | null; fill: string };
export type OverlapTip = { id: string; label: string; position: { x: number; y: number } | null };

const labels: Record<SharedText, string> = {
    menuTitle: 'Título', menuSubtitle: 'Subtítulo', category: 'Nomes das categorias',
    productName: 'Nomes dos produtos', productDescription: 'Descrições dos produtos', productPrice: 'Preços',
};
const selector = '[data-word-fit-scope], [data-template-price] [data-border-text]';
const intersects = (a: TextBox, b: TextBox, gap = 0) =>
    a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;

let colorContext: CanvasRenderingContext2D | null = null;

function parseColor(css: string): [RGB, number] {
    if (!colorContext) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        colorContext = canvas.getContext('2d', { willReadFrequently: true });
    }
    if (!colorContext) return [[0, 0, 0], 0];
    colorContext.fillStyle = 'transparent';
    colorContext.fillStyle = css;
    const color = colorContext.fillStyle;
    if (color.startsWith('#')) return [[1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)) as unknown as RGB, 1];
    if (/^rgba?\(/.test(color)) {
        const [r, g, b, a = 1] = color.match(/[\d.]+/g)!.map(Number);
        return [[r, g, b], a];
    }
    colorContext.clearRect(0, 0, 1, 1);
    colorContext.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = colorContext.getImageData(0, 0, 1, 1).data;
    return [[r, g, b], a / 255];
}

function shapeBoxes(image: AddedImage, element: HTMLElement): TextBox[] {
    const shape = image.shape;
    if (!shape?.text?.trim()) return [];
    const rect = element.getBoundingClientRect();
    const dimensions = getCanvasShapeDimensions(shape);
    const { size, width, centerY, align, lines } = getCanvasShapeTextLayout(shape);
    const angle = shape.rotation * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const flipX = image.flipHorizontal ? -1 : 1;
    const flipY = image.flipVertical ? -1 : 1;
    if (colorContext) colorContext.font = `${shape.textStyle?.fontWeight || '600'} ${size}px ${shape.textStyle?.fontFamily || 'Arial'}`;
    return lines.flatMap((line, index) => {
        if (!line.trim()) return [];
        const length = Math.min(width, colorContext?.measureText(line).width ?? line.length * size * .68);
        const x = align === 'left' ? -width / 2 : align === 'right' ? width / 2 - length : -length / 2;
        const base = centerY + (index - (lines.length - 1) / 2) * size * 1.22 + size * .34;
        const corners = [[x, base - size], [x + length, base - size], [x, base + size * .27], [x + length, base + size * .27]];
        const xs = corners.map(([cx, cy]) => rect.left + rect.width * (.5 + flipX * (cx * cos - cy * sin) / dimensions.width));
        const ys = corners.map(([cx, cy]) => rect.top + rect.height * (.5 + flipY * (cx * sin + cy * cos) / dimensions.height));
        return [{ left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }];
    });
}

function domTextBoxes(element: HTMLElement) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const boxes: DOMRect[] = [];
    const range = document.createRange();
    while (walker.nextNode()) {
        if (!walker.currentNode.textContent?.trim()) continue;
        range.selectNodeContents(walker.currentNode);
        boxes.push(...Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0));
    }
    return boxes;
}

function collectPageText(page: HTMLElement, style: MenuStyle): TextEntry[] {
    const entries: TextEntry[] = [];
    for (const element of page.querySelectorAll<HTMLElement>(selector)) {
        if (element.closest('[data-print-control]') || !element.textContent?.trim()) continue;
        const scope = (element.closest('[data-template-price]') ? 'productPrice' : element.dataset.wordFitScope) as TextScope;
        if (scope !== 'freeText' && !Object.prototype.hasOwnProperty.call(labels, scope)) continue;
        const id = scope === 'freeText' ? element.closest<HTMLElement>('[data-canvas-free-text-id]')?.dataset.canvasFreeTextId || '' : scope;
        const boxes = domTextBoxes(element);
        if (!id || !boxes.length) continue;
        const css = getComputedStyle(element);
        const [color, alpha] = parseColor(css.color);
        let opacity = alpha;
        for (let parent: HTMLElement | null = element; parent && parent !== page; parent = parent.parentElement) {
            opacity *= Number(getComputedStyle(parent).opacity);
        }
        const bold = Number(css.fontWeight) >= 700;
        const minimum = parseFloat(css.fontSize) >= (bold ? 18.67 : 24) ? 3 : 4.5;
        entries.push({ scope, id, boxes, color, opacity, minimum, element, page,
            label: scope === 'freeText' ? element.textContent.trim() : labels[scope as SharedText] });
    }
    const images = new Map(style.addedImages?.map(img => [img.id, img]));
    for (const element of page.querySelectorAll<HTMLElement>('[data-added-image-id]')) {
        const image = images.get(element.dataset.addedImageId || '');
        if (!image?.shape?.text?.trim() || isMiniFoodKind(image.shape.kind)) continue;
        const liveText = element.querySelector<HTMLElement>('[data-shape-text]');
        const boxes = liveText ? domTextBoxes(liveText) : shapeBoxes(image, element);
        if (!boxes.length) continue;
        const [color] = parseColor(shapeTextColor(image.shape));
        const fontSize = getCanvasShapeTextLayout(image.shape).size * image.width / getCanvasShapeDimensions(image.shape).width;
        const bold = Number(image.shape.textStyle?.fontWeight) >= 700;
        entries.push({ scope: 'shape', id: image.id, boxes, color, opacity: 1, minimum: fontSize >= (bold ? 18.67 : 24) ? 3 : 4.5,
            element, page, label: image.shape.text, image });
    }
    return entries;
}

// Normalize to paper coordinates so a repeated background has one position on every page.
const onPaper = (box: TextBox, page: HTMLElement): TextBox => {
    const bounds = page.getBoundingClientRect();
    const scale = Math.max(.001, bounds.width / page.offsetWidth);
    return { left: (box.left - bounds.left) / scale, right: (box.right - bounds.left) / scale,
        top: (box.top - bounds.top) / scale, bottom: (box.bottom - bounds.top) / scale };
};

function nearestClearPosition(origin: { x: number; y: number }, boxes: TextBox[], obstacles: TextBox[], width: number, height: number) {
    const clearance = 2;
    const minX = Math.max(0, ...boxes.map(box => -box.left));
    const maxX = Math.min(width, ...boxes.map(box => width - box.right));
    const minY = Math.max(0, ...boxes.map(box => -box.top));
    const maxY = Math.min(height, ...boxes.map(box => height - box.bottom));
    if (maxX < minX || maxY < minY) return null;
    // Each pair creates a rectangle of forbidden positions for the origin.
    const forbidden = boxes.flatMap(box => obstacles.map(obstacle => ({
        left: obstacle.left - box.right - clearance, right: obstacle.right - box.left + clearance,
        top: obstacle.top - box.bottom - clearance, bottom: obstacle.bottom - box.top + clearance,
    })));
    const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
    const xs = new Set([clamp(origin.x, minX, maxX), minX, maxX]);
    for (const box of forbidden) {
        if (box.left > minX && box.left < maxX) xs.add(box.left);
        if (box.right > minX && box.right < maxX) xs.add(box.right);
    }
    let best: { x: number; y: number } | null = null;
    let distance = Infinity;
    for (const x of [...xs].sort((a, b) => Math.abs(a - origin.x) - Math.abs(b - origin.x))) {
        const dx = (x - origin.x) ** 2;
        if (dx >= distance) break;
        const intervals = forbidden.filter(box => x > box.left && x < box.right).sort((a, b) => a.top - b.top);
        const y0 = clamp(origin.y, minY, maxY);
        let below = y0;
        for (const interval of intervals) if (below > interval.top && below < interval.bottom) below = interval.bottom;
        let above = y0;
        for (let i = intervals.length - 1; i >= 0; i--) {
            const interval = intervals[i];
            if (above > interval.top && above < interval.bottom) above = interval.top;
        }
        for (const y of [above, below]) {
            const squaredDistance = dx + (y - origin.y) ** 2;
            if (y < minY || y > maxY || squaredDistance >= distance) continue;
            if (intervals.some(interval => y > interval.top && y < interval.bottom)) continue;
            best = { x, y };
            distance = squaredDistance;
        }
    }
    return best;
}

export function scanBackgroundTextOverlap(root: HTMLElement, style: MenuStyle, requested?: ReadonlySet<string>): OverlapTip[] {
    const backgrounds = style.freeTextBackgrounds || {};
    if (!Object.keys(backgrounds).length) return [];
    const pages = Array.from(root.querySelectorAll<HTMLElement>('[data-menu-print-page]'));
    if (!pages.length) return [];
    const entries = pages.flatMap(page => collectPageText(page, style));
    const stationary = entries.filter(entry => entry.scope !== 'freeText' || !backgrounds[entry.id]).flatMap(entry => entry.boxes.map(box => onPaper(box, entry.page)));
    const repeating = new Map<string, TextBox[]>();
    const names = new Map<string, string>();
    for (const entry of entries) if (entry.scope === 'freeText' && backgrounds[entry.id]) {
        const boxes = entry.boxes.map(box => onPaper(box, entry.page));
        const known = repeating.get(entry.id) || [];
        for (const box of boxes) if (!known.some(previous => Math.abs(previous.left - box.left) < .1 && Math.abs(previous.top - box.top) < .1)) known.push(box);
        repeating.set(entry.id, known);
        names.set(entry.id, entry.label);
    }
    const tips: OverlapTip[] = [];
    for (const [id, boxes] of repeating) {
        if (requested && !requested.has(id)) continue;
        const obstacles = stationary.concat(...[...repeating].filter(([other]) => other !== id).map(([, occupied]) => occupied));
        if (!boxes.some(box => obstacles.some(obstacle => intersects(box, obstacle)))) continue;
        const origin = backgrounds[id];
        const relative = boxes.map(box => ({ left: box.left - origin.x, right: box.right - origin.x, top: box.top - origin.y, bottom: box.bottom - origin.y }));
        const position = nearestClearPosition(origin, relative, obstacles, pages[0].offsetWidth, pages[0].offsetHeight);
        tips.push({ id, label: names.get(id) || '', position });
        if (position && requested) repeating.set(id, relative.map(box => ({
            left: box.left + position.x, right: box.right + position.x, top: box.top + position.y, bottom: box.bottom + position.y,
        })));
    }
    return tips;
}

function solidBackground(entry: TextEntry): RGB {
    const layers: [RGB, number][] = [];
    for (let element: HTMLElement | null = entry.element; element; element = element.parentElement) {
        const css = getComputedStyle(element);
        const [color, alpha] = parseColor(css.backgroundColor);
        if (alpha) layers.push([color, alpha]);
        if (element.dataset.categoryChunk) {
            const paint = element.querySelector(':scope > [data-category-group-paint]');
            if (paint) layers.push(parseColor(getComputedStyle(paint).backgroundColor));
        }
        if (element === entry.page || alpha === 1) break;
    }
    return layers.reverse().reduce<RGB>((below, [color, alpha]) => blendColor(color, below, alpha), [255, 255, 255]);
}

async function canvasBackground(page: HTMLElement, entries: TextEntry[]) {
    const assets = Array.from(page.querySelectorAll<HTMLElement>('img:not([data-menu-marker]), [data-added-image-id]'));
    const gradients = [page, ...page.querySelectorAll<HTMLElement>('[data-template-header], [data-template-category], [data-template-card]')]
        .some(element => getComputedStyle(element).backgroundImage !== 'none');
    const requiresRaster = gradients || assets.some(asset => {
        const rect = asset.getBoundingClientRect();
        return entries.some(entry => entry.boxes.some(box => intersects(rect, box)));
    });
    if (!requiresRaster) return null;
    try {
        const { default: render } = await import('html2canvas-pro');
        const shapes = new Map(entries.filter(entry => entry.image?.shape).map(entry => [entry.id, entry.image!.shape!]));
        const canvas = await render(page, {
            useCORS: true, imageTimeout: 3000, scale: .75, logging: false,
            ignoreElements: element => element.hasAttribute('data-print-control'),
            onclone: (_document, clone) => {
                clone.style.boxShadow = 'none';
                clone.querySelectorAll<HTMLElement>(selector).forEach(element => {
                    element.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
                    element.style.setProperty('color', 'transparent', 'important');
                    element.style.textShadow = 'none';
                    element.style.webkitTextStrokeWidth = '0';
                });
                clone.querySelectorAll<HTMLElement>('[class*="bg-indigo-"]').forEach(element => {
                    element.classList.remove('bg-indigo-50/30', 'bg-indigo-50/20', 'bg-indigo-50/10', 'bg-indigo-500/15');
                });
                clone.querySelectorAll<HTMLElement>('[data-shape-text]').forEach(element => {
                    element.style.visibility = 'hidden';
                });
                clone.querySelectorAll<HTMLImageElement>('[data-added-image-id] img').forEach(element => {
                    const shape = shapes.get(element.closest<HTMLElement>('[data-added-image-id]')?.dataset.addedImageId || '');
                    if (shape) element.src = canvasShapeUrl({ ...shape, text: undefined, textBackground: undefined });
                });
            },
        });
        const source = canvas.getContext('2d');
        return source?.getImageData(0, 0, canvas.width, canvas.height) ?? null;
    } catch {
        return null;
    }
}

function sampleBackground(entry: TextEntry, raster: ImageData | null): RGB[] {
    if (entry.image?.shape?.textBackground) return [parseColor(entry.image.shape.textBackground)[0]];
    if (!raster) return [entry.image?.shape ? parseColor(entry.image.shape.fill)[0] : solidBackground(entry)];
    const page = entry.page.getBoundingClientRect();
    const colors = new Map<string, RGB>();
    for (const box of entry.boxes) {
        const points = [0.15, .35, .55, .75, .9];
        for (const u of points) for (const v of [.33, .55, .72]) {
            const px = (box.left + u * (box.right - box.left) - page.left) / page.width;
            const py = (box.top + v * (box.bottom - box.top) - page.top) / page.height;
            if (px < 0 || px >= 1 || py < 0 || py >= 1) continue;
            const index = (Math.floor(py * raster.height) * raster.width + Math.floor(px * raster.width)) * 4;
            const rgb: RGB = [raster.data[index], raster.data[index + 1], raster.data[index + 2]];
            colors.set(rgb.join(','), rgb);
        }
    }
    return [...colors.values()];
}

export async function scanTextContrast(root: HTMLElement, style: MenuStyle, signal: AbortSignal) {
    const groups = new Map<string, { entry: TextEntry; samples: Map<string, ContrastSample>; failing: RGB[] }>();
    for (const page of root.querySelectorAll<HTMLElement>('[data-menu-print-page]')) {
        if (signal.aborted) return [];
        const entries = collectPageText(page, style);
        if (!entries.length) continue;
        const raster = await canvasBackground(page, entries);
        if (signal.aborted) return [];
        for (const entry of entries) {
            const key = `${entry.scope}:${entry.id}`;
            const group = groups.get(key) || { entry, samples: new Map<string, ContrastSample>(), failing: [] };
            groups.set(key, group);
            for (const background of sampleBackground(entry, raster)) {
                const { minimum, opacity } = entry;
                group.samples.set(`${background.join(',')}:${minimum}:${opacity}`, { background, minimum, opacity });
                if (contrastRatio(entry.color, background, opacity) < minimum) group.failing.push(entry.color);
            }
        }
    }
    return [...groups].flatMap(([key, { entry, samples, failing }]): ContrastTip[] => {
        if (!failing.length) return [];
        const color = nearestContrastingColor(failing[0], [...samples.values()]);
        const black = contrastRatio(entry.color, [0, 0, 0]);
        const white = contrastRatio(entry.color, [255, 255, 255]);
        return [{ key, scope: entry.scope, id: entry.id, label: entry.label, color, fill: black > white ? '#000000' : '#ffffff' }];
    });
}

export function applyContrastTip(style: MenuStyle, products: Product[], tip: ContrastTip, choice: 'color' | 'fill') {
    const useFill = choice === 'fill' || tip.color === null;
    if (tip.scope === 'shape') return { products, style: { ...style, name: 'Custom', addedImages: style.addedImages?.map(image => {
        if (image.id !== tip.id || !image.shape) return image;
        const shape = useFill ? { ...image.shape, textBackground: tip.fill }
            : { ...image.shape, textStyle: { ...image.shape.textStyle, color: tip.color! } };
        return { ...image, shape, url: canvasShapeUrl(shape) };
    }) } };
    if (useFill) return { products, style: { ...style, name: 'Custom',
        textContrastFills: { ...style.textContrastFills, [tip.scope === 'freeText' ? tip.key : tip.scope]: tip.fill } } };
    if (tip.scope === 'freeText') return { style, products: products.map(product => product.id === tip.id
        ? { ...product, styles: { ...product.styles, color: tip.color! } } : product) };
    return { products, style: { ...style, name: 'Custom',
        elementStyles: { ...style.elementStyles, [tip.scope]: { ...style.elementStyles[tip.scope], color: tip.color } } } };
}
