import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import './standard-frontend-dom.ts';
import {act,createElement,Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import {lazyWithFallback} from '../src/lib/lazyWithFallback.ts';

after(()=>{window.close();});
test('failed lazy imports keep other page inputs mounted and provide a non-automatic reload guide',async()=>{
 const Broken=lazyWithFallback(async()=>{throw new Error('Failed to fetch dynamically imported module');});
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>{root.render(createElement('div',null,createElement('input',{defaultValue:'unsaved draft'}),createElement(Suspense,{fallback:'loading'},createElement(Broken))));await new Promise(r=>setTimeout(r,40));});
  assert.equal(document.querySelector('input')?.value,'unsaved draft');
  assert.match(document.body.textContent!,/保存/);assert.match(document.body.textContent!,/刷新/);
  assert(!document.querySelector('[role="dialog"]'),'no automatic reload or prompt');
 }finally{await act(()=>root.unmount());}
});
