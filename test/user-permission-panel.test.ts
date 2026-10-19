import assert from 'node:assert/strict';
import {test} from 'node:test';
import './standard-frontend-dom.ts';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {message} from 'antd';
import type {User} from '../src/types/auth.ts';
const {UserPermissionDrawer}=await import('../src/components/admin/UserPermissionDrawer.tsx');
const wait=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,60));});
const base:User={id:'worker',name:'张同事',username:'worker',role:'user',status:'active',permissions:['production_import']};

test('permissions distinguish module access, dependent operations and serialized saves',async()=>{
 const root=createRoot(document.getElementById('root')!);
 let complete:()=>void=()=>{};const changes:unknown[]=[];
 const onChange=(key:string,enabled:boolean)=>{changes.push([key,enabled]);return new Promise<void>(resolve=>{complete=resolve;});};
 try{
  await act(()=>root.render(createElement(UserPermissionDrawer,{open:true,user:base,onClose:()=>{},onChange})));await wait();
  assert.match(document.body.textContent!,/页面访问与使用/);assert.match(document.body.textContent!,/页面内操作/);
  const importer=document.querySelector<HTMLButtonElement>('button[aria-label="生产日报导入"]')!;
  assert.equal(importer.disabled,false);assert.equal(importer.getAttribute('aria-checked'),'true');assert.match(document.body.textContent!,/未生效/);assert.match(document.body.textContent!,/先开通生产管理/);
  const submit=document.querySelector<HTMLButtonElement>('button[aria-label="产品标准提交审核"]')!;
  await act(()=>submit.click());assert.deepEqual(changes,[['engineering_submit',true]]);
  assert(Array.from(document.querySelectorAll<HTMLButtonElement>('.ant-switch')).every(el=>el.disabled));
  await act(async()=>{complete();});
  await act(()=>root.render(createElement(UserPermissionDrawer,{open:true,user:{...base,permissions:['production','engineering_submit']},onClose:()=>{},onChange})));await wait();
  assert.equal(document.querySelector('button[aria-label="产品标准提交审核"]')?.getAttribute('aria-checked'),'true');
  assert.equal(document.querySelector<HTMLButtonElement>('button[aria-label="生产日报导入"]')!.disabled,false);
  await act(()=>root.render(createElement(UserPermissionDrawer,{open:true,user:{...base,permissions:[]},onClose:()=>{},onChange})));await wait();
  assert.equal(document.querySelector<HTMLButtonElement>('button[aria-label="生产日报导入"]')!.disabled,true);
 }finally{await act(()=>root.unmount());}
});

test('failed permission saves preserve granted state and report the error',async()=>{
 const root=createRoot(document.getElementById('root')!);const original=message.error;const errors:unknown[]=[];
 message.error=((error:unknown)=>{errors.push(error);}) as typeof message.error;
 try{
  await act(()=>root.render(createElement(UserPermissionDrawer,{open:true,user:{...base,permissions:[]},onClose:()=>{},onChange:async()=>{throw new Error('保存失败');}})));await wait();
  await act(async()=>document.querySelector<HTMLButtonElement>('button[aria-label="产品标准提交审核"]')!.click());await wait();
  assert.equal(document.querySelector('button[aria-label="产品标准提交审核"]')?.getAttribute('aria-checked'),'false');
  assert.deepEqual(errors,['保存失败']);assert.equal(document.querySelector<HTMLButtonElement>('button[aria-label="产品标准提交审核"]')!.disabled,false);
 }finally{message.error=original;await act(()=>root.unmount());}
});
