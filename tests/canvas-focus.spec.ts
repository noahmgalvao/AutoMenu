import { expect, test } from '@playwright/test';

const fixture = '/tests/fixtures/template-editor.html?batch-layers';

test('wheel and zoom buttons preserve their canvas focus', async ({ page }) => {
  await page.goto(fixture);
  const canvas = page.locator('[data-automenu-editor-canvas]');
  const layer = canvas.locator('[data-canvas-zoom-layer]');
  await expect(layer.locator('[data-menu-print-page]').first()).toBeVisible();
  const box = (await canvas.boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cursor = { x: center.x + 89, y: center.y - 102 };
  const read = (point: typeof cursor) => layer.evaluate((el, p) => {
    const rect = el.getBoundingClientRect();
    const scale = rect.width / (el as HTMLElement).offsetWidth;
    return { x: (p.x - rect.left) / scale, y: (p.y - rect.top) / scale, scale };
  }, point);
  const check = async (before: Awaited<ReturnType<typeof read>>, point: typeof cursor) => {
    const after = await read(point);
    expect(Math.abs(before.scale - after.scale)).toBeGreaterThan(0.01);
    expect(Math.hypot(before.x - after.x, before.y - after.y) * after.scale).toBeLessThan(2);
  };
  for (const deltaY of [65, -90]) {
    const before = await read(cursor);
    await canvas.dispatchEvent('wheel', { ctrlKey: true, clientX: cursor.x, clientY: cursor.y, deltaY });
    await check(before, cursor);
  }
  for (const name of ['Aumentar zoom', 'Diminuir zoom']) {
    const before = await read(center);
    await page.getByRole('button', { name, exact: true }).click();
    await check(before, center);
  }
});

test.describe('touch zoom', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('a moving pinch keeps the same page point between the fingers', async ({ page }) => {
    await page.goto(fixture);
    const paper = page.locator('[data-menu-print-page]').first();
    await expect(paper).toBeVisible();
    const start = { x: 170, y: 210 };
    const before = (await paper.boundingBox())!;
    const anchor = { x: (start.x - before.x) / before.width, y: (start.y - before.y) / before.height };
    const input = await page.context().newCDPSession(page);
    const fingers = (x: number, y: number, radius: number) => [{ x: x - radius, y, id: 1 }, { x: x + radius, y, id: 2 }];
    await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(start.x, start.y, 24) });
    for (const [x, y, radius] of [[193, 229, 42], [150, 218, 18]]) {
      await input.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(x, y, radius) });
      await expect.poll(async () => {
        const rect = (await paper.boundingBox())!;
        return Math.abs(rect.width / before.width - radius / 24) < 0.02
          && Math.hypot(rect.x + anchor.x * rect.width - x, rect.y + anchor.y * rect.height - y) < 2;
      }).toBe(true);
    }
    await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  });
});

for (const id of ['shape-left', 'batch-photo']) {
  test(`repeated background ${id} stays selected across pages with reachable shortcuts`, async ({ page }) => {
    await page.goto(fixture);
    const pages = page.locator('[data-menu-print-page]');
    const original = pages.nth(0);
    const repeated = pages.nth(1);
    const image = `[data-added-image-id="${id}"]`;
    const outline = `[data-image-selection-overlay="${id}"]`;
    const controls = page.locator('[data-object-page-index]');
    await original.locator(image).click();
    await controls.getByTitle('Mais opções').click();
    await page.locator('[data-canvas-object-menu]').getByRole('button', { name: 'Integrar ao plano de fundo', exact: true }).click();
    await controls.getByTitle('Seleção múltipla').click();
    await repeated.locator(image).click();
    await expect(original.locator(outline)).toHaveCount(1);
    await expect(repeated.locator(outline)).toHaveCount(1);
    await expect(controls.getByTitle('Seleção múltipla')).toHaveAttribute('aria-pressed', 'true');

    // Force paper content in front of all other objects and hit-test the shortcut.
    await repeated.evaluate(el => {
      const cover = document.createElement('div');
      cover.dataset.testCover = 'true';
      cover.style.cssText = 'position:absolute;inset:0;z-index:2147483647;background:white';
      el.append(cover);
    });
    await controls.getByTitle('Mais opções').click({ timeout: 5000 });
    await expect(page.locator('[data-canvas-object-menu]')).toBeVisible();
    await repeated.locator('[data-test-cover]').evaluate(el => el.remove());
    await page.locator('[data-canvas-object-menu]').getByRole('button', { name: 'Inverter horizontalmente' }).click();
    for (const paper of [original, repeated]) {
      await expect(paper.locator(image).locator('img')).toHaveCSS('transform', 'matrix(-1, 0, 0, 1, 0, 0)');
    }
    await repeated.locator(outline).click();
    await expect(repeated.locator(outline)).toHaveCount(0);
    await expect(original.locator(outline)).toHaveCount(1);
    await expect(controls.getByTitle('Seleção múltipla')).toHaveAttribute('aria-pressed', 'true');
  });
}
