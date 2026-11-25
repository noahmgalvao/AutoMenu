import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { shortcutsFor } from './fixtures/canvas-shortcuts';
import { expect, test, type Page } from '@playwright/test';
import type { MenuStyle } from '../src/domain/menu/model';
import { PRESET_TEMPLATES } from '../src/domain/templates/templateCatalog';

async function openWorkspace(page: Page, names = ['Menu de teste'], styleOverrides: Partial<MenuStyle> = {}) {
  const userId = '10000000-0000-4000-8000-000000000001';
  const workspaceId = '20000000-0000-4000-8000-000000000002';
  const menuId = '30000000-0000-4000-8000-000000000003';
  const versionId = '40000000-0000-4000-8000-000000000004';
  const timestamp = '2025-01-01T12:00:00Z';
  const user = { id: userId, email: 'editor@example.test', aud: 'authenticated', role: 'authenticated' };
  const style = { ...PRESET_TEMPLATES[0], menuTitle: 'Cardápio de teste', ...styleOverrides };
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
  const openPublish = () => page.locator('nav').getByRole('button', { name: 'Publicar', exact: true }).click();
  await openPublish();
  const dialog = page.getByRole('dialog', { name: 'Publicar' });
  await expect(dialog.getByRole('button', { name: 'Link virtual', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'PDF', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Compartilhar', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Fechar publicação' }).click();
  const visualPublish = page.getByRole('heading', { name: 'Visual', exact: true }).locator('..')
    .getByRole('button', { name: 'Publicar', exact: true });
  await visualPublish.click();
  await expect(dialog.getByRole('button', { name: 'Link virtual', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Fechar publicação' }).click();
  await expect(visualPublish).toBeFocused();
  await page.getByTitle('Designer de produtos').click();
  await page.getByRole('heading', { name: 'Produtos', exact: true }).locator('..')
    .getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Fechar publicação' }).click();

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

function publishDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Publicar' });
}

async function openPublishMenu(page: Page) {
  await page.locator('nav').getByRole('button', { name: 'Publicar', exact: true }).click();
  return publishDialog(page);
}

test('the virtual link publishes a full snapshot, keeps its address during sync, and separates the draft address', async ({ page }) => {
  await openWorkspace(page, ['Menu de teste'], { blankPages: [{ id: 'second', index: 1, fixedPosition: true }] });
  let uploads = 0;
  let row: Record<string, unknown> | null = null;
  let releases = 0;
  const addressChanges: unknown[] = [];
  let releaseRequest: (() => void) | undefined;
  let hold = false;
  await page.route('**/rest/v1/menu_publications?*', async route => {
    if (route.request().method() === 'POST') {
      if (hold) await new Promise<void>(resolve => { releaseRequest = resolve; });
      releases++;
      row = { id: 'public-id', ...route.request().postDataJSON(), updated_at: new Date().toISOString() };
      return route.fulfill({ status: 201, body: '' });
    }
    if (route.request().method() === 'PATCH') {
      const change = route.request().postDataJSON();
      addressChanges.push(change);
      row = { ...row, ...change };
      return route.fulfill({ status: 204 });
    }
    const slug = new URL(route.request().url()).searchParams.get('menu_slug');
    return route.fulfill({ json: !slug || slug === `eq.${row?.menu_slug}` ? row : null });
  });
  await page.route('**/storage/v1/object/**', route => {
    uploads++;
    return route.fulfill({ status: 500, body: '' });
  });

  const dialog = await openPublishMenu(page);
  const slug = dialog.getByRole('textbox', { name: 'Final do link' });
  await expect(slug).toHaveValue('menu-de-teste');
  await expect(dialog.getByText('Não publicado', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Copiar', exact: true })).toBeDisabled();
  await slug.fill('Almoço Especial');
  await expect(dialog.getByText('Endereço para publicar')).toHaveCount(0);
  hold = true;
  await dialog.getByRole('button', { name: 'Publicar link', exact: true }).click();
  await expect.poll(() => Boolean(releaseRequest)).toBeTruthy();
  await expect(dialog.getByText('Sincronizando…')).toBeVisible();
  await expect(dialog.getByText('Atualizado', { exact: true })).toHaveCount(0);
  releaseRequest!();
  hold = false;
  await expect(dialog.getByText('Online', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Atualizado', { exact: true })).toBeVisible();
  expect(row).toMatchObject({ pdf_path: null, pdf_options: {}, menu_slug: 'almoco-especial' });
  expect(uploads).toBe(0);
  expect(releases).toBe(1);

  await dialog.getByRole('button', { name: 'QR Code', exact: true }).click();
  await expect(dialog.getByRole('img', { name: 'QR Code do cardápio' })).toBeVisible();
  await expect(dialog.getByText('Endereço publicado')).toHaveCount(0);
  const versionBeforeRename = row!.published_version_id;
  const snapshotBeforeRename = row!.snapshot;
  await slug.fill('Outro endereço');
  await expect(dialog.getByText('Alterações pendentes')).toBeVisible();
  const headerPublish = page.locator('nav').getByRole('button', { name: 'Publicar', exact: true });
  await expect(headerPublish).toHaveClass(/bg-amber-50/);
  await expect(dialog.getByRole('link', { name: 'Acessar' })).toHaveAttribute('href', /\/almoco-especial$/);
  await slug.press('Enter');
  await expect(dialog.getByRole('link', { name: 'Acessar' })).toHaveAttribute('href', /\/outro-endereco$/);
  await expect(headerPublish).toHaveClass(/bg-emerald-50/);
  expect(addressChanges).toEqual([{ menu_slug: 'outro-endereco' }]);
  expect(row).toMatchObject({ published_version_id: versionBeforeRename, snapshot: snapshotBeforeRename });
  const activeAddress = await dialog.getByRole('link', { name: 'Acessar' }).getAttribute('href');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (url: string) => { document.body.dataset.copiedLink = url; },
    } });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ url }: ShareData) => {
      document.body.dataset.sharedLink = url;
    } });
  });
  await dialog.getByRole('button', { name: 'Copiar', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-copied-link', activeAddress!);
  await dialog.getByRole('button', { name: 'Compartilhar', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-shared-link', activeAddress!);
  await dialog.getByRole('button', { name: 'Fechar publicação' }).click();

  const product = page.locator('[data-automenu-editor-canvas] #product-container-suco');
  await product.getByRole('heading').click();
  await shortcutsFor(product).getByRole('button', { name: 'Editar produto' }).click();
  await product.getByRole('heading').fill('Suco de maracujá');
  await product.getByRole('heading').press('Enter');
  await openPublishMenu(page);
  await expect(dialog.getByText('Alterações pendentes')).toBeVisible();
  await dialog.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(dialog.getByText('Atualizado', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Acessar' })).toHaveAttribute('href', activeAddress!);
  expect(releases).toBe(2);
  expect(uploads).toBe(0);

  await page.goto(activeAddress!);
  await expect(page.getByRole('main', { name: 'Cardápio publicado' })).toBeVisible();
  await expect(page.getByText('Suco de maracujá', { exact: true })).toBeVisible();
  await expect(page.locator('[data-menu-print-page]')).toHaveCount(2);
});

test('a release acknowledges only the version captured when publishing started', async ({ page }) => {
  await openWorkspace(page);
  let release: (() => void) | undefined;
  let row: Record<string, unknown> | null = null;
  let block = true;
  await page.route('**/rest/v1/menu_publications?*', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: row });
    const captured = route.request().postDataJSON();
    if (block) await new Promise<void>(resolve => { release = resolve; });
    row = { id: 'public-id', ...captured };
    return route.fulfill({ status: 201, body: '' });
  });
  const dialog = await openPublishMenu(page);
  await dialog.getByRole('button', { name: 'Publicar link' }).click();
  await expect.poll(() => Boolean(release)).toBeTruthy();
  await dialog.getByRole('button', { name: 'Fechar publicação' }).click();
  const product = page.locator('[data-automenu-editor-canvas] #product-container-suco');
  const heading = product.getByRole('heading');
  await heading.click();
  await shortcutsFor(product).getByRole('button', { name: 'Editar produto' }).click();
  await heading.fill('Suco de uva');
  await heading.press('Enter');
  block = false;
  release!();
  await openPublishMenu(page);
  await expect(dialog.getByText('Online', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Alterações pendentes')).toBeVisible();
  expect(row).toMatchObject({ snapshot: { products: [{ name: 'Suco natural' }] } });
  await dialog.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(dialog.getByText('Atualizado', { exact: true })).toBeVisible();
  expect(row).toMatchObject({ snapshot: { products: [{ name: 'Suco de uva' }] } });
});

test('publishing and syncing use the same public file when the publication table is missing', async ({ page }) => {
  const { menuId, workspaceId } = await openWorkspace(page);
  await page.route('**/rest/v1/menu_publications?*', route => route.fulfill({ status: 404, json: {
    code: 'PGRST205', message: "Could not find the table 'public.menu_publications' in the schema cache",
  } }));
  let signedLinks = 0;
  const uploads: string[] = [];
  const files = new Map<string, unknown>();
  await page.route('**/storage/v1/object/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/storage/v1/object/', '');
    if (!path.startsWith('sign/')) {
      files.set(path, route.request().postDataJSON());
      uploads.push(path);
      return route.fulfill({ json: { Key: path } });
    }
    if (route.request().method() === 'POST') {
      signedLinks++;
      return route.fulfill({ json: { signedURL: `/object/${path}?token=storage-test` } });
    }
    const publication = files.get(path.slice('sign/'.length));
    return publication ? route.fulfill({ json: publication }) : route.fulfill({ status: 404 });
  });

  const dialog = await openPublishMenu(page);
  await dialog.getByRole('textbox', { name: 'Final do link' }).fill('menu-storage');
  await dialog.getByRole('button', { name: 'Publicar link', exact: true }).click();
  await expect(dialog.getByText('Atualizado', { exact: true })).toBeVisible();
  const access = dialog.getByRole('link', { name: 'Acessar' });
  await expect(access).toHaveAttribute('href', /\/menu-storage$/);
  const originalAddress = (await access.getAttribute('href'))!;

  await dialog.getByRole('button', { name: 'Fechar publicação' }).click();
  const product = page.locator('[data-automenu-editor-canvas] #product-container-suco');
  const heading = product.getByRole('heading');
  await heading.click();
  await shortcutsFor(product).getByRole('button', { name: 'Editar produto' }).click();
  await heading.fill('Suco de caju');
  await heading.press('Enter');
  await openPublishMenu(page);
  await expect(dialog.getByText('Alterações pendentes')).toBeVisible();
  await dialog.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(dialog.getByText('Atualizado', { exact: true })).toBeVisible();
  await expect(access).toHaveAttribute('href', originalAddress);
  expect(uploads).toHaveLength(2);
  expect(uploads[0]).toContain(`menu-assets/${workspaceId}/published-menus/${menuId}/`);
  expect(uploads[1]).toBe(uploads[0]);
  expect(signedLinks).toBe(1);

  const beforeRename = files.get(uploads[0]) as { publication: Record<string, unknown> };
  await dialog.getByRole('textbox', { name: 'Final do link' }).fill('Novo nome');
  await expect(dialog.getByText('Alterações pendentes')).toBeVisible();
  await dialog.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(access).toHaveAttribute('href', /\/novo-nome$/);
  expect(uploads).toHaveLength(3);
  expect(uploads[2]).toBe(uploads[0]);
  expect(signedLinks).toBe(1);
  expect(files.get(uploads[0])).toEqual({ publication: {
    ...beforeRename.publication, menuSlug: 'novo-nome', updatedAt: expect.any(String),
  } });
  const shortAddress = (await access.getAttribute('href'))!;
  const source = new URL(`/storage/v1/object/sign/${uploads[0]}?token=storage-test`, shortAddress).href;
  const publicAddress = `${shortAddress}?${new URLSearchParams({ source })}`;
  await page.goto(shortAddress);
  await expect(page.getByText('Suco de caju', { exact: true })).toBeVisible();
  await page.evaluate(() => localStorage.clear());
  await page.goto(publicAddress);
  await expect(page.getByRole('main', { name: 'Cardápio publicado' })).toBeVisible();
  await expect(page.getByText('Suco de caju', { exact: true })).toBeVisible();
});

test('synchronizing a portable publication provides a short public address without invalidating the old link', async ({ page }) => {
  const { menuId, workspaceId } = await openWorkspace(page);
  const source = new URL('/legacy-publication.json?token=legacy-storage-token', page.url()).href;
  const legacy = { id: 'legacy', menuId, workspaceId, restaurantSlug: 'teste', menuSlug: 'menu-legado',
    portableSnapshotUrl: source, pdfFilename: 'Legado.pdf', snapshot: { products: [], style: PRESET_TEMPLATES[0] } };
  let row: Record<string, unknown> | null = null;
  await page.evaluate(legacy => localStorage.setItem(`automenu:portable-publication:${legacy.menuId}`, JSON.stringify(legacy)), legacy);
  await page.route('**/legacy-publication.json?*', route => route.fulfill({ json: { publication: legacy } }));
  await page.route('**/rest/v1/menu_publications?*', route => {
    if (route.request().method() === 'POST') {
      row = { id: 'published-short', ...route.request().postDataJSON() };
      return route.fulfill({ status: 201 });
    }
    return route.fulfill({ json: row });
  });
  await page.reload();
  await expect(page.locator('nav').getByText('Menu de teste')).toBeVisible();
  const dialog = await openPublishMenu(page);
  const access = dialog.getByRole('link', { name: 'Acessar' });
  await expect(access).toHaveAttribute('href', /\/cardapio\/teste\/menu-legado$/);
  const oldAddress = `${await access.getAttribute('href')}?${new URLSearchParams({ source })}`;
  await dialog.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(access).toHaveAttribute('href', /\/cardapio\/teste\/menu-legado$/);
  const shortAddress = (await access.getAttribute('href'))!;
  await page.evaluate(menuId => localStorage.removeItem(`automenu:portable-publication:${menuId}`), menuId);
  for (const address of [shortAddress, oldAddress]) {
    await page.goto(address);
    await expect(page.getByRole('main', { name: 'Cardápio publicado' })).toBeVisible();
    await expect(page.getByText('Suco natural', { exact: true })).toBeVisible();
  }
});

test('publication status distinguishes an unavailable link from a connection failure', async ({ page }) => {
  const { menuId, workspaceId } = await openWorkspace(page);
  let connectionFails = true;
  await page.route('**/rest/v1/menu_publications?*', route => {
    const query = new URL(route.request().url()).searchParams;
    if (query.has('menu_id')) return route.fulfill({ json: {
      id: 'record', menu_id: menuId, workspace_id: workspaceId, restaurant_slug: 'teste', menu_slug: 'publicado',
      content_signature: 'old', published_version_id: 'version', pdf_path: null,
    } });
    return connectionFails ? route.fulfill({ status: 503, json: { message: 'Service unavailable' } }) : route.fulfill({ json: null });
  });
  await page.reload();
  await expect(page.locator('nav').getByText('Menu de teste')).toBeVisible();
  const dialog = await openPublishMenu(page);
  await expect(dialog.getByText('Disponibilidade não verificada')).toBeVisible();
  await expect(dialog.getByText('Indisponível', { exact: true })).toHaveCount(0);
  connectionFails = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(dialog.getByText('Indisponível', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Sincronizar', exact: true })).toBeEnabled();
});

test('PDF and images share page selection and produce real PDF, JPG, PNG and TIFF files', async ({ page }, testInfo) => {
  await openWorkspace(page, ['Menu de teste'], {
    pageSetup: { preset: 'custom', orientation: 'landscape', widthMm: 50, heightMm: 75 },
    blankPages: [{ id: 'blank-two', index: 1, fixedPosition: true }, { id: 'blank-three', index: 2, fixedPosition: true }],
  });
  const pages = page.locator('[data-menu-print-page]');
  const count = await pages.count();
  expect(count).toBeGreaterThanOrEqual(3);
  await pages.nth(1).dispatchEvent('click', { bubbles: true });
  const dialog = await openPublishMenu(page);
  const pngTab = dialog.getByRole('button', { name: 'PNG', exact: true });
  const getBytes = async () => {
    const downloadButton = dialog.getByRole('button', { name: 'Baixar', exact: true });
    await expect(downloadButton).toBeEnabled({ timeout: 15_000 });
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10_000 }), downloadButton.click()]);
    return readFile((await download.path())!);
  };
  const selectProfile = async (name: string) => {
    await dialog.getByRole('button', { name: /^Perfil de exportação/ }).click();
    await dialog.getByRole('group', { name: 'Perfis de exportação' }).getByRole('button', { name: new RegExp(`^${name}(?:$| )`) }).first().click();
  };

  await dialog.getByRole('button', { name: 'Imagem', exact: true }).click();
  await expect(pngTab).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'JPG', exact: true }).click();
  await dialog.getByRole('button', { name: 'Páginas: Todas', exact: true }).click();
  const jpgPages = dialog.getByRole('group', { name: 'Páginas do JPG' });
  await expect(jpgPages.getByRole('button', { name: 'Todas as páginas' })).toHaveAttribute('aria-pressed', 'true');
  await jpgPages.getByRole('button', { name: 'Seleção', exact: true }).click();
  await selectProfile('Compartilhamento digital');
  const jpg = await getBytes();
  expect(jpg.readUInt16BE(0)).toBe(0xffd8);
  expect(jpg.readUInt16BE(14)).toBe(150);

  await dialog.getByRole('button', { name: 'PDF', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Perfil de exportação Impressão profissional', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Páginas: Seleção', exact: true }).click();
  const pdfPages = dialog.getByRole('group', { name: 'Páginas do PDF' });
  await pdfPages.getByRole('button', { name: 'Página 3', exact: true }).click();
  await pdfPages.getByRole('button', { name: 'Página 1', exact: true }).click();
  await expect(pdfPages.getByRole('button', { name: 'Seleção', exact: true })).toHaveAttribute('aria-pressed', 'false');
  const pdfBytes = await getBytes();
  await testInfo.attach('impressao-profissional.pdf', { body: pdfBytes, contentType: 'application/pdf' });
  const pdf = pdfBytes.toString('latin1');
  expect(pdf).toMatch(/\/Count 2\b/);
  expect(pdf).toMatch(/\/TrimBox \[/);
  expect(pdf).toMatch(/\/BleedBox \[/);
  expect(pdf).toMatch(/\/ColorSpace \/DeviceCMYK/);
  expect(pdf).not.toContain('/ColorSpace /DeviceRGB');
  await selectProfile('Personalizado');
  await dialog.getByLabel('Modo de cor').selectOption('RGB');
  const rgbPdf = (await getBytes()).toString('latin1');
  expect(rgbPdf).toMatch(/\/ColorSpace \/DeviceRGB/);
  expect(rgbPdf).not.toContain('/ColorSpace /DeviceCMYK');

  await dialog.getByRole('button', { name: 'Imagem', exact: true }).click();
  await dialog.getByRole('button', { name: 'TIFF', exact: true }).click();
  await selectProfile('Impressão profissional');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: ({ files }: ShareData) => files?.length === 2 });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ files }: ShareData) => {
      document.body.dataset.sharedFiles = files?.map(file => file.type).join(',');
    } });
  });
  await dialog.getByRole('button', { name: 'Compartilhar', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-shared-files', 'image/tiff,image/tiff');
  const archive = await getBytes();
  const tiffs = unzipSync(archive);
  await testInfo.attach('imagens-tiff.zip', { body: archive, contentType: 'application/zip' });
  expect(Object.keys(tiffs).map(name => name.match(/-pagina-\d+\.tiff$/)?.[0])).toEqual(['-pagina-1.tiff', '-pagina-3.tiff']);
  for (const image of Object.values(tiffs)) {
    const tiff = Buffer.from(image);
    expect(tiff.subarray(0, 4)).toEqual(Buffer.from([73, 73, 42, 0]));
    const ifd = tiff.readUInt32LE(4);
    expect(tiff.readUInt32LE(ifd + 10)).toBe(Math.round(81 / 25.4 * 300));
    expect(tiff.readUInt32LE(ifd + 22)).toBe(Math.round(56 / 25.4 * 300));
    expect(tiff.readUInt16LE(ifd + 2 + 4 * 12 + 8)).toBe(5); // PhotometricInterpretation: Separated
    expect(tiff.readUInt16LE(ifd + 2 + 6 * 12 + 8)).toBe(4); // SamplesPerPixel
  }
  await pngTab.click();
  const pngs = unzipSync(await getBytes());
  const firstPng = Buffer.from(Object.values(pngs)[0]);
  expect(firstPng.readUInt32BE(16)).toBe(Math.round(75 / 25.4 * 300));
  expect(firstPng.readUInt32BE(20)).toBe(Math.round(50 / 25.4 * 300));
  expect(firstPng.toString('ascii', 37, 41)).toBe('pHYs');
  expect(firstPng.readUInt32BE(41)).toBe(Math.round(300 / 0.0254));
});

test('profile help works by tap on mobile and customized settings inherit the profile', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 660 });
  await openWorkspace(page);
  const dialog = await openPublishMenu(page);
  await dialog.getByRole('button', { name: 'PDF', exact: true }).click();
  const picker = dialog.getByRole('button', { name: /^Perfil de exportação/ });
  await picker.click();
  const help = dialog.getByRole('button', { name: 'Informações de Impressão offset' });
  await help.hover();
  await expect(dialog.getByRole('tooltip')).toHaveCount(0);
  await help.click();
  const tooltip = dialog.getByRole('tooltip');
  await expect(tooltip.getByText('+2 mm da sangria', { exact: true })).toBeVisible();
  await expect(tooltip.getByText('220 × 307 mm', { exact: true })).toBeVisible();
  await expect(tooltip.getByText('CMYK', { exact: true })).toBeAttached();
  await expect(picker).toHaveAccessibleName('Perfil de exportação Impressão profissional');
  const bounds = (await tooltip.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(360);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(660);
  await testInfo.attach('publicar-mobile.png', { body: await page.screenshot(), contentType: 'image/png' });
  await help.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await expect(picker).toHaveAttribute('aria-expanded', 'true');
  await dialog.getByRole('button', { name: /^Impressão offset/ }).click();
  await picker.click();
  await dialog.getByRole('button', { name: 'Personalizado', exact: true }).click();
  await expect(dialog.getByRole('spinbutton', { name: 'Sangria (mm)' })).toHaveValue('5');
  await expect(dialog.getByRole('spinbutton', { name: 'Afastamento adicional (mm)' })).toHaveValue('2');
  const color = dialog.getByLabel('Modo de cor');
  await expect(color).toHaveValue('CMYK');
  await color.selectOption('RGB');
  await expect(color).toHaveValue('RGB');
  await dialog.getByRole('switch', { name: 'Marcas de corte' }).click();
  await expect(dialog.getByRole('spinbutton', { name: 'Afastamento adicional (mm)' })).toHaveCount(0);
});

test('file generation survives publication failure and publication survives export failure', async ({ page }) => {
  await openWorkspace(page);
  let row: Record<string, unknown> | null = null;
  let failPublication = true;
  await page.route('**/rest/v1/menu_publications?*', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: row });
    if (failPublication) return route.fulfill({ status: 409, json: { code: '23505', message: 'duplicate slug' } });
    row = { id: 'result', ...route.request().postDataJSON() };
    return route.fulfill({ status: 201, body: '' });
  });
  const dialog = await openPublishMenu(page);
  await dialog.getByRole('button', { name: 'Imagem', exact: true }).click();
  await dialog.getByRole('switch', { name: 'Publicar também o link virtual' }).click();
  const link = dialog.getByRole('region', { name: 'Opções do link virtual' });
  const fileActions = dialog.getByRole('group', { name: 'Ações do arquivo' });
  const download = fileActions.getByRole('button', { name: 'Baixar', exact: true });
  await link.getByRole('textbox', { name: 'Final do link' }).fill('menu-pareado');
  const [png] = await Promise.all([page.waitForEvent('download'), download.click()]);
  expect(png.suggestedFilename()).toMatch(/\.png$/);
  await expect(dialog.getByText('Este endereço já está em uso. Escolha outro nome.')).toBeVisible();

  await dialog.getByRole('button', { name: 'JPG', exact: true }).click();
  failPublication = false;
  await page.locator('[data-menu-print-page]').first().evaluate(el => { (el as HTMLElement).dataset.menuPageWidthMm = '4200'; });
  await download.click();
  await expect(dialog.getByText(/excede o limite de memória/)).toBeVisible();
  await expect(dialog.getByText('Atualizado', { exact: true })).toBeVisible();
  await expect(download).toBeEnabled();
  await expect(link.getByRole('link', { name: 'Acessar' })).toHaveAttribute('href', /\/menu-pareado$/);
  await expect(link.getByRole('button', { name: 'Copiar', exact: true })).toBeEnabled();
  await expect(link.getByRole('button', { name: 'Compartilhar', exact: true })).toBeEnabled();
  await link.getByRole('button', { name: 'QR Code', exact: true }).click();
  await expect(link.getByRole('img', { name: 'QR Code do cardápio' })).toBeVisible();
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

test('general rules save immediately and reopen on Layout', async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole('button', { name: 'Meu perfil' }).click();
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  const account = page.getByRole('dialog', { name: 'Configurações' });
  await expect(account.getByText('Regras gerais', { exact: false })).toHaveCount(0);
  await account.getByRole('button', { name: 'Fechar', exact: true }).click();
  const gear = page.getByRole('button', { name: 'Configurações do cardápio' });
  await gear.click();
  const rules = page.getByRole('dialog', { name: 'Regras gerais' });
  await expect(rules.getByRole('tab', { name: 'Layout' })).toHaveAttribute('aria-selected', 'true');
  await expect(rules.getByRole('spinbutton')).toHaveCount(0);
  const advanced = rules.getByRole('tab', { name: 'Avançadas' });
  await advanced.click();
  const minimum = rules.getByRole('spinbutton', { name: 'Mínimo geral', exact: true });
  await minimum.fill('23');
  await rules.getByRole('button', { name: 'Aumentar Mínimo geral' }).click();
  await expect(minimum).toHaveValue('24');
  const decrease = rules.getByRole('button', { name: 'Diminuir Mínimo geral' });
  const stepBox = (await decrease.boundingBox())!;
  await page.mouse.move(stepBox.x + stepBox.width / 2, stepBox.y + stepBox.height / 2);
  await page.mouse.down();
  try {
    await expect.poll(async () => Number(await minimum.inputValue())).toBeLessThan(23);
  } finally {
    await page.mouse.up();
  }
  await minimum.fill('8');
  const split = rules.getByRole('switch', { name: 'Continuar categoria na página seguinte' });
  await split.click();

  await page.mouse.click(5, 5);
  await expect(rules).toHaveCount(0);
  await expect(gear).toBeFocused();
  await gear.click();
  await expect(rules.getByRole('tab', { name: 'Layout' })).toHaveAttribute('aria-selected', 'true');
  await advanced.click();
  await expect(minimum).toHaveValue('8');
  await expect(split).toBeChecked();
  await rules.getByRole('button', { name: 'Restaurar Padrão', exact: true }).click();
  await expect(minimum).toHaveValue(String(PRESET_TEMPLATES[0].minimumFontSize ?? 15));
  await expect(split).not.toBeChecked();
  await rules.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(rules).toHaveCount(0);
});

test('the Product Designer opens the shared general rules and keeps live changes', async ({ page }) => {
  await openWorkspace(page);
  const visualGear = page.locator('#designer-sheet-visual').getByRole('button', { name: 'Configurações do cardápio' });
  const visualButtonStyle = await visualGear.getAttribute('class');
  await page.getByTitle('Designer de produtos', { exact: true }).click();
  const product = page.locator('#designer-sheet-products');
  const gear = product.getByRole('button', { name: 'Configurações do cardápio' });
  await expect(gear).toHaveClass(visualButtonStyle!);
  await gear.click();
  const rules = page.getByRole('dialog', { name: 'Regras gerais' });
  await rules.getByRole('button', { name: 'Editar margens' }).click();
  const editor = product.getByRole('region', { name: 'Margens' });
  const selected = page.locator('[data-automenu-editor-canvas] #product-container-suco');
  await selected.getByRole('heading').click();
  await expect(selected.locator('[data-canvas-selection-outline]')).toBeVisible();
  await expect(editor).toBeVisible();
  await editor.getByRole('spinbutton', { name: 'Superior', exact: true }).fill('20');
  await editor.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await rules.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(page.locator('[data-canvas-zoom-layer]')).not.toHaveAttribute('inert', '');
  await page.getByTitle('Designer visual', { exact: true }).click();
  await visualGear.click();
  await rules.getByRole('button', { name: 'Editar margens' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Superior', exact: true })).toHaveValue('20');
});

test('editing layout updates the canvas before confirmation and can reset the opening values', async ({ page }) => {
  await page.goto('/tests/fixtures/template-editor.html?cols=2&lanes=2&general-rules');
  const gear = page.getByRole('button', { name: 'Configurações do cardápio' });
  await gear.click();
  const rules = page.getByRole('dialog', { name: 'Regras gerais' });
  const editSpacing = rules.getByRole('button', { name: 'Editar espaçamentos' });
  await editSpacing.click();
  await expect(rules).toHaveCount(0);
  const layer = page.locator('[data-canvas-zoom-layer]');
  await expect(layer).not.toHaveAttribute('inert', '');
  const editor = page.getByRole('region', { name: 'Espaçamentos' });
  const betweenProducts = editor.getByRole('spinbutton', { name: 'Entre produtos', exact: true });
  const previousSpacing = await betweenProducts.inputValue();
  const priceSpacing = editor.getByRole('spinbutton', { name: 'Nome até preço', exact: true });
  const row = layer.locator('[data-product-text-row]').first();
  const nextCategorySpacing = editor.getByRole('spinbutton', { name: 'Produto até próxima categoria' });
  const originalCategorySpacing = await nextCategorySpacing.inputValue();
  await nextCategorySpacing.fill('36');
  await editor.getByRole('tab', { name: 'Margens' }).click();
  const margins = page.getByRole('region', { name: 'Margens' });
  const topMargin = margins.getByRole('spinbutton', { name: 'Superior', exact: true });
  const originalTop = await topMargin.inputValue();
  await topMargin.fill('35');
  await margins.getByRole('tab', { name: 'Espaçamentos' }).click();
  await expect(nextCategorySpacing).toHaveValue('36');
  await editor.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await editSpacing.click();
  await expect(nextCategorySpacing).toHaveValue(originalCategorySpacing);
  await editor.getByRole('tab', { name: 'Margens' }).click();
  await expect(topMargin).toHaveValue(originalTop);
  await margins.getByRole('tab', { name: 'Espaçamentos' }).click();
  await betweenProducts.fill('0');
  await expect(layer.locator('[data-pagination-grid]').first()).toHaveCSS('row-gap', '0px');
  await priceSpacing.fill('0');
  await expect(row).toHaveCSS('column-gap', '0px');
  await expect(row).toHaveAttribute('data-compact-price-gap', /^(start|end)$/);
  await editor.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(rules).toBeVisible();
  await editSpacing.click();
  await expect(betweenProducts).toHaveValue('0');
  await editor.getByRole('button', { name: 'Reiniciar espaçamentos' }).click();
  await expect(betweenProducts).toHaveValue(previousSpacing);
  await priceSpacing.fill('20');
  await editor.getByRole('button', { name: 'Fechar regras gerais' }).click();
  await expect(editor).toHaveCount(0);
  await expect(rules).toHaveCount(0);
  await expect(layer).not.toHaveAttribute('inert', '');
  await expect(row).toHaveCSS('column-gap', '20px');
});

test('mobile layout editing replaces the Visual and Produtos navigation with its own footer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openWorkspace(page);
  const navigation = page.locator('[data-mobile-designer-navigation]');
  for (const panel of ['visual', 'products']) {
    if (panel === 'products') await navigation.getByRole('button', { name: 'Produtos', exact: true }).click();
    await page.locator(`#designer-sheet-${panel}`).getByRole('button', { name: 'Configurações do cardápio' }).click();
    const rules = page.getByRole('dialog', { name: 'Regras gerais' });
    await rules.getByRole('button', { name: 'Editar espaçamentos' }).click();
    const editor = page.getByRole('region', { name: 'Espaçamentos' });
    await expect(navigation).toBeHidden();
    await expect(editor.getByRole('button', { name: 'Confirmar', exact: true })).toBeInViewport();
    await editor.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await rules.getByRole('button', { name: 'Fechar', exact: true }).click();
    await expect(navigation).toBeVisible();
  }
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

  test('publishing from either designer opens the complete menu with a tap', async ({ page, context }) => {
    await openWorkspace(page);
    for (const name of ['Produtos', 'Visual']) {
      const tab = page.locator('[data-mobile-designer-tab]').getByText(name, { exact: true }).locator('..');
      const sheet = page.locator('#' + await tab.getAttribute('aria-controls'));
      await tab.tap();
      await sheet.getByRole('button', { name: 'Publicar', exact: true }).tap();
      const dialog = publishDialog(page);
      await expect(dialog.getByRole('button', { name: 'Link virtual', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'PDF', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Imagem', exact: true })).toBeVisible();
      expect(context.pages()).toHaveLength(1);
      await dialog.getByRole('button', { name: 'Fechar publicação' }).tap();
    }
  });

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
