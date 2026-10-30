import assert from 'node:assert/strict';import {test} from 'node:test';
import './standard-frontend-dom.ts';
import {clearStandardPageSession,openStandardPageSession,saveStandardPageSession,initialStandardPageView} from '../src/lib/standardPageSession.ts';
import {captureStandardScroll,restoreStandardScroll} from '../src/lib/standardPageScroll.ts';
import {useTabStore} from '../src/lib/tabStore.ts';
import type {StandardPageSnapshot} from '../src/types/standardPageSession.ts';
const saved:StandardPageSnapshot={view:{category:'rack_damper',status:'published',standardType:'formal',filters:{search:'T001',serialNo:'SP1',customer:'客户',model:'',customerPartNo:'',vehicleModel:''}},entryKey:'source-entry',cache:null,scroll:null};
test('page memory is isolated by scope and closing/authentication cannot be undone by old unmount cleanup',()=>{
 clearStandardPageSession();let session=openStandardPageSession('user:engineering');saveStandardPageSession(session,saved);
 assert.equal(openStandardPageSession('user:engineering').snapshot,saved);
 assert.equal(openStandardPageSession('user:reader').snapshot,null);saveStandardPageSession(session,saved);
 assert.equal(openStandardPageSession('user:reader').snapshot,null);
 for(const action of ['closeTab','closeOthers','closeAll','resetForAuthentication'] as const){
  session=openStandardPageSession('user:reader');saveStandardPageSession(session,saved);
  useTabStore.getState().openTab({key:'/product-standards',label:'产品标准'});
  if(action==='closeTab')useTabStore.getState().closeTab('/product-standards');
  else if(action==='closeOthers')useTabStore.getState().closeOthers('/');
  else useTabStore.getState()[action]();
  saveStandardPageSession(session,saved);
  assert.equal(openStandardPageSession('user:reader').snapshot,null,action);
 }
});
test('plain tab return resumes filters; new notification parameters override memory; browser history resumes its exact entry',()=>{
 assert.equal(initialStandardPageView(saved,new URLSearchParams(),'tab-entry'),saved.view);
 assert.equal(initialStandardPageView(saved,new URLSearchParams('status=draft'),'source-entry'),saved.view);
 const notification=initialStandardPageView(saved,new URLSearchParams('category=gear_damper&status=pending_review&standardId=s1'),'new-entry');
 assert.equal(notification.filters.search,'');assert.equal(notification.standardType,'all');
});
test('scroll restoration anchors by standard ID and offset after records are inserted, and tolerates removed records',()=>{
 const root=document.createElement('div');const outer=document.createElement('div');outer.setAttribute('data-page-scroll-container','');outer.append(root);document.body.append(outer);
 root.innerHTML='<div class="ant-table-header"></div><div class="ant-table-body"><table><tbody><tr data-row-key="one"></tr><tr data-row-key="two"></tr></tbody></table></div>';
 const body=root.querySelector<HTMLElement>('.ant-table-body')!,row=root.querySelector<HTMLElement>('tr[data-row-key="two"]')!;
 let inserted=0;
 body.getBoundingClientRect=()=>({top:50,bottom:350,height:300} as DOMRect);
 row.getBoundingClientRect=()=>({top:50+110+inserted-body.scrollTop,bottom:80+110+inserted-body.scrollTop,height:30} as DOMRect);
 body.scrollTop=100;body.scrollLeft=120;outer.scrollTop=20;
 const position=captureStandardScroll(root,'two');assert.equal(position.anchorOffset,10);
 inserted=60;body.scrollTop=0;body.scrollLeft=0;restoreStandardScroll(root,position);
 assert.equal(body.scrollTop,160);assert.equal(body.scrollLeft,120);assert.equal(outer.scrollTop,20);
 row.remove();body.scrollTop=0;restoreStandardScroll(root,position);assert.equal(body.scrollTop,100);
 outer.remove();
});
