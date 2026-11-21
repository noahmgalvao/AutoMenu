import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { PRESET_TEMPLATES } from '../src/domain/templates/templateCatalog.ts';
import { INITIAL_STYLE } from '../src/domain/menu/defaults.ts';

const destination = process.argv[2] || 'test-results/catalog-review';
const url = 'http://127.0.0.1:4188/tests/fixtures/template-catalog-review.html';
const executablePath = process.env.AUTOMENU_CHROMIUM;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4188', '--strictPort'],
  { stdio: 'inherit' });
let browser;
try {
  await mkdir(destination, { recursive: true });
  for (let attempts = 0; attempts < 100; attempts++) {
    if (await fetch(url).then(response => response.ok, () => false)) break;
    await delay(200);
  }
  browser = await chromium.launch({ executablePath,
    args: executablePath ? ['--no-zygote', '--disable-gpu', '--disable-software-rasterizer', '--use-gl=disabled', '--disable-gpu-compositing'] : [] });
  const page = await browser.newPage({ viewport: { width: 1700, height: 1800 } });
  const stats = [];
  await page.on('pageerror', error => console.error(error));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.reviewTemplate === 'function');

  const catalog = [...PRESET_TEMPLATES, INITIAL_STYLE];
  for (const [index, template] of catalog.entries()) {
    for (const adverse of index < PRESET_TEMPLATES.length ? [false, true] : [false]) {
      await page.evaluate(([next, challenging]) => window.reviewTemplate(next, challenging), [index, adverse]);
      await page.locator(`[data-catalog-review="${index}:${adverse}"] [data-menu-print-page]`).first().waitFor();
      await page.evaluate(async () => {
        await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 650))]);
        await Promise.all(Array.from(document.images, img => img.decode().catch(() => undefined)));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      const paper = page.locator('[data-menu-print-page]');
      const pages = await paper.count();
      const metrics = await paper.evaluateAll(elements => ({
        products: elements.reduce((count, element) => count + element.querySelectorAll('[data-template-product]').length, 0),
        clippedProducts: elements.flatMap(element => {
          const bounds = element.getBoundingClientRect();
          return Array.from(element.querySelectorAll('[data-template-product], [data-template-price]')).flatMap(item => {
            const rect = item.getBoundingClientRect();
            return rect.height && (rect.bottom > bounds.bottom + 1 || rect.right > bounds.right + 1 || rect.left < bounds.left - 1)
              ? [item.textContent] : [];
          });
        }),
      }));
      await paper.first().screenshot({ type: 'jpeg', quality: 87, path: `${destination}/${adverse ? 'adverse' : 'sample'}-${template.id}.jpg` });
      stats.push({ index, id: template.id, name: template.name, adverse, pages, ...metrics });
      if (!adverse && ['moderno-limpo', 'menu-board', 'food-truck-color', 'patisserie-rose'].includes(template.id)) {
        const pdf = await page.evaluate(() => window.reviewMenuPdf());
        await writeFile(`${destination}/${template.id}.pdf`, Buffer.from(pdf.split(',')[1], 'base64'));
      }
    }
    console.log(`${index + 1}/${catalog.length} ${template.name}`);
  }
  await writeFile(`${destination}/metrics.json`, JSON.stringify(stats, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
