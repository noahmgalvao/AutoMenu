import { expect, test } from '@playwright/test';
import { PRESET_TEMPLATES } from '../src/domain/templates/templateCatalog';

test('the app signs in, keeps the product editor through history, and stores an offline draft', async ({ page, context }) => {
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

  await page.route('**/auth/v1/token?*', route => route.fulfill({
    json: { access_token: token, refresh_token: 'local-test', expires_in: 3600, token_type: 'bearer', user },
  }));
  await page.route('**/auth/v1/user', route => route.fulfill({ json: user }));
  await page.route('**/rest/v1/**', route => {
    const table = new URL(route.request().url()).pathname.split('/').pop();
    const responses: Record<string, unknown> = {
      profiles: { user_id: userId, full_name: 'Editor de teste', default_workspace_id: workspaceId, created_at: timestamp, updated_at: timestamp },
      workspaces: { id: workspaceId, name: 'Restaurante de teste', slug: 'teste', owner_user_id: userId, status: 'active' },
      menus: [{ id: menuId, workspace_id: workspaceId, name: 'Menu de teste', status: 'draft', current_draft_version_id: versionId }],
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
  await product.getByRole('button', { name: 'Editar produto' }).click();
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
