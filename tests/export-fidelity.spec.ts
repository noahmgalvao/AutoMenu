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
      preparePrintPageContent(copy);
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
      const { exportProfileFiles, getPageElementSizePx } = await import(path) as typeof import('../src/infrastructure/browser/pdfExport');
      const size = getPageElementSizePx(element);
      const source = () => [{ number: 1, size, snapshot: element.cloneNode(true) as HTMLElement }];
      const settings = { dpi: 300, bleed: 0, marks: false, markOffset: 0, color: 'RGB' as const, quality: 100 };
      const [original] = await exportProfileFiles(source(), 'JPG', settings, 'Referência');
      const outline = document.createElement('span');
      outline.setAttribute('data-canvas-selection-outline', '');
      outline.style.cssText = 'position:absolute;top:0;right:0;width:40px;height:40px;background:#f00;z-index:9999';
      element.append(outline);
      const [withOutline] = await exportProfileFiles(source(), 'JPG', settings, 'Cardápio');
      const image = await createImageBitmap(withOutline);
      const [pdf] = await exportProfileFiles(source(), 'PDF', settings, 'Cardápio');
      outline.remove();
      const jpegBytes = new Uint8Array(await withOutline.arrayBuffer());
      const originalData = new Uint8Array(await original.arrayBuffer());
      const pdfjsModule = '/node_modules/pdfjs-dist/build/pdf.mjs';
      const pdfjs = await import(pdfjsModule) as typeof import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.min.mjs';
      const loading = pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) });
      const pdfDoc = await loading.promise;
      const pdfPage = await pdfDoc.getPage(1);
      const pdfCanvas = document.createElement('canvas');
      const pdfViewport = pdfPage.getViewport({ scale: size.width / pdfPage.getViewport({ scale: 1 }).width });
      pdfCanvas.width = Math.round(pdfViewport.width);
      pdfCanvas.height = Math.round(pdfViewport.height);
      await pdfPage.render({ canvas: pdfCanvas, viewport: pdfViewport }).promise;
      const pdfImage = await createImageBitmap(pdfCanvas);
      await loading.destroy();
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
      const pdfPixels = pixels(pdfImage);
      pdfImage.close();
      const blue = (data: Uint8ClampedArray, offset: number) =>
        data[offset + 2] - data[offset] > 100 && data[offset + 2] - data[offset + 1] > 60;
      let previewTextPixels = 0;
      let displacedTextPixels = 0;
      let missingTextPixels = 0;
      let missingPdfTextPixels = 0;
      const stride = canvas.width * 4;
      const hasNearbyInk = (data: Uint8ClampedArray, index: number) =>
        [-stride, 0, stride].some(y => [-4, 0, 4].some(x => blue(data, index + x + y)));
      for (let index = 0; index < screenPixels.length; index += 4) {
        if (blue(screenPixels, index)) {
          previewTextPixels++;
          if (!hasNearbyInk(exportedPixels, index)) missingTextPixels++;
          if (!hasNearbyInk(pdfPixels, index)) missingPdfTextPixels++;
        }
        if (blue(exportedPixels, index) && !hasNearbyInk(screenPixels, index)) displacedTextPixels++;
      }
      preview.close();
      const result = {
        width: image.width, height: image.height,
        expectedWidth: Math.round(size.widthMm! / 25.4 * 300),
        expectedHeight: Math.round(size.heightMm! / 25.4 * 300),
        identicalWithoutControls: originalData.length === jpegBytes.length && originalData.every((byte, index) => byte === jpegBytes[index]),
        missingPdfRatio: missingPdfTextPixels / previewTextPixels,
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
    expect(results.missingPdfRatio).toBeLessThan(0.06);
  });
}

test('export reports a capture failure instead of switching to a different renderer', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?neutral');
  const source = page.locator('[data-menu-print-page]').first();
  const code = await source.evaluate(async element => {
    if (!(element instanceof HTMLElement)) throw new Error('A página do cardápio não foi encontrada.');
    const path = '/src/infrastructure/browser/pdfExport.ts';
    const { exportProfileFiles, getPageElementSizePx, PdfExportError } = await import(path) as typeof import('../src/infrastructure/browser/pdfExport');
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      if (this.src.startsWith('data:image/svg+xml;charset=')) return Promise.reject(new Error('Native rendering unavailable'));
      return decode.call(this);
    };
    try {
      await exportProfileFiles([{ number: 1, size: getPageElementSizePx(element), snapshot: element.cloneNode(true) as HTMLElement }],
        'JPG', { dpi: 300, bleed: 0, marks: false, markOffset: 0, color: 'RGB', quality: 100 }, 'Cardápio');
      return null;
    } catch (error) {
      return error instanceof PdfExportError ? error.code : String(error);
    } finally {
      HTMLImageElement.prototype.decode = decode;
    }
  });
  expect(code).toBe('PDF_NATIVE_RENDER_UNAVAILABLE');
});
