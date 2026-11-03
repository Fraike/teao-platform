import assert from 'node:assert/strict';
import {test,mock} from 'node:test';
import './standard-frontend-dom.ts';
import {Activity,act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {getTabPage} from '../src/lib/tabPageCache.ts';
import {TabPageContext} from '../src/lib/tabPageContext.tsx';
let loads=0;
const rendered:{page:number;rotation:number}[]=[];
mock.module('../src/lib/productPdfResources.ts',{namedExports:{productPdfResources:{
 subscribe:()=>()=>{},releaseUnused:()=>{},document:async()=>{loads++;return {document:{numPages:3,getPage:async(page:number)=>({rotate:0,getViewport:({scale,rotation}:{scale:number;rotation:number})=>({width:800*scale,height:600*scale,rotation}),render:({viewport}:{viewport:{rotation:number}})=>{rendered.push({page,rotation:viewport.rotation});return {promise:Promise.resolve(),cancel(){}};}})}};},
}}});
const {ProductPdfViewer}=await import('../src/components/ProductPdfViewer.tsx');
const wait=()=>act(async()=>{await new Promise(r=>setTimeout(r,20));});
const button=(text:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===text)!;
const fullscreen=()=>document.querySelector('[role="dialog"][aria-label="测试图纸"]');

test('viewport fullscreen keeps one canvas/document and controls, supports Escape and focus return',async()=>{
 const host=document.getElementById('root')!,root=createRoot(host),bodyClass=document.body.className;
 try{
  await act(()=>root.render(createElement(ProductPdfViewer,{src:'fullscreen-controls',title:'测试图纸'})));await wait();
  await act(()=>button('下一页').click());await wait();await act(()=>button('＋').click());await wait();await act(()=>button('右转').click());await wait();
  const canvas=document.querySelector('canvas'),before=loads,enter=button('全屏查看');assert(enter,'fullscreen control is available');enter.focus();
  await act(()=>enter.click());await wait();
  assert(fullscreen());assert.equal(document.querySelector('canvas'),canvas);assert(!host.contains(canvas));assert(host.hasAttribute('inert'));
  assert.match(fullscreen()!.textContent!,/2 \/ 3/);assert.match(fullscreen()!.textContent!,/125%/);assert.deepEqual(rendered.at(-1),{page:2,rotation:90});assert.equal(loads,before);
  await act(()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));await wait();
  assert(!fullscreen());assert(host.contains(canvas));assert(!host.hasAttribute('inert'));assert.equal(document.body.className,bodyClass);assert.equal(document.activeElement,button('全屏查看'));
  await act(()=>button('全屏查看').click());await wait();await act(()=>button('退出全屏').click());await wait();assert(!fullscreen());assert.equal(loads,before);
 }finally{await act(()=>root.unmount());assert.equal(document.body.className,bodyClass);}
});

test('hiding the tab, changing the drawing or unmounting exits without restoring fullscreen later',async()=>{
 const host=document.getElementById('root')!,root=createRoot(host),record=getTabPage('fullscreen-test','viewer'),bodyClass=document.body.className;
 const render=(active:boolean,src='fullscreen-lifecycle')=>act(()=>root.render(createElement(Activity,{mode:active?'visible':'hidden'},createElement(TabPageContext.Provider,{value:{record,instance:record.instance,active,restored:false,container:null}},createElement(ProductPdfViewer,{src,title:'测试图纸'})))));
 try{
  await render(true);await wait();await act(()=>button('全屏查看').click());await wait();assert(fullscreen());
  await render(false);await wait();assert(!fullscreen());assert(!host.hasAttribute('inert'));assert.equal(document.body.className,bodyClass);
  await render(true);await wait();assert(!fullscreen());
  await act(()=>button('全屏查看').click());await wait();await render(true,'replacement-drawing');await wait();assert(!fullscreen());
  await act(()=>button('全屏查看').click());await wait();assert(fullscreen());
 }finally{await act(()=>root.unmount());assert(!fullscreen());assert(!host.hasAttribute('inert'));assert.equal(document.body.className,bodyClass);}
});
