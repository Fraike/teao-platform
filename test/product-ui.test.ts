import assert from 'node:assert/strict';
import { test } from 'node:test';
import './standard-frontend-dom.ts';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { api } from '../src/lib/api.ts';
import { useAuthStore } from '../src/lib/authStore.ts';
import { ProductArchiveDetailPage } from '../src/pages/ProductArchiveDetailPage.tsx';
import type { ProductArchive } from '../src/types/product.ts';
const product:ProductArchive={id:'local-1',internalNumber:'SP1',kingdeeId:null,name:'无金蝶商品',model:'M1',category:'成品',categoryId:'2342097486262423552',group:'finished',unit:'',material:null,kingdeeMissing:false,standards:[{id:'s1',serialNo:'SP1',customer:'甲',customerPartNo:'CP1',model:'M1',categoryKey:'gear',categoryName:'成品',versionNo:1,fields:{}}],issues:[],drawingCount:0,productionAvailable:true};
const wait=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,60));});
test('standard-only product resolves by internal number and reader sees missing drawing, never upload',async()=>{
 const original=api.get;const calls:string[]=[];
 api.get=(async<T>(url:string)=>{calls.push(url);return (url.startsWith('/api/products/resolve')?{data:{id:product.id}}:{ok:true,data:product,drawings:[],canManage:false,sync:{lastSuccessAt:null,error:null}}) as T;}) as typeof api.get;
 useAuthStore.setState({user:{id:'reader',name:'产线',username:'reader',role:'user',status:'active',permissions:['production']},initialized:true});
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(()=>root.render(createElement(MemoryRouter,{initialEntries:['/materials/number?number=SP1&standardId=s1']},createElement(Routes,null,createElement(Route,{path:'/materials/:id',element:createElement(ProductArchiveDetailPage)})))));await wait();
  assert(calls.includes('/api/products/resolve?number=SP1'));assert(calls.includes('/api/products/local-1'));assert(!calls.some(url=>url.endsWith('/kingdee')));
  assert.match(document.body.textContent!,/未关联金蝶/);assert.match(document.body.textContent!,/缺少有效图纸/);
  const print=[...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.includes('打印图纸'))!;assert(print.disabled);
  assert(![...document.querySelectorAll('button')].some(button=>button.textContent?.includes('上传图纸')));
  assert(document.querySelector('a[href="/product-standards?standardId=s1"]'));
  const guide=[...document.querySelectorAll<HTMLButtonElement>('header button')].find(button=>button.textContent?.includes('使用指南'));assert(guide);
  assert(!document.querySelector('.ant-collapse'));
  await act(()=>guide.click());await wait();assert(document.querySelector('[role="dialog"]'));
  assert.match(document.querySelector('[role="dialog"]')!.textContent!,/T001-15/);
 }finally{await act(()=>root.unmount());api.get=original;}
});

test('catalog defaults to gear; category clicks filter locally and retain list URL', async () => {
 const { ProductArchivePage } = await import('../src/pages/ProductArchivePage.tsx');
 const { buildProductCategoryTree, countProductCategories, PRODUCT_CATEGORY_IDS: ids } = await import('../server/shared/product-classification.ts');
 const products: ProductArchive[] = [
  {...product, id:'gear',internalNumber:'GEAR-ONLY',name:'RD-T001-15',standards:[{...product.standards[0],model:'RD-T001-15'}],category:'齿轮阻尼器'},
  {...product, id:'semi',internalNumber:'SEMI-ONLY',category:'塑胶配件',categoryId:ids.plastic,group:'semi'},
 ];
 const original=api.get;const calls:string[]=[];
 api.get=(async<T>(url:string)=>{calls.push(url);return url === '/api/products/semi' || url === '/api/products/gear' ? {ok:true,data:products[url.endsWith('/gear') ? 0 : 1],drawings:[],canManage:false,sync:{lastSuccessAt:null}} as T : {ok:true,data:products,categories:countProductCategories(buildProductCategoryTree([]),products),sync:{lastSuccessAt:null}} as T;}) as typeof api.get;
 const originalUser=useAuthStore.getState().user;
 useAuthStore.setState({user:{...originalUser!,role:'admin'}});
 const root=createRoot(document.getElementById('root')!);
 try {
  await act(()=>root.render(createElement(MemoryRouter,{initialEntries:['/materials']},createElement(Routes,null,createElement(Route,{path:'/materials',element:createElement(ProductArchivePage)}),createElement(Route,{path:'/materials/:id',element:createElement(ProductArchiveDetailPage)})))));await wait();
  assert.match(document.body.textContent!,/T001/);
  assert([...document.querySelectorAll('header button')].some(button=>button.textContent?.includes('使用指南')));
  assert(!document.body.textContent!.includes('批量导入成品PDF'));
  assert(!document.querySelector('a[href^="/materials/gear"]'));
  await act(()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('查看具体规格'))!.click());await wait();
  assert(document.querySelector('a')?.href.includes('/materials/gear?returnTo='));
  assert.equal(calls.length,1);
  assert.match(document.body.textContent!,/GEAR-ONLY/);assert(!document.body.textContent!.includes('SEMI-ONLY'));
  const semi=[...document.querySelectorAll('.ant-tree-title')].find(el=>el.textContent?.startsWith('半成品'))!;
  await act(()=>semi.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));await wait();
  assert.match(document.body.textContent!,/SEMI-ONLY/);assert(!document.body.textContent!.includes('GEAR-ONLY'));
  assert.match(document.body.textContent!,/缺少有效图纸/);assert(!document.body.textContent!.includes('客户标准'));
  assert.equal(calls.length,1);
  assert(document.querySelector('a')?.getAttribute('href')?.includes(encodeURIComponent(ids.semi)));
  await act(()=>document.querySelector<HTMLAnchorElement>('a')!.click());await wait();
  assert(document.querySelector('[data-node-key="drawings"].ant-tabs-tab-active'));
  await act(()=>document.querySelector<HTMLButtonElement>('button[aria-label="返回商品资料"]')!.click());await wait();
  assert.match(document.body.textContent!,/SEMI-ONLY/);assert(!document.body.textContent!.includes('GEAR-ONLY'));
  assert.match(document.querySelector('.ant-tree-node-selected')!.textContent!,/半成品/);
  await act(()=>[...document.querySelectorAll('.ant-tree-title')].find(el=>el.textContent?.startsWith('齿轮阻尼器'))!.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));await wait();
  await act(()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('查看具体规格'))!.click());await wait();
  await act(()=>document.querySelector<HTMLAnchorElement>('a')!.click());await wait();
  await act(()=>document.querySelector<HTMLButtonElement>('button[aria-label="返回商品资料"]')!.click());await wait();
  assert.match(document.body.textContent!,/GEAR-ONLY/);
  assert([...document.querySelectorAll('button')].some(b=>b.textContent==='返回系列'));
  await act(()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='返回系列')!.click());await wait();
  assert(!document.querySelector('a[href^="/materials/gear"]'));

 } finally {await act(()=>root.unmount());api.get=original;useAuthStore.setState({user:originalUser});}
});

test('all series and specifications remain visible even with legacy pagination URLs', async()=>{
 const { ProductArchivePage }=await import('../src/pages/ProductArchivePage.tsx');
 const { buildProductCategoryTree }=await import('../server/shared/product-classification.ts');
 const make=(model:string,id:string):ProductArchive=>({...product,id,internalNumber:id,kingdeeId:id,name:model,standards:[]});
 const products=[...Array.from({length:51},(_,i)=>make(`RD-T001-${i+1}`,`VAR-${i+1}`)),...Array.from({length:25},(_,i)=>make(`RD-T${String(i+2).padStart(3,'0')}-15`,`SER-${i+2}`))];
 const original=api.get;
 api.get=(async<T>()=>({ok:true,data:products,categories:buildProductCategoryTree([]),sync:{lastSuccessAt:null}} as T)) as typeof api.get;
 const root=createRoot(document.getElementById('root')!);
 try {
  await act(()=>root.render(createElement(MemoryRouter,{initialEntries:['/materials?seriesPage=2&page=2&pageSize=20']},createElement(ProductArchivePage))));await wait();
  const cards=[...document.querySelectorAll<HTMLButtonElement>('button')].filter(b=>b.textContent?.includes('查看具体规格'));
  assert.equal(cards.length,26);assert(cards[0].textContent?.startsWith('T001'));
  assert(!document.querySelector('.ant-pagination'));
  await act(()=>cards[0].click());await wait();
  assert.equal(document.querySelectorAll('tbody tr.ant-table-row').length,51);
  assert(!document.querySelector('.ant-pagination'));
  assert.match(document.body.textContent!,/VAR-51/);
 } finally {await act(()=>root.unmount());api.get=original;}
});

test('Kingdee custom fields show package 2000, grams weight and snapshot warehouse with one detail request',async()=>{
 const original=api.get;const calls:string[]=[];
 const snapshot={id:'k-fields',number:'SP0001-A',name:'RD-T001-15',stock_id:'w1',stock_name:'成品仓',base_unit_name:'个'};
 const detail={id:'k-fields',number:'SP0001-A',name:'RD-T001-15',stock_id:'w1',min_package_qty:0,custom_field:{custom_field__1__5s8xx4pvvzzjia:'2000',custom_field__2__5ug7lp875jr2:'0.38'}};
 api.get=(async<T>(url:string)=>{calls.push(url);return (url.endsWith('/kingdee')?{data:detail,fetchedAt:'2026-10-28T03:00:00Z',stale:false}:{data:{...product,id:'p-fields',internalNumber:'SP0001-A',kingdeeId:'k-fields',material:snapshot,unit:'个'},drawings:[],canManage:false,sync:{}}) as T;}) as typeof api.get;
 useAuthStore.setState({user:{id:'reader',name:'产线',username:'reader',role:'user',status:'active',permissions:['production']},initialized:true});
 const root=createRoot(document.getElementById('root')!);
 try{await act(()=>root.render(createElement(MemoryRouter,{initialEntries:['/materials/p-fields']},createElement(Routes,null,createElement(Route,{path:'/materials/:id',element:createElement(ProductArchiveDetailPage)})))));await wait();await wait();
 assert.match(document.body.textContent!,/2,000 个/);assert.match(document.body.textContent!,/成品仓/);assert.match(document.body.textContent!,/0\.380 g/);assert.equal(calls.filter(url=>url.endsWith('/kingdee')).length,1);
 }finally{await act(()=>root.unmount());api.get=original;}
});

test('global unlinked quick count opens the PMC queue across categories without another request', async () => {
 const { ProductArchivePage } = await import('../src/pages/ProductArchivePage.tsx');
 const { buildProductCategoryTree, PRODUCT_CATEGORY_IDS: ids } = await import('../server/shared/product-classification.ts');
 const products:ProductArchive[]=[
  {...product,id:'never',internalNumber:'SP-NEVER',standards:[product.standards[0],{...product.standards[0],id:'s2'}]},
  {...product,id:'missing',internalNumber:'SP-MISSING',kingdeeId:'old-id',kingdeeMissing:true,categoryId:ids.barrel},
  {...product,id:'linked',internalNumber:'SP-LINKED',kingdeeId:'linked-id'},
  {...product,id:'history',internalNumber:'SP-HISTORY',standards:[],productionAvailable:false},
 ];
 const original=api.get;const calls:string[]=[];
 api.get=(async<T>(url:string)=>{calls.push(url);return {ok:true,data:products,categories:buildProductCategoryTree([]),sync:{lastSuccessAt:null}} as T;}) as typeof api.get;
 const root=createRoot(document.getElementById('root')!);
 try {
  await act(()=>root.render(createElement(MemoryRouter,{initialEntries:[`/materials?category=${ids.gear}&q=hidden&series=stale&page=2&seriesPage=2`]},createElement(ProductArchivePage))));await wait();
  const quick=document.querySelector<HTMLButtonElement>('button[aria-label="未关联金蝶：2 个商品"]');
  assert(quick,'global count includes deleted/missing Kingdee products and deduplicates customer standards');
  await act(()=>quick.click());await wait();
  const table=document.querySelector('tbody')!;
  assert.match(table.textContent!,/SP-NEVER/);assert.match(table.textContent!,/SP-MISSING/);
  assert(!table.textContent!.includes('SP-LINKED'));assert(!table.textContent!.includes('SP-HISTORY'));
  assert.match(table.textContent!,/金蝶本次未返回/);
  assert.match(document.body.textContent!,/PMC/);
  const returnTo=new URL(document.querySelector<HTMLAnchorElement>('a[href^="/materials/never?"]')!.href).searchParams.get('returnTo')!;
  const params=new URL(returnTo,'http://local').searchParams;
  assert.equal(params.get('category'),'all');assert.equal(params.get('scope'),'unlinked');
  for(const key of ['q','series','page','seriesPage'])assert(!params.has(key));
  assert.equal(calls.length,1,'quick entry must reuse the loaded product list');
 }finally{await act(()=>root.unmount());api.get=original;}
});

 test('semi detail ignores URL customer context and hides every standard entry',async()=>{
 const original=api.get;
 api.get=(async<T>()=>({data:{...product,group:'semi',categoryId:'2314559979366968320'},drawings:[],canManage:false,sync:{}} as T)) as typeof api.get;
 const root=createRoot(document.getElementById('root')!);
 try{
 await act(()=>root.render(createElement(MemoryRouter,{initialEntries:['/materials/local-1?standardId=s1']},createElement(Routes,null,createElement(Route,{path:'/materials/:id',element:createElement(ProductArchiveDetailPage)})))));await wait();
 assert(!document.querySelector('[aria-label="适用客户标准"]'));
 assert(!document.querySelector('a[href^="/product-standards"]'));
 assert(!document.querySelector('[data-node-key="standards"]'));
 }finally{await act(()=>root.unmount());api.get=original;}
 });

test('managed semi category shows local series, original fields and missing drawings without finished products',async()=>{
 const {ProductArchivePage}=await import('../src/pages/ProductArchivePage.tsx');
 const {buildProductCategoryTree,PRODUCT_CATEGORY_IDS:ids}=await import('../server/shared/product-classification.ts');
 const original=api.get;
 const semi={...product,id:'plastic',name:'RD-T008 下盖黑色 POM',model:'原规格',group:'semi' as const,categoryId:ids.plastic,category:'塑胶配件',kingdeeId:'k-semi',standards:[]};
 api.get=(async<T>()=>({data:[product,semi],categories:buildProductCategoryTree([]),sync:{}} as T)) as typeof api.get;
 const root=createRoot(document.getElementById('root')!);
 try{
 await act(()=>root.render(createElement(MemoryRouter,{initialEntries:[`/materials?category=${ids.plastic}&scope=missing`]},createElement(ProductArchivePage))));await wait();
 const cards=[...document.querySelectorAll<HTMLButtonElement>('button')].filter(b=>b.textContent?.includes('查看具体规格'));
 assert.equal(cards.length,1);assert.match(cards[0].textContent!,/T008/);assert(!document.querySelector('.ant-pagination'));
 await act(()=>cards[0].click());await wait();
 const body=document.querySelector('tbody')!.textContent!;
 assert.match(body,/RD-T008 下盖黑色 POM/);assert.match(body,/原规格/);assert.match(body,/缺少有效图纸/);assert(!body.includes('无金蝶商品'));
 assert.match(document.body.textContent!,/共用系列/);assert(!document.body.textContent!.includes('客户标准'));
 }finally{await act(()=>root.unmount());api.get=original;}
});

test('rope category directly lists materials and ignores old series URLs',async()=>{
 const {ProductArchivePage}=await import('../src/pages/ProductArchivePage.tsx');
 const {buildProductCategoryTree}=await import('../server/shared/product-classification.ts');
 const original=api.get;
 const rope={...product,id:'rope',internalNumber:'S0001',name:'145MM硬拉绳-18.5MM',model:'原规格',group:'semi' as const,categoryId:'2314560542703938560',category:'绳子',kingdeeId:'rope',standards:[]};
 api.get=(async<T>()=>({data:[rope],categories:buildProductCategoryTree([]),sync:{}} as T)) as typeof api.get;
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(()=>root.render(createElement(MemoryRouter,{initialEntries:['/materials?category=2314560542703938560&series=old&scope=missing']},createElement(ProductArchivePage))));await wait();
  assert.match(document.querySelector('tbody')?.textContent||'',/145MM硬拉绳/);
  assert(!document.body.textContent?.includes('查看具体规格'));assert(!document.body.textContent?.includes('未识别系列'));
  assert(!document.body.textContent?.includes('共用系列'));assert(!document.querySelector('.ant-pagination'));
 }finally{await act(()=>root.unmount());api.get=original;}
});
