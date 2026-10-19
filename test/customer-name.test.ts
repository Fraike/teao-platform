import assert from 'node:assert/strict';
import {test} from 'node:test';
import './standard-frontend-dom.ts';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
const {CustomerName}=await import('../src/components/standard/CustomerName.tsx');
test('only automotive customers receive an information icon',async()=>{
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(()=>root.render(createElement(CustomerName,{value:'变更客户*'})));
  assert.equal(document.querySelectorAll('.anticon-info-circle').length,0);
  assert.equal(document.getElementById('root')!.textContent,'变更客户');
  await act(()=>root.render(createElement(CustomerName,{value:'汽车客户▲*'})));
  assert.equal(document.querySelectorAll('.anticon-info-circle').length,1);
  await act(()=>document.querySelector('.anticon-info-circle')!.dispatchEvent(new window.MouseEvent('mouseover',{bubbles:true})));
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,180));});
  assert.match(document.body.textContent!,/20转\/分钟/);assert(!document.body.textContent!.includes('有变更'));
 }finally{await act(()=>root.unmount());}
});
