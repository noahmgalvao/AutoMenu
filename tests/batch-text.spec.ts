import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));});
test('empty selection edits all, offers only present types and isolates selected text types',async({page})=>{
 await page.goto('/tests/fixtures/template-editor.html?neutral&editable&general-rules');
 const controls=page.locator('[data-batch-text-controls]');await expect(controls.locator('summary')).toHaveText('Editando: Todos');
 await controls.locator('summary').click();await controls.getByLabel('Produtos',{exact:true}).check();await controls.locator('summary').click();
 const before=await page.locator('[data-automenu-editor-canvas] [data-word-fit-scope="category"]').first().evaluate(e=>getComputedStyle(e).color);
 await controls.getByRole('button',{name:'Itálico',exact:true}).click();
 await expect.poll(()=>page.locator('[data-automenu-editor-canvas] [data-word-fit-scope="productName"]').first().evaluate(e=>getComputedStyle(e).fontStyle)).toBe('italic');
 expect(await page.locator('[data-automenu-editor-canvas] [data-word-fit-scope="category"]').first().evaluate(e=>getComputedStyle(e).color)).toBe(before);
 await controls.locator('summary').click();await controls.getByRole('button',{name:'Todos',exact:true}).click();await expect(controls.locator('summary')).toHaveText('Editando: Todos');
});
test('tips button stays outside header and fixed while canvas scrolls',async({page})=>{
 await page.goto('/tests/fixtures/template-editor.html?reduce-pages=48&editable');
 const button=page.getByRole('button',{name:'Abrir dicas do cardápio'});await expect(button).toBeVisible();
 const box=(await button.boundingBox())!;await page.mouse.move(box.x+16,box.y+16);await page.mouse.down();await page.mouse.move(250,5,{steps:12});await page.mouse.up();
 await expect.poll(async()=>Math.round((await button.boundingBox())!.y)).toBeGreaterThanOrEqual(72);
 await page.waitForTimeout(250);const fixed=(await button.boundingBox())!;
 await page.locator('[data-automenu-editor-canvas]').evaluate(el=>{el.scrollTop=300;el.scrollLeft=300;el.dispatchEvent(new Event('scroll'));});
 const after=(await button.boundingBox())!;expect(after.y).toBe(fixed.y);expect(after.x).toBe(fixed.x);
});
test('current page formatting leaves the following page unchanged',async({page})=>{
 await page.goto('/tests/fixtures/template-editor.html?reduce-pages=48&editable&general-rules');
 const controls=page.locator('[data-batch-text-controls]');await controls.locator('summary').click();await controls.getByRole('button',{name:'Página atual',exact:true}).click();
 const papers=page.locator('[data-automenu-editor-canvas] [data-menu-print-page]');await expect.poll(()=>papers.count()).toBeGreaterThan(1);
 const next=papers.nth(1).locator('[data-word-fit-scope="productName"]').first();const before=await next.evaluate(e=>getComputedStyle(e).fontStyle);
 await controls.getByRole('button',{name:'Itálico',exact:true}).click();
 expect(await next.evaluate(e=>getComputedStyle(e).fontStyle)).toBe(before);
 await expect.poll(()=>papers.first().locator('[data-word-fit-scope="menuTitle"]').first().evaluate(e=>getComputedStyle(e).fontStyle)).toBe('italic');
});
test('add subtitle placeholder stays inside the selected heading',async({page})=>{
 await page.goto('/tests/fixtures/template-editor.html?neutral&editable&empty-subtitle');
 const title=page.locator('[data-automenu-editor-canvas] #menu-title-text');await title.focus();
 const draft=page.locator('[data-automenu-editor-canvas] [data-subtitle-placeholder]');await expect(draft).toBeVisible();
 const h=(await title.locator('xpath=ancestor::header').boundingBox())!;const d=(await draft.boundingBox())!;
 expect(d.y).toBeGreaterThanOrEqual(h.y);expect(d.y+d.height).toBeLessThanOrEqual(h.y+h.height+1);
});
