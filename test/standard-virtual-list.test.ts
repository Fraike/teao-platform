import assert from 'node:assert/strict';
import {test} from 'node:test';
import './standard-frontend-dom.ts';
import {act,createElement,StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {ProductStandardPage} from '../src/pages/ProductStandardPage.tsx';
import {api} from '../src/lib/api.ts';
import {clearStandardQueryCache} from '../src/lib/standardQueryCache.ts';
import {clearStandardPageSession} from '../src/lib/standardPageSession.ts';
import {withEmptyPendingOverview} from './standard-pending-fixture.ts';
import {ResponsiveTable} from '../src/components/ResponsiveTable.tsx';
import {TabPageContext} from '../src/lib/tabPageContext.tsx';
import {getTabPage,startTabInstance,clearTabScope} from '../src/lib/tabPageCache.ts';

test('346 standards remain available without mounting all rows or adding pagination',async()=>{
 const originalGet=api.get,originalPost=api.post;clearStandardQueryCache();clearStandardPageSession();
 const rows=Array.from({length:346},(_,i)=>({id:`row-${i}`,serialNo:`SP${i}`,categoryKey:'gear_damper',categoryName:'齿轮阻尼器',standardType:'formal',status:'published',versionNo:1,customer:'客户',model:'T001',customerPartNo:'',vehicleModel:'',fields:{gear_spec:'11齿3.0MM\n第二种齿轮'},hasPending:false,updatedAt:'',updatedBy:'',reviewComment:''}));
 api.get=withEmptyPendingOverview((async(url:string)=>{
  if(url==='/api/standards/categories')return {data:[{key:'gear_damper',name:'齿轮阻尼器',fields:[{key:'gear_spec',label:'齿轮规格'}]}]};
  const data=new URL(url,'http://local').searchParams.get('serialNo')?rows.slice(0,3):rows;
  return {data,total:data.length,overallTotal:rows.length,version:'virtual-test'};
 }) as typeof api.get);
 api.post=(async()=>({data:[]})) as typeof api.post;
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(()=>root.render(createElement(MemoryRouter,null,createElement(ProductStandardPage))));
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,60))});
  const mounted=document.querySelectorAll('[data-row-key]').length;
  assert(mounted>0&&mounted<80,`mounted ${mounted} rows; viewport rendering must bound DOM size`);
  assert(document.body.textContent?.includes('346'));
  assert.equal(document.querySelector('.ant-pagination'),null);
  await act(()=>[...document.querySelectorAll('th')].find(cell=>cell.textContent?.includes('内部料号'))!.querySelector<HTMLElement>('.ant-table-filter-trigger')!.click());
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,50))});
  const input=document.querySelector<HTMLInputElement>('input[placeholder="筛选内部料号"]')!;
  await act(()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,'SP1');input.dispatchEvent(new window.Event('input',{bubbles:true}))});
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,230))});
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,25))});
  assert.equal(document.querySelectorAll('[data-row-key]').length,3,'the filtered response must actually be rendered');
  assert.equal(document.querySelector('input[placeholder="筛选内部料号"]'),input,'filter remains mounted when the result becomes small');
  assert.equal(document.activeElement,input);
  assert(document.querySelector('.ant-table-tbody-virtual-holder'),'retain the virtual renderer across filtering to avoid replacing the table subtree');
 }finally{await act(()=>root.unmount());api.get=originalGet;api.post=originalPost;clearStandardQueryCache();clearStandardPageSession();}
});

test('StrictMode cold restore preserves a horizontal snapshot through effect replay',async()=>{
 const record=getTabPage('virtual-strict-test','standards');record.active=true;
 const instance=startTabInstance(record);record.snapshot.set('table:scroll',{top:1440,left:180,anchorId:'row-45',anchorOffset:0});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(()=>root.render(createElement(StrictMode,null,createElement(TabPageContext.Provider,{value:{record,instance,active:true,restored:true,container:host}},createElement(ResponsiveTable,{virtual:true,minWidth:1200,fitViewport:true,bottomScrollbar:false,rowKey:'id',pagination:false,dataSource:Array.from({length:100},(_,i)=>({id:`row-${i}`})),columns:[{dataIndex:'id',width:1200}]})))));
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,300))});
  assert.equal(host.querySelector<HTMLElement>('.ant-table-header')?.scrollLeft,180);
  assert.equal((record.snapshot.get('table:scroll') as {left:number}).left,180);
 }finally{await act(()=>root.unmount());clearTabScope('virtual-strict-test');host.remove();}
});

test('quickly switching between small and virtual lists keeps recording later scrolls',async()=>{
 const record=getTabPage('virtual-mode-test','standards');record.active=true;const instance=startTabInstance(record);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const rows=Array.from({length:100},(_,i)=>({id:`row-${i}`}));
 const render=(virtual:boolean)=>act(()=>root.render(createElement(TabPageContext.Provider,{value:{record,instance,active:true,restored:true,container:host}},createElement(ResponsiveTable,{virtual,minWidth:1200,fitViewport:true,bottomScrollbar:false,rowKey:'id',pagination:false,dataSource:virtual?rows:rows.slice(0,20),columns:[{dataIndex:'id',width:1200}]}))));
 try{
  await render(true);record.snapshot.set('table:scroll',{top:1440,left:0});
  await render(false);await render(true);
  await act(()=>{const body=host.querySelector<HTMLElement>('.ant-table-tbody-virtual-holder')!;body.scrollTop=2000;body.dispatchEvent(new window.Event('scroll'))});
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,80))});
  assert.equal((record.snapshot.get('table:scroll') as {top:number}).top,2000);
 }finally{await act(()=>root.unmount());clearTabScope('virtual-mode-test');host.remove();}
});
