import './standard-frontend-dom.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { TabPageContext } from '../src/lib/tabPageContext.tsx';
import { getTabPage, clearTabScope } from '../src/lib/tabPageCache.ts';
import { api } from '../src/lib/api.ts';
import { CustomerDataPage } from '../src/pages/CustomerDataPage.tsx';
import { EmployeeFormModal } from '../src/components/EmployeeFormModal.tsx';

test('customer page cold restoration retains search and loaded rows without another request', async () => {
 const record = getTabPage('basic-cold', '/customers');
 const original = api.get; let calls = 0;
 api.get = (async () => { calls++; return {ok:true,data:[{id:'1',name:'Mike',number:'C1',group_name:''}]}; }) as typeof api.get;
 let root = createRoot(document.getElementById('root')!);
 const render = () => createElement(TabPageContext.Provider,{value:{record,instance:record.instance,active:true,restored:true,container:document.getElementById('root')}},createElement(CustomerDataPage));
 try {
  await act(async()=>root.render(render()));
  const input=document.querySelector('input')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,'Mike');input.dispatchEvent(new window.Event('input',{bubbles:true}));});
  await act(async()=>root.unmount()); root=createRoot(document.getElementById('root')!);
  await act(async()=>root.render(render()));
  assert.equal(calls,1); assert.equal(document.querySelector('input')!.value,'Mike');assert.match(document.body.textContent! , /Mike/);
 } finally {await act(async()=>root.unmount());api.get=original;clearTabScope('basic-cold');}
});
test('employee modal cold restoration retains unsaved fields', async()=>{
 const record=getTabPage('employee-cold','/employees');
 let root=createRoot(document.getElementById('root')!);
 const render=()=>createElement(TabPageContext.Provider,{value:{record,instance:record.instance,active:true,restored:true,container:document.getElementById('root')}},createElement(EmployeeFormModal,{open:true,employee:null,onClose:()=>{},onSuccess:()=>{}}));
 try {
  await act(async()=>root.render(render()));
  const input=document.querySelector<HTMLInputElement>('input#name')!;assert.ok(input);
  await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,'未保存员工');input.dispatchEvent(new window.Event('input',{bubbles:true}));});
  await act(async()=>root.unmount());root=createRoot(document.getElementById('root')!);
  await act(async()=>root.render(render()));
  assert.equal(document.querySelector<HTMLInputElement>('input#name')!.value,'未保存员工');
 } finally {await act(async()=>root.unmount());clearTabScope('employee-cold');}
});

for (const name of ['SupplierDataPage', 'CustomerProductPage', 'EmployeePage', 'AdminPage']) {
 test(`${name} cold restoration keeps loaded results without repeating initialization`, async () => {
  const module = await import(`../src/pages/${name}.tsx`);
  const scope = `basic-${name}`;
  const record = getTabPage(scope, '/basic');
  const original = api.get; let calls = 0;
  api.get = (async (url: string) => {
   calls++;
   if (url.includes('/reminders')) return {expired: [], expiring: []};
   return url.includes('/kingdee/') ? {ok:true,data:[]} : [];
  }) as typeof api.get;
  let root=createRoot(document.getElementById('root')!);
  const render=()=>createElement(TabPageContext.Provider,{value:{record,instance:record.instance,active:true,restored:true,container:document.getElementById('root')}},createElement(module[name]));
  try {
   await act(async()=>root.render(render()));
   const initialCalls=calls; assert.ok(initialCalls > 0);assert.equal(record.adapted,true);
   await act(async()=>root.unmount());root=createRoot(document.getElementById('root')!);
   await act(async()=>root.render(render()));assert.equal(calls,initialCalls);
  } finally {await act(async()=>root.unmount());api.get=original;clearTabScope(scope);}
 });
}
