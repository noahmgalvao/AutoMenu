import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const url = '/tests/fixtures/template-editor.html';

async function openDiscovery(page: Page) {
  await page.getByRole('button', { name: 'Minimal Editorial', exact: true }).click();
  await page.getByRole('button', { name: 'Descobrir', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Descobrir modelos' })).toBeVisible();
}

test.beforeEach(async ({page}) => {
  const favorites = new Set<string>();
  await page.route('**/rest/v1/template_favorites*', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') favorites.add(request.postDataJSON().template_id);
    if (request.method() === 'DELETE') {
      const id = new URL(request.url()).searchParams.get('template_id')?.slice(3);
      if (id) favorites.delete(id);
    }
    await route.fulfill({json: request.method() === 'GET' ? [...favorites].map((template_id) => ({template_id})) : []});
  });
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ body: '', contentType: 'text/css' }));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
});

test('desktop discovery leaves the editor untouched until Apply and records one undo', async ({ page }) => {
  await openDiscovery(page);
  const dialog = page.getByRole('dialog');
  const canvas = dialog.locator('[data-menu-preview-page]');
  await expect(canvas).toContainText('Casa São Bento');
  await expect(canvas.locator('[contenteditable=true],button')).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('heading', {name:'Swiss Grid'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('editor-state')).toHaveAttribute('data-edits','0');

  await openDiscovery(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('editor-state')).toHaveAttribute('data-applied','swiss-grid');
  await expect(page.getByTestId('editor-state')).toHaveAttribute('data-edits','1');
  await page.getByRole('button',{name:'Desfazer'}).click();
  await expect(page.getByTestId('editor-state')).toHaveAttribute('data-edits','0');
});

test('quick search finds imported templates and favorites survive refresh', async ({ page }) => {
  await page.getByRole('button',{name:'Minimal Editorial',exact:true}).click();
  await page.getByRole('button',{name:'Meus modelos',exact:true}).click();
  await page.getByRole('textbox',{name:'Pesquisar modelos'}).fill('cafe da vo');
  const favorite = page.getByRole('button',{name:'Adicionar aos favoritos: Café da Vó',exact:true});
  await expect(favorite).toBeVisible();
  const persisted = page.waitForResponse((response) => response.url().includes('template_favorites') && response.request().method() === 'POST');
  await favorite.click();
  await persisted;
  await page.reload();
  await page.getByRole('button',{name:'Minimal Editorial',exact:true}).click();
  await page.getByRole('button',{name:'Favoritos',exact:true}).click();
  await expect(page.getByRole('button',{name:'Remover dos favoritos: Café da Vó',exact:true})).toBeVisible();
});

for (const viewport of [{width:360,height:720},{width:430,height:932}]) {
  test.describe(`mobile ${viewport.width}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });
    test('fullscreen preview swipes, opens the gallery and cancels with browser back', async ({ page, context }) => {
      await openDiscovery(page);
      const dialog = page.getByRole('dialog');
      const surface = dialog.getByRole('img',{name:/Prévia de Minimal Editorial/});
      const box = await surface.boundingBox();
      expect(box).toBeTruthy();
      const cdp = await context.newCDPSession(page);
      const x = Math.round(box!.x + box!.width / 2);
      const y = Math.round(box!.y + box!.height / 2);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-90}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await expect(dialog.getByRole('heading',{name:'Swiss Grid'})).toBeVisible();
      await dialog.getByRole('button',{name:'Ver todos'}).tap();
      await expect(dialog.getByRole('button', { name: 'Voltar à prévia' })).toBeVisible();
      await expect(dialog.locator('[data-template-option]')).toHaveCount(51);
      await dialog.getByRole('textbox',{name:'Pesquisar modelos'}).fill('acai');
      await expect(dialog.locator('[data-template-option]')).toHaveCount(1);
      await dialog.locator('[data-template-option] > button').tap();
      await expect(dialog.getByRole('heading',{name:'Açaí Tropical'})).toBeVisible();
      await page.evaluate(() => history.back());
      await expect(dialog).toHaveCount(0);
      await expect(page.getByTestId('editor-state')).toHaveAttribute('data-edits','0');
    });
  });
}

test('queued favorites sync after reconnect without editing the menu', async ({ page, context }) => {
  await page.getByRole('button',{name:'Minimal Editorial',exact:true}).click();
  await expect(page.getByText('Carregando favoritos…')).toHaveCount(0);
  await context.setOffline(true);
  const favorite = page.getByRole('button',{name:'Adicionar aos favoritos: Minimal Editorial',exact:true});
  await favorite.click();
  await expect(page.getByRole('button',{name:'Remover dos favoritos: Minimal Editorial',exact:true})).toBeVisible();
  const persisted = page.waitForResponse((response) => response.url().includes('template_favorites') && response.request().method() === 'POST');
  await context.setOffline(false);
  await persisted;
  await expect(page.getByTestId('editor-state')).toHaveAttribute('data-edits','0');
});

test('background color previews during the gesture and saves only on release', async ({ page }) => {
  const canvas = page.locator('[data-menu-print-page]').first();
  const previous = await canvas.evaluate(element => getComputedStyle(element).backgroundColor);
  const history = page.getByTestId('editor-state');
  await page.getByRole('button', { name: 'Cor de fundo', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Cor de fundo' });
  const spectrum = (await dialog.locator('.react-colorful__saturation').boundingBox())!;
  await page.mouse.move(spectrum.x + 20, spectrum.y + 18);
  await page.mouse.down();
  await page.mouse.move(spectrum.x + spectrum.width - 20, spectrum.y + 32, { steps: 10 });
  await expect.poll(() => canvas.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(previous);
  await expect(history).toHaveAttribute('data-edits', '0');
  await page.mouse.up();
  await expect(history).toHaveAttribute('data-edits', '1');
  await dialog.getByRole('combobox', { name: 'Formato da cor' }).selectOption('HSL');
  await expect(dialog.getByRole('spinbutton', { name: 'H', exact: true })).toBeVisible();
});

test('the canvas eyedropper samples the page without the native eyedropper API', async ({ page }) => {
  await page.evaluate(() => Object.defineProperty(window, 'EyeDropper', { configurable: true, value: undefined }));
  const canvas = page.locator('[data-menu-print-page]').first();
  const paper = await canvas.evaluate(element => getComputedStyle(element).backgroundColor);
  const bounds = (await canvas.boundingBox())!;
  const point = { x: bounds.x + bounds.width / 5, y: bounds.y + bounds.height * .75 };
  const trigger = page.getByRole('button', { name: 'Cor de destaque', exact: true });
  await trigger.click();
  await page.getByRole('button', { name: 'Conta-gotas' }).click();
  await expect(page.getByText('Toque em um ponto da página')).toBeVisible();
  await page.mouse.click(point.x, point.y);
  await expect.poll(() => trigger.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(paper);
});

test('a shape becomes the same editable background on newly added pages', async ({ page }) => {
  await page.getByRole('button', { name: 'Adicionar forma' }).click();
  await page.getByRole('button', { name: 'Estrela', exact: true }).click();
  await page.getByRole('button', { name: 'Inserir forma' }).click();
  await expect(page.getByAltText('Forma adicionada')).toHaveCount(1);
  await page.getByRole('button', { name: 'Definir como plano de fundo' }).first().click();
  const pages = page.locator('[data-menu-print-page]');
  await pages.first().dispatchEvent('click');
  const addPage = page.getByTitle('Adicionar página depois');
  await expect(addPage).toBeVisible();
  await addPage.click();
  await expect(pages).toHaveCount(2);
  await expect(pages.last().getByAltText('Forma adicionada')).toHaveCount(1);
  const ids = await pages.locator('[data-canvas-background-layer]').evaluateAll(
    elements => elements.map(element => element.getAttribute('data-added-image-id')),
  );
  expect(new Set(ids).size).toBe(1);
});

test('title and subtitle edit the same border and categories share their marker style', async ({ page }) => {
  const canvas = page.locator('[data-menu-print-page]').first();
  const toolbar = page.locator('[data-inline-format-toolbar]');
  await canvas.locator('#menu-title-text').focus();
  const borderButton = toolbar.getByRole('button', { name: 'Borda do título e subtítulo', exact: true });
  await borderButton.click();
  await toolbar.getByRole('button', { name: 'Acima', exact: true }).click();
  await expect(canvas.locator('[data-template-header]')).toHaveAttribute('data-custom-border', 'true');
  await canvas.locator('#menu-subtitle-text').focus();
  const topSide = toolbar.getByRole('button', { name: 'Acima', exact: true });
  if (!(await topSide.isVisible())) await borderButton.click();
  await expect(topSide).toHaveAttribute('aria-pressed', 'true');
  await canvas.getByRole('heading', { name: 'Entradas', exact: true }).click();
  await page.getByRole('button', { name: 'Marcadores das categorias', exact: true }).click();
  await page.getByRole('combobox', { name: 'Marcadores das categorias', exact: true }).selectOption('number-square');
  const markers = await canvas.locator('[data-template-category] > span[aria-hidden="true"]').allTextContents();
  expect(markers).toEqual(['1', '2', '3']);
});

test.describe('mobile product formatting', () => {
  test.use({ viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true });

  test('closing the font dropdown keeps the product and zoom active until editing ends', async ({ page }) => {
    const canvas = page.locator('[data-menu-print-page]').first();
    const initialWidth = (await canvas.boundingBox())!.width;
    const product = page.locator('#product-container-1');
    await product.getByRole('heading', { name: 'Burrata da casa' }).tap();
    await product.getByRole('button', { name: 'Editar produto' }).tap();
    const toolbar = page.locator('[data-inline-format-toolbar]');
    const name = product.getByRole('heading', { name: 'Burrata da casa' });
    await expect(name).toHaveAttribute('contenteditable', 'true');
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThan(initialWidth + 100);
    await toolbar.locator('.automenu-font-select [class$="-indicatorContainer"]').tap();
    await expect(toolbar.getByRole('listbox')).toBeVisible();
    await toolbar.getByRole('button', { name: 'Negrito' }).tap();
    await expect(toolbar.getByRole('listbox')).toHaveCount(0);
    await expect(name).toHaveAttribute('contenteditable', 'true');
    expect((await canvas.boundingBox())!.width).toBeGreaterThan(initialWidth + 100);
    await expect(toolbar.getByRole('button', { name: 'Concluir edição' })).toHaveCount(0);
    await page.locator('[data-automenu-editor-canvas]').tap({ position: { x: 8, y: 32 } });
    await expect(name).toHaveAttribute('contenteditable', 'false');
    await expect.poll(async () => Math.abs((await canvas.boundingBox())!.width - initialWidth)).toBeLessThan(2);
  });
});

test('exports a landscape screen-sized PDF using the same dimensions as the editor', async ({ page }, testInfo) => {
  await page.getByRole('button',{name:'Minimal Editorial',exact:true}).click();
  await page.getByRole('textbox',{name:'Pesquisar modelos'}).fill('Menu Board 16:9');
  await page.locator('[data-template-option="menu-board"] > button').click();
  await expect(page.locator('[data-menu-print-page]').first()).toHaveAttribute('data-menu-page-width-mm','320');
  await expect(page.locator('[data-menu-print-page]').first()).toHaveAttribute('data-menu-page-height-mm','180');
  await page.getByRole('button',{name:'PDF',exact:true}).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button',{name:'Baixar PDF',exact:true}).click();
  const file = await downloadPromise;
  const path = testInfo.outputPath('landscape-preview.pdf');
  await file.saveAs(path);
  const pdf = (await readFile(path)).toString('latin1');
  const [,width,height] = pdf.match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/) || [];
  expect(Number(width)).toBeCloseTo(320 * 72 / 25.4);
  expect(Number(height)).toBeCloseTo(180 * 72 / 25.4);
  await testInfo.attach('Landscape PDF', {path,contentType:'application/pdf'});
});
