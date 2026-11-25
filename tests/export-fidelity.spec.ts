import { expect, test } from '@playwright/test';

for (const columns of [2, 3]) {
  test(`PDF and JPG use the cleared canvas page at print resolution with ${columns} columns`, async ({ page }) => {
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    await page.setViewportSize({ width: 900, height: 1200 });
    await page.goto(`/tests/fixtures/template-editor.html?photos=card&cols=1&lanes=${columns}&no-photos&keep-categories`);
    const canvasPage = page.locator('[data-menu-print-page]').first();
    await expect(canvasPage.locator('[data-product-text-row]').first()).toBeVisible();
    await expect(canvasPage.locator('[data-drag-column-container="category"]:has([data-product-text-row])')).toHaveCount(columns);

    // Compare the output with Chromium's screen rendering of the preview at 1:1 CSS scale.
    await canvasPage.evaluate(async element => {
      const copy = element.cloneNode(true) as HTMLElement;
      copy.id = 'export-test-reference';
      const path = '/src/infrastructure/browser/printPageContent.ts';
      const { preparePrintPageContent } = await import(path) as typeof import('../src/infrastructure/browser/printPageContent');
      preparePrintPageContent(copy, true);
      const rows = copy.querySelectorAll<HTMLElement>('[data-product-text-row]');
      for (const [index, row] of Array.from(rows).entries()) {
        row.dataset.compactPriceGap = 'end';
        row.style.setProperty('--product-price-space-share', '0');
        row.style.setProperty('--product-price-gap', '0px');
        row.style.columnGap = '0';
        const name = row.querySelector<HTMLElement>('[data-divider-title]')!;
        Object.assign(name.style, {
          color: '#05f', fontFamily: 'Arial', fontSize: '15px', fontWeight: '700',
          letterSpacing: '.2px', wordSpacing: '1px',
        });
        if (index === 1) {
          name.textContent = 'Burger de Grão-de-Bico com molho';
          name.style.maxWidth = '120px';
        }
      }
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#fff';
      host.append(copy);
      document.body.append(host);
      await document.fonts.ready;
    });
    const reference = page.locator('#export-test-reference');
    const screen = await reference.screenshot({ animations: 'disabled' });
    const results = await reference.evaluate(async (element, screenshot) => {
      if (!(element instanceof HTMLElement)) throw new Error('A página do cardápio não foi encontrada.');
      await document.fonts.ready;
      const path = '/src/infrastructure/browser/pdfExport.ts';
      const { exportMenuPageToJpg, exportMenuPagesToPdf } = await import(path) as typeof import('../src/infrastructure/browser/pdfExport');
      const assets = new Map<string, Promise<string>>();
      const original = await exportMenuPageToJpg(element, 1, 'Referência', assets);
      const outline = document.createElement('span');
      outline.setAttribute('data-canvas-selection-outline', '');
      outline.style.cssText = 'position:absolute;top:0;right:0;width:40px;height:40px;background:#f00;z-index:9999';
      element.append(outline);
      const withOutline = await exportMenuPageToJpg(element, 1, 'Cardápio', assets);
      const image = await createImageBitmap(withOutline);
      const pdf = await exportMenuPagesToPdf({
        pageElements: [element], currentPageIndex: null, title: 'Cardápio', download: false,
        options: {
          pageMode: 'all', pageRange: '', paperSize: 'A4', orientation: 'portrait',
          customPaperWidthMm: 210, customPaperHeightMm: 297, marginPreset: '0', customMarginMm: 0,
          scaleMode: 'fit', customScale: 100, bleedMm: 0, cropMarks: false, pageNumbers: false,
          printBackgrounds: true, grayscale: false, includeCanvasShadow: false,
        },
      });
      outline.remove();
      const jpegBytes = new Uint8Array(await withOutline.arrayBuffer());
      const pdfBytes = new Uint8Array(await pdf.blob.arrayBuffer());
      const imageStart = pdfBytes.findIndex((byte, index) => byte === 0xff && pdfBytes[index + 1] === 0xd8);
      const originalData = new Uint8Array(await original.arrayBuffer());
      const preview = await createImageBitmap(await (await fetch(`data:image/png;base64,${screenshot}`)).blob());
      const canvas = document.createElement('canvas');
      canvas.width = preview.width;
      canvas.height = preview.height;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      const pixels = (source: ImageBitmap) => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const screenPixels = pixels(preview);
      const exportedPixels = pixels(image);
      const blue = (data: Uint8ClampedArray, offset: number) =>
        data[offset + 2] - data[offset] > 100 && data[offset + 2] - data[offset + 1] > 60;
      let previewTextPixels = 0;
      let displacedTextPixels = 0;
      let missingTextPixels = 0;
      const stride = canvas.width * 4;
      const hasNearbyInk = (data: Uint8ClampedArray, index: number) =>
        [-stride, 0, stride].some(y => [-4, 0, 4].some(x => blue(data, index + x + y)));
      for (let index = 0; index < screenPixels.length; index += 4) {
        if (blue(screenPixels, index)) {
          previewTextPixels++;
          if (!hasNearbyInk(exportedPixels, index)) missingTextPixels++;
        }
        if (blue(exportedPixels, index) && !hasNearbyInk(screenPixels, index)) displacedTextPixels++;
      }
      preview.close();
      const result = {
        width: image.width, height: image.height,
        expectedWidth: Math.round(element.offsetWidth * 300 / 96),
        expectedHeight: Math.round(element.offsetHeight * 300 / 96),
        identicalWithoutControls: originalData.length === jpegBytes.length && originalData.every((byte, index) => byte === jpegBytes[index]),
        samePdfImage: imageStart >= 0 && jpegBytes.every((byte, index) => byte === pdfBytes[imageStart + index]),
        previewTextPixels,
        misplacedRatio: displacedTextPixels / previewTextPixels,
        missingRatio: missingTextPixels / previewTextPixels,
      };
      image.close();
      return result;
    }, screen.toString('base64'));

    expect(results.previewTextPixels).toBeGreaterThan(40);
    expect(results.misplacedRatio).toBeLessThan(0.03);
    expect(results.missingRatio).toBeLessThan(0.05);
    expect(results.width).toBe(results.expectedWidth);
    expect(results.height).toBe(results.expectedHeight);
    expect(results.identicalWithoutControls).toBe(true);
    expect(results.samePdfImage).toBe(true);
  });
}

test('export reports a capture failure instead of switching to a different renderer', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?neutral');
  const source = page.locator('[data-menu-print-page]').first();
  const code = await source.evaluate(async element => {
    if (!(element instanceof HTMLElement)) throw new Error('A página do cardápio não foi encontrada.');
    const path = '/src/infrastructure/browser/pdfExport.ts';
    const { exportMenuPageToJpg, PdfExportError } = await import(path) as typeof import('../src/infrastructure/browser/pdfExport');
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      if (this.src.startsWith('data:image/svg+xml;charset=')) return Promise.reject(new Error('Native rendering unavailable'));
      return decode.call(this);
    };
    try {
      await exportMenuPageToJpg(element, 1, 'Cardápio', new Map());
      return null;
    } catch (error) {
      return error instanceof PdfExportError ? error.code : String(error);
    } finally {
      HTMLImageElement.prototype.decode = decode;
    }
  });
  expect(code).toBe('PDF_NATIVE_RENDER_UNAVAILABLE');
});
