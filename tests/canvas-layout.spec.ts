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
  const buttons = source.getByRole('button', { name: /Editar texto|Seleção múltipla|Remover|Mais opções/ });
  await expect.poll(() => buttons.evaluateAll(elements => elements.map(element => element.getAttribute('title'))))
    .toEqual(['Editar texto', 'Seleção múltipla', 'Remover', 'Mais opções']);
  const rows = await buttons.evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)));
  expect(new Set(rows).size).toBe(1);
  await source.getByTitle('Editar texto').click();
  await expect(page.locator('#product-name-text-a')).toBeFocused();
  await page.keyboard.press('Escape');
  await source.getByTitle('Remover', { exact: true }).click();
  await expect(source).toHaveCount(0);
});

test('the right arrow is absent when the neighboring product cell is empty', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=cards&cols=2&single-product');
  const product = page.locator('#product-container-1');
  await product.getByRole('heading').click();
  await expect(product.getByTitle('Adicionar item à direita')).toBeVisible();
  await expect(product.getByTitle('Mover à direita')).toHaveCount(0);
});

for (const touch of [false, true]) {
  test.describe(touch ? 'group drag on touch' : 'group drag with a mouse', () => {
    test.use({ hasTouch: touch });

    test('selected products move together and keep their selection and order', async ({ page }) => {
      await page.goto('/tests/fixtures/template-editor.html?photos=list&dense-list&lanes=2');
      const first = page.locator('#product-container-side-1');
      const second = page.locator('#product-container-side-2');
      const target = page.locator('#product-container-side-11');
      await first.getByRole('heading').click();
      await expect(first.getByTitle('Ajustar largura da coluna pela borda direita')).toBeVisible();
      await first.getByTitle('Seleção múltipla').click();
      await second.getByRole('heading').click();
      await expect(second.getByTitle('Seleção múltipla')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-canvas-action-group="add"], [data-canvas-action-group="move"], [data-column-resize-handle]')).toHaveCount(0);

      const start = (await first.boundingBox())!;
      const destination = (await target.boundingBox())!;
      const x = start.x + 12;
      const y = start.y + start.height / 2;
      const end = destination.y + destination.height * 0.8;
      const session = touch ? await page.context().newCDPSession(page) : null;
      expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-drag-id]')?.id, { x, y }))
        .toBe('product-container-side-1');
      if (session) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await page.waitForTimeout(380);
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: end }] });
      } else {
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x, end, { steps: 10 });
      }
      await expect.poll(async () => {
        const [a, b] = await Promise.all([first, second].map(item => item.evaluate(element => element.style.translate)));
        return Boolean(a) && a === b;
      }).toBe(true);
      if (session) await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      else await page.mouse.up();

      await expect.poll(() => target.evaluate(element => [element.nextElementSibling?.id, element.nextElementSibling?.nextElementSibling?.id]))
        .toEqual(['product-container-side-1', 'product-container-side-2']);
      await expect(second.getByTitle('Seleção múltipla')).toHaveAttribute('aria-pressed', 'true');
    });
  });
}

test('dragging selected products from different categories moves only the pressed one', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=list&different-categories');
  const first = page.locator('#product-container-1');
  const next = page.locator('#product-container-2');
  const other = page.locator('#product-container-3');
  await first.getByRole('heading').click();
  await first.getByTitle('Seleção múltipla').click();
  await other.getByRole('heading').click();
  const start = (await first.boundingBox())!;
  const destination = (await next.boundingBox())!;
  const otherStart = (await other.boundingBox())!;
  const x = start.x + start.width / 2;
  await page.mouse.move(x, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, destination.y + destination.height * 0.75, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => next.evaluate(element => element.nextElementSibling?.id)).toBe('product-container-1');
  await expect(first.getByTitle('Seleção múltipla')).toHaveAttribute('aria-pressed', 'false');
  expect((await other.boundingBox())!.y).toBeCloseTo(otherStart.y, 0);
});

test('detached free texts keep their spacing after dragging together', async ({ page }) => {
  const first = page.locator('#product-container-text-a');
  const second = page.locator('#product-container-text-b');
  await first.click();
  await first.getByTitle('Seleção múltipla').click();
  await second.click();
  const before = (await first.boundingBox())!;
  const other = (await second.boundingBox())!;
  const x = before.x + before.width / 2;
  const y = before.y + before.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 70, y + 110, { steps: 8 });
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
  const firstStart = (await first.boundingBox())!;
  const secondStart = (await second.boundingBox())!;
  const x = firstStart.x + firstStart.width / 2;
  const y = firstStart.y + firstStart.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 35, y + 50, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await first.boundingBox())!.x - firstStart.x)).toBe(35);
  const secondEnd = (await second.boundingBox())!;
  expect(secondEnd.x - secondStart.x).toBeCloseTo(35, 0);
  expect(secondEnd.y - secondStart.y).toBeCloseTo(50, 0);
});

test('selected category groups keep their relative positions after a group drag', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?layout=categories');
  const first = page.locator('[data-category-chunk="Principais"]');
  const second = page.locator('[data-category-chunk="Sobremesas"]');
  const header = first.getByRole('heading', { name: 'Principais' });
  await header.click();
  await first.locator('[data-category-id="Principais"]').getByTitle('Seleção múltipla').click();
  await second.getByRole('heading', { name: 'Sobremesas' }).click();
  const before = (await first.boundingBox())!;
  const other = (await second.boundingBox())!;
  const text = (await header.boundingBox())!;
  const x = text.x + 10;
  const y = text.y + text.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 56, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await first.boundingBox())!.y - before.y)).toBe(56);
  expect((await second.boundingBox())!.y - other.y).toBeCloseTo(56, 0);
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

test('quick controls touch, grid insertion stays lateral and resizing starts at the column divider', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=cards&cols=2&lanes=2');
  const product = page.locator('#product-container-1');
  await product.getByRole('heading').click();
  const quick = product.locator('[data-canvas-action-group="quick"]');
  await expect(quick.getByRole('button').first()).toHaveAttribute('title', 'Editar produto');
  await expect(product.getByTitle('Adicionar item à esquerda')).toBeVisible();
  await expect(product.getByTitle('Adicionar item à direita')).toBeVisible();
  await expect(product.getByTitle('Ajustar largura da coluna pela borda direita')).toBeVisible();
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
    const handle = element.querySelector('[data-column-resize-handle]')!.getBoundingClientRect();
    return Math.abs(handle.left + handle.width / 2 - divider);
  });
  expect(dividerError).toBeLessThan(1);
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
  const handle = product.getByTitle('Ajustar largura da coluna pela borda direita');
  const grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 24, grip.y + grip.height / 2, { steps: 8 });
  const guide = page.getByText(/^(Centro|Largura da coluna)$/).locator('..');
  await expect(guide).toBeVisible();
  await expect.poll(() => guide.evaluate(line => {
    const [first, second] = [...line.closest('[data-menu-print-page]')!.querySelectorAll('[data-drag-column-container="category"]')];
    const divider = (first.getBoundingClientRect().right + second.getBoundingClientRect().left) / 2;
    return Math.abs(line.getBoundingClientRect().left - divider);
  })).toBeLessThan(1);
  await page.mouse.up();
});

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
      const toolbar = product.locator('[data-canvas-action-group="quick"]');
      await expect(toolbar).toBeVisible();
      await expect.poll(() => product.evaluate(item => {
        const box = item.getBoundingClientRect();
        const bar = item.querySelector('[data-canvas-action-group="quick"]')!.getBoundingClientRect();
        const edges = [...item.querySelectorAll<HTMLElement>('[data-canvas-action-group="add"], [data-canvas-action-group="move"]')];
        return bar.bottom <= box.top + 1 && box.top - bar.bottom <= 6 && Math.abs(bar.right - box.right) < 1
          && edges.length >= 3 && edges.every(control => {
            const rect = control.getBoundingClientRect();
            const edge = control.dataset.canvasActionDirection === 'top' ? box.top : box.bottom;
            return Math.abs(rect.top + rect.height / 2 - edge) <= rect.height / 2 + 4
              && document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('button') === control.firstElementChild;
          });
      })).toBe(true);
      const down = product.getByTitle('Mover abaixo');
      const before = (await product.boundingBox())!.y;
      if (touch) await down.tap();
      else await down.click();
      await expect.poll(async () => (await product.boundingBox())!.y).toBeGreaterThan(before + 1);
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
            const quick = product.locator('[data-canvas-action-group="quick"] > button');
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
              const toolbar = element.querySelector('[data-canvas-action-group="quick"]')!.getBoundingClientRect();
              const horizontalOverlap = Math.min(item.right, toolbar.right) - Math.max(item.left, toolbar.left);
              return horizontalOverlap >= Math.min(item.width, toolbar.width) / 2
                && toolbar.bottom <= item.top + 1 && item.top - toolbar.bottom <= 36;
            })).toBe(true);

            await expect.poll(() => product.evaluate(element => {
              const item = element.getBoundingClientRect();
              const controls = [...element.querySelectorAll<HTMLElement>('[data-canvas-action-group="add"], [data-canvas-action-group="move"]')];
              return controls.flatMap(control => {
                if (getComputedStyle(control).visibility === 'hidden') return [];
                const rect = control.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                const distances = { top: item.top - y, bottom: y - item.bottom, left: item.left - x, right: x - item.right };
                const direction = control.dataset.canvasActionDirection as keyof typeof distances;
                const distance = distances[direction];
                const button = control.querySelector('button');
                return distance < -1 || distance > 21 || document.elementFromPoint(x, y)?.closest('button') !== button
                  ? [{ title: button?.title, distance: Math.round(distance) }] : [];
              });
            })).toEqual([]);

            if (lanes > 1) {
              const handle = product.getByTitle('Ajustar largura da coluna pela borda direita');
              await expect.poll(() => handle.evaluate(button => {
                const lane = button.closest('[data-drag-column-container="category"]')!;
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
              await canvas.dispatchEvent('wheel', { ctrlKey: true, deltaY: 130, bubbles: true, cancelable: true });
              await expect.poll(paperWidth).toBeLessThan(initialWidth * 0.85);
              await expect.poll(() => canvas.locator('[data-canvas-zoom-layer]').evaluate(element =>
                element.getAnimations().some(animation => animation.playState === 'running'))).toBe(false);
              await checkButtons();
            }

            const more = product.getByTitle('Mais opções');
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

  test('wraps buttons without shrinking or clipping their touch targets', async ({ page }) => {
    await page.goto('/tests/fixtures/template-editor.html');
    await page.getByRole('button', { name: 'Adicionar forma' }).tap();
    await page.getByRole('button', { name: 'Inserir forma' }).tap();
    const buttons = page.locator('[data-object-page-index] > button');
    await expect(buttons).toHaveCount(6);
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
    await expect.poll(buttonLayout).toEqual({ rows: 2, reachable: true });
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
