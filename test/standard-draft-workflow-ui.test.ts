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
const user={id:'owner',name:'本人',username:'owner',role:'user',status:'active',permissions:['engineering_submit']} as User;
const categories=[{key:'gear_damper',name:'齿形阻尼器',fields:[{key:'test_standard',label:'测试标准'}]}];
const base={id:'s1',versionId:'v2',versionNo:2,revision:2,serialNo:'SP1',createdById:'owner',submittedById:'owner',assignedReviewerId:'reviewer',categoryKey:'gear_damper',standardType:'formal',model:'RD1',customer:'客户',fields:{test_standard:'90-100'},hasPending:true};
const wait=()=>act(async()=>{await new Promise(r=>setTimeout(r,30));});
const click=async(label:string)=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent?.replace(/\s/g,'')===label)!;assert(button,label+' exists');await act(async()=>{button.click();});await wait();};
test('list withdraws then discards a revision and removes all working-copy markers',async()=>{
 const oldGet=api.get,oldPost=api.post;let stage=0,calls=0;clearStandardQueryCache();
 const row=()=>stage===0?{...base,status:'pending_review'}:stage===1?{...base,revision:3,status:'draft',assignedReviewerId:''}:{...base,versionId:'v1',versionNo:1,revision:1,status:'published',hasPending:false,fields:{test_standard:'10-20'}};
 api.get = withEmptyPendingOverview((async(url:string)=>({ok:true,data:url.endsWith('/categories')?categories:[row()],total:1,version:String(stage)})) as typeof api.get);
 api.post=(async(url:string,body:unknown)=>{assert.equal(url,`/api/standards/s1/${stage===0?'withdraw':'discard-draft'}`);assert.deepEqual(body,{versionId:'v2',revision:stage===0?2:3});calls++;stage++;return {data:{...row(),versions:[row()],changes:[]}};}) as typeof api.post;
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(()=>useAuthStore.setState({user}));await act(async()=>root.render(createElement(MemoryRouter,null,createElement(ProductStandardPage))));await wait();
  await click('撤回审核');assert.equal(calls,0);await click('确认撤回');assert.equal(stage,1);
  assert(document.querySelector('.ant-table-row')?.textContent?.includes('有草稿'));
  await click('放弃修改');await click('确认放弃');assert.equal(calls,2);
  const text=document.querySelector('.ant-table-row')!.textContent!;assert(text.includes('已发布'));assert(text.includes('10-20'));assert(!text.includes('草稿'));assert(!text.includes('待审核'));assert(!text.includes('90-100'));
 }finally{await act(()=>root.unmount());api.get=oldGet;api.post=oldPost;clearStandardQueryCache();await act(()=>useAuthStore.setState({user:null}));}
});
test('deleting a first draft from detail closes the removed record',async()=>{
 const oldGet=api.get,oldPost=api.post;let closed=0,changed=0;
 const detail={...base,versions:[{...base,id:'v2',status:'draft',submittedById:'',submittedAt:'',createdAt:'',updatedAt:'',publishedAt:'',reviewedAt:''}],changes:[]};
 api.get = withEmptyPendingOverview((async(url:string)=>({data:url.endsWith('/reviewers')?[]:detail})) as typeof api.get);
 api.post=(async(url:string,body:unknown)=>{assert.equal(url,'/api/standards/s1/discard-draft');assert.deepEqual(body,{versionId:'v2',revision:2});return {data:null};}) as typeof api.post;
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(()=>useAuthStore.setState({user}));await act(async()=>root.render(createElement(StandardDetailDrawer,{open:true,standardId:'s1',categories,canEdit:true,canReview:false,onClose:()=>closed++,onChanged:data=>{assert.equal(data,null);changed++;},onEdit:()=>{}})));await wait();
  await click('删除草稿');await click('确认删除');assert.equal(closed,1);assert.equal(changed,1);
 }finally{await act(()=>root.unmount());api.get=oldGet;api.post=oldPost;await act(()=>useAuthStore.setState({user:null}));}
});
