import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRenderSnapshot, normalizePersistedProducts, DEFAULT_SORT_OPTION } from '../src/application/workspace/state';
import { INITIAL_PRODUCTS, INITIAL_STYLE } from '../src/domain/menu/defaults';
import { parsePriceInput, resolveMenuPriceDecimalPlaces } from '../src/domain/menu/price';

test('explicit zero cents survive a menu snapshot and are cleared when the price is entered as an integer', () => {
  const original = INITIAL_PRODUCTS[0];
  const explicitPrice = parsePriceInput('9,00');
  assert.deepEqual(explicitPrice, { price: 9, priceEnteredWithDecimals: true });
  const snapshot = createRenderSnapshot([{ ...original, ...explicitPrice }, INITIAL_PRODUCTS[1]], INITIAL_STYLE, DEFAULT_SORT_OPTION);
  const products = normalizePersistedProducts(JSON.parse(JSON.stringify(snapshot)).products);
  assert.equal(products[0].price, 9);
  assert.equal(resolveMenuPriceDecimalPlaces(INITIAL_STYLE, products), 2);
  assert.equal(resolveMenuPriceDecimalPlaces(INITIAL_STYLE, [{ ...products[0], ...parsePriceInput('9') }, products[1]]), 0);
});
