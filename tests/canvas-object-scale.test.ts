import assert from 'node:assert/strict';
import test from 'node:test';
import type { Product } from '../src/domain/menu/model';
import { resolveFontSizeLimits } from '../src/domain/menu/styleRules';
import { PRESET_TEMPLATES } from '../src/domain/templates/templateCatalog';
import { captureCanvasObjectScale } from '../src/presentation/menu/canvas/canvasObjectScale';

test('a product group continues growing after its description and photo reach their limits', () => {
    const template = PRESET_TEMPLATES[0];
    const style = {
        ...template,
        showImages: true,
        imageScale: 2,
        minimumFontSize: 15,
        revisedMinimumFontSize: true as const,
        fontSizeLimits: { ...resolveFontSizeLimits(template), productName: 60, productDescription: 19, productPrice: 50 },
        elementStyles: {
            ...template.elementStyles,
            productName: { fontSize: 20 },
            productDescription: { fontSize: 18 },
            productPrice: { fontSize: 20 },
        },
    };
    const product: Product = { id: 'item', name: 'Bolo', description: 'De chocolate', price: 10, category: 'Bolos', image: 'bolo.png' };
    const resize = captureCanvasObjectScale(style, { type: 'category', id: product.category }, [product], 300);
    const styleAt = (factor: number) => ({ ...style, ...resize(factor)?.style });

    assert.equal(styleAt(1.5).elementStyles.productName?.fontSize, 30);
    assert.equal(styleAt(1.5).elementStyles.productDescription?.fontSize, 19);
    assert.equal(styleAt(1.5).imageScale, 2.5);
    assert.equal(styleAt(2).elementStyles.productName?.fontSize, 40);
    assert.equal(styleAt(2).elementStyles.productDescription?.fontSize, 19);
    assert.equal(styleAt(2).elementStyles.productPrice?.fontSize, 40);
    assert.equal(styleAt(4).elementStyles.productName?.fontSize, 60);
    assert.equal(styleAt(4).elementStyles.productPrice?.fontSize, 50);
    assert.equal(styleAt(0.8).elementStyles.productName?.fontSize, 16);
    assert.equal(styleAt(0.8).elementStyles.productDescription?.fontSize, 15);
    assert.equal(styleAt(0).imageScale, 0.5);
    assert.equal(resize(1), undefined);
});
