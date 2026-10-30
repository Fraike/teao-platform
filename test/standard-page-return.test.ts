import assert from 'node:assert/strict';import {test} from 'node:test';
import './standard-frontend-dom.ts';
import {createElement,act} from 'react';import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,useNavigate} from 'react-router-dom';
import {ProductStandardPage} from '../src/pages/ProductStandardPage.tsx';
import {ProductArchiveDetailPage} from '../src/pages/ProductArchiveDetailPage.tsx';
import {api} from '../src/lib/api.ts';
import {clearStandardQueryCache} from '../src/lib/standardQueryCache.ts';
import {withEmptyPendingOverview} from './standard-pending-fixture.ts';
import type {StandardListItem} from '../src/types/standard.ts';
const wait=(ms=70)=>act(async()=>{await new Promise(r=>setTimeout(r,ms));});
const items=['one','two','three'].map((id,index)=>({id,serialNo:index<2?'SP1':'SP2',categoryKey:'gear_damper',categoryName:'齿轮阻尼器',standardType:'formal',status:'published',versionNo:1,customer:id,model:'T001',customerPartNo:'',vehicleModel:'',fields:{},updatedAt:'2026-10-28T00:00:00Z',hasPending:false})) as StandardListItem[];
const setInput=async(input:HTMLInputElement,value:string)=>act(()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));});
test('standard number round trips restore exact row/filter/scroll through back, detail return and tab navigation',async()=>{
 clearStandardQueryCache();const original=api.get,originalNow=Date.now;let listCalls=0,versionCalls=0,changed=false;let navigate:ReturnType<typeof useNavigate>;
 const data={id:'product',internalNumber:'SP1',kingdeeId:null,name:'T001',model:'',category:'齿轮阻尼器',unit:'',productionAvailable:true,standards:items.slice(0,2).map(s=>({...s,fields:{}})),issues:[],drawingCount:0};
 api.get=withEmptyPendingOverview((async(url:string)=>{
  if(url==='/api/standards/categories')return {data:[{key:'gear_damper',name:'齿轮阻尼器',fields:[]}]};
  if(url==='/api/products/resolve?number=SP1')return {data:{id:'product'}};
  if(url==='/api/products/product')return {data,drawings:[],sync:{},canManage:false};
  if(url==='/api/standards/version'){versionCalls++;return {version:changed?'v2':'v1'};}
  if(url.startsWith('/api/standards?')){listCalls++;const serial=new URL(url,'http://local').searchParams.get('serialNo')||'';const rows=items.filter(s=>s.serialNo.includes(serial)&&(!changed||s.id!=='two'));return {data:rows,total:rows.length,version:changed?'v2':'v1',canEdit:false,canReview:false};}
  throw new Error(`unexpected ${url}`);
 }) as typeof api.get);
 function Controls(){navigate=useNavigate();return null;}
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(()=>root.render(createElement(MemoryRouter,{initialEntries:['/product-standards']},createElement(Controls),createElement(Routes,null,createElement(Route,{path:'/product-standards',element:createElement(ProductStandardPage)}),createElement(Route,{path:'/materials/:id',element:createElement(ProductArchiveDetailPage)})))));await wait();
  const th=[...document.querySelectorAll('th')].find(el=>el.textContent?.includes('内部料号'))!;
  await act(()=>th.querySelector<HTMLElement>('.ant-table-filter-trigger')!.click());await wait();
  await setInput(document.querySelector<HTMLInputElement>('input[placeholder="筛选内部料号"]')!,'SP1');await wait(260);await wait(20);
  assert.equal(document.querySelectorAll('.ant-table-row').length,2);
  const initialCalls=listCalls;
  const open=async()=>{
   const body=document.querySelector<HTMLElement>('.ant-table-body')!;body.scrollTop=320;body.scrollLeft=180;
   const row=document.querySelector('tr[data-row-key="two"]')!;
   const link=row.querySelector<HTMLAnchorElement>('a[href^="/materials/number"]')!;
   assert.equal(new URL(link.href).searchParams.get('returnTo'),'/product-standards');
   await act(()=>link.click());await wait();await wait();
  };
  const restored=()=>{
   assert.equal(document.querySelectorAll('.ant-table-row').length,2);
   assert(document.querySelector('tr[data-row-key="two"]'));
   assert.equal(document.querySelector<HTMLElement>('.ant-table-body')!.scrollTop,320);
   assert.equal(document.querySelector<HTMLElement>('.ant-table-body')!.scrollLeft,180);
   assert.equal(listCalls,initialCalls,'fresh return reuses list data');
  };
  await open();await act(()=>navigate!(-1));await wait();restored();
  await open();await act(()=>document.querySelector<HTMLButtonElement>('button[aria-label="返回产品标准"]')!.click());await wait();restored();
  await open();await act(()=>navigate!('/product-standards'));await wait();restored();
  await open();Date.now=()=>originalNow()+31000;await act(()=>navigate!('/product-standards'));await wait();await wait();restored();assert.equal(versionCalls,1);
  await open();changed=true;Date.now=()=>originalNow()+62000;await act(()=>navigate!('/product-standards'));await wait();await wait();await wait();
  assert.equal(versionCalls,2);assert.equal(listCalls,initialCalls+1);assert.equal(document.querySelectorAll('.ant-table-row').length,1);assert(!document.querySelector('tr[data-row-key="two"]'));
  const header=[...document.querySelectorAll('th')].find(el=>el.textContent?.includes('内部料号'))!;assert(header.querySelector('.ant-table-filter-trigger.active')||header.querySelector('.ant-table-filter-trigger')?.className.includes('active'));
 }finally{await act(()=>root.unmount());api.get=original;Date.now=originalNow;clearStandardQueryCache();}
});
