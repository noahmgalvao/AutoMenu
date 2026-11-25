import { expect, test, type Page } from '@playwright/test';

const fixture = '/tests/fixtures/template-editor.html';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('**/rest/v1/template_favorites*', route => route.fulfill({ json: [] }));
});

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 8) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

test('discovery swipes between pages and repeats the central like without unliking', async ({ page }) => {
  await page.goto(fixture + '?dense-list');
  await page.getByRole('button', { name: 'Editorial Essencial', exact: true }).click();
  await page.getByRole('button', { name: 'Descobrir', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const preview = dialog.getByRole('img', { name: /Prévia de Editorial Essencial/ });
  const box = (await preview.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await expect(preview).toHaveAccessibleName(/página 1 de [2-9]/);
  await drag(page, { x, y }, { x: x - 110, y });
  await expect(preview).toHaveAccessibleName(/página 2 de/);
  await drag(page, { x, y }, { x: x + 110, y });
  await expect(preview).toHaveAccessibleName(/página 1 de/);
  const heart = dialog.locator('[data-discover-like-heart]');
  await page.mouse.click(x, y);
  await page.mouse.click(x, y);
  await expect(heart).toBeVisible();
  const first = await heart.elementHandle();
  await page.mouse.click(x, y);
  await page.mouse.click(x, y);
  await expect(heart).toBeVisible();
  expect(await first!.evaluate(node => node.isConnected)).toBe(false);
  await expect(dialog.getByRole('button', { name: /Remover.*favoritos|Desfavoritar/i })).toBeVisible();
  await expect(heart).toHaveCount(0);
});

test('moving text above positioned categories keeps their positions and crosses a photo', async ({ page }) => {
  await page.goto(fixture + '?layout=free-text-between&image');
  const categories = ['Entradas', 'Principais', 'Sobremesas'].map(name => page.locator(`[data-category-chunk="${name}"]`));
  const text = page.locator('#product-container-text-a');
  const image = page.locator('[data-added-image-id="test-layer"]');
  await text.scrollIntoViewIfNeeded();
  const before = await Promise.all(categories.map(category => category.evaluate(node => node.getBoundingClientRect().top - node.closest('[data-menu-print-page]')!.getBoundingClientRect().top)));
  const start = (await text.boundingBox())!;
  const photo = (await image.boundingBox())!;
  const drop = { x: photo.x + 25, y: photo.y + 55 };
  await drag(page, { x: start.x + 16, y: start.y + start.height / 2 }, drop, 3);
  await expect(text).toHaveAttribute('data-drag-group', /^ft_zone_/);
  await expect.poll(async () => Math.abs((await text.boundingBox())!.y + start.height / 2 - drop.y)).toBeLessThan(9);
  const current = await Promise.all(categories.map(category => category.evaluate(node => node.getBoundingClientRect().top - node.closest('[data-menu-print-page]')!.getBoundingClientRect().top)));
  for (const [index, top] of current.entries()) expect(Math.abs(top - before[index])).toBeLessThan(2);
  await expect(page.locator('[data-menu-print-page]')).toHaveCount(1);
});

test('content layers move together while a free text keeps its own layer', async ({ page }) => {
  await page.goto(fixture + '?added-image&editable');
  const image = page.locator('[data-added-image-id]');
  const product = page.locator('#product-container-1');
  const category = page.locator('#category-header-Entradas');
  const menu = page.locator('[data-canvas-object-menu]');
  const front = menu.getByRole('button', { name: 'Trazer para frente' });
  const back = menu.getByRole('button', { name: 'Enviar para trás' });
  await expect(image).toHaveAttribute('data-canvas-layer', '1');
  await expect(product).toHaveAttribute('data-canvas-layer', '2');
  await product.click({ button: 'right' });
  await expect(front).toBeDisabled();
  await page.keyboard.press('Escape');
  await image.click({ button: 'right' });
  await front.click();
  await expect(image).toHaveAttribute('data-canvas-layer', '3');
  await category.click({ button: 'right' });
  await front.click();
  await expect(product).toHaveAttribute('data-canvas-layer', '4');
  await expect(category).toHaveAttribute('data-canvas-layer', '4');
  await product.click({ button: 'right' });
  await expect(front).toBeDisabled();
  await back.click();
  await expect(category).toHaveAttribute('data-canvas-layer', '2');
  await page.getByRole('button', { name: 'Adicionar texto', exact: true }).click();
  const field = page.locator('[data-canvas-free-text-id] [contenteditable="true"]');
  await expect(field).toBeFocused();
  await field.press('Escape');
  const text = page.locator('[data-canvas-free-text-id]');
  await text.click({ button: 'right' });
  await front.click();
  await expect(text).toHaveAttribute('data-canvas-layer', '4');
  await expect(product).toHaveAttribute('data-canvas-layer', '2');
});

test('contrast tips fix a shared text color or fill across all matching texts', async ({ page }) => {
  await page.goto(fixture + '?low-contrast');
  await page.getByRole('button', { name: 'Abrir dicas do cardápio' }).click();
  const contrast = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Textos com pouco contraste' }) });
  const rows = contrast.locator('.rounded-xl');
  await rows.filter({ hasText: 'Título' }).filter({ hasNotText: 'Subtítulo' }).getByRole('button', { name: 'Ajustar cor do texto' }).click();
  await expect(page.locator('#menu-title-text')).not.toHaveCSS('color', 'rgb(238, 238, 238)');
  await rows.filter({ hasText: 'Nomes dos produtos' }).getByRole('button', { name: 'Adicionar preenchimento' }).click();
  for (const name of await page.locator('[data-word-fit-scope="productName"]').all()) {
    await expect(name).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  }
  await rows.filter({ hasText: 'Rótulo claro' }).getByRole('button', { name: 'Adicionar preenchimento' }).click();
  const shapeText = page.locator('[data-added-image-id="shape-contrast"] [data-shape-text]');
  await expect(shapeText).toHaveCSS('background-color', 'rgb(0, 0, 0)');
});

test('background text moves in all copies and its overlap tip clears the collision', async ({ page }) => {
  await page.goto(fixture + '?background-text');
  const paper = page.locator('[data-menu-print-page]').first();
  const copies = page.locator('[data-canvas-free-text-id="background-text"]');
  await expect(copies).toHaveCount(2);
  const text = copies.first();
  await text.scrollIntoViewIfNeeded();
  const original = (await text.boundingBox())!;
  const title = paper.locator('#menu-title-text');
  const titleBox = (await title.boundingBox())!;
  const range = await title.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rect = range.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  await drag(page, { x: original.x + 8, y: original.y + 8 }, { x: range.x + 8, y: range.y + 8 }, 8);
  await expect.poll(async () => Math.abs((await text.boundingBox())!.y - titleBox.y)).toBeLessThan(30);
  await page.getByRole('button', { name: 'Abrir dicas do cardápio' }).click();
  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Textos sobrepostos no plano de fundo' }) });
  await section.getByRole('button', { name: 'Ajustar posição' }).click();
  await expect(section).toHaveCount(0);
  await expect(copies).toHaveCount(2);
  const positions = await copies.evaluateAll(nodes => nodes.map(node => node.parentElement!.style.top));
  expect(new Set(positions).size).toBe(1);
});


test('each add shape click inserts a square with its remove shortcut before More', async ({ page }) => {
  await page.goto(fixture);
  const add = page.getByRole('button', { name: 'Adicionar forma', exact: true });
  await add.click();
  await add.click();
  const shapes = page.locator('[data-added-image-id][data-canvas-layer="1"]');
  await expect(shapes).toHaveCount(2);
  const styles = await shapes.evaluateAll(elements => elements.map(element => element.getAttribute('style')));
  expect(new Set(styles).size).toBe(2);
  const shortcuts = page.locator('[data-object-page-index] > button');
  await expect(shortcuts.nth(-2)).toHaveAttribute('title', 'Remover forma');
  await expect(shortcuts.last()).toHaveAttribute('title', 'Mais opções');
});

test('landscape can use five columns and changing a selected category leaves others alone', async ({ page }) => {
  await page.goto(fixture + '?general-rules&photos=top&cols=1&landscape&keep-categories&no-photos');
  const productColumns = page.getByRole('group', { name: 'Colunas de produtos' });
  const categoryColumns = page.getByRole('group', { name: 'Colunas de categorias' });
  await expect(productColumns.getByRole('button', { name: '5', exact: true })).toBeVisible();
  await expect(categoryColumns.getByRole('button', { name: '5', exact: true })).toBeVisible();
  await page.locator('[data-category-chunk="Entradas"] h2').click();
  await productColumns.getByRole('button', { name: '2', exact: true }).click();
  await expect(page.locator('[data-category-chunk="Entradas"] [data-pagination-grid]')).toHaveAttribute('data-pagination-columns', '2');
  await expect(page.locator('[data-category-chunk="Principais"] [data-pagination-grid]')).toHaveAttribute('data-pagination-columns', '1');
  await page.getByRole('button', { name: 'Abrir dicas do cardápio' }).click();
  await expect(page.getByRole('button', { name: 'Padronizar colunas de produtos' })).toBeVisible();
});

test('word width blocks narrow columns and a reduction applies to matching product names', async ({ page }) => {
  await page.goto(fixture + '?general-rules&photos=top&cols=1&long-name&no-photos');
  const columns = page.getByRole('group', { name: 'Colunas de produtos' });
  await expect(columns.getByRole('button', { name: '3', exact: true })).toBeDisabled();
  await columns.getByRole('button', { name: 'Ajuda sobre colunas de produtos' }).click();
  await expect(columns.getByRole('tooltip')).toContainText('limitado pelas definições de fonte');
  const names = page.locator('[data-word-fit-scope="productName"]');
  for (const name of await names.all()) {
    await expect(name).toHaveAttribute('data-word-fit-minimum', '13');
    await expect(name).toHaveCSS('font-size', '13px');
    await expect(name).toHaveCSS('overflow-wrap', 'normal');
  }
});
