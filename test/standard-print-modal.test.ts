import assert from 'node:assert/strict';
import { test } from 'node:test';
import './standard-frontend-dom.ts';
Object.assign(globalThis, { HTMLBodyElement: window.HTMLBodyElement });
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from '../src/lib/api.ts';
import { StandardPrintModal } from '../src/components/standard/StandardPrintModal.tsx';
import type { StandardListItem, StandardVersion } from '../src/types/standard.ts';
import {TabPageContext} from '../src/lib/tabPageContext.tsx';
import {getTabPage,startTabInstance,clearTabScope} from '../src/lib/tabPageCache.ts';
const row=(id:string,customer:string):StandardListItem=>({id,serialNo:`SP-${id}`,customer,model:`RD-${id}`,categoryKey:'gear_damper',categoryName:'齿形阻尼器',versionNo:1,status:'published',standardType:'formal',fields:{gear_spec:`${id}齿轮\n第二种齿轮`},vehicleModel:'',customerPartNo:'',hasPending:false,updatedAt:'2026-10-19',updatedBy:'工程',reviewComment:''});
const categories=[{key:'gear_damper',name:'齿形阻尼器',fields:[{key:'gear_spec',label:'齿轮规格'}]}];
const wait=(ms=0)=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms));});
const click=(element:Element)=>act(async()=>{(element as HTMLElement).click();});
const button=(name:string)=>[...document.querySelectorAll('button')].find(x=>x.textContent?.includes(name))!;
const radio=(text:string)=>[...document.querySelectorAll('label')].find(label=>label.textContent===text)!.querySelector('input')!;

test('checkbox selection prints only selected production specifications and hides traceability fields',async()=>{
 const originalGet=api.get,originalOpen=window.open;
 const rows=[row('a','Alpha'),row('b','Beta'),row('c','Other')],calls:string[]=[];
 const popup=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/preview'});
 window.open=(()=>popup.window) as unknown as typeof window.open;
 api.get=(async(url:string)=>{calls.push(url);const selected=rows.find(r=>url.includes(`/standards/${r.id}?`))!;return {currentCommentsIncluded:true,data:{id:selected.id,serialNo:selected.serialNo,categoryKey:selected.categoryKey,categoryName:selected.categoryName,versions:[{...selected,id:`v-${selected.id}`,fields:selected.fields,createdBy:'工程',createdAt:'',publishedAt:'2026-10-19'} as StandardVersion],sourceComments:[{versionId:`v-${selected.id}`,fieldLabel:'齿轮',text:'完整批注'}],changes:[]}};}) as typeof api.get;
 const root=createRoot(document.getElementById('root')!);let closes=0;
 const record=getTabPage('print-success','page');record.active=true;const instance=startTabInstance(record);
 try {
  await act(async()=>root.render(createElement(TabPageContext.Provider,{value:{record,instance,active:true,restored:false,container:document.getElementById('root')}},createElement(StandardPrintModal,{categories,currentCategory:'gear_damper',currentRows:rows,onClose:()=>{closes++;}}))));
  assert(record.snapshot.has('standard:print:rows'));
  await click(radio('勾选指定产品'));assert(button('打印 / PDF').disabled);
  await click(document.querySelector('[data-row-key="a"] input')!);
  const input=document.querySelector<HTMLInputElement>('input[placeholder="搜索内部料号、客户、型号"]')!;
  await act(()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,'Beta');input.dispatchEvent(new window.Event('input',{bubbles:true}));});await wait(230);
  assert(!document.querySelector('[data-row-key="a"]'));
  await click(document.querySelector('[data-row-key="b"] input')!);
  assert(document.body.textContent?.includes('已选 2 / 3 条'));
  await click(button('打印 / PDF'));await wait();
  assert.equal(closes,1);assert.equal(calls.length,2);assert(calls.every(url=>url.endsWith('?summary=true')));
  assert.equal([...record.snapshot.keys()].some(key=>key.startsWith('standard:print:')),false,'successful print clears the session just like cancellation');
  const printed=popup.window.document.body.textContent!;
  for(const value of ['SP-a','SP-b','a齿轮','b齿轮','第二种齿轮'])assert(printed.includes(value),value);
  assert(!printed.includes('SP-c'));assert(!printed.includes('完整批注'));assert(!printed.includes('创建人'));
  assert(document.querySelector('[aria-label="分类范围"]'));assert(document.querySelector('.ant-segmented'));assert(!document.querySelector('.ant-radio-group'));assert(button('导出 Excel'));
 } finally {await act(()=>root.unmount());clearTabScope('print-success');api.get=originalGet;window.open=originalOpen;popup.window.close();}
});

test('switching category range clears selected products and only loads visible lists',async()=>{
 const oldGet=api.get;const root=createRoot(document.getElementById('root')!);const calls:string[]=[];
 api.get=(async(url:string)=>{calls.push(url);return {data:[row('all','所有分类可见产品')]};}) as typeof api.get;
 try {
  await act(async()=>root.render(createElement(StandardPrintModal,{categories,currentCategory:'gear_damper',currentRows:[row('a','Alpha')],onClose(){}})));
  await click(radio('勾选指定产品'));await click(document.querySelector('[data-row-key="a"] input')!);
  await act(async()=>{document.querySelector('.ant-select-selector')!.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true}));});await wait();await click(document.querySelector('[title="全部分类（不含停用）"]')!);await wait();
  assert(document.body.textContent?.includes('已选 0 / 1 条'));assert(button('打印 / PDF').disabled);
  assert.equal(calls.length,1);const query=new URL(calls[0],'http://local').searchParams;assert.equal(query.get('category'),'gear_damper');assert.equal(query.get('all'),'true');assert.equal(query.get('excludeObsolete'),'true');
 } finally {await act(()=>root.unmount());api.get=oldGet;}
});

test('canceling generation aborts outstanding reads and closes the unfinished preview',async()=>{
 const oldGet=api.get,oldOpen=window.open;let signal:AbortSignal|null|undefined,closed=false;
 const popup=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/preview'});
 const close=popup.window.close.bind(popup.window);popup.window.close=()=>{closed=true;close();};
 window.open=(()=>popup.window) as unknown as typeof window.open;
 api.get=((_url:string,options?:RequestInit)=>{signal=options?.signal;return new Promise((_resolve,reject)=>signal?.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true}));}) as typeof api.get;
 const root=createRoot(document.getElementById('root')!);
 try {
  await act(async()=>root.render(createElement(StandardPrintModal,{categories,currentCategory:'gear_damper',currentRows:[row('a','Alpha')],onClose(){}})));
  await click(button('打印 / PDF'));assert(signal);assert(!signal.aborted);
  await act(()=>root.unmount());assert(signal.aborted);assert(closed);
 } finally {api.get=oldGet;window.open=oldOpen;if(!closed)popup.window.close();}
});
