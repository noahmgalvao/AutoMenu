import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));});
test('empty selection edits all, offers only present types and isolates selected text types',async({page})=>{
 await page.goto('/tests/fixtures/template-editor.html?neutral&editable&general-rules');
 const controls=page.locator('[data-batch-text-controls]');await expect(page.getByRole('button',{name:/^Editando:/})).toHaveText('Editando: Todos');
 await page.getByRole('button',{name:/^Editando:/}).click();await page.getByRole('group',{name:'Editar elementos'}).getByRole('button',{name:'Produtos',exact:true}).click();await page.getByRole('button',{name:/^Editando:/}).click();
 const before=await page.locator('[data-automenu-editor-canvas] [data-word-fit-scope="category"]').first().evaluate(e=>getComputedStyle(e).color);
 await controls.getByRole('button',{name:'Itálico',exact:true}).click();
 await expect.poll(()=>page.locator('[data-automenu-editor-canvas] [data-word-fit-scope="productName"]').first().evaluate(e=>getComputedStyle(e).fontStyle)).toBe('italic');
 expect(await page.locator('[data-automenu-editor-canvas] [data-word-fit-scope="category"]').first().evaluate(e=>getComputedStyle(e).color)).toBe(before);
 await page.getByRole('button',{name:/^Editando:/}).click();await page.getByRole('group',{name:'Editar elementos'}).getByRole('button',{name:'Todos',exact:true}).click();await expect(page.getByRole('button',{name:/^Editando:/})).toHaveText('Editando: Todos');
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
 const controls=page.locator('[data-batch-text-controls]');await page.getByRole('button',{name:/^Editando:/}).click();await page.getByRole('group',{name:'Editar elementos'}).getByRole('button',{name:'Página atual',exact:true}).click();
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
test('editing list overlays the designer, closes outside and collapses a complete selection to Todos',async({page})=>{
 await page.goto('/tests/fixtures/template-editor.html?neutral&editable&general-rules');
 const badge=()=>page.getByRole('button',{name:/^Editando:/});await badge().click();
 const menu=page.getByRole('group',{name:'Editar elementos'});
 await expect(menu).toHaveCSS('position','fixed');
 await menu.getByRole('button',{name:'Produtos',exact:true}).click();await menu.getByRole('button',{name:'Preço',exact:true}).click();
 await expect(badge()).toHaveText('Editando: Múltiplos');
 for(const name of ['Título','Subtítulo','Categorias','Descrição'])await menu.getByRole('button',{name,exact:true}).click();
 await expect(badge()).toHaveText('Editando: Todos');await expect(menu.getByRole('button',{name:'Todos',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.mouse.click(900,850);await expect(menu).toHaveCount(0);
});
test('tips open immediately with progress inside the menu while page reduction is measured',async({page})=>{
 await page.goto('/tests/fixtures/template-editor.html?classic-catalog&editable&general-rules');
 const button=page.getByRole('button',{name:'Abrir dicas do cardápio'});await expect(button).toBeVisible();await expect(button).toHaveText('?');
 await button.click();await expect(page.locator('[data-canvas-tips-menu]')).toBeVisible();
 await expect(page.getByText('Verificando se é possível usar menos páginas…')).toBeVisible();
 const tip=page.locator('[data-page-reduction-tip]');await expect(tip).toContainText('Caber em 1 página',{timeout:60000});
 const action=tip.getByRole('button',{name:/Ver opções para reduzir páginas|^Reduzir páginas$/});
 const multiple=await action.getAttribute('aria-label')==='Ver opções para reduzir páginas';await action.click();
 if(multiple){const dialog=page.getByRole('dialog',{name:'Prévia para reduzir páginas'});await dialog.getByRole('tab',{name:/Opção 2/}).click();const paper=dialog.locator('[data-menu-print-page]');await expect(paper).toHaveCount(1);await expect(paper.locator('[data-drag-column-container="category"]')).toHaveCount(2);await expect(paper.locator('[data-pagination-columns="2"]').first()).toBeVisible();}
});
test('tips remain available and the empty menu stays open after all checks finish',async({page})=>{
 await page.goto('/tests/fixtures/template-editor.html?neutral&editable');
 const button=page.getByRole('button',{name:'Abrir dicas do cardápio'});await expect(button).toBeVisible();await button.click();
 const menu=page.locator('[data-canvas-tips-menu]');await expect(menu).toBeVisible();
 await expect(menu).toContainText('Nenhuma dica pendente no momento.');await page.waitForTimeout(500);await expect(menu).toBeVisible();
 await expect(button).toHaveText('?');
});
