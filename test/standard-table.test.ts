import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement, act } from 'react';

import { observers } from './standard-frontend-dom.ts';
const { createRoot } = await import('react-dom/client');
const { ResponsiveTable } = await import('../src/components/ResponsiveTable.tsx');
const columns = [{ title: 'Left', dataIndex: 'name', width: 300, fixed: 'left' as const },
  { title: 'Middle', dataIndex: 'name', width: 1000 }, { title: 'Right', dataIndex: 'name', width: 300, fixed: 'right' as const }];
const props = { minWidth: 1600, columns, dataSource: [{ key: '1', name: 'row' }], scroll: { y: 300 }, pagination: false as const };
const dimension = (element: Element, key: string, value: number) => Object.defineProperty(element, key, { configurable: true, value });

test('bottom scrollbar synchronizes body/header, resizes, supports keyboard and disposes', async () => {
  const root = createRoot(document.getElementById('root')!);
  await act(() => root.render(createElement(ResponsiveTable, { ...props, bottomScrollbar: true })));
  const top = document.querySelector<HTMLElement>('[aria-label="表格横向滚动"]');
  assert.ok(top, 'wide table must have a reachable bottom scrollbar');
  assert.equal(top.tabIndex, 0);
  const shell = document.querySelector('.tableShell')!;
  const ownObservers = observers.filter(observer => observer.elements.has(shell));
  const body = document.querySelector<HTMLElement>('.ant-table-body')!;
  const header = document.querySelector<HTMLElement>('.ant-table-header')!;
  dimension(body, 'clientWidth', 500); dimension(body, 'scrollWidth', 1600);
  dimension(top, 'clientWidth', 500); dimension(top, 'scrollWidth', 1600);
  await act(async () => { for (const observer of observers) observer.resize(body, 500); await new Promise(resolve=>setTimeout(resolve,35)); });
  assert.equal(top.style.width, '500px');
  const control = top.querySelector<HTMLInputElement>('[aria-label="左右拖动表格"]')!;
  assert.ok(control, 'persistent control must be present even when OS native scrollbars auto-hide');
  assert.equal(control.max, '1100');
  await act(() => {control.value = '220'; control.dispatchEvent(new window.Event('input'));});
  assert.equal(body.scrollLeft, 220); assert.equal(header.scrollLeft, 220);
  assert.equal((top.querySelector('.scrollbarWidth') as HTMLElement).style.width, '1600px');
  await act(() => { top.scrollLeft = 300; top.dispatchEvent(new window.Event('scroll')); });
  assert.equal(body.scrollLeft, 300); assert.equal(header.scrollLeft, 300);
  await act(() => { body.scrollLeft = 650; body.dispatchEvent(new window.Event('scroll')); });
  assert.equal(top.scrollLeft, 650); assert.equal(header.scrollLeft, 650);
  await act(() => { header.scrollLeft = 400; header.dispatchEvent(new window.Event('scroll')); });
  assert.equal(top.scrollLeft, 400); assert.equal(body.scrollLeft, 400);
  await act(() => { top.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true })); });
  assert.equal(body.scrollLeft, 1100);
  await act(() => { top.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true })); });
  assert.equal(body.scrollLeft, 0);
  await act(() => { top.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
  assert.ok(body.scrollLeft > 0);
  dimension(body, 'clientWidth', 900); dimension(body, 'scrollWidth', 1900);
  await act(async () => { for (const observer of observers) observer.resize(body, 900); await new Promise(resolve=>setTimeout(resolve,35)); });
  assert.equal(top.style.width, '900px');
  assert.equal((top.querySelector('.scrollbarWidth') as HTMLElement).style.width, '1900px');
  await act(() => root.render(createElement(ResponsiveTable, { ...props, bottomScrollbar: true, scroll: undefined })));
  const content = document.querySelector<HTMLElement>('.ant-table-content')!;
  assert.ok(content);
  dimension(content, 'clientWidth', 600); dimension(content, 'scrollWidth', 2000);
  await act(async () => { for (const observer of observers) observer.resize(content, 600); await new Promise(resolve=>setTimeout(resolve,35)); });
  assert.equal((top.querySelector('.scrollbarWidth') as HTMLElement).style.width, '2000px');
  await act(() => { content.scrollLeft = 500; content.dispatchEvent(new window.Event('scroll')); });
  assert.equal(top.scrollLeft, 500, 'switching fixed header off must bind the new content node');
  await act(() => { body.scrollLeft = 123; body.dispatchEvent(new window.Event('scroll')); });
  assert.equal(top.scrollLeft, 500, 'replaced body must remove its scroll listener');
  await act(() => root.render(createElement(ResponsiveTable, { ...props, bottomScrollbar: false })));
  assert.equal(document.querySelector('[aria-label="表格横向滚动"]'), null, 'explicit opt-out removes the bottom control');
  const oldLeft = top.scrollLeft;
  await act(() => { body.scrollLeft = 800; body.dispatchEvent(new window.Event('scroll')); });
  assert.equal(top.scrollLeft, oldLeft, 'disabled scrollbar must remove scroll listeners');
  await act(() => root.unmount());
  assert.ok(ownObservers.every(observer => observer.disconnected), 'own ResizeObservers must disconnect');
  assert.ok(observers.every(observer => observer.elements.size === 0), 'all observed nodes must be released');
});

test('content-sized ancestors cannot cause viewport tables to shrink on repeated measurements',async()=>{
  const node=document.getElementById('root')!,frame=document.createElement('div'),page=document.createElement('div'),content=document.createElement('div');
  frame.setAttribute('data-page-scroll-container','');frame.setAttribute('data-table-page-viewport','');
  frame.append(page);page.append(content);content.append(node);document.body.append(frame);
  const rect=(top:number,height:number)=>({top,bottom:top+height,left:0,right:700,width:700,height,x:0,y:top,toJSON(){}});
  frame.getBoundingClientRect=()=>rect(56,844);
  const height=()=>parseFloat(node.querySelector<HTMLElement>('.tableShell')?.style.getPropertyValue('--table-body-height')||'240');
  // This parent's height is determined by the table itself; it is not a viewport.
  page.getBoundingClientRect=()=>rect(80,180+height()+56-80);
  const root=createRoot(node);
  try{
    await act(()=>root.render(createElement(ResponsiveTable,{...props,fitViewport:true})));
    const shell=node.querySelector<HTMLElement>('.tableShell')!,header=node.querySelector<HTMLElement>('.ant-table-header')!;
    shell.getBoundingClientRect=()=>rect(180,height()+56);header.getBoundingClientRect=()=>rect(180,38);
    const measured:number[]=[];
    for(let i=0;i<5;i++){
      await act(async()=>{for(const observer of observers)observer.resize(frame,700);await new Promise(resolve=>setTimeout(resolve,35));});
      measured.push(height());
    }
    const expected=Math.min(900,window.innerHeight)-180-58-8;
    assert.deepEqual(measured,Array(5).fill(expected),'table height must depend on the viewport, not its own shrinking content wrapper');
  }finally{await act(()=>root.unmount());document.body.append(node);frame.remove();}
});

test('an explicit fixed-height boundary reserves its own bottom space',async()=>{
  const node=document.getElementById('root')!,frame=document.createElement('div'),boundary=document.createElement('div');
  frame.setAttribute('data-page-scroll-container','');boundary.setAttribute('data-table-height-boundary','');
  frame.append(boundary);boundary.append(node);document.body.append(frame);
  const rect=(top:number,height:number)=>({top,bottom:top+height,left:0,right:700,width:700,height,x:0,y:top,toJSON(){}});
  frame.getBoundingClientRect=()=>rect(56,704);let boundaryBottom=640;
  boundary.getBoundingClientRect=()=>rect(140,boundaryBottom-140);
  const root=createRoot(node);
  try{
    await act(()=>root.render(createElement(ResponsiveTable,{...props,fitViewport:true})));
    const shell=node.querySelector<HTMLElement>('.tableShell')!;
    shell.getBoundingClientRect=()=>rect(180,500);node.querySelector<HTMLElement>('.ant-table-header')!.getBoundingClientRect=()=>rect(180,38);
    for(const [bottom,expected] of [[640,'402px'],[700,'462px']] as const){
      boundaryBottom=bottom;
      await act(async()=>{for(const observer of observers)observer.resize(boundary,700);await new Promise(resolve=>setTimeout(resolve,35));});
      assert.equal(shell.style.getPropertyValue('--table-body-height'),expected);
    }
    boundary.style.setProperty('--table-height-boundary','none');
    await act(async()=>{for(const observer of observers)observer.resize(boundary,700);await new Promise(resolve=>setTimeout(resolve,35));});
    assert.equal(shell.style.getPropertyValue('--table-body-height'),'514px','a responsive auto-height layout can opt out of its desktop boundary');
  }finally{await act(()=>root.unmount());document.body.append(node);frame.remove();}
});

test('viewport-fit reserves actual header, pagination and bottom control within framework content', async () => {
  const node=document.getElementById('root')!;
  const container=document.createElement('div');container.setAttribute('data-page-scroll-container','');node.parentElement!.append(container);container.append(node);
  let bottom=760;
  const rect=(top:number,height:number)=>({top,bottom:top+height,left:0,right:700,width:700,height,x:0,y:top,toJSON(){}});
  container.getBoundingClientRect=()=>rect(56,bottom-56);
  const root=createRoot(node);
  await act(()=>root.render(createElement(ResponsiveTable,{...props,fitViewport:true})));
  const shell=node.querySelector<HTMLElement>('.tableShell')!;
  let tableTop=180;
  const header=node.querySelector<HTMLElement>('.ant-table-header')!;
  shell.getBoundingClientRect=()=>rect(tableTop,500);header.getBoundingClientRect=()=>rect(180,38);
  await act(async()=>{for(const observer of observers)observer.resize(container,700);await new Promise(resolve=>setTimeout(resolve,50));});
  assert.equal(shell.style.getPropertyValue('--table-body-height'),'514px');
  assert.equal(node.querySelector<HTMLElement>('.ant-table-body')!.style.maxHeight,'514px');
  const control=node.querySelector('[aria-label="表格横向滚动"]')!;
  const wrapper=node.querySelector('.ant-table-wrapper')!;
  assert(wrapper.compareDocumentPosition(control)&window.Node.DOCUMENT_POSITION_FOLLOWING,'horizontal control must be below the table, not above');
  bottom=640;
  await act(async()=>{for(const observer of observers)observer.resize(container,700);await new Promise(resolve=>setTimeout(resolve,50));});
  assert.equal(shell.style.getPropertyValue('--table-body-height'),'394px','resizing framework must recompute remaining space');
  const reminder=document.createElement('div');
  await act(async()=>{tableTop=220;node.prepend(reminder);await new Promise(resolve=>setTimeout(resolve,50));});
  assert.equal(shell.style.getPropertyValue('--table-body-height'),'354px','a late-loaded header/reminder must not push the bottom control out of view');
  reminder.remove();
  await act(()=>root.unmount());document.body.append(node);container.remove();
});

test('grouped table bottom control follows a nested scrolling viewport and releases after the group leaves', async () => {
  const node=document.getElementById('root')!,clip=document.createElement('div');
  clip.style.overflowY='auto';clip.append(node);document.body.append(clip);
  const rect=(top:number,height:number)=>({top,bottom:top+height,left:20,right:520,width:500,height,x:20,y:top,toJSON(){}});
  clip.getBoundingClientRect=()=>rect(60,500);
  const root=createRoot(node);
  await act(()=>root.render(createElement(ResponsiveTable,{...props,scroll:undefined})));
  const body=node.querySelector<HTMLElement>('.ant-table-body,.ant-table-content')!;
  let top=100;body.getBoundingClientRect=()=>rect(top,900);
  dimension(body,'clientWidth',500);dimension(body,'scrollWidth',1600);
  await act(async()=>{for(const observer of observers)observer.resize(body,500);await new Promise(resolve=>setTimeout(resolve,35));});
  const bar=node.querySelector<HTMLElement>('[aria-label="表格横向滚动"]')!;
  assert.equal(bar.style.position,'fixed');assert.equal(bar.style.bottom,`${window.innerHeight-560}px`);
  top=-1000;
  await act(async()=>{clip.dispatchEvent(new window.Event('scroll'));await new Promise(resolve=>setTimeout(resolve,35));});
  assert.equal(bar.style.position,'','an earlier date must not leave a floating scrollbar over the next group');
  await act(()=>root.unmount());document.body.append(node);clip.remove();
});

test('container width changes do not rerender every table cell', async () => {
  let renders = 0;
  const root = createRoot(document.getElementById('root')!);
  await act(() => root.render(createElement(ResponsiveTable, { ...props, bottomScrollbar: false,
    columns: [{ title: 'Value', dataIndex: 'name', render: (value: string) => { renders++; return value; } }] })));
  const shell = document.querySelector('.tableShell')!;
  const initial = renders;
  await act(async () => {
    for (const observer of observers) observer.resize(shell, 1800);
    await new Promise(resolve => setTimeout(resolve, 40));
  });
  assert.equal(renders, initial, 'width-only resizing must be handled by CSS, not a React table update');
  await act(() => root.unmount());
});
