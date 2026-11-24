import { canvasActionsFor, shortcutsFor } from './fixtures/canvas-shortcuts';
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

  test('tapping the same more options trigger twice closes its menu', async ({ page }) => {
    await page.goto('/tests/fixtures/template-editor.html?photos=list&no-photos');
    const product = page.locator('#product-container-1');
    const trigger = shortcutsFor(product).getByTitle('Mais opções');
    const menu = page.locator('[data-canvas-object-menu]');

    await product.getByRole('heading').tap();
    await trigger.tap();
    await expect(menu).toBeVisible();
    await trigger.tap();
    await expect(menu).toHaveCount(0);
  });

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
  const buttons = shortcutsFor(source).getByRole('button', { name: /Editar texto|Seleção múltipla|Remover|Mais opções/ });
  await expect.poll(() => buttons.evaluateAll(elements => elements.map(element => element.getAttribute('title'))))
    .toEqual(['Editar texto', 'Seleção múltipla', 'Remover', 'Mais opções']);
  const rows = await buttons.evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)));
  expect(new Set(rows).size).toBe(1);
  await shortcutsFor(source).getByTitle('Editar texto').click();
  await expect(page.locator('#product-name-text-a')).toBeFocused();
  await page.keyboard.press('Escape');
  await shortcutsFor(source).getByTitle('Remover', { exact: true }).click();
  await expect(source).toHaveCount(0);
});

test('the layout tip keeps a split category together and fills its former column', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=list&lanes=2&split-category');
  const category = page.locator('[data-category-chunk="B"]');
  await expect(category).toHaveCount(2);
  await page.getByRole('button', { name: 'Abrir dicas do cardápio' }).click();
  await page.getByRole('button', { name: 'Trocar categorias de lugar' }).click();
  await expect(category).toHaveCount(1);
  await expect(category.locator('[data-drag-type="product"]')).toHaveCount(3);
  const originalColumn = page.locator('[data-drag-column-container="category"][data-drag-column-index="0"]').first();
  await expect(originalColumn.locator('[data-category-chunk]')).toHaveCount(2);
  await expect(originalColumn.locator('[data-category-chunk="C"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Trocar categorias de lugar' })).toHaveCount(0);
});

test('the right arrow is absent when the neighboring product cell is empty', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=cards&cols=2&single-product');
  const product = page.locator('#product-container-1');
  await product.getByRole('heading').click();
  await expect(canvasActionsFor(product, 'insert').getByTitle('Adicionar item à direita')).toBeVisible();
  await expect(canvasActionsFor(product, 'move').getByTitle('Mover à direita')).toHaveCount(0);
});

for (const touch of [false, true]) {
  test.describe(touch ? 'group drag on touch' : 'group drag with a mouse', () => {
    test.use({ hasTouch: touch });

    test('nonadjacent selected products reorder independently during the drag and keep their selection', async ({ page }) => {
      await page.goto('/tests/fixtures/template-editor.html?photos=list&dense-list&lanes=2');
      const first = page.locator('#product-container-side-1');
      const second = page.locator('#product-container-side-11');
      const between = page.locator('#product-container-side-2');
      const next = page.locator('#product-container-side-12');
      await first.getByRole('heading').click();
      await expect(canvasActionsFor(first, 'resize').getByTitle('Ajustar largura da coluna pela borda direita')).toBeVisible();
      await shortcutsFor(first).getByTitle('Seleção múltipla').click();
      await second.getByRole('heading').click();
      await expect(shortcutsFor(second).getByTitle('Seleção múltipla')).toHaveAttribute('aria-pressed', 'true');
      await expect(canvasActionsFor(first, 'insert')).toHaveCount(0);
      await expect(first.locator('[data-canvas-transform-handle="scale"]')).toHaveCount(0);
      await expect(canvasActionsFor(second, 'insert').getByRole('button')).toHaveCount(2);
      await expect(second.locator('[data-canvas-transform-handle="scale"]')).toHaveCount(2);
      await expect(canvasActionsFor(second, 'flow').getByRole('button').first()).toBeVisible();
      await expect(page.locator('[data-column-resize-handle]')).toHaveCount(0);

      const start = (await first.boundingBox())!;
      const destination = (await between.boundingBox())!;
      const x = start.x + 12;
      const y = start.y + start.height / 2;
      const end = y + destination.y - start.y;
      const session = touch ? await page.context().newCDPSession(page) : null;
      expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-drag-id]')?.id, { x, y }))
        .toBe('product-container-side-1');
      if (session) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await page.waitForTimeout(380);
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: end }] });
      } else {
        const initial = ['side-1', 'side-2', 'side-11', 'side-12'];
        const expected = ['side-2', 'side-1', 'side-12', 'side-11'];
        await page.mouse.move(x, y);
        await page.mouse.down();
        for (let step = y + 2; step < end; step += 2) {
          await page.mouse.move(x, step);
          const current = await first.evaluate((element, ids) => Array.from(element.parentElement!.children)
            .map(child => child.getAttribute('data-drag-id')).filter(id => id && ids.includes(id)), initial);
          expect([initial, expected]).toContainEqual(current);
        }
        await page.mouse.move(x, end);
      }
      await expect.poll(() => between.evaluate(element => [element.nextElementSibling?.id, element.nextElementSibling?.nextElementSibling?.id,
        element.nextElementSibling?.nextElementSibling?.nextElementSibling?.id]))
        .toEqual(['product-container-side-1', 'product-container-side-12', 'product-container-side-11']);
      await expect(first.locator('[data-canvas-selection-outline]')).toBeVisible();
      await expect(second.locator('[data-canvas-selection-outline]')).toBeVisible();
      if (session) await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      else await page.mouse.up();

      await expect.poll(() => next.evaluate(element => element.nextElementSibling?.id)).toBe('product-container-side-11');
      await expect(shortcutsFor(second).getByTitle('Seleção múltipla')).toHaveAttribute('aria-pressed', 'true');
    });
  });
}

test('dragging selected products from different categories moves only the pressed one', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=list&different-categories');
  const first = page.locator('#product-container-1');
  const next = page.locator('#product-container-2');
  const other = page.locator('#product-container-3');
  await first.getByRole('heading').click();
  await shortcutsFor(first).getByTitle('Seleção múltipla').click();
  await other.getByRole('heading').click();
  const start = (await first.boundingBox())!;
  const destination = (await next.boundingBox())!;
  const otherStart = (await other.boundingBox())!;
  const x = start.x + start.width / 2;
  await page.mouse.move(x, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, destination.y + destination.height * 0.75, { steps: 10 });
  await expect(first).toHaveAttribute('data-active-canvas-drag', 'true');
  await expect(first.locator('[data-canvas-selection-outline]')).toBeVisible();
  await page.mouse.up();
  await expect.poll(() => next.evaluate(element => element.nextElementSibling?.id)).toBe('product-container-1');
  await expect(shortcutsFor(first).getByTitle('Seleção múltipla')).toHaveAttribute('aria-pressed', 'false');
  expect((await other.boundingBox())!.y).toBeCloseTo(otherStart.y, 0);
});

test('detached free texts keep their spacing after dragging together', async ({ page }) => {
  const first = page.locator('#product-container-text-a');
  const second = page.locator('#product-container-text-b');
  await first.click();
  await shortcutsFor(first).getByTitle('Seleção múltipla').click();
  await second.click();
  const before = (await first.boundingBox())!;
  const other = (await second.boundingBox())!;
  const x = before.x + before.width / 2;
  const y = before.y + before.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 70, y + 110, { steps: 8 });
  await expect.poll(async () => Math.round((await first.boundingBox())!.y - before.y)).toBe(110);
  await expect.poll(async () => Math.round((await second.boundingBox())!.y - other.y)).toBe(110);
  await page.mouse.up();
  await expect.poll(async () => Math.round((await first.boundingBox())!.y - before.y)).toBe(110);
  expect((await second.boundingBox())!.y - other.y).toBeCloseTo(110, 0);
  expect((await second.boundingBox())!.x - other.x).toBeCloseTo(70, 0);
});

test('selected canvas images retain their relative positions after a group drag', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?added-image&image-pair');
  const first = page.locator('[data-added-image-id="sample-image"]');
  const second = page.locator('[data-added-image-id="second-image"]');
  await first.click();
  await page.locator('[data-background-prompt]').getByRole('button', { name: 'Não', exact: true }).click();
  await page.locator('[data-object-page-index]').getByTitle('Seleção múltipla').click();
  await second.click();
  await expect(page.locator('[data-image-selection-overlay]')).toHaveCount(2);
  const editorState = page.getByTestId('editor-state');
  const editsBefore = Number(await editorState.getAttribute('data-edits'));
  const firstStart = (await first.boundingBox())!;
  const secondStart = (await second.boundingBox())!;
  const x = firstStart.x + firstStart.width / 2;
  const y = firstStart.y + firstStart.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 35, y + 50, { steps: 8 });
  await expect.poll(async () => Math.round((await second.boundingBox())!.x - secondStart.x)).toBe(35);
  await expect(page.locator('[data-image-selection-overlay][data-active-canvas-drag]')).toHaveCount(2);
  await expect(editorState).toHaveAttribute('data-edits', String(editsBefore));
  await page.mouse.up();
  await expect(editorState).toHaveAttribute('data-edits', String(editsBefore + 1));
  await expect.poll(async () => Math.round((await first.boundingBox())!.x - firstStart.x)).toBe(35);
  const secondEnd = (await second.boundingBox())!;
  expect(secondEnd.x - secondStart.x).toBeCloseTo(35, 0);
  expect(secondEnd.y - secondStart.y).toBeCloseTo(50, 0);
});

test('selected category groups keep their relative positions after a group drag', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?layout=categories&adjacent');
  const first = page.locator('[data-category-chunk="Principais"]');
  const second = page.locator('[data-category-chunk="Sobremesas"]');
  const header = first.getByRole('heading', { name: 'Principais' });
  await header.click();
  await shortcutsFor(first.locator('[data-category-id="Principais"]')).getByTitle('Seleção múltipla').click();
  await second.getByRole('heading', { name: 'Sobremesas' }).click();
  const before = (await first.boundingBox())!;
  const other = (await second.boundingBox())!;
  const text = (await header.boundingBox())!;
  const x = text.x + 10;
  const y = text.y + text.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const distance = Math.ceil(other.y - before.y) + 20;
  for (let offset = 12; offset < distance; offset += 8) {
    await page.mouse.move(x, y + offset);
    const positions = await Promise.all([first.boundingBox(), second.boundingBox()]);
    expect(positions[1]!.y - positions[0]!.y).toBeCloseTo(other.y - before.y, 0);
  }
  await page.mouse.move(x, y + distance);
  await expect(first).toHaveClass(/ring-indigo-500/);
  await expect(second).toHaveClass(/ring-indigo-500/);
  await expect.poll(async () => Math.round((await second.boundingBox())!.y - other.y)).toBe(distance);
  await page.mouse.up();
  await expect.poll(async () => Math.round((await first.boundingBox())!.y - before.y)).toBe(distance);
  expect((await second.boundingBox())!.y - other.y).toBeCloseTo(distance, 0);
});

test.describe('quick touch group drag from canvas layers', () => {
  test.use({ hasTouch: true });

  for (const layerType of ['image', 'shape']) {
    test(`a selected ${layerType} immediately drags a selected category with it`, async ({ page }) => {
      await page.goto(`/tests/fixtures/template-editor.html?layout=categories&${layerType}`);
      const category = page.locator('[data-category-chunk="Sobremesas"]');
      const layer = page.locator('[data-added-image-id="test-layer"]');
      await category.getByRole('heading', { name: 'Sobremesas' }).tap();
      await shortcutsFor(category.locator('[data-category-id="Sobremesas"]')).getByTitle('Seleção múltipla').tap();
      await layer.tap();
      const overlay = page.locator('[data-image-selection-overlay]');
      await expect(overlay).toBeVisible();
      const categoryStart = (await category.boundingBox())!;
      const layerStart = (await overlay.boundingBox())!;
      const x = layerStart.x + layerStart.width / 2;
      const y = layerStart.y + layerStart.height / 2;
      const session = await page.context().newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 35 }] });
      await expect(overlay).toHaveAttribute('data-active-canvas-drag', 'true');
      await expect(category).toHaveClass(/ring-indigo-500/);
      await expect.poll(async () => Math.round((await category.boundingBox())!.y - categoryStart.y)).toBe(35);
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(async () => Math.round((await layer.boundingBox())!.y - layerStart.y)).toBe(35);
    });
  }
});

test('a click on an image followed by a click on paper cannot create free text', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?added-image&editable');
  const sheet = page.locator('[data-menu-print-page]').first();
  const image = page.locator('[data-added-image-id="sample-image"]');
  const paper = (await sheet.boundingBox())!;
  const point = { clientX: paper.x + 20, clientY: paper.y + paper.height * 0.75 };

  await image.dispatchEvent('click', { detail: 1 });
  await sheet.dispatchEvent('click', { detail: 2, ...point });
  await sheet.dispatchEvent('dblclick', { detail: 2, ...point });
  await expect(sheet.getByText('Novo texto', { exact: true })).toHaveCount(0);

  await sheet.dblclick({ position: { x: 20, y: paper.height * 0.75 } });
  await expect(sheet.getByText('Novo texto', { exact: true })).toBeVisible();
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

test('quick controls touch and resize handles stay on grid column dividers', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=cards&cols=2&lanes=2');
  const product = page.locator('#product-container-1');
  await product.getByRole('heading').click();
  const quick = shortcutsFor(product);
  await expect(quick.getByRole('button').first()).toHaveAttribute('title', 'Editar produto');
  await expect(canvasActionsFor(product, 'insert').getByTitle('Adicionar item à esquerda')).toBeVisible();
  await expect(canvasActionsFor(product, 'insert').getByTitle('Adicionar item à direita')).toBeVisible();
  await expect(canvasActionsFor(product, 'resize').getByTitle('Ajustar largura da coluna pela borda direita')).toBeVisible();
  const quickRects = await quick.getByRole('button').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { y: Math.round(rect.top), width: rect.width, left: rect.left, right: rect.right };
  }));
  expect(new Set(quickRects.map(rect => rect.y)).size).toBe(1);
  expect(quickRects.every(rect => Math.abs(rect.width - 28) <= 1)).toBe(true);
  expect(quickRects.slice(1).every((rect, index) => Math.abs(rect.left - quickRects[index].right) <= 1)).toBe(true);
  expect(await quick.evaluate(element => getComputedStyle(element, '::before').content)).toBe('none');
  const dividerError = await product.evaluate(element => {
    const lane = element.closest('[data-drag-column-container="category"]')!;
    const divider = (lane.getBoundingClientRect().right + lane.nextElementSibling!.getBoundingClientRect().left) / 2;
    const marker = element.querySelector('[data-canvas-action-anchor="resize"]')!;
    const handle = document.getElementById(marker.getAttribute('aria-controls')!)!.getBoundingClientRect();
    return Math.abs(handle.left + handle.width / 2 - divider);
  });
  expect(dividerError).toBeLessThan(1);
  const overlap = await product.evaluate(node => {
    const bar = document.getElementById(node.querySelector('[data-canvas-action-anchor="quick"]')!.getAttribute('aria-controls')!)!;
    const controls = [...new Set([...bar.querySelectorAll('button'),
      ...Array.from(node.querySelectorAll('[data-canvas-action-anchor]')).flatMap(marker =>
        Array.from(document.getElementById(marker.getAttribute('aria-controls') || '')?.querySelectorAll('button') || [])),
    ])].map(button => button.getBoundingClientRect());
    const intersects = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
      && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    const marker = node.querySelector('[data-canvas-action-anchor="resize"]')!;
    const handle = document.getElementById(marker.getAttribute('aria-controls')!)!.getBoundingClientRect();
    const range = document.createRange();
    const onText = [...node.querySelectorAll('[data-word-fit]')].some(element => {
      range.selectNodeContents(element);
      return [...range.getClientRects()].some(rect => intersects(handle, rect));
    });
    return onText || controls.some((rect, i) => controls.slice(i + 1).some(other => intersects(rect, other)));
  });
  expect(overlap).toBe(false);
  const handle = canvasActionsFor(product, 'resize').getByTitle('Ajustar largura da coluna pela borda direita');
  const grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 24, grip.y + grip.height / 2, { steps: 8 });
  const guide = page.locator('[data-column-resize-guide]');
  await expect(guide).toBeVisible();
  await expect.poll(() => guide.evaluate(line => {
    const [first, second] = [...line.closest('[data-menu-print-page]')!.querySelectorAll('[data-drag-column-container="category"]')];
    const divider = (first.getBoundingClientRect().right + second.getBoundingClientRect().left) / 2;
    return Math.abs(line.getBoundingClientRect().left - divider);
  })).toBeLessThan(1);
  await page.mouse.up();
});

const flowColumnsAreReachable = (item: Element, expectedButtons: number) => {
  const groups = Array.from(item.querySelectorAll(':scope > :is([data-canvas-action-anchor="flow"], [data-canvas-action-anchor="insert"])'));
  const columns = groups.map(marker => Array.from(document.getElementById(marker.getAttribute('aria-controls') || '')
    ?.querySelectorAll('button') || []));
  const buttons = columns.flat();
  return buttons.length === expectedButtons && columns.every(column => column.every((button, index) => {
    const rect = button.getBoundingClientRect();
    const previous = column[index - 1]?.getBoundingClientRect();
    return (!previous || (Math.abs(rect.left - previous.left) < 1 && rect.top >= previous.bottom - 1))
      && document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('button') === button;
  }));
};

for (const { width, height, touch, buttonSize } of [
  { width: 1280, height: 900, touch: false, buttonSize: 28 },
  { width: 320, height: 720, touch: true, buttonSize: 36 },
]) {
  test.describe(`canvas toolbar at ${width}px`, () => {
    test.use({ viewport: { width, height }, hasTouch: touch, isMobile: touch });

    test('the shortcut bar and directional controls stay attached in a dense product list', async ({ page }) => {
      await page.goto('/tests/fixtures/template-editor.html?photos=list&dense-list');
      const product = page.locator('#product-container-side-1');
      const select = product.getByRole('heading');
      if (touch) await select.tap();
      else await select.click();
      const toolbar = shortcutsFor(product);
      await expect(toolbar).toBeVisible();
      await expect.poll(() => product.evaluate(item => {
        const box = item.getBoundingClientRect();
        const bar = document.getElementById(item.querySelector('[data-canvas-action-anchor="quick"]')!.getAttribute('aria-controls')!)!.getBoundingClientRect();
        return bar.bottom <= box.top + 1 && box.top - bar.bottom <= 60 && Math.abs(bar.right - box.right) < 1;
      })).toBe(true);
      const rail = canvasActionsFor(product, 'flow');
      const count = await rail.getByRole('button').count() + await canvasActionsFor(product, 'insert').getByRole('button').count();
      expect(count).toBeGreaterThanOrEqual(3);
      await expect.poll(() => product.evaluate(flowColumnsAreReachable, count)).toBe(true);
      if (!touch) {
        const beforeHover = await rail.boundingBox();
        await rail.getByTitle('Mover abaixo').hover();
        await expect.poll(() => rail.boundingBox()).toEqual(beforeHover);
      }
      const down = rail.getByTitle('Mover abaixo');
      const before = (await product.boundingBox())!.y;
      if (touch) await down.tap();
      else await down.click();
      await expect.poll(async () => (await product.boundingBox())!.y).toBeGreaterThan(before + 1);
    });

    test('category insertion brackets the whole selected category', async ({ page }) => {
      await page.goto('/tests/fixtures/template-editor.html?editable&cols=1');
      const category = page.locator('[data-category-chunk="Principais"]');
      const title = category.locator('[data-category-id="Principais"]');
      if (touch) await title.tap();
      else await title.click();
      await expect.poll(() => category.evaluate(flowColumnsAreReachable, 4)).toBe(true);
      const selection = (await category.boundingBox())!;
      const groups = canvasActionsFor(category, 'insert');
      const before = (await groups.and(page.locator('[data-canvas-action-direction="top"]')).boundingBox())!;
      const after = (await groups.and(page.locator('[data-canvas-action-direction="bottom"]')).boundingBox())!;
      expect(before.y + before.height).toBeLessThanOrEqual(selection.y);
      expect(after.y).toBeGreaterThanOrEqual(selection.y + selection.height);

    });

    test('buttons remain compact and reachable for every column combination', async ({ page }) => {
      for (const lanes of [1, 2, 3]) {
        for (const cols of [1, 2, 3]) {
          await test.step(`${lanes} category columns and ${cols} product columns`, async () => {
            await page.goto(`/tests/fixtures/template-editor.html?photos=cards&cols=${cols}&lanes=${lanes}`);
            const product = page.locator('#product-container-1');
            const heading = product.getByRole('heading');
            if (touch) await heading.tap();
            else await heading.click();
            const quick = shortcutsFor(product).locator(':scope > button');
            await expect(quick).toHaveCount(4);
            const checkButtons = () => expect.poll(() => quick.evaluateAll((buttons, targetSize) => buttons.map(button => {
              const rect = button.getBoundingClientRect();
              const hit = document.elementFromPoint(rect.left + 2, rect.top + 2);
              return Math.abs(rect.width - targetSize) <= 1 && rect.height >= rect.width - 1
                && getComputedStyle(button, '::before').left === '0px' && hit === button;
            }), buttonSize)).toEqual([true, true, true, true]);
            await checkButtons();

            await expect.poll(() => product.evaluate(element => {
              const item = element.getBoundingClientRect();
              const toolbar = document.getElementById(element.querySelector('[data-canvas-action-anchor="quick"]')!.getAttribute('aria-controls')!)!.getBoundingClientRect();
              const horizontalOverlap = Math.min(item.right, toolbar.right) - Math.max(item.left, toolbar.left);
              return horizontalOverlap >= Math.min(item.width, toolbar.width) / 2
                && toolbar.bottom <= item.top + 1 && item.top - toolbar.bottom <= 96;
            })).toBe(true);

            const flowButtons = canvasActionsFor(product, 'flow').getByRole('button')
              .or(canvasActionsFor(product, 'insert').getByRole('button'));
            await expect(flowButtons.first()).toBeVisible();
            const flowCount = await flowButtons.count();
            await expect.poll(() => product.evaluate(flowColumnsAreReachable, flowCount)).toBe(true);

            await expect.poll(() => product.evaluate(element => {
              const item = element.getBoundingClientRect();
              const controls = Array.from(element.querySelectorAll('[data-canvas-action-anchor="move"]'), marker =>
                document.getElementById(marker.getAttribute('aria-controls') || '')).filter((control): control is HTMLElement => control !== null);
              return controls.flatMap(control => {
                if (getComputedStyle(control).visibility === 'hidden') return [];
                const rect = control.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                const distance = Math.min(Math.abs(item.left - x), Math.abs(item.right - x));
                const button = control.querySelector('button');
                return document.elementFromPoint(x, y)?.closest('button') !== button
                  ? [{ title: button?.title, distance: Math.round(distance) }] : [];
              });
            })).toEqual([]);

            if (lanes > 1) {
              const handle = canvasActionsFor(product, 'resize').getByTitle('Ajustar largura da coluna pela borda direita');
              await expect.poll(() => handle.evaluate(button => {
                const group = button.closest('[data-canvas-action-group="resize"]')!;
                const marker = document.querySelector(`[aria-controls="${group.id}"]`)!;
                const lane = marker.closest('[data-drag-column-container="category"]')!;
                const divider = (lane.getBoundingClientRect().right + lane.nextElementSibling!.getBoundingClientRect().left) / 2;
                const rect = button.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                return Math.abs(divider - x) < 1 && document.elementFromPoint(x, rect.top + rect.height / 2) === button;
              })).toBe(true);
            }

            if (lanes === 1 && cols === 1) {
              const canvas = page.locator('[data-automenu-editor-canvas]');
              const paper = canvas.locator('[data-menu-print-page]').first();
              const paperWidth = () => paper.evaluate(element => element.getBoundingClientRect().width);
              const initialWidth = await paperWidth();
              const item = (await product.boundingBox())!;
              await canvas.dispatchEvent('wheel', { ctrlKey: true, deltaY: 130, bubbles: true, cancelable: true,
                clientX: item.x + item.width / 2, clientY: item.y + item.height / 2 });
              await expect.poll(paperWidth).toBeLessThan(initialWidth * 0.85);
              await expect.poll(() => canvas.locator('[data-canvas-zoom-layer]').evaluate(element =>
                element.getAnimations().some(animation => animation.playState === 'running'))).toBe(false);
              await checkButtons();
            }

            const more = shortcutsFor(product).getByTitle('Mais opções');
            if (touch) {
              // A physical tap uses the painted coordinates without a programmatic scroll.
              const rect = (await more.boundingBox())!;
              await page.touchscreen.tap(rect.x + rect.width / 2, rect.y + rect.height / 2);
            } else await more.click();
            await expect(page.locator('[data-canvas-object-menu]')).toBeVisible();
          });
        }
      }
    });
  });
}

test.describe('shape toolbar on a narrow touchscreen', () => {
  test.use({ viewport: { width: 280, height: 720 }, hasTouch: true, isMobile: true });

  test('keeps the remaining buttons reachable without shrinking their touch targets', async ({ page }) => {
    await page.goto('/tests/fixtures/template-editor.html');
    await page.getByRole('button', { name: 'Adicionar forma' }).tap();
    const buttons = page.locator('[data-object-page-index] > button');
    await expect(buttons).toHaveCount(4);
    const buttonLayout = () => buttons.evaluateAll(elements => {
      const rects = elements.map(element => element.getBoundingClientRect());
      return {
        rows: new Set(rects.map(rect => Math.round(rect.top))).size,
        reachable: rects.every((rect, index) => Math.abs(rect.width - 36) <= 1 && rect.left >= 0 && rect.right <= innerWidth
          && document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === elements[index]),
      };
    });
    await expect.poll(buttonLayout).toEqual({ rows: 1, reachable: true });
    await page.setViewportSize({ width: 210, height: 720 });
    await expect.poll(buttonLayout).toEqual({ rows: 1, reachable: true });
    await page.setViewportSize({ width: 430, height: 720 });
    await expect.poll(buttonLayout).toEqual({ rows: 1, reachable: true });
    await page.getByTitle('Remover forma', { exact: true }).tap();
    await expect(page.getByAltText('Forma adicionada')).toHaveCount(0);
  });
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

test('detached text crosses the whole heading without moving a category that would collide', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?layout=top-detached');
  const category = page.locator('[data-category-chunk="Entradas"]');
  const text = page.locator('#product-container-text-a');
  const originalCategory = (await category.boundingBox())!;
  const start = (await text.boundingBox())!;
  const x = start.x + start.width / 2;
  const y = originalCategory.y + originalCategory.height + 26;
  await page.mouse.move(x, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y);
  await page.mouse.move(x + 1, y + 1);
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await category.boundingBox())!.y - originalCategory.y)).toBeLessThan(2);
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
