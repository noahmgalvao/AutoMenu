import { canvasActionsFor } from './fixtures/canvas-shortcuts';
import { expect, test, type Locator } from '@playwright/test';

const fixture = '/tests/fixtures/template-editor.html';
const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBXsAAAAASUVORK5CYII=', 'base64');

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
});

test('image actions reflect each photo group and adding enables it with the shared photo size', async ({ page }) => {
  await page.route('**/tests/asset-upload', route => route.fulfill({ json: { asset: { id: 'test-photo' }, url: '/tests/category-size.png' } }));
  await page.route('**/tests/category-size.png', route => route.fulfill({ contentType: 'image/png', body: photo }));
  await page.goto(fixture + '?photos=list&image-upload&hide-photos&no-photos&different-categories');
  const menu = page.locator('[data-canvas-object-menu]');
  const add = menu.getByRole('button', { name: 'Adicionar imagem', exact: true });
  const disable = menu.getByRole('button', { name: 'Desabilitar imagens' });
  const enable = menu.getByRole('button', { name: 'Habilitar imagens' });
  const open = (item: Locator) => item.click({ button: 'right' });
  const upload = async () => {
    const picker = page.waitForEvent('filechooser');
    await add.click();
    await (await picker).setFiles({ name: 'foto.png', mimeType: 'image/png', buffer: photo });
  };
  const category = page.locator('#text-Entradas');
  const product = page.locator('#product-name-1');
  const categoryPhoto = page.locator('#category-image-Entradas');
  const productPhoto = page.locator('#product-image-1');

  for (const [target, image] of [[category, categoryPhoto], [product, productPhoto]]) {
    await open(target);
    await expect(add).toBeVisible();
    await expect(disable.or(enable)).toHaveCount(0);
    await upload();
    await expect(image.locator('img')).toBeVisible();
    await open(target);
    await disable.click();
    await expect(image).toHaveCount(0);
    await open(target);
    await enable.click();
    await expect(image.locator('img')).toBeVisible();
  }

  expect((await categoryPhoto.boundingBox())!.width).toBeCloseTo((await productPhoto.boundingBox())!.width, 0);
  await open(category);
  await disable.click();
  await open(page.locator('#text-Sobremesas'));
  await expect(enable).toBeVisible();
  await expect(add).toBeVisible();
  await upload();
  await expect(categoryPhoto).toBeVisible();
  await expect(page.locator('#category-image-Sobremesas')).toBeVisible();

  const increase = page.getByRole('button', { name: 'Aumentar imagens de categorias' });
  const decrease = page.getByRole('button', { name: 'Diminuir imagens de categorias' });
  const value = increase.locator('..').locator('span');
  for (let step = 0; step < 16 && await value.textContent() !== '250%'; step++) await increase.click();
  await expect(value).toHaveText('250%');
  await expect(value).toHaveClass(/automenu-limit-feedback/);
  await expect(value).not.toHaveClass(/automenu-limit-feedback/);
  await increase.click();
  await expect(value).toHaveClass(/automenu-limit-feedback/);
  await expect(value).toHaveText('250%');

  for (let step = 0; step < 21 && await value.textContent() !== '50%'; step++) await decrease.click();
  await expect(value).toHaveText('50%');
  await expect(value).toHaveClass(/automenu-limit-feedback/);
});

test('a product list toggles only after two clicks on the same category card', async ({ page }) => {
  await page.goto(fixture + '?photos=list&product-designer&no-photos');
  const designer = page.locator('#designer-sheet-products');
  const category = designer.locator('[data-drag-type="category"][data-drag-id="Entradas"]');
  const categoryRow = category.locator('../..');
  const productList = categoryRow.locator('..').locator('[data-designer-category-products]');
  const name = category.getByText('Entradas', { exact: true });

  await expect(designer.getByRole('button', { name: 'Adicionar produto no início' })).toHaveCount(0);
  await categoryRow.locator(':scope > button').click();
  await expect(productList).toBeHidden();

  await name.evaluate(target => {
    const categoryHeader = target.closest('[data-drag-type="category"]')?.parentElement?.parentElement;
    if (!categoryHeader) throw new Error('Missing category header');
    for (const area of [target, categoryHeader, target]) {
      area.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    }
  });
  await expect(productList).toBeHidden();
  await categoryRow.dispatchEvent('click', { detail: 1 });
  await name.dblclick();
  await expect(productList).toBeVisible();
  await name.dblclick();
  await expect(productList).toBeHidden();
});

test('product designer also offers Add when its photo group is empty and hidden', async ({ page }) => {
  await page.route('**/tests/asset-upload', route => route.fulfill({ json: { asset: { id: 'test-photo' }, url: '/tests/designer-photo.png' } }));
  await page.route('**/tests/designer-photo.png', route => route.fulfill({ contentType: 'image/png', body: photo }));
  await page.goto(fixture + '?photos=list&product-designer&image-upload&no-photos&hide-photos');
  const category = page.locator('[data-drag-type="category"][data-drag-id="Entradas"] [data-product-options-trigger]');
  const product = page.locator('#product-container-1');
  const menu = page.locator('[data-product-designer-options-menu]');
  for (const open of [() => category.click(), async () => { await product.hover(); await product.getByRole('button', { name: 'Mais ações' }).click(); }]) {
    await open();
    await expect(page.locator('body > [data-product-designer-options-menu]')).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Habilitar imagens' }).or(menu.getByRole('button', { name: 'Desabilitar imagens' }))).toHaveCount(0);
    const chooser = page.waitForEvent('filechooser');
    await menu.getByRole('button', { name: 'Adicionar imagem' }).click();
    await (await chooser).setFiles({ name: 'foto.png', mimeType: 'image/png', buffer: photo });
    await expect.poll(async () => {
      if (!await menu.count()) await open();
      return menu.getByRole('button', { name: 'Desabilitar imagens' }).count();
    }).toBe(1);
    await menu.getByRole('button', { name: 'Desabilitar imagens' }).click();
    await open();
    await expect(menu.getByRole('button', { name: 'Habilitar imagens' })).toBeVisible();
    await menu.getByRole('button', { name: 'Habilitar imagens' }).click();
  }
});

test('manual arrow and drag sorting shows a custom status and selecting Nome resets the order', async ({ page }) => {
  await page.goto(fixture + '?photos=list&no-photos');
  const picker = page.getByRole('combobox', { name: 'Ordenação de produtos' });
  const products = page.locator('[data-category-chunk="Entradas"] [data-template-product]');
  const ids = () => products.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-drag-id')));
  const first = page.locator('#product-container-1');
  await expect(picker).toHaveValue('name');
  await expect(picker.locator('option[value=custom]')).toHaveCount(0);
  expect(await ids()).toEqual(['1', '2', '3']);
  await first.click();
  await canvasActionsFor(first, 'flow').getByTitle('Mover abaixo').click();
  await expect(picker).toHaveValue('custom');
  await expect(picker.locator('option[value=custom]')).toBeDisabled();
  expect(await ids()).toEqual(['2', '1', '3']);
  await picker.selectOption('name');
  await expect(picker.locator('option[value=custom]')).toHaveCount(0);
  await expect.poll(ids).toEqual(['1', '2', '3']);

  const start = (await first.boundingBox())!;
  const target = (await products.last().boundingBox())!;
  const x = start.x + start.width / 2;
  await page.mouse.move(x, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, target.y + target.height - 4, { steps: 12 });
  await page.mouse.up();
  await expect(picker).toHaveValue('custom');
  expect(await ids()).not.toEqual(['1', '2', '3']);
  await picker.selectOption('price');
  await expect(picker).toHaveValue('price');
  await expect(picker.locator('option[value=custom]')).toHaveCount(0);
  await expect.poll(ids).toEqual(['3', '1', '2']);
});

test('circle hides rotation and the four pointed shapes render rounded corners', async ({ page }) => {
  await page.goto(fixture + '?batch-layers');
  const shape = page.locator('[data-added-image-id="shape-left"]');
  await shape.click();
  const edit = page.locator('[data-object-page-index="0"]').getByTitle('Editar forma');
  await edit.click();
  const toolbar = page.locator('[data-inline-format-toolbar]');
  const sidebar = page.locator('[data-designer-scroll-container]');
  await toolbar.getByRole('button', { name: 'Alterar forma' }).click();
  const picker = page.locator('[data-change-shape-picker]');
  await picker.getByRole('button', { name: 'Elipse', exact: true }).click();
  if (!await toolbar.isVisible()) await edit.click();
  await expect(toolbar.getByRole('slider', { name: 'Espessura do contorno' })).toBeVisible();
  await expect(toolbar.getByRole('slider', { name: 'Rotação' })).toHaveCount(0);
  await expect(sidebar.getByRole('slider', { name: 'Rotação' })).toHaveCount(0);

  for (const [index, name] of ['Estrela', 'Seta', 'Losango', 'Polígono'].entries()) {
    await picker.getByRole('button', { name, exact: true }).click();
    await expect(sidebar.getByRole('slider', { name: 'Arredondamento' })).toBeVisible();
    if (!await toolbar.isVisible()) await edit.click();
    await expect(toolbar.getByRole('slider', { name: 'Arredondamento' })).toBeVisible();
    const rounding = toolbar.getByRole('spinbutton', { name: 'Arredondamento' });
    await rounding.fill(String(7 + index));
    await rounding.press('Enter');
    await expect.poll(async () => decodeURIComponent((await shape.locator('img').getAttribute('src'))!)).toMatch(/<path d="M [^"]+ Q /);
  }
});


test.describe('PDF options on touchscreens', () => {
  test.use({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });

  test('the options scroll vertically and the thumbnails pan horizontally', async ({ page }) => {
    await page.goto(fixture + '?background-text');
    await page.getByTitle('Exportar PDF').tap();
    const options = page.locator('[data-pdf-options-scroll]');
    const strip = page.locator('[data-pdf-preview-strip]');
    const cdp = await page.context().newCDPSession(page);

    const swipe = async (x: number, y: number, dx: number, dy: number) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 8; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove', touchPoints: [{ x: x + dx * i / 8, y: y + dy * i / 8 }],
        });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };

    const panel = (await options.boundingBox())!;
    await swipe(panel.x + 7, panel.y + panel.height - 30, 0, -Math.min(240, panel.height / 2));
    await expect.poll(() => options.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await strip.scrollIntoViewIfNeeded();
    const preview = (await strip.boundingBox())!;
    const sheet = (await strip.getByRole('img', { name: 'Preview da página 1' }).boundingBox())!;
    const x = Math.min(preview.x + preview.width - 24, sheet.x + sheet.width / 2);
    const y = sheet.y + sheet.height / 2;
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.hasAttribute('data-pdf-preview-strip'), { x, y });
    expect(hit).toBe(true);
    const verticalOffset = await options.evaluate(element => element.scrollTop);
    await swipe(x, y, -95, 0);
    await expect.poll(() => strip.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await expect.poll(() => options.evaluate(element => element.scrollTop)).toBe(verticalOffset);
  });
});
