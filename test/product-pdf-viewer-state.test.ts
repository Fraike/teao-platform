import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import './standard-frontend-dom.ts';
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import {ProductPdfViewer} from '../src/components/ProductPdfViewer.tsx';
import {productPdfResources} from '../src/lib/productPdfResources.ts';
import {TabPageContext} from '../src/lib/tabPageContext.tsx';
import {getTabPage} from '../src/lib/tabPageCache.ts';
const channel=globalThis.MessageChannel;Object.defineProperty(globalThis,'MessageChannel',{value:undefined,configurable:true,writable:true});
after(()=>{window.close();globalThis.MessageChannel=channel;});
test('PDF controls survive cold remount under the same tab snapshot',async()=>{
 const original=productPdfResources.document;
 const sheet={rotate:0,getViewport:()=>({width:300,height:200}),render:()=>({promise:Promise.resolve(),cancel:()=>{}})};
 productPdfResources.document=async()=>{await new Promise(r=>setTimeout(r,300));return ({document:{numPages:3,getPage:async()=>sheet},destroy:async()=>{}}) as Awaited<ReturnType<typeof original>>;};
 const record=getTabPage('test','pdf-state');const host=document.getElementById('root')!;
 let root=createRoot(host);
 const render=()=>act(async()=>{root.render(createElement(TabPageContext.Provider,{value:{record,instance:record.instance,active:true,restored:false,container:null}},createElement(ProductPdfViewer,{src:'/same-file',title:'test PDF'})));await new Promise(r=>setTimeout(r,20));});
 const click=async(text:string)=>{await act(async()=>{[...document.querySelectorAll('button')].find(b=>b.textContent===text)!.click();await new Promise(r=>setTimeout(r,20));});};
 try{
  await render();await act(async()=>{await new Promise(r=>setTimeout(r,350));});
  await click('＋');await click('右转');await click('下一页');
  assert.match(host.textContent!,/125%/);assert.match(host.textContent!,/2 \/ 3/);
  const viewer=document.querySelector('canvas')!.parentElement!;viewer.scrollTop=150;viewer.scrollLeft=60;
  await act(()=>viewer.dispatchEvent(new window.Event('scroll',{bubbles:true})));
  await act(()=>root.unmount());root=createRoot(host);await render();await act(async()=>{await new Promise(r=>setTimeout(r,350));});
  assert.match(host.textContent!,/125%/);assert.match(host.textContent!,/2 \/ 3/);
  assert.equal(record.snapshot.get('pdf:/same-file:rotation'),90);
  const restored=document.querySelector('canvas')!.parentElement!;assert.equal(restored.scrollTop,150);assert.equal(restored.scrollLeft,60);
 }finally{await act(()=>root.unmount());productPdfResources.document=original;}
});
