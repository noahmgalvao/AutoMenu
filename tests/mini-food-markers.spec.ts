import { chooseDesignerOption } from './fixtures/designer-picker';
import { expect, test } from '@playwright/test';
import { MINI_FOODS, miniFoodIconUrl } from '../src/domain/menu/miniFoods';

const fixture = '/tests/fixtures/template-editor.html';
const foodNames = MINI_FOODS.map(food => food.name);

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
});

test('the editor offers the same 50 mini foods as textures, shapes and markers', async ({ page }) => {
  await page.goto(fixture);
  const texture = page.getByRole('combobox', { name: 'Textura de fundo' });
  await texture.click();
  const miniFood = page.getByRole('option', { name: 'Mini comidas' });
  const paper = page.getByRole('option', { name: 'Papel natural' });
  expect((await miniFood.boundingBox())?.height).toEqual((await paper.boundingBox())?.height);
  await miniFood.click();
  await page.getByRole('combobox', { name: 'Mini comida', exact: true }).click();
  await expect(page.getByRole('listbox').getByRole('option')).toHaveText([...foodNames, 'Mix'].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  await page.getByRole('option', { name: 'Batata frita', exact: true }).click();
  await expect(page.locator('[data-menu-print-page]').first()).toHaveCSS('background-image', /data:image\/svg\+xml/);

  await page.getByRole('button', { name: 'Adicionar forma' }).click();
  await expect(page.getByAltText('Forma adicionada')).toBeVisible();
  await page.locator('[data-object-page-index]').getByTitle('Editar forma').click();
  await page.locator('[data-inline-format-toolbar]').getByRole('button', { name: 'Alterar forma' }).click();
  await expect(page.getByRole('button', { name: 'Batata frita' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mini comidas', exact: true }).click();
  const choices = page.getByRole('group', { name: 'Mini comidas' }).getByRole('button');
  await expect(choices).toHaveText(foodNames);
  await page.getByRole('group', { name: 'Mini comidas' }).getByRole('button', { name: 'Batata frita', exact: true }).click();
  await expect(page.locator('[data-added-image-id] img[alt="Batata frita"]')).toBeVisible();

  await page.reload();
  await page.route('**/rest/v1/custom_menu_markers*', route => route.fulfill({ json: [] }));
  const categories = page.locator('[data-sidebar-decorations="category"]');
  await categories.getByRole('button', { name: 'Marcadores das categorias' }).click();
  const markers = categories.getByRole('combobox');
  await markers.click();
  const markerList = categories.getByRole('listbox');
  const markerOptions = markerList.getByRole('option');
  await expect(markerList.locator('[data-marker-preview]')).toHaveCount(await markerOptions.count());
  await expect(markerList.getByRole('option', { name: 'Mini comidas', exact: true }).locator('img'))
    .toHaveAttribute('src', miniFoodIconUrl(MINI_FOODS[0].kind));
  await markerList.getByRole('option', { name: 'Mini comidas', exact: true }).click();
  await expect(choices).toHaveText(foodNames);
  await page.getByRole('group', { name: 'Mini comidas' }).getByRole('button', { name: 'Sushi', exact: true }).click();
  await expect(categories.getByRole('combobox')).toHaveText('Mini comidas · Sushi');
  const applied = page.locator('#category-header-Entradas img[data-menu-marker]');
  await expect(applied).toHaveAttribute('src', /^data:image\/svg/);
  await expect(markers.locator('img')).toHaveAttribute('src', (await applied.getAttribute('src'))!);
  await expect(choices).toHaveCount(0);
});

test('a mini food hides the shape text and a geometric shape restores it', async ({ page }) => {
  await page.goto(fixture + '?batch-layers');
  const shape = page.locator('[data-added-image-id="shape-left"]');
  await shape.click();
  await page.locator('[data-object-page-index="0"]').getByTitle('Editar forma').click();
  const field = page.getByRole('textbox', { name: 'Texto da forma' });
  await field.fill('Prato da casa');
  await field.press('Escape');
  const settings = page.locator('[data-inline-format-toolbar]');
  await expect(settings.getByRole('button', { name: 'Contorno', exact: true })).toHaveCount(0);
  await expect(settings.getByRole('button', { name: 'Cor do contorno', exact: true })).toBeVisible();
  await expect(settings.getByRole('slider', { name: 'Espessura do contorno' })).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Cor', exact: true })).toBeVisible();

  await settings.getByRole('button', { name: 'Alterar forma' }).click();
  const picker = page.locator('[data-change-shape-picker]');
  await picker.getByRole('button', { name: 'Mini comidas', exact: true }).click();
  await picker.getByRole('button', { name: 'Coxinha', exact: true }).click();
  await expect(field).toHaveCount(0);
  await expect(shape.locator('img')).toHaveAttribute('alt', 'Coxinha');
  expect(decodeURIComponent((await shape.locator('img').getAttribute('src'))!)).not.toContain('Prato da casa');
  const sidebar = page.locator('[data-designer-scroll-container]');
  await expect(sidebar.getByRole('button', { name: 'Cor do contorno', exact: true })).toHaveCount(0);
  await sidebar.getByRole('button', { name: 'Cor', exact: true }).click();
  await page.getByRole('dialog', { name: 'Cor', exact: true }).getByRole('button', { name: '#22c55e', exact: true }).first().click();
  await expect.poll(async () => decodeURIComponent((await shape.locator('img').getAttribute('src'))!)).toContain('stroke="#22c55e"');
  await picker.getByRole('button', { name: 'Losango', exact: true }).click();
  await expect(shape.locator('img')).toHaveAttribute('alt', 'Prato da casa');
  await expect(shape.locator('[data-shape-text] > span')).toHaveText(['Prato', 'da casa']);
});

test('a custom marker applies immediately, survives reload and can be removed', async ({ page }) => {
  const stored = new Map<string, { id: string; shape: object }>();
  await page.route('**/rest/v1/custom_menu_markers*', async route => {
    const request = route.request();
    const params = new URL(request.url()).searchParams;
    if (request.method() === 'GET') {
      expect(params.get('user_id')).toBe('eq.test-user');
      await route.fulfill({ json: Array.from(stored.values()) });
      return;
    }
    if (request.method() === 'POST') {
      const { user_id, id, shape } = request.postDataJSON();
      expect(user_id).toBe('test-user');
      stored.set(id, { id, shape });
    } else if (request.method() === 'DELETE') {
      expect(params.get('user_id')).toBe('eq.test-user');
      stored.delete(params.get('id')!.slice(3));
    }
    await route.fulfill({ json: [] });
  });
  await page.goto(fixture);
  const controls = page.locator('[data-sidebar-decorations="product"]');
  const showMarkers = () => controls.getByRole('button', { name: 'Marcadores dos produtos' }).click();
  const select = controls.getByRole('combobox', { name: 'Marcadores dos produtos' });
  const applied = page.locator('#product-container-1 img[data-menu-marker]');
  await showMarkers();
  await chooseDesignerOption(select, 'create');
  await controls.getByRole('button', { name: 'Estrela', exact: true }).click();
  await controls.getByRole('button', { name: 'Salvar marcador', exact: true }).click();
  await expect(applied).toBeVisible();
  const options = controls.getByRole('listbox').getByRole('option');
  await select.click();
  await expect(options.nth(-2)).toHaveText('Marcador 1 · Estrela');
  await expect(options.last()).toHaveText('Personalizado');
  await select.click();
  await expect.poll(() => stored.size).toBe(1);
  const [id] = stored.keys();
  await expect(select).toHaveText('Marcador 1 · Estrela');

  await page.reload();
  await showMarkers();
  await chooseDesignerOption(select, id);
  await expect(applied).toBeVisible();
  await select.click();
  await controls.getByRole('button', { name: 'Remover da lista: Marcador 1 · Estrela' }).click();
  await expect(applied).toHaveCount(0);
  await expect(select).toHaveText('Sem marcador');
  await expect(options.filter({ hasText: 'Marcador 1 · Estrela' })).toHaveCount(0);
  await expect.poll(() => stored.size).toBe(0);
});


test('a marker can be created while its server library is unavailable and syncs on reconnect', async ({ page }) => {
  let available = false;
  const stored: Array<{ id: string; shape: unknown }> = [];
  await page.route('**/rest/v1/custom_menu_markers*', async route => {
    if (!available) return route.fulfill({ status: 404, json: { code: 'PGRST205', message: 'Table unavailable' } });
    if (route.request().method() === 'POST') stored.push(route.request().postDataJSON());
    await route.fulfill({ json: route.request().method() === 'GET' ? stored : [] });
  });
  await page.goto(fixture);
  const section = page.locator('[data-sidebar-decorations="product"]');
  const markers = section.getByRole('button', { name: 'Marcadores dos produtos' });
  const picker = section.getByRole('combobox', { name: 'Marcadores dos produtos' });
  await markers.click();
  await chooseDesignerOption(picker, 'create');
  await section.getByRole('button', { name: 'Salvar marcador' }).click();
  await expect(picker).toHaveText('Marcador 1 · Retângulo');
  await page.reload();
  await markers.click();
  await picker.click();
  await expect(section.getByRole('option', { name: 'Marcador 1 · Retângulo' })).toBeVisible();
  available = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => stored.length).toBe(1);
});
