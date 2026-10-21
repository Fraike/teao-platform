import { withEmptyPendingOverview } from './standard-pending-fixture.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import './standard-frontend-dom.ts';
import { act, createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ProductStandardPage } from '../src/pages/ProductStandardPage.tsx';
import { StandardDetailDrawer } from '../src/components/standard/StandardDetailDrawer.tsx';
import { api } from '../src/lib/api.ts';
import { useAuthStore } from '../src/lib/authStore.ts';
import { clearStandardQueryCache } from '../src/lib/standardQueryCache.ts';
import type { User } from '../src/types/auth.ts';
const {createRoot}=await import('react-dom/client');
Object.assign(globalThis,{HTMLBodyElement:window.HTMLBodyElement});
const categories=[{key:'gear_damper',name:'齿形阻尼器',fields:[]}];
const row={id:'s1',versionId:'v2',serialNo:'SP1',versionNo:2,revision:3,status:'pending_review',customer:'客户',model:'RD1',fields:{},categoryKey:'gear_damper',standardType:'formal',submittedById:'editor',assignedReviewerId:'reviewer'};
const wait=()=>act(async()=>{await new Promise(r=>setTimeout(r,30));});
test('admin can intervene from list; review permission alone does not expose administrator actions',async()=>{
 const oldGet=api.get;clearStandardQueryCache();
 api.get = withEmptyPendingOverview((async(url:string)=>({data:url.endsWith('/categories')?categories:[row],total:1,version:'admin-test'})) as typeof api.get);
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(()=>useAuthStore.setState({user:{id:'admin',name:'管理员',role:'admin',permissions:[]} as User}));
  await act(async()=>root.render(createElement(MemoryRouter,null,createElement(ProductStandardPage))));await wait();
  assert(document.querySelector('button[aria-label="管理员驳回 SP1"]'));
  assert(document.querySelector('button[aria-label="管理员删除待审 SP1"]'));
  await act(()=>useAuthStore.setState({user:{id:'other',name:'其他审核人',role:'user',permissions:['engineering_review']} as User}));await wait();
  assert.equal(document.querySelector('button[aria-label="管理员删除待审 SP1"]'),null);
  assert.equal(document.querySelector('button[aria-label="管理员驳回 SP1"]'),null);
 }finally{await act(()=>root.unmount());api.get=oldGet;clearStandardQueryCache();await act(()=>useAuthStore.setState({user:null}));}
});
test('detail lets admin reject/delete another reviewer task without granting approval override',async()=>{
 const oldGet=api.get;
 api.get = withEmptyPendingOverview((async(url:string)=>({data:url.includes('/reviewers')?[]:{...row,versions:[{...row,createdAt:'',updatedAt:'',publishedAt:'',submittedAt:'',reviewedAt:''}],changes:[]}})) as typeof api.get);
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(()=>useAuthStore.setState({user:{id:'admin',name:'管理员',role:'admin',permissions:[]} as User}));
  await act(async()=>root.render(createElement(StandardDetailDrawer,{open:true,standardId:'s1',categories,canEdit:true,canReview:true,allowDirectEdit:true,onClose:()=>{},onChanged:()=>{},onEdit:()=>{}})));await wait();
  const text=[...document.querySelectorAll('button')].map(b=>b.textContent?.replace(/\s/g,''));
  assert(text.includes('管理员驳回'));assert(text.includes('删除待审内容'));assert(!text.includes('通过并发布到群'));
 }finally{await act(()=>root.unmount());api.get=oldGet;await act(()=>useAuthStore.setState({user:null}));}
});
test('administrator archive filter exposes history and disables unsupported export',async()=>{
 const oldGet=api.get;clearStandardQueryCache();
 const urls:string[]=[];
 api.get = withEmptyPendingOverview((async(url:string)=>{urls.push(url);return {data:url.endsWith('/categories')?categories:[{...row,status:'deleted'}],total:1,version:'archive-test'};}) as typeof api.get);
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(()=>useAuthStore.setState({user:{id:'admin',name:'管理员',role:'admin',permissions:[]} as User}));
  await act(async()=>root.render(createElement(MemoryRouter,{initialEntries:['/product-standards?status=deleted']},createElement(ProductStandardPage))));await wait();
  assert(urls.some(url=>url.includes('status=deleted')));
  assert([...document.querySelectorAll('button')].find(b=>b.textContent?.includes('导出 / 打印'))!.disabled);
  assert.equal(document.querySelector('button[aria-label="管理员删除待审 SP1"]'),null);
  assert(document.querySelector('button[aria-label="变更历史 SP1"]'));
 }finally{await act(()=>root.unmount());api.get=oldGet;clearStandardQueryCache();await act(()=>useAuthStore.setState({user:null}));}
});
