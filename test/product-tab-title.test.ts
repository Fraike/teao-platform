import assert from 'node:assert/strict';import {test} from 'node:test';import './standard-frontend-dom.ts';import {useTabStore} from '../src/lib/tabStore.ts';
test('product tabs persist different titles and subtitles without changing active tab',()=>{
 const s=useTabStore.getState();s.openTab({key:'/materials/p1',label:'商品详情'});s.openTab({key:'/materials/p2',label:'商品详情'});s.renameTab('/materials/p1','SP001-A','RD-T001-15');s.renameTab('/materials/p2','SP002-A','RD-T001-80');
 assert.equal(useTabStore.getState().activeKey,'/materials/p2');assert.equal(useTabStore.getState().tabs.find(t=>t.key==='/materials/p1')?.subtitle,'RD-T001-15');
 assert.equal(JSON.parse(localStorage.getItem('teao_tabs_v2')!).tabs.find((t:{key:string})=>t.key==='/materials/p2').label,'SP002-A');
});

test('standard number entry resolves to concrete product tab and preserves customer context',async()=>{
 const {createElement,act,useEffect}=await import('react');const {createRoot}=await import('react-dom/client');const {MemoryRouter,Routes,Route,useLocation}=await import('react-router-dom');
 const {ProductArchiveDetailPage}=await import('../src/pages/ProductArchiveDetailPage.tsx');const {api}=await import('../src/lib/api.ts');
 const original=api.get;api.get=(async<T>(url:string)=>({data:url.includes('/resolve')?{id:'p-resolved'}:{id:'p-resolved',internalNumber:'SP-RESOLVED',name:'RD-T001-15',kingdeeId:null,material:null,standards:[],issues:[],productionAvailable:true},drawings:[],canManage:false,sync:{}} as T)) as typeof api.get;
 function Shell(){const location=useLocation();useEffect(()=>{if(location.pathname!=='/materials/number')useTabStore.getState().openTab({key:location.pathname,label:'商品详情'});},[location.pathname]);return createElement('div',{'data-location':location.pathname+location.search},createElement(Routes,null,createElement(Route,{path:'/materials/:id',element:createElement(ProductArchiveDetailPage)})));}
 const root=createRoot(document.getElementById('root')!);
 try{await act(()=>root.render(createElement(MemoryRouter,{initialEntries:['/materials/number?number=SP-RESOLVED&standardId=s1&returnTo=%2Fmaterials%3Fseries%3DT001']},createElement(Shell))));await act(async()=>{await new Promise(r=>setTimeout(r,100));});
 const location=document.querySelector('[data-location]')!.getAttribute('data-location')!;assert(location.startsWith('/materials/p-resolved?'));assert(location.includes('standardId=s1'));assert(location.includes('returnTo='));assert.equal(useTabStore.getState().tabs.find(t=>t.key==='/materials/p-resolved')?.label,'SP-RESOLVED');
 }finally{await act(()=>root.unmount());api.get=original;}
});
