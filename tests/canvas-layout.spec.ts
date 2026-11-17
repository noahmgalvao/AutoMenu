import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ body: '', contentType: 'text/css' }));
  await page.goto('/tests/fixtures/template-editor.html?layout');
});

test('free text keeps following the mouse after swapping with another text', async ({ page }) => {
  const source = page.locator('#product-container-text-a');
  const target = page.locator('#product-container-text-b');
  const start = (await source.boundingBox())!;
  const destination = (await target.boundingBox())!;
  const x = start.x + start.width / 2;
  const y = start.y + start.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, destination.y + destination.height / 2, { steps: 12 });
  await expect.poll(async () => (await source.boundingBox())!.y).toBeGreaterThan(start.y + 60);
  await expect.poll(async () => (await target.boundingBox())!.y).toBeLessThan(destination.y - 20);
  const swappedY = (await source.boundingBox())!.y;
  await page.mouse.move(x + 50, destination.y + 150, { steps: 12 });
  await expect.poll(async () => (await source.boundingBox())!.y).toBeGreaterThan(swappedY + 60);
  await page.mouse.up();
});

test.describe('touch dragging', () => {
  test.use({ hasTouch: true });

  test('free text keeps the same gesture across a swap', async ({ page }) => {
    const source = page.locator('#product-container-text-a');
    const target = page.locator('#product-container-text-b');
    const start = (await source.boundingBox())!;
    const destination = (await target.boundingBox())!;
    const session = await page.context().newCDPSession(page);
    const x = start.x + start.width / 2;
    const y = start.y + start.height / 2;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(350);
    const destinationY = destination.y + destination.height / 2;
    for (let step = 1; step <= 12; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (destinationY - y) * step / 12 }] });
    }
    await expect.poll(async () => (await source.boundingBox())!.y).toBeGreaterThan(start.y + 60);
    await expect.poll(async () => (await target.boundingBox())!.y).toBeLessThan(destination.y - 20);
    const swappedY = (await source.boundingBox())!.y;
    await page.waitForTimeout(1000);
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 50, y: destinationY + 120 }] });
    await expect.poll(async () => (await source.boundingBox())!.y).toBeGreaterThan(swappedY + 60);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  });

  test('a swipe before the long press scrolls the canvas', async ({ page }) => {
    const canvas = page.locator('[data-automenu-editor-canvas]');
    const start = (await page.locator('#product-container-text-a').boundingBox())!;
    const session = await page.context().newCDPSession(page);
    const x = start.x + start.width / 2;
    const y = start.y + start.height / 2;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 80 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => canvas.evaluate((element) => element.scrollTop)).toBeGreaterThan(50);
  });
});

test('a narrow free text keeps its selection buttons in a single row', async ({ page }) => {
  const source = page.locator('#product-container-text-a');
  await source.click();
  const buttons = source.getByRole('button', { name: /Editar texto|Seleção múltipla|Excluir item|Mais opções/ });
  await expect(buttons).toHaveCount(4);
  const rows = await buttons.evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)));
  expect(new Set(rows).size).toBe(1);
});

test('a category stays in the available gap between positioned categories after release', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?layout=categories');
  const category = page.locator('[data-category-chunk="Entradas"]');
  const header = category.locator('[data-category-id="Entradas"]');
  const above = page.locator('[data-category-chunk="Principais"]');
  const below = page.locator('[data-category-chunk="Sobremesas"]');
  const start = (await header.boundingBox())!;
  const top = (await above.boundingBox())!;
  const bottom = (await below.boundingBox())!;
  const desiredY = (top.y + top.height + bottom.y) / 2;

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(top.x + top.width / 2, desiredY + start.height / 2, { steps: 20 });
  await page.mouse.up();

  await expect(category).toHaveAttribute('data-drag-column-index', '1');
  await expect(category).toHaveAttribute('data-drag-page-index', '0');
  await expect.poll(async () => Math.abs((await category.boundingBox())!.y - desiredY)).toBeLessThan(5);
  await expect(below).toHaveAttribute('data-drag-page-index', '0');
  await expect(page.locator('[data-menu-print-page="true"]')).toHaveCount(1);
});
