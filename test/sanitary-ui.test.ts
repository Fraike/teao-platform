import assert from 'node:assert/strict';
import {test} from 'node:test';
import './standard-frontend-dom.ts';
import {act, createElement} from 'react';
import {StandardFormModal} from '../src/components/standard/StandardFormModal.tsx';
import {StandardImportModal} from '../src/components/standard/StandardImportModal.tsx';
import {useAuthStore} from '../src/lib/authStore.ts';
import {api} from '../src/lib/api.ts';
import type {StandardImportWorkerResponse} from '../src/types/standardImport.ts';
const {createRoot} = await import('react-dom/client');
const categories = [{key:'sanitary_damper',name:'智能卫浴',fields:[
 {key:'customer_model',label:'客户型号',group:'基本信息'},
 {key:'lid_torque',label:'盖·实际扭矩（kg，原表）',group:'盖标准'},
 {key:'seat_torque',label:'座垫·实际扭矩（kg，原表）',group:'座垫标准'},
]}];
test('sanitary editor keeps cover and seat fields separate in one form', async () => {
 const root = createRoot(document.getElementById('root')!);
 try {
  await act(async () => root.render(createElement(StandardFormModal,{open:true,categories,initial:null,defaultCategoryKey:'sanitary_damper',onClose(){},onSaved(){}})));
  assert.equal(document.querySelectorAll('section[aria-label="盖标准"] textarea').length,1);
  assert.equal(document.querySelectorAll('section[aria-label="座垫标准"] textarea').length,1);
  assert(document.querySelector('textarea[placeholder="客户型号"]'));
 } finally {await act(() => root.unmount());}
});
class WorkerDouble {
 static instances: WorkerDouble[] = [];
 onmessage?: (event:{data:StandardImportWorkerResponse})=>void;
 terminated=0; posted: unknown[]=[];
 constructor(){WorkerDouble.instances.push(this);}
 terminate(){this.terminated++;}
 postMessage(data:unknown){this.posted.push(data);}
}
test('switching import scope cancels old worker and blocks stale preview before selecting sanitary sheet',async()=>{
 const originalWorker=globalThis.Worker, originalPost=api.post, originalUser=useAuthStore.getState().user;
 globalThis.Worker=WorkerDouble as unknown as typeof Worker;
 useAuthStore.setState({user:{role:'admin'} as typeof originalUser});
 let requests=0;
 api.post=async <T>():Promise<T>=>{requests++;return {} as T;};
 const root=createRoot(document.getElementById('root')!);
 const choose=async()=>{
  const input=document.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file=new window.File(['bytes'],'standards.xls');
  Object.defineProperty(file,'arrayBuffer',{value:async()=>new ArrayBuffer(5)});
  Object.defineProperty(input,'files',{configurable:true,value:[file]});
  await act(async()=>{input.dispatchEvent(new window.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,10));});
  return WorkerDouble.instances.at(-1)!;
 };
 try{
  await act(async()=>root.render(createElement(StandardImportModal,{open:true,categories,onClose(){},onImported(){}})));
  const old=await choose();
  await act(()=>document.querySelector<HTMLInputElement>('input[value="sanitary"]')!.click());
  assert.equal(old.terminated,1);
  await act(()=>old.onmessage!({data:{ok:true,data:{records:[],errors:[],warnings:[],fileHash:'hash',source:{sheetName:'main',range:'A1',rowCount:1,columnCount:1}}}}));
  assert.equal(requests,0);
  const next=await choose();
  assert.equal((next.posted[0] as {scope:string}).scope,'sanitary');
 }finally{
  await act(()=>root.unmount());globalThis.Worker=originalWorker;api.post=originalPost;useAuthStore.setState({user:originalUser});
 }
});
