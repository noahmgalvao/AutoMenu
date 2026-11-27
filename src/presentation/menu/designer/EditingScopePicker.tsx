import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {DisclosureChevron} from '../../common/DisclosureChevron';
import {PageOption} from '../../publishing/ExportPagePicker';

export function EditingScopePicker({label,scope,available,selected,choose,toggle}:{
 label:string;scope:'all'|'page'|'types';available:{id:string;label:string}[];selected:string[];
 choose:(value:'all'|'page')=>void;toggle:(id:string)=>void;
}){
 const [open,setOpen]=useState(false);const button=useRef<HTMLButtonElement>(null);const menu=useRef<HTMLDivElement>(null);
 const [position,setPosition]=useState({top:0,left:0});
 useEffect(()=>{
  if(!open)return;
  const place=()=>{const rect=button.current?.getBoundingClientRect();if(rect)setPosition({top:Math.min(rect.bottom+6,Math.max(8,window.innerHeight-350)),left:Math.max(8,Math.min(rect.right-216,window.innerWidth-224))});};place();
  const outside=(e:Event)=>{if(e.target instanceof Node&&!button.current?.contains(e.target)&&!menu.current?.contains(e.target))setOpen(false);};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);button.current?.focus();}};
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape);window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[open]);
 return <><button ref={button} type="button" aria-label={`Editando: ${label}`} aria-expanded={open} onClick={()=>setOpen(v=>!v)} className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-bold text-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500">Editando: {label}<DisclosureChevron open={open} size={12}/></button>
 {open&&createPortal(<div ref={menu} role="group" aria-label="Editar elementos" style={{position:'fixed',...position,width:216,zIndex:1500}} className="max-h-[min(340px,calc(100dvh-16px))] space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
  <PageOption label="Todos" checked={scope==='all'} onClick={()=>{choose('all');setOpen(false);}}/>
  <PageOption label="Página atual" checked={scope==='page'} onClick={()=>{choose('page');setOpen(false);}}/>
  <div className="my-1 border-t border-slate-100"/>
  {available.map(option=><PageOption key={option.id} label={option.label} checked={scope==='types'&&selected.includes(option.id)} onClick={()=>toggle(option.id)}/>)}
 </div>,document.body)}</>;
}
