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
        await tip.getByRole('button',{name:'Ver opções para reduzir páginas'}).click();
        const dialog=page.getByRole('dialog',{name:'Prévia para reduzir páginas'});
        const options=await dialog.getByRole('tab').count();
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


test('landscape page reduction omits the alternative when additional columns fail the text limits',async({page})=>{
    await page.goto(fixture+'?reduce-pages=48&landscape&editable');
    await page.getByRole('button',{name:'Abrir dicas do cardápio'}).click();
    const tip=page.locator('[data-page-reduction-tip]');
    await expect(tip).toBeVisible({timeout:60000});
    await tip.getByRole('button',{name:'Ver opções para reduzir páginas'}).click();
    const dialog=page.getByRole('dialog',{name:'Prévia para reduzir páginas'});
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('tab')).toHaveCount(0);
    await expect(dialog.locator('[data-word-overflow="true"]')).toHaveCount(0);
});
