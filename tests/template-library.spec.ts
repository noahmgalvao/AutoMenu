import { chooseDesignerOption } from './fixtures/designer-picker';
import { shortcutsFor } from './fixtures/canvas-shortcuts';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const url = '/tests/fixtures/template-editor.html';

async function openDiscovery(page: Page) {
  await page.getByRole('button', { name: 'Editorial Essencial', exact: true }).click();
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
  await expect(dialog.getByText('Arraste para cima para ver o próximo')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Próximo modelo' })).toHaveCount(0);
  await expect(dialog.getByRole('heading', { name: 'Editorial Essencial' })).toHaveCount(0);
  await expect(canvas.locator('[contenteditable=true],button')).toHaveCount(0);
  await page.keyboard.press('ArrowUp');
  await expect(dialog.getByRole('img', { name: /Prévia de Sem modelo/ })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('img', { name: /Prévia de Editorial Essencial/ })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('img', { name: /Prévia de Grade Suíça/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('editor-state')).toHaveAttribute('data-edits','0');

  await openDiscovery(page);
  await page.mouse.move(300, 320);
  await page.mouse.wheel(0, 120);
  await expect(dialog.getByRole('img', { name: /Prévia de Grade Suíça/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('editor-state')).toHaveAttribute('data-applied','swiss-grid');
  await expect(page.getByTestId('editor-state')).toHaveAttribute('data-edits','1');
  await page.getByRole('button',{name:'Desfazer'}).click();
  await expect(page.getByTestId('editor-state')).toHaveAttribute('data-edits','0');
});

test('discovery opens on Todos every time and keeps personal templates in their own tab', async ({ page }) => {
  await page.getByRole('button', { name: 'Editorial Essencial', exact: true }).click();
  await page.getByRole('button', { name: 'Meus modelos', exact: true }).click();
  await page.getByRole('textbox', { name: 'Pesquisar modelos' }).fill('cafe da vo');
  await expect(page.getByRole('button', { name: 'Café da Vó', exact: true })).toBeVisible();
  const discovery = page.getByRole('button', { name: 'Descobrir', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Descobrir modelos' });
  await discovery.click();
  await expect(dialog.getByRole('img', { name: /Prévia de Editorial Essencial/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Ver todos' }).click();
  await expect(dialog.getByRole('button', { name: 'Todos', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('textbox', { name: 'Pesquisar modelos' })).toHaveValue('');
  const personal = dialog.getByRole('button', { name: 'Café da Vó', exact: true });
  await expect(personal).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Meus modelos', exact: true }).click();
  await expect(personal).toBeVisible();
  await dialog.getByRole('button', { name: 'Favoritos', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await discovery.click();
  await dialog.getByRole('button', { name: 'Ver todos' }).click();
  await expect(dialog.getByRole('button', { name: 'Todos', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(personal).toHaveCount(0);
});

test('quick search finds imported templates and favorites survive refresh', async ({ page }) => {
  await page.getByRole('button',{name:'Editorial Essencial',exact:true}).click();
  await page.getByRole('button',{name:'Meus modelos',exact:true}).click();
  await page.getByRole('textbox',{name:'Pesquisar modelos'}).fill('cafe da vo');
  const favorite = page.getByRole('button',{name:'Adicionar aos favoritos: Café da Vó',exact:true});
  await expect(favorite).toBeVisible();
  const persisted = page.waitForResponse((response) => response.url().includes('template_favorites') && response.request().method() === 'POST');
  await favorite.click();
  await persisted;
  await page.reload();
  await page.getByRole('button',{name:'Editorial Essencial',exact:true}).click();
  await page.getByRole('button',{name:'Favoritos',exact:true}).click();
  await expect(page.getByRole('button',{name:'Remover dos favoritos: Café da Vó',exact:true})).toBeVisible();
});

for (const viewport of [{width:360,height:720},{width:430,height:932}]) {
  test.describe(`mobile ${viewport.width}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });
    test('fullscreen preview swipes, opens the gallery and cancels with browser back', async ({ page, context }) => {
      await openDiscovery(page);
      const dialog = page.getByRole('dialog');
      const surface = dialog.getByRole('img',{name:/Prévia de Editorial Essencial/});
      const box = await surface.boundingBox();
      expect(box).toBeTruthy();
      const cdp = await context.newCDPSession(page);
      const x = Math.round(box!.x + box!.width / 2);
      const y = Math.round(box!.y + box!.height / 2);
      const swipe = async (delta: number) => {
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+delta}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      };
      await swipe(90);
      await expect(dialog.getByRole('img', { name: /Prévia de Sem modelo/ })).toBeVisible();
      await swipe(-90);
      await expect(surface).toBeVisible();
      await swipe(-90);
      await expect(dialog.getByRole('img', { name: /Prévia de Grade Suíça/ })).toBeVisible();
      await dialog.getByRole('button',{name:'Ver todos'}).tap();
      await expect(dialog.getByRole('button', { name: 'Voltar à prévia' })).toBeVisible();
      await expect(dialog.locator('[data-template-option]')).toHaveCount(51);
      await dialog.getByRole('button', { name: 'Voltar à prévia' }).tap();
      await expect(dialog.getByRole('img', { name: /Prévia de Grade Suíça/ })).toBeVisible();
      await dialog.getByRole('button', { name: 'Ver todos' }).tap();
      const search = dialog.getByRole('textbox', { name: 'Pesquisar modelos' });
      await expect(search).toBeVisible();
      await expect(search).not.toBeFocused();
      await search.tap();
      await expect(search).toBeFocused();
      await search.fill('acai');
      await expect(dialog.locator('[data-template-option]')).toHaveCount(1);
      await dialog.locator('[data-template-option] > button').tap();
      await expect(dialog.getByRole('img', { name: /Prévia de Açaí Tropical/ })).toBeVisible();
      await page.evaluate(() => history.back());
      await expect(dialog).toHaveCount(0);
      await expect(page.getByTestId('editor-state')).toHaveAttribute('data-edits','0');
    });
  });
}

test('queued favorites sync after reconnect without editing the menu', async ({ page, context }) => {
  await page.getByRole('button',{name:'Editorial Essencial',exact:true}).click();
  await expect(page.getByText('Carregando favoritos…')).toHaveCount(0);
  await context.setOffline(true);
  const favorite = page.getByRole('button',{name:'Adicionar aos favoritos: Editorial Essencial',exact:true});
  await favorite.click();
  await expect(page.getByRole('button',{name:'Remover dos favoritos: Editorial Essencial',exact:true})).toBeVisible();
  const persisted = page.waitForResponse((response) => response.url().includes('template_favorites') && response.request().method() === 'POST');
  await context.setOffline(false);
  await persisted;
  await expect(page.getByTestId('editor-state')).toHaveAttribute('data-edits','0');
});

test('favorites survive a reload during a service failure and save when it recovers', async ({ page }) => {
  let available = false;
  const saved = new Set<string>();
  await page.route('**/rest/v1/template_favorites*', async route => {
    if (!available) return route.fulfill({ status: 503, json: { message: 'Temporarily unavailable' } });
    if (route.request().method() === 'POST') saved.add(route.request().postDataJSON().template_id);
    return route.fulfill({ json: [...saved].map(template_id => ({ template_id })) });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Editorial Essencial', exact: true }).click();
  const favorite = page.locator('[data-template-option="moderno-limpo"]').getByRole('button', { name: /favoritos/i });
  await favorite.click();
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/sincroniza|pendente/i)).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Editorial Essencial', exact: true }).click();
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');
  available = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => saved.has('moderno-limpo')).toBe(true);
});

test('canvas colors come first and recently picked colors are ordered without duplicates', async ({ page }) => {
  await page.getByRole('button', { name: 'Cor de fundo', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Cor de fundo' });
  await expect(picker.getByRole('heading', { name: 'Neste cardápio', exact: true })).toBeVisible();
  const hex = picker.getByRole('textbox', { name: 'Valor HEX' });
  const setColor = async (color: string) => {
    await hex.fill(color);
    await hex.press('Enter');
    await expect(picker.getByRole('group', { name: 'Neste cardápio' }).getByRole('button', { name: color })).toBeVisible();
  };
  for (const color of ['#117abc', '#784edd', '#c54637', '#117abc', '#234856']) await setColor(color);
  const recent = picker.getByRole('group', { name: 'Cores recentes' });
  const order = await recent.getByRole('button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
  expect(order.slice(0, 3)).toEqual(['#117abc', '#c54637', '#784edd']);
  await expect(recent.getByRole('button', { name: '#234856' })).toHaveCount(0);
  await expect(picker.getByText('Cores usadas')).toHaveCount(0);
});

test('adding a shape, free text and an image uses the page in view', async ({ page }) => {
  await page.goto(`${url}?photos=list`);
  const canvas = page.locator('[data-automenu-editor-canvas]');
  const pages = canvas.locator('[data-menu-print-page]');
  await pages.first().dispatchEvent('click');
  await page.getByTitle('Adicionar página depois').click();
  await expect(pages).toHaveCount(2);
  await pages.last().scrollIntoViewIfNeeded();
  await canvas.evaluate(node => {
    const target = node.querySelectorAll('[data-menu-print-page]')[1].getBoundingClientRect();
    const viewport = node.getBoundingClientRect();
    node.scrollLeft += target.left + target.width / 2 - (viewport.left + viewport.width / 2);
  });
  await page.getByRole('button', { name: 'Adicionar forma' }).click();
  await expect(pages.last().getByAltText('Forma adicionada')).toBeVisible();
  await pages.nth(1).dispatchEvent('click');
  await page.getByTitle('Adicionar página depois').click();
  await expect(pages).toHaveCount(3);
  await pages.last().scrollIntoViewIfNeeded();
  await canvas.evaluate(node => {
    const target = node.querySelectorAll('[data-menu-print-page]')[2].getBoundingClientRect();
    const viewport = node.getBoundingClientRect();
    node.scrollLeft += target.left + target.width / 2 - (viewport.left + viewport.width / 2);
  });
  await page.getByRole('button', { name: 'Adicionar texto', exact: true }).click();
  await expect(pages.last().getByText('Novo texto', { exact: true })).toBeVisible();
  await expect(pages).toHaveCount(3);
  await expect(pages.nth(1).getByAltText('Forma adicionada')).toBeVisible();

  const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBXsAAAAASUVORK5CYII=', 'base64');
  const imageUrl = new URL('/tests/fixtures/uploaded-canvas-image.png', page.url()).href;
  await page.route('**/storage/v1/object/menu-assets/**', route => route.fulfill({ json: { Key: 'menu-assets/canvas.png' } }));
  await page.route('**/rest/v1/assets?*', route => route.fulfill({ json: { ...route.request().postDataJSON(), source_url: imageUrl } }));
  await page.route(imageUrl, route => route.fulfill({ body: photo, contentType: 'image/png' }));
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Adicionar imagem', exact: true }).click();
  await (await chooser).setFiles({ name: 'canvas.png', mimeType: 'image/png', buffer: photo });
  await expect(pages.last().getByAltText('Imagem adicionada')).toBeVisible();
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

test('adding an image shows a preview through upload and canvas preparation', async ({ page }) => {
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBXsAAAAASUVORK5CYII=', 'base64');
  let finishUpload!: () => void;
  let finishImage!: () => void;
  let rejectUpload = false;
  const upload = new Promise<void>(resolve => { finishUpload = resolve; });
  const prepare = new Promise<void>(resolve => { finishImage = resolve; });
  await page.route('**/tests/asset-upload', async route => {
    await upload;
    if (rejectUpload) await route.fulfill({ status: 500 });
    else await route.fulfill({ json: { asset: { id: 'uploaded-image' }, url: '/tests/uploaded-image.png' } });
  });
  await page.route('**/tests/uploaded-image.png', async route => {
    await prepare;
    await route.fulfill({ contentType: 'image/png', body: image });
  });
  await page.goto(`${url}?image-upload`);
  const addButton = page.getByRole('button', { name: 'Adicionar imagem', exact: true });
  await expect(addButton).toBeVisible();
  const fileInput = addButton.locator('..').locator('input[type="file"]');
  await fileInput.setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: image });
  const preview = page.locator('[data-menu-print-page] [data-added-image-preview]');
  const spinner = preview.getByRole('status', { name: 'Carregando imagem' });
  await expect(preview.locator('img')).toHaveAttribute('src', /^blob:/);
  await expect(spinner).toBeVisible();
  const previewBounds = (await preview.boundingBox())!;
  const spinnerBounds = (await spinner.locator('span').boundingBox())!;
  expect(spinnerBounds.x + spinnerBounds.width / 2).toBeCloseTo(previewBounds.x + previewBounds.width / 2);
  expect(spinnerBounds.y + spinnerBounds.height / 2).toBeCloseTo(previewBounds.y + previewBounds.height / 2);
  await expect(page.getByRole('button', { name: 'Adicionando imagem…' })).toBeDisabled();
  const downloaded = page.waitForRequest('**/tests/uploaded-image.png');
  finishUpload();
  await downloaded;
  await expect(spinner).toBeVisible();
  await expect(page.getByAltText('Imagem adicionada')).toHaveCount(0);
  finishImage();
  const added = page.getByAltText('Imagem adicionada');
  await expect(added).toBeVisible();
  await expect(preview).toHaveCount(0);
  const addedBounds = (await added.boundingBox())!;
  expect(addedBounds.x).toBeCloseTo(previewBounds.x);
  expect(addedBounds.y).toBeCloseTo(previewBounds.y);

  rejectUpload = true;
  await fileInput.setInputFiles({ name: 'segunda.png', mimeType: 'image/png', buffer: image });
  const feedback = page.locator('[data-image-insertion-feedback]');
  await expect(feedback.getByRole('alert')).toContainText('Não foi possível adicionar a imagem');
  await expect(preview).toHaveCount(0);
  await expect(addButton).toBeEnabled();
  await feedback.getByRole('button', { name: 'Dispensar erro de imagem' }).click();
  await expect(feedback).toHaveCount(0);
});

test('using a free image as the full background locks the paper color until removal', async ({ page }) => {
  await page.goto(`${url}?batch-layers`);
  const sheet = page.locator('[data-menu-print-page]').first();
  const photos = page.locator('[data-menu-background-image]');
  const image = page.locator('[data-added-image-id="batch-photo"]');
  const source = await image.locator('img').getAttribute('src');
  const position = await image.evaluate(element => ({ left: element.style.left, top: element.style.top, width: element.style.width }));
  await image.click({ button: 'right' });
  const menu = page.locator('[data-canvas-object-menu]');
  await menu.getByRole('button', { name: 'Definir imagem de fundo', exact: true }).click();
  await expect(image).toHaveCount(0);
  await expect(photos).toHaveCount(2);
  await expect(photos.first()).toHaveAttribute('src', source!);
  await expect(photos.first()).toHaveCSS('object-fit', 'cover');
  const paperColor = page.getByRole('button', { name: 'Cor de fundo', exact: true });
  await expect(paperColor).toBeDisabled();
  await sheet.click({ button: 'right', position: { x: 8, y: 350 } });
  const remove = menu.getByRole('button', { name: 'Remover imagem de fundo', exact: true });
  await expect(menu.getByRole('button').last()).toHaveText('Remover página');
  await remove.click();
  await expect(photos).toHaveCount(0);
  await expect(image).toHaveCount(1);
  expect(await image.evaluate(element => ({ left: element.style.left, top: element.style.top, width: element.style.width }))).toEqual(position);
  await expect(paperColor).toBeEnabled();
  await sheet.click({ button: 'right', position: { x: 8, y: 350 } });
  await expect(menu.getByRole('button', { name: 'Definir imagem de fundo', exact: true })).toBeEnabled();
});

test('a background from another editing session is removed without creating an image object', async ({ page }) => {
  await page.goto(`${url}?existing-background`);
  await expect(page.locator('[data-menu-background-image]')).toBeVisible();
  await page.locator('[data-menu-print-page]').first().click({ button: 'right', position: { x: 10, y: 125 } });
  await page.getByRole('button', { name: 'Remover imagem de fundo', exact: true }).click();
  await expect(page.locator('[data-menu-background-image], [data-added-image-id]')).toHaveCount(0);
});

test('the paper menu activates multi-select and duplicates and removes the requested page', async ({ page }) => {
  await page.goto(`${url}?batch-layers&editable`);
  const pages = page.locator('[data-menu-print-page]');
  const menu = page.locator('[data-canvas-object-menu]');
  const openPaper = (index: number) => pages.nth(index).click({ button: 'right', position: { x: 10, y: 125 } });
  await openPaper(0);
  await expect(menu.getByRole('button')).toHaveText([
    'Seleção múltipla', 'Duplicar', 'Colar', 'Adicionar título', 'Definir imagem de fundo', 'Remover página',
  ]);
  const multiselect = menu.getByRole('button', { name: 'Seleção múltipla' });
  await multiselect.click();
  for (const index of [0, 1]) await pages.nth(index).click({ position: { x: 12, y: 160 } });
  for (const index of [0, 1]) await expect(pages.nth(index)).toHaveClass(/ring-blue-500/);
  await openPaper(0);
  await expect(multiselect).toHaveAttribute('aria-pressed', 'true');
  await multiselect.click();
  await openPaper(0);
  await menu.getByRole('button', { name: 'Duplicar' }).click();
  await expect(pages).toHaveCount(3);
  await expect(pages.nth(1).getByText('Casa São Bento', { exact: true })).toBeVisible();
  await expect(pages.nth(1).getByText('Burrata da casa', { exact: true })).toBeVisible();
  await expect(pages.nth(1).locator('[data-added-image-id]')).toHaveCount(4);
  await expect(pages.nth(2)).toHaveAttribute('data-blank-page-id', 'layers-page');
  await openPaper(1);
  await menu.getByRole('button', { name: 'Remover página' }).click();
  await page.getByRole('button', { name: 'Sim, excluir', exact: true }).click();
  await expect(pages).toHaveCount(2);
  await expect(pages.nth(0).getByText('Burrata da casa', { exact: true })).toBeVisible();
  await expect(pages.nth(1)).toHaveAttribute('data-blank-page-id', 'layers-page');
});

test.describe('background image upload from touch canvas', () => {
  test.use({ viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true });
  test('holding on empty paper opens the background file picker', async ({ page, context }) => {
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBXsAAAAASUVORK5CYII=', 'base64');
    await page.route('**/tests/asset-upload', route => route.fulfill({
      json: { asset: { id: 'uploaded-background' }, url: '/tests/uploaded-background.png' },
    }));
    await page.route('**/tests/uploaded-background.png', route => route.fulfill({ contentType: 'image/png', body: image }));
    await page.goto(`${url}?image-upload`);
    const paper = (await page.locator('[data-menu-print-page]').first().boundingBox())!;
    const touch = await context.newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: paper.x + 4, y: paper.y + 110 }] });
    const action = page.locator('[data-canvas-object-menu]').getByRole('button', { name: 'Definir imagem de fundo', exact: true });
    await expect(action).toBeVisible();
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const browse = page.waitForEvent('filechooser');
    await action.tap();
    await (await browse).setFiles({ name: 'fundo.png', mimeType: 'image/png', buffer: image });
    await expect(page.locator('[data-menu-background-image]')).toHaveAttribute('src', '/tests/uploaded-background.png');
    await expect(page.getByRole('button', { name: 'Cor de fundo', exact: true })).toBeDisabled();
  });
});

test('a shape becomes the same editable background on newly added pages', async ({ page }) => {
  await page.getByRole('button', { name: 'Adicionar forma' }).click();
  await page.locator('[data-object-page-index]').getByTitle('Editar forma').click();
  await expect(page.getByAltText('Forma adicionada')).toHaveCount(1);
  await page.locator('[data-inline-format-toolbar]').getByRole('slider', { name: 'Rotação' }).press('ArrowRight');
  const prompt = page.getByRole('group', { name: 'Integrar ao plano de fundo?' });
  await prompt.getByRole('button', { name: 'Sim', exact: true }).click();
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

test('the shape prompt remembers an outside dismissal and leaves background and flip actions in the menu', async ({ page }) => {
  await page.getByRole('button', { name: 'Adicionar forma' }).click();
  const shape = page.getByAltText('Forma adicionada');
  const controls = page.locator('[data-object-page-index]');
  const prompt = page.getByRole('group', { name: 'Integrar ao plano de fundo?' });
  const { x, y, width, height } = (await shape.boundingBox())!;
  const releaseShape = () => page.mouse.click(x + width / 2, y + height / 2);
  await releaseShape();
  await expect(prompt).toBeVisible();
  expect((await prompt.boundingBox())!.y).toBeGreaterThan(y + height);
  await page.mouse.click(x - 45, y + height / 2);
  await expect(prompt).toHaveCount(0);
  await expect(controls).toBeVisible();
  await expect(controls.locator(':scope > button').nth(-2)).toHaveAttribute('title', 'Remover forma');
  await expect(controls.locator(':scope > button').last()).toHaveAttribute('title', 'Mais opções');
  await releaseShape();
  await expect(prompt).toHaveCount(0);
  await controls.getByTitle('Seleção múltipla').click();
  await expect(controls.getByTitle('Seleção múltipla')).toHaveAttribute('aria-pressed', 'true');
  await controls.getByTitle('Editar forma').click();
  const rotation = page.locator('[data-inline-format-toolbar]').getByRole('slider', { name: 'Rotação' });
  await page.locator('[data-inline-format-toolbar]').getByRole('button', { name: 'Aumentar Rotação' }).click();
  await expect(rotation).toHaveValue('1');
  await controls.getByTitle('Mais opções').click();
  const menu = page.locator('[data-canvas-object-menu]');
  await expect(menu.getByRole('button', { name: 'Integrar ao plano de fundo' })).toBeVisible();
  await menu.getByRole('button', { name: 'Inverter horizontalmente' }).click();
  await expect(shape).toHaveCSS('transform', 'matrix(-1, 0, 0, 1, 0, 0)');
  await controls.getByTitle('Mais opções').click();
  await menu.getByRole('button', { name: 'Inverter verticalmente' }).click();
  await expect(shape).toHaveCSS('transform', 'matrix(-1, 0, 0, -1, 0, 0)');
  await controls.getByTitle('Mais opções').click();
  await menu.getByRole('button', { name: 'Integrar ao plano de fundo' }).click();
  await controls.getByTitle('Mais opções').click();
  await expect(menu.getByRole('button', { name: 'Usar só nesta página' })).toBeVisible();
  await menu.getByRole('button', { name: 'Remover forma' }).click();
  await expect(shape).toHaveCount(0);
});

test('an added image can use the background prompt and keeps its More options actions', async ({ page }) => {
  await page.goto(`${url}?added-image`);
  const image = page.getByAltText('Imagem adicionada');
  const { x, y, width, height } = (await image.boundingBox())!;
  await page.mouse.click(x + width / 2, y + height / 2);
  const prompt = page.getByRole('group', { name: 'Integrar ao plano de fundo?' });
  await prompt.getByRole('button', { name: 'Sim', exact: true }).click();
  await expect(image.locator('..')).toHaveAttribute('data-canvas-background-layer', 'true');
  const controls = page.locator('[data-object-page-index]');
  await expect(controls.getByTitle('Seleção múltipla')).toBeVisible();
  await controls.getByTitle('Mais opções').click();
  const menu = page.locator('[data-canvas-object-menu]');
  await expect(menu.getByRole('button', { name: 'Remover imagem' })).toBeVisible();
  await menu.getByRole('button', { name: 'Usar só nesta página' }).click();
  const removeImage = controls.locator(':scope > button').nth(-2);
  await expect(removeImage).toHaveAttribute('title', 'Remover imagem');
  await removeImage.click();
  await expect(image).toHaveCount(0);
});

test('a mixed selection formats, resizes, layers and duplicates its shapes and image together', async ({ page }) => {
  await page.goto(`${url}?batch-layers`);
  const firstPage = page.locator('[data-menu-print-page][data-page-index="0"]');
  const secondPage = page.locator('[data-menu-print-page][data-page-index="1"]');
  const layers = ['shape-left', 'batch-photo', 'shape-right'];
  const layer = (id: string) => firstPage.locator(`[data-added-image-id="${id}"]`);
  const controls = page.locator('[data-object-page-index="0"]');
  const menu = page.locator('[data-canvas-object-menu]');
  const menuAction = async (name: string) => {
    await controls.getByTitle('Mais opções').click();
    await menu.getByRole('button', { name, exact: true }).click();
  };
  await layer(layers[0]).click();
  await controls.getByTitle('Seleção múltipla').click();
  await layer(layers[2]).click();
  await layer(layers[1]).click();
  await expect(firstPage.locator('[data-image-selection-overlay]')).toHaveCount(3);

  const photoUrl = await layer(layers[1]).locator('img').getAttribute('src');
  await controls.getByTitle('Editar forma').click();
  const toolbar = page.locator('[data-inline-format-toolbar]');
  await toolbar.getByRole('button', { name: 'Aumentar Rotação' }).click();
  for (const id of ['shape-left', 'shape-right']) {
    await expect.poll(async () => decodeURIComponent((await layer(id).locator('img').getAttribute('src'))!)).toContain('rotate(1)');
  }
  await expect(layer(layers[1]).locator('img')).toHaveAttribute('src', photoUrl!);
  await controls.getByTitle('Editar forma').click();
  await expect(controls.getByTitle('Seleção múltipla')).toHaveAttribute('aria-pressed', 'true');

  const width = (id: string) => layer(id).evaluate(node => parseFloat((node as HTMLElement).style.width));
  const beforeResize = await Promise.all(layers.map(width));
  const overlay = firstPage.locator('[data-image-selection-overlay="shape-right"]');
  const box = (await overlay.boundingBox())!;
  await page.mouse.move(box.x + box.width, box.y + box.height);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 24, box.y + box.height + 24, { steps: 5 });
  for (const [index, id] of layers.entries()) await expect.poll(() => width(id)).toBeGreaterThan(beforeResize[index]);
  const resized = await Promise.all(layers.map(width));
  await page.mouse.up();
  for (const [index, id] of layers.entries()) await expect.poll(() => width(id)).toBe(resized[index]);

  await menuAction('Inverter horizontalmente');
  await menuAction('Inverter verticalmente');
  for (const id of layers) await expect(layer(id).locator('img')).toHaveCSS('transform', 'matrix(-1, 0, 0, -1, 0, 0)');
  await menuAction('Trazer para frente');
  for (const id of layers) await expect(layer(id)).toHaveAttribute('data-canvas-layer', '3');
  await menuAction('Enviar para trás');
  for (const id of layers) await expect(layer(id)).toHaveAttribute('data-canvas-layer', '1');

  await menuAction('Integrar ao plano de fundo');
  await expect(secondPage.locator('[data-added-image-id]')).toHaveCount(3);
  await menuAction('Usar só nesta página');
  await expect(secondPage.locator('[data-added-image-id]')).toHaveCount(0);
  await menuAction('Duplicar');
  await expect(firstPage.locator('[data-added-image-id]')).toHaveCount(7);
  await expect(firstPage.locator('[data-image-selection-overlay]')).toHaveCount(6);
  await expect(controls.getByTitle('Seleção múltipla')).toHaveAttribute('aria-pressed', 'true');
});

test('shape formatting applies on the next click and stays available after valid, invalid and empty clicks', async ({ page }) => {
  await page.goto(`${url}?batch-layers`);
  const menu = page.locator('[data-canvas-object-menu]');
  const layer = (id: string) => page.locator(`[data-added-image-id="${id}"]`);
  const clickLayer = async (id: string, button: 'left' | 'right' = 'left') => {
    await layer(id).scrollIntoViewIfNeeded();
    const box = (await layer(id).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button });
  };
  const copy = async () => {
    await clickLayer('shape-left', 'right');
    await menu.getByRole('button', { name: 'Copiar formatação' }).click();
  };
  const svg = async (id: string) => decodeURIComponent((await layer(id).locator('img').getAttribute('src'))!);
  await copy();
  await clickLayer('shape-right');
  await expect.poll(() => svg('shape-right')).toContain('rotate(25)');
  expect(await svg('shape-right')).toContain('Q 50 7 ');
  await clickLayer('batch-photo', 'right');
  await expect(menu.getByRole('button', { name: 'Colar formatação' })).toBeEnabled();
  await page.keyboard.press('Escape');

  await copy();
  await page.locator('[data-menu-print-page]').first().click({ position: { x: 12, y: 300 } });
  await clickLayer('shape-other');
  expect(await svg('shape-other')).toContain('rotate(0)');
  await copy();
  await page.locator('#product-container-1').getByRole('heading').click();
  await clickLayer('shape-other');
  expect(await svg('shape-other')).toContain('rotate(0)');
  await clickLayer('shape-other', 'right');
  await menu.getByRole('button', { name: 'Colar formatação' }).click();
  await expect.poll(() => svg('shape-other')).toContain('rotate(25)');
  expect(await svg('shape-other')).toContain('rx="12"');
});

test('category formatting pastes its border, marker and divider into a product', async ({ page }) => {
  await page.goto(`${url}?photos=list&formatting-sample`);
  await page.locator('[data-category-id="Entradas"]').getByRole('heading').click({ button: 'right' });
  await page.getByRole('button', { name: 'Copiar formatação' }).click();
  const product = page.locator('#product-container-1');
  await product.getByRole('heading').click();
  await expect(product.locator('[data-menu-marker]')).toHaveText('◆');
  await expect(product.locator('[data-divider-segment="start"]')).toHaveCSS('border-top-style', 'dotted');
  await expect(product.locator(':scope > [data-menu-border]').first()).toHaveCSS('border-left-style', 'dashed');
  await expect(product.locator(':scope > [data-menu-border]').first()).toHaveCSS('border-left-color', 'rgb(220, 38, 38)');
});

test('title and subtitle edit the same border and categories share their marker style', async ({ page }) => {
  const canvas = page.locator('[data-menu-print-page]').first();
  const toolbar = page.locator('[data-inline-format-toolbar]');
  await canvas.locator('#menu-title-text').focus();
  const borderButton = toolbar.getByRole('button', { name: 'Borda do título e subtítulo', exact: true });
  await borderButton.click();
  const presets = toolbar.getByRole('combobox', { name: 'Lados da borda' });
  await chooseDesignerOption(presets, 'top');
  await expect(canvas.locator('[data-template-header]')).toHaveAttribute('data-custom-border', 'true');
  await canvas.locator('#menu-subtitle-text').focus();
  if (!(await presets.isVisible())) await borderButton.click();
  await expect(presets).toHaveText('Somente superior');
  await canvas.getByRole('heading', { name: 'Entradas', exact: true }).click();
  await page.getByRole('button', { name: 'Marcadores das categorias', exact: true }).click();
  await chooseDesignerOption(page.getByRole('combobox', { name: 'Marcadores das categorias', exact: true }), 'number-square');
  const markers = await canvas.locator('[data-template-category] [data-menu-marker]').allTextContents();
  expect(markers).toEqual(['1', '2', '3']);
});

test.describe('mobile product formatting', () => {
  test.use({ viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true });

  test('closing the font dropdown keeps the product and zoom active until editing ends', async ({ page }) => {
    const canvas = page.locator('[data-menu-print-page]').first();
    const initialWidth = (await canvas.boundingBox())!.width;
    const product = page.locator('#product-container-1');
    await product.getByRole('heading', { name: 'Burrata da casa' }).tap();
    await shortcutsFor(product).getByRole('button', { name: 'Mais opções' }).tap();
    await page.getByRole('button', { name: 'Editar produto' }).tap();
    const toolbar = page.locator('[data-inline-format-toolbar]');
    const name = product.getByRole('heading', { name: 'Burrata da casa' });
    await expect(name).toHaveAttribute('contenteditable', 'true');
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThan(initialWidth + 100);
    await toolbar.getByRole('combobox', { name: 'Fonte' }).tap();
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

  test('switching from an edited product restores the zoom and keeps the tapped product selected', async ({ page }) => {
    await page.goto(`${url}?photos=list`);
    const canvas = page.locator('[data-automenu-editor-canvas]');
    const paper = canvas.locator('[data-menu-print-page]').first();
    const originalWidth = (await paper.boundingBox())!.width;
    const first = page.locator('#product-container-1');
    const next = page.locator('#product-container-2');
    await first.getByRole('heading').tap();
    await shortcutsFor(first).getByTitle('Editar produto').tap();
    await expect(first.getByRole('heading')).toBeFocused();
    await expect.poll(async () => (await paper.boundingBox())!.width).toBeGreaterThan(originalWidth + 100);
    await next.getByRole('heading').tap();
    await expect(first.getByRole('heading')).toHaveAttribute('contenteditable', 'false');
    await expect(shortcutsFor(next).getByTitle('Editar produto')).toBeVisible();
    await expect.poll(async () => (await paper.boundingBox())!.width).toBeCloseTo(originalWidth, 0);
    await expect(next.getByRole('heading')).toBeInViewport();
  });

  test('expanding a border refocuses the canvas until product editing ends', async ({ page }) => {
    const canvas = page.locator('[data-automenu-editor-canvas]');
    const sheet = canvas.locator('[data-menu-print-page]').first();
    const product = page.locator('#product-container-1');
    const width = () => sheet.evaluate((element) => element.getBoundingClientRect().width);
    const initialWidth = await width();
    await product.getByRole('heading', { name: 'Burrata da casa' }).tap();
    await shortcutsFor(product).getByRole('button', { name: 'Mais opções' }).tap();
    await page.getByRole('button', { name: 'Editar produto' }).tap();
    await expect.poll(width).toBeGreaterThan(initialWidth + 100);
    const toolbar = page.locator('[data-inline-format-toolbar]');
    const borderButton = toolbar.getByRole('button', { name: 'Borda', exact: true });
    await borderButton.tap();
    await chooseDesignerOption(toolbar.getByRole('combobox', { name: 'Lados da borda' }), 'left');
    const scrollLeft = () => canvas.evaluate((element) => element.scrollLeft);
    const stroke = product.locator('[data-menu-border]');
    await expect(stroke).toBeVisible();
    await expect.poll(async () => Math.abs(await width() - initialWidth * 1.6)).toBeLessThan(2);
    await canvas.evaluate((element) => { element.scrollLeft = element.clientWidth; });
    const clippedPosition = await scrollLeft();
    const distance = toolbar.getByRole('slider', { name: 'Distância (px)' });
    await distance.press('End');
    await expect.poll(scrollLeft).toBeLessThan(clippedPosition - 20);
    const focusedPosition = await scrollLeft();
    await borderButton.tap();
    await expect(distance).toHaveCount(0);
    expect(await scrollLeft()).toBe(focusedPosition);
    await canvas.tap({ position: { x: 8, y: 32 } });
    await expect.poll(width).toBeCloseTo(initialWidth, 0);
    await expect.poll(scrollLeft).toBe(0);
  });

  test('a quick touch drag moves a shape and only a held touch opens its menu', async ({ page }) => {
    await page.getByRole('button', { name: 'Adicionar forma' }).tap();
    const shape = page.getByAltText('Forma adicionada');
    const menu = page.locator('[data-canvas-object-menu]');
    const { x, y, width, height } = (await shape.boundingBox())!;
    const point = { x: x + width / 2, y: y + height / 2 };
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await expect(menu).toHaveCount(0);
    await expect(menu).toBeVisible();
    const moved = { x: point.x + 25, y: point.y + 30 };
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [moved] });
    await expect(menu).toHaveCount(0);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const prompt = page.locator('[data-background-prompt]');
    await expect(prompt).toBeVisible();
    expect((await shape.boundingBox())!.x).toBeGreaterThan(x + 10);
    await prompt.getByRole('button', { name: 'Não', exact: true }).tap();
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [moved] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...moved, x: moved.x - 20 }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(menu).toHaveCount(0);
    expect((await shape.boundingBox())!.x).toBeLessThan(x + 15);
  });
});

test('exports a landscape screen-sized PDF using the same dimensions as the editor', async ({ page }, testInfo) => {
  await page.getByRole('button',{name:'Editorial Essencial',exact:true}).click();
  await page.getByRole('textbox',{name:'Pesquisar modelos'}).fill('Menu Board 16:9');
  await page.locator('[data-template-option="menu-board"] > button').click();
  await expect(page.locator('[data-menu-print-page]').first()).toHaveAttribute('data-menu-page-width-mm','320');
  await expect(page.locator('[data-menu-print-page]').first()).toHaveAttribute('data-menu-page-height-mm','180');
  await page.getByRole('button',{name:'PDF',exact:true}).click();
  await expect(page.getByRole('combobox', { name: 'Páginas', exact: true }).getByRole('option', { name: 'Intervalo' })).toBeEnabled();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button',{name:'Baixar PDF',exact:true}).click();
  const file = await downloadPromise;
  await expect(page.getByText('PDF baixado', { exact: true })).toBeVisible();
  await expect(page.getByText(file.suggestedFilename(), { exact: false })).toHaveCount(0);
  const path = testInfo.outputPath('landscape-preview.pdf');
  await file.saveAs(path);
  const pdf = (await readFile(path)).toString('latin1');
  const [,width,height] = pdf.match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/) || [];
  expect(Number(width)).toBeCloseTo(320 * 72 / 25.4);
  expect(Number(height)).toBeCloseTo(180 * 72 / 25.4);
  await testInfo.attach('Landscape PDF', {path,contentType:'application/pdf'});
});

test('PDF page setup updates the editor and restores the portrait columns', async ({ page }) => {
  await page.goto(`${url}?photos=list&lanes=2&different-categories&right-column`);
  const canvasPage = page.locator('[data-menu-print-page]').first();
  const columns = canvasPage.locator('[data-drag-column-container="category"]');
  const getGroups = () => columns.evaluateAll(lanes => lanes.map(lane => Array.from(
    lane.querySelectorAll('[data-category-chunk]'), group => group.getAttribute('data-category-chunk'),
  )));
  await expect(columns).toHaveCount(2);
  const portraitGroups = await getGroups();
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Páginas', exact: true }).getByRole('option', { name: 'Intervalo' })).toBeDisabled();
  const orientation = page.getByRole('combobox', { name: 'Orientação', exact: true });
  await orientation.selectOption('landscape');
  await expect(canvasPage).toHaveAttribute('data-menu-page-width-mm', '297');
  await expect(columns).toHaveCount(2);
  await orientation.selectOption('portrait');
  await expect(canvasPage).toHaveAttribute('data-menu-page-width-mm', '210');
  await expect.poll(getGroups).toEqual(portraitGroups);
  await page.getByRole('combobox', { name: 'Papel', exact: true }).selectOption('A5');
  await expect(canvasPage).toHaveAttribute('data-menu-page-width-mm', '148');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByLabel('Tamanho da página')).toHaveText('A5');
});

test('the editor uses one landscape column for a single category and restores portrait settings', async ({ page }) => {
  await page.goto(`${url}?photos=list&lanes=2`);
  const canvasPage = page.locator('[data-menu-print-page]').first();
  const columns = canvasPage.locator('[data-drag-column-container="category"]');
  await expect(columns).toHaveCount(2);
  await page.getByRole('button', { name: 'Paisagem', exact: true }).click();
  await expect(canvasPage).toHaveAttribute('data-menu-page-width-mm', '297');
  await expect(columns).toHaveCount(1);
  await page.getByRole('button', { name: 'Retrato', exact: true }).click();
  await expect(columns).toHaveCount(2);
});

test('Sem modelo is searchable and applies the classic design without losing content', async ({ page }) => {
  await page.goto(url);
  const paper = page.locator('[data-menu-print-page]').first();
  const original = await paper.getAttribute('data-design-schema-version');
  await page.getByRole('button', { name: 'Editorial Essencial', exact: true }).click();
  await page.getByRole('textbox', { name: 'Pesquisar modelos' }).fill('em branco padrão');
  const option = page.locator('[data-template-option]');
  await expect(option).toHaveCount(1);
  await expect(option.getByRole('button', { name: /favoritos/i })).toHaveCount(0);
  await option.getByRole('button', { name: 'Sem modelo', exact: true }).click();
  await expect(paper).not.toHaveAttribute('data-design-schema-version');
  await expect(paper).toHaveCSS('font-family', 'Inter');
  await expect(paper.getByText('Burrata da casa', { exact: true })).toBeVisible();
  await page.getByTitle('Desfazer', { exact: true }).click();
  await expect(paper).toHaveAttribute('data-design-schema-version', original!);
  await page.getByTitle('Refazer', { exact: true }).click();
  await page.getByRole('button', { name: 'Descobrir', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('img', { name: /Prévia de Sem modelo/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /favoritos: Sem modelo/ })).toHaveCount(0);
});

test('local texture gallery offers new patterns and scales Mix at the default color', async ({ page }) => {
  await page.goto(url + '?neutral');
  const texture = page.getByRole('combobox', { name: 'Textura de fundo' });
  await texture.click();
  const gallery = page.getByRole('listbox', { name: 'Textura de fundo' });
  await expect(gallery.getByRole('option')).toHaveCount(14);
  await expect(gallery.getByRole('option', { name: /Azulejo|Diamantes suaves/ })).toHaveCount(0);
  await gallery.getByRole('option', { name: 'Mini comidas', exact: true }).click();
  await page.getByRole('combobox', { name: 'Mini comida', exact: true }).click();
  await page.getByRole('option', { name: 'Mix', exact: true }).click();
  const paper = page.locator('[data-menu-print-page]').first();
  const original = await paper.evaluate(node => getComputedStyle(node).backgroundImage);
  const scale = page.getByRole('slider', { name: /Tamanho dos ícones/ });
  expect(original).toContain('data:image/svg+xml');
  await scale.press('End');
  await expect(scale).toHaveValue('160');
  await expect(paper).not.toHaveCSS('background-image', original);
  await expect(paper).toHaveCSS('background-repeat', 'repeat');
});
