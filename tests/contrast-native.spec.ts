import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));});
test('a photo backdrop is corrected with native category-group fills, including category titles',async({page})=>{
 await page.goto('/tests/fixtures/template-editor.html?low-contrast&contrast-photo&editable');
 await page.getByRole('button',{name:'Abrir dicas do cardápio'}).click();
 const tip=page.locator('[data-canvas-tips-menu] section').filter({has:page.getByRole('heading',{name:'Leitura dos textos',exact:true})});
 await expect(tip).toBeVisible();await expect(tip.getByRole('button',{name:'Alterar cores',exact:true})).toHaveCount(0);
 await expect(tip).toContainText('Deseja resolver?');await expect(tip).not.toContainText('todos');
 await tip.getByRole('button',{name:'Adicionar preenchimento',exact:true}).click();
 const root=page.locator('[data-automenu-editor-canvas]');
 await expect(root.locator('[data-category-group-paint]')).toHaveCount(3);
 for(const fill of await root.locator('[data-category-group-paint]').all())await expect(fill).toHaveCSS('background-color','rgb(0, 0, 0)');
 for(const title of await root.locator('[data-word-fit-scope="category"]').all()){await expect(title).toHaveCSS('color','rgb(238, 238, 238)');await expect(title).toHaveCSS('background-color','rgba(0, 0, 0, 0)');}
 await page.waitForTimeout(2000);await expect(tip).toHaveCount(0);
});
test('mixed text colors stay readable after filling native cards and categories',async({page})=>{
 await page.goto('/tests/fixtures/template-editor.html?low-contrast&contrast-mixed&contrast-design&editable');
 await page.getByRole('button',{name:'Abrir dicas do cardápio'}).click();
 const tip=page.locator('[data-canvas-tips-menu] section').filter({has:page.getByRole('heading',{name:'Leitura dos textos',exact:true})});
 await tip.getByRole('button',{name:'Adicionar preenchimento',exact:true}).click();
 await page.waitForTimeout(2000);await expect(tip).toHaveCount(0);
 // Automatic fitting may subsequently shrink previously large text.
 await page.locator('[data-word-fit-scope], [data-template-price]').evaluateAll(nodes=>nodes.forEach(node=>{
  (node as HTMLElement).style.setProperty('font-size','13px','important');
 }));
 await page.evaluate(()=>document.fonts.dispatchEvent(new Event('loadingdone')));
 await page.waitForTimeout(2000);await expect(tip).toHaveCount(0);
});
test('color correction removes old hidden text backgrounds and updates individual overrides together',async({page})=>{
 await page.goto('/tests/fixtures/template-editor.html?low-contrast&legacy-contrast&editable');
 await page.getByRole('button',{name:'Abrir dicas do cardápio'}).click();
 const tip=page.locator('[data-canvas-tips-menu] section').filter({has:page.getByRole('heading',{name:'Leitura dos textos',exact:true})});
 await tip.getByRole('button',{name:'Alterar cores',exact:true}).click();
 const root=page.locator('[data-automenu-editor-canvas]');
 for(const text of await root.locator('[data-word-fit-scope="category"], [data-word-fit-scope="productName"], [data-word-fit-scope="productDescription"], [data-template-price]').all()){
  await expect(text).not.toHaveCSS('color','rgb(238, 238, 238)');await expect(text).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 }
 await page.waitForTimeout(1500);await expect(tip).toHaveCount(0);
});
test('a color correction remains valid when automatic fitting reduces large text',async({page})=>{
 await page.goto('/tests/fixtures/template-editor.html?low-contrast&editable');
 await page.getByRole('button',{name:'Abrir dicas do cardápio'}).click();
 const tip=page.locator('[data-canvas-tips-menu] section').filter({has:page.getByRole('heading',{name:'Leitura dos textos',exact:true})});
 await tip.getByRole('button',{name:'Alterar cores',exact:true}).click();
 await page.locator('[data-word-fit-scope], [data-template-price]').evaluateAll(nodes=>nodes.forEach(node=>(node as HTMLElement).style.setProperty('font-size','13px','important')));
 await page.evaluate(()=>document.fonts.dispatchEvent(new Event('loadingdone')));
 await page.waitForTimeout(2000);await expect(tip).toHaveCount(0);
});
