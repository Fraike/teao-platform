import assert from 'node:assert/strict';import {test,after} from 'node:test';import './standard-frontend-dom.ts';import {createElement,act} from 'react';import {createRoot} from 'react-dom/client';
import {ProductDrawings} from '../src/components/ProductDrawings.tsx';import type {ProductArchive,ProductDrawing} from '../src/types/product.ts';
const channel=globalThis.MessageChannel;Object.defineProperty(globalThis,'MessageChannel',{value:undefined,configurable:true,writable:true});after(()=>{window.close();globalThis.MessageChannel=channel;});
const wait=()=>act(async()=>{await new Promise(r=>setTimeout(r,70));});
test('A manual supplement selection is cleared after A to B to A customer switches',async()=>{
 const fetch=globalThis.fetch;globalThis.fetch=()=>new Promise(()=>{});
 const product={id:'p',productionAvailable:true,standards:['a','b'].map(id=>({id,fields:{gear_spec:'11齿3.0MM齿轮'}}))} as ProductArchive;
 const drawings=['main','supplement'].map(id=>({id,productId:'p',filename:id+'.pdf',drawingNo:id,version:'A1',kind:'pdf',status:'published',role:id==='main'?'primary':'supplement',structure:'geared',standardIds:[]})) as ProductDrawing[];
 const root=createRoot(document.getElementById('root')!);const render=(standardId:string)=>act(()=>root.render(createElement(ProductDrawings,{product,drawings,standardId,canManage:false,onChanged:()=>{}})));
 try{
  await render('a');await wait();assert.equal(document.querySelector('strong')!.textContent,'main.pdf');
  await act(()=>document.querySelector('.ant-select-selector')!.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true})));await wait();
  const option=[...document.querySelectorAll<HTMLElement>('.ant-select-item-option-content')].find(e=>e.textContent?.includes('supplement.pdf'))!;assert(option);await act(()=>option.click());await wait();assert.equal(document.querySelector('strong')!.textContent,'supplement.pdf');
  await render('b');await wait();assert.equal(document.querySelector('strong')!.textContent,'main.pdf');await render('a');await wait();assert.equal(document.querySelector('strong')!.textContent,'main.pdf');
 }finally{await act(()=>root.unmount());globalThis.fetch=fetch;}
});

test('non-gear drawing labels omit legacy structure metadata while gear labels retain it',async()=>{
 const fetch=globalThis.fetch;globalThis.fetch=()=>new Promise(()=>{});
 const product={id:'p',productionAvailable:true,categoryId:'2342097638163310592',category:'圆筒阻尼器',standards:[]} as unknown as ProductArchive;
 const drawings=['main','supplement'].map(id=>({id,productId:'p',filename:id+'.pdf',drawingNo:id,version:'A1',kind:'pdf',status:'published',role:id==='main'?'primary':'supplement',structure:'geared',standardIds:[]})) as ProductDrawing[];
 const root=createRoot(document.getElementById('root')!);
 const render=(p:ProductArchive)=>act(()=>root.render(createElement(ProductDrawings,{product:p,drawings,standardId:'',canManage:false,onChanged(){}})));
 try {
  await render(product);await wait();
  assert(!document.body.textContent?.includes('有齿轮'));
  assert(!document.querySelector('.ant-select')?.textContent?.includes('有齿轮'));
  assert(document.body.textContent?.includes('主图'));
  await render({...product,categoryId:'2342097486262423552',category:'齿轮阻尼器'});await wait();
  assert(document.body.textContent?.includes('有齿轮'));
 }finally{await act(()=>root.unmount());globalThis.fetch=fetch;}
});
