import assert from 'node:assert/strict';
import { test } from 'node:test';
import './standard-frontend-dom.ts';
import { act, createElement } from 'react';
import { api, ApiError } from '../src/lib/api.ts';
import { message } from 'antd';
import { getStandardDraftAction } from '../src/lib/standardDraftActions.ts';
import { StandardDraftActionButton } from '../src/components/standard/StandardDraftActionButton.tsx';
const {createRoot}=await import('react-dom/client');
const owner={id:'owner',role:'user' as const},other={id:'other',role:'user' as const},admin={id:'admin',role:'admin' as const};
test('draft ownership uses ids, pending withdrawal belongs only to submitter',()=>{
 const draft={status:'draft' as const,createdById:'owner',submittedById:'submitter'};
 assert.equal(getStandardDraftAction(draft,owner),'discard-draft');assert.equal(getStandardDraftAction(draft,{id:'submitter',role:'user'}),'discard-draft');
 assert.equal(getStandardDraftAction(draft,other),null);assert.equal(getStandardDraftAction(draft,admin),'discard-draft');
 assert.equal(getStandardDraftAction({...draft,createdById:'',submittedById:''},owner),null);
 assert.equal(getStandardDraftAction({...draft,status:'pending_review',submittedById:'owner'},owner),'withdraw');
 assert.equal(getStandardDraftAction({...draft,status:'pending_review',submittedById:'owner'},admin),null);
 assert.equal(getStandardDraftAction({...draft,status:'published'},admin),null);
});
test('withdraw and cleanup require confirmation, keep original snapshot and submit once',async()=>{
 const oldPost=api.post;
 try{for(const [action,hasPublished,label] of [['withdraw',false,'撤回审核'],['discard-draft',true,'放弃修改'],['discard-draft',false,'删除草稿']] as const){
  let calls=0,completed=0,finish:(value:unknown)=>void=()=>{};
  api.post=((url:string,body:unknown)=>{calls++;assert.equal(url,`/api/standards/s1/${action}`);assert.deepEqual(body,{versionId:'v2',revision:7});return new Promise(resolve=>{finish=resolve;});}) as typeof api.post;
  const root=createRoot(document.getElementById('root')!);
  try{
   await act(async()=>root.render(createElement(StandardDraftActionButton,{target:{id:'s1',serialNo:'SP1',versionId:'v2',revision:7},action,hasPublished,onCompleted:()=>completed++})));
   await act(()=>document.querySelector<HTMLButtonElement>(`button[aria-label="${label} SP1"]`)!.click());assert.equal(calls,0);
   const confirm=[...document.querySelectorAll('button')].find(b=>b.textContent?.replace(/\s/g,'')==='确认'+(action==='withdraw'?'撤回':hasPublished?'放弃':'删除'))!;
   await act(()=>{confirm.click();confirm.click();});assert.equal(calls,1);
   await act(async()=>finish({data:null}));assert.equal(completed,1);
  }finally{await act(()=>root.unmount());}
 }}finally{api.post=oldPost;}
});
test('open confirmation must retain the original revision when the row refreshes',async()=>{
 const oldPost=api.post;let submitted:unknown;
 api.post=(async(_url:string,body:unknown)=>{submitted=body;return {data:null};}) as typeof api.post;
 const root=createRoot(document.getElementById('root')!);
 const props={target:{id:'s1',serialNo:'SP1',versionId:'v2',revision:7},action:'withdraw' as const,hasPublished:false,onCompleted:()=>{}};
 try{
  await act(async()=>root.render(createElement(StandardDraftActionButton,props)));
  await act(()=>document.querySelector<HTMLButtonElement>('button[aria-label="撤回审核 SP1"]')!.click());
  await act(()=>root.render(createElement(StandardDraftActionButton,{...props,target:{...props.target,revision:9}})));
  const confirm=[...document.querySelectorAll('button')].find(b=>b.textContent?.replace(/\s/g,'')==='确认撤回')!;
  await act(async()=>{confirm.click();});assert.deepEqual(submitted,{versionId:'v2',revision:7});
 }finally{await act(()=>root.unmount());api.post=oldPost;}
});

test('a 409 response preserves the record and never reports completion or success',async()=>{
 const oldPost=api.post,oldSuccess=message.success,oldError=message.error;let completed=0,successes=0;const errors:string[]=[];
 api.post=(async()=>{throw new ApiError('版本冲突，请刷新后重试',409);}) as typeof api.post;
 message.success=((()=>{successes++;})) as typeof message.success;message.error=((text:unknown)=>{errors.push(String(text));}) as typeof message.error;
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>root.render(createElement(StandardDraftActionButton,{target:{id:'s1',serialNo:'SP1',versionId:'v2',revision:7},action:'withdraw',hasPublished:false,onCompleted:()=>completed++})));
  await act(()=>document.querySelector<HTMLButtonElement>('button[aria-label="撤回审核 SP1"]')!.click());
  await act(async()=>{[...document.querySelectorAll('button')].find(b=>b.textContent?.replace(/\s/g,'')==='确认撤回')!.click();});
  assert.equal(completed,0);assert.equal(successes,0);assert(errors[0].includes('版本冲突'));
  assert(document.querySelector('button[aria-label="撤回审核 SP1"]'));
 }finally{await act(()=>root.unmount());api.post=oldPost;message.success=oldSuccess;message.error=oldError;}
});
