import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareMenuImport } from '../src/application/imports/menuImport';
import { PRESET_TEMPLATES } from '../src/domain/templates/templateCatalog';

test('product import uploads the source, analyzes it and records the result in order', async () => {
  const calls: string[] = [];
  const file = new File(['content'], 'menu.png', { type: 'image/png' });
  const product = { id: 'imported-juice', name: 'Suco de uva', description: '', price: 10, category: 'Bebidas' };
  const imported = await prepareMenuImport({
    files: [file], importMode: 'products', currentProducts: [], currentStyle: PRESET_TEMPLATES[0],
    workspaceId: 'workspace', userId: 'user', menuId: 'menu',
  }, {
    async uploadFileAsset(input) {
      calls.push('upload');
      assert.equal(input.file, file);
      assert.equal(input.assetType, 'ai_source_image');
      assert.deepEqual(input.metadata, { menu_id: 'menu', page_index: 0 });
      return {
        url: 'https://example.test/menu.png',
        asset: { id: 'source', workspaceId: 'workspace', bucket: 'ai-imports', path: 'menu.png', sourceUrl: null,
          assetType: 'ai_source_image', mimeType: 'image/png', sizeBytes: file.size, checksum: null,
          metadata: {}, createdBy: 'user', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
      };
    },
    async fileToGenerativePart(input) {
      calls.push('read');
      assert.equal(input, file);
      return 'Y29udGVudA==';
    },
    async getImageDimensions(input) {
      calls.push('dimensions');
      assert.equal(input, 'data:image/png;base64,Y29udGVudA==');
      return { width: 794, height: 1123 };
    },
    async analyzeMenuImage(base64, mimeType, dimensions) {
      calls.push('analysis');
      assert.equal(base64, 'Y29udGVudA==');
      assert.equal(mimeType, 'image/png');
      assert.deepEqual(dimensions, { width: 794, height: 1123 });
      return { products: [product], categories: [{ id: 'drinks', name: 'Bebidas', products: [product] }], extractedImages: [], styleSuggestion: {} };
    },
    async createAiImportJob(input) {
      calls.push('record');
      assert.equal(input.sourceAssetId, 'source');
      assert.equal(input.createdMenuId, 'menu');
      assert.equal(input.normalizedResult.importMode, 'products');
    },
    uploadDataUrlAsset: async () => assert.fail('Product import must not upload visual assets'),
    createCleanBackground: async () => assert.fail('Product import must not process a background'),
    processDecoration: async () => assert.fail('Product import must not crop decorations'),
  });

  assert.deepEqual(calls, ['upload', 'read', 'dimensions', 'analysis', 'record']);
  assert.equal(imported.sourceAssetId, 'source');
  assert.equal(imported.style, null);
  assert.deepEqual(imported.products?.map(({ name, price }) => ({ name, price })), [{ name: 'Suco de uva', price: 10 }]);
});
