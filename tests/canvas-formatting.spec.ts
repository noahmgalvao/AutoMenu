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

test.describe('heading hit areas', () => {
  test.use({ hasTouch: true });

  test('title and subtitle only accept clicks and taps on text', async ({ page }) => {
    await page.goto('/tests/fixtures/template-editor.html');
    for (const selector of ['#menu-title-text', '#menu-subtitle-text']) {
      const heading = page.locator(selector);
      const points = await heading.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const text = range.getBoundingClientRect();
        const block = element.getBoundingClientRect();
        const y = (text.top + text.bottom) / 2;
        const gapX = text.left - block.left > block.right - text.right
          ? (text.left + block.left) / 2 : (text.right + block.right) / 2;
        return { text: { x: (text.left + text.right) / 2, y }, gap: { x: gapX, y } };
      });
      await page.mouse.click(points.gap.x, points.gap.y);
      await expect(heading).not.toBeFocused();
      await page.touchscreen.tap(points.text.x, points.text.y);
      await expect(heading).toBeFocused();
      await page.touchscreen.tap(points.gap.x, points.gap.y);
      await expect(heading).not.toBeFocused();
      await expect(page.locator('[data-inline-format-toolbar]')).toHaveCount(0);
    }
  });
});

test('the border panel starts with a contour and applies sliders and numbers immediately', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?layout');
  const freeText = page.locator('#product-container-text-a');
  await freeText.click();
  await freeText.getByRole('button', { name: 'Mais opções' }).click();
  await page.getByRole('button', { name: 'Editar texto' }).click();
  const toolbar = page.locator('[data-inline-format-toolbar]');
  await toolbar.getByRole('button', { name: 'Borda', exact: true }).click();
  const presets = toolbar.getByRole('combobox', { name: 'Lados da borda' });
  const sideButtons = toolbar.getByRole('group', { name: 'Lados individuais da borda' });
  await expect(toolbar.locator('[data-menu-border]')).toHaveCount(0);
  await expect(presets).toHaveValue('outline');
  await expect(presets.locator('option').last()).toHaveText('Personalizada');
  await expect(sideButtons).toHaveCount(0);
  for (const preset of ['top', 'bottom', 'left', 'right']) {
    await presets.selectOption(preset);
    await expect(sideButtons).toHaveCount(0);
  }
  await presets.selectOption('custom');
  await expect(sideButtons.getByRole('button', { name: 'Direita' })).toHaveAttribute('aria-pressed', 'true');
  await sideButtons.getByRole('button', { name: 'Acima' }).click();
  await sideButtons.getByRole('button', { name: 'Direita' }).click();
  await expect(presets).toHaveValue('custom');
  await expect(sideButtons.getByRole('button', { name: 'Acima' })).toHaveAttribute('aria-pressed', 'true');
  await presets.selectOption('outline');
  await expect(sideButtons).toHaveCount(0);
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
  await source.getByRole('button', { name: 'Mais opções' }).click();
  await page.getByRole('button', { name: 'Editar texto' }).click();
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
  await category.getByRole('button', { name: 'Mais opções' }).click();
  await expect(page.locator('[data-canvas-object-menu]').getByText('Linha da categoria')).toHaveCount(0);
  await page.getByRole('button', { name: 'Editar categoria' }).click();
  const toolbar = page.locator('[data-inline-format-toolbar]');
  await toolbar.getByRole('button', { name: 'Marcadores das categorias' }).click();
  await toolbar.getByRole('combobox', { name: 'Marcadores das categorias' }).selectOption('number-padded');
  const marker = category.locator('[data-menu-marker]');
  const original = parseFloat(await marker.evaluate((node) => getComputedStyle(node).fontSize));
  await toolbar.getByPlaceholder('Tam.').fill('32');
  await expect.poll(async () => parseFloat(await marker.evaluate((node) => getComputedStyle(node).fontSize))).toBeGreaterThan(original);
  await expect(heading).toBeVisible();
});

test('the designer groups product decorations after its text controls', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html');
  const product = page.locator('#product-container-1');
  await product.getByRole('heading', { name: 'Burrata da casa' }).click();
  const decorations = page.locator('[data-sidebar-decorations="product"]');
  await expect(decorations).toBeVisible();
  for (const label of ['Nomes dos produtos', 'Preços dos produtos', 'Descrições dos produtos']) {
    expect(await page.getByText(label, { exact: true }).evaluate((element) => {
      const group = document.querySelector('[data-sidebar-decorations="product"]')!;
      return Boolean(element.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING);
    })).toBe(true);
  }
  const line = decorations.getByRole('button', { name: 'Linha do produto' });
  const border = decorations.getByRole('button', { name: 'Borda', exact: true });
  const markers = decorations.getByRole('button', { name: 'Marcadores dos produtos' });
  await line.click();
  await decorations.getByRole('button', { name: 'Ornamental' }).click();
  await expect(product.locator('[data-ornamental-divider]')).toHaveCount(1);
  await border.click();
  await expect(line).toHaveAttribute('aria-expanded', 'false');
  await expect(decorations.getByRole('combobox', { name: 'Aplicar borda em' })).toHaveValue('product');
  await decorations.getByRole('combobox', { name: 'Aplicar borda em' }).selectOption('price');
  await decorations.getByRole('combobox', { name: 'Lados da borda' }).selectOption('outline');
  await expect(product.locator('[data-template-price] [data-menu-border]')).toBeVisible();
  await markers.click();
  await expect(border).toHaveAttribute('aria-expanded', 'false');
  await decorations.getByRole('combobox', { name: 'Marcadores dos produtos' }).selectOption('dot');
  await expect(product.locator('[data-menu-marker]')).toHaveText('•');
});

test('free text becomes an editable background and repeats on a new page', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?layout');
  const source = page.locator('#product-container-text-a');
  await source.click();
  await source.getByRole('button', { name: 'Mais opções' }).click();
  await page.getByRole('button', { name: 'Definir como plano de fundo', exact: true }).click();
  await expect(page.locator('[data-background-prompt]')).toHaveCount(0);
  const layers = page.locator('[data-canvas-background-layer]');
  await expect(layers.first().locator('#product-container-text-a')).toBeVisible();
  const pages = page.locator('[data-menu-print-page]');
  await pages.first().dispatchEvent('click');
  await page.getByTitle('Adicionar página depois').click();
  await expect(layers).toHaveCount(2);
  await expect(layers.last()).toHaveText('A');
  await source.click();
  await source.getByRole('button', { name: 'Mais opções' }).click();
  await page.getByRole('button', { name: 'Remover', exact: true }).click();
  await expect(layers).toHaveCount(0);
});

for (const layout of ['list', 'cards', 'background']) {
  test(`the ${layout} photo menu switches from text and keeps editing active`, async ({ page }) => {
    await page.goto(`/tests/fixtures/template-editor.html?photos=${layout}`);
    const product = page.locator('#product-container-1');
    const photo = product.locator('[data-template-image]');
    const title = product.getByRole('heading');
    await title.click();
    await product.getByRole('button', { name: 'Mais opções' }).click();
    const options = page.locator('[data-canvas-object-menu]');
    await expect(options.getByText('Linha do produto')).toHaveCount(0);
    await options.getByRole('button', { name: 'Editar produto' }).click();
    const toolbar = page.locator('[data-inline-format-toolbar]');
    await toolbar.getByRole('button', { name: 'Linha do produto' }).click();
    await toolbar.getByRole('combobox', { name: 'Linha do produto' }).selectOption('ornamental');
    await expect(product.locator('[data-ornamental-divider]')).toHaveCount(1);
    await photo.click({ position: { x: 12, y: 10 } });
    await expect(toolbar).toHaveCount(0);
    const imageMenu = page.locator('[data-editor-popover][data-product-image-surface]');
    await expect(imageMenu).toBeVisible();
    await imageMenu.getByRole('button', { name: 'Inverter horizontalmente' }).click();
    await imageMenu.getByRole('button', { name: 'Inverter verticalmente' }).click();
    await expect(photo.getByRole('img')).toHaveCSS('transform', 'matrix(-1, 0, 0, -1, 0, 0)');
    await expect(page.locator('#product-image-2 img')).toHaveCSS('transform', 'none');
    await imageMenu.getByRole('button', { name: 'Aumentar imagem' }).click();
    await imageMenu.getByRole('button', { name: 'Diminuir imagem' }).click();
    const replacementPath = '/tests/fixtures/replacement-product.png';
    const replacement = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBXsAAAAASUVORK5CYII=', 'base64');
    await page.route('**/storage/v1/object/product-images/**', route => route.fulfill({ json: { Key: 'product-images/replacement.png' } }));
    await page.route('**/rest/v1/assets?*', route => route.fulfill({ json: {
      ...route.request().postDataJSON(),
      source_url: new URL(replacementPath, page.url()).href,
    } }));
    await page.route(`**${replacementPath}`, route => route.fulfill({ body: replacement, contentType: 'image/png' }));
    const chooser = page.waitForEvent('filechooser');
    await photo.getByRole('button', { name: 'Substituir imagem' }).click();
    await (await chooser).setFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: replacement });
    await expect(photo.getByRole('img')).toHaveAttribute('src', new URL(replacementPath, page.url()).href);
    await expect(title).toHaveAttribute('contenteditable', 'true');
    await photo.getByRole('button', { name: 'Remover imagem' }).click();
    await expect(photo.getByRole('button', { name: 'Adicionar imagem' })).toBeVisible();
    await title.click();
    await expect(photo).toHaveCount(0);
    await expect(title).toHaveAttribute('contenteditable', 'true');
    await page.locator('[data-automenu-editor-canvas]').click({ position: { x: 8, y: 32 } });
    await expect(title).toHaveAttribute('contenteditable', 'false');
  });
}

test('numeric arrows apply one step and repeat while held', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?layout');
  await page.locator('#menu-title-text').focus();
  const toolbar = page.locator('[data-inline-format-toolbar]');
  const size = toolbar.getByRole('spinbutton');
  const current = Number(await size.inputValue());
  await toolbar.getByRole('button', { name: 'Diminuir', exact: true }).click();
  await expect(size).toHaveValue(String(current - 1));
  const down = (await toolbar.getByRole('button', { name: 'Diminuir', exact: true }).boundingBox())!;
  await page.mouse.move(down.x + down.width / 2, down.y + down.height / 2);
  await page.mouse.down();
  await expect.poll(async () => Number(await size.inputValue())).toBeLessThan(current - 3);
  await page.mouse.up();
  await page.locator('#page-number-0').click();
  const pageNumberSize = toolbar.getByRole('spinbutton');
  const pageNumberStart = Number(await pageNumberSize.inputValue());
  await toolbar.getByRole('button', { name: 'Aumentar', exact: true }).click();
  await expect(pageNumberSize).toHaveValue(String(pageNumberStart + 1));
});

test('the price prompt shows only the amount in the selected adjustment mode', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=list');
  const product = page.locator('#product-container-1');
  await product.getByRole('heading').click();
  await product.getByRole('button', { name: 'Mais opções' }).click();
  await page.getByRole('button', { name: 'Editar produto' }).click();
  await product.locator('#product-price-1').focus();
  const toolbar = page.locator('[data-inline-format-toolbar]');
  await toolbar.getByRole('button', { name: 'Aumentar preço' }).click();
  const prompt = page.getByText('Reajustar os outros produtos?').locator('../..');
  await expect(prompt).toContainText('+10%');
  await expect(prompt).not.toContainText('R$');
  const adjustmentType = toolbar.getByRole('combobox', { name: 'Tipo do reajuste' });
  await adjustmentType.selectOption('integer');
  await toolbar.getByRole('button', { name: 'Aumentar preço' }).click();
  await expect(prompt).toContainText('+10% e +R$ 10,00');
  await expect(prompt).not.toContainText('→');
  await page.getByRole('button', { name: 'Só neste produto' }).click();
  await product.getByRole('button', { name: 'Mais opções' }).click();
  await page.getByRole('button', { name: 'Editar produto' }).click();
  await product.locator('#product-price-1').focus();
  await adjustmentType.selectOption('integer');
  await toolbar.getByRole('button', { name: 'Aumentar preço' }).click();
  await expect(prompt).toContainText('+R$ 10,00');
  await expect(prompt).not.toContainText('%');
});

test('the first price saves when selecting another product and selected products can be edited together', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=list&zero-price');
  const first = page.locator('#product-container-1');
  const second = page.locator('#product-container-2');
  await first.getByRole('heading').click();
  await first.getByTitle('Editar produto').click();
  await first.locator('#product-price-1').fill('12,50');
  await second.getByRole('heading').click();
  await expect(second.getByTitle('Editar produto')).toBeVisible();
  await expect(first.locator('#product-price-1')).toHaveText('12,50');
  await expect(first.locator('#product-price-1')).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByText('Reajustar os outros produtos?')).toHaveCount(0);

  await second.getByTitle('Seleção múltipla').click();
  await first.getByRole('heading').click();
  await first.getByTitle('Editar produto').click();
  await expect(second.locator('#product-name-2')).toHaveClass(/bg-indigo-500\/15/);
  await expect(second.locator('#product-price-2')).toHaveClass(/bg-indigo-500\/15/);
  await expect(second.locator('#product-description-2')).toHaveClass(/bg-indigo-500\/15/);
  await expect(second.locator('[data-template-image]').locator('[class*="bg-indigo-500/15"]')).toBeVisible();
  await second.getByRole('heading').click();
  await expect(second.getByRole('heading')).toBeFocused();
  await expect(first.getByRole('heading')).toHaveClass(/bg-indigo-500\/15/);
  await expect(first.getByRole('heading')).toHaveAttribute('contenteditable', 'true');
});

test('editing selected categories keeps their products available as the formatting toolbar follows focus', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=list&different-categories');
  const first = page.locator('[data-category-id="Entradas"]');
  const second = page.locator('[data-category-id="Sobremesas"]');
  await first.getByRole('heading').click();
  await first.getByTitle('Seleção múltipla').click();
  await second.getByRole('heading').click();
  await second.getByTitle('Editar categoria').click();
  await expect(second.getByRole('heading')).toBeFocused();
  await expect(first.getByRole('heading')).toHaveClass(/bg-indigo-500\/15/);
  const price = page.locator('#product-price-1');
  const otherProduct = page.locator('#product-name-3');
  await expect(price).toHaveAttribute('contenteditable', 'true');
  await expect(otherProduct).toHaveAttribute('contenteditable', 'true');
  await price.click();
  await expect(price).toBeFocused();
  const toolbar = page.locator('[data-inline-format-toolbar]');
  await expect(toolbar.getByRole('button', { name: 'Aumentar preço' })).toBeVisible();
  await otherProduct.click();
  await expect(otherProduct).toBeFocused();
  await expect(toolbar.getByRole('button', { name: 'Aumentar preço' })).toHaveCount(0);
  await expect(price).toHaveAttribute('contenteditable', 'true');
  const title = page.locator('#menu-title-text');
  await title.click();
  await expect(title).toBeFocused();
  await expect(price).toHaveAttribute('contenteditable', 'false');
  await expect(price).not.toHaveClass(/bg-indigo-500\/15/);
});

test('editing one selected free text keeps the other editable', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?layout');
  const first = page.locator('#product-container-text-a');
  const second = page.locator('#product-container-text-b');
  await first.click();
  await first.getByTitle('Seleção múltipla').click();
  await second.click();
  await second.getByTitle('Editar texto').click();
  const firstText = first.locator('#product-name-text-a');
  await expect(firstText).toHaveAttribute('contenteditable', 'true');
  await expect(firstText).toHaveClass(/bg-indigo-500\/15/);
  await firstText.click();
  await expect(firstText).toBeFocused();
  await expect(second.locator('#product-name-text-b')).toHaveAttribute('contenteditable', 'true');
});

test('the product designer saves other forms on cancel and saves edits on the same outside click', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=list&product-designer&zero-price');
  const first = page.locator('#product-container-1');
  const second = page.locator('#product-container-2');
  const startEditing = async () => {
    await first.hover();
    await first.getByRole('button').last().click();
    await first.getByRole('button', { name: 'Editar' }).click();
  };
  await startEditing();
  await first.getByPlaceholder('Nome do produto').fill('Burrata fresca');
  await second.getByPlaceholder('Nome do produto').fill('Cancelar este nome');
  await second.getByRole('button', { name: 'Cancelar' }).click();
  await expect(first.getByRole('heading')).toHaveText('Burrata fresca');
  await expect(second.getByRole('heading')).toHaveText('Risoto de abóbora');
  await expect(page.locator('[data-product-designer-edit-form]')).toHaveCount(0);

  await startEditing();
  await first.locator('input[inputmode="decimal"]').fill('12,50');
  await page.getByRole('button', { name: 'Ordenar produtos' }).click();
  await expect(first).toContainText('12,50');
  await expect(page.locator('[data-product-designer-edit-form]')).toHaveCount(0);
  await expect(page.locator('[data-drag-type="product"]').first()).toHaveAttribute('data-drag-id', '3');
  await expect(page.getByText('Reajustar os outros produtos?')).toHaveCount(0);

  await startEditing();
  await page.getByPlaceholder('Nome da categoria').fill('Cardápio da casa');
  await second.getByPlaceholder('Descrição').fill('Feito na hora');
  await first.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('[data-drag-type="category"]')).toContainText('Cardápio da casa');
  await expect(second).toContainText('Feito na hora');
  await expect(page.locator('[data-product-designer-edit-form]')).toHaveCount(0);
});

test('the first insertion replaces default names and descriptions in the canvas', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=list&default-fields');
  const category = page.locator('[data-category-id="Nova categoria 12"]');
  const title = category.getByRole('heading');
  await title.click();
  await category.getByTitle('Editar categoria').click();
  const name = page.locator('#product-name-1');
  const description = page.locator('#product-description-1');

  for (const [field, value] of [[name, 'Café'], [description, 'Com leite'], [title, 'Bebidas']] as const) {
    await field.click();
    await field.evaluate(element => element.ownerDocument.getSelection()?.collapse(element.firstChild, 3));
    await page.keyboard.insertText(value);
    await expect(field).toHaveText(value);
  }
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-category-id="Bebidas"]')).toBeVisible();
  await expect(name).toHaveText('Café');
  await expect(description).toHaveText('Com leite');
});

test('typing in the middle of a product designer placeholder replaces it', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=list&product-designer&default-fields');
  const product = page.locator('#product-container-1');
  await product.hover();
  await product.getByRole('button').last().click();
  await product.getByRole('button', { name: 'Editar' }).click();
  const name = product.getByPlaceholder('Nome do produto');
  await name.focus();
  await name.evaluate(input => (input as HTMLInputElement).setSelectionRange(3, 3));
  await page.keyboard.insertText('Café');
  await expect(name).toHaveValue('Café');
  await product.getByRole('button', { name: 'Salvar' }).click();
  await expect(product.getByRole('heading')).toHaveText('Café');
});

for (const mobile of [false, true]) {
  test.describe(`${mobile ? 'mobile' : 'desktop'} product focus in the second column`, () => {
    if (mobile) test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('editing brings the full product and price into view', async ({ page }) => {
      await page.goto('/tests/fixtures/template-editor.html?photos=list&lanes=2&different-categories&right-column');
      const product = page.locator('#product-container-3');
      await expect(product.locator('xpath=ancestor::*[@data-drag-column-index][1]')).toHaveAttribute('data-drag-column-index', '1');
      if (mobile) {
        await product.getByRole('heading').tap();
        await product.getByTitle('Editar produto').tap();
      } else {
        await product.getByRole('heading').click();
        await product.getByTitle('Editar produto').click();
      }
      await expect(product.getByRole('heading')).toBeFocused();
      await expect.poll(() => product.evaluate((element, checkCenter) => {
        const canvas = element.closest('[data-automenu-editor-canvas]')!;
        const viewport = canvas.getBoundingClientRect();
        const product = element.getBoundingClientRect();
        const price = element.querySelector('#product-price-3')!.getBoundingClientRect();
        return product.left >= viewport.left && product.right <= viewport.right && price.right <= viewport.right
          && (!checkCenter || Math.abs((product.left + product.right - viewport.left - viewport.right) / 2) < 12);
      }, mobile)).toBe(true);
    });
  });
}

test('the card contour stays complete with a photo frame and adjustable border values', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=cards&card=bordered');
  await page.getByRole('combobox', { name: 'Formato dos cartões' }).selectOption('arch');
  const frame = page.getByRole('combobox', { name: 'Moldura das fotos dos produtos' });
  await frame.selectOption('circle');
  const product = page.locator('#product-container-2');
  const photo = product.locator('[data-template-image]');
  await expect(photo).toHaveCSS('border-radius', '50%');
  await expect.poll(async () => {
    const rect = (await photo.boundingBox())!;
    return Math.abs(rect.width - rect.height);
  }).toBeLessThan(1);
  await product.getByRole('heading').click();
  await product.getByRole('button', { name: 'Mais opções' }).click();
  await page.getByRole('button', { name: 'Editar produto' }).click();
  const toolbar = page.locator('[data-inline-format-toolbar]');
  await toolbar.getByRole('button', { name: 'Borda', exact: true }).click();
  const thickness = toolbar.getByRole('spinbutton', { name: 'Espessura (px)' });
  await toolbar.getByRole('button', { name: 'Aumentar Espessura (px)' }).click();
  await expect(thickness).toHaveValue('2');
  const border = product.locator(':scope > [data-menu-border]');
  for (const side of ['top', 'right', 'bottom', 'left']) await expect(border).toHaveCSS(`border-${side}-width`, '2px');
  const length = toolbar.getByRole('spinbutton', { name: 'Comprimento (%)' });
  await length.fill('75');
  await expect(border).toHaveCount(4);
  await length.fill('100');
  await toolbar.getByRole('spinbutton', { name: 'Arredondamento (px)' }).fill('30');
  await expect(product.locator('[data-template-card]')).toHaveCSS('border-top-right-radius', '30px');
  await toolbar.getByRole('combobox', { name: 'Traço da borda' }).selectOption('dashed');
  await toolbar.getByRole('spinbutton', { name: 'Distância (px)' }).press('ArrowUp');
  await expect(border).toHaveCount(1);
  await expect(border).toHaveCSS('border-right-width', '2px');
  await expect(border).toHaveCSS('border-right-style', 'dashed');
  await toolbar.getByRole('combobox', { name: 'Lados da borda' }).selectOption('right');
  await expect(border).toHaveCSS('border-right-width', '2px');
  await expect(border).toHaveCSS('border-left-width', '0px');
});

test('photo frames fit the template card variants', async ({ page }) => {
  for (const card of ['flat', 'soft', 'elevated', 'full-bleed']) {
    await page.goto(`/tests/fixtures/template-editor.html?photos=cards&card=${card}`);
    const canvas = page.locator('[data-menu-print-page]').first();
    await expect(canvas).toHaveAttribute('data-design-card', card);
    const productCard = page.locator('#product-container-1 [data-template-card]');
    const photo = productCard.locator('[data-template-image]');
    for (const frame of ['rounded', 'circle', 'arch']) {
      await page.getByRole('combobox', { name: 'Moldura das fotos dos produtos' }).selectOption(frame);
      await expect(photo).toHaveAttribute('data-product-photo-frame', frame);
      const [cardBox, photoBox] = await Promise.all([productCard.boundingBox(), photo.boundingBox()]);
      expect(photoBox!.x).toBeGreaterThan(cardBox!.x);
      expect(photoBox!.x + photoBox!.width).toBeLessThan(cardBox!.x + cardBox!.width);
    }
  }
});

test('product and category removal is available in More options', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=list');
  const product = page.locator('#product-container-1');
  await product.getByRole('heading').click();
  await product.getByRole('button', { name: 'Mais opções' }).click();
  await page.getByRole('button', { name: 'Remover', exact: true }).click();
  await expect(product).toHaveCount(0);
  const category = page.locator('[data-category-id="Entradas"]');
  await category.click();
  await category.getByRole('button', { name: 'Mais opções' }).click();
  await page.getByRole('button', { name: 'Remover', exact: true }).click();
  await expect(category).toHaveCount(0);
});

test('category text and group have independent borders and the formatting panel cannot create free text', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?layout=products');
  const category = page.locator('[data-category-id="Entradas"]');
  const group = page.locator('[data-category-chunk="Entradas"]');
  await category.getByRole('heading').click();
  await category.getByRole('button', { name: 'Mais opções' }).click();
  await page.getByRole('button', { name: 'Editar categoria' }).click();
  const toolbar = page.locator('[data-inline-format-toolbar]');
  await toolbar.getByRole('button', { name: 'Borda', exact: true }).click();
  const tabs = toolbar.getByRole('tablist', { name: 'Borda da categoria' });
  await expect(tabs.getByRole('tab', { name: 'Texto da categoria' })).toHaveAttribute('aria-selected', 'true');
  await toolbar.getByRole('combobox', { name: 'Lados da borda' }).selectOption('bottom');
  await tabs.getByRole('tab', { name: 'Grupo' }).click();
  await expect(toolbar.getByRole('combobox', { name: 'Lados da borda' })).toHaveValue('none');
  await toolbar.getByRole('combobox', { name: 'Lados da borda' }).selectOption('outline');
  const groupBorder = group.locator(':scope > [data-menu-border]');
  await expect(groupBorder).toHaveCSS('border-right-width', '1px');
  const toolbarClearsBorder = async () => {
    const [menu, border] = await Promise.all([toolbar.boundingBox(), groupBorder.boundingBox()]);
    return !!menu && !!border && (menu.y >= border.y + border.height || border.y >= menu.y + menu.height
      || menu.x >= border.x + border.width || border.x >= menu.x + menu.width);
  };
  await expect.poll(toolbarClearsBorder).toBe(true);
  const [outline, product] = await Promise.all([groupBorder.boundingBox(), page.locator('#product-container-3').boundingBox()]);
  expect(outline!.y + outline!.height).toBeGreaterThanOrEqual(product!.y + product!.height - 1);
  await toolbar.getByRole('spinbutton', { name: 'Espessura (px)' }).dblclick();
  await expect(page.getByText('Pressione Enter para salvar')).toHaveCount(0);
  await tabs.getByRole('tab', { name: 'Grupo' }).press('ArrowLeft');
  await expect(toolbar.getByRole('combobox', { name: 'Lados da borda' })).toHaveValue('bottom');
  await tabs.getByRole('tab', { name: 'Texto da categoria' }).press('ArrowRight');
  await page.setViewportSize({ width: 390, height: 660 });
  await expect.poll(toolbarClearsBorder).toBe(true);
  await expect(toolbar.getByRole('combobox', { name: 'Lados da borda' })).toHaveValue('outline');
});

test('the arch card moves the product title row a little farther inside', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=cards&cols=3');
  const shape = page.getByLabel('Formato dos cartões');
  const titleRow = page.locator('#product-container-1 [data-product-text-row]');
  await expect(titleRow).toHaveCSS('margin-left', '0px');
  await shape.selectOption('arch');
  await expect(titleRow).toHaveCSS('margin-left', '4px');
  await expect(titleRow).toHaveCSS('margin-right', '4px');
  await expect(titleRow).toHaveCSS('margin-top', '4px');
  await shape.selectOption('rounded');
  await expect(titleRow).toHaveCSS('margin-left', '0px');
});

test('a narrow two-column card saves a corrected name even after typing an oversized word', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=cards&cols=2&lanes=3&long-name');
  const product = page.locator('#product-container-1');
  const title = product.getByRole('heading');
  await title.click();
  await product.getByRole('button', { name: 'Editar produto' }).click();
  await title.fill('Palavra'.repeat(55));
  await expect(title).toHaveClass(/automenu-word-wrap/);
  await expect(page.getByText('Limite de caracteres excedido')).toHaveCount(0);
  await title.fill('X');
  await title.press('Enter');
  await expect(title).toHaveText('X');
  await title.click();
  await product.getByRole('button', { name: 'Editar produto' }).click();
  await title.fill('Burrata');
  await page.locator('[data-automenu-editor-canvas]').click({ position: { x: 8, y: 32 } });
  await expect(title).toHaveText('Burrata');
});

test('product text settles at a single font size and position in a three-column landscape grid', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=cards&lanes=3&landscape&long-name');
  const title = page.locator('#product-name-1');
  await expect(title).toBeVisible();
  const sizes = await title.evaluate(async element => {
    const samples = new Set<string>();
    for (let frame = 0; frame < 24; frame++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const rect = element.getBoundingClientRect();
      samples.add(JSON.stringify([element.isConnected, getComputedStyle(element).fontSize, Math.round(rect.y), Math.round(rect.height)]));
    }
    return [...samples];
  });
  expect(sizes).toHaveLength(1);
  expect(JSON.parse(sizes[0])[0]).toBe(true);
});

test('undo and redo keep product editing open until history reaches an earlier action', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=cards&cols=2');
  await page.getByRole('combobox', { name: 'Formato dos cartões' }).selectOption('square');
  const product = page.locator('#product-container-1');
  const title = product.getByRole('heading');
  await title.click();
  await product.getByRole('button', { name: 'Editar produto' }).click();
  const toolbar = page.locator('[data-inline-format-toolbar]');
  const size = toolbar.getByRole('spinbutton');
  const value = Number(await size.inputValue());
  await size.press('ArrowDown');
  await expect(size).toHaveValue(String(value - 1));
  await page.getByTitle('Desfazer', { exact: true }).click();
  await expect(title).toHaveAttribute('contenteditable', 'true');
  await expect(size).toHaveValue(String(value));
  await page.getByTitle('Refazer', { exact: true }).click();
  await expect(title).toHaveAttribute('contenteditable', 'true');
  await expect(size).toHaveValue(String(value - 1));
  await page.getByTitle('Desfazer', { exact: true }).click();
  await page.getByTitle('Desfazer', { exact: true }).click();
  await expect(toolbar).toHaveCount(0);
  await expect(title).toHaveAttribute('contenteditable', 'false');
});

test('category and product dividers align to the middle of the rendered titles', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=cards&cols=2');
  const product = page.locator('#product-container-1');
  const title = product.getByRole('heading');
  await title.click();
  await product.getByRole('button', { name: 'Editar produto' }).click();
  const toolbar = page.locator('[data-inline-format-toolbar]');
  await toolbar.getByRole('button', { name: 'Linha do produto' }).click();
  await toolbar.getByRole('combobox', { name: 'Linha do produto' }).selectOption('ornamental');
  const getCenterDifference = (node: Element) => {
    const range = document.createRange();
    range.selectNodeContents(node.closest('[data-product-text-row], [data-template-category]')!.querySelector('[data-divider-title]')!);
    const line = node.getBoundingClientRect();
    const text = range.getBoundingClientRect();
    return Math.abs(line.top + line.height / 2 - text.top - text.height / 2);
  };
  await expect.poll(() => product.locator('[data-ornamental-divider]').evaluate(getCenterDifference)).toBeLessThan(1);
  await expect(page.locator('#product-container-2 [data-ornamental-divider]')).toBeVisible();
  await expect(page.locator('#product-container-3 [data-ornamental-divider]')).toBeVisible();
  const categoryLine = page.locator('[data-template-category] [data-divider-segment="start"]').first();
  await expect.poll(() => categoryLine.evaluate(getCenterDifference)).toBeLessThan(1);
});

for (const layout of ['photos=list&lanes=2', 'photos=cards&cols=3']) {
  test(`a price shrinks before wrapping and the leader follows the last line (${layout})`, async ({ page }) => {
    await page.goto(`/tests/fixtures/template-editor.html?${layout}&price-flow`);
    const product = page.locator('#product-container-1');
    const row = product.locator('[data-product-text-row]');
    const prices = page.locator('[data-price-value]');
    const price = product.locator('[data-price-value]');
    await expect(price).toBeVisible();
    await page.locator('[data-product-text-row]').evaluateAll(rows => {
      rows.forEach(row => { (row as HTMLElement).style.width = '330px'; });
    });
    await expect(price).toHaveCSS('font-size', '28px');
    const widths = await row.evaluate(element => {
      const width = element.getBoundingClientRect().width;
      const scale = width / element.clientWidth;
      const title = element.querySelector('[data-divider-title]')!;
      const price = element.querySelector('[data-template-price]')!;
      const titleRange = document.createRange();
      titleRange.selectNodeContents(title);
      const titleWidth = titleRange.getBoundingClientRect().width / scale;
      const priceWidth = price.getBoundingClientRect().width / scale;
      return {
        tight: Math.ceil(titleWidth + priceWidth * 0.82 + 10),
        wrapped: Math.ceil(priceWidth + 14),
      };
    });
    const resize = (width: number) => row.evaluate((element, width) => { element.style.width = `${width}px`; }, width);
    await resize(widths.tight);
    await expect.poll(() => price.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeLessThan(28);
    await expect(row).not.toHaveAttribute('data-price-wrap', '');
    const reduced = await price.evaluate(element => getComputedStyle(element).fontSize);
    for (const other of await prices.all()) await expect(other).toHaveCSS('font-size', reduced);

    await resize(widths.wrapped);
    await expect(row).toHaveAttribute('data-price-wrap', '');
    await expect(price).toHaveCSS('font-size', '28px');
    await expect(row.locator('[data-divider-segment="continuation"]')).toBeVisible();
    const samples = await row.evaluate(async element => {
      const frames = new Set<string>();
      const lastLine = element.querySelector('[data-divider-title]')!;
      const start = element.querySelector('[data-divider-segment="start"]')!;
      const continuation = element.querySelector('[data-divider-segment="continuation"]')!;
      const priceBox = element.querySelector('[data-template-price]')!;
      for (let index = 0; index < 20; index++) {
        await new Promise(requestAnimationFrame);
        const range = document.createRange();
        range.selectNodeContents(lastLine);
        const glyphs = Array.from(range.getClientRects());
        const tail = glyphs[glyphs.length - 1];
        const line = start.getBoundingClientRect();
        const lower = continuation.getBoundingClientRect();
        frames.add(JSON.stringify({
          lines: glyphs.length,
          aligned: Math.abs(line.top + line.height / 2 - tail.top - tail.height / 2) < 1,
          afterName: line.left >= tail.right,
          beforePrice: lower.right <= priceBox.getBoundingClientRect().left,
        }));
      }
      return [...frames].map(sample => JSON.parse(sample));
    });
    expect(samples).toHaveLength(1);
    expect(samples[0]).toEqual({ lines: expect.any(Number), aligned: true, afterName: true, beforePrice: true });
    expect(samples[0].lines).toBeGreaterThan(1);

    await resize(330);
    for (const other of await prices.all()) await expect(other).toHaveCSS('font-size', '28px');
    await resize(widths.tight);
    await product.getByRole('heading').click();
    await product.getByTitle('Editar produto').click();
    await price.focus();
    const fontSize = page.locator('[data-inline-format-toolbar]').getByRole('spinbutton').first();
    await fontSize.fill('22');
    await fontSize.press('Enter');
    await resize(330);
    for (const other of await prices.all()) await expect(other).toHaveCSS('font-size', '22px');
  });
}

test('prices stay inside narrow cards with three product and three category columns', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=cards&cols=3&lanes=3&price-flow');
  const price = page.locator('#product-container-1 [data-template-price]');
  await expect(price).toHaveAttribute('data-price-stacked', '');
  await expect(price).toHaveCSS('font-size', '15px');
  await expect.poll(() => price.evaluate(element => {
    const price = element.getBoundingClientRect();
    const row = element.parentElement!.getBoundingClientRect();
    return Math.max(0, row.left - price.left, price.right - row.right);
  })).toBeLessThan(0.5);
  const currency = (await price.locator('[data-price-symbol]').boundingBox())!;
  const amount = (await price.locator('[data-price-value]').boundingBox())!;
  expect(amount.y).toBeGreaterThan(currency.y);
});

test('price format settings apply currency and decimals to every product from the canvas toolbar', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=list');
  const product = page.locator('#product-container-1');
  await product.getByRole('heading').click();
  await product.getByTitle('Editar produto').click();
  await product.locator('[data-price-value]').focus();
  const toolbar = page.locator('[data-inline-format-toolbar]');
  await toolbar.getByRole('button', { name: 'Configurações de preço' }).click();
  const format = toolbar.locator('[data-price-format-settings]');
  await format.getByLabel('Símbolo da moeda').selectOption('$');
  await format.getByLabel('Casas decimais').selectOption('1');
  await format.getByLabel('Separador decimal').selectOption('.');
  await expect(format.locator('output')).toHaveText('$ 12.5');
  await expect(page.locator('[data-price-symbol]')).toHaveText(['$', '$', '$']);
  await expect(page.locator('#product-price-2')).toHaveText('59.0');
  await format.getByLabel('Símbolo da moeda').selectOption('€');
  await expect(product.locator('[data-price-symbol]')).toHaveText('€');
  await format.getByLabel('Símbolo da moeda').selectOption('');
  await expect(page.locator('[data-price-symbol]')).toHaveCount(0);
});

test('the product designer edits the shared price format alongside the price', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=list&product-designer');
  const product = page.locator('#product-container-1');
  await product.hover();
  await product.getByRole('button').last().click();
  await product.getByRole('button', { name: 'Editar' }).click();
  await product.getByRole('button', { name: 'Configurações de preço' }).click();
  await product.getByLabel('Símbolo da moeda').selectOption('£');
  await product.getByLabel('Casas decimais').selectOption('0');
  await expect(product.locator('input[inputmode="decimal"]')).toHaveValue('34');
  await product.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('#product-container-2')).toContainText('£ 59');
});

test('clipboard replaces a product from its price field and keeps categories with the same name independent', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/tests/fixtures/template-editor.html?photos=list&different-categories');
  const menu = page.locator('[data-canvas-object-menu]');
  const action = async (selector: string, name: string) => {
    await page.locator(selector).click({ button: 'right' });
    await menu.getByRole('button', { name, exact: true }).click();
  };
  await action('#product-name-1', 'Copiar');
  await action('#product-name-3', 'Editar produto');
  await page.locator('#product-price-3').focus();
  await page.keyboard.press('Control+v');
  await expect(page.locator('#product-name-3')).toHaveText('Burrata da casa');
  await expect(page.locator('#product-description-3')).toHaveText('Com pão e tomatinhos assados.');
  await expect(page.locator('#product-price-3')).toHaveText(await page.locator('#product-price-1').innerText());
  await action('#text-Entradas', 'Copiar');
  await action('#text-Sobremesas', 'Colar');
  await expect(page.locator('[data-category-id] h2').filter({ hasText: /^Entradas$/ })).toHaveCount(2);
  await expect(page.locator('[data-category-chunk]').filter({ has: page.getByText('Risoto de abóbora', { exact: true }) })).toHaveCount(2);
  await page.evaluate(() => navigator.clipboard.writeText('Nome da internet'));
  await action('#product-name-1', 'Colar');
  await expect(page.locator('#product-name-1')).toHaveText('Nome da internet');
  await expect(page.locator('#product-description-1')).toHaveText('Com pão e tomatinhos assados.');
});

test('background paste anchors a new category at the click and contains only the copied product', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/tests/fixtures/template-editor.html?photos=list');
  await page.locator('#product-name-2').click({ button: 'right' });
  const menu = page.locator('[data-canvas-object-menu]');
  await menu.getByRole('button', { name: 'Copiar', exact: true }).click();
  const paper = page.locator('[data-menu-print-page]').first();
  await paper.scrollIntoViewIfNeeded();
  const spot = await paper.evaluate(el => {
    const box = el.getBoundingClientRect();
    return { x: Math.round(box.left + box.width * .65), y: Math.round(Math.min(innerHeight - 75, box.top + box.height * .67)) };
  });
  await page.mouse.click(spot.x, spot.y, { button: 'right' });
  await menu.getByRole('button', { name: 'Colar', exact: true }).click();
  const copy = page.locator('[data-category-chunk][data-free-positioned="true"]').filter({ hasText: 'Risoto de abóbora' });
  await expect(copy).toHaveCount(1);
  await expect(copy.locator('[data-drag-type="product"]')).toHaveCount(1);
  const bounds = await copy.boundingBox();
  expect(Math.abs(bounds!.x - spot.x)).toBeLessThan(2);
  expect(Math.abs(bounds!.y - spot.y)).toBeLessThan(2);
});

test('category photos have resize pins, gallery actions and a temporary empty slot', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=list');
  const title = page.locator('#text-Entradas');
  await title.click();
  await title.evaluate(el => {
    const data = new DataTransfer();
    data.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="96" height="32"><rect width="96" height="32" fill="blue"/></svg>'], 'photo.svg', { type: 'image/svg+xml' }));
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await title.click({ button: 'right' });
  await page.locator('[data-canvas-object-menu]').getByRole('button', { name: 'Editar categoria' }).click();
  const photo = page.locator('#category-image-Entradas');
  await expect(photo.getByRole('button', { name: 'Substituir imagem' })).toBeVisible();
  const pin = photo.locator('[data-photo-corner="3"]');
  const bounds = (await pin.boundingBox())!;
  const original = (await photo.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 18, bounds.y + 18, { steps: 5 });
  await expect(photo.getByRole('button', { name: 'Substituir imagem' })).toHaveCount(0);
  await page.mouse.up();
  await expect(photo.getByRole('button', { name: 'Substituir imagem' })).toBeVisible();
  const resized = (await photo.boundingBox())!.width;
  expect(resized).toBeGreaterThan(original.width);
  await photo.locator('[data-drag-ignore]').evaluate(frame => {
    const touch = (identifier: number, x: number) => new Touch({ identifier, target: frame, clientX: x, clientY: 0 });
    const gesture = (type: string, distance: number) => frame.dispatchEvent(new TouchEvent(type, {
      bubbles: true, touches: distance ? [touch(1, 0), touch(2, distance)] : [],
    }));
    gesture('touchstart', 10);
    gesture('touchmove', 13);
    gesture('touchend', 0);
  });
  expect((await photo.boundingBox())!.width).toBeGreaterThan(resized);
  await photo.getByRole('button', { name: 'Remover imagem' }).click();
  await expect(photo.getByRole('button')).toHaveCount(1);
  await expect(photo.getByRole('button', { name: 'Adicionar imagem' })).toBeVisible();
  await title.click();
  await expect(photo).toHaveCount(0);
});

test('fill uses only the photo area and supports dragging a replacement photo inside its frame', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?photos=background&cols=1');
  await page.getByRole('combobox', { name: 'Moldura das fotos dos produtos' }).selectOption('fill');
  const product = page.locator('#product-container-1');
  const title = product.getByRole('heading');
  await title.click();
  await title.evaluate(el => {
    const data = new DataTransfer();
    data.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="50"><rect width="2000" height="50" fill="green"/></svg>'], 'wide.svg', { type: 'image/svg+xml' }));
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await title.click({ button: 'right' });
  await page.locator('[data-canvas-object-menu]').getByRole('button', { name: 'Editar produto' }).click();
  const photo = product.locator('[data-template-image]');
  await expect(photo.locator('img')).toHaveCSS('object-fit', 'cover');
  const bounds = (await photo.boundingBox())!;
  expect((await title.boundingBox())!.y).toBeGreaterThanOrEqual(bounds.y + bounds.height - 1);
  await page.mouse.move(bounds.x + bounds.width * .25, bounds.y + bounds.height * .65);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .25 + 40, bounds.y + bounds.height * .65, { steps: 4 });
  await page.mouse.up();
  await expect(photo.locator('img')).not.toHaveCSS('object-position', '50% 50%');
});
