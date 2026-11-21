import { expect, test, type Locator } from '@playwright/test';
import { shortcutsFor } from './fixtures/canvas-shortcuts';
import { PRESET_TEMPLATES } from '../src/domain/templates/templateCatalog';
import { getPaginationBottomInset } from '../src/domain/menu/menuPagination';
import { resolveMenuPageDimensions } from '../src/domain/menu/pageSetup';
import { resolveMenuMargins } from '../src/domain/menu/styleRules';

const fixture = '/tests/fixtures/template-editor.html';

test.beforeEach(async ({ page }) => {
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
});

test('headings replicate across pages, stay synchronized and can be kept on selected pages', async ({ page }) => {
    await page.goto(fixture + '?batch-layers&editable');
    const paper = page.locator('[data-menu-print-page]');
    const title = (index: number) => paper.nth(index).locator('[data-menu-heading="title"]');
    const titleFrame = (index: number) => title(index).locator('xpath=ancestor::header');
    const menu = page.locator('[data-canvas-object-menu]');
    const more = (index: number) => shortcutsFor(titleFrame(index)).getByRole('button', { name: 'Mais ações' }).click();

    await paper.first().click({ position: { x: 20, y: 380 }, button: 'right' });
    await expect(menu.getByRole('button', { name: 'Adicionar título' })).toBeDisabled();
    await menu.getByRole('button', { name: 'Duplicar' }).click();
    await expect(paper).toHaveCount(3);
    await title(0).click();
    await more(0);
    await menu.getByRole('button', { name: 'Usar só nesta página' }).click();
    await expect(title(1)).toHaveCount(0);
    await expect(title(2)).toHaveCount(0);

    await more(0);
    await menu.getByRole('button', { name: 'Replicar para outras páginas' }).click();
    await expect(paper.locator('[data-menu-heading="title"]')).toHaveCount(3);
    await expect(paper.locator('[data-menu-heading="subtitle"]')).toHaveCount(3);
    await expect(titleFrame(0).locator('[data-canvas-transform-handle="scale"]')).toHaveCount(2);
    await title(1).click();
    await shortcutsFor(titleFrame(1)).getByRole('button', { name: 'Editar título' }).click();
    await title(1).fill('Menu de verão');
    await title(1).press('Enter');
    for (const index of [0, 1, 2]) await expect(title(index)).toHaveText('Menu de verão');

    await shortcutsFor(titleFrame(1)).getByRole('button', { name: 'Seleção múltipla' }).click();
    await title(2).click();
    await more(2);
    await menu.getByRole('button', { name: 'Usar só nesta página' }).click();
    await expect(title(0)).toHaveCount(0);
    await expect(title(1)).toHaveText('Menu de verão');
    await expect(title(2)).toHaveText('Menu de verão');
    await more(2);
    await menu.getByRole('button', { name: 'Remover', exact: true }).click();
    await expect(paper.locator('[data-menu-heading="title"]')).toHaveCount(0);

    await paper.nth(2).click({ position: { x: 20, y: 380 }, button: 'right' });
    await menu.getByRole('button', { name: 'Adicionar título' }).click();
    await expect(title(2)).toHaveText('Menu de verão');
});

test('vertical scaling resizes product fonts and photo live with the same factor', async ({ page }) => {
    await page.goto(fixture + '?photos=cards&cols=1');
    const product = page.locator('#product-container-1');
    await product.click();
    const handle = product.getByRole('button', { name: 'Redimensionar pela base' });
    await expect(product.locator('[data-canvas-transform-handle="scale"]')).toHaveCount(2);
    await handle.scrollIntoViewIfNeeded();
    const photo = product.locator('[data-template-image]');
    const name = product.locator('#product-name-1');
    const width = (locator: Locator) => locator.evaluate(element => element.getBoundingClientRect().width);
    const size = () => name.evaluate(element => Number(element.dataset.wordFitBaseSize));
    const priorFont = await size();
    const priorPhoto = await width(photo);
    const priorWidth = await width(product);
    const box = (await handle.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 42, { steps: 4 });
    await expect.poll(size).toBeGreaterThan(priorFont);
    await expect.poll(() => width(photo)).toBeGreaterThan(priorPhoto);
    await page.mouse.up();
    await expect.poll(size).toBeGreaterThan(priorFont);
    expect(await width(product)).toBeCloseTo(priorWidth, 0);
});

test('photos and shapes rotate around their centers with the lower handle', async ({ page }) => {
    await page.goto(fixture + '?batch-layers');
    for (const id of ['batch-photo', 'shape-left']) {
        const image = page.locator(`[data-added-image-id="${id}"]`);
        await image.click();
        const handle = page.locator(`[data-image-selection-overlay="${id}"]`).getByRole('button', { name: 'Rotacionar objeto' });
        await handle.scrollIntoViewIfNeeded();
        const box = (await image.boundingBox())!;
        const grip = (await handle.boundingBox())!;
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        const before = await image.locator('img').getAttribute('src');
        await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
        await page.mouse.down();
        await page.mouse.move(cx + 80, cy, { steps: 6 });
        await page.mouse.up();
        if (id === 'batch-photo') await expect(image).toHaveCSS('rotate', '270deg');
        else await expect(image.locator('img')).not.toHaveAttribute('src', before!);
        const updated = (await image.boundingBox())!;
        expect(updated.x + updated.width / 2).toBeCloseTo(cx, 0);
        expect(updated.y + updated.height / 2).toBeCloseTo(cy, 0);
    }
});

test('free text retains its width when scaled and rotates with the lower handle', async ({ page }) => {
    await page.goto(fixture + '?layout');
    const text = page.locator('#product-container-text-a');
    await text.click();
    const group = text.locator('[data-canvas-transform-handle="scale"]');
    await expect(group).toHaveCount(2);
    const top = group.first().locator('span');
    await top.scrollIntoViewIfNeeded();
    const box = (await text.boundingBox())!;
    const handle = (await top.boundingBox())!;
    const size = () => text.locator('[data-word-fit]').evaluate(field => Number(field.dataset.wordFitBaseSize));
    const originalFont = await size();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, handle.y - 16, { steps: 5 });
    await expect.poll(size).toBeGreaterThan(originalFont);
    await page.mouse.up();
    expect((await text.boundingBox())!.width).toBeCloseTo(box.width, 0);

    const rotation = text.getByRole('button', { name: 'Rotacionar objeto' });
    const before = (await text.boundingBox())!;
    const grip = (await rotation.boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 45, before.y + before.height / 2, { steps: 8 });
    await expect(text).toHaveCSS('rotate', '270deg');
    await page.mouse.up();
    await expect(text).toHaveCSS('rotate', '270deg');
    const after = (await text.boundingBox())!;
    expect(after.x + after.width / 2).toBeCloseTo(before.x + before.width / 2, 0);
    expect(after.y + after.height / 2).toBeCloseTo(before.y + before.height / 2, 0);
});

test('resizing detached text keeps unrelated measured categories on their pages', async ({ page }) => {
    await page.goto(fixture + '?layout=scale-pages');
    const style = PRESET_TEMPLATES[0];
    const available = resolveMenuPageDimensions(style).heightPx - resolveMenuMargins(style).top - getPaginationBottomInset(style);
    const taken = await page.locator('#product-container-1').evaluate(product => {
        const header = getComputedStyle(document.getElementById('category-header-Entradas')!);
        const body = getComputedStyle(product);
        return parseFloat(header.height) + parseFloat(header.marginTop) + parseFloat(header.marginBottom)
            + parseFloat(body.marginTop) + parseFloat(body.marginBottom);
    });
    // This measured category fits on a plain page, but not beneath the menu heading.
    await page.addStyleTag({ content: `#product-container-1 { min-height: ${available - taken - 12}px }` });
    const firstPage = page.locator('[data-menu-print-page][data-page-index="0"]');
    const secondPage = page.locator('[data-menu-print-page][data-page-index="1"]');
    const category = secondPage.locator('#product-container-1');
    await expect(category).toHaveCount(1);

    const text = firstPage.locator('#product-container-text-a');
    await text.click();
    const handle = text.getByRole('button', { name: 'Redimensionar pela base' }).locator('span');
    const box = (await handle.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const fontSize = () => text.locator('[data-word-fit]').evaluate(el => Number(el.dataset.wordFitBaseSize));
    const start = await fontSize();
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 14, { steps: 4 });
    await expect.poll(fontSize).toBeGreaterThan(start);
    await expect(category).toHaveCount(1);
    await page.mouse.up();
    await expect(category).toHaveCount(1);
    await expect.poll(fontSize).toBeGreaterThan(start);
});

test('the heading quick actions can remove the selected heading', async ({ page }) => {
    await page.goto(fixture);
    const title = page.locator('#menu-title-text');
    await title.click();
    await shortcutsFor(title.locator('xpath=ancestor::header')).getByRole('button', { name: 'Remover cabeçalho' }).click();
    await expect(title).toHaveCount(0);
    await expect(page.locator('#menu-subtitle-text')).toHaveCount(0);
});

test('adding a subtitle focuses an empty editor and only changes layout when text is saved', async ({ page }) => {
    await page.goto(fixture);
    const title = page.locator('#menu-title-text');
    const subtitle = page.locator('#menu-subtitle-text');
    const header = title.locator('xpath=ancestor::header');
    await subtitle.focus();
    await subtitle.fill('');
    await subtitle.press('Enter');
    const originalHeight = await header.evaluate(node => (node as HTMLElement).offsetHeight);
    const open = async () => {
        await title.click({ button: 'right' });
        await page.locator('[data-canvas-object-menu]').getByRole('button', { name: 'Adicionar subtítulo' }).click();
        await expect(subtitle).toBeFocused();
        await expect(subtitle).toBeEmpty();
        await expect(subtitle).not.toHaveAttribute('data-subtitle-placeholder');
        expect(await header.evaluate(node => (node as HTMLElement).offsetHeight)).toBe(originalHeight);
    };
    await open();
    await subtitle.press('Escape');
    await expect(subtitle).toHaveCount(0);
    await open();
    await subtitle.fill('Almoço de domingo');
    await subtitle.press('Enter');
    await expect(subtitle).toHaveText('Almoço de domingo');
    expect(await header.evaluate(node => (node as HTMLElement).offsetHeight)).toBeGreaterThan(originalHeight);
});

test('page actions sit above the next page and operate at the edges of a selection', async ({ page }) => {
    await page.goto(fixture + '?batch-layers&editable');
    const paper = page.locator('[data-menu-print-page]');
    const frame = (index: number) => paper.nth(index).locator('..');
    const clickPaper = (index: number, modifiers: ('Control' | 'Shift')[] = []) =>
        paper.nth(index).click({ position: { x: 10, y: 165 }, modifiers });
    const after = (index: number) => frame(index).getByTitle('Adicionar página depois');
    const before = (index: number) => frame(index).getByTitle('Adicionar página antes');
    await clickPaper(0);
    await after(0).scrollIntoViewIfNeeded();
    expect(await after(0).evaluate(button => {
        const box = button.getBoundingClientRect();
        return button.contains(document.elementFromPoint(box.right - 5, box.top + box.height / 2));
    })).toBe(true);
    await frame(0).getByTitle('Trocar com a próxima página').click();
    await expect(paper).toHaveCount(2);
    await expect(paper.nth(0)).toHaveAttribute('data-blank-page-id', 'layers-page');
    await expect(paper.nth(1).getByText('Burrata da casa', { exact: true })).toBeVisible();
    await expect(paper.nth(1).locator('[data-added-image-id]')).toHaveCount(4);
    await after(1).click();
    await expect(paper).toHaveCount(3);
    await clickPaper(0);
    await clickPaper(1, ['Control']);
    await expect(before(0)).toBeVisible();
    await expect(after(0)).toHaveCount(0);
    await expect(before(1)).toHaveCount(0);
    await expect(after(1)).toBeVisible();
    await frame(1).getByTitle('Trocar com a próxima página').click();
    await expect(paper.nth(1)).toHaveAttribute('data-blank-page-id', 'layers-page');
    await expect(paper.nth(2).getByText('Burrata da casa', { exact: true })).toBeVisible();
    await expect(before(1)).toBeVisible();
    await expect(after(2)).toBeVisible();
    await before(1).click();
    await expect(paper).toHaveCount(4);
    await expect(paper.nth(2)).toHaveAttribute('data-blank-page-id', 'layers-page');
    await expect(paper.nth(3).getByText('Burrata da casa', { exact: true })).toBeVisible();
});
