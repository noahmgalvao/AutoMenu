import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESET_TEMPLATES } from '../src/domain/templates/templateCatalog';
import { categoryName, categoryInstanceSlug, storedCategoryKey } from '../src/domain/menu/categoryName';
import { pasteCanvasObjects, type CanvasClip } from '../src/presentation/menu/canvas/canvasClipboard';
import type { Product } from '../src/domain/menu/model';

const style = PRESET_TEMPLATES[0];
const point = { pageIndex: 1, columnIndex: 0, pageX: 180, y: 260 };
const products = ['Entradas', 'Entradas', 'Entradas', 'Doces'].map((category, i): Product =>
    ({ id: String(i), category, name: `Item ${i}`, price: i, description: '' }));

test('pasting selected products on paper groups just those products and preserves the names through storage', () => {
    const items = [products[0], products[2], products[3]].map(product => ({ type: 'product' as const, product }));
    const clip: CanvasClip = { items, style, positions: {} };
    const pasted = pasteCanvasObjects(products, style, clip, null, point)!;
    assert.equal(pasted.products.length, 7);
    assert.deepEqual(pasted.selection.map(item => categoryName(item.id)), ['Entradas', 'Doces']);
    const [first, second] = pasted.selection;
    assert.notEqual(first.id, 'Entradas');
    assert.equal(storedCategoryKey({ name: categoryName(first.id), slug: categoryInstanceSlug(first.id)! }), first.id);
    assert.deepEqual(pasted.products.filter(p => p.category === first.id).map(p => p.name), ['Item 0', 'Item 2']);
    assert.deepEqual(pasted.products.filter(p => p.category === second.id).map(p => p.name), ['Item 3']);
    assert.deepEqual(pasted.style.categoryPositions[first.id], point);
    const intoCategory = pasteCanvasObjects(products, style, clip, { type: 'category', id: 'Doces' }, point)!;
    assert.equal(intoCategory.products.filter(p => p.category === 'Doces').length, 4);
});

test('text and image layers replace each other at the destination without leaving the old object', () => {
    const layer = { id: 'layer', url: 'photo.jpg', x: 10, y: 20, pageIndex: 0, width: 80 };
    const text: Product = { ...products[0], id: 'text', category: 'ft_text', isFreeText: true, name: 'Especial' };
    const asText = pasteCanvasObjects(products, { ...style, addedImages: [layer] },
        { items: [{ type: 'freeText', product: text }], style, positions: {} }, { type: 'addedImage', id: layer.id }, point)!;
    assert.equal(asText.style.addedImages.length, 0);
    const added = asText.products.find(p => p.isFreeText)!;
    assert.equal(added.name, 'Especial');
    assert.deepEqual(asText.style.categoryPositions[added.category], point);
    const asImage = pasteCanvasObjects(asText.products, asText.style,
        { items: [{ type: 'addedImage', image: layer }], style, positions: {} }, asText.selection[0], point)!;
    assert.deepEqual(asImage.products, products);
    assert.equal(asImage.style.categoryPositions[added.category], undefined);
    const [image] = asImage.style.addedImages;
    assert.deepEqual([image.x, image.y, image.pageIndex], [180, 260, 1]);
});
