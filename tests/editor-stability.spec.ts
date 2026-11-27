import { test, expect, type Page } from '@playwright/test';
test.setTimeout(45000);
const fixture = '/tests/fixtures/template-editor.html';
const canvas = '[data-automenu-editor-canvas]';
test.beforeEach(async ({page}) => {
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({body:'',contentType:'text/css'}));
});
const settle = async (page: Page) => {
    await page.waitForTimeout(400);
    const signatures = await page.locator(canvas).evaluate(async root => {
        const frames: string[] = [];
        for (let i=0;i<24;i++) {
            await new Promise(requestAnimationFrame);
            frames.push(JSON.stringify(Array.from(root.querySelectorAll<HTMLElement>('[data-word-fit],[data-template-price]'), el=>[
                el.id, getComputedStyle(el).fontSize, Math.round(el.getBoundingClientRect().height*10),
                el.closest('[data-product-text-row]')?.hasAttribute('data-price-wrap'),
            ])));
        }
        return frames;
    });
    expect(new Set(signatures).size).toBe(1);
};

test('fitted text and wrapping settle after margins, spacings and repeated column changes', async ({page})=>{
    await page.goto(fixture+'?general-rules&photos=cards&cols=3&no-photos&height-fit');
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await settle(page);
    await page.getByRole('button',{name:'Configurações do cardápio',exact:true}).first().click();
    await page.getByRole('button',{name:'Editar margens',exact:true}).click();
    for (const label of ['Superior','Inferior','Esquerda','Direita']) {
        const input=page.getByRole('spinbutton',{name:label,exact:true});
        const previous=await input.inputValue();
        for(const value of [Number(previous)+12,Number(previous)+24,Number(previous)]) {
            await input.fill(String(value));await input.blur();await settle(page);
        }
    }
    await page.getByRole('tab',{name:'Espaçamentos',exact:true}).click();
    const spacing=page.getByRole('spinbutton',{name:'Entre produtos',exact:true});
    for(const value of ['12','5','18']) {await spacing.fill(value);await spacing.blur();await settle(page);}
    await page.getByRole('button',{name:'Fechar regras gerais'}).click();
    const columns=page.getByRole('group',{name:'Colunas de produtos'});
    for(const value of ['2','3','2','3']) {await columns.getByRole('button',{name:value,exact:true}).click();await settle(page);}
    expect(errors).toEqual([]);
});

test('page reduction shows both real previews, cancels without edits, and applies only the chosen result', async ({page})=>{
    await page.goto(fixture+'?reduce-pages&editable');
    const papers=page.locator(`${canvas} [data-menu-print-page]`);
    await expect(papers).toHaveCount(6);
    const before=await page.getByTestId('editor-state').getAttribute('data-edits');
    await page.getByRole('button',{name:'Abrir dicas do cardápio'}).click();
    const tip=page.locator('[data-page-reduction-tip]');
    await expect(tip).toContainText('Caber em 1 página',{timeout:30000});
    await tip.getByRole('button',{name:'Ver opções para reduzir páginas'}).click();
    const preview=page.getByRole('dialog',{name:'Prévia para reduzir páginas'});
    await expect(preview.locator('[data-menu-print-page]')).toHaveCount(1);
    await expect(preview.getByRole('tab')).toHaveCount(2);
    await page.screenshot({path:'/tmp/automenu-page-reduction-desktop.png'});
    for(const option of [1,2,1]) {
        await preview.getByRole('tab',{name:new RegExp(`Opção ${option}`)}).click();
        await expect(preview.locator('[data-menu-print-page]')).toHaveCount(1);
    }
    await preview.getByRole('button',{name:'Cancelar',exact:true}).click();
    await expect(papers).toHaveCount(6);
    await expect(page.getByTestId('editor-state')).toHaveAttribute('data-edits',before!);
    await tip.getByRole('button',{name:'Ver opções para reduzir páginas'}).click();
    await preview.getByRole('tab',{name:/Opção 2/}).click();
    await preview.getByRole('button',{name:'Aplicar esta opção'}).click();
    await expect(preview).toHaveCount(0);
    await expect(papers).toHaveCount(1);
    await settle(page);
    expect(await page.locator(`${canvas} [data-drag-type="product"]`).count()).toBe(24);
    await page.getByRole('button',{name:'Desfazer',exact:true}).click();
    await expect(papers).toHaveCount(6);
});

test('tips button drags continuously to either edge and clears its unread badge on opening', async ({page})=>{
    await page.setViewportSize({width:393,height:852});
    await page.goto(fixture+'?photos=list&no-photos&default-fields');
    const button=page.getByRole('button',{name:'Abrir dicas do cardápio'});
    await expect(page.locator('[data-tips-unread]')).toBeVisible();
    for(const target of [{x:365,y:220},{x:25,y:340}]) {
        const start=(await button.boundingBox())!;
        await page.mouse.move(start.x+16,start.y+16);await page.mouse.down();
        await page.mouse.move(target.x,target.y,{steps:15});
        const moving=(await button.boundingBox())!;
        expect(Math.abs(moving.y+16-target.y)).toBeLessThan(2);
        await page.mouse.up();
        await expect(button).toHaveAttribute('aria-expanded','false');
        await expect.poll(async()=>Math.round((await button.boundingBox())!.x)).toBe(target.x>200?345:16);
    }
    await button.click();
    await expect(page.locator('[data-canvas-tips-menu]')).toContainText('Deseja removê-los?');
    await expect(page.locator('[data-canvas-tips-menu]')).not.toContainText(/classe|Aceita/);
    await expect(page.locator('[data-tips-unread]')).toHaveCount(0);
    await button.click();await expect(button).toBeVisible();
    await expect(page.locator('[data-tips-unread]')).toHaveCount(0);
});

test('newly available page suggestion increments the unread badge after existing tips were seen',async({page})=>{
    await page.goto(fixture+'?reduce-pages&editable');
    const button=page.getByRole('button',{name:'Abrir dicas do cardápio'});
    await button.click();
    await expect(page.locator('[data-canvas-tips-menu]')).toBeVisible();
    await expect(page.locator('[data-tips-unread]')).toHaveCount(0);
    await button.click();
    await expect(page.locator('[data-tips-unread]')).toHaveText(/^[1-9]\d*$/,{timeout:30000});
    await button.click();await expect(page.locator('[data-page-reduction-tip]')).toBeVisible();
    await expect(page.locator('[data-tips-unread]')).toHaveCount(0);
});

test('product designer actions close when its sheet resize starts',async({page})=>{
    await page.setViewportSize({width:393,height:852});
    await page.goto(fixture+'?photos=list&product-designer&no-photos');
    const sheet=page.locator('#designer-sheet-products');
    await sheet.locator('[data-drag-type="category"] [data-product-options-trigger]').first().click();
    await expect(page.locator('[data-product-designer-options-menu]')).toBeVisible();
    const header=sheet.locator('[data-bottom-sheet-drag-handle]');
    const box=await (await header.count()?header:sheet.getByRole('heading',{name:'Produtos',exact:true}).locator('..')).boundingBox();
    await page.mouse.move(box!.x+100,box!.y+8);await page.mouse.down();
    await page.mouse.move(box!.x+100,box!.y-60,{steps:8});
    await expect(page.locator('[data-product-designer-options-menu]')).toHaveCount(0);await page.mouse.up();
});

test('canvas action buttons keep their anchor offset during small pans and stop moving afterward',async({page})=>{
    await page.setViewportSize({width:1280,height:600});
    await page.goto(fixture+'?photos=list&cols=1&no-photos&height-fit');
    const product=page.locator(`${canvas} #product-container-fit-0`);
    await product.getByRole('heading').click();
    const id=await product.locator('[data-canvas-action-anchor="quick"]').getAttribute('aria-controls');
    const controls=page.locator(`[id="${id}"]`);
    await expect(controls).toBeVisible();
    const offset=async()=>({
        y:(await controls.boundingBox())!.y-(await product.boundingBox())!.y,
        x:(await controls.boundingBox())!.x-(await product.boundingBox())!.x,
    });
    const original=await offset();
    for(const value of [1,2,3,2,1,0]) {
        await page.locator(canvas).evaluate((el,top)=>{el.scrollTop=top;},value);
        await page.waitForTimeout(50);
        const current=await offset();expect(current.x).toBeCloseTo(original.x,1);expect(current.y).toBeCloseTo(original.y,1);
    }
    const positions=await controls.evaluate(async el=>{
        const samples:string[]=[];for(let i=0;i<20;i++){await new Promise(requestAnimationFrame);const r=el.getBoundingClientRect();samples.push(`${r.x}:${r.y}`);}return samples;
    });
    expect(new Set(positions).size).toBe(1);
});


test('page reduction offers two pages when artwork prevents reducing to one', async ({page})=>{
    await page.setViewportSize({width:393,height:852});
    await page.goto(fixture+'?reduce-pages&editable&keep-art-page');
    await page.getByRole('button',{name:'Abrir dicas do cardápio'}).click();
    const tip=page.locator('[data-page-reduction-tip]');
    await expect(tip).toContainText('Caber em 2 páginas',{timeout:30000});
    await tip.getByRole('button',{name:'Ver opções para reduzir páginas'}).click();
    const preview=page.getByRole('dialog',{name:'Prévia para reduzir páginas'});
    await expect(preview.locator('[data-menu-print-page]')).toHaveCount(2);
    await expect(preview.locator('[data-added-image-id="retained-art"]')).toHaveCount(1);
    await page.screenshot({path:'/tmp/automenu-page-reduction-mobile.png'});
    await preview.getByRole('button',{name:'Aplicar esta opção'}).click();
    await expect(page.locator(`${canvas} [data-menu-print-page]`)).toHaveCount(2);
    await expect(page.locator(`${canvas} [data-added-image-id="retained-art"]`)).toHaveCount(1);
});

test('reduced fonts in products and categories share one plain-language tip',async({page})=>{
    await page.goto(fixture+'?photos=cards&cols=1&lanes=3&no-photos&tip-fonts');
    await page.getByRole('button',{name:'Abrir dicas do cardápio'}).click();
    const card=page.locator('[data-canvas-tips-menu] section').filter({has:page.getByRole('heading',{name:'Tamanhos dos textos',exact:true})});
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('O cardápio possui textos de mesmos tipos com tamanhos de fontes diferentes. Deseja padronizar?');
    await expect(card.getByRole('button',{name:'Padronizar tamanhos dos textos'})).toHaveCount(1);
    expect(await page.locator(`${canvas} [data-word-fit-reduced="true"]`).evaluateAll(els=>new Set(els.map(el=>(el as HTMLElement).dataset.wordFitScope)).size)).toBeGreaterThanOrEqual(2);
    await card.getByRole('button',{name:'Padronizar tamanhos dos textos'}).click();
    await settle(page);
});

test('apply all suggestions still offers a fresh page reduction preview after other adjustments',async({page})=>{
    await page.goto(fixture+'?reduce-pages&editable');
    await page.getByRole('button',{name:'Abrir dicas do cardápio'}).click();
    await expect(page.locator('[data-page-reduction-tip]')).toBeVisible({timeout:30000});
    await page.getByRole('button',{name:'Aplicar todas',exact:true}).click();
    const preview=page.getByRole('dialog',{name:'Prévia para reduzir páginas'});
    await expect(preview).toBeVisible({timeout:30000});
    await preview.getByRole('button',{name:'Aplicar esta opção'}).click();
    await expect(page.locator(`${canvas} [data-menu-print-page]`)).toHaveCount(1);
});
