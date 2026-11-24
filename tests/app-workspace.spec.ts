import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { shortcutsFor } from './fixtures/canvas-shortcuts';
import { expect, test, type Page } from '@playwright/test';
import { PRESET_TEMPLATES } from '../src/domain/templates/templateCatalog';

async function openWorkspace(page: Page, names = ['Menu de teste']) {
  const userId = '10000000-0000-4000-8000-000000000001';
  const workspaceId = '20000000-0000-4000-8000-000000000002';
  const menuId = '30000000-0000-4000-8000-000000000003';
  const versionId = '40000000-0000-4000-8000-000000000004';
  const timestamp = '2025-01-01T12:00:00Z';
  const user = { id: userId, email: 'editor@example.test', aud: 'authenticated', role: 'authenticated' };
  const style = { ...PRESET_TEMPLATES[0], menuTitle: 'Cardápio de teste' };
  const products = [{ id: 'suco', category: 'Bebidas', name: 'Suco natural', price: 12, description: 'Feito na hora.' }];
  const sortOption = { field: 'name', direction: 'asc' };
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256' })}.${encode({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })}.mock`;
  let menus = names.map((name, index) => ({
    id: `30000000-0000-4000-8000-${String(index + 3).padStart(12, '0')}`,
    workspace_id: workspaceId, name, status: 'draft', current_draft_version_id: versionId, created_at: timestamp, updated_at: timestamp,
  }));
  const deletionBatches: string[][] = [];

  await page.route('**/auth/v1/token?*', route => route.fulfill({
    json: { access_token: token, refresh_token: 'local-test', expires_in: 3600, token_type: 'bearer', user },
  }));
  await page.route('**/auth/v1/user', route => route.fulfill({ json: user }));
  await page.route('**/rest/v1/**', route => {
    const requestUrl = new URL(route.request().url());
    const table = requestUrl.pathname.split('/').pop();
    if (table === 'menus' && route.request().method() === 'PATCH') {
      const editorPatch = route.request().postDataJSON();
      const ids = requestUrl.searchParams.get('id')?.match(/^in\.\((.+)\)$/)?.[1].split(',')
        ?? [requestUrl.searchParams.get('id')?.replace(/^eq\./, '') ?? ''];
      if (editorPatch.status === 'archived') deletionBatches.push(ids);
      menus = menus.map(menu => ids.includes(menu.id) ? { ...menu, ...editorPatch } : menu);
      if (requestUrl.searchParams.has('select')) return route.fulfill({ json: menus.find(menu => ids.includes(menu.id)) });
      return route.fulfill({ status: 204 });
    }
    if (table === 'ensure_my_workspace_menu' && !menus.some(menu => menu.status !== 'archived')) {
      const menu = { id: '30000000-0000-4000-8000-000000000099', workspace_id: workspaceId, name: 'Cardápio 1',
        status: 'draft', current_draft_version_id: versionId, created_at: timestamp, updated_at: timestamp };
      menus = [...menus, menu];
      return route.fulfill({ json: menu });
    }
    const responses: Record<string, unknown> = {
      profiles: { user_id: userId, full_name: 'Editor de teste', default_workspace_id: workspaceId, created_at: timestamp, updated_at: timestamp },
      workspaces: { id: workspaceId, name: 'Restaurante de teste', slug: 'teste', owner_user_id: userId, status: 'active' },
      menus: menus.filter(menu => menu.status !== 'archived'),
      menu_versions: [{ id: versionId, menu_id: menuId, version_number: 1, version_type: 'draft', created_at: timestamp,
        render_snapshot: { products, style, sortOption }, editor_state: { style, sortOption, freeTextProducts: [] } }],
    };
    return route.fulfill({ json: responses[table || ''] ?? [] });
  });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
  await page.goto('/');
  await page.getByPlaceholder('email@empresa.com').fill(user.email);
  await page.getByPlaceholder('Mínimo de 6 caracteres').fill('test-password');
  await page.locator('form').getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('nav').getByText(names[0], { exact: true })).toBeVisible();
  return { userId, workspaceId, menuId, deletionBatches };
}

test('the app signs in, keeps the product editor through history, and stores an offline draft', async ({ page, context }) => {
  const { workspaceId, menuId } = await openWorkspace(page);
  const product = page.locator('[data-automenu-editor-canvas] #product-container-suco');
  const title = product.getByRole('heading');
  await expect(title).toHaveText('Suco natural');
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  const linkSwitch = page.getByRole('switch', { name: 'Gerar link virtual' });
  const linkSection = linkSwitch.locator('..');
  await expect(linkSection.getByText('Link do cardápio')).toBeVisible();
  const linkActions = await linkSection.getByRole('button').allTextContents();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('heading', { name: 'Visual', exact: true }).locator('..')
    .getByRole('button', { name: 'PDF', exact: true }).click();
  await expect(linkSwitch).not.toBeChecked();
  await expect(linkSection.getByText('Link do cardápio')).toHaveCount(0);
  await linkSwitch.click();
  await expect(linkSwitch).toBeChecked();
  await expect(linkSection.getByText('QR code', { exact: true })).toBeVisible();
  expect(await linkSection.getByRole('button').allTextContents()).toEqual(linkActions);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();

  await context.setOffline(true);
  await title.click();
  await shortcutsFor(product).getByRole('button', { name: 'Editar produto' }).click();
  const fontSize = page.locator('[data-inline-format-toolbar]').getByRole('spinbutton');
  const originalSize = await fontSize.inputValue();
  await fontSize.press('ArrowDown');
  await expect(fontSize).toHaveValue(String(Number(originalSize) - 1));
  await page.getByTitle('Desfazer', { exact: true }).click();
  await expect(fontSize).toHaveValue(originalSize);
  await page.getByTitle('Refazer', { exact: true }).click();
  await expect(title).toHaveAttribute('contenteditable', 'true');
  await title.fill('Suco de laranja');
  await title.press('Enter');
  await expect(title).toHaveText('Suco de laranja');
  await expect.poll(() => page.evaluate(key => {
    const draft = JSON.parse(localStorage.getItem(key) ?? 'null');
    return draft?.products.find((entry: { id: string }) => entry.id === 'suco')?.name;
  }, `automenu_pending_workspace_${workspaceId}_${menuId}`)).toBe('Suco de laranja');
});

test('the virtual link uploads a separate PDF when printing and publishing together', async ({ page }) => {
  test.setTimeout(30000);
  await openWorkspace(page);
  await page.route('**/rest/v1/menu_publications?*', route => route.request().method() === 'POST'
    ? route.fulfill({ json: route.request().postDataJSON() })
    : route.fulfill({ body: 'null', contentType: 'application/json' }));
  await page.route('**/storage/v1/object/sign/menu-assets/**', route =>
    route.fulfill({ json: { signedURL: '/object/sign/menu-assets/cardapio.pdf?token=test' } }));
  await page.route('**/storage/v1/object/menu-assets/**', route => route.fulfill({ json: { Key: 'cardapio.pdf' } }));
  await page.evaluate(() => { window.open = () => null; });

  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await page.getByRole('button', { name: 'Publicar', exact: true }).last().click();
  await page.getByRole('combobox', { name: 'Margens', exact: true }).selectOption('10');
  await page.getByRole('spinbutton', { name: 'Sangria mm' }).fill('2');
  await page.getByRole('switch', { name: 'Marcas de corte' }).click();
  await page.getByRole('switch', { name: 'Cinza', exact: true }).click();

  const upload = page.waitForRequest(request => request.method() === 'POST'
    && request.url().includes('/storage/v1/object/menu-assets/') && request.url().endsWith('.pdf'));
  const publicRecord = page.waitForRequest(request => request.method() === 'POST'
    && request.url().includes('/rest/v1/menu_publications'));
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar PDF', exact: true }).click();
  const printPdf = await readFile((await (await download).path())!);
  const uploadBody = (await upload).postDataBuffer()!;
  const publicPdf = uploadBody.subarray(uploadBody.indexOf('%PDF-'));
  expect((await publicRecord).postDataJSON().pdf_options).toEqual({});
  await expect(page.getByText('Link publicado', { exact: true })).toBeVisible();

  const getPageDrawing = (pdf: Buffer) => {
    const firstStream = pdf.indexOf('stream\n') + 'stream\n'.length;
    const streamEnd = pdf.indexOf('\nendstream', firstStream);
    return inflateSync(pdf.subarray(firstStream, streamEnd)).toString();
  };
  const printDrawing = getPageDrawing(printPdf);
  const publicDrawing = getPageDrawing(publicPdf);
  expect(printDrawing).toMatch(/\s[lm]\n/);
  expect(publicDrawing).not.toMatch(/\s[lm]\n/);
  const placement = publicDrawing.split('\n').find(line => line.endsWith(' cm'))!.split(' ').map(Number);
  expect(placement[0]).toBeCloseTo(595.28, 2);
  expect(placement[3]).toBeCloseTo(841.89, 2);
  expect(placement[4]).toBeCloseTo(0);
  expect(placement[5]).toBeCloseTo(0);
  const imageColorRange = (pdf: Buffer) => {
    const imageStart = pdf.indexOf(Buffer.from([0xff, 0xd8]));
    const imageEnd = pdf.indexOf(Buffer.from([0xff, 0xd9]), imageStart) + 2;
    expect(imageStart).toBeGreaterThan(0);
    return page.evaluate(async (dataUrl) => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let maxChannelDifference = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const rgb = [pixels[index], pixels[index + 1], pixels[index + 2]];
        maxChannelDifference = Math.max(maxChannelDifference, Math.max(...rgb) - Math.min(...rgb));
      }
      return maxChannelDifference;
    }, `data:image/jpeg;base64,${pdf.subarray(imageStart, imageEnd).toString('base64')}`);
  };
  expect(await imageColorRange(printPdf)).toBeLessThan(3);
  expect(await imageColorRange(publicPdf)).toBeGreaterThan(8);
});

test('product analytics labels the category bar count in Portuguese', async ({ page }) => {
  await openWorkspace(page);
  await page.getByTitle('Designer de produtos').click();
  await page.getByTitle('Análises', { exact: true }).click();
  await page.locator('.recharts-bar-rectangle path').first().click();
  await expect(page.getByText('Contagem', { exact: true })).toBeVisible();
});

test('an existing session shows loading until the workspace has loaded', async ({ page }) => {
  const { userId } = await openWorkspace(page);
  await page.addInitScript(userId => {
    localStorage.removeItem(`automenu_workspace_view_v1_${userId}`);
    const observer = new MutationObserver(records => {
      const flashed = records.some(record => [...record.addedNodes].some(node =>
        node.textContent?.includes('Falha ao carregar o ambiente')));
      if (flashed) document.documentElement.dataset.workspaceErrorFlashed = 'true';
    });
    observer.observe(document, { subtree: true, childList: true });
  }, userId);
  let loadProfile!: () => void;
  const profileGate = new Promise<void>(resolve => { loadProfile = resolve; });
  await page.route('**/rest/v1/profiles?*', async route => {
    await profileGate;
    await route.fallback();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Carregando ambiente...')).toBeVisible();
  await expect(page.getByText('Falha ao carregar o ambiente')).toHaveCount(0);
  loadProfile();
  await expect(page.getByRole('button', { name: 'Meu perfil' })).toBeVisible();
  expect(await page.locator('html').getAttribute('data-workspace-error-flashed')).toBeNull();
});

test('a cached workspace keeps profile actions and menu switching available during refresh', async ({ page }) => {
  const { userId } = await openWorkspace(page, ['Menu ativo', 'Reserva']);
  await expect.poll(() => page.evaluate(id => Boolean(localStorage.getItem(`automenu_workspace_view_v1_${id}`)), userId)).toBe(true);
  let finishRefresh!: () => void;
  const refreshGate = new Promise<void>(resolve => { finishRefresh = resolve; });
  await page.route('**/rest/v1/profiles?*', async route => {
    await refreshGate;
    await route.fallback();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const profile = page.getByRole('button', { name: 'Meu perfil' });
  await profile.click();
  await expect(page.getByRole('button', { name: 'Seleção múltipla de cardápios' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Sair', exact: true })).toBeEnabled();
  await expect(page.getByTitle('Renomear', { exact: true }).first()).toBeEnabled();
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  await page.getByRole('dialog', { name: 'Configurações' }).getByRole('button', { name: 'Fechar', exact: true }).click();
  await profile.click();
  await page.getByRole('button', { name: 'Reserva', exact: true }).click();
  const activeMenuName = page.locator('nav span.truncate').first();
  await expect(activeMenuName).toHaveText('Reserva');
  const staleResponse = page.waitForResponse(response => response.url().includes('/rest/v1/menu_versions?'));
  finishRefresh();
  await staleResponse;
  await profile.click();
  await expect(page.getByRole('button', { name: 'Menu ativo', exact: true })).toBeEnabled();
  await expect(activeMenuName).toHaveText('Reserva');
});

test('menu selection deletes only the checked menus in a single request and moves off a deleted active menu', async ({ page }) => {
  const { deletionBatches } = await openWorkspace(page, ['Menu ativo', 'Menu intermediário', 'Menu restante']);
  const profile = page.getByRole('button', { name: 'Meu perfil' });
  const activeMenuName = page.locator('nav span.truncate').first();
  await profile.click();
  const bulkDelete = page.getByRole('button', { name: 'Excluir cardápios selecionados' });
  await expect(bulkDelete).toHaveCount(0);
  await expect(page.getByTitle('Excluir cardápio', { exact: true }).first()).toHaveClass(/text-red-600/);
  await page.getByRole('button', { name: 'Seleção múltipla de cardápios' }).click();
  await expect(bulkDelete).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Menu ativo' }).check();
  await page.getByRole('checkbox', { name: 'Menu intermediário' }).check();
  await expect(activeMenuName).toHaveText('Menu ativo');
  await bulkDelete.click();
  let dialog = page.getByRole('alertdialog', { name: 'Excluir 2 cardápios?' });
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  expect(deletionBatches).toEqual([]);
  await bulkDelete.click();
  await dialog.getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect(activeMenuName).toHaveText('Menu restante');
  expect(deletionBatches).toEqual([['30000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000004']]);

  if (await profile.getAttribute('aria-expanded') !== 'true') await profile.click();
  await expect(page.getByRole('button', { name: 'Menu restante' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Menu intermediário' })).toHaveCount(0);
  await page.getByTitle('Excluir cardápio', { exact: true }).click();
  dialog = page.getByRole('alertdialog', { name: 'Excluir cardápio?' });
  await dialog.getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect(activeMenuName).toHaveText('Cardápio 1');
  expect(deletionBatches[1]).toEqual(['30000000-0000-4000-8000-000000000005']);
});

test('menu rename and deletion support undo and redo', async ({ page }) => {
  await openWorkspace(page, ['Menu ativo', 'Reserva']);
  const profile = page.getByRole('button', { name: 'Meu perfil' });
  const activeName = page.locator('nav span.truncate').first();
  await profile.click();
  await page.getByTitle('Renomear', { exact: true }).first().click();
  await page.locator('input:focus').fill('Menu atualizado');
  await page.getByTitle('Salvar nome').click();
  await expect(activeName).toHaveText('Menu atualizado');
  if (await profile.getAttribute('aria-expanded') === 'true') await profile.click();
  await page.getByTitle('Desfazer', { exact: true }).click();
  await expect(activeName).toHaveText('Menu ativo');
  await page.getByTitle('Refazer', { exact: true }).click();
  await expect(activeName).toHaveText('Menu atualizado');

  await profile.click();
  await page.getByTitle('Excluir cardápio', { exact: true }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect(activeName).toHaveText('Reserva');
  if (await profile.getAttribute('aria-expanded') === 'true') await profile.click();
  await page.getByTitle('Desfazer', { exact: true }).click();
  await expect(activeName).toHaveText('Menu atualizado');
  await page.getByTitle('Refazer', { exact: true }).click();
  await expect(activeName).toHaveText('Reserva');
});

test('menu rules commit numeric values and are separate from account settings', async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole('button', { name: 'Meu perfil' }).click();
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  const account = page.getByRole('dialog', { name: 'Configurações' });
  await expect(account.getByText('Regras gerais', { exact: false })).toHaveCount(0);
  await account.getByRole('button', { name: 'Fechar', exact: true }).click();
  const gear = page.getByRole('button', { name: 'Configurações do cardápio' });
  await gear.click();
  const rules = page.getByRole('dialog', { name: 'Regras gerais' });
  const minimum = rules.getByRole('spinbutton', { name: 'Mínimo geral', exact: true });
  await minimum.fill('1');
  await expect(minimum).toHaveValue('1');
  await minimum.fill('23');
  await minimum.press('Enter');
  await expect(minimum).toHaveValue('23');
  await expect(rules.getByText('Limites máximos', { exact: true })).toBeVisible();
  const allow = (name: string) => rules.getByRole('switch', { name });
  const split = allow('Continuar categoria na página seguinte');
  const wordBreak = allow('Permitir quebra de linha na mesma palavra');
  const increase = rules.getByRole('button', { name: 'Aumentar Mínimo geral' });
  const decrease = rules.getByRole('button', { name: 'Diminuir Mínimo geral' });
  await increase.click();
  await expect(minimum).toHaveValue('24');
  const stepBox = (await decrease.boundingBox())!;
  await page.mouse.move(stepBox.x + stepBox.width / 2, stepBox.y + stepBox.height / 2);
  await page.mouse.down();
  try {
    await expect.poll(async () => Number(await minimum.inputValue())).toBeLessThan(23);
  } finally {
    await page.mouse.up();
  }
  await minimum.fill('23');
  await minimum.press('Enter');
  await split.click();
  await allow('Permitir mudar produto de categoria ao arrastar').click();
  await wordBreak.press('Space');
  await rules.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(gear).toBeFocused();
  await gear.click();
  await expect(split).toBeChecked();
  await expect(wordBreak).toBeChecked();
  await expect(minimum).toHaveValue('23');
  await minimum.fill('8');
  await minimum.press('Enter');
  await rules.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await gear.click();
  await expect(minimum).toHaveValue('8');
  await rules.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByTitle('Desfazer', { exact: true }).click();
  await gear.click();
  await expect(minimum).toHaveValue('23');
  await rules.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByTitle('Desfazer', { exact: true }).click();
  await gear.click();
  await expect(minimum).toHaveValue('15');
});

test('mobile header returns after scrolling and stays accessible above either expanded panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openWorkspace(page);
  const header = page.locator('[data-site-header]');
  const canvas = page.locator('[data-automenu-editor-canvas]');
  await canvas.evaluate(element => {
    element.scrollTop += 90;
    element.dispatchEvent(new Event('scroll'));
    const pulse = setInterval(() => element.dispatchEvent(new Event('scroll')), 80);
    setTimeout(() => clearInterval(pulse), 2400);
  });
  await expect.poll(async () => (await header.boundingBox())!.y).toBeLessThan(-30);
  await expect.poll(async () => (await header.boundingBox())!.y, { timeout: 1800 }).toBe(0);

  await canvas.evaluate(element => {
    element.scrollTop -= 24;
    element.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => (await header.boundingBox())!.y).toBeLessThan(-30);
  await expect.poll(async () => (await header.boundingBox())!.y).toBe(0);

  for (const panel of ['Visual', 'Produtos']) {
    if (panel === 'Produtos') await page.getByRole('button', { name: 'Produtos', exact: true }).last().click();
    const heading = page.getByRole('heading', { name: panel, exact: true });
    const expand = heading.locator('..').getByRole('button', { name: 'Expandir painel' });
    await expand.click();
    await expect.poll(async () => (await heading.locator('../..').boundingBox())!.y).toBeCloseTo(64, 0);
    const hit = await header.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
    });
    expect(hit).toBe(true);
  }
});

test.describe('mobile designer panels', () => {
  test.use({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });

  test('both panels open, resize on the compositor and dismiss by touch', async ({ page, context }) => {
    await openWorkspace(page);
    const touch = await context.newCDPSession(page);
    for (const name of ['Produtos', 'Visual']) {
      const tab = page.locator('[data-mobile-designer-tab]').getByText(name, { exact: true }).locator('..');
      const sheet = page.locator('#' + await tab.getAttribute('aria-controls'));
      await tab.tap();
      await expect(tab).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(async () => (await sheet.boundingBox())!.y).toBeCloseTo(440, 0);

      const expand = sheet.getByRole('button', { name: 'Expandir painel' });
      await expand.tap();
      await expect.poll(async () => (await sheet.boundingBox())!.y).toBeCloseTo(64, 0);
      await sheet.getByRole('button', { name: 'Voltar à visualização parcial' }).tap();
      await expect.poll(async () => (await sheet.boundingBox())!.y).toBeCloseTo(440, 0);

      const drag = async (end: number, check: boolean) => {
        const box = (await sheet.boundingBox())!;
        const y = Math.round(box.y + 20);
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 170, y }] });
        const dragLayout = await sheet.evaluate(node => (node as HTMLElement).offsetHeight);
        for (const dy of [(end - y) / 2, end - y]) {
          await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 170, y: Math.round(y + dy) }] });
          if (check) {
            await expect.poll(async () => (await sheet.boundingBox())!.y).toBeCloseTo(box.y + dy, -1);
            expect(await sheet.evaluate(node => (node as HTMLElement).offsetHeight)).toBe(dragLayout);
          }
        }
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      };
      await drag(290, true);
      await expect.poll(async () => (await sheet.boundingBox())!.y).toBeCloseTo(64, 0);
      await drag(700, false);
      await expect(tab).toHaveAttribute('aria-pressed', 'false');
      await expect.poll(async () => (await sheet.boundingBox())!.y).toBeGreaterThanOrEqual(799);
      const tabBox = (await tab.boundingBox())!;
      const x = Math.round(tabBox.x + tabBox.width / 2);
      const y = Math.round(tabBox.y + tabBox.height / 2);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 90 }] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(tab).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(async () => (await sheet.boundingBox())!.y).toBeCloseTo(440, 0);
      await sheet.getByRole('button', { name: 'Fechar painel' }).tap();
      await expect(tab).toHaveAttribute('aria-pressed', 'false');
    }
  });
});

test('starting multi-selection on paper also enables it in the product designer', async ({ page }) => {
  await openWorkspace(page);
  await page.locator('[data-menu-print-page]').first().click({ button: 'right', position: { x: 10, y: 125 } });
  await page.locator('[data-canvas-object-menu]').getByRole('button', { name: 'Seleção múltipla' }).click();
  await page.getByTitle('Designer de produtos').click();
  await expect(page.locator('#designer-sheet-products [data-drag-scope][data-drag-column-container]').first()).toHaveClass(/select-none/);
});

test('saving a workspace model is durable, retries the same ID and reappears after reload', async ({ page }) => {
  await openWorkspace(page);
  const rows = new Map<string, Record<string, unknown>>();
  const versions = new Map<string, Record<string, unknown>>();
  const attempts: string[] = [];
  let failVersion = true;

  await page.route('**/rest/v1/templates?*', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST') {
      for (const row of route.request().postDataJSON()) if (!rows.has(row.id)) rows.set(row.id, { ...row, current_version_id: null });
      return route.fulfill({ status: 201 });
    }
    if (route.request().method() === 'PATCH') {
      const id = url.searchParams.get('id')?.slice(3) || '';
      rows.set(id, { ...rows.get(id), ...route.request().postDataJSON() });
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: url.searchParams.has('workspace_id') ? [...rows.values()] : [] });
  });
  await page.route('**/rest/v1/template_versions?*', async route => {
    if (route.request().method() === 'POST') {
      const [version] = route.request().postDataJSON();
      attempts.push(version.id);
      if (failVersion) {
        failVersion = false;
        return route.fulfill({ status: 503, json: { message: 'Temporariamente indisponível.' } });
      }
      versions.set(version.id, version);
      return route.fulfill({ status: 201 });
    }
    return route.fulfill({ json: [...versions.values()] });
  });

  await page.getByRole('button', { name: 'Salvar como modelo' }).click();
  const form = page.getByRole('dialog', { name: 'Salvar como modelo' });
  await form.getByRole('textbox', { name: 'Descrição (opcional)', exact: true }).fill('  Preferências da casa  ');
  await form.getByRole('button', { name: 'Salvar modelo' }).click();
  await expect(form.getByRole('alert')).toBeVisible();
  await expect(form.getByRole('textbox', { name: 'Descrição (opcional)', exact: true })).toHaveValue('  Preferências da casa  ');
  await form.getByRole('button', { name: 'Salvar modelo' }).click();
  await expect(page.getByText('Modelo salvo', { exact: true })).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toBe(attempts[1]);
  expect(rows.size).toBe(1);
  expect([...rows.values()][0]).toMatchObject({ scope: 'workspace', source_type: 'user', name: 'Modelo de Menu de teste' });
  expect([...versions.values()][0]).toMatchObject({
    style_state: { templateDescription: 'Preferências da casa', menuTitle: '', hiddenProductIds: [] },
  });
  await reloadAndFindModel();

  async function reloadAndFindModel() {
    await page.reload();
    await page.getByRole('button', { name: 'Escolher modelo', exact: true }).click();
    await page.getByRole('button', { name: 'Meus modelos', exact: true }).click();
    await page.getByRole('textbox', { name: 'Pesquisar modelos' }).fill('preferencias');
    await expect(page.getByRole('button', { name: 'Modelo de Menu de teste', exact: true })).toBeVisible();
  }
});
