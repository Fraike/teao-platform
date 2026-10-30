import './standard-frontend-dom.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import {act, Activity, createElement, StrictMode, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {TabPageHost} from '../src/components/TabPageHost.tsx';
import {TabPageContext, useTabInitialEffect} from '../src/lib/tabPageContext.tsx';
import {clearTabScope, getTabPage, invalidateTabInstance} from '../src/lib/tabPageCache.ts';
import {EmployeePage} from '../src/pages/EmployeePage.tsx';
import {api} from '../src/lib/api.ts';

test('EmployeePage first requests finish while hidden and Host return does not refresh', async()=>{
 const root=createRoot(document.getElementById('root')!);
 const original=api.get;
 const requests: {url:string; resolve:(value:unknown)=>void}[]=[];
 api.get=((url:string)=>new Promise(resolve=>requests.push({url,resolve}))) as typeof api.get;
 const tabs=['employees','other'].map(key=>({key,location:{pathname:`/${key}`,search:'',hash:'',state:null,key}}));
 const renderPage=(location:{pathname:string})=>location.pathname==='/employees'?createElement(EmployeePage):createElement('p',null,'other');
 const render=(activeKey:string)=>act(async()=>root.render(createElement(MemoryRouter,null,createElement(TabPageHost,{scope:'hidden-employee',tabs,activeKey,renderPage}))));
 try {
  await render('employees');assert.equal(requests.length,2);
  await render('other');
  await act(async()=>{for(const request of requests)request.resolve(request.url.endsWith('/reminders')?{expired:[],expiring:[]}:[])});
  await render('employees');
  assert.equal(requests.length,2,'successful hidden completion must prevent both repeated GETs');
  assert.equal(getTabPage('hidden-employee','employees').snapshot.get('EmployeePage.loading'),false);
 } finally {await act(async()=>root.unmount());api.get=original;clearTabScope('hidden-employee')}
});

test('ready true eager initialization runs initially, then semantic dependency changes still initialize', async()=>{
 const record=getTabPage('hidden-eager','page');const root=createRoot(document.getElementById('root')!);let calls=0;
 function Probe({query}:{query:string}){useTabInitialEffect('eager',()=>{calls++},[query],true);return null}
 const render=(query:string)=>act(async()=>root.render(createElement(TabPageContext.Provider,{value:{record,instance:record.instance,active:true,restored:false,container:null}},createElement(StrictMode,null,createElement(Probe,{query})))));
 try {await render('a');assert.equal(calls,1);await render('b');assert.equal(calls,2)}
 finally {await act(async()=>root.unmount());clearTabScope('hidden-eager')}
});

test('hidden unfinished work retries and obsolete instance cannot mark completion', async()=>{
 const record=getTabPage('hidden-retry','page');const instance=record.instance;
 const root=createRoot(document.getElementById('root')!);let calls=0;let finish:()=>void=()=>{};
 function Probe(){const [ready,setReady]=useState(false);finish=()=>setReady(true);useTabInitialEffect('load',()=>{calls++},[],ready);return null}
 const render=(visible:boolean)=>act(async()=>root.render(createElement(TabPageContext.Provider,{value:{record,instance,active:visible,restored:false,container:null}},createElement(Activity,{mode:visible?'visible':'hidden'},createElement(Probe)))));
 try {
  await render(true);await render(false);await render(true);assert.equal(calls,2,'unfinished or failed load retries');
  await render(false);invalidateTabInstance(record);await act(async()=>finish());await render(true);
  assert.equal(record.initialized.has('load'),false,'stale instance must not mark replacement ready');
 } finally {await act(async()=>root.unmount());clearTabScope('hidden-retry')}
});

test('StrictMode hidden success survives cold remount; changed semantic query still starts', async()=>{
 const scope='hidden-cold-strict';const record=getTabPage(scope,'page');
 let root=createRoot(document.getElementById('root')!);let calls=0;let finish:()=>void=()=>{};
 function Probe({query}:{query:string}){
  const [ready,setReady]=useState(false);finish=()=>setReady(true);
  useTabInitialEffect('load',()=>{calls++},[query],ready);return null;
 }
 const render=(visible:boolean,query='a')=>act(async()=>root.render(createElement(TabPageContext.Provider,{value:{record,instance:record.instance,active:visible,restored:false,container:null}},createElement(StrictMode,null,createElement(Activity,{mode:visible?'visible':'hidden'},createElement(Probe,{query}))))));
 try {
  await render(true);assert.ok(calls>0);const initialCalls=calls;
  await render(false);await act(async()=>finish());
  assert.deepEqual(record.initialized.get('load'),['a'],'hidden render records success before effects reconnect');
  await render(true);assert.equal(calls,initialCalls);
  await act(async()=>root.unmount());root=createRoot(document.getElementById('root')!);
  await render(true);assert.equal(calls,initialCalls,'cold remount uses completion marker');
  await render(false,'b');await render(true,'b');
  assert.ok(calls>initialCalls,'different query must initialize even with cached prior success');
 } finally {await act(async()=>root.unmount());clearTabScope(scope)}
});

for (const deferredReset of [false,true]) {
 test(`changed dependencies cannot inherit old ready before ${deferredReset?'microtask':'synchronous'} pending reset`,async()=>{
  const scope=`hidden-stale-ready-${deferredReset}`;const record=getTabPage(scope,'page');const root=createRoot(document.getElementById('root')!);
  const calls:string[]=[];let finish:()=>void=()=>{};
  function Probe({query}:{query:string}){
   const [ready,setReady]=useState(false);finish=()=>setReady(true);
   useTabInitialEffect('detail',()=>{calls.push(query);if(deferredReset)queueMicrotask(()=>setReady(false));else setReady(false)},[query],ready);
   return null;
  }
  const render=(visible:boolean,query:string)=>act(async()=>root.render(createElement(TabPageContext.Provider,{value:{record,instance:record.instance,active:visible,restored:false,container:null}},createElement(Activity,{mode:visible?'visible':'hidden'},createElement(Probe,{query})))));
  try {
   await render(true,'a');await act(async()=>finish());assert.deepEqual(record.initialized.get('detail'),['a']);
   await render(true,'b');
   assert.notDeepEqual(record.initialized.get('detail'),['b'],'starting B with stale ready A must not mark B complete');
   await render(false,'b');await render(true,'b');assert.deepEqual(calls,['a','b','b'],'unfinished B retries after Activity reconnect');
   await render(false,'b');await act(async()=>finish());await render(true,'b');assert.deepEqual(calls,['a','b','b'],'successful B completion while hidden prevents another retry');
  } finally {await act(async()=>root.unmount());clearTabScope(scope)}
 });
}

test('explicit synchronous initialization preserves edits after dependency change and Activity return',async()=>{
 const scope='hidden-sync-draft';const record=getTabPage(scope,'page');const root=createRoot(document.getElementById('root')!);
 let calls=0;let edit:(value:string)=>void=()=>{};
 function Probe({id}:{id:string}){
  const [value,setValue]=useState('');edit=setValue;
  useTabInitialEffect('draft',()=>{calls++;setValue(id)},[id],true,{synchronous:true});
  return createElement('span',null,value);
 }
 const render=(visible:boolean,id:string)=>act(async()=>root.render(createElement(TabPageContext.Provider,{value:{record,instance:record.instance,active:visible,restored:false,container:null}},createElement(StrictMode,null,createElement(Activity,{mode:visible?'visible':'hidden'},createElement(Probe,{id}))))));
 try {
  await render(true,'a');assert.equal(calls,1);await render(true,'b');assert.equal(calls,2);
  await act(async()=>edit('unsaved B'));await render(false,'b');await render(true,'b');
  assert.equal(calls,2);assert.match(document.body.textContent??'',/unsaved B/);
 } finally {await act(async()=>root.unmount());clearTabScope(scope)}
});

test('EmployeeFormModal reopened session keeps typed draft across Activity return',async()=>{
 const {EmployeeFormModal}=await import('../src/components/EmployeeFormModal.tsx');
 const scope='hidden-employee-draft';const record=getTabPage(scope,'page');const root=createRoot(document.getElementById('root')!);
 const render=(visible:boolean,open:boolean)=>act(async()=>root.render(createElement(TabPageContext.Provider,{value:{record,instance:record.instance,active:visible,restored:false,container:null}},createElement(Activity,{mode:visible?'visible':'hidden'},createElement(EmployeeFormModal,{open,employee:null,onClose:()=>{},onSuccess:()=>{}})))));
 try {
  await render(true,false);await render(true,true);
  const input=document.querySelector<HTMLInputElement>('input#name');assert.ok(input);
  await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,'未保存 B');input.dispatchEvent(new window.Event('input',{bubbles:true}))});
  await render(false,true);await render(true,true);
  assert.equal(document.querySelector<HTMLInputElement>('input#name')?.value,'未保存 B');
 } finally {await act(async()=>root.unmount());clearTabScope(scope)}
});

test('CustomerProductPage successful search B survives Activity return without another GET',async()=>{
 const {CustomerProductPage}=await import('../src/pages/CustomerProductPage.tsx');
 const scope='hidden-customer-search';const record=getTabPage(scope,'page');const root=createRoot(document.getElementById('root')!);
 const original=api.get;const requests:string[]=[];
 api.get=(async(url:string)=>{requests.push(url);return {ok:true,data:[]}}) as typeof api.get;
 const render=(visible:boolean)=>act(async()=>root.render(createElement(TabPageContext.Provider,{value:{record,instance:record.instance,active:visible,restored:false,container:null}},createElement(Activity,{mode:visible?'visible':'hidden'},createElement(CustomerProductPage)))));
 try {
  await render(true);assert.equal(requests.length,1);
  const input=document.querySelector<HTMLInputElement>('input[placeholder="搜索客户名称/商品名称/编码"]');assert.ok(input);
  await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,'B');input.dispatchEvent(new window.Event('input',{bubbles:true}))});
  const search=[...document.querySelectorAll('button')].find(button=>button.textContent==='搜索');assert.ok(search);
  await act(async()=>search.click());assert.equal(requests.length,2);assert.match(requests[1],/search=B/);
  await render(false);await render(true);assert.equal(requests.length,2,'successful semantic query B must remain initialized');
  await act(async()=>search.click());assert.equal(requests.length,3,'explicitly searching the same condition still refreshes');
  await render(false);await render(true);assert.equal(requests.length,3,'the refreshed submission also stays initialized');
 } finally {await act(async()=>root.unmount());api.get=original;clearTabScope(scope)}
});

test('ProductArchiveDetailPage query B and Kingdee results remain initialized after Activity return',async()=>{
 const {Routes,Route,useNavigate}=await import('react-router-dom');
 const {ProductArchiveDetailPage}=await import('../src/pages/ProductArchiveDetailPage.tsx');
 const {useAuthStore}=await import('../src/lib/authStore.ts');
 const previousUser=useAuthStore.getState().user;
 useAuthStore.setState({user:{id:'test-admin',username:'admin',name:'Admin',role:'admin',status:'active',permissions:[]}});
 const scope='hidden-product-query';const record=getTabPage(scope,'page');const root=createRoot(document.getElementById('root')!);
 const original=api.get;const requests:string[]=[];let navigate:ReturnType<typeof useNavigate>;
 api.get=(async(url:string)=>{requests.push(url);if(url.endsWith('/kingdee'))return {data:{},fetchedAt:'2026-10-29',stale:false};const id=url.split('/').at(-1);return {data:{id,internalNumber:id,name:id,kingdeeId:`k-${id}`,material:null,standards:[],issues:[],productionAvailable:true},drawings:[],canManage:false,sync:{}}}) as typeof api.get;
 function Page(){navigate=useNavigate();return createElement(Routes,null,createElement(Route,{path:'/materials/:id',element:createElement(ProductArchiveDetailPage)}))}
 const render=(visible:boolean)=>act(async()=>root.render(createElement(MemoryRouter,{initialEntries:['/materials/a']},createElement(TabPageContext.Provider,{value:{record,instance:record.instance,active:visible,restored:false,container:null}},createElement(Activity,{mode:visible?'visible':'hidden'},createElement(Page))))));
 try {
  await render(true);await act(async()=>navigate('/materials/b'));
  assert.equal(requests.filter(url=>url==='/api/products/b').length,1);
  assert.equal(requests.filter(url=>url==='/api/products/b/kingdee').length,1);
  const count=requests.length;await render(false);await render(true);assert.equal(requests.length,count);
 } finally {await act(async()=>root.unmount());api.get=original;useAuthStore.setState({user:previousUser});clearTabScope(scope)}
});

test('standard history immediate page B completion survives Activity return',async()=>{
 const {useStandardHistoryPage}=await import('../src/lib/useStandardHistoryPage.ts');
 const scope='hidden-history-query';const record=getTabPage(scope,'page');const root=createRoot(document.getElementById('root')!);
 const original=api.get;let calls=0;let nextPage:(page:number)=>void=()=>{};
 api.get=(async()=>{calls++;return {data:[],total:0,page:1,pageSize:20}}) as typeof api.get;
 function Probe(){const history=useStandardHistoryPage('s1','versions',20);nextPage=history.setPage;return null}
 const render=(visible:boolean)=>act(async()=>root.render(createElement(TabPageContext.Provider,{value:{record,instance:record.instance,active:visible,restored:false,container:null}},createElement(Activity,{mode:visible?'visible':'hidden'},createElement(Probe)))));
 try {await render(true);await act(async()=>nextPage(2));assert.equal(calls,2);await render(false);await render(true);assert.equal(calls,2,'batched loading updates must not lose successful page B completion')}
 finally {await act(async()=>root.unmount());api.get=original;clearTabScope(scope)}
});

test('retirement panel version B completion is retained with old rows left in place',async()=>{
 const {StandardRetirementPanel}=await import('../src/components/standard/StandardRetirementPanel.tsx');
 const scope='hidden-retirement-query';const record=getTabPage(scope,'page');const root=createRoot(document.getElementById('root')!);
 const original=api.get;let calls=0;api.get=(async()=>{calls++;return {data:[]}}) as typeof api.get;
 const render=(visible:boolean,versionKey:string)=>act(async()=>root.render(createElement(TabPageContext.Provider,{value:{record,instance:record.instance,active:visible,restored:false,container:null}},createElement(Activity,{mode:visible?'visible':'hidden'},createElement(StandardRetirementPanel,{standardId:'s1',versionKey,canRetire:false,onChanged:()=>{}})))));
 try {await render(true,'a');await render(true,'b');assert.equal(calls,2);await render(false,'b');await render(true,'b');assert.equal(calls,2)}
 finally {await act(async()=>root.unmount());api.get=original;clearTabScope(scope)}
});

test('aborted standard history query cannot authenticate a completed result',async()=>{
 const {useStandardHistoryPage}=await import('../src/lib/useStandardHistoryPage.ts');
 const scope='hidden-history-abort';const record=getTabPage(scope,'page');const root=createRoot(document.getElementById('root')!);
 const original=api.get;let calls=0;let nextPage:(page:number)=>void=()=>{};let finish:()=>void=()=>{};
 api.get=(async()=>{calls++;if(calls===2)await new Promise<void>(resolve=>{finish=resolve});return {data:[],total:0,page:1,pageSize:20}}) as typeof api.get;
 function Probe(){const history=useStandardHistoryPage('s1','versions',20);nextPage=history.setPage;return null}
 const render=(visible:boolean)=>act(async()=>root.render(createElement(TabPageContext.Provider,{value:{record,instance:record.instance,active:visible,restored:false,container:null}},createElement(Activity,{mode:visible?'visible':'hidden'},createElement(Probe)))));
 try {await render(true);await act(async()=>nextPage(2));await render(false);await act(async()=>finish());await render(true);assert.equal(calls,3,'aborted result retries');await render(false);await render(true);assert.equal(calls,3,'successful retry remains initialized')}
 finally {await act(async()=>root.unmount());api.get=original;clearTabScope(scope)}
});

test('leaving completed A for unfinished B invalidates A initialization before returning',async()=>{
 const scope='hidden-dependency-roundtrip';const record=getTabPage(scope,'page');const root=createRoot(document.getElementById('root')!);const calls:string[]=[];
 function Probe({query}:{query:string}){useTabInitialEffect('load',()=>{calls.push(query)},[query],query==='a');return null}
 const render=(query:string)=>act(async()=>root.render(createElement(TabPageContext.Provider,{value:{record,instance:record.instance,active:true,restored:false,container:null}},createElement(Probe,{query}))));
 try {await render('a');await render('b');await render('a');assert.deepEqual(calls,['a','b','a'])}
 finally {await act(async()=>root.unmount());clearTabScope(scope)}
});

test('StandardDetailDrawer close and reopen starts a fresh read, then Activity return retains it',async()=>{
 const {StandardDetailDrawer}=await import('../src/components/standard/StandardDetailDrawer.tsx');
 const scope='hidden-detail-reopen';const record=getTabPage(scope,'page');const root=createRoot(document.getElementById('root')!);
 const original=api.get;let calls=0;
 api.get=(async(url:string)=>{calls++;return url.endsWith('/reviewers')?{data:[]}:{data:{id:'s1',versions:[],changes:[]}}}) as typeof api.get;
 const render=(open:boolean,visible=true)=>act(async()=>root.render(createElement(TabPageContext.Provider,{value:{record,instance:record.instance,active:visible,restored:false,container:null}},createElement(Activity,{mode:visible?'visible':'hidden'},createElement(StandardDetailDrawer,{open,standardId:'s1',categories:[],canEdit:false,canReview:false,onClose:()=>{},onChanged:()=>{},onEdit:()=>{}})))));
 try {await render(true);assert.equal(calls,2);await render(false);await render(true);assert.equal(calls,4,'closed session must invalidate prior initialization');await render(true,false);await render(true);assert.equal(calls,4,'reopened success is retained during Activity hide')}
 finally {await act(async()=>root.unmount());api.get=original;clearTabScope(scope)}
});
