import { chooseDesignerOption } from './fixtures/designer-picker';
import { expect, test } from '@playwright/test';

const fixture = '/tests/fixtures/template-editor.html';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
});

test('pickers open without focusing search, filter immediately and let the designer keep scrolling', async ({ page }) => {
  await page.goto(fixture);
  const texture = page.getByRole('combobox', { name: 'Textura de fundo' });
  await texture.click();
  await expect(page.getByRole('textbox', { name: /textura/i })).toHaveCount(0);
  await page.getByRole('option', { name: 'Mini comidas', exact: true }).click();
  await page.getByRole('combobox', { name: 'Mini comida', exact: true }).click();
  const search = page.getByRole('textbox', { name: 'Buscar mini comida' });
  const list = page.getByRole('listbox', { name: 'Mini comida' });
  await expect(search).not.toBeFocused();
  await search.fill('p');
  await expect(list.getByRole('option', { name: 'Pão de queijo' })).toBeVisible();
  await expect(list.getByRole('option', { name: 'Sushi', exact: true })).toHaveCount(0);
  await search.fill('pa');
  await expect(list.getByRole('option', { name: 'Pão de queijo' })).toBeVisible();
  await search.fill('');
  await list.evaluate(element => { element.scrollTop = 0; });
  const panel = page.locator('[data-designer-scroll-container]');
  await list.hover();
  const previousScroll = await panel.evaluate(element => element.scrollTop);
  await page.mouse.wheel(0, -250);
  await expect.poll(() => panel.evaluate(element => element.scrollTop)).toBeLessThan(previousScroll);

  await page.getByRole('button', { name: 'Cor da textura de mini comidas' }).click();
  const picker = page.getByRole('dialog', { name: 'Cor da textura de mini comidas' });
  await picker.getByRole('button', { name: '#22c55e', exact: true }).first().click();
  await expect(page.locator('[data-menu-print-page]').first()).toHaveCSS('background-image', /%2322c55e/);
  await page.keyboard.press('Escape');

  const fontSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Cores e fonte' }) });
  await fontSection.getByRole('combobox', { name: 'Fonte', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Buscar fonte...' })).not.toBeFocused();
  await page.getByRole('textbox', { name: 'Buscar fonte...' }).fill('int');
  await expect(page.getByRole('listbox', { name: 'Fonte' }).getByRole('option', { name: 'Inter', exact: true })).toBeVisible();
});

test('an added image crops non-destructively and its more-actions menu disables the outer layer', async ({ page }) => {
  await page.goto(fixture + '?batch-layers');
  const picture = page.locator('[data-added-image-id="batch-photo"]');
  await picture.click();
  const tools = page.locator('[data-object-page-index="0"]');
  const url = await picture.locator('img').getAttribute('src');
  const size = (await picture.boundingBox())!.width;
  await expect(tools.getByRole('button').first()).toHaveAccessibleName('Cortar');
  await tools.getByRole('button', { name: 'Cortar', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Cortar imagem' });
  const handle = dialog.getByRole('button', { name: 'Canto inferior direito' });
  const grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x - 100, grip.y - 90, { steps: 5 });
  await page.mouse.up();
  await dialog.getByRole('button', { name: 'Aplicar corte' }).click();
  await expect.poll(async () => (await picture.boundingBox())!.width).toBeLessThan(size);
  await expect(picture.locator('img')).toHaveAttribute('src', url!);

  const more = tools.getByRole('button', { name: 'Mais opções' });
  await more.click();
  const menu = page.locator('[data-canvas-object-menu]');
  await expect(menu.getByRole('button').last()).toHaveText('Remover imagem');
  await menu.getByRole('button', { name: 'Trazer para frente' }).click();
  await more.click();
  await expect(menu.getByRole('button', { name: 'Trazer para frente' })).toBeDisabled();
});

test('dragging a shape near the page center snaps it and clears the dashed guide on release', async ({ page }) => {
  await page.goto(fixture + '?batch-layers');
  const paper = page.locator('[data-menu-print-page]').first();
  const layer = paper.locator('[data-added-image-id="shape-left"]');
  await layer.scrollIntoViewIfNeeded();
  const box = (await layer.boundingBox())!;
  const sheet = (await paper.boundingBox())!;
  const center = sheet.x + sheet.width / 2;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(center + 3, box.y + box.height / 2, { steps: 8 });
  const guide = paper.locator('[data-canvas-guide="x"]');
  await expect(guide).toBeVisible();
  await expect(guide).toHaveAttribute('data-canvas-guide-kind', 'center');
  expect((await guide.boundingBox())!.width).toBeGreaterThan(2);
  await expect.poll(async () => {
    const bounds = (await layer.boundingBox())!;
    return Math.abs(bounds.x + bounds.width / 2 - center);
  }).toBeLessThan(1);
  const otherShape = (await paper.locator('[data-added-image-id="shape-right"]').boundingBox())!;
  await page.mouse.move(otherShape.x + otherShape.width / 2 + 2, box.y + box.height / 2, { steps: 6 });
  await expect(guide).toHaveAttribute('data-canvas-guide-kind', 'object');
  expect((await guide.boundingBox())!.width).toBeGreaterThan(1.5);
  await page.mouse.up();
  await expect(guide).toHaveCount(0);
});

test('an untouched free text keeps its label until the first typed character', async ({ page }) => {
  await page.goto(fixture + '?photos=list');
  await page.getByRole('button', { name: 'Adicionar texto', exact: true }).click();
  const text = page.locator('[data-canvas-free-text-id]').getByText('Novo texto', { exact: true });
  await expect(text).toBeVisible();
  const field = page.locator('[data-canvas-free-text-id] [contenteditable="true"]');
  await expect(field).toBeFocused();
  await expect(field).toHaveText('Novo texto');
  await field.press('Home');
  await field.press('ArrowRight');
  await page.keyboard.insertText('C');
  await expect(field).toHaveText('C');
});

test('photo actions require an icon hit and circular photos reflow at every resize step', async ({ page }) => {
  await page.goto(fixture + '?photos=cards&cols=2');
  await page.getByRole('combobox', { name: 'Moldura das fotos dos produtos' }).selectOption('circle');
  const product = page.locator('#product-container-1');
  const title = product.getByRole('heading');
  await title.click({ button: 'right' });
  await page.locator('[data-canvas-object-menu]').getByRole('button', { name: 'Editar produto' }).click();
  const photo = product.locator('[data-template-image]');
  const overlay = photo.locator('[data-photo-gesture]');
  const image = photo.locator('img');
  const width = () => photo.evaluate(element => element.getBoundingClientRect().width);
  const height = () => product.evaluate(element => element.getBoundingClientRect().height);
  const box = (await overlay.boundingBox())!;
  await page.mouse.click(box.x + box.width * .71, box.y + box.height * .24);
  await expect(page.getByRole('button', { name: 'Aumentar imagem', exact: true })).toBeVisible();
  await expect(image).toBeVisible();

  const startWidth = await width();
  const startHeight = await height();
  const pin = (await overlay.locator('[data-photo-corner="3"]').boundingBox())!;
  const x = pin.x + pin.width / 2;
  const y = pin.y + pin.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 5, y + 5);
  await expect.poll(width).toBeGreaterThan(startWidth);
  await expect.poll(height).toBeGreaterThan(startHeight);
  const firstWidth = await width();
  await page.mouse.move(x + 10, y + 10);
  await expect.poll(width).toBeGreaterThan(firstWidth);
  const finalWidth = await width();
  await page.mouse.up();
  await expect.poll(width).toBe(finalWidth);
  await title.click();
  await expect(page.getByRole('button', { name: 'Aumentar imagem', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-inline-format-toolbar]')).toBeVisible();
});

test('a list product has no fill by default and choosing any color clears that option', async ({ page }) => {
  await page.goto(fixture + '?photos=list');
  const product = page.locator('#product-container-1');
  await expect(product).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await product.getByRole('heading').click({ button: 'right' });
  await page.locator('[data-canvas-object-menu]').getByRole('button', { name: 'Editar produto' }).click();
  const toolbar = page.locator('[data-inline-format-toolbar]');
  await toolbar.getByRole('button', { name: 'Borda', exact: true }).click();
  await toolbar.getByRole('button', { name: 'Cor de preenchimento' }).click();
  const picker = page.getByRole('dialog', { name: 'Cor de preenchimento' });
  const noFill = picker.getByRole('checkbox', { name: 'Sem preenchimento' });
  await expect(noFill).toBeChecked();
  await picker.getByRole('button', { name: '#eab308', exact: true }).first().click();
  await expect(noFill).not.toBeChecked();
  await expect(product).toHaveCSS('background-color', 'rgb(234, 179, 8)');
  await noFill.click();
  await expect(noFill).toBeChecked();
  await expect(product).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});

test('shape rotation keeps its size and the text field opens the formatting toolbar', async ({ page }) => {
  await page.goto(fixture + '?batch-layers');
  const shape = page.locator('[data-added-image-id="shape-left"]');
  await shape.click();
  await page.locator('[data-object-page-index="0"]').getByTitle('Editar forma').click();
  const toolbar = page.locator('[data-inline-format-toolbar]');
  const measuredSize = (degrees: number) => shape.evaluate((element, angle) => {
    const radians = angle * Math.PI / 180;
    return parseFloat((element as HTMLElement).style.width) / (Math.abs(Math.sin(radians)) + Math.abs(Math.cos(radians)));
  }, degrees);
  const before = await measuredSize(25);
  await expect(toolbar.getByRole('spinbutton', { name: 'Proporção' })).toHaveCount(0);
  await toolbar.getByRole('spinbutton', { name: 'Rotação' }).fill('45');
  await expect.poll(() => measuredSize(45)).toBeCloseTo(before, 2);
  const field = page.getByRole('textbox', { name: 'Texto da forma' });
  await field.click();
  await expect(toolbar.getByRole('button', { name: 'Negrito' })).toBeVisible();
  await field.fill('Especial');
  await toolbar.getByRole('button', { name: 'Negrito' }).click();
  const text = shape.locator('[data-shape-text]');
  await expect(text).toHaveText('Especial');
  await expect(text).toHaveCSS('font-weight', '700');
  await chooseDesignerOption(toolbar.getByRole('combobox', { name: 'Fonte' }), 'Montserrat');
  await expect(text).toHaveCSS('font-family', /Montserrat/);
  await toolbar.getByRole('button', { name: 'Contorno do texto' }).click();
  const outline = page.getByRole('dialog', { name: 'Contorno do texto' });
  await outline.getByRole('button', { name: '#ef4444', exact: true }).first().click();
  await expect(text).toHaveCSS('-webkit-text-stroke-color', 'rgb(239, 68, 68)');
  await expect(text).not.toHaveCSS('-webkit-text-stroke-width', '0px');
});
