import { setElementFormatting, updateItemFormatting } from '../../../domain/menu/itemFormatting';
import { isMiniFoodKind } from '../../../domain/menu/miniFoods';
import { canvasShapeUrl, getCanvasShapeDimensions, getCanvasShapeTextLayout, shapeTextColor } from '../../../domain/menu/canvasShapes';
import { blendColor, contrastRatio, needsContrastTip, suggestedContrastColor, type ContrastSample, type RGB } from '../../../domain/menu/textContrast';
import type { AddedImage, MenuStyle, Product } from '../../../domain/menu/model';

type SharedText = 'menuTitle' | 'menuSubtitle' | 'category' | 'productName' | 'productDescription' | 'productPrice';
type TextScope = SharedText | 'freeText' | 'shape';
type TextBox = { left: number; top: number; right: number; bottom: number };
type ContrastText = {
    scope: TextScope;
    id: string;
    pageIndex: number;
    category?: string;
    color: RGB;
    opacity: number;
    minimum: number;
};
type ContrastSurface = {
    key: string;
    kind: 'categoryGroup' | 'header' | 'freeText' | 'shape';
    id: string;
    fill: string;
    texts: ContrastText[];
};
type TextEntry = {
    category?: string;
    pageIndex: number;
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
export type ContrastTip = Pick<TextEntry, 'scope' | 'id' | 'label'> & { key: string; color: string | null; fill: string; pageIndex?:number; category?:string; surface?:ContrastSurface };
export type OverlapTip = { id: string; label: string; position: { x: number; y: number } | null };

const labels: Record<SharedText, string> = {
    menuTitle: 'Título', menuSubtitle: 'Subtítulo', category: 'Categorias',
    productName: 'Produtos', productDescription: 'Descrições dos produtos', productPrice: 'Preços',
};
const selector = '[data-word-fit-scope], [data-template-price] [data-border-text]';
const hexRGB = (value:string):RGB => [1,3,5].map(index=>parseInt(value.slice(index,index+2),16)) as unknown as RGB;
const interactionFills = ['bg-indigo-50/30', 'bg-indigo-50/20', 'bg-indigo-50/10', 'bg-indigo-500/15'];
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
        const category = element.closest<HTMLElement>('[data-category-chunk]')?.dataset.categoryChunk;
        const id = scope === 'freeText' ? element.closest<HTMLElement>('[data-canvas-free-text-id]')?.dataset.canvasFreeTextId || ''
            : scope === 'category' ? category || '' : scope.startsWith('product')
                ? element.closest<HTMLElement>('[data-drag-type="product"]')?.dataset.dragId || '' : scope;
        const boxes = domTextBoxes(element);
        if (!id || !boxes.length) continue;
        const css = getComputedStyle(element);
        const fill = css.webkitTextFillColor;
        const [color, alpha] = parseColor(!fill || fill.toLowerCase() === 'currentcolor' ? css.color : fill);
        let opacity = alpha;
        for (let parent: HTMLElement | null = element; parent && parent !== page; parent = parent.parentElement) {
            // Older contrast patches forced opacity:1 on text. Measure the native
            // opacity class that will return when that hidden patch is removed.
            const legacy = style.textContrastFills?.[scope === 'freeText' ? `freeText:${id}` : scope]
                && (parent === element || scope === 'productPrice' && parent.hasAttribute('data-template-price'));
            const nativeOpacity = legacy && [...parent.classList].find(name => /^opacity-\d+$/.test(name));
            opacity *= nativeOpacity ? Number(nativeOpacity.slice(8)) / 100 : Number.parseFloat(getComputedStyle(parent).opacity || '1');
        }
        const bold = Number(css.fontWeight) >= 700;
        const minimum = parseFloat(css.fontSize) >= (bold ? 18.67 : 24) ? 3 : 4.5;
        entries.push({ scope, id, category, pageIndex:Number(page.dataset.pageIndex)||0, boxes, color, opacity, minimum, element, page,
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
        entries.push({ scope: 'shape', id: image.id, pageIndex:Number(page.dataset.pageIndex)||0, boxes, color, opacity: 1, minimum: fontSize >= (bold ? 18.67 : 24) ? 3 : 4.5,
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

function solidBackground(entry: TextEntry, style: MenuStyle): RGB {
    const layers: [RGB, number][] = [];
    for (let element: HTMLElement | null = entry.element; element; element = element.parentElement) {
        const css = getComputedStyle(element);
        const { classList } = element;
        const temporary = !element.style.background && !element.style.backgroundColor
            && interactionFills.some(fill => classList.contains(fill));
        const legacy = (element === entry.element || entry.scope === 'productPrice' && element.hasAttribute('data-template-price')) && style.textContrastFills?.[entry.scope === 'freeText' ? `freeText:${entry.id}` : entry.scope];
        const [color, alpha] = temporary || legacy ? [[0, 0, 0] as RGB, 0] : parseColor(css.backgroundColor);
        if (alpha) layers.push([color, alpha]);
        if (element.dataset.categoryChunk) {
            const paint = element.querySelector(':scope > [data-category-group-paint]');
            if (paint) layers.push(parseColor(getComputedStyle(paint).backgroundColor));
        }
        if (element === entry.page || alpha === 1) break;
    }
    return layers.reverse().reduce<RGB>((below, [color, alpha]) => blendColor(color, below, alpha), [255, 255, 255]);
}

async function canvasBackground(page: HTMLElement, entries: TextEntry[], style: MenuStyle) {
    const assets = Array.from(page.querySelectorAll<HTMLElement>('img:not([data-menu-marker]), [data-added-image-id]'));
    const gradients = [page, ...page.querySelectorAll<HTMLElement>('[data-template-header], [data-template-category], [data-template-card]')]
        .some(element => {
            const image = getComputedStyle(element).backgroundImage;
            return Boolean(image && image !== 'none');
        });
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
                    const field = element.closest('[data-template-price]') ? 'productPrice' : element.dataset.wordFitScope;
                    const id = element.closest<HTMLElement>('[data-canvas-free-text-id]')?.dataset.canvasFreeTextId;
                    if (style.textContrastFills?.[field === 'freeText' ? `freeText:${id}` : field || '']) { const surface = field === 'productPrice' ? element.closest<HTMLElement>('[data-template-price]') || element : element; surface.style.backgroundColor = ''; surface.style.opacity = ''; }
                    element.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
                    element.style.setProperty('color', 'transparent', 'important');
                    element.style.textShadow = 'none';
                    element.style.webkitTextStrokeWidth = '0';
                });
                clone.querySelectorAll<HTMLElement>('[class*="bg-indigo-"]').forEach(element => {
                    element.classList.remove(...interactionFills);
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

function sampleBackground(entry: TextEntry, raster: ImageData | null, style: MenuStyle): RGB[] {
    if (!raster) return [entry.image?.shape ? parseColor(entry.image.shape.fill)[0] : solidBackground(entry, style)];
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
        const raster = await canvasBackground(page, entries, style);
        if (signal.aborted) return [];
        for (const entry of entries) {
            const key = `${entry.scope}:${entry.id}${entry.scope === 'menuTitle' || entry.scope === 'menuSubtitle' ? `:${entry.pageIndex}` : ''}`;
            const group = groups.get(key) || { entry, samples: new Map<string, ContrastSample>(), failing: [] };
            groups.set(key, group);
            for (const background of sampleBackground(entry, raster, style)) {
                const { minimum, opacity } = entry;
                const sample = { background, minimum, opacity };
                group.samples.set(`${background.join(',')}:${minimum}:${opacity}`, sample);
                if (needsContrastTip(entry.color, sample, entry.scope === 'productDescription')) group.failing.push(entry.color);
            }
        }
    }
    const surfaces = new Map<string, ContrastSurface>();
    for (const {entry} of groups.values()) {
        const kind = entry.category && (entry.scope === 'category' || entry.scope.startsWith('product')) ? 'categoryGroup'
            : entry.scope === 'freeText' ? 'freeText' : entry.scope === 'shape' ? 'shape' : 'header';
        const id = kind === 'categoryGroup' ? entry.category! : kind === 'header' ? 'header' : entry.id;
        const key = `${kind}:${id}`;
        const surface = surfaces.get(key) || {key,kind,id,fill:'#ffffff',texts:[]};
        surface.texts.push({scope:entry.scope,id:entry.id,pageIndex:entry.pageIndex,category:entry.category,color:entry.color,opacity:entry.opacity,minimum:entry.minimum});
        surfaces.set(key,surface);
    }
    for (const surface of surfaces.values()) surface.fill = chooseSurfaceFill(surface.texts);
    return [...groups].flatMap(([key, { entry, samples, failing }]): ContrastTip[] => {
        if (!failing.length) return [];
        const color = suggestedContrastColor(failing[0], [...samples.values()]);
        const black = contrastRatio(entry.color, [0, 0, 0]);
        const white = contrastRatio(entry.color, [255, 255, 255]);
        const kind = entry.category && (entry.scope === 'category' || entry.scope.startsWith('product')) ? 'categoryGroup' : entry.scope === 'freeText' ? 'freeText' : entry.scope === 'shape' ? 'shape' : 'header';
        const surface = surfaces.get(`${kind}:${kind === 'categoryGroup' ? entry.category : kind === 'header' ? 'header' : entry.id}`);
        return [{ key, scope: entry.scope, id: entry.id, pageIndex:entry.pageIndex, category:entry.category, surface, label: entry.label, color, fill: black > white ? '#000000' : '#ffffff' }];
    });
}

/** Prefer a clean light/dark surface; use a neutral shade only if it preserves
 * all existing text colors. If no one fill works, adjust only remaining colors. */
function chooseSurfaceFill(texts: ContrastText[]) {
    const candidates = ['#ffffff', '#000000', ...Array.from({ length: 254 }, (_, i) =>
        '#' + (i + 1).toString(16).padStart(2, '0').repeat(3))];
    let best = candidates[0];
    let score = -Infinity;
    for (const value of candidates) {
        const rgb = hexRGB(value);
        const minimum = Math.min(...texts.map(text => contrastRatio(text.color, rgb, text.opacity) / text.minimum));
        if (minimum >= 1.05) return value;
        if (minimum > score) { best = value; score = minimum; }
    }
    return best;
}

function setContrastColor(style: MenuStyle, products: Product[], text: Pick<ContrastText, 'scope' | 'id' | 'pageIndex'>, color: string) {
    if (text.scope === 'shape') return { products, style: {
        ...style,
        addedImages: style.addedImages?.map(image => {
            if (image.id !== text.id || !image.shape) return image;
            const shape = { ...image.shape, textBackground: undefined, textStyle: { ...image.shape.textStyle, color } };
            return { ...image, shape, url: canvasShapeUrl(shape) };
        }),
    } };
    if (text.scope === 'freeText') return { style,
        products: products.map(product => product.id === text.id ? { ...product, styles: { ...product.styles, color } } : product),
    };
    if (text.scope === 'menuTitle' || text.scope === 'menuSubtitle') return { products, style: {
        ...style,
        headingStyleOverrides: { ...style.headingStyleOverrides, [text.pageIndex]: {
            ...style.headingStyleOverrides?.[text.pageIndex],
            [text.scope]: { ...style.headingStyleOverrides?.[text.pageIndex]?.[text.scope], color },
        } },
    } };
    const field = text.scope;
    const kind = field === 'category' ? 'category' : 'product';
    return { products, style: updateItemFormatting(style, kind, text.id, [text.id], 'selection', [text.id], current =>
        setElementFormatting(current, field, { ...current.elementStyles[field], color })) };
}

export function applyContrastTips(style: MenuStyle, products: Product[], tips: ContrastTip[], choice: 'color' | 'fill') {
    if (!tips.length) return { style, products };
    // Plan a whole surface before changing its colors: another text on that same
    // surface may require a fill, which changes the contrast for all its siblings.
    const filledSurfaces = new Set(tips.filter(tip => choice === 'fill' || tip.color === null).map(tip => tip.surface?.key));
    let next = { style: {
        ...style, name: 'Custom', textContrastFills: undefined,
        addedImages: style.addedImages?.map(image => {
            if (!image.shape?.textBackground) return image;
            const shape = { ...image.shape, textBackground: undefined };
            return { ...image, shape, url: canvasShapeUrl(shape) };
        }),
    } as MenuStyle, products };
    const painted = new Set<string>();
    for (const tip of tips) {
        if (choice === 'color' && tip.color && !filledSurfaces.has(tip.surface?.key)) {
            next = setContrastColor(next.style, next.products, { ...tip, pageIndex: tip.pageIndex || 0 }, tip.color);
            continue;
        }
        const surface = tip.surface;
        if (!surface || painted.has(surface.key)) continue;
        painted.add(surface.key);
        const border = {
            sides: ['top', 'right', 'bottom', 'left'] as ('top' | 'right' | 'bottom' | 'left')[],
            color: surface.fill, thickness: 1, length: 100, radius: 0, offset: 0, pattern: 'solid' as const,
        };
        if (surface.kind === 'categoryGroup') {
            const category = surface.id;
            next.style = updateItemFormatting(next.style, 'category', category, [category], 'selection', [category], current => ({
                ...current,
                fills: { ...current.fills, category: 'transparent', categoryGroup: surface.fill },
                borders: { ...current.borders, categoryGroup: current.borders?.categoryGroup?.sides.length ? current.borders.categoryGroup : border },
            }));
            // Inner card/price surfaces must let the category's single native fill show.
            for (const product of next.products.filter(product => product.category === category && !product.isFreeText)) {
                next.style = updateItemFormatting(next.style, 'product', product.id, [product.id], 'selection', [product.id], current => ({
                    ...current, cardBackgroundColor: 'transparent', cardBackgroundColorOverride: true,
                    fills: { ...current.fills, price: 'transparent' },
                }));
            }
        } else if (surface.kind === 'header') {
            next.style = { ...next.style,
                fills: { ...next.style.fills, header: surface.fill },
                borders: { ...next.style.borders, header: next.style.borders?.header?.sides.length ? next.style.borders.header : border },
            };
        } else if (surface.kind === 'freeText') {
            next.style = { ...next.style,
                freeTextFills: { ...next.style.freeTextFills, [surface.id]: surface.fill },
                freeTextBorders: { ...next.style.freeTextBorders, [surface.id]: next.style.freeTextBorders?.[surface.id]?.sides.length ? next.style.freeTextBorders[surface.id] : border },
            };
        } else {
            next.style = { ...next.style, addedImages: next.style.addedImages?.map(image => {
                if (image.id !== surface.id || !image.shape) return image;
                const shape = { ...image.shape, fill: surface.fill, textBackground: undefined };
                return { ...image, shape, url: canvasShapeUrl(shape) };
            }) };
        }
        const background = hexRGB(surface.fill);
        for (const text of surface.texts) {
            if (contrastRatio(text.color, background, text.opacity) >= text.minimum) continue;
            const color = suggestedContrastColor(text.color, [{ background, opacity: text.opacity, minimum: text.minimum }]);
            if (color) next = setContrastColor(next.style, next.products, text, color);
        }
    }
    return next;
}
