import assert from 'node:assert/strict';
import { test } from 'node:test';
import './standard-frontend-dom.ts';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from '../src/lib/api.ts';
import { StandardPendingActionModal } from '../src/components/standard/StandardPendingActionModal.tsx';
test('admin reject and discard require reasons, snapshot identity and one request',async()=>{
 const oldGet=api.get,oldPost=api.post;
 const version={id:'v2',versionNo:2,revision:4,status:'pending_review'};
 const detail={id:'s1',serialNo:'SP1',versions:[version]};
 api.get=(async()=>({data:detail})) as typeof api.get;
 try{for(const action of ['reject','delete'] as const){
  const root=createRoot(document.getElementById('root')!);let calls=0,completed=0,closed=0;let resolve:(v:unknown)=>void=()=>{};
  api.post=((url:string,body:unknown)=>{calls++;assert.equal(url,`/api/standards/s1/${action==='reject'?'review':'discard'}`);assert.deepEqual(body,action==='reject'?{versionId:'v2',revision:4,approve:false,comment:'重复录入'}:{versionId:'v2',revision:4,reason:'重复录入'});return new Promise(r=>{resolve=r;});}) as typeof api.post;
  try{
   await act(async()=>root.render(createElement(StandardPendingActionModal,{target:{id:'s1',serialNo:'SP1',versionNo:2,versionId:'v2',revision:4,action},onClose:()=>closed++,onCompleted:()=>completed++})));
   const button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.replace(/\s/g,'')===(action==='reject'?'确认驳回':'确认删除'))!;
   assert(button.disabled);
   await act(()=>{const input=document.querySelector(`textarea[aria-label="${action==='delete'?'删除':'驳回'}原因"]`)!;Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value')!.set!.call(input,'重复录入');input.dispatchEvent(new window.Event('input',{bubbles:true}));});
   if(action==='delete'){assert(button.disabled);await act(() => { document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); });}
   assert.equal(button.disabled,false,action+' reason/confirmation must enable submit');
   await act(()=>{button.click();button.click();});assert.equal(calls,1);assert.equal(closed,0);
   await act(async()=>resolve({data:detail,notification:{status:'not_configured'}}));assert.equal(completed,1);assert.equal(closed,1);
  }finally{await act(()=>root.unmount());}
 }}finally{api.get=oldGet;api.post=oldPost;}
});
test('stale pending version cannot be processed',async()=>{
 const oldGet=api.get;api.get=(async()=>({data:{versions:[{id:'new',versionNo:3,status:'pending_review'}]}})) as typeof api.get;
 const root=createRoot(document.getElementById('root')!);
 try{await act(async()=>root.render(createElement(StandardPendingActionModal,{target:{id:'s1',serialNo:'SP1',versionNo:2,versionId:'v2',revision:4,action:'delete'},onClose:()=>{},onCompleted:()=>{}})));assert(document.body.textContent?.includes('版本已变化'));}
 finally{await act(()=>root.unmount());api.get=oldGet;}
});

test('same version resubmitted at a newer revision requires the administrator to review again',async()=>{
 const oldGet=api.get;api.get=(async()=>({data:{versions:[{id:'v2',versionNo:2,status:'pending_review',revision:6}]}})) as typeof api.get;
 const root=createRoot(document.getElementById('root')!);
 try{await act(async()=>root.render(createElement(StandardPendingActionModal,{target:{id:'s1',serialNo:'SP1',versionNo:2,versionId:'v2',revision:4,action:'delete'},onClose:()=>{},onCompleted:()=>{}})));
 assert(document.body.textContent?.includes('版本已变化'));
 assert([...document.querySelectorAll('button')].find(b=>b.textContent?.replace(/\s/g,'')==='确认删除')!.disabled);
 }finally{await act(()=>root.unmount());api.get=oldGet;}
});
