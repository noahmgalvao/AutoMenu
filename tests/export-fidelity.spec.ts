import { expect, test } from '@playwright/test';
import type { PdfDebugEntry } from '../src/infrastructure/browser/pdfExport';

for (const columns of [2, 3]) {
  test(`PDF and JPG use the cleared canvas page at print resolution with ${columns} columns`, async ({ page }) => {
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    await page.goto(`/tests/fixtures/template-editor.html?cols=${columns}&lanes=${columns}`);
    const canvasPage = page.locator('[data-menu-print-page]').first();
    await expect(canvasPage.locator('[data-product-text-row]').first()).toBeVisible();

    const results = await canvasPage.evaluate(async element => {
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
      const debug: PdfDebugEntry[] = [];
      const pdf = await exportMenuPagesToPdf({
        pageElements: [element], currentPageIndex: null, title: 'Cardápio', download: false,
        onDebug: entry => debug.push(entry),
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
      const result = {
        width: image.width, height: image.height,
        expectedWidth: Math.round(element.offsetWidth * 300 / 96),
        expectedHeight: Math.round(element.offsetHeight * 300 / 96),
        identicalWithoutControls: originalData.length === jpegBytes.length && originalData.every((byte, index) => byte === jpegBytes[index]),
        samePdfImage: imageStart >= 0 && jpegBytes.every((byte, index) => byte === pdfBytes[imageStart + index]),
        usedCompatibilityRenderer: debug.some(entry => entry.code === 'PDF_NATIVE_RENDER_UNAVAILABLE'),
      };
      image.close();
      return result;
    });

    expect(results.usedCompatibilityRenderer).toBe(false);
    expect(results.width).toBe(results.expectedWidth);
    expect(results.height).toBe(results.expectedHeight);
    expect(results.identicalWithoutControls).toBe(true);
    expect(results.samePdfImage).toBe(true);
  });
}
