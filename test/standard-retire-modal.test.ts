import assert from 'node:assert/strict';
import { test } from 'node:test';
import './standard-frontend-dom.ts';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from '../src/lib/api.ts';
import { StandardRetireModal } from '../src/components/standard/StandardRetireModal.tsx';
test('retirement requires reason, submits snapshot once and reports updated detail',async()=>{
 const oldGet=api.get,oldPost=api.post; let calls=0,closed=0,changed=0;
 let finish:(value:unknown)=>void=()=>{};
 const detail={id:'s1',serialNo:'SP1',versions:[{id:'v1',versionNo:2,revision:7,status:'published'}]};
 api.get=(async()=>({data:detail})) as typeof api.get;
 api.post=((url:string,body:unknown)=>{calls++;assert.equal(url,'/api/standards/s1/retire');assert.deepEqual(body,{versionId:'v1',revision:7,reason:'客户停产'});return new Promise(resolve=>{finish=resolve;});}) as typeof api.post;
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>root.render(createElement(StandardRetireModal,{target:{id:'s1',serialNo:'SP1',versionNo:2,versionId:'v1',revision:7},onClose:()=>closed++,onRetired:()=>changed++})));
  const confirm=Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.replace(/\s/g,'')==='确认停用')!;
  assert(confirm.disabled);assert.equal(calls,0);
  const input=document.querySelector('textarea')!;
  await act(()=>{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value')!.set!.call(input,'客户停产');input.dispatchEvent(new window.Event('input',{bubbles:true}));});
  await act(()=>{confirm.click();confirm.click();});assert.equal(calls,1);assert.equal(closed,0);
  await act(async()=>finish({data:{...detail,versions:[{...detail.versions[0],status:'obsolete'}]}}));
  assert.equal(changed,1);assert.equal(closed,1);
 }finally{await act(()=>root.unmount());api.get=oldGet;api.post=oldPost;}
});
test('new revision must not be silently retired from an old list',async()=>{
 const oldGet=api.get;api.get=(async()=>({data:{versions:[{id:'v2',versionNo:3,status:'published',revision:1}]}})) as typeof api.get;
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>root.render(createElement(StandardRetireModal,{target:{id:'s1',serialNo:'SP1',versionNo:2,versionId:'v1',revision:7},onClose:()=>{},onRetired:()=>{}})));
  assert(document.body.textContent?.includes('版本已变化'));
  assert(Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.replace(/\s/g,'')==='确认停用')!.disabled);
 }finally{await act(()=>root.unmount());api.get=oldGet;}
});
test('a working revision cannot be retired even if its version number still matches',async()=>{
 const oldGet=api.get;api.get=(async()=>({data:{versions:[{id:'v2',versionNo:2,status:'draft',revision:1},{id:'v1',versionNo:1,status:'published',revision:1}]}})) as typeof api.get;
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>root.render(createElement(StandardRetireModal,{target:{id:'s1',serialNo:'SP1',versionNo:2,versionId:'v1',revision:7},onClose:()=>{},onRetired:()=>{}})));
  assert(document.body.textContent?.includes('请先处理修订稿'));
  assert(Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.replace(/\s/g,'')==='确认停用')!.disabled);
 }finally{await act(()=>root.unmount());api.get=oldGet;}
});
