import assert from 'node:assert/strict';
import { test } from 'node:test';
import './standard-frontend-dom.ts';
import { act, createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ProductStandardPage } from '../src/pages/ProductStandardPage.tsx';
import { StandardFormModal } from '../src/components/standard/StandardFormModal.tsx';
import { api } from '../src/lib/api.ts';
import { useAuthStore } from '../src/lib/authStore.ts';
import { clearStandardQueryCache } from '../src/lib/standardQueryCache.ts';
import { standardTypeDisplayLabel } from '../src/lib/standardFormat.ts';
import { standardVersionDiff } from '../src/lib/standardVersionDiff.ts';
import type { User } from '../src/types/auth.ts';
import type { StandardDetail,StandardVersion } from '../src/types/standard.ts';
const {createRoot}=await import('react-dom/client');
Object.assign(globalThis,{HTMLBodyElement:window.HTMLBodyElement});
const categories=[{key:'gear_damper',name:'齿形阻尼器',fields:[]}];
const row={id:'s1',versionId:'v1',versionNo:1,revision:1,serialNo:'SP1',createdById:'editor',categoryKey:'gear_damper',standardType:'formal',status:'published',customer:'客户',model:'RD1',fields:{},hasPending:false};
const wait=()=>act(async()=>{await new Promise(r=>setTimeout(r,30));});
test('direct retirement is an icon with its own permission; submitters get application instead',async()=>{
 const oldGet=api.get;api.get=(async(url:string)=>({data:url.endsWith('/categories')?categories:[row],version:'v1',total:1,overallTotal:7})) as typeof api.get;
 try{for(const [role,permissions,direct,apply] of [['admin',[],true,false],['user',['engineering_submit'],false,true],['user',['engineering_review'],false,false],['user',['engineering_retire'],true,false]] as const){
  clearStandardQueryCache();const root=createRoot(document.getElementById('root')!);
  try{
   await act(()=>useAuthStore.setState({user:{id:'person',name:'同事',role,permissions:[...permissions]} as User}));
   await act(async()=>root.render(createElement(MemoryRouter,null,createElement(ProductStandardPage))));await wait();
   assert(document.body.textContent?.includes('标准总数：7 条'));assert(document.body.textContent?.includes('当前筛选：1 条'));
   const directButton=document.querySelector('button[aria-label="停用标准 SP1"]');const applyButton=document.querySelector('button[aria-label="申请停用 SP1"]');
   assert.equal(Boolean(directButton),direct);assert.equal(Boolean(applyButton),apply);
   if(directButton)assert.equal(directButton.textContent,'','stop action is an icon rather than text');
  }finally{await act(()=>root.unmount());}
 }}finally{api.get=oldGet;await act(()=>useAuthStore.setState({user:null}));clearStandardQueryCache();}
});
test('only published rows claim to be formal standards',async()=>{
 const oldGet=api.get;
 try{for(const status of ['draft','pending_review','obsolete','deleted','archived']){
  clearStandardQueryCache();api.get=(async(url:string)=>({data:url.endsWith('/categories')?categories:[{...row,status}],version:status,total:1})) as typeof api.get;
  const root=createRoot(document.getElementById('root')!);
  try{await act(()=>useAuthStore.setState({user:{id:'editor',name:'工程',role:'user',permissions:['engineering_submit']} as User}));await act(async()=>root.render(createElement(MemoryRouter,null,createElement(ProductStandardPage))));await wait();assert(!document.querySelector('.ant-table-row')?.textContent?.includes('正式标准'));}
  finally{await act(()=>root.unmount());}
 }}finally{api.get=oldGet;clearStandardQueryCache();await act(()=>useAuthStore.setState({user:null}));}
});
test('new/edit/copy forms label the proposed nature without claiming publication',async()=>{
 const version={...row,id:'v1',status:'draft'} as unknown as StandardVersion;
 const detail={...row,versions:[version],changes:[]} as unknown as StandardDetail;
 try{
  await act(()=>useAuthStore.setState({user:{id:'editor',name:'工程',role:'user',permissions:['engineering_submit']} as User}));
  for(const mode of ['new','edit','copy']){
   const root=createRoot(document.getElementById('root')!);
   try{await act(async()=>root.render(createElement(StandardFormModal,{open:true,categories,initial:mode==='edit'?detail:null,copySource:mode==='copy'?detail:null,defaultCategoryKey:'gear_damper',onClose:()=>{},onSaved:()=>{}})));
    const text=document.querySelector('.ant-modal')!.textContent!;assert(!text.includes('正式标准'));assert(text.includes('拟发布性质'));assert(text.includes('常规'));
   }finally{await act(()=>root.unmount());}
  }
  const changes=standardVersionDiff({...version,status:'published'},version,categories);assert(!changes.some(change=>change.key==='standardType'),'status label must not invent a type change');
 }finally{await act(()=>useAuthStore.setState({user:null}));}
});

test('formal label is exclusive to published versions',()=>{
 for(const status of ['draft','pending_review','obsolete','deleted','archived'] as const) assert.equal(standardTypeDisplayLabel('formal',status),'常规');
 assert.equal(standardTypeDisplayLabel('formal','published'),'正式标准');
});
