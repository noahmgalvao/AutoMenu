import { expect, test } from '@playwright/test';
import { shortcutsFor } from './fixtures/canvas-shortcuts';

const fixture = '/tests/fixtures/template-editor.html';

test('numeric product IDs never select a page and the gray workspace clears page selection', async ({ page }) => {
  await page.goto(fixture + '?batch-layers');
  const pages = page.locator('[data-menu-print-page]');
  await page.locator('#product-container-1').getByRole('heading').click();
  await expect(page.locator('#product-container-1 [data-canvas-selection-outline]')).toHaveCount(1);
  await expect(page.getByTitle('Adicionar página depois')).toHaveCount(0);
  await pages.nth(1).dispatchEvent('click');
  await expect(page.getByTitle('Adicionar página depois')).toBeAttached();
  await page.locator('[data-automenu-editor-canvas]').click({ position: { x: 4, y: 40 } });
  await expect(page.getByTitle('Adicionar página depois')).toHaveCount(0);
  await expect(page.locator('[data-canvas-selection-outline]')).toHaveCount(0);
});

test('Paste from the object menu reads a system PNG without an app copy', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(fixture + '?photos=cards');
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 12;
    canvas.getContext('2d')!.fillRect(0, 0, 16, 12);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob, 'text/plain': new Blob(['foto'], { type: 'text/plain' }) })]);
  });
  await page.locator('#product-name-1').click({ button: 'right' });
  await page.locator('[data-canvas-object-menu]').getByRole('button', { name: 'Colar', exact: true }).click();
  const image = page.locator('#product-image-1 img');
  await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(16);
  expect(await image.getAttribute('src')).toContain('data:image/png;');
});

test('shape text survives a change of geometry and keeps existing settings', async ({ page }) => {
  await page.goto(fixture + '?batch-layers');
  const shape = page.locator('[data-added-image-id="shape-left"]');
  await shape.click();
  const quick = page.locator('[data-object-page-index="0"]');
  await expect(quick.getByRole('button').first()).toHaveAttribute('title', 'Editar forma');
  await quick.getByRole('button', { name: 'Mais opções' }).click();
  await page.locator('[data-canvas-object-menu]').getByRole('button', { name: 'Editar forma' }).click();
  const textField = page.getByRole('textbox', { name: 'Texto da forma' });
  await textField.fill('Oferta & café\nHoje');
  await expect(textField).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(textField).toHaveCSS('color', 'rgba(0, 0, 0, 0)');
  const text = shape.locator('[data-shape-text]');
  await expect(text).toContainText('Oferta');
  await textField.press('Escape');
  const toolbar = page.locator('[data-inline-format-toolbar]');
  await toolbar.getByRole('button', { name: 'Alterar forma' }).click();
  await page.locator('[data-change-shape-picker]').getByRole('button', { name: 'Elipse' }).click();
  const svg = decodeURIComponent((await shape.locator('img').getAttribute('src'))!);
  for (const part of ['<ellipse', 'rotate(25)']) expect(svg).toContain(part);
  for (const part of ['Oferta', '&', 'café', 'Hoje']) await expect(text).toContainText(part);
});

test('card photo resize previews the gesture before committing one layout change', async ({ page }) => {
  await page.goto(fixture + '?photos=cards');
  const product = page.locator('#product-container-1');
  await product.getByRole('heading').click();
  await shortcutsFor(product).getByTitle('Editar produto').click();
  const photo = product.locator('[data-template-image]');
  await expect(photo).toHaveAttribute('data-product-photo-frame', 'fill');
  await expect(photo.locator('img')).toHaveCSS('object-fit', 'cover');
  const height = () => product.evaluate(node => (node as HTMLElement).offsetHeight);
  const state = page.getByTestId('editor-state');
  const before = await height();
  const edits = Number(await state.getAttribute('data-edits'));
  const corner = (await photo.locator('[data-photo-corner="3"]').boundingBox())!;
  const x = corner.x + corner.width / 2, y = corner.y + corner.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 20, y + 35, { steps: 6 });
  await expect.poll(height).toBeGreaterThan(before);
  const preview = await height();
  await expect(photo).toHaveCSS('scale', 'none');
  await expect(state).toHaveAttribute('data-edits', String(edits));
  await page.mouse.up();
  await expect.poll(height).toBe(preview);
  await expect(state).toHaveAttribute('data-edits', String(edits + 1));

  const gesture = photo.locator('[data-photo-gesture]');
  await gesture.evaluate(frame => {
    const touches = (distance: number) => [0, distance].map((clientX, identifier) => new Touch({ identifier, target: frame, clientX }));
    frame.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: touches(100) }));
    frame.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: touches(75) }));
  });
  await expect.poll(height).toBeLessThan(preview);
  const reduced = await height();
  await expect(state).toHaveAttribute('data-edits', String(edits + 1));
  await gesture.dispatchEvent('touchend', { touches: [] });
  await expect.poll(height).toBe(reduced);
  await expect(state).toHaveAttribute('data-edits', String(edits + 2));
});

test('holding image-size controls repeats and stops at their limits', async ({ page }) => {
  await page.goto(fixture + '?batch-layers');
  const shape = page.locator('[data-added-image-id="shape-left"]');
  const width = () => shape.evaluate(node => (node as HTMLElement).offsetWidth);
  await shape.click();
  const minus = page.getByRole('button', { name: 'Diminuir tamanho' });
  await minus.hover();
  await page.mouse.down();
  await expect.poll(width).toBe(50);
  await page.mouse.up();
  const plus = page.getByRole('button', { name: 'Aumentar tamanho' });
  await plus.hover();
  await page.mouse.down();
  const bound = await shape.evaluate(node => {
    const paper = node.closest<HTMLElement>('[data-menu-print-page]')!;
    const style = (node as HTMLElement).style;
    return Math.min(paper.offsetWidth - parseFloat(style.left), paper.offsetHeight - parseFloat(style.top));
  });
  await expect.poll(width).toBe(bound);
  await page.mouse.up();
  await expect.poll(width).toBe(bound);
});

test('native paste prompt retains the destination when direct clipboard access is unavailable', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
  await page.goto(fixture + '?photos=cards');
  await page.locator('#text-Entradas').click({ button: 'right' });
  await page.locator('[data-canvas-object-menu]').getByRole('button', { name: 'Colar', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Colar imagem ou texto' });
  await expect(field).toBeFocused();
  await field.evaluate(target => {
    const clipboardData = new DataTransfer();
    clipboardData.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"/>'], 'photo.svg', { type: 'image/svg+xml' }));
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('#category-image-Entradas img')).toHaveAttribute('src', /^data:image\/svg\+xml/);
  await expect(field).toHaveCount(0);
});

test('a free text fill is local and survives closing the editor', async ({ page }) => {
  await page.goto(fixture + '?layout');
  const text = page.locator('#product-container-text-a');
  await text.click();
  await shortcutsFor(text).getByTitle('Editar texto').click();
  const toolbar = page.locator('[data-inline-format-toolbar]');
  await expect(toolbar.getByRole('button', { name: 'Cor de preenchimento' })).toHaveCount(0);
  await toolbar.getByRole('button', { name: 'Borda', exact: true }).click();
  await toolbar.getByRole('button', { name: 'Cor de preenchimento' }).click();
  await page.getByRole('dialog', { name: 'Cor de preenchimento' }).getByRole('button', { name: '#eab308', exact: true }).first().click();
  await page.keyboard.press('Escape');
  await page.locator('[data-menu-print-page]').first().dispatchEvent('click');
  await expect(text).toHaveCSS('background-color', 'rgb(234, 179, 8)');
  await expect(page.locator('#product-container-text-b')).not.toHaveCSS('background-color', 'rgb(234, 179, 8)');
});

test('card fill uses the same surface and outline as the card designer', async ({ page }) => {
  await page.goto(fixture + '?photos=cards&card=soft');
  const product = page.locator('#product-container-1');
  await product.getByRole('heading').click();
  await shortcutsFor(product).getByTitle('Editar produto').click();
  const toolbar = page.locator('[data-inline-format-toolbar]');
  await expect(toolbar.getByRole('button', { name: 'Cor de preenchimento' })).toHaveCount(0);
  await toolbar.getByRole('button', { name: 'Borda', exact: true }).click();
  await toolbar.getByRole('button', { name: 'Cor de preenchimento' }).click();
  await page.getByRole('dialog', { name: 'Cor de preenchimento' }).getByRole('button', { name: '#92400e', exact: true }).first().click();
  const card = product.locator('[data-template-card]');
  await expect(card).toHaveCSS('background-color', 'rgb(146, 64, 14)');
  await page.keyboard.press('Escape');
  await toolbar.getByRole('spinbutton', { name: 'Arredondamento (px)' }).fill('14');
  await expect(card).toHaveCSS('border-top-left-radius', '14px');
  await expect(card).toHaveCSS('background-color', 'rgb(146, 64, 14)');
});

test.describe('mobile visual designer', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('changing a shape opens the picker at half height', async ({ page }) => {
    await page.goto(fixture + '?batch-layers');
    const shape = page.locator('[data-added-image-id="shape-left"]');
    await shape.tap();
    await page.locator('[data-object-page-index="0"]').getByTitle('Editar forma').tap();
    await page.locator('[data-inline-format-toolbar]').getByRole('button', { name: 'Alterar forma' }).tap();
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--automenu-bottom-sheet-height'))).toBe('50dvh');
    await page.locator('[data-change-shape-picker]').getByRole('button', { name: 'Losango' }).tap();
    expect(decodeURIComponent((await shape.locator('img').getAttribute('src'))!)).toMatch(/Q 50 6 .* Q 94 50 /);
  });
});
