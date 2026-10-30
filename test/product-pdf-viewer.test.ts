import assert from 'node:assert/strict';import {test,mock,after} from 'node:test';
import './standard-frontend-dom.ts';
import {createElement,act} from 'react';import {createRoot} from 'react-dom/client';
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>new Response('%PDF-mock');after(()=>{globalThis.fetch=originalFetch;});
let loads=0;let renderError='';const rendered:{rotation:number;width:number;height:number}[]=[];
mock.module('../src/lib/productPdf.ts',{namedExports:{loadProductPdf:()=>{
 loads++;
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

test('incomplete display help offers official browser downloads without forced navigation',async()=>{
 const root=createRoot(document.getElementById('root')!);
 try {
  await act(()=>root.render(createElement(ProductPdfViewer,{src:'blob:help',title:'图纸'})));await wait();
  const help=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='显示不完整？');assert(help);
  await act(()=>help.click());await wait();
  assert.match(document.body.textContent!,/Microsoft Edge/);
  assert(document.querySelector('a[href="https://www.microsoft.com/zh-cn/edge/download"]'));
  assert(document.querySelector('a[href="https://www.google.cn/chrome/"]'));
 }finally{await act(()=>root.unmount());}
});

test('render failures automatically show browser help while retaining the actual error',async()=>{
 const root=createRoot(document.getElementById('root')!);renderError='r.toHex is not a function';
 try {
  await act(()=>root.render(createElement(ProductPdfViewer,{src:'blob:render-error',title:'图纸'})));await wait();
  assert.match(document.body.textContent!,/r.toHex is not a function/);
  assert(document.querySelector('[role="dialog"]'));
  assert.match(document.body.textContent!,/Microsoft Edge/);
 }finally{await act(()=>root.unmount());renderError='';}
});
