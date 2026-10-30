import assert from 'node:assert/strict';import {test} from 'node:test';
import './standard-frontend-dom.ts';
import {createElement,act} from 'react';import {createRoot} from 'react-dom/client';
import {ProductFileManagement} from '../src/components/ProductDrawings.tsx';
import {api} from '../src/lib/api.ts';
import type {ProductArchive,ProductDrawing} from '../src/types/product.ts';
const product={id:'p',internalNumber:'SP1',standards:[]} as ProductArchive;
const drawing={id:'f',productId:'p',drawingNo:'RD-T001',version:'A1',filename:'T001.pdf',status:'draft',standardIds:[],kind:'pdf',uploadedAt:'2026-10-28T00:00:00Z'} as ProductDrawing;
const wait=()=>act(async()=>{await new Promise(r=>setTimeout(r,50));});
test('management only publishes and retires; confirmation calls publish directly without review',async()=>{
 const original=api.post;const calls:string[]=[];api.post=(async<T>(url:string)=>{calls.push(url);return {ok:true} as T;}) as typeof api.post;
 const root=createRoot(document.getElementById('root')!);let changed=0;
 try{await act(()=>root.render(createElement(ProductFileManagement,{product,drawings:[drawing],onChanged:()=>changed++})));await wait();
 const buttons=[...document.querySelectorAll<HTMLButtonElement>('button')];assert(!buttons.some(b=>/原件|审核|提交/.test((b.textContent||'').replace(/\s/g,''))));
 await act(()=>buttons.find(b=>b.textContent?.replace(/\s/g,'')==='发布')!.click());await wait();assert.equal(calls.length,0);
 await act(()=>[...document.querySelectorAll<HTMLButtonElement>('.ant-popconfirm button')].find(b=>b.classList.contains('ant-btn-primary'))!.click());await wait();
 assert.deepEqual(calls,['/api/products/p/files/f/publish']);assert.equal(changed,1);
 }finally{await act(()=>root.unmount());api.post=original;}
});
test('publish failures remain visible in the management panel',async()=>{
 const original=api.post;api.post=async()=>{throw new Error('文件读取失败：请检查存储');};const root=createRoot(document.getElementById('root')!);
 try{await act(()=>root.render(createElement(ProductFileManagement,{product,drawings:[drawing],onChanged:()=>{}})));await wait();
 await act(()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.replace(/\s/g,'')==='发布')!.click());await wait();
 await act(()=>[...document.querySelectorAll<HTMLButtonElement>('.ant-popconfirm button')].find(b=>b.classList.contains('ant-btn-primary'))!.click());await wait();assert.match(document.body.textContent!,/发布失败：文件读取失败/);
 }finally{await act(()=>root.unmount());api.post=original;}
});
