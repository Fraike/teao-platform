import assert from 'node:assert/strict';import {test,after} from 'node:test';
import './standard-frontend-dom.ts';
import {createElement,act} from 'react';import {createRoot} from 'react-dom/client';
import {ProductDrawingImport} from '../src/components/ProductDrawingImport.tsx';
import {ProductImportReview} from '../src/components/ProductImportReview.tsx';
import {isFinishedPdfPath} from '../src/lib/productImportFiles.ts';
import {api} from '../src/lib/api.ts';
import type {ProductImportEntry} from '../src/types/productImport.ts';
// rc-overflow creates Node MessagePorts without closing them; exercise its browser RAF fallback.
const originalChannel=globalThis.MessageChannel;
Object.defineProperty(globalThis,'MessageChannel',{value:undefined,configurable:true,writable:true});
const wait=()=>act(async()=>{await new Promise(r=>setTimeout(r,40));});
test('directory filter includes finished/customer/root PDFs and excludes parts, hidden, 3D and image files',()=>{
 for(const p of ['图纸/RD-T001/成品图/a.pdf','RD-T001/成品图/客户图纸/a.PDF','图纸/RD-TR01/a.pdf'])assert(isFinishedPdfPath(p),p);
 for(const p of ['图纸/.workbuddy/a.pdf','RD-T001/子件图/a.pdf','RD-T001/3D/a.pdf','RD-T001/a.png','a/b/c/d.pdf'])assert(!isFinishedPdfPath(p),p);
});
test('import entry point loads batch history without scanning or importing and offers a directory input',async()=>{
 const original=api.get;const calls:string[]=[];api.get=(async<T>(url:string)=>{calls.push(url);return {data:[]} as T;}) as typeof api.get;
 const root=createRoot(document.getElementById('root')!);
 try{await act(()=>root.render(createElement(ProductDrawingImport,{open:true,onClose:()=>{}})));await wait();
 assert.deepEqual(calls,['/api/products/imports']);assert(document.querySelector('input[webkitdirectory]'));
 assert.match(document.body.textContent!,/不创建生产图纸/);
 }finally{await act(()=>root.unmount());api.get=original;}
});
test('review never auto-selects candidates; restored retry keeps explicit scope and version',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('预览测试不加载PDF');};
 const item:ProductImportEntry={id:'e',batchId:'b',sourcePath:'RD-T001/成品图/a.pdf',filename:'a.pdf',sha256:'0'.repeat(64),size:123,scope:'general',series:'T001',hints:[],candidates:[{productId:'p',internalNumber:'SP1',model:'RD-T001-15',standardIds:[]}],status:'ready',error:null,links:[]};
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(()=>root.render(createElement(ProductImportReview,{entry:item,products:[],onClose:()=>{},onSaved:()=>{}})));await wait();
  assert.equal((document.querySelector('input[aria-label="导入图号"]') as HTMLInputElement).value,'');
  assert(!document.querySelector('.ant-select-selection-item'));
  await act(()=>root.unmount());
  const next=createRoot(document.getElementById('root')!);
  try{await act(()=>next.render(createElement(ProductImportReview,{entry:{...item,decision:{entryId:'e',drawingNo:'T001',version:'A1',targets:[]}},products:[],onClose:()=>{},onSaved:()=>{}})));await wait();assert.equal((document.querySelector('input[aria-label="导入图号"]') as HTMLInputElement).value,'T001');assert.equal((document.querySelector('input[aria-label="导入版本"]') as HTMLInputElement).value,'A1');}finally{await act(()=>next.unmount());}
 }finally{globalThis.fetch=original;}
});

after(()=>{window.close();globalThis.MessageChannel=originalChannel;});
