import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));});
test('a photo backdrop is corrected with native category-group fills, including category titles',async({page})=>{
 await page.goto('/tests/fixtures/template-editor.html?low-contrast&contrast-photo&editable');
 await page.getByRole('button',{name:'Abrir dicas do cardápio'}).click();
 const tip=page.locator('[data-canvas-tips-menu] section').filter({has:page.getByRole('heading',{name:'Leitura dos textos',exact:true})});
 await expect(tip).toBeVisible();await expect(tip.getByRole('button',{name:'Alterar cores',exact:true})).toBeVisible();
 await tip.getByRole('button',{name:'Adicionar preenchimento',exact:true}).click();
 const root=page.locator('[data-automenu-editor-canvas]');
 await expect(root.locator('[data-category-group-paint]')).toHaveCount(3);
 for(const fill of await root.locator('[data-category-group-paint]').all())await expect(fill).toHaveCSS('background-color','rgb(0, 0, 0)');
 for(const title of await root.locator('[data-word-fit-scope="category"]').all()){await expect(title).toHaveCSS('color','rgb(238, 238, 238)');await expect(title).toHaveCSS('background-color','rgba(0, 0, 0, 0)');}
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
