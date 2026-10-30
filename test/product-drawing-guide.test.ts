import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import './standard-frontend-dom.ts';
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import {ProductDrawingGuide} from '../src/components/ProductDrawingGuide.tsx';
const channel=globalThis.MessageChannel;Object.defineProperty(globalThis,'MessageChannel',{value:undefined,configurable:true,writable:true});
after(()=>{window.close();globalThis.MessageChannel=channel;});
const wait=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,40));});
test('guide uses a modal without expanding the page and explains series plus drawing operations',async()=>{
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(()=>root.render(createElement(ProductDrawingGuide)));await wait();
  assert.equal(document.querySelectorAll('img').length,0);
  assert.equal(Boolean(document.querySelector('.ant-collapse')),false);
  const header=[...document.querySelectorAll('button')].find(button=>button.textContent?.includes('使用指南'));assert(header);
  await act(()=>header.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));await wait();
  assert.match(document.body.textContent!,/半成品/);assert.match(document.body.textContent!,/客户专用/);
  assert.match(document.body.textContent!,/历史版本/);assert.match(document.body.textContent!,/150%/);
  assert(document.querySelector('[role="dialog"]'));
  assert.match(document.body.textContent!,/T001-15/);assert.match(document.body.textContent!,/扭矩/);
  assert.match(document.body.textContent!,/齿轮、下座/);
  assert.equal(document.querySelector('img')?.getAttribute('src'),'/assets/guides/drawing-guide-general.png');
  assert.equal(document.querySelector('img')?.getAttribute('loading'),'lazy');
 }finally{await act(()=>root.unmount());}
});
