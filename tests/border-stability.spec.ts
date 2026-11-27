import {test,expect} from '@playwright/test';
const fixture='/tests/fixtures/template-editor.html';
test.beforeEach(async({page})=>{await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));});
for(const card of ['bordered','soft','full-bleed']) {
  test('card contour settles without blinking in '+card,async({page})=>{
    await page.goto(fixture+`?general-rules&photos=cards&card=${card}&cols=3`);
    await page.getByRole('combobox',{name:'Formato dos cartões'}).selectOption('arch');
    const product=page.locator('#product-container-2');
    await product.getByRole('heading').click();
    const id=await product.locator('[data-canvas-action-anchor="quick"]').getAttribute('aria-controls');
    await page.locator(`[id="${id}"]`).getByTitle('Editar produto',{exact:true}).click();
    const toolbar=page.locator('[data-inline-format-toolbar]');
    await toolbar.getByRole('button',{name:'Borda',exact:true}).click();
    const preset=toolbar.getByRole('combobox',{name:'Lados da borda'});
    if(await preset.textContent()!=='Contorno') {
      await preset.click();await toolbar.getByRole('option',{name:'Contorno',exact:true}).click();
    }
    await toolbar.getByRole('spinbutton',{name:'Espessura (px)'}).fill('3');
    await toolbar.getByRole('spinbutton',{name:'Arredondamento (px)'}).fill('24');
    await page.waitForTimeout(600);
    const samples=await product.evaluate(async root=>{
      const output:string[]=[];
      for(let i=0;i<75;i++) {
        await new Promise(requestAnimationFrame);
        output.push(JSON.stringify(Array.from(root.querySelectorAll<HTMLElement>(':scope > [data-menu-border]'),el=>[el.getAttribute('style'),el.offsetWidth,el.offsetHeight])));
      }
      return [...new Set(output)];
    });
    expect(samples.length).toBe(1);
    expect(samples[0]).not.toBe('[]');
  });
}

test('dense automatically fitted card and category contours remain stable after margin edits',async({page})=>{
  await page.goto(fixture+'?general-rules&photos=cards&cols=3&no-photos&height-fit&contours');
  await page.waitForTimeout(700);
  const snapshots=()=>page.locator('[data-automenu-editor-canvas] [data-menu-print-page]').first().evaluate(async root=>{
    const values:string[]=[];for(let i=0;i<90;i++){await new Promise(requestAnimationFrame);values.push(JSON.stringify([...root.querySelectorAll<HTMLElement>('[data-menu-border]')].map(el=>el.getAttribute('style'))));}return [...new Set(values)];
  });
  const first=await snapshots();expect(first.length).toBe(1);
  await page.getByRole('button',{name:'Configurações do cardápio',exact:true}).first().click();
  await page.getByRole('button',{name:'Editar margens',exact:true}).click();
  await page.getByRole('spinbutton',{name:'Inferior',exact:true}).fill('130');
  await page.getByRole('spinbutton',{name:'Inferior',exact:true}).blur();
  await page.waitForTimeout(700);expect((await snapshots()).length).toBe(1);
});

for (const viewport of [{width:1280,height:900},{width:393,height:852}]) {
  test(`thick offset contours on five fitted card columns stay stable at ${viewport.width}px`,async({page})=>{
    await page.setViewportSize(viewport);
    await page.goto(fixture+'?photos=cards&no-photos&dense-list&border-stress');
    await page.waitForTimeout(900);
    const state=await page.locator('[data-automenu-editor-canvas]').evaluate(async root=>{
      const states:string[]=[];
      for(let i=0;i<90;i++){await new Promise(requestAnimationFrame);states.push(JSON.stringify([...root.querySelectorAll<HTMLElement>('[data-menu-border]')].map(el=>[el.getAttribute('style'),el.offsetHeight])));}
      return [...new Set(states)];
    });
    expect(state.length).toBe(1);expect(state[0]).not.toBe('[]');
  });
}

test('painting a contour does not restart geometry measurements, while real content changes still do',async({page})=>{
  await page.goto(fixture+'?photos=cards&cols=3');
  const result=await page.evaluate(async()=>{
    const path='/src/presentation/menu/designer/borderGeometry.ts';
    const {observeBorderGeometry}=await import(path) as typeof import('../src/presentation/menu/designer/borderGeometry');
    const paper=document.createElement('div');paper.dataset.menuPageWidthPx='500';paper.style.cssText='position:fixed;left:-20000px;top:0;width:500px;height:600px';
    const card=document.createElement('div');card.dataset.productCardSurface='true';card.style.cssText='position:relative;width:200px;height:100px;padding:10px';
    const text=document.createElement('span');text.dataset.wordFit='true';text.textContent='Produto';card.append(text);paper.append(card);document.body.append(paper);
    let calls=0;const dispose=observeBorderGeometry(card,()=>calls++);
    await new Promise(resolve=>setTimeout(resolve,180));calls=0;
    const stroke=document.createElement('span');stroke.dataset.menuBorder='';stroke.style.cssText='position:absolute;inset:-5px;border:3px solid red';card.append(stroke);
    await new Promise(resolve=>setTimeout(resolve,180));const paintCalls=calls;
    text.textContent='Produto com outra descrição';
    await new Promise(resolve=>setTimeout(resolve,180));const textCalls=calls-paintCalls;
    dispose?.();paper.remove();return {paintCalls,textCalls};
  });
  expect(result.paintCalls).toBe(0);expect(result.textCalls).toBeGreaterThan(0);
});

test('unchanged price placement does not rewrite styles and wake contour measurements',async({page})=>{
  await page.goto(fixture+'?photos=cards&cols=3');await page.waitForTimeout(600);
  const changes=await page.locator('[data-automenu-editor-canvas]').evaluate(async root=>{
    const path='/src/presentation/menu/canvas/useResponsivePrices.ts';
    const {applyResponsivePrices}=await import(path) as typeof import('../src/presentation/menu/canvas/useResponsivePrices');
    const observer=new MutationObserver(()=>{});observer.observe(root,{attributes:true,attributeFilter:['style'],subtree:true});
    applyResponsivePrices(root as HTMLElement,13);
    const count=observer.takeRecords().length;observer.disconnect();return count;
  });
  expect(changes).toBe(0);
});

test('contours on photographed catalog cards remain stable during repeated redraws',async({page})=>{
  await page.setViewportSize({width:393,height:852});
  await page.goto(fixture+'?photos=cards&border-stress&border-catalog');await page.waitForTimeout(800);
  const result=await page.locator('[data-automenu-editor-canvas]').evaluate(async root=>{
    const states:string[]=[];for(let i=0;i<90;i++){await new Promise(requestAnimationFrame);states.push(JSON.stringify([...root.querySelectorAll<HTMLElement>('[data-menu-border]')].map(el=>[el.getAttribute('style'),el.getBoundingClientRect().height])));}
    return new Set(states).size;
  });
  expect(result).toBe(1);
  await expect(page.locator('[data-automenu-editor-canvas] [data-menu-border]')).not.toHaveCount(0);
});
