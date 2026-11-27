import {measureWordFitElement, triggerLimitFeedback} from '../canvas/textFit';
import {applyFontToMenuStyle} from '../../../domain/menu/fontPropagation';
import {useEffect,useState} from 'react';
import type {ElementStyle,MenuStyle,Product} from '../../../domain/menu/model';
import {getItemFormattingStyle,updateItemFormatting} from '../../../domain/menu/itemFormatting';
import {StyleControls} from './StyleControls';
import {StyleSection} from './SidebarSections';
const labels={menuTitle:'Título',menuSubtitle:'Subtítulo',category:'Categorias',productName:'Produtos',productPrice:'Preço',productDescription:'Descrição',freeText:'Texto'};
type Field=keyof typeof labels;
type Target={elementId:string;base:number;field:Field;id:string;page:number;value:ElementStyle;size:number};
export function BatchTextControls({style,products,page,commit}:{style:MenuStyle;products:Product[];page:number;commit:(products:Product[],style:MenuStyle)=>void}) {
 const [scope,setScope]=useState<'all'|'page'|'types'>('all');
 const [types,setTypes]=useState<Field[]>([]);
 const [targets,setTargets]=useState<Target[]>([]);
 useEffect(()=>{
  let frame=0;
  const read=()=>{
   const root=document.querySelector('[data-automenu-editor-canvas]');if(!root)return;
   const next:Target[]=[];const seen=new Set<string>();
   root.querySelectorAll<HTMLElement>('[data-word-fit-scope], [data-price-base-size]').forEach(el=>{
    if(el.closest('[data-canvas-background-layer]')||el.hasAttribute('data-subtitle-placeholder'))return;
    const field=(el.hasAttribute('data-price-base-size')?'productPrice':el.dataset.wordFitScope) as Field;
    if(!(field in labels))return;
    const pageEl=el.closest<HTMLElement>('[data-menu-print-page]');const index=Number(pageEl?.dataset.pageIndex||0);
    const id=field==='category'?el.closest<HTMLElement>('[data-category-chunk]')?.dataset.categoryChunk:el.closest<HTMLElement>('[data-drag-id]')?.dataset.dragId;
    const key=`${field}:${id||''}:${index}`;if(seen.has(key))return;seen.add(key);
    const product=products.find(p=>p.id===id);
    if(field==='freeText'&&(!product||style.freeTextBackgrounds?.[product.id]))return;
    const effective=field==='category'?getItemFormattingStyle(style,'category',id||''):getItemFormattingStyle(style,'product',id||'');
    const value=field==='freeText'?product?.styles||{}:field==='menuTitle'||field==='menuSubtitle'?{...style.elementStyles[field],...style.headingStyleOverrides?.[index]?.[field]}:effective.elementStyles[field];
    const css=getComputedStyle(el);next.push({elementId:el.id,base:Number(el.dataset.wordFitBaseSize||el.dataset.priceBaseSize)||parseFloat(css.fontSize),field,id:id||field,page:index,value:{...value,fontFamily:value?.fontFamily||style.fontFamily},size:Math.round(parseFloat(css.fontSize)*10)/10});
   });
   setTargets(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
  };
  read();const root=document.querySelector('[data-automenu-editor-canvas]');
  const observer=new MutationObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(read);});
  if(root)observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['style','data-word-fit-size']});
  return()=>{observer.disconnect();cancelAnimationFrame(frame);};
 },[style,products]);
 const available=(Object.keys(labels) as Field[]).filter(field=>targets.some(t=>t.field===field));
 const selected=targets.filter(t=>scope==='all'||scope==='page'&&t.page===page||scope==='types'&&types.includes(t.field));
 const common=(key:keyof ElementStyle)=>selected.length&&selected.every(t=>t.value[key]===selected[0].value[key])?selected[0].value[key]:undefined;
 const equalSize=selected.length>0&&selected.every(t=>t.size===selected[0].size);
 const value:ElementStyle={fontFamily:common('fontFamily') as string||'Múltiplas',fontSize:equalSize?selected[0].size:undefined,color:common('color') as string,textAlign:common('textAlign') as ElementStyle['textAlign'],fontWeight:common('fontWeight') as ElementStyle['fontWeight'],italic:common('italic') as boolean,underline:common('underline') as boolean};
 const change=(patch:ElementStyle,delta?:number, patches?:Partial<Record<Field,ElementStyle>>)=>{
  if(selected.some(target=>{
   const size=delta!==undefined?target.size+delta:patch.fontSize;
   if(size===undefined||size<=target.size+.05)return false;
   const el=document.getElementById(target.elementId);
   return target.size<target.base-.05 || Boolean(el?.hasAttribute('data-word-fit') && measureWordFitElement(el,{baseFontSize:size}).fontSize<size-.05);
  })){triggerLimitFeedback(document.querySelector<HTMLElement>('[data-batch-text-controls]'));return false;}
  let next=style;let items=products;
  const changed=Object.fromEntries(Object.entries(patch).filter(([key,v])=>v!==value[key as keyof ElementStyle]));
  for(const target of selected){
   const update={...changed,...patches?.[target.field],...(delta!==undefined?{fontSize:Math.max(13,target.size+delta)}:{})};
   if(target.field==='freeText'){items=items.map(p=>p.id===target.id?{...p,styles:{...p.styles,...update}}:p);continue;}
   if(target.field==='menuTitle'||target.field==='menuSubtitle'){
    if(scope==='page')next={...next,headingStyleOverrides:{...next.headingStyleOverrides,[page]:{...next.headingStyleOverrides?.[page],[target.field]:{...target.value,...update}}}};
    else {next={...next,elementStyles:{...next.elementStyles,[target.field]:{...next.elementStyles[target.field],...update}},headingStyleOverrides:Object.fromEntries(Object.entries(next.headingStyleOverrides||{}).map(([p,fields])=>[p,{...fields,[target.field]:{...fields[target.field as 'menuTitle'|'menuSubtitle'],...update}}]))};}continue;
   }
   const field=target.field;const kind=field==='category'?'category':'product';
   next=updateItemFormatting(next,kind,target.id,[target.id],'selection',[target.id],current=>({...current,elementStyles:{...current.elementStyles,[field]:{...current.elementStyles[field],...update}}}));
  }
  if(scope==='all' && typeof changed.fontFamily==='string') next=applyFontToMenuStyle(next,changed.fontFamily);
  commit(items,{...next,name:'Custom'});
 };
 return <div className="space-y-3" data-batch-text-controls>
  <details className="relative" data-edit-scope><summary className="ml-auto w-fit cursor-pointer rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">Editando: {scope==='all'?'Todos':scope==='page'?'Página atual':types.map(t=>labels[t]).join(', ')||'Seleção'}</summary>
   <div className="absolute right-0 z-30 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
    {(['all','page'] as const).map(s=><button type="button" key={s} className="block w-full rounded-lg p-2 text-left text-sm hover:bg-indigo-50" onClick={e=>{setScope(s);setTypes([]);e.currentTarget.closest('details')?.removeAttribute('open');}}>{s==='all'?'Todos':'Página atual'}</button>)}
    <div className="my-1 border-t border-slate-100"/>{available.map(field=><label key={field} className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-slate-50"><input type="checkbox" checked={scope==='types'&&types.includes(field)} onChange={()=>{setScope('types');setTypes(old=>scope!=='types'?[field]:old.includes(field)?old.filter(f=>f!==field):[...old,field]);}}/>{labels[field]}</label>)}
   </div>
  </details>
  <StyleControls label="Tamanho da fonte" value={value} onChange={change} minFontSize={13} disabled={!selected.length} mixedFontSize={!equalSize} onFontStep={delta=>change({},delta)} hideColor={scope!=='types'} />
  {scope!=='types'&&<StyleSection style={style} setStyle={update=>{const next=typeof update==='function'?update(style):update; if(scope==='all')commit(products,next);else if(next.backgroundColor!==style.backgroundColor)commit(products,{...style,pageBackgroundColors:{...style.pageBackgroundColors,[page]:next.backgroundColor}});else change({},undefined,Object.fromEntries(Object.entries(next.elementStyles).map(([field,value])=>[field,{color:value?.color}])));}} hideFont />}
 </div>;
}
