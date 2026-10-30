import {useLayoutEffect,useRef} from 'react';
import type {RefObject} from 'react';
import type {TabPageRecord} from '../types/tabPage';
import type {TabDomScrollSnapshot} from '../types/tabDomScroll';
import {writeTabSnapshot} from './tabPageCache';
const stateKey='ui:inner-scroll';
function elementPath(root:HTMLElement,target:HTMLElement){
 const path:number[]=[];let element:HTMLElement|null=target;
 while(element&&element!==root){const parent:HTMLElement|null=element.parentElement;if(!parent)return null;path.unshift([...parent.children].indexOf(element));element=parent;}
 return element===root?path:null;
}
function restore(root:HTMLElement,positions:TabDomScrollSnapshot){
 for(const position of Object.values(positions)){
  let element:Element|undefined=root;
  for(const index of position.path)element=element?.children[index];
  if(element instanceof HTMLElement&&element.tagName===position.tag&&!element.closest('[data-scroll-managed="true"]')){
   if(element.scrollTop!==position.top)element.scrollTop=position.top;
   if(element.scrollLeft!==position.left)element.scrollLeft=position.left;
  }
 }
}
export function useTabDomScroll(record:TabPageRecord,instance:number,active:boolean,container:RefObject<HTMLDivElement|null>){
 const restoredInstance=useRef<number|null>(null);
 useLayoutEffect(()=>{
  const root=container.current;if(!active||!root)return;
  const needsRestore=record.effectMode!=='managed'||restoredInstance.current!==instance;
  restoredInstance.current=instance;
  let restoring=needsRestore,frame=0;
  const read=()=>record.snapshot.get(stateKey) as TabDomScrollSnapshot|undefined;
  const apply=()=>{const saved=read();if(saved)restore(root,saved);};
  const capture=(event:Event)=>{
   if(restoring||!(event.target instanceof HTMLElement)||event.target.closest('[data-scroll-managed="true"]'))return;
   const path=elementPath(root,event.target);if(!path)return;
   writeTabSnapshot(record,stateKey,{...read(),[path.join('.')]:{path,tag:event.target.tagName,top:event.target.scrollTop,left:event.target.scrollLeft}},instance);
  };
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(apply);};
  const observer=new ResizeObserver(schedule);if(needsRestore)observer.observe(root);
  const stop=()=>{restoring=false;observer.disconnect();cancelAnimationFrame(frame);};
  const events=['wheel','touchstart','pointerdown','keydown'];
  events.forEach(event=>root.addEventListener(event,stop,{capture:true,once:true}));
  root.addEventListener('scroll',capture,true);if(needsRestore){apply();schedule();}const timer=setTimeout(stop,250);
  return ()=>{clearTimeout(timer);stop();root.removeEventListener('scroll',capture,true);events.forEach(event=>root.removeEventListener(event,stop,true));};
 },[record,instance,active,container]);
}
