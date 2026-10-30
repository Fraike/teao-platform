import assert from 'node:assert/strict';
import {test,after,mock} from 'node:test';
import './standard-frontend-dom.ts';
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import {ProductDrawingUpload} from '../src/components/ProductDrawingUpload.tsx';
import type {ProductArchive,ProductDrawingInput} from '../src/types/product.ts';
let validationPages=[{width:842,height:595}];
mock.module('../src/lib/productPdf.ts',{namedExports:{loadProductPdf:()=>({promise:Promise.resolve({numPages:validationPages.length,getPage:async(number:number)=>({getViewport:()=>validationPages[number-1],cleanup(){}})}),destroy:async()=>{}})}});
const originalChannel=globalThis.MessageChannel;
Object.defineProperty(globalThis,'MessageChannel',{value:undefined,configurable:true,writable:true});
after(()=>Object.defineProperty(globalThis,'MessageChannel',{value:originalChannel,configurable:true,writable:true}));
const product:ProductArchive={id:'p1',internalNumber:'SP0015-A',kingdeeId:'k1',name:'RD-T008-28',model:'20-40',category:'齿轮阻尼器',categoryId:'2342097486262423552',group:'finished',unit:'个',material:{id:'k1',number:'SP0015-A',name:'RD-T008-28'},kingdeeMissing:false,standards:[],issues:[],drawingCount:0,productionAvailable:true};
const wait=()=>act(async()=>{await new Promise(r=>setTimeout(r,50));});
test('manual upload defaults to series drawing number, A1 and geared; edits survive parent refresh',async()=>{
 const original=globalThis.fetch;let metadata:ProductDrawingInput|undefined;let saved=0;
 globalThis.fetch=(async(url)=>{metadata=JSON.parse(new URL(String(url),'http://local').searchParams.get('metadata')!);return new Response('{}',{status:201});}) as typeof fetch;
 const root=createRoot(document.getElementById('root')!);
 const render=(p:ProductArchive)=>act(()=>root.render(createElement(ProductDrawingUpload,{product:p,open:true,onClose(){},onSaved(){saved++;}})));
 try {
  await render(product);await wait();
  assert.equal(document.querySelector<HTMLInputElement>('#drawingNo')!.value,'RD-T008');
  assert.equal(document.querySelector<HTMLInputElement>('#version')!.value,'A1');
  assert.equal(document.querySelector('#structure')?.closest('.ant-select')?.querySelector('.ant-select-selection-item')?.textContent,'有齿轮');
  const drawingNo=document.querySelector<HTMLInputElement>('#drawingNo')!;
  await act(()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(drawingNo,'RD-T008 客户补充说明');drawingNo.dispatchEvent(new window.Event('input',{bubbles:true}));});
  await render({...product});await wait();assert.equal(drawingNo.value,'RD-T008 客户补充说明');
  const file=document.querySelector<HTMLInputElement>('#drawing-file')!;
  Object.defineProperty(file,'files',{configurable:true,value:[new File(['%PDF-'],'图纸.pdf',{type:'application/pdf'})]});
  await act(()=>file.dispatchEvent(new window.Event('change',{bubbles:true})));await wait();
  await act(()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='确认上传并发布')!.click());await wait();
  assert.equal(saved,1);assert.equal(metadata?.drawingNo,'RD-T008 客户补充说明');assert.equal(metadata?.version,'A1');assert.equal(metadata?.structure,'geared');assert.equal(metadata?.role,'primary');
 }finally{await act(()=>root.unmount());globalThis.fetch=original;}
});


test('upload blocks non-PDF and portrait pages before posting; choosing a new file clears validation',async()=>{
 const original=globalThis.fetch;let requests=0;
 globalThis.fetch=(async()=>{requests++;return new Response('{}');}) as typeof fetch;
 const root=createRoot(document.getElementById('root')!);
 try {
  await act(()=>root.render(createElement(ProductDrawingUpload,{product,open:true,onClose(){},onSaved(){}})));await wait();
  const input=document.querySelector<HTMLInputElement>('#drawing-file')!;
  assert.equal(input.accept,'.pdf,application/pdf');assert(!document.body.textContent?.includes('DWG / 三维'));
  const choose=async(name:string)=>{Object.defineProperty(input,'files',{configurable:true,value:[new File(['%PDF-test'],name)]});await act(()=>input.dispatchEvent(new window.Event('change',{bubbles:true})));await wait();};
  const submit=()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='确认上传并发布')!;
  await choose('drawing.dwg');assert.match(document.body.textContent!,/仅支持PDF/);assert(submit().disabled);
  validationPages=[{width:842,height:595},{width:595,height:842}];
  await choose('portrait.pdf');assert.match(document.body.textContent!,/第 2 页不是横向/);assert(submit().disabled);
  validationPages=[{width:842,height:595}];await choose('landscape.PDF');assert(!submit().disabled);
  assert(!document.body.textContent!.includes('第 2 页不是横向'));
  validationPages=[{width:600,height:600}];await choose('square.pdf');assert(submit().disabled);assert.equal(requests,0);
 }finally{await act(()=>root.unmount());globalThis.fetch=original;validationPages=[{width:842,height:595}];}
});

test('non-gear categories hide structure selection and upload unspecified structure',async()=>{
 const original=globalThis.fetch;let metadata:ProductDrawingInput|undefined;
 globalThis.fetch=(async(url)=>{metadata=JSON.parse(new URL(String(url),'http://local').searchParams.get('metadata')!);return new Response('{}',{status:201});}) as typeof fetch;
 const root=createRoot(document.getElementById('root')!);
 try {
  await act(()=>root.render(createElement(ProductDrawingUpload,{product:{...product,category:'圆筒阻尼器',categoryId:'2342097638163310592'},open:true,onClose(){},onSaved(){}})));await wait();
  assert.equal(Boolean(document.querySelector('#structure')),false);
  assert(!document.body.textContent?.includes('有齿轮'));
  const file=document.querySelector<HTMLInputElement>('#drawing-file')!;
  Object.defineProperty(file,'files',{configurable:true,value:[new File(['%PDF-'],'圆筒.pdf')]});
  await act(()=>file.dispatchEvent(new window.Event('change',{bubbles:true})));await wait();
  await act(()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='确认上传并发布')!.click());await wait();
  assert.equal(metadata?.structure,'unspecified');assert.equal(metadata?.role,'primary');
 }finally{await act(()=>root.unmount());globalThis.fetch=original;}
});
