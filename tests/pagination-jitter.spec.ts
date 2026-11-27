import {test,expect} from '@playwright/test';
for(const width of [1280,393])test(`a category at the second-page boundary cannot alternate columns at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.goto('/tests/fixtures/template-editor.html?pagination-jitter&editable&general-rules');
 const root=page.locator('[data-automenu-editor-canvas]');
 await expect(root.locator('[data-menu-print-page]')).toHaveCount(2);
 const available=await root.locator('[data-menu-print-page]').nth(1).evaluate(el=>{
  const content=el.querySelector<HTMLElement>('[data-menu-content]')!;const css=getComputedStyle(content);
  return (el as HTMLElement).offsetHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom)-el.querySelector<HTMLElement>('header')!.offsetHeight;
 });
 await page.addStyleTag({content:`[data-automenu-editor-canvas] [data-category-chunk="Entradas"] {height:100px!important} [data-automenu-editor-canvas] [data-drag-column-container="category"][data-drag-column-index="0"] [data-category-chunk="Pratos"] {height:${available-100+.75}px!important} [data-automenu-editor-canvas] [data-drag-column-container="category"][data-drag-column-index="1"] [data-category-chunk="Pratos"] {height:${available-100-.75}px!important}`});
 await page.waitForTimeout(700);
 const category=root.locator('[data-category-chunk="Pratos"]');const locations=[];
 for(let i=0;i<30;i++){locations.push(await category.getAttribute('data-drag-column-index'));await page.waitForTimeout(60);}
 expect(new Set(locations).size).toBe(1);
 expect(locations[0]).toBe('1');
 const inside=await category.evaluate(el=>{const page=el.closest<HTMLElement>('[data-menu-print-page]')!;const paper=page.getBoundingClientRect();const scale=paper.height/parseFloat(getComputedStyle(page).height);const content=page.querySelector('[data-menu-content]')!;return el.getBoundingClientRect().bottom<=paper.bottom-parseFloat(getComputedStyle(content).paddingBottom)*scale+.5;});
 expect(inside).toBe(true);
 await page.getByRole('button',{name:'Configurações do cardápio',exact:true}).first().click();
 await page.getByRole('button',{name:'Editar margens',exact:true}).click();
 const bottom=page.getByRole('spinbutton',{name:'Inferior',exact:true});
 await bottom.fill('40');await bottom.blur();
 await expect(category).toHaveAttribute('data-drag-column-index','0');
 await page.waitForTimeout(500);await expect(category).toHaveAttribute('data-drag-column-index','0');
 await bottom.fill('50');await bottom.blur();
 await expect(category).toHaveAttribute('data-drag-column-index','1');
 await page.waitForTimeout(500);await expect(category).toHaveAttribute('data-drag-column-index','1');
});
