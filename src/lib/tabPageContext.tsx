/* eslint-disable react-hooks/refs, react-hooks/immutability -- Refs track latest async callbacks; cache records are intentionally mutable external state. */
import {createContext,useCallback,useContext,useEffect,useId,useRef,useState} from 'react';
import type {Dispatch,SetStateAction,DependencyList} from 'react';
import {Form} from 'antd';
import type {FormInstance} from 'antd';
import type {TabPageContextValue,TabPageAdapterOptions,TabInitialEffectOptions} from '../types/tabPage';
import {notifyTabPages,writeTabSnapshot} from './tabPageCache';
export const TabPageContext=createContext<TabPageContextValue|null>(null);
export const TabPageActiveContext=createContext<boolean|null>(null);
export function useTabPageSession(){
 const context=useContext(TabPageContext);
 return {managed:!!context,restored:context?.restored??false,key:context?.record.key??'',container:context?.container??null};
}
export function useTabPage(){
 const session=useTabPageSession();const context=useContext(TabPageContext);const active=useContext(TabPageActiveContext)??context?.active??true;
 return {...session,active};
}
export function useTabState<T>(key:string,initial:T|(()=>T)):[T,Dispatch<SetStateAction<T>>]{
 const context=useContext(TabPageContext);const record=context?.record;const instance=context?.instance;
 const [value,setValue]=useState<T>(()=>record?.snapshot.has(key)?record.snapshot.get(key) as T:typeof initial==='function'?(initial as ()=>T)():initial);
 const current=useRef(value);current.current=value;
 const update:Dispatch<SetStateAction<T>>=useCallback(next=>{
  const result=typeof next==='function'?(next as (previous:T)=>T)(current.current):next;
  current.current=result;if(record)writeTabSnapshot(record,key,result,instance);setValue(result);
 },[record,key,instance]);
 // Write defaults too so eviction before the first edit still has a complete snapshot.
 useEffect(()=>{if(record)writeTabSnapshot(record,key,current.current,instance)},[record,key,instance]);
 return [value,update];
}
export function useTabPageAdapter(ready=true,options?:TabPageAdapterOptions){
 const context=useContext(TabPageContext);const record=context?.record;const instance=context?.instance;
 // Declaration alone schedules nothing. A readiness transition also applies to
 // hidden Activity trees whose effects are disconnected.
 if(record?.alive&&record.instance===instance){
  record.adapterDeclared=true;
  const effectMode=options?.effectMode??'activity';
  if(record.adapted!==ready||record.effectMode!==effectMode){
   record.adapted=ready;record.effectMode=effectMode;
   queueMicrotask(()=>{if(record.alive&&record.instance===instance)notifyTabPages()});
  }
 }
}
function useTabFlag(kind:'busy'|'dirty',value:boolean){
 const context=useContext(TabPageContext);const id=useId();
 const record=context?.record;const instance=context?.instance;
 // Hidden Activity trees still render state updates, but disconnect effects. Keep guards
 // current during an async save without waiting for the page to become visible.
 if(record?.alive&&record.instance===instance&&record[kind].has(id)&&record[kind].get(id)!==value){
  record[kind].set(id,value);queueMicrotask(notifyTabPages);
 }
 useEffect(()=>{
  if(!record?.alive||record.instance!==instance)return;
  const previous=record[kind].get(id);record[kind].set(id,value);
  if(previous!==value&&(value||previous===true))notifyTabPages();
  return ()=>{if(record.instance===instance&&record.active){const previous=record[kind].get(id);record[kind].delete(id);if(previous)notifyTabPages()}};
 },[record,instance,id,kind,value]);
}
export function useTabBusy(busy:boolean){useTabFlag('busy',busy)}
export function useTabDirty(dirty:boolean){useTabFlag('dirty',dirty)}
export function useTabDispose(callback:()=>void,key?:string){
 const record=useContext(TabPageContext)?.record;const ref=useRef(callback);ref.current=callback;
 const stable=useCallback(()=>ref.current(),[]);const slot=useId();
 useEffect(()=>{if(!record)return stable;record.disposers.set(key??slot,stable);
 // Activity disconnects effects while hidden. Retain disposer until record disposal.
 },[record,stable,key,slot]);
}
const equalDeps=(a:readonly unknown[],b:readonly unknown[])=>a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
export function useTabInitialEffect(key:string,effect:()=>void|(()=>void),deps:DependencyList,ready:boolean,options?:TabInitialEffectOptions){
 const context=useContext(TabPageContext);const effectRef=useRef(effect);effectRef.current=effect;
 const record=context?.record;const instance=context?.instance??record?.instance;
 const started=useRef<{record:typeof record;instance:typeof instance;key:string;deps:readonly unknown[];pendingObserved:boolean}|null>(null);
 const currentInstance=()=>!!record?.alive&&record.instance===instance;
 const markReady=()=>{if(ready&&currentInstance())record!.initialized.set(key,[...deps])};
 // Activity disconnects effects while hidden, but still renders async state updates.
 // Only a previously started run may complete here: eager ready=true callers must
 // execute their first initialization, including when semantic dependencies change.
 const run=started.current;
 if(run&&run.record===record&&run.instance===instance&&run.key===key&&equalDeps(run.deps,deps)){
  if(!ready)run.pendingObserved=true;
  if(run.pendingObserved)markReady();
 }
 useEffect(()=>{
  if(record&&!currentInstance())return;
  const previous=record?.initialized.get(key);
  if(previous&&equalDeps(previous,deps))return;
  // Leaving a completed query retires its marker even if the next run is a no-op.
  record?.initialized.delete(key);
  // A changed query may still expose the preceding result until its effect
  // clears it (possibly in a microtask). Require fresh pending -> ready evidence.
  // Only the first eager run may treat its initial true as completion.
  const firstRun=!started.current&&!previous;
  started.current={record,instance,key,deps:[...deps],pendingObserved:!ready};
  const cleanup=effectRef.current();
  if(firstRun||options?.synchronous)markReady();
  return cleanup;
 // Callers supply the full semantic dependency list. Readiness is recorded on
 // render without restarting the initialization effect on a ready transition.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[record,instance,key,...deps]);
}
export function useTabForm<T extends object>(form:FormInstance<T>,key:string,options?:{dirty?:boolean}){
 const context=useContext(TabPageContext);const record=context?.record;const instance=context?.instance;const stateKey=`form:${key}`;
 const restored=useRef(false);
 const values=Form.useWatch([], {form,preserve:true});
 useEffect(()=>{
  if(!record||restored.current)return;restored.current=true;
  if(record.snapshot.has(stateKey))form.setFieldsValue(record.snapshot.get(stateKey) as Parameters<typeof form.setFieldsValue>[0]);
 },[record,form,stateKey]);
 useEffect(()=>{if(record&&restored.current)writeTabSnapshot(record,stateKey,form.getFieldsValue(true),instance)},[record,stateKey,form,values,instance]);
 useTabDirty(options?.dirty??false);
 return {restored:!!record?.snapshot.has(stateKey)};
}
