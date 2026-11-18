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
    await imageMenu.getByRole('button', { name: 'Substituir imagem' }).click();
    await (await chooser).setFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: replacement });
    await expect(photo.getByRole('img')).toHaveAttribute('src', new URL(replacementPath, page.url()).href);
    await expect(title).toHaveAttribute('contenteditable', 'true');
    await imageMenu.getByRole('button', { name: 'Remover imagem' }).click();
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
    range.selectNodeContents(node.parentElement!.querySelector('[data-divider-title]')!);
    const line = node.getBoundingClientRect();
    const text = range.getBoundingClientRect();
    return Math.abs(line.top + line.height / 2 - text.top - text.height / 2);
  };
  await expect.poll(() => product.locator('[data-ornamental-divider]').evaluate(getCenterDifference)).toBeLessThan(1);
  await expect(page.locator('#product-container-2 [data-ornamental-divider]')).toBeVisible();
  await expect(page.locator('#product-container-3 [data-ornamental-divider]')).toBeVisible();
  const categoryLine = page.locator('[data-template-category] [data-divider-title] + span').first();
  await expect.poll(() => categoryLine.evaluate(getCenterDifference)).toBeLessThan(1);
});
