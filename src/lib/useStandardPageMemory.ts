import {useTabPageSession,useTabState} from "./tabPageContext";
import {useCallback,useLayoutEffect,useRef} from 'react';
import type {StandardPageCache,StandardPageSession,StandardPageView,StandardScrollPosition} from '../types/standardPageSession';
import {openStandardPageSession,saveStandardPageSession} from './standardPageSession';
import {captureStandardScroll,restoreStandardScroll} from './standardPageScroll';
import {tableBodySelector} from './tableScroll';

function scheduleRestore(root:HTMLElement,position:StandardScrollPosition,done:()=>void){
  let frame=0;
  const virtual=!!root.querySelector('.ant-table-tbody-virtual-holder');
  const apply=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{restoreStandardScroll(root,position);if(virtual)apply()});};
  const observer=new ResizeObserver(apply);
  const body=root.querySelector<HTMLElement>(tableBodySelector);
  observer.observe(root);if(body)observer.observe(body);
  const events=['wheel','touchstart','pointerdown','keydown'];
  const stop=()=>{cancelAnimationFrame(frame);clearTimeout(timer);observer.disconnect();events.forEach(event=>root.removeEventListener(event,finish,true));};
  const finish=()=>{stop();done();};
  events.forEach(event=>root.addEventListener(event,finish,{capture:true,once:true}));
  restoreStandardScroll(root,position);apply();const timer=setTimeout(finish,250);
  return stop;
}

export function useStandardPageMemory(options:{scope:string;initial:StandardPageSession;initialCache:StandardPageCache|null;
  view:StandardPageView;entryKey:string;query:string;rows:unknown;loading:boolean;resume:boolean;}){
  const {scope,initial,initialCache,view,entryKey,query,rows,loading,resume}=options;
  const tab=useTabPageSession();
  const [savedCache,setSavedCache]=useTabState<StandardPageCache|null>("standard:cache",initialCache);
  const root=useRef<HTMLDivElement>(null),cache=useRef<StandardPageCache|null>(savedCache);
  const session=useRef(initial),latest=useRef({view,entryKey}),anchor=useRef(resume?initial.snapshot?.scroll?.anchorId||'':'');
  const pending=useRef<{position:StandardScrollPosition;query:string}|null>(resume&&initial.snapshot?.scroll&&initial.snapshot.cache?
    {position:initial.snapshot.scroll,query:initial.snapshot.cache.query}:null);
  const queueRestore=useCallback((position:StandardScrollPosition,forQuery:string)=>{pending.current={position,query:forQuery};},[]);
  useLayoutEffect(()=>{latest.current={view,entryKey};});
  useLayoutEffect(()=>{
    if(session.current.scope!==scope){session.current=openStandardPageSession(scope);cache.current=null;pending.current=null;anchor.current='';}
    const node=root.current;
    const clearAnchor=()=>{anchor.current='';};
    const events=['wheel','touchstart','pointerdown','keydown'];
    events.forEach(event=>node?.addEventListener(event,clearAnchor,{passive:true}));
    return ()=>{
      events.forEach(event=>node?.removeEventListener(event,clearAnchor));
      if(node&&!tab.managed)saveStandardPageSession(session.current,{...latest.current,cache:cache.current,
        scroll:pending.current?.position||captureStandardScroll(node,anchor.current)});
    };
  },[scope,root,cache,tab.managed]);
  const rememberRow=useCallback((id:string)=>{
    anchor.current=id;
    if(root.current&&!tab.managed)saveStandardPageSession(session.current,{...latest.current,cache:cache.current,scroll:captureStandardScroll(root.current,id)});
  },[root,cache,tab.managed]);
  useLayoutEffect(()=>{
    if(pending.current?.query!==query){pending.current=null;return;}
    if(loading||!root.current)return;
    return scheduleRestore(root.current,pending.current.position,()=>{pending.current=null;});
  },[rows,loading,query,root,scope]);
  const capturePosition=useCallback(()=>root.current?captureStandardScroll(root.current,anchor.current):null,[root]);
  const readCache=useCallback(()=>cache.current,[]);
  const writeCache=useCallback((next:StandardPageCache)=>{cache.current=next;setSavedCache(next);},[setSavedCache]);
  return {root,readCache,writeCache,rememberRow,queueRestore,capturePosition};
}
