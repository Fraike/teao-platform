import {useRef} from 'react';
import {api} from './api';
import {prepareQuotationCopy} from './store';
import type {ManagedQuotation,Quotation} from '../types/quotation';
import {useTabState,useTabPage,useTabPageAdapter,useTabInitialEffect,useTabBusy,useTabDirty} from './tabPageContext';

/** Draft persistence belongs to the business store; only UI/session metadata lives here. */
export function useDraftTab<T>(draft:T){
 const tab=useTabPage();
 const [baseline,setBaseline]=useTabState('draft:baseline',()=>JSON.stringify(draft));
 const [busy,setBusy]=useTabState('draft:busy',false);
 const inFlight=useRef(false);
 useTabPageAdapter();useTabBusy(busy);useTabDirty(JSON.stringify(draft)!==baseline);
 const markSaved=(value:T)=>setBaseline(JSON.stringify(value));
 const run=async(task:()=>Promise<void>)=>{
  if(inFlight.current)return;inFlight.current=true;setBusy(true);
  try{await task()}finally{inFlight.current=false;setBusy(false)}
 };
 return {tab,busy,run,markSaved};
}

export function useQuotationDraftTab(quotation:Quotation,queryId:string|null,copyId:string|null,market:ManagedQuotation['market'],replace:(quotation:Quotation)=>void,onError:(error:string)=>void){
 const draft=useDraftTab(quotation);
 const [editingId,setEditingId]=useTabState<string|null>('draft:editingId',null);
 const [loadedQuery,setLoadedQuery]=useTabState<string|null>('draft:loadedQuery',null);
 const [loadedMarket,setLoadedMarket]=useTabState<ManagedQuotation['market']|null>('draft:loadedMarket',null);
 const query=queryId?`${queryId}:${copyId??''}`:null;
 useTabInitialEffect('draft:load',()=>{
  if(!queryId || (loadedQuery===query&&loadedMarket===market))return;
  let active=true;
  void api.get<{ok:true;data:ManagedQuotation}>(`/api/quotations/${encodeURIComponent(queryId)}`).then(result=>{
   if(!active)return;
   if(result.data.market!==market)throw new Error('报价类型不匹配 / Quotation market mismatch');
   const value=copyId?prepareQuotationCopy(result.data.quotation):result.data.quotation;
   replace(value);setEditingId(copyId?null:result.data.id);draft.markSaved(value);setLoadedQuery(query);setLoadedMarket(market);
  }).catch((error:unknown)=>{if(active)onError(error instanceof Error?error.message:'报价读取失败')});
  return ()=>{active=false};
 },[query,market],loadedQuery===query&&loadedMarket===market);
 const saved=(id:string,value:Quotation)=>{setEditingId(id);setLoadedQuery(`${id}:`);setLoadedMarket(market);draft.markSaved(value)};
 return {...draft,editingId,setEditingId,saved};
}
