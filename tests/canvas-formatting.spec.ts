import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ body: '', contentType: 'text/css' }));
});

test('a cleared subtitle can be restored from the title editor', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html');
  const title = page.locator('#menu-title-text');
  const subtitle = page.locator('#menu-subtitle-text');
  await subtitle.fill('');
  await subtitle.press('Enter');
  await title.click();

  const placeholder = page.getByLabel('Adicionar subtítulo');
  await expect(placeholder).toBeVisible();
  await placeholder.click();
  await expect(placeholder).toBeFocused();
  await page.keyboard.type('Menu de inverno');
  await page.keyboard.press('Enter');
  await expect(subtitle).toHaveText('Menu de inverno');
  await expect(placeholder).toHaveCount(0);
});

test('the border panel starts with a contour and applies sliders and numbers immediately', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?layout');
  const freeText = page.locator('#product-container-text-a');
  await freeText.click();
  await freeText.getByRole('button', { name: 'Editar texto' }).click();
  const toolbar = page.locator('[data-inline-format-toolbar]');
  await toolbar.getByRole('button', { name: 'Borda', exact: true }).click();
  const presets = toolbar.getByRole('combobox', { name: 'Lados da borda' });
  await expect(presets).toHaveValue('outline');
  for (const [preset, side] of [['top', 'Acima'], ['bottom', 'Abaixo'], ['left', 'Esquerda'], ['right', 'Direita']]) {
    await presets.selectOption(preset);
    await expect(toolbar.getByRole('button', { name: side, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(toolbar.locator('[role="group"] button[aria-pressed="true"]')).toHaveCount(1);
  }
  await presets.selectOption('outline');
  const stroke = freeText.locator('[data-menu-border]');
  await expect(stroke).toHaveCSS('border-left-width', '1px');
  const thickness = toolbar.getByRole('spinbutton', { name: 'Espessura (px)' });
  await thickness.fill('5');
  await expect(stroke).toHaveCSS('border-left-width', '5px');
  await expect(toolbar.getByRole('slider', { name: 'Espessura (px)' })).toHaveValue('5');
  await toolbar.getByRole('slider', { name: 'Arredondamento (px)' }).press('ArrowRight');
  await expect(stroke).toHaveCSS('border-top-left-radius', '1px');
  const offset = toolbar.getByRole('spinbutton', { name: 'Distância (px)' });
  const maximum = (await offset.getAttribute('max'))!;
  await offset.fill(maximum);
  await expect(stroke).toHaveCSS('top', `${-Number(maximum)}px`);
  await expect(toolbar.getByRole('button', { name: 'Concluir edição' })).toHaveCount(0);
  const toolbarBounds = (await toolbar.boundingBox())!;
  const borderBounds = (await stroke.boundingBox())!;
  expect(toolbarBounds.y >= borderBounds.y + borderBounds.height ||
    toolbarBounds.y + toolbarBounds.height <= borderBounds.y ||
    toolbarBounds.x >= borderBounds.x + borderBounds.width ||
    toolbarBounds.x + toolbarBounds.width <= borderBounds.x).toBe(true);
});

test('the safe distance accounts for neighboring text and preserves room for the stroke', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?layout=borders');
  const source = page.locator('#product-container-text-a');
  const neighbor = page.locator('#product-name-text-b');
  await source.click();
  await source.getByRole('button', { name: 'Editar texto' }).click();
  const toolbar = page.locator('[data-inline-format-toolbar]');
  await toolbar.getByRole('button', { name: 'Borda', exact: true }).click();
  const presets = toolbar.getByRole('combobox', { name: 'Lados da borda' });
  await presets.selectOption('bottom');
  const offset = toolbar.getByRole('slider', { name: 'Distância (px)' });
  const stroke = source.locator('[data-menu-border]');
  await expect(stroke).toHaveCSS('border-bottom-width', '1px');
  await offset.press('End');

  const glyphBounds = (element: Element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const { top, bottom } = range.getBoundingClientRect();
    return { top, bottom };
  };
  const ownText = await source.locator('[data-word-fit]').evaluate(glyphBounds);
  const otherText = await neighbor.evaluate(glyphBounds);
  const outerEdge = () => stroke.evaluate((element) => element.getBoundingClientRect().bottom);
  await expect.poll(outerEdge).toBeLessThan(otherText.top);
  await offset.press('Home');
  await expect.poll(outerEdge).toBeGreaterThan(ownText.bottom + 1);
  const bottomMaximum = Number(await offset.getAttribute('max'));
  await presets.selectOption('top');
  await expect.poll(async () => Number(await offset.getAttribute('max'))).toBeGreaterThan(bottomMaximum);
});

test('category markers scale with the configured heading size', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?layout');
  const heading = page.locator('#text-Entradas');
  const category = page.locator('[data-category-id="Entradas"]');
  await category.click();
  await category.getByRole('button', { name: 'Editar produto' }).click();
  const toolbar = page.locator('[data-inline-format-toolbar]');
  await toolbar.getByRole('button', { name: 'Marcadores das categorias' }).click();
  await toolbar.getByRole('combobox', { name: 'Marcadores das categorias' }).selectOption('number-padded');
  const marker = category.locator('[data-menu-marker]');
  const original = parseFloat(await marker.evaluate((node) => getComputedStyle(node).fontSize));
  await toolbar.getByPlaceholder('Tam.').fill('32');
  await expect.poll(async () => parseFloat(await marker.evaluate((node) => getComputedStyle(node).fontSize))).toBeGreaterThan(original);
  await expect(heading).toBeVisible();
});
