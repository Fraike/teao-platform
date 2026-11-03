import {useLayoutEffect,useRef,useState} from 'react';
import styles from '../components/ProductPdfFullscreen.module.css';

/** Keep the portal target stable so moving to the viewport never remounts its canvas. */
export function usePdfViewport(active:boolean,helpOpen:boolean){
 const [requested,setRequested]=useState(false);
 const [mount]=useState(()=>document.createElement('div'));
 const host=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null);
 const current=useRef({active,helpOpen});
 useLayoutEffect(()=>{current.current={active,helpOpen}},[active,helpOpen]);
 const fullscreen=active&&requested;
 useLayoutEffect(()=>{
  const destination=fullscreen?document.body:host.current;
  mount.classList.toggle(styles.overlay,fullscreen);
  destination?.appendChild(mount);
  return ()=>mount.remove();
 },[mount,fullscreen]);
 useLayoutEffect(()=>{
  if(!fullscreen)return;
  const background=[...document.body.children].filter(element=>element!==mount);
  const inert=background.map(element=>({element,previous:element.hasAttribute('inert')}));
  const alreadyLocked=document.body.classList.contains(styles.scrollLocked);
  background.forEach(element=>element.setAttribute('inert',''));
  document.body.classList.add(styles.scrollLocked);
  const trigger=button.current;
  trigger?.focus();
  const escape=(event:KeyboardEvent)=>{
   if(event.key!=='Escape'||current.current.helpOpen)return;
   event.preventDefault();event.stopPropagation();setRequested(false);
  };
  document.addEventListener('keydown',escape,true);
  return ()=>{
   document.removeEventListener('keydown',escape,true);
   inert.forEach(({element,previous})=>element.toggleAttribute('inert',previous));
   if(!alreadyLocked)document.body.classList.remove(styles.scrollLocked);
   setRequested(false);
   queueMicrotask(()=>{if(current.current.active&&trigger?.isConnected)trigger.focus();});
  };
 },[fullscreen,mount]);
 return {fullscreen,mount,host,button,toggle:()=>setRequested(value=>!value)};
}
