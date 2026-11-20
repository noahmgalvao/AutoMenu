import { chooseDesignerOption } from './fixtures/designer-picker';
import { expect, test } from '@playwright/test';
import { MINI_FOODS } from '../src/domain/menu/miniFoods';

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
  await expect(page.getByRole('listbox').getByRole('option')).toHaveText(foodNames);
  await page.getByRole('option', { name: 'Batata frita', exact: true }).click();
  await expect(page.locator('[data-menu-print-page]').first()).toHaveCSS('background-image', /data:image\/svg\+xml/);

  await page.getByRole('button', { name: 'Adicionar forma' }).click();
  await expect(page.getByRole('button', { name: 'Batata frita' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mini comidas', exact: true }).click();
  const choices = page.getByRole('group', { name: 'Mini comidas' }).getByRole('button');
  await expect(choices).toHaveText(foodNames);
  await page.getByRole('group', { name: 'Mini comidas' }).getByRole('button', { name: 'Batata frita', exact: true }).click();
  await page.getByRole('button', { name: 'Inserir forma' }).click();
  await expect(page.locator('[data-added-image-id] img[alt="Batata frita"]')).toBeVisible();

  await page.reload();
  await page.route('**/rest/v1/custom_menu_markers*', route => route.fulfill({ json: [] }));
  const categories = page.locator('[data-sidebar-decorations="category"]');
  await categories.getByRole('button', { name: 'Marcadores das categorias' }).click();
  await chooseDesignerOption(categories.getByRole('combobox'), 'mini-food');
  await expect(choices).toHaveText(foodNames);
  await page.getByRole('group', { name: 'Mini comidas' }).getByRole('button', { name: 'Sushi', exact: true }).click();
  await expect(categories.getByRole('combobox')).toHaveText('Mini comidas · Sushi');
  await expect(page.locator('#category-header-Entradas img[data-menu-marker]')).toHaveAttribute('src', /^data:image\/svg/);
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
  await expect(settings.getByRole('button', { name: 'Cor de preenchimento' })).toHaveCount(0);
  await settings.getByRole('button', { name: 'Contorno', exact: true }).click();
  await expect(settings.getByRole('button', { name: 'Cor do contorno' })).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Cor de preenchimento' })).toBeVisible();

  await settings.getByRole('button', { name: 'Alterar forma' }).click();
  const picker = page.locator('[data-change-shape-picker]');
  await picker.getByRole('button', { name: 'Mini comidas', exact: true }).click();
  await picker.getByRole('button', { name: 'Coxinha', exact: true }).click();
  await expect(field).toHaveCount(0);
  await expect(shape.locator('img')).toHaveAttribute('alt', 'Coxinha');
  expect(decodeURIComponent((await shape.locator('img').getAttribute('src'))!)).not.toContain('Prato da casa');
  await picker.getByRole('button', { name: 'Losango', exact: true }).click();
  await expect(shape.locator('img')).toHaveAttribute('alt', 'Prato da casa');
  const svg = decodeURIComponent((await shape.locator('img').getAttribute('src'))!);
  expect(svg).toContain('>Prato</text>');
  expect(svg).toContain('>da casa</text>');
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
  await controls.getByRole('button', { name: 'Remover marcador da lista' }).click();
  await expect(applied).toHaveCount(0);
  await expect(select).toHaveText('— Sem marcador');
  await select.click();
  await expect(options.filter({ hasText: 'Marcador 1 · Estrela' })).toHaveCount(0);
  await expect.poll(() => stored.size).toBe(0);
});
