import assert from 'node:assert/strict';
import {test} from 'node:test';
import './standard-frontend-dom.ts';
import {act,createElement,useEffect} from 'react';
import {MemoryRouter,useLocation} from 'react-router-dom';
import {TabPageHost} from '../src/components/TabPageHost.tsx';
import {useTabState,useTabPageAdapter,useTabInitialEffect} from '../src/lib/tabPageContext.tsx';
const {createRoot}=await import('react-dom/client');
test('cold recovery keeps state and location, successful initialization runs once',async()=>{
 const root=createRoot(document.getElementById('root')!);let active='a';let initialized=0;
 const tabs=['a','b','c'].map(key=>({key,location:{pathname:`/${key}`,search:`?page=${key}`,hash:'',state:null,key}}));
 function Page(){
  const location=useLocation();const [count,setCount]=useTabState('count',0);const [ready,setReady]=useTabState('ready',false);
  useTabPageAdapter();useTabInitialEffect('load',()=>{initialized++;setReady(true)},[],ready);
  useEffect(()=>{if(location.pathname==='/a'&&count===0)setCount(7)},[location.pathname,count,setCount]);
  return createElement('span',null,`${location.pathname}:${count}`);
 }
 const render=()=>act(async()=>root.render(createElement(MemoryRouter,null,createElement(TabPageHost,{scope:'host-test',tabs,activeKey:active,maxHot:1,renderPage:()=>createElement(Page)}))));
 await render();assert.equal(document.querySelector('[data-tab-page="a"]')?.textContent,'/a:7');
 active='b';await render();active='c';await render();assert.equal(document.querySelectorAll('[data-tab-page]').length,1);
 active='a';await render();assert.equal(document.querySelector('[data-tab-page="a"]')?.textContent,'/a:7');assert.equal(initialized,3);
 await act(async()=>root.unmount());
});

test('StrictMode Activity warm/cold recovery preserves edited snapshots and hidden portals',async()=>{
 const {StrictMode}=await import('react');
 const {createPortal}=await import('react-dom');
 const {useTabPage}=await import('../src/lib/tabPageContext.tsx');
 const {getTabPage}=await import('../src/lib/tabPageCache.ts');
 const root=createRoot(document.getElementById('root')!);let active='a';let maxHot=2;
 let edit:((value:number)=>void)|undefined;
 const tabs=['a','b','c'].map(key=>({key,location:{pathname:`/${key}`,search:'',hash:'',state:null,key}}));
 function Page(){
  const tab=useTabPage();const [count,setCount]=useTabState('edited',0);useTabPageAdapter();
  if(tab.key==='a')edit=setCount;
  return createElement('section',null,createElement('span',{'data-value':tab.key},String(count)),createPortal(createElement('i',{'data-popup':tab.key},'popup'),tab.container??document.body));
 }
 const page=()=>createElement(Page);
 const render=()=>act(async()=>root.render(createElement(StrictMode,null,createElement(MemoryRouter,null,createElement(TabPageHost,{scope:'strict-host-test',tabs,activeKey:active,maxHot,renderPage:page})))));
 await render();await act(async()=>edit!(7));assert.equal(getTabPage('strict-host-test','a').snapshot.get('edited'),7);
 active='b';await render();
 const popup=document.querySelector('[data-popup="a"]')!;
 assert.ok(popup.closest('[data-tab-page="a"]'),'hidden portal remains in its owned panel');
 assert.equal(document.body.querySelector(':scope > [data-popup="a"]'),null);
 active='a';await render();assert.equal(document.querySelector('[data-value="a"]')?.textContent,'7');
 maxHot=1;active='c';await render();assert.equal(document.querySelector('[data-value="a"]'),null);
 active='a';await render();assert.equal(document.querySelector('[data-value="a"]')?.textContent,'7');
 assert.equal(getTabPage('strict-host-test','a').alive,true);
 await act(async()=>root.unmount());
});

test('5/10/20 visited tabs keep five DOM pages, cold state and dirty guard; closing releases retained resources',async()=>{
 const {StrictMode}=await import('react');
 const {useTabPage,useTabDirty,useTabDispose}=await import('../src/lib/tabPageContext.tsx');
 const {getTabPage,guardTabClose}=await import('../src/lib/tabPageCache.ts');
 for(const count of [5,10,20]){
  const scope=`mixed-${count}`;let active='0',loads=0,disposed=0;
  let tabs=Array.from({length:count},(_,i)=>({key:String(i),location:{pathname:`/p-${i}`,search:'',hash:'',state:null,key:String(i)}}));
  let edit:((value:string)=>void)|undefined;
  function Page(){
   const tab=useTabPage();const [filter,setFilter]=useTabState('filter','');const [ready,setReady]=useTabState('loaded',false);
   useTabPageAdapter();useTabDirty(Boolean(filter));useTabDispose(()=>{if(tab.key==='0')disposed++;},'test-resource');
   useTabInitialEffect('load',()=>{let cancelled=false;void Promise.resolve().then(()=>{if(!cancelled){loads++;setReady(true);}});return()=>{cancelled=true;};},[],ready);
   if(tab.key==='0')edit=setFilter;
   return createElement('input',{'data-filter':tab.key,value:filter,onChange:()=>{}});
  }
  const renderPage=()=>createElement(Page);
  const root=createRoot(document.getElementById('root')!);
  const render=()=>act(async()=>root.render(createElement(StrictMode,null,createElement(MemoryRouter,null,createElement(TabPageHost,{scope,tabs,activeKey:active,renderPage})))));
  await render();await act(()=>edit!('离开前输入'));
  for(let i=1;i<count;i++){active=String(i);await render();assert(document.querySelectorAll('[data-tab-page]').length<=5);}
  assert.equal(loads,count);assert.equal(await guardTabClose(scope,['0'],()=>false),false,'cold dirty tab still asks');
  assert.equal(getTabPage(scope,'0').snapshot.get('filter'),'离开前输入');
  active='0';await render();assert.equal(document.querySelector<HTMLInputElement>('[data-filter="0"]')?.value,'离开前输入');assert.equal(loads,count);
  active=String(count-1);await render();tabs=tabs.filter(tab=>tab.key!=='0');await render();
  assert.equal(disposed,1,'cold transitions keep one resource disposer until actual close');
  tabs=[...tabs,{key:'0',location:{pathname:'/p-0',search:'',hash:'',state:null,key:'new'}}];active='0';await render();
  assert.equal(document.querySelector<HTMLInputElement>('[data-filter="0"]')?.value,'');assert.equal(loads,count+1);
  await act(async()=>root.unmount());
 }
});

test('lazy pages hidden before initial commit neither register ghost flags nor defeat LRU',async()=>{
 const {Suspense,lazy}=await import('react');
 const {useTabBusy,useTabDirty}=await import('../src/lib/tabPageContext.tsx');
 const {getTabPage}=await import('../src/lib/tabPageCache.ts');
 const root=createRoot(document.getElementById('root')!);let active='p0';
 const tabs=Array.from({length:20},(_,i)=>({key:`p${i}`,location:{pathname:`/p${i}`,search:'',hash:'',state:null,key:`p${i}`}}));
 const LazyBody=lazy(()=>new Promise<{default:()=>null}>(()=>{}));
 function Page(){useTabPageAdapter(false);useTabBusy(false);useTabDirty(false);return createElement(LazyBody)}
 const page=()=>createElement(Suspense,{fallback:createElement('span',null,'loading')},createElement(Page));
 const render=()=>act(async()=>root.render(createElement(MemoryRouter,null,createElement(TabPageHost,{scope:'suspended-test',tabs,activeKey:active,maxHot:5,renderPage:page}))));
 for(const tab of tabs){active=tab.key;await render()}
 assert.ok(document.querySelectorAll('[data-tab-page]').length<=5);
 for(const tab of tabs){const record=getTabPage('suspended-test',tab.key);assert.equal(record.busy.size,0);assert.equal(record.dirty.size,0);assert.equal(record.snapshot.size,0);assert.equal(record.adapterDeclared,true)}
 await act(async()=>root.unmount());
});

test('hidden pending reads becoming ready trim protected pages without another navigation',async()=>{
 const root=createRoot(document.getElementById('root')!);let active='r0';
 const finish=new Map<string,()=>void>();
 const tabs=Array.from({length:8},(_,i)=>({key:`r${i}`,location:{pathname:`/r${i}`,search:'',hash:'',state:null,key:`r${i}`}}));
 const {useTabPageSession}=await import('../src/lib/tabPageContext.tsx');
 function Page(){
  const tab=useTabPageSession();const [ready,setReady]=useTabState('read-ready',false);
  useTabState('data',{loaded:false});useTabPageAdapter(ready);
  useEffect(()=>{finish.set(tab.key,()=>{Promise.resolve().then(()=>setReady(true))})},[tab.key,setReady]);
  return createElement('span',null,ready?'ready':'loading');
 }
 const page=()=>createElement(Page);
 const render=()=>act(async()=>root.render(createElement(MemoryRouter,null,createElement(TabPageHost,{scope:'pending-trim',tabs,activeKey:active,maxHot:5,renderPage:page}))));
 for(const tab of tabs){active=tab.key;await render()}
 assert.equal(document.querySelectorAll('[data-tab-page]').length,8);
 await act(async()=>{for(const resolve of finish.values())resolve();await Promise.resolve()});
 assert.equal(document.querySelectorAll('[data-tab-page]').length,5);
 await act(async()=>root.unmount());
});

test('audited managed mode isolates inactive panels while ordinary Activity still pauses effects',async()=>{
 const {useTabPage,useTabDispose}=await import('../src/lib/tabPageContext.tsx');
 const {createPortal}=await import('react-dom');
 const {disposeTabPage}=await import('../src/lib/tabPageCache.ts');
 const root=createRoot(document.getElementById('root')!);let active='managed';
 const starts={managed:0,ordinary:0};const stops={managed:0,ordinary:0};let disposed=0;
 const tabs=['managed','ordinary'].map(key=>({key,location:{pathname:`/${key}`,search:'',hash:'',state:null,key}}));
 function Page(){
  const tab=useTabPage();const key=tab.key as keyof typeof starts;
  useTabPageAdapter(true,{effectMode:key==='managed'?'managed':'activity'});
  useEffect(()=>{starts[key]++;return ()=>{stops[key]++}},[key]);
  useTabDispose(()=>{disposed++},'resource');
  return createElement('section',{'data-observed-active':String(tab.active)},key,tab.container&&createPortal(createElement('b',{'data-managed-popup':key},'popup'),tab.container));
 }
 const page=()=>createElement(Page);
 const render=()=>act(async()=>root.render(createElement(MemoryRouter,null,createElement(TabPageHost,{scope:'managed-mode-test',tabs,activeKey:active,maxHot:5,renderPage:page}))));
 await render();active='ordinary';await render();
 const managed=document.querySelector<HTMLElement>('[data-tab-page="managed"]')!;
 assert.equal(managed.dataset.tabActive,'false');assert.equal(managed.dataset.tabEffectMode,'managed');
 assert.equal(managed.hasAttribute('inert'),true);assert.equal(managed.getAttribute('aria-hidden'),'true');assert.ok(managed.className.includes('managedInactive'));
 assert.equal(managed.querySelector('[data-observed-active]')?.getAttribute('data-observed-active'),'false');
 assert.equal(document.querySelector('[data-managed-popup="managed"]')?.closest('[data-tab-page]'),managed);
 assert.equal(stops.managed,0);
 active='managed';await render();assert.equal(stops.ordinary,1);assert.equal(starts.managed,1);
 assert.equal(managed.hasAttribute('inert'),false);assert.equal(managed.getAttribute('aria-hidden'),'false');
 active='ordinary';await render();assert.equal(starts.ordinary,2);assert.equal(starts.managed,1);
 await act(async()=>disposeTabPage('managed-mode-test','managed'));assert.equal(disposed,1);
 await act(async()=>root.unmount());
});
