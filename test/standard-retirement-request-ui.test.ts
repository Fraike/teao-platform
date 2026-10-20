import assert from 'node:assert/strict';
import { test } from 'node:test';
import './standard-frontend-dom.ts';
import { act, createElement } from 'react';
import { api } from '../src/lib/api.ts';
import { StandardRetireModal } from '../src/components/standard/StandardRetireModal.tsx';
const {createRoot}=await import('react-dom/client');
Object.assign(globalThis,{HTMLBodyElement:window.HTMLBodyElement});
test('unprivileged retirement is an application requiring an eligible reviewer',async()=>{
 const oldGet=api.get,oldPost=api.post;let calls=0,finished=0;
 api.get=(async(url:string)=>({data:url.endsWith('retirement-reviewers')?[{id:'direct',name:'可停用人员'}]:{versions:[{id:'v1',versionNo:1,revision:3,status:'published'}]}})) as typeof api.get;
 api.post=(async(url:string,body:unknown)=>{calls++;assert.equal(url,'/api/standards/s1/retirement-requests');assert.deepEqual(body,{versionId:'v1',revision:3,reason:'客户停产',reviewerId:'direct'});return {data:{id:'s1'},notification:{status:'not_configured'}};}) as typeof api.post;
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>root.render(createElement(StandardRetireModal,{direct:false,target:{id:'s1',serialNo:'SP1',versionNo:1,versionId:'v1',revision:3},onClose:()=>{},onRetired:()=>finished++})));
  assert(document.body.textContent?.includes('申请停用'));const textarea=document.querySelector<HTMLTextAreaElement>('textarea[aria-label="停用原因"]')!;
  await act(()=>{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value')!.set!.call(textarea,'客户停产');textarea.dispatchEvent(new window.Event('input',{bubbles:true}));});
  const submit=[...document.querySelectorAll('button')].find(b=>b.textContent?.replace(/\s/g,'')==='提交申请')!;assert(submit.disabled);assert.equal(calls,0);
  await act(()=>document.querySelector('.ant-select-selector')!.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true})));
  await act(()=>[...document.querySelectorAll('.ant-select-item-option')].find(e=>e.textContent?.includes('可停用人员'))!.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));
  await act(async()=>{submit.click();submit.click();});assert.equal(calls,1);assert.equal(finished,1);
 }finally{await act(()=>root.unmount());api.get=oldGet;api.post=oldPost;}
});

test('designated retirement reviewer approves from detail panel and duplicate clicks stay single',async()=>{
 const {StandardRetirementPanel}=await import('../src/components/standard/StandardRetirementPanel.tsx');
 const {useAuthStore}=await import('../src/lib/authStore.ts');
 const oldGet=api.get,oldPost=api.post;let calls=0,changed=0;
 const request={id:'r1',versionId:'v1',versionRevision:3,applicantId:'editor',applicantName:'工程',reviewerId:'direct',reviewerName:'可停用人员',reason:'客户停产',status:'pending',revision:1};
 api.get=(async()=>({data:[request]})) as typeof api.get;
 let finish:(value:unknown)=>void=()=>{};
 api.post=((url:string,body:unknown)=>{calls++;assert.equal(url,'/api/standards/s1/retirement-requests/r1/review');assert.deepEqual(body,{revision:1,approve:true,comment:''});return new Promise(resolve=>{finish=resolve;});}) as typeof api.post;
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(()=>useAuthStore.setState({user:{id:'direct',name:'可停用人员',username:'direct',status:'active',role:'user',permissions:['engineering_retire']}}));
  await act(async()=>root.render(createElement(StandardRetirementPanel,{standardId:'s1',versionKey:'v1:3',canRetire:true,onChanged:()=>changed++})));
  const button=(text:string)=>[...document.querySelectorAll('button')].find(b=>b.textContent?.replace(/\s/g,'')===text)!;
  await act(()=>button('批准停用').click());assert.equal(calls,0);
  await act(()=>{button('确认批准停用').click();button('确认批准停用').click();});assert.equal(calls,1);
  await act(async()=>finish({request:{...request,status:'approved',revision:2},data:{id:'s1'}}));assert.equal(changed,1);
  assert(document.body.textContent?.includes('已批准停用'));assert.equal(button('批准停用'),undefined);
 }finally{await act(()=>root.unmount());api.get=oldGet;api.post=oldPost;await act(()=>useAuthStore.setState({user:null}));}
});

test('application from detail immediately refreshes the request panel and disables repeat application',async()=>{
 const {StandardDetailDrawer}=await import('../src/components/standard/StandardDetailDrawer.tsx');
 const {useAuthStore}=await import('../src/lib/authStore.ts');
 const oldGet=api.get,oldPost=api.post;let submitted=false,reads=0,changed=0;
 const version={id:'v1',versionNo:1,revision:3,standardType:'formal',status:'published',categoryKey:'gear_damper',customer:'客户',model:'RD1',fields:{},createdAt:'',updatedAt:'',publishedAt:'',reviewedAt:''};
 const detail={id:'s1',serialNo:'SP1',categoryKey:'gear_damper',versions:[version],changes:[]};
 const request={id:'r1',versionId:'v1',versionRevision:3,applicantId:'editor',applicantName:'工程',reviewerId:'direct',reviewerName:'可停用人员',reason:'客户停产',status:'pending',revision:1};
 api.get=(async(url:string)=>{
  if(url.endsWith('/retirement-requests')){reads++;return {data:submitted?[request]:[]};}
  if(url.endsWith('/retirement-reviewers'))return {data:[{id:'direct',name:'可停用人员'}]};
  if(url.endsWith('/reviewers'))return {data:[]};
  return {data:detail};
 }) as typeof api.get;
 api.post=(async()=>{submitted=true;return {data:detail,notification:{status:'not_configured'}};}) as typeof api.post;
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(()=>useAuthStore.setState({user:{id:'editor',name:'工程',username:'editor',role:'user',status:'active',permissions:['engineering_submit']}}));
  await act(async()=>root.render(createElement(StandardDetailDrawer,{open:true,standardId:'s1',categories:[{key:'gear_damper',name:'齿形阻尼器',fields:[]}],canEdit:true,canReview:false,canRetire:false,onClose:()=>{},onEdit:()=>{},onChanged:()=>changed++})));
  const trigger=[...document.querySelectorAll('button')].find(b=>b.textContent?.replace(/\s/g,'')==='申请停用')!;
  await act(()=>trigger.click());
  await act(()=>{const textarea=document.querySelector<HTMLTextAreaElement>('textarea[aria-label="停用原因"]')!;Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value')!.set!.call(textarea,'客户停产');textarea.dispatchEvent(new window.Event('input',{bubbles:true}));});
  await act(()=>document.querySelector('.ant-select-selector')!.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true})));
  await act(()=>[...document.querySelectorAll('.ant-select-item-option')].find(e=>e.textContent?.includes('可停用人员'))!.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));
  await act(async()=>{[...document.querySelectorAll('button')].find(b=>b.textContent?.replace(/\s/g,'')==='提交申请')!.click();});
  assert.equal(changed,1);assert(reads>=2,'pending request panel must refresh without a standard revision change');
  assert(document.querySelector('[aria-label="停用申请记录"]')?.textContent?.includes('客户停产'));
  assert(trigger.disabled,'existing pending request disables repeat application');
 }finally{await act(()=>root.unmount());api.get=oldGet;api.post=oldPost;await act(()=>useAuthStore.setState({user:null}));}
});
