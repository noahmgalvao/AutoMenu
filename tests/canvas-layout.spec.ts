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

  test('a category can cross columns in both directions in one touch gesture', async ({ page }) => {
    await page.goto('/tests/fixtures/template-editor.html?layout=categories');
    const category = page.locator('[data-category-chunk="Entradas"]');
    const start = (await category.locator('[data-category-id="Entradas"]').boundingBox())!;
    const destination = (await page.locator('[data-category-chunk="Principais"]').boundingBox())!;
    const session = await page.context().newCDPSession(page);
    const left = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
    const right = { x: destination.x + destination.width / 2, y: destination.y + destination.height + 100 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left] });
    await page.waitForTimeout(550);
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [right] });
    await expect(category).toHaveAttribute('data-drag-column-index', '1');
    await page.waitForTimeout(1000);
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: left.x, y: right.y }] });
    await expect(category).toHaveAttribute('data-drag-column-index', '0');
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(category).toHaveAttribute('data-drag-column-index', '0');
  });
});

test('a narrow free text keeps its selection buttons in a single row', async ({ page }) => {
  const source = page.locator('#product-container-text-a');
  await source.click();
  const buttons = source.getByRole('button', { name: /Seleção múltipla|Mais opções/ });
  await expect(buttons).toHaveCount(2);
  const rows = await buttons.evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)));
  expect(new Set(rows).size).toBe(1);
});

test('double click places free text at the page coordinate without column handles', async ({ page }) => {
  const canvasPage = page.locator('[data-menu-print-page]').first();
  const bounds = (await canvasPage.boundingBox())!;
  const point = { x: Math.floor(bounds.width * 0.49), y: 474 };
  await canvasPage.dblclick({ position: point });
  const draft = page.locator('[contenteditable=true]').filter({ hasText: 'Novo texto' });
  await expect(draft).toHaveText('Novo texto');
  await expect.poll(async () => Math.abs((await draft.boundingBox())!.x - bounds.x - point.x)).toBeLessThan(3);
  await draft.fill('Texto novo');
  await page.keyboard.press('Enter');
  const text = canvasPage.getByText('Texto novo', { exact: true });
  await expect.poll(async () => Math.abs((await text.boundingBox())!.x - bounds.x - point.x)).toBeLessThan(8);
  await text.click();
  await expect(canvasPage.locator('[data-column-resize-handle]')).toHaveCount(0);
});

test('free text stays in the same insertion slot while the pointer hovers between products', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?layout=products');
  const source = page.locator('#product-container-text-a');
  const target = page.locator('#product-container-2');
  const start = (await source.boundingBox())!;
  const slot = (await target.boundingBox())!;
  const x = slot.x + slot.width / 2;
  const y = slot.y + slot.height / 2;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 6 });
  await expect(source).toHaveAttribute('data-drag-group', 'Entradas');
  const order = () => page.locator('[data-category-chunk="Entradas"] [data-drag-type="product"]').evaluateAll(
    elements => elements.map(element => element.getAttribute('data-drag-id'))
  );
  const settled = await order();
  for (const offset of [2, -2, 2, -2, 1, 0]) {
    await page.mouse.move(x, y + offset);
    expect(await order()).toEqual(settled);
  }
  await page.mouse.up();
});

test('dragging a category onto detached text moves the text into the category’s old space', async ({ page }) => {
  const category = page.locator('[data-category-chunk="Entradas"]');
  const text = page.locator('#product-container-text-b');
  const initial = (await category.boundingBox())!;
  const header = (await category.locator('[data-category-id="Entradas"]').boundingBox())!;
  const slot = (await text.boundingBox())!;
  await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2);
  await page.mouse.down();
  await page.mouse.move(slot.x + slot.width / 2, slot.y + slot.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(category).toHaveAttribute('data-drag-column-index', '1');
  await expect.poll(async () => Math.abs((await text.boundingBox())!.y - initial.y)).toBeLessThan(4);
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

test('quick controls stay in a usable row with side insertion and a separate column resize handle', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=cards&cols=2&lanes=2');
  const product = page.locator('#product-container-1');
  await product.getByRole('heading').click();
  const quick = product.locator('[data-canvas-action-group="quick"]');
  await expect(quick.getByRole('button').first()).toHaveAttribute('title', 'Editar produto');
  await expect(product.getByTitle('Adicionar item à direita')).toBeVisible();
  await expect(product.getByTitle('Ajustar largura da coluna pela borda direita')).toBeVisible();
  const quickRects = await quick.getByRole('button').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { y: Math.round(rect.top), width: rect.width };
  }));
  expect(new Set(quickRects.map(rect => rect.y)).size).toBe(1);
  expect(Math.min(...quickRects.map(rect => rect.width))).toBeGreaterThanOrEqual(38);
  const overlap = await product.evaluate(node => {
    const controls = [...node.querySelectorAll('[data-canvas-action-group] button')].map(button => button.getBoundingClientRect());
    const intersects = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
      && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    const handle = node.querySelector('[data-column-resize-handle]')!.getBoundingClientRect();
    const range = document.createRange();
    const onText = [...node.querySelectorAll('[data-word-fit]')].some(element => {
      range.selectNodeContents(element);
      return [...range.getClientRects()].some(rect => intersects(handle, rect));
    });
    return onText || controls.some((rect, i) => controls.slice(i + 1).some(other => intersects(rect, other)));
  });
  expect(overlap).toBe(false);
});

test('a fast drag across detached text at the top swaps the category into its place', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?layout=top-detached');
  const category = page.locator('[data-category-chunk="Entradas"]');
  const text = page.locator('#product-container-text-a');
  const header = (await category.locator('[data-category-id="Entradas"]').boundingBox())!;
  const originalText = (await text.boundingBox())!;
  await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2);
  await page.mouse.down();
  await page.mouse.move(header.x + header.width / 2, originalText.y - 10);
  await page.mouse.move(header.x + header.width / 2 + 1, originalText.y - 9);
  await page.mouse.up();
  await expect.poll(async () => (await category.boundingBox())!.y - (await text.boundingBox())!.y).toBeLessThan(-10);
});

test('detached text swaps with a category even when the pointer skips past the whole heading', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?layout=top-detached');
  const category = page.locator('[data-category-chunk="Entradas"]');
  const text = page.locator('#product-container-text-a');
  const header = (await category.locator('[data-category-id="Entradas"]').boundingBox())!;
  const start = (await text.boundingBox())!;
  const x = start.x + start.width / 2;
  const y = header.y + header.height + 8;
  await page.mouse.move(x, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y);
  await page.mouse.move(x + 1, y + 1);
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await category.boundingBox())!.y - start.y)).toBeLessThan(5);
  await expect.poll(async () => (await text.boundingBox())!.y - (await category.boundingBox())!.y).toBeGreaterThan(10);
});

test('dragging the first free text past its category heading leaves it above the group', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?layout=top-attached');
  const category = page.locator('[data-category-chunk="Entradas"]');
  const source = page.locator('#product-container-text-a');
  const header = (await category.locator('[data-category-id="Entradas"]').boundingBox())!;
  const start = (await source.boundingBox())!;
  const left = start.x + start.width / 2;
  await page.mouse.move(left, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(left, header.y - 2);
  await page.mouse.move(left + 1, header.y + 1);
  await page.mouse.up();
  await expect(source).toHaveAttribute('data-drag-group', /^ft_zone_/);
  await expect.poll(async () => (await category.boundingBox())!.y - ((await source.boundingBox())!.y + start.height)).toBeGreaterThanOrEqual(0);
});
