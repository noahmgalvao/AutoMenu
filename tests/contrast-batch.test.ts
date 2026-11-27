import {createCanvasShape} from '../src/domain/menu/canvasShapes';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {INITIAL_STYLE} from '../src/domain/menu/defaults';
import {getItemFormattingStyle} from '../src/domain/menu/itemFormatting';
import {applyContrastTips,type ContrastTip} from '../src/presentation/menu/canvas/canvasTextTips';
import type {MenuStyle,Product} from '../src/domain/menu/model';
const products:Product[]=[{id:'a',category:'A',name:'Prato A',description:'Descrição',price:10},{id:'b',category:'B',name:'Prato B',description:'Descrição',price:20}];
const style:MenuStyle={
 ...INITIAL_STYLE,
 itemFormattingOverrides:{product:{a:{elementStyles:{
  productName:{color:'#eeeeee'},productDescription:{color:'#eeeeee'},productPrice:{color:'#eeeeee'},
 }}}},
 textContrastFills:{productName:'#ffffff'},
};
const tips:ContrastTip[]=(['category','productName','productDescription','productPrice'] as const).map(scope=>({
 key:`${scope}:${scope==='category'?'A':'a'}`,scope,id:scope==='category'?'A':'a',category:'A',pageIndex:0,label:'Texto',color:'#222222',fill:'#000000',
 surface:{key:'categoryGroup:A',kind:'categoryGroup',id:'A',fill:'#000000',texts:[{scope,id:scope==='category'?'A':'a',pageIndex:0,category:'A',color:[238,238,238],opacity:1,minimum:4.5}]},
}));
test('color choice updates every affected object including local overrides in one immutable state',()=>{
 const before=JSON.stringify({style,products});const next=applyContrastTips(style,products,tips,'color');
 for(const field of ['productName','productDescription','productPrice'] as const)assert.equal(getItemFormattingStyle(next.style,'product','a').elementStyles[field].color,'#222222');
 assert.equal(getItemFormattingStyle(next.style,'category','A').elementStyles.category.color,'#222222');
 assert.equal(getItemFormattingStyle(next.style,'product','b').elementStyles.productName.color,INITIAL_STYLE.elementStyles.productName.color);
 assert.equal(next.style.textContrastFills,undefined);assert.equal(next.style.fills,style.fills);
 assert.equal(JSON.stringify({style,products}),before);
});
test('category titles and every part of a product use the same editable category-group fill and border',()=>{
 for(const tip of tips){const next=applyContrastTips(style,products,[tip],'fill');
  const group=getItemFormattingStyle(next.style,'category','A');assert.equal(group.fills?.categoryGroup,'#000000');assert.deepEqual(group.borders?.categoryGroup?.sides,['top','right','bottom','left']);
  assert.equal(getItemFormattingStyle(next.style,'category','B').fills?.categoryGroup,undefined);
  assert.equal(next.style.textContrastFills,undefined);assert.equal(next.style.freeTextFills,undefined);
  const product=getItemFormattingStyle(next.style,'product','a');assert.equal(product.cardBackgroundColor,'transparent');assert.equal(product.fills?.price,'transparent');
 }
});
test('free text uses its editable fill/border and header colors respect repeated page overrides',()=>{
 const note:Product={...products[0],id:'note',isFreeText:true,styles:{color:'#eeeeee'}};
 const free:ContrastTip={key:'freeText:note',scope:'freeText',id:'note',label:'Texto',color:'#222222',fill:'#000000',surface:{key:'freeText:note',kind:'freeText',id:'note',fill:'#000000',texts:[]}};
 const next=applyContrastTips(style,[...products,note],[free],'fill');assert.equal(next.style.freeTextFills?.note,'#000000');assert.equal(next.style.freeTextBorders?.note.thickness,1);
 const headings=applyContrastTips(style,products,[0,1].map(pageIndex=>({key:`title:${pageIndex}`,scope:'menuTitle',id:'menuTitle',label:'Título',color:'#222222',fill:'#000000',pageIndex})),'color');
 assert.equal(headings.style.headingStyleOverrides?.[0]?.menuTitle?.color,'#222222');assert.equal(headings.style.headingStyleOverrides?.[1]?.menuTitle?.color,'#222222');
});

test('shape text uses the full shape fill and never a hidden text background',()=>{
 const shape={...createCanvasShape('rectangle','#ffffff'),text:'Texto',textBackground:'#eeeeee'};
 const state={...style,addedImages:[{id:'shape',url:'',shape,x:0,y:0,width:100,pageIndex:0}]};
 const tip:ContrastTip={key:'shape:shape',scope:'shape',id:'shape',label:'Texto',color:'#222222',fill:'#000000',surface:{key:'shape:shape',kind:'shape',id:'shape',fill:'#000000',texts:[]}};
 const next=applyContrastTips(state,products,[tip],'fill');assert.equal(next.style.addedImages?.[0].shape?.fill,'#000000');assert.equal(next.style.addedImages?.[0].shape?.textBackground,undefined);
});
test('a native fill fallback handles the complete group before colors are changed',()=>{
 const next=applyContrastTips(style,products,[tips[1],{...tips[3],color:null}],'color');
 assert.equal(getItemFormattingStyle(next.style,'category','A').fills?.categoryGroup,'#000000');
 assert.equal(getItemFormattingStyle(next.style,'product','a').elementStyles.productName.color,'#eeeeee');
 assert.equal(next.style.textContrastFills,undefined);
 const unchanged=applyContrastTips(style,products,[],'color');assert.equal(unchanged.style,style);
});
