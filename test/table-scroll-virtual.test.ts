import assert from 'node:assert/strict';
import {test} from 'node:test';
import './standard-frontend-dom.ts';
import {captureTableScroll,restoreTableScroll,registerTableScroller} from '../src/lib/tableScroll.ts';

test('virtual capture uses visible row ID and the actual horizontal header position',()=>{
 const root=document.createElement('div');root.innerHTML='<div class="ant-table-header"></div><div class="ant-table-tbody-virtual-holder"><div data-row-key="row-90"></div></div>';
 const body=root.querySelector<HTMLElement>('.ant-table-tbody-virtual-holder')!,header=root.querySelector<HTMLElement>('.ant-table-header')!;
 body.scrollTop=5000;header.scrollLeft=180;
 body.getBoundingClientRect=()=>({top:100,bottom:500} as DOMRect);
 body.firstElementChild!.getBoundingClientRect=()=>({top:120,bottom:190,height:70} as DOMRect);
 assert.deepEqual(captureTableScroll(root),{top:5000,left:180,anchorId:'row-90',anchorOffset:20});
});

test('cold virtual restore mounts the anchor before correcting its visual offset',()=>{
 const root=document.createElement('div');root.innerHTML='<div class="ant-table-header"></div><div class="ant-table-tbody-virtual-holder"></div>';
 const body=root.querySelector<HTMLElement>('.ant-table-tbody-virtual-holder')!,header=root.querySelector<HTMLElement>('.ant-table-header')!;
 body.getBoundingClientRect=()=>({top:100,bottom:500} as DOMRect);
 const calls:string[]=[];const dispose=registerTableScroller(root,key=>{calls.push(key);body.innerHTML=`<div data-row-key="${key}"></div>`;body.scrollTop=3000;body.firstElementChild!.getBoundingClientRect=()=>({top:145,bottom:215,height:70} as DOMRect);return true;});
 const position={top:6000,left:160,anchorId:'row-90',anchorOffset:15};
 restoreTableScroll(root,position);restoreTableScroll(root,position);
 assert.deepEqual(calls,['row-90']);assert.equal(body.scrollTop,3030);assert.equal(header.scrollLeft,160);
 dispose();
});

test('missing virtual anchor falls back to saved scroll rather than clearing filters',()=>{
 const root=document.createElement('div');root.innerHTML='<div class="ant-table-tbody-virtual-holder"></div>';
 const dispose=registerTableScroller(root,()=>false);
 restoreTableScroll(root,{top:1234,left:0,anchorId:'deleted',anchorOffset:10});
 assert.equal(root.firstElementChild!.scrollTop,1234);dispose();
});

test('accepted async scroll is not completion and is not reissued while the row mounts',()=>{
 const root=document.createElement('div');root.innerHTML='<div class="ant-table-header"></div><div class="ant-table-tbody-virtual-holder"></div>';
 const body=root.querySelector<HTMLElement>('.ant-table-tbody-virtual-holder')!;let requests=0;
 const dispose=registerTableScroller(root,()=>{requests++;return true});
 const position={top:6000,left:160,anchorId:'slow-row',anchorOffset:15};
 try{
  for(let i=0;i<5;i++)assert.equal(restoreTableScroll(root,position),false,'a pending async row must continue its restore session');
  assert.equal(requests,1,'do not cancel and restart the virtual list request each frame');
  body.scrollTop=3000;body.innerHTML='<div data-row-key="slow-row"></div>';
  body.getBoundingClientRect=()=>({top:100,bottom:500} as DOMRect);
  body.firstElementChild!.getBoundingClientRect=()=>({top:145-(body.scrollTop-3000),bottom:215-(body.scrollTop-3000),height:70} as DOMRect);
  assert.equal(restoreTableScroll(root,position),false,'the corrected offset needs a layout pass');
  assert.equal(body.scrollTop,3030);assert.equal(restoreTableScroll(root,position),true);
 }finally{dispose()}
});
