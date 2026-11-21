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
  const linkCheckbox = page.getByRole('checkbox', { name: /Gerar link virtual/ });
  const linkSection = linkCheckbox.locator('../..');
  await expect(linkSection.getByText('Link do cardápio')).toBeVisible();
  const linkActions = await linkSection.getByRole('button').allTextContents();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('heading', { name: 'Visual', exact: true }).locator('..')
    .getByRole('button', { name: 'PDF', exact: true }).click();
  await expect(linkCheckbox).not.toBeChecked();
  await expect(linkSection.getByText('Link do cardápio')).toHaveCount(0);
  await linkCheckbox.check();
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

test('settings keeps its close buttons visible and numeric typing commits at the bounds', async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole('button', { name: 'Meu perfil' }).click();
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Configurações' });
  await settings.getByRole('button', { name: 'Regras Gerais', exact: true }).click();
  const minimum = settings.getByRole('spinbutton', { name: 'Mínimo geral', exact: true });
  await minimum.fill('1');
  await expect(minimum).toHaveValue('1');
  await minimum.fill('23');
  await minimum.press('Enter');
  await expect(minimum).toHaveValue('23');
  await expect(settings.getByRole('button', { name: 'Aumentar Mínimo geral', exact: true })).toHaveCount(0);
  const plus = settings.getByRole('button', { name: 'Aumentar tamanho da fonte Mínimo geral' });
  await plus.hover();
  await page.mouse.down();
  await expect.poll(async () => Number(await minimum.inputValue())).toBeGreaterThan(24);
  await page.mouse.up();
  await settings.getByRole('button', { name: 'Redefinir regras ao padrão' }).scrollIntoViewIfNeeded();
  const top = settings.getByRole('button', { name: 'Fechar configurações' });
  const footer = settings.getByRole('button', { name: 'Fechar', exact: true });
  await expect(top).toBeInViewport();
  await expect(footer).toBeInViewport();
  await footer.click();
  await expect(settings).toHaveCount(0);
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
