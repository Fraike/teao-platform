import assert from 'node:assert/strict';
import {test,mock} from 'node:test';
import {mkdtempSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import './standard-frontend-dom.ts';
import {act,createElement} from 'react';
import type {ProductionRecord} from '../src/types/production.ts';
const directory=mkdtempSync(path.join(os.tmpdir(),'production-product-save-'));
Object.assign(process.env,{DATA_DIR:directory,PRODUCTION_DB_PATH:path.join(directory,'production.db'),JWT_SECRET:'local-product-save-test-secret-at-least-32',NODE_ENV:'test'});
const user={id:'operator',name:'操作员',username:'operator',role:'user',status:'active',permissions:['production'],passwordVersion:0};
writeFileSync(path.join(directory,'users.json'),JSON.stringify({users:[user]}));
const options=[{value:'current-a',productNumber:'SP-A',productName:'同名商品',label:'SP-A · 同名商品',spec:'规格A'},
 {value:'current-b',productNumber:'SP-B',productName:'同名商品',label:'SP-B · 同名商品',spec:'规格B'}];
mock.module('../src/lib/productionReferenceData.ts',{namedExports:{getFinishedProductOptions:async()=>options,getInjectionPlasticPartOptions:async()=>options,formatKingdeeRefreshMessage:()=>({level:"success",content:"测试"}),refreshKingdeeData:async()=>({}),getCustomerOptions:async()=>[{value:'客户',label:'客户'}],getEmployeeOptions:async()=>[],subscribeToProductionMaterialUpdates:()=>()=>{}}});
const {EntryDrawer}=await import('../src/components/production/EntryDrawer.tsx');
const {api}=await import('../src/lib/api.ts');
const {createRoot}=await import('react-dom/client');
const require=createRequire(new URL('../server/package.json',import.meta.url));
const express=require('express'),jwt=require('jsonwebtoken');
const store=await import('../server/services/production-store.js');
const {writeKingdeeCache}=await import('../server/services/kingdee-cache.js');
const {registerProductionEntryRoutes}=await import('../server/routes/production-entry.js');
writeKingdeeCache('categories',[]);
writeKingdeeCache('materials',options.map(o=>({id:o.value,name:o.productName,number:o.productNumber,spec:o.spec,parent_id:''})));
const tick=()=>act(async()=>{await new Promise(r=>setTimeout(r,40));});

test('copy legacy record, select a numbered same-name product, save and reopen from database',async()=>{
 const app=express();app.use(express.json());registerProductionEntryRoutes(app);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const address=server.address();assert(address&&typeof address==='object');
 const base=`http://127.0.0.1:${address.port}`,token=jwt.sign(user,process.env.JWT_SECRET);
 const previousPost=api.post;let payload:Record<string,unknown>|undefined,saved:ProductionRecord|undefined,closed=false;
 api.post=(async<T>(url:string,body:unknown)=>{payload=body as Record<string,unknown>;const response=await fetch(base+url,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body)});const result=await response.json();assert.equal(response.status,201,JSON.stringify(result));saved=result.data;return result as T;}) as typeof api.post;
 const legacy=store.createEntry({date:'2026-10-01',line:'1#',customer:'客户',productName:'历史旧商品',spec:'旧规格',dailyQty:3},user.name) as ProductionRecord;
 let root=createRoot(document.getElementById('root')!);
 try{
  await act(()=>root.render(createElement(EntryDrawer,{open:true,record:null,copyFrom:legacy,defaultDate:'',onClose:(ok:boolean)=>{closed=ok;}})));await tick();
  const product=[...document.querySelectorAll('.ant-select')].find(e=>e.textContent?.includes('历史旧商品'))?.querySelector<HTMLInputElement>('input[role="combobox"]');assert(product);
  await act(()=>product.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true})));await tick();
  const option=[...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find(e=>e.textContent?.includes('SP-B'))!;assert(option);
  await act(()=>option.click());await tick();
  const save=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.replace(/\s/g,'')==='保存')!;
  await act(()=>save.click());await tick();
  assert(closed,'save must complete');assert(saved);assert.equal(payload?.productId,'current-b');assert.equal(payload?.productNumber,'SP-B');
  assert.equal(saved.productId,'current-b');assert.equal(saved.productNumber,'SP-B');assert.equal(saved.productName,'同名商品');assert.equal(saved.spec,'规格B');
  await act(()=>root.unmount());
  const result=await(await fetch(base+'/api/production/entries?limit=100',{headers:{authorization:`Bearer ${token}`}})).json();
  const loaded=result.data.groups.flatMap((g:{records:ProductionRecord[]})=>g.records).find((r:ProductionRecord)=>r.id===saved!.id);assert(loaded);
  assert.deepEqual([loaded.productId,loaded.productNumber,loaded.productName,loaded.spec],['current-b','SP-B','同名商品','规格B']);
  root=createRoot(document.getElementById('root')!);
  await act(()=>root.render(createElement(EntryDrawer,{open:true,record:loaded,copyFrom:null,defaultDate:'',onClose:()=>{}})));await tick();
  assert([...document.querySelectorAll('.ant-select')].some(e=>e.textContent?.includes('SP-B')),'reopened selector must show the saved numbered product');
  assert.equal(store.getDB().prepare('SELECT product_name FROM assembly_records WHERE id=?').get(legacy.id).product_name,'历史旧商品');
 }finally{await act(()=>root.unmount());api.post=previousPost;await new Promise<void>(r=>server.close(()=>r()));store.closeDB();}
});

test('editing product identity normalizes the tuple and rejects foreign or missing products while old historical edits remain valid',async()=>{
 store.initDB();
 const {registerProductionEntryInjectionRoutes}=await import('../server/routes/production-entry-injection.js');
 const app=express();app.use(express.json());registerProductionEntryRoutes(app);registerProductionEntryInjectionRoutes(app);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const address=server.address();assert(address&&typeof address==='object');
 const token=jwt.sign(user,process.env.JWT_SECRET),base=`http://127.0.0.1:${address.port}`;
 const put=async(id:number,body:unknown,department='assembly')=>{const response=await fetch(base+(department==='assembly'?'/api/production/entries/':'/api/production/injection/entries/')+id,{method:'PUT',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
 try{
  const old=store.createEntry({date:'2026-10-01',line:'1#',customer:'客户',productName:'历史名',spec:'历史规格'},user.name);
  const unchanged=await put(old.id,{dailyQty:7});assert.equal(unchanged.status,200);assert.equal(unchanged.body.data.productName,'历史名');
  const changed=await put(old.id,{productId:'current-b',productNumber:'伪造料号',productName:'伪造品名',spec:'旧规格'});
  assert.equal(changed.status,200);assert.deepEqual([changed.body.data.productId,changed.body.data.productNumber,changed.body.data.productName,changed.body.data.spec],['current-b','SP-B','同名商品','规格B']);
  assert.equal((await put(old.id,{productId:'not-found'})).status,400);
  assert.equal((await put(old.id,{productId:''})).status,400);
  const injection=store.createInjectionEntry({date:'2026-10-01',machine:'1#',shift:'白班',productName:'历史注塑品'},user.name);
  assert.equal((await put(injection.id,{productId:'current-b'},'injection')).status,400,'assembly-only products cannot be selected for injection');
  const row=store.getDB().prepare('SELECT product_id,product_number,product_name,spec FROM assembly_records WHERE id=?').get(old.id);
  assert.deepEqual([row.product_id,row.product_number,row.product_name,row.spec],['current-b','SP-B','同名商品','规格B']);
 }finally{await new Promise<void>(r=>server.close(()=>r()));store.closeDB();}
});

test('injection edit also restores a numbered product when names are duplicated',async()=>{
 store.initDB();
 const {ProductionEntryInjectionPage}=await import('../src/pages/ProductionEntryInjectionPage.tsx');
 const {useAuthStore}=await import('../src/lib/authStore.ts');
 const previousGet=api.get,previousUser=useAuthStore.getState().user;
 useAuthStore.setState({user:{...user,role:'admin'} as typeof previousUser});
 const record=store.createInjectionEntry({date:'2026-11-02',machine:'1#',shift:'白班',productId:'current-b',productNumber:'SP-B',productName:'同名商品',dailyQty:3},user.name);
 api.get=(async<T>(url:string)=>({ok:true,data:url.includes('/machines')?['1#']:{groups:[{date:record.date,records:[record],summary:{machines:1,totalOrderQty:0,totalDailyQty:3,totalCumulativeQty:0,totalDefects:0,qualifiedRate:1,totalBackorder:0}}],total:1,hasMore:false}} as T)) as typeof api.get;
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(()=>root.render(createElement(ProductionEntryInjectionPage)));await tick();
  const edit=document.querySelector('[data-icon="edit"]')?.closest('button');assert(edit);await act(()=>edit.click());await tick();
  assert([...document.querySelectorAll('[role="dialog"] .ant-select')].some(e=>e.textContent?.includes('SP-B')),'injection form must restore productId/number instead of legacy name');
 }finally{await act(()=>root.unmount());api.get=previousGet;useAuthStore.setState({user:previousUser});store.closeDB();}
});
