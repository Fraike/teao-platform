import assert from 'node:assert/strict';
import {test} from 'node:test';
import './standard-frontend-dom.ts';
import {act,createElement,createRef,Activity} from 'react';
import {createRoot} from 'react-dom/client';
import {TabPageContext} from '../src/lib/tabPageContext.tsx';
import {getTabPage,clearTabScope,startTabInstance} from '../src/lib/tabPageCache.ts';
import {StandardFormModal} from '../src/components/standard/StandardFormModal.tsx';
import {StandardRowSelectionProvider,StandardSelectableRow,StandardVirtualRow} from '../src/components/standard/StandardSelectableRow.tsx';
import type {StandardListItem} from '../src/types/standard';
test('managed editing draft survives Activity and a cold remount with close guard',async()=>{
 const record=getTabPage('standard-test','form');record.active=true;
 let instance=startTabInstance(record);let visible=true;
 const host=document.createElement('div');document.body.append(host);let root=createRoot(host);
 const render=()=>act(async()=>root.render(createElement(TabPageContext.Provider,{value:{record,instance,active:visible,restored:instance>1,container:host}},createElement(Activity,{mode:visible?'visible':'hidden'},createElement(StandardFormModal,{open:true,categories:[{key:'gear_damper',name:'齿形',fields:[]}],initial:null,onClose(){},onSaved(){}})))));
 await render();
 const input=()=>host.querySelector<HTMLInputElement>('input[placeholder="客户名称"]')!;
 await act(()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input(),'保留草稿');input().dispatchEvent(new window.Event('input',{bubbles:true}))});
 visible=false;await render();visible=true;await render();assert.equal(input().value,'保留草稿');
 assert.ok([...record.dirty.values()].some(Boolean));assert.ok(![...record.busy.values()].some(Boolean));
 await act(()=>root.unmount());instance=startTabInstance(record);root=createRoot(host);await render();
 assert.equal(input().value,'保留草稿');await act(()=>root.unmount());clearTabScope('standard-test');host.remove();
});
test('source material link selects the complete row and survives cold remount',async()=>{
 const record=getTabPage('standard-selection','list');record.active=true;let instance=startTabInstance(record);
 const host=document.createElement('div');document.body.append(host);let root=createRoot(host);
 const render=()=>act(async()=>root.render(createElement(TabPageContext.Provider,{value:{record,instance,active:true,restored:instance>1,container:host}},createElement(StandardRowSelectionProvider,{selectionKey:'gear',children:createElement('table',{},createElement('tbody',{},createElement(StandardSelectableRow,{'data-row-key':'standard-id'},createElement('td',{},createElement('a',{href:'/materials/number?number=S1'},'S1')))))}))));
 await render();await act(()=>host.querySelector('a')!.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true})));assert.equal(host.querySelector('tr')!.getAttribute('aria-selected'),'true');
 await act(()=>root.unmount());instance=startTabInstance(record);root=createRoot(host);await render();assert.equal(host.querySelector('tr')!.getAttribute('aria-selected'),'true');
 await act(()=>root.unmount());clearTabScope('standard-selection');host.remove();
});
test('virtual rows forward DOM refs and select by standard ID even with the same material number',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),ref=createRef<HTMLDivElement>();
 try{
  await act(()=>root.render(createElement(StandardRowSelectionProvider,{children:createElement('div',null,...['customer-one','customer-two'].map(id=>createElement(StandardVirtualRow,{key:id,ref:id==='customer-one'?ref:undefined,'data-row-key':id,className:'ant-table-row'},createElement('div',{className:'ant-table-cell'},createElement('a',{href:'/materials/number?number=SP1'},'SP1')))))})));
  assert.equal(ref.current?.tagName,'DIV');
  await act(()=>host.querySelector<HTMLElement>('[data-row-key="customer-two"] a')!.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true})));
  assert.equal(ref.current?.getAttribute('aria-selected'),'false');assert.equal(host.querySelector('[data-row-key="customer-two"]')?.getAttribute('aria-selected'),'true');
  await act(()=>ref.current!.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  assert.equal(ref.current?.getAttribute('aria-selected'),'true');assert.equal(host.querySelector('[data-row-key="customer-two"]')?.getAttribute('aria-selected'),'false');
 }finally{await act(()=>root.unmount());host.remove();}
});
test('managed standard list hot and cold restore do not refetch collection or drawing status',async()=>{
 const {MemoryRouter}=await import('react-router-dom');
 const {ProductStandardPage}=await import('../src/pages/ProductStandardPage.tsx');
 const {api}=await import('../src/lib/api.ts');
 const {clearStandardQueryCache}=await import('../src/lib/standardQueryCache.ts');
 clearStandardQueryCache();const get=api.get,post=api.post;let list=0,drawings=0,versions=0;
 api.get=(async(url:string)=>{
  if(url==='/api/standards/categories')return {data:[{key:'gear_damper',name:'齿轮',fields:[]}]};
  if(url.startsWith('/api/standards/pending-reviews'))return {data:[],categories:[],total:0,overallTotal:0};
  if(url==='/api/standards/version'){versions++;return {version:'1'}}
  if(url.startsWith('/api/standards?')){list++;return {data:[{id:'s1',serialNo:'SP1',categoryKey:'gear_damper',standardType:'formal',status:'published',fields:{},updatedAt:'',customer:'客户',model:'',vehicleModel:'',customerPartNo:''}],total:1,version:'1'}}
  throw Error(url);
 }) as typeof api.get;
 api.post=(async(url:string)=>{if(url.includes('drawing-status')){drawings++;return {data:[{standardId:'s1',number:'SP1',hasDrawing:false}]}}throw Error(url)}) as typeof api.post;
 const record=getTabPage('standard-list-test','list');record.active=true;let instance=startTabInstance(record),visible=true;
 const host=document.createElement('div');document.body.append(host);let root=createRoot(host);
 const render=()=>act(async()=>root.render(createElement(TabPageContext.Provider,{value:{record,instance,active:visible,restored:instance>1,container:host}},createElement(MemoryRouter,{initialEntries:['/product-standards']},createElement(Activity,{mode:visible?'visible':'hidden'},createElement(ProductStandardPage))))));
 const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,50))});
 try{
  await render();await settle();await settle();assert.equal(list,1);assert.ok(host.querySelector('tr[data-row-key="s1"]'));const calls=drawings;
  visible=false;await render();visible=true;await render();await settle();assert.equal(list,1);assert.equal(drawings,calls);
  await act(()=>root.unmount());instance=startTabInstance(record);root=createRoot(host);await render();await settle();
  assert.equal(list,1);assert.equal(drawings,calls);assert.equal(versions,0);assert.ok(host.querySelector('tr[data-row-key="s1"]'));
 }finally{await act(()=>root.unmount());api.get=get;api.post=post;clearTabScope('standard-list-test');clearStandardQueryCache();host.remove()}
});
test('uncommitted standard filter draft survives Activity and cold restore without a new query',async()=>{
 const {StandardFilterInput}=await import('../src/components/standard/StandardFilterInput.tsx');
 const record=getTabPage('standard-filter-test','list');record.active=true;let instance=startTabInstance(record),visible=true;const applied:string[]=[];
 const host=document.createElement('div');document.body.append(host);let root=createRoot(host);
 const render=()=>act(async()=>root.render(createElement(TabPageContext.Provider,{value:{record,instance,active:visible,restored:instance>1,container:host}},createElement(Activity,{mode:visible?'visible':'hidden'},createElement(StandardFilterInput,{placeholder:'标准测试筛选',resetVersion:0,onApply:value=>applied.push(value)})))));
 const type=async(value:string)=>act(()=>{const input=host.querySelector('input')!;Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}))});
 try{
  await render();await type('已发起');visible=false;await render();await act(async()=>{await new Promise(resolve=>setTimeout(resolve,220))});visible=true;await render();assert.deepEqual(applied,['已发起']);
  await type('尚未提交');await act(()=>root.unmount());instance=startTabInstance(record);root=createRoot(host);await render();
  assert.equal(host.querySelector('input')!.value,'尚未提交');await act(async()=>{await new Promise(resolve=>setTimeout(resolve,220))});assert.deepEqual(applied,['已发起']);
  await act(()=>host.querySelector('input')!.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));assert.deepEqual(applied,['已发起','尚未提交']);
  await act(()=>host.querySelector('input')!.dispatchEvent(new window.CompositionEvent('compositionstart',{bubbles:true})));await type('拼音暂存');visible=false;await render();visible=true;await render();assert.equal(host.querySelector('input')!.value,'拼音暂存');
  await act(()=>host.querySelector('input')!.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));assert.deepEqual(applied,['已发起','尚未提交','拼音暂存']);
 }finally{await act(()=>root.unmount());clearTabScope('standard-filter-test');host.remove()}
});

test('closing print session clears its snapshot before opening a different category',async()=>{
 const {StandardPrintModal}=await import('../src/components/standard/StandardPrintModal.tsx');
 const record=getTabPage('print-session-test','list');record.active=true;const instance=startTabInstance(record);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 let closed=false;
 const row=(id:string):StandardListItem=>({id,versionId:id,revision:1,createdById:'test',serialNo:id,model:id,customer:'客户',categoryKey:id,categoryName:'分类',standardType:'formal',status:'published',versionNo:1,fields:{},customerPartNo:'',vehicleModel:'',hasPending:false,updatedAt:'',updatedBy:'',reviewComment:''});
 const render=(id:string)=>act(async()=>root.render(createElement(TabPageContext.Provider,{value:{record,instance,active:true,restored:false,container:host}},createElement(StandardPrintModal,{categories:[],currentCategory:id,currentRows:[row(id)],onClose(){closed=true}}))));
 await render('A');assert.equal((record.snapshot.get('standard:print:rows') as {id:string}[])[0].id,'A');
 await act(()=>{const cancel=[...host.querySelectorAll('button')].find(button=>button.textContent?.replaceAll(' ','')==='取消');assert.ok(cancel);cancel.click()});
 assert.equal(closed,true);assert.equal(record.snapshot.has('standard:print:rows'),false);
 await act(()=>root.render(null));await render('B');
 assert.equal((record.snapshot.get('standard:print:rows') as {id:string}[])[0].id,'B');
 await act(()=>root.unmount());clearTabScope('print-session-test');host.remove();
});
