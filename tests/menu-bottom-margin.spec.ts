import {test,expect} from '@playwright/test';

const bounds = async (page: import('@playwright/test').Page) => page.locator('[data-menu-print-page]').evaluateAll(pages => pages.flatMap(page => {
  const paper=page.getBoundingClientRect(), scale=paper.height/(page as HTMLElement).offsetHeight;
  const content=page.querySelector<HTMLElement>('[data-menu-content]')!;
  const bottom=(page as HTMLElement).offsetHeight-parseFloat(getComputedStyle(content).paddingBottom);
  return Array.from(page.querySelectorAll<HTMLElement>('[data-category-chunk]')).map(chunk=>({
    bottom:(chunk.getBoundingClientRect().bottom-paper.top)/scale, limit:bottom,
    products:Array.from(chunk.querySelectorAll<HTMLElement>('[data-drag-type="product"]')).map(item=>(item.getBoundingClientRect().bottom-paper.top)/scale),
  }));
}));

for (const {viewport, landscape} of [
  {viewport:{width:1280,height:900},landscape:false},
  {viewport:{width:393,height:852},landscape:false},
  {viewport:{width:1280,height:900},landscape:true},
]) {
  test(`dense cards respect the real bottom margin and restore size after reverting margins at ${viewport.width}px${landscape ? ' landscape' : ''}`,async({page})=>{
    await page.setViewportSize(viewport);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/tests/fixtures/template-editor.html?general-rules&photos=cards&cols=3&no-photos&dense-list' + (landscape ? '&landscape' : ''));
    const category=page.locator('[data-category-chunk="Acompanhamentos"]');
    await expect(category.locator('[data-drag-type="product"]')).toHaveCount(22);
    await expect(page.locator('[data-menu-print-page]')).toHaveCount(1);
    await expect.poll(async()=> (await bounds(page)).every(b=>b.bottom<=b.limit+.5&&b.products.every(y=>y<=b.limit+.5))).toBe(true);
    const name=page.locator('#product-name-side-1');
    const original=await name.evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
    const grid=category.locator('[data-pagination-grid]').first();
    const originalGap=await grid.evaluate(el=>parseFloat(getComputedStyle(el).rowGap));
    await page.getByRole('button',{name:'Configurações do cardápio',exact:true}).first().click();
    await page.getByRole('button',{name:'Editar margens',exact:true}).click();
    const margin=page.getByRole('spinbutton',{name:'Inferior',exact:true});
    await expect(margin).toHaveValue('58');
    await margin.fill('160');await margin.blur();
    await expect(margin).toHaveValue('160');
    await expect.poll(async()=> (await bounds(page)).every(b=>b.bottom<=b.limit+.5&&b.products.every(y=>y<=b.limit+.5))).toBe(true);
    if (original > 13.1) {
      await expect.poll(()=>name.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeLessThan(original-.1);
    } else {
      await expect(name).toHaveCSS('font-size','13px');
      await expect.poll(()=>grid.evaluate(el=>parseFloat(getComputedStyle(el).rowGap))).toBeLessThan(originalGap);
    }
    await expect(page.locator('[data-menu-print-page]')).toHaveCount(1);
    await margin.fill('58');await margin.blur();
    await expect.poll(()=>name.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeCloseTo(original,1);
    await expect.poll(async()=> (await bounds(page)).every(b=>b.bottom<=b.limit+.5&&b.products.every(y=>y<=b.limit+.5))).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('list layout respects increased bottom margins even when product fonts reach the minimum', async ({page}) => {
  await page.goto('/tests/fixtures/template-editor.html?general-rules&photos=list&cols=1&no-photos&height-fit');
  await expect(page.locator('[data-category-chunk="Entradas"] [data-drag-type="product"]')).toHaveCount(19);
  await page.getByRole('button',{name:'Configurações do cardápio',exact:true}).first().click();
  await page.getByRole('button',{name:'Editar margens',exact:true}).click();
  const margin=page.getByRole('spinbutton',{name:'Inferior',exact:true});
  await margin.fill('110');await margin.blur();
  await expect(margin).toHaveValue('110');
  await expect.poll(async()=> (await bounds(page)).every(b=>b.bottom<=b.limit+.5&&b.products.every(y=>y<=b.limit+.5))).toBe(true);
  await expect(page.locator('[data-menu-print-page]')).toHaveCount(1);
  const sizes=await page.locator('[data-word-fit], [data-price-base-size]').evaluateAll(elements=>elements.map(el=>parseFloat(getComputedStyle(el).fontSize)));
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(13);
  await expect(page.locator('[data-canvas-background-layer] [data-word-fit]')).toHaveCSS('font-size','34px');
});
