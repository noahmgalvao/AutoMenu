import { test, expect } from '@playwright/test';
const fixture='/tests/fixtures/template-editor.html';
test.setTimeout(90000);
test.beforeEach(async({page})=>{await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));});
const counts = (preview: import('@playwright/test').Locator) => preview.locator('[data-menu-print-page]').first().evaluate(page=>({
    categories:page.querySelectorAll('[data-drag-column-container="category"]').length,
    products:[...page.querySelectorAll<HTMLElement>('[data-pagination-columns]')].map(grid=>Number(grid.dataset.paginationColumns)),
}));

test('landscape page reduction offers a denser second option even after the first has combined category and product columns',async({page})=>{
    await page.goto(fixture+'?reduce-pages=48&landscape&editable&short-lines');
    await page.getByRole('button',{name:'Abrir dicas do cardápio'}).click();
    const tip=page.locator('[data-page-reduction-tip]');
    await expect(tip).toBeVisible({timeout:60000});
    await tip.getByRole('button',{name:'Ver opções para reduzir páginas'}).click();
    const dialog=page.getByRole('dialog',{name:'Prévia para reduzir páginas'});
    const first=await counts(dialog);
    await expect(dialog.getByRole('tab')).toHaveCount(2);
    expect(first.categories).toBeGreaterThanOrEqual(2);expect(first.categories).toBeLessThanOrEqual(4);
    expect(Math.max(...first.products)).toBeGreaterThanOrEqual(2);
    await dialog.getByRole('tab',{name:/Opção 2/}).click();
    const second=await counts(dialog);
    expect(second.categories).toBeGreaterThanOrEqual(first.categories);
    expect(Math.min(...second.products)).toBeGreaterThanOrEqual(Math.min(...first.products));
    expect(second.categories>first.categories || Math.max(...second.products)>Math.max(...first.products)).toBe(true);
    await expect(dialog.locator('[data-word-overflow="true"]')).toHaveCount(0);
    await dialog.getByRole('button',{name:'Aplicar esta opção'}).click();
    await expect(page.locator('[data-automenu-editor-canvas] [data-menu-print-page]')).toHaveCount(1);
});

for(const landscape of [false,true]) {
    test(`page reduction never lowers existing category or per-category product columns in ${landscape?'landscape':'portrait'}`,async({page})=>{
        await page.goto(fixture+'?reduce-pages=64&editable&reduce-lanes=3&reduce-cols=2&reduce-override&short-lines'+(landscape?'&landscape':''));
        await page.getByRole('button',{name:'Abrir dicas do cardápio'}).click();
        const tip=page.locator('[data-page-reduction-tip]');
        await expect(tip).toBeVisible({timeout:60000});
        const action=tip.getByRole('button',{name:/Ver opções para reduzir páginas|^Reduzir páginas$/});
        const hasOptions=await action.getAttribute('aria-label')==='Ver opções para reduzir páginas';
        await action.click();
        const dialog=hasOptions ? page.getByRole('dialog',{name:'Prévia para reduzir páginas'}) : page.locator('[data-automenu-editor-canvas]');
        const options=hasOptions ? await dialog.getByRole('tab').count() : 0;
        for(let index=0;index<Math.max(1,options);index++) {
            if(options) await dialog.getByRole('tab').nth(index).click();
            const value=await counts(dialog);expect(value.categories).toBeGreaterThanOrEqual(3);
            expect(Math.min(...value.products)).toBeGreaterThanOrEqual(2);
            const individual=dialog.locator('[data-category-chunk="Seção 1"] [data-pagination-columns]');
            await expect(individual).toHaveCount(1);
            expect(Number(await individual.getAttribute('data-pagination-columns'))).toBeGreaterThanOrEqual(3);
        }
    });
}


test('one measured option is applied without opening a preview',async({page})=>{
    await page.goto(fixture+'?reduce-pages=48&editable&reduce-lanes=2&reduce-cols=2');
    await page.getByRole('button',{name:'Abrir dicas do cardápio'}).click();
    const tip=page.locator('[data-page-reduction-tip]');
    await expect(tip).toBeVisible({timeout:60000});
    await tip.getByRole('button',{name:'Reduzir páginas',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'Prévia para reduzir páginas'})).toHaveCount(0);
    await expect(page.locator('[data-automenu-editor-canvas] [data-menu-print-page]')).toHaveCount(1);
});

for(const width of [1280,393]) test(`landscape photos fit the offered page count after applying at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto(fixture+'?photos=cards&border-stress&border-catalog&calibration');
  const papers=page.locator('[data-automenu-editor-canvas] [data-menu-print-page]');
  await expect.poll(()=>papers.count()).toBeGreaterThan(1);
  await page.getByRole('button',{name:'Abrir dicas do cardápio'}).click();
  const tip=page.locator('[data-page-reduction-tip]');await expect(tip).toContainText('Caber em 1 página',{timeout:60000});
  const action=tip.getByRole('button',{name:/Ver opções para reduzir páginas|^Reduzir páginas$/});
  const hasOptions=await action.getAttribute('aria-label')==='Ver opções para reduzir páginas';
  await action.click();
  if(hasOptions){
    const dialog=page.getByRole('dialog',{name:'Prévia para reduzir páginas'});
    await expect(dialog.locator('[data-menu-print-page]')).toHaveCount(1);
    await dialog.getByRole('button',{name:'Aplicar esta opção'}).click();
  }
  await expect(papers).toHaveCount(1);await page.waitForTimeout(1000);await expect(papers).toHaveCount(1);
});
