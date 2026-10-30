import {useEffect,useSyncExternalStore} from 'react';
import {api} from './api';
import {useTabPageSession,useTabState,useTabInitialEffect} from './tabPageContext';
import {useAuthStore} from './authStore';
import type {ProductDrawingStatus,ProductDrawingStatusRequest} from '../types/product';
const listeners=new Set<()=>void>();
let statuses:Record<string,boolean>={};
const pending=new Map<string,Promise<Record<string,boolean>>>();
let scope='';
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}};
export function useStandardDrawingBadge(id:string){
 return useSyncExternalStore(subscribe,()=>statuses[id],()=>undefined);
}
export function useStandardDrawingStatus(items:ProductDrawingStatusRequest[], revision="") {
 const tab=useTabPageSession();const user=useAuthStore(state=>state.user);
 const authScope=`${user?.id}:${user?.role}:${user?.permissions?.join(',')}`;
 const requestItems=JSON.stringify(items);
 const key=JSON.stringify([items,revision,authScope]);
 const [completedQuery,setCompletedQuery]=useTabState<string|null>('standard:drawings:completion',null);
 const [snapshot,setSnapshot]=useTabState<{key:string;data:Record<string,boolean>}|null>('standard:drawings',null);
 useEffect(()=>{if(scope!==authScope){scope=authScope;statuses={};pending.clear()}
  if(snapshot?.key===key){statuses={...statuses,...snapshot.data};listeners.forEach(listener=>listener())}
 },[authScope,key,snapshot]);
 useTabInitialEffect('standard:drawings',()=>{
  setCompletedQuery(null);
  let cancelled=false;
  const load=async()=>{
   const requestKey=`${authScope}:${requestItems}`;
   let request=pending.get(requestKey);
   if(!request){request=(async()=>{
    const next:Record<string,boolean>={};const requests=JSON.parse(requestItems) as ProductDrawingStatusRequest[];
    for(let i=0;i<requests.length;i+=150){const result=await api.post<{data:ProductDrawingStatus[]}>('/api/products/drawing-status',{items:requests.slice(i,i+150)});for(const row of result.data)next[`${row.standardId}:${row.number}`]=row.hasDrawing}
    return next;
   })();pending.set(requestKey,request);void request.finally(()=>pending.delete(requestKey)).catch(()=>{})}
   try{const next=await request;if(!cancelled){setSnapshot({key,data:next});setCompletedQuery(key)}}catch{/* Keep the last successful statuses. */}
  };
  if(snapshot?.key!==key)void load();else setCompletedQuery(key);
  const refresh=()=>{if(document.visibilityState==='visible')void load()};
  if(!tab.managed){const timer=window.setInterval(refresh,60000);window.addEventListener('focus',refresh);return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('focus',refresh)}}
  return()=>{cancelled=true};
 },[key,authScope],completedQuery===key);
 return snapshot?.key===key?snapshot.data:{};
}
