import assert from 'node:assert/strict';import {test} from 'node:test';
import './standard-frontend-dom.ts';import {act,createElement} from 'react';import {createRoot} from 'react-dom/client';
import {StandardFormModal} from '../src/components/standard/StandardFormModal.tsx';
import {useAuthStore} from '../src/lib/authStore.ts';import {api} from '../src/lib/api.ts';
import type {StandardDetail,StandardCategory} from '../src/types/standard.ts';
import type {User} from '../src/types/auth.ts';
const published={id:'standard',serialNo:'MAINT-UI',categoryKey:'gear_damper',standardType:'formal',versions:[{id:'published',serialNo:'MAINT-UI',versionNo:1,revision:1,status:'published',customer:'客户',model:'型号',categoryKey:'gear_damper',standardType:'formal',fields:{}}],changes:[]} as StandardDetail;
const categories:StandardCategory[]=[{key:'gear_damper',name:'齿轮阻尼器',fields:[]}];
const button=(label:string)=>[...document.querySelectorAll('button')].find(node=>node.textContent?.replace(/\s/g,'')===label)!;

test('maintenance changes only existing edits; copies remain drafts and blocked work cannot be saved',async()=>{
 const oldUser=useAuthStore.getState().user,put=api.put,post=api.post;
 useAuthStore.setState({user:{id:'editor',role:'user',permissions:['engineering_submit','engineering_maintain']} as User});
 const calls:{method:string;body:Record<string,unknown>}[]=[];
 api.put=(async(_url:string,body:Record<string,unknown>)=>{calls.push({method:'PUT',body});return {data:published};}) as typeof api.put;
 api.post=(async(_url:string,body:Record<string,unknown>)=>{calls.push({method:'POST',body});return {data:{...published,versions:[{...published.versions[0],status:'draft'}]}};}) as typeof api.post;
 const root=createRoot(document.getElementById('root')!);
 let props={open:true,categories,maintenance:true,directPublish:false,initial:published as StandardDetail|null,copySource:undefined as StandardDetail|undefined,onClose(){},onSaved(){}};
 const render=()=>act(async()=>root.render(createElement(StandardFormModal,props)));
 try{
  await render();assert.ok(button('保存并生效（校对）'));await act(async()=>button('保存并生效（校对）').click());
  assert.equal(calls[0].body.maintenance,true);assert.equal(calls[0].body.versionId,'published');
  props={...props,initial:null,copySource:published};await render();assert.ok(button('保存草稿'));
  await act(async()=>button('保存草稿').click());assert.equal(calls[1].method,'POST');assert.equal(calls[1].body.maintenance,undefined);
  const draft={...published.versions[0],id:'draft',status:'draft',createdById:'other',updatedById:'other'} as StandardDetail['versions'][number];
  props={...props,copySource:undefined,initial:{...published,versions:[draft,...published.versions]}};await render();
  assert.equal(button('保存并生效（校对）').disabled,true);assert.match(document.body.textContent||'',/其他人的修订草稿/);
  props={...props,open:false};await render();props={...props,open:true,initial:{...published,versions:[{...draft,createdById:'editor',updatedById:'editor'},...published.versions]}};await render();
  assert.equal(button('保存并生效（校对）').disabled,false);
  props={...props,maintenance:false};await render();assert.ok(button('保存草稿'));
 }finally{await act(()=>root.unmount());api.put=put;api.post=post;useAuthStore.setState({user:oldUser});}
});

import {MemoryRouter} from 'react-router-dom';
import {ProductStandardPage} from '../src/pages/ProductStandardPage.tsx';
import {clearStandardQueryCache} from '../src/lib/standardQueryCache.ts';
import {withEmptyPendingOverview} from './standard-pending-fixture.ts';

test('opening edit refreshes maintenance capability without reloading the cached product list',async()=>{
 const user=useAuthStore.getState().user,get=api.get;
 useAuthStore.setState({user:{id:'editor',role:'user',permissions:['engineering_submit','engineering_maintain']} as User});
 clearStandardQueryCache();
 let listCalls=0;
 api.get=withEmptyPendingOverview((async(url:string)=>{
   if(url==='/api/standards/categories')return {data:categories};
   if(url.startsWith('/api/standards?')){listCalls++;return {data:[{...published,...published.versions[0],id:published.id,updatedAt:'2026-11-01T00:00:00Z'}],total:1,overallTotal:1,version:'old',canEdit:true,canReview:false,canMaintain:false,maintenanceEnabled:false};}
   if(url===`/api/standards/${published.id}?summary=true`)return {ok:true,data:published,canEdit:true,canReview:false,canMaintain:true,maintenanceEnabled:true};
   throw new Error('unexpected '+url);
 }) as typeof api.get);
 const root=createRoot(document.getElementById('root')!);
 try{
   await act(async()=>root.render(createElement(MemoryRouter,null,createElement(ProductStandardPage))));
   await act(async()=>new Promise(resolve=>setTimeout(resolve,30)));
   const edit=document.querySelector<HTMLButtonElement>('button[aria-label="编辑标准 MAINT-UI"]');assert.ok(edit);
   await act(async()=>edit.click());
   assert.ok(button('保存并生效（校对）'));
   assert.match(document.body.textContent||'',/校对模式已开启/);
   assert.equal(listCalls,1);
 }finally{await act(()=>root.unmount());api.get=get;useAuthStore.setState({user});clearStandardQueryCache();}
});
