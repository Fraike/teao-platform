import assert from 'node:assert/strict';
import {test} from 'node:test';
import './standard-frontend-dom.ts';
import {act,createElement,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,useNavigate,useLocation} from 'react-router-dom';
import {Modal} from 'antd';
import {useQuotationDraftTab} from '../src/lib/useDraftTab.ts';
import {useQuotationStore} from '../src/lib/store.ts';
import {api} from '../src/lib/api.ts';

test('dirty quotation cancellation restores URL, busy blocks switching and late loads preserve edits',async()=>{
 const root=createRoot(document.getElementById('root')!);
 const originalGet=api.get,originalConfirm=Modal.confirm;
 let navigate:ReturnType<typeof useNavigate>,edit:(name:string)=>void,url='',run:ReturnType<typeof useQuotationDraftTab>['run'];
 let confirmOptions:Parameters<typeof Modal.confirm>[0]|undefined;
 let resolveLoad:((value:unknown)=>void)|undefined;let calls=0;
 const source=structuredClone(useQuotationStore.getState().quotation);
 api.get=(async()=>{calls++;if(calls===1)return {data:{id:'A',market:'domestic',quotation:source}};return new Promise(resolve=>{resolveLoad=resolve})}) as typeof api.get;
 Modal.confirm=((options)=>{confirmOptions=options;return {destroy(){},update(){}}}) as typeof Modal.confirm;
 function Harness(){
  const [value,setValue]=useState(source);navigate=useNavigate();url=useLocation().search;
  edit=name=>setValue(q=>({...q,customer:{...q.customer,name}}));
  const params=new URLSearchParams(url);
  const draft=useQuotationDraftTab(value,params.get('id'),null,'domestic',setValue,()=>{});run=draft.run;
  return createElement('div',null,value.customer.name);
 }
 const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0))});
 try{
  await act(async()=>root.render(createElement(MemoryRouter,{initialEntries:['/quotation?id=A']},createElement(Harness))));await flush();
  await act(()=>edit('unsaved'));await act(()=>navigate('/quotation?id=B'));
  assert.ok(confirmOptions,'dirty switch requires confirmation');assert.equal(calls,1);
  await act(()=>confirmOptions!.onCancel?.());await flush();assert.equal(url,'?id=A');assert.equal(document.getElementById('root')!.textContent,'unsaved');
  let finish:()=>void=()=>{};let operation:Promise<void>;
  await act(()=>{operation=run(()=>new Promise<void>(resolve=>{finish=resolve}))});
  await act(()=>navigate('/quotation?id=C'));await flush();assert.equal(url,'?id=A');assert.equal(calls,1);
  await act(async()=>{finish();await operation!});
  await act(()=>navigate('/quotation?id=B'));
  await act(()=>{void confirmOptions!.onOk?.()});await flush();assert.equal(calls,2);
  await act(()=>edit('edited during load'));
  await act(()=>resolveLoad!({data:{id:'B',market:'domestic',quotation:source}}));await flush();
  assert.equal(url,'?id=A');assert.equal(document.getElementById('root')!.textContent,'edited during load');
  await act(()=>navigate('/quotation?id=B'));await act(()=>{void confirmOptions!.onOk?.()});await flush();
  const oldResolve=resolveLoad!;
  await act(()=>navigate('/quotation?id=C'));await act(()=>{void confirmOptions!.onOk?.()});await flush();
  await act(()=>oldResolve({data:{id:'B',market:'domestic',quotation:source}}));await flush();
  assert.equal(document.getElementById('root')!.textContent,'edited during load','obsolete request cannot replace current draft');
  const next={...source,customer:{...source.customer,name:'accepted C'}};
  await act(()=>resolveLoad!({data:{id:'C',market:'domestic',quotation:next}}));await flush();
  assert.equal(url,'?id=C');assert.equal(document.getElementById('root')!.textContent,'accepted C');
  // New/imported drafts remove the record query and must become the rollback target.
  await act(()=>{edit('new draft');navigate('/quotation')});await flush();
  await act(()=>navigate('/quotation?id=B'));await act(()=>confirmOptions!.onCancel?.());await flush();
  assert.equal(url,'','cancel returns to the new draft, not the last loaded record');
  assert.equal(document.getElementById('root')!.textContent,'new draft');
  await act(()=>{operation=run(()=>new Promise<void>(resolve=>{finish=resolve}))});
  await act(()=>navigate('/quotation?id=B'));await flush();assert.equal(url,'','busy rollback preserves new draft URL');
  await act(async()=>{finish();await operation!});
  await act(()=>navigate('/quotation?id=B'));await act(()=>{void confirmOptions!.onOk?.()});await flush();
  await act(()=>resolveLoad!({data:{id:'B',market:'international',quotation:source}}));await flush();
  assert.equal(url,'','failed load returns to new draft');
  assert.equal(document.getElementById('root')!.textContent,'new draft');

 }finally{await act(()=>root.unmount());api.get=originalGet;Modal.confirm=originalConfirm;}
});
