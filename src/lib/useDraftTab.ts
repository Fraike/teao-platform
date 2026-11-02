import {useLayoutEffect,useRef} from 'react';
import {Modal} from 'antd';
import {useLocation,useNavigate} from 'react-router-dom';
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
 const dirty=JSON.stringify(draft)!==baseline;
 useTabPageAdapter();useTabBusy(busy);useTabDirty(dirty);
 const markSaved=(value:T)=>setBaseline(JSON.stringify(value));
 const run=async(task:()=>Promise<void>)=>{
  if(inFlight.current)return;inFlight.current=true;setBusy(true);
  try{await task()}finally{inFlight.current=false;setBusy(false)}
 };
 return {tab,busy,dirty,run,markSaved,isBusy:()=>inFlight.current};
}

export function useQuotationDraftTab(quotation:Quotation,queryId:string|null,copyId:string|null,market:ManagedQuotation['market'],replace:(quotation:Quotation)=>void,onError:(error:string)=>void){
 const draft=useDraftTab(quotation);
 const [editingId,setEditingId]=useTabState<string|null>('draft:editingId',null);
 const [loadedQuery,setLoadedQuery]=useTabState<string|null>('draft:loadedQuery',null);
 const [loadedMarket,setLoadedMarket]=useTabState<ManagedQuotation['market']|null>('draft:loadedMarket',null);
 const location=useLocation();const navigate=useNavigate();
 const url=location.pathname+location.search+location.hash;
 const [acceptedUrl,setAcceptedUrl]=useTabState('draft:acceptedUrl',url);
 const latest=useRef({quotation,dirty:draft.dirty,busy:draft.busy});
 useLayoutEffect(()=>{latest.current={quotation,dirty:draft.dirty,busy:draft.busy}},[quotation,draft.dirty,draft.busy]);
 const query=queryId?`${queryId}:${copyId??''}`:null;
 useTabInitialEffect('draft:load',()=>{
  if(!queryId){
   setAcceptedUrl(url);setLoadedQuery(null);setLoadedMarket(null);setEditingId(null);
   return;
  }
  if(loadedQuery===query&&loadedMarket===market)return;
  const controller=new AbortController();let active=true;
  let confirmation:ReturnType<typeof Modal.confirm>|undefined;
  const restore=()=>navigate(acceptedUrl,{replace:true});
  const load=async()=>{
   if(latest.current.busy||draft.isBusy()){restore();return;}
   const before=JSON.stringify(latest.current.quotation);
   try{
    const result=await api.get<{ok:true;data:ManagedQuotation}>(`/api/quotations/${encodeURIComponent(queryId)}`,{signal:controller.signal});
    if(!active)return;
    if(latest.current.busy||draft.isBusy()||JSON.stringify(latest.current.quotation)!==before){restore();return;}
    if(result.data.market!==market)throw new Error('报价类型不匹配 / Quotation market mismatch');
    const value=copyId?prepareQuotationCopy(result.data.quotation):result.data.quotation;
    replace(value);setEditingId(copyId?null:result.data.id);draft.markSaved(value);setLoadedQuery(query);setLoadedMarket(market);setAcceptedUrl(url);
   }catch(error:unknown){if(active){restore();onError(error instanceof Error?error.message:'报价读取失败')}}
  };
  if(latest.current.busy||draft.isBusy())restore();
  else if(latest.current.dirty)confirmation=Modal.confirm({
   title:'放弃未保存的报价更改？',content:'打开其他报价将替换当前草稿。',okText:'放弃并打开',cancelText:'取消',
   onOk:()=>load(),onCancel:restore,getContainer:()=>draft.tab.container??document.body,
  });
  else void load();
  return ()=>{active=false;controller.abort();confirmation?.destroy()};
 },[query,market],!queryId||(loadedQuery===query&&loadedMarket===market));
 const saved=(id:string,value:Quotation)=>{setEditingId(id);setLoadedQuery(`${id}:`);setLoadedMarket(market);setAcceptedUrl(location.pathname+`?id=${encodeURIComponent(id)}`);draft.markSaved(value)};
 return {...draft,editingId,setEditingId,saved};
}
