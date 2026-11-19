import type { AddedImage, CategoryPosition, MenuStyle, Product } from '../../../domain/menu/model';
import { categoryKey, categoryName } from '../../../domain/menu/categoryName';
import { FREE_TEXT_PREFIX } from '../../../domain/menu/flow';

export type CanvasObject = { type: 'category' | 'product' | 'freeText' | 'addedImage'; id: string };
export type CopiedObject =
    | { type: 'product' | 'freeText'; product: Product }
    | { type: 'category'; category: string; products: Product[] }
    | { type: 'addedImage'; image: AddedImage };
export type CanvasClip = { items: CopiedObject[]; style: Partial<MenuStyle>; positions: Record<string, CategoryPosition> };
export type PasteContent = CanvasClip | { text: string };

let lastCopy: { token: string; clip: CanvasClip } | undefined;
export const lastCanvasCopy = () => lastCopy?.clip;
export function matchingCanvasCopy(html: string) {
    return lastCopy && html.includes(`data-automenu-copy="${lastCopy.token}"`) ? lastCopy.clip : undefined;
}
export const objectText = (item: CopiedObject) => item.type === 'category' ? categoryName(item.category)
    : item.type === 'addedImage' ? (item.image.shape ? 'Forma' : 'Imagem') : item.product.name;

export function writeCanvasCopy(clip: CanvasClip) {
    const token = crypto.randomUUID();
    lastCopy = { token, clip };
    const label = clip.items.map(objectText).join('\n');
    const marker = document.createElement('span');
    marker.dataset.automenuCopy = token;
    marker.textContent = label;
    const html = marker.outerHTML;
    const supply = (event: ClipboardEvent) => {
        event.preventDefault();
        event.clipboardData?.setData('text/plain', label);
        event.clipboardData?.setData('text/html', html);
    };
    document.addEventListener('copy', supply, true);
    try {
        if (document.execCommand('copy')) return;
    } finally {
        document.removeEventListener('copy', supply, true);
    }
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        void navigator.clipboard.write([new ClipboardItem({
            'text/plain': new Blob([label], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' }),
        })]).catch(() => {});
    }
}

export function copiedProductFields(product: Product) {
    return { name: product.name, price: product.price, description: product.description,
        image: product.image || '', imageAssetId: product.imageAssetId ?? null, imageAlignment: product.imageAlignment,
        styles: product.styles, boundingBox: product.boundingBox, extractedImages: product.extractedImages };
}

export function pasteCanvasObjects(products: Product[], style: MenuStyle, content: PasteContent, target: CanvasObject | null, position: CategoryPosition,
    order?: { categories: string[]; products: Record<string, Product[]> }) {
    const initialOrder = order?.categories || [...new Set([...(style.customCategoryOrder || []), ...products.map(p => p.category)])];
    const next = { ...style, name: 'Custom', customCategoryOrder: [...initialOrder],
        customProductOrder: { ...style.customProductOrder }, categoryPositions: { ...style.categoryPositions }, categoryPlacements: { ...style.categoryPlacements },
        categoryImages: { ...style.categoryImages }, categoryDividerStyles: { ...style.categoryDividerStyles },
        productPhotoCrops: { ...style.productPhotoCrops }, productImageFlips: { ...style.productImageFlips },
        productDividerStyles: { ...style.productDividerStyles }, hiddenProductIds: [...style.hiddenProductIds],
        freeTextBorders: { ...style.freeTextBorders }, freeTextBackgrounds: { ...style.freeTextBackgrounds }, addedImages: [...(style.addedImages || [])] };
    let result = [...products];
    const selection: CanvasObject[] = [];
    const source = 'items' in content ? content.style : {};
    const targetProduct = products.find(p => p.id === target?.id);
    const targetImage = next.addedImages.find(i => i.id === target?.id);
    function renameCategory(old: string, label: string) {
        const key = categoryKey(label, result.map(p => p.category), old);
        if (key === old) return old;
        result = result.map(p => p.category === old ? { ...p, category: key } : p);
        next.customCategoryOrder = next.customCategoryOrder.map(c => c === old ? key : c);
        for (const map of [next.categoryImages, next.categoryDividerStyles, next.categoryPositions, next.categoryPlacements, next.customProductOrder]) {
            if (Object.prototype.hasOwnProperty.call(map, old)) { Object.assign(map, { [key]: map[old] }); delete map[old]; }
        }
        next.pageBreaks = next.pageBreaks?.map(c => c === old ? key : c);
        return key;
    }
    function forgetProduct(id: string) {
        result = result.filter(p => p.id !== id);
        next.hiddenProductIds = next.hiddenProductIds.filter(value => value !== id);
        delete next.productDividerStyles[id];
        delete next.productPhotoCrops[id];
        delete next.productImageFlips[id];
        delete next.freeTextBorders[id];
        delete next.freeTextBackgrounds[id];
        for (const [key, order] of Object.entries(next.customProductOrder)) {
            if (order.includes(id)) next.customProductOrder[key] = order.filter(value => value !== id);
        }
    }
    function removeLayerTarget() {
        if (target?.type === 'addedImage') next.addedImages = next.addedImages.filter(i => i.id !== target.id);
        if (target?.type === 'freeText' && targetProduct) {
            forgetProduct(target.id);
            const key = targetProduct.category;
            if (key.startsWith(FREE_TEXT_PREFIX) && !result.some(p => p.category === key)) {
                next.customCategoryOrder = next.customCategoryOrder.filter(c => c !== key);
                delete next.customProductOrder[key]; delete next.categoryPositions[key]; delete next.categoryPlacements[key];
            }
        }
    }
    function putText(text: string, original?: Product, at = position, replace = true) {
        if (replace && target?.type === 'category') { selection.push({ type: 'category', id: renameCategory(target.id, text) }); return; }
        if (replace && targetProduct && (target?.type === 'product' || target?.type === 'freeText')) {
            result = result.map(p => p.id === target.id ? { ...p, name: text, ...(original && p.isFreeText ? { styles: original.styles, freeTextWidth: original.freeTextWidth } : {}) } : p);
            if (original && target.type === 'freeText') copySetting(next.freeTextBorders, target.id, source.freeTextBorders?.[original.id]);
            selection.push(target); return;
        }
        const id = crypto.randomUUID();
        const category = FREE_TEXT_PREFIX + id;
        result.push({ ...original, id, name: text, description: '', price: 0, category, categoryId: null, customMarginTop: 0, isFreeText: true });
        next.customCategoryOrder.push(category);
        next.categoryPositions[category] = at;
        if (original) copySetting(next.freeTextBorders, id, source.freeTextBorders?.[original.id]);
        selection.push({ type: 'freeText', id });
    }
    function putLayer(image: AddedImage, at: CategoryPosition, replace: boolean) {
        if (replace && target && (target.type === 'product' || target.type === 'category')) {
            if (target.type === 'product') {
                result = result.map(p => p.id === target.id ? { ...p, image: image.url, imageAssetId: image.assetId ?? null } : p);
                next.productPhotoCrops[target.id] = { x: 50, y: 50 };
                next.showImages = true;
            } else {
                next.categoryImages[target.id] = { ...next.categoryImages[target.id], url: image.url, assetId: image.assetId, crop: undefined };
                next.showCategoryImages = true;
            }
            selection.push(target); return;
        }
        const old = replace ? targetImage : undefined;
        if (replace) removeLayerTarget();
        const id = old?.id || crypto.randomUUID();
        next.addedImages.push({ ...image, id, pageIndex: at.pageIndex, x: at.pageX ?? 0, y: at.y,
            width: old?.width ?? image.width, repeatAsBackground: old?.repeatAsBackground ?? false,
            zIndex: old?.zIndex ?? Math.max(40, ...next.addedImages.map(i => i.zIndex ?? 11)) + 1 });
        selection.push({ type: 'addedImage', id });
    }
    function copySetting<T>(map: Record<string, T>, id: string, value?: T) {
        if (value === undefined) delete map[id];
        else map[id] = value;
    }
    function putProduct(p: Product, category: string, categoryId: string | null, replaceId?: string, keepHidden = false) {
        const id = replaceId || crypto.randomUUID();
        const clone = { ...p, id, category, categoryId };
        if (replaceId) result = result.map(old => old.id === id ? clone : old);
        else {
            const previousOrder = next.customProductOrder[category] || order?.products[category]?.map(old => old.id)
                || result.filter(old => old.category === category).map(old => old.id);
            next.customProductOrder[category] = [...previousOrder, id];
            result.push(clone);
        }
        if (keepHidden && source.hiddenProductIds?.includes(p.id)) next.hiddenProductIds.push(id);
        copySetting(next.productPhotoCrops, id, source.productPhotoCrops?.[p.id]);
        copySetting(next.productImageFlips, id, source.productImageFlips?.[p.id]);
        copySetting(next.productDividerStyles, id, source.productDividerStyles?.[p.id]);
        copySetting(next.freeTextBorders, id, source.freeTextBorders?.[p.id]);
        return id;
    }
    function putCategory(original: string, members: Product[], at: CategoryPosition, replace: boolean, keepHidden: boolean) {
        const old = replace && target?.type === 'category' ? target.id : undefined;
        const categoryId = (old && result.find(p => p.category === old)?.categoryId) || crypto.randomUUID();
        const key = old ? renameCategory(old, categoryName(original)) : categoryKey(categoryName(original), result.map(p => p.category));
        if (old) result.filter(p => p.category === key).forEach(p => forgetProduct(p.id));
        else { next.customCategoryOrder.push(key); next.categoryPositions[key] = at; }
        copySetting(next.categoryImages, key, source.categoryImages?.[original]);
        copySetting(next.categoryDividerStyles, key, source.categoryDividerStyles?.[original]);
        next.customProductOrder[key] = [];
        members.forEach(p => putProduct(p, key, categoryId, undefined, keepHidden));
        selection.push({ type: 'category', id: key });
    }

    if ('text' in content) {
        if (target?.type === 'addedImage') removeLayerTarget();
        putText(content.text);
    } else {
        const first = content.items[0];
        if (!first) return null;
        const keyOf = (item: CopiedObject) => item.type === 'category' ? item.category : item.type === 'addedImage' ? item.image.id : item.product.id;
        const origin = content.positions[keyOf(first)];
        const placed = (item: CopiedObject, index: number) => {
            const from = content.positions[keyOf(item)];
            if (from && origin && from.pageIndex !== origin.pageIndex) {
                return { ...from, pageIndex: Math.max(0, position.pageIndex + from.pageIndex - origin.pageIndex) };
            }
            const samePage = from && origin;
            return { ...position, pageX: Math.max(0, (position.pageX || 0) + (samePage ? (from.pageX || 0) - (origin.pageX || 0) : 0)),
                y: Math.max(0, position.y + (samePage ? from.y - origin.y : index * 48)) };
        };
        const groups = new Set<string>();
        content.items.forEach((item, index) => {
            const replace = index === 0;
            const at = placed(item, index);
            if (item.type === 'addedImage') return putLayer(item.image, at, replace);
            if (item.type === 'category') {
                if (replace && target?.type === 'product') return putText(categoryName(item.category));
                return putCategory(item.category, item.products, at, replace, true);
            }
            if (item.type === 'freeText') {
                if (replace && target?.type === 'addedImage') removeLayerTarget();
                return putText(item.product.name, item.product, at, replace);
            }
            if (target?.type === 'category' || (target?.type === 'product' && targetProduct)) {
                const category = target.type === 'category' ? selection.find(s => s.type === 'category')?.id ?? target.id : targetProduct!.category;
                const categoryId = result.find(p => p.category === category)?.categoryId ?? null;
                const id = putProduct(item.product, category, categoryId, replace && target.type === 'product' ? target.id : undefined);
                selection.push({ type: 'product', id }); return;
            }
            if (groups.has(item.product.category)) return;
            groups.add(item.product.category);
            const members = content.items.flatMap(entry => entry.type === 'product' && entry.product.category === item.product.category ? [entry.product] : []);
            putCategory(item.product.category, members, at, false, false);
        });
    }
    const categoryOrderChanged = next.customCategoryOrder.length !== initialOrder.length
        || next.customCategoryOrder.some((key, index) => key !== initialOrder[index]);
    return { products: result, style: { ...next, customCategoryOrder: categoryOrderChanged ? next.customCategoryOrder : style.customCategoryOrder }, selection };
}
