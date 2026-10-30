import assert from 'node:assert/strict';import {test,mock,after} from 'node:test';
import './standard-frontend-dom.ts';
import {createElement,act} from 'react';import {createRoot} from 'react-dom/client';
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>new Response('%PDF-mock');after(()=>{globalThis.fetch=originalFetch;});
let loads=0;let renderError='',loadError='';const rendered:{rotation:number;width:number;height:number}[]=[];
mock.module('../src/lib/productPdf.ts',{namedExports:{loadProductPdf:()=>{
 loads++;
 if(loadError)return {promise:Promise.reject(new Error(loadError)),destroy:async()=>{}};
 const page={rotate:270,getViewport:({scale,rotation=270}:{scale:number;rotation?:number})=>({rotation,width:(rotation%180===0?595:842)*scale,height:(rotation%180===0?842:595)*scale}),render:({viewport}:{viewport:{rotation:number;width:number;height:number}})=>{rendered.push(viewport);return {promise:Promise.resolve(),cancel(){}};}};
 if(renderError)page.render=()=>({promise:Promise.reject(new Error(renderError)),cancel(){}});
 return {promise:Promise.resolve({numPages:1,getPage:async()=>page}),destroy:async()=>{}};
}}});
const {ProductPdfViewer}=await import('../src/components/ProductPdfViewer.tsx');
const wait=()=>act(async()=>{await new Promise(r=>setTimeout(r,40));});
test('temporary rotations respect native rotation, refit, reset on file change and never reload the current PDF',async()=>{
 const root=createRoot(document.getElementById('root')!);
 const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.getAttribute('aria-label')===label)!;
 try {
  await act(()=>root.render(createElement(ProductPdfViewer,{src:'blob:first',title:'图纸'})));await wait();
  assert.equal(rendered.at(-1)?.rotation,270);
  const right=button('向右旋转90度');assert(right,'rotation control is visible to all viewers');
  for(const angle of [0,90,180,270]){await act(()=>right.click());await wait();assert.equal(rendered.at(-1)?.rotation,angle);assert(rendered.at(-1)!.width<=700.001);assert(rendered.at(-1)!.height<=450.001);}
  await act(()=>button('向左旋转90度').click());await wait();assert.equal(rendered.at(-1)?.rotation,180);
  await act(()=>button('复位图纸方向').click());await wait();assert.equal(rendered.at(-1)?.rotation,270);
  await act(()=>right.click());await wait();assert.equal(loads,1,'rotation uses the loaded document');
  await act(()=>root.render(createElement(ProductPdfViewer,{src:'blob:second',title:'另一张图'})));await wait();
  assert.equal(rendered.at(-1)?.rotation,270);assert.equal(loads,2);
 }finally{await act(()=>root.unmount());}
});

test('left drag pans overflow, stops on release and double-click centers the selected point',async()=>{
 const root=createRoot(document.getElementById('root')!);
 try {
  await act(()=>root.render(createElement(ProductPdfViewer,{src:'blob:pan',title:'图纸'})));await wait();
  const canvas=document.querySelector('canvas')!,viewer=canvas.parentElement!;
  let captured=0,released=0;
  canvas.setPointerCapture=()=>{captured++;};canvas.hasPointerCapture=()=>true;canvas.releasePointerCapture=()=>{released++;};
  for(const [key,value] of Object.entries({clientWidth:600,clientHeight:400,scrollWidth:1200,scrollHeight:800}))Object.defineProperty(viewer,key,{configurable:true,value});
  canvas.getBoundingClientRect=()=>({left:10,top:20,width:600,height:400,right:610,bottom:420,x:10,y:20,toJSON(){}});
  await act(()=>canvas.dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true,clientX:310,clientY:220})));await wait();
  assert(Math.abs(viewer.scrollLeft-(rendered.at(-1)!.width/2-300))<0.01);
  assert(Math.abs(viewer.scrollTop-(rendered.at(-1)!.height/2-200))<0.01);
  const send=(target:Element,type:string,x:number,y:number,button=0)=>{const event=new window.MouseEvent(type,{bubbles:true,clientX:x,clientY:y,button});Object.defineProperty(event,'pointerId',{value:1});target.dispatchEvent(event);};
  viewer.scrollLeft=100;viewer.scrollTop=70;
  await act(()=>{send(canvas,'pointerdown',150,100);send(viewer,'pointermove',100,80);});
  assert.equal(viewer.scrollLeft,150);assert.equal(viewer.scrollTop,90);
  await act(()=>{send(viewer,'pointerup',100,80);send(viewer,'pointermove',80,60);});assert.equal(viewer.scrollLeft,150);
  assert.equal(captured,1,'capture belongs to canvas so subsequent double-clicks still target it');assert.equal(released,1);
  await act(()=>{send(canvas,'pointerdown',150,100,2);send(viewer,'pointermove',100,80);});assert.equal(viewer.scrollLeft,150);
 }finally{await act(()=>root.unmount());}
});

test('load failures show help only after failure and never automatically open a dialog',async()=>{
 const root=createRoot(document.getElementById('root')!);loadError='文件加载失败';
 try {
  await act(()=>root.render(createElement(ProductPdfViewer,{src:'blob:load-error',title:'图纸'})));await wait();
  assert.match(document.body.textContent!,/文件加载失败/);assert.match(document.body.textContent!,/显示不完整/);
  assert(!document.querySelector('[role="dialog"]'));
 }finally{await act(()=>root.unmount());loadError='';}
});

test('healthy preview hides incomplete display help; double click toggles 150 percent without reloading',async()=>{
 const root=createRoot(document.getElementById('root')!);
 try {
  await act(()=>root.render(createElement(ProductPdfViewer,{src:'blob:help',title:'图纸'})));await wait();
  assert(!document.body.textContent?.includes('显示不完整'));
  const before=loads,canvas=document.querySelector('canvas')!;
  await act(()=>canvas.dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true,clientX:100,clientY:100})));await wait();
  assert.match(document.body.textContent!,/150%/);
  await act(()=>canvas.dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true})));await wait();
  assert.match(document.body.textContent!,/100%/);assert.equal(loads,before);
 }finally{await act(()=>root.unmount());}
});

test('render failures show centered help and retain actual error without an automatic dialog',async()=>{
 const root=createRoot(document.getElementById('root')!);renderError='r.toHex is not a function';
 try {
  await act(()=>root.render(createElement(ProductPdfViewer,{src:'blob:render-error',title:'图纸'})));await wait();
  assert.match(document.body.textContent!,/r.toHex is not a function/);
  assert(!document.querySelector('[role="dialog"]'));
  const help=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='显示不完整');assert(help);
  assert(document.querySelector('canvas')!.parentElement!.contains(help));
  await act(()=>help.click());await wait();
  assert(document.querySelector('[role="dialog"]'));
  assert.match(document.body.textContent!,/Microsoft Edge/);
  assert(document.querySelector('a[href="https://www.microsoft.com/zh-cn/edge/download"]'));
 }finally{await act(()=>root.unmount());renderError='';}
});
