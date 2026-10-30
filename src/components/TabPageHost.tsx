/* eslint-disable react-hooks/refs, react-hooks/immutability -- Host owns mutable session records; no record data is rendered as business state. */
import {Activity,memo,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {ConfigProvider} from 'antd';
import {UNSAFE_LocationContext} from 'react-router-dom';
import type {TabPageHostProps,TabPageRecord} from '../types/tabPage';
import {clearTabScope,disposeTabPage,invalidateTabInstance,startTabInstance,getTabPage,getTabPagesVersion,selectHotPages,subscribeTabPages} from '../lib/tabPageCache';
import {TabPageActiveContext,TabPageContext} from '../lib/tabPageContext';
import styles from './TabPageHost.module.css';
import {useTabDomScroll} from '../lib/useTabDomScroll';

export function TabPageHost({scope,tabs,activeKey,renderPage,maxHot=5}:TabPageHostProps){
 useSyncExternalStore(subscribeTabPages,getTabPagesVersion,getTabPagesVersion);
 const session=useRef({scope,hot:new Map<string,TabPageRecord>(),visited:new Set<string>()});
 const priorScopes=useRef(new Set<string>());
 const mounts=useRef(new Map<string,number>());
 const visitClock=useRef(0);
 if(session.current.scope!==scope){priorScopes.current.add(session.current.scope);session.current={scope,hot:new Map(),visited:new Set()}}
 const current=session.current;
 const active=tabs.find(tab=>tab.key===activeKey);
 if(active){
  const record=getTabPage(scope,activeKey);if(!record.location||record.location.pathname!==active.location.pathname||record.location.search!==active.location.search||record.location.hash!==active.location.hash||record.location.state!==active.location.state)record.location={...active.location};
  record.lastUsed=++visitClock.current;
  if(!current.hot.has(activeKey))startTabInstance(record);
  current.hot.set(activeKey,record);current.visited.add(activeKey);
 }
 const keys=new Set(tabs.map(tab=>tab.key));
 current.hot.forEach(record=>{record.active=record.key===activeKey});
 const candidates=[...current.hot.values()].filter(record=>keys.has(record.key)&&record.alive);
 const hot=selectHotPages(candidates,activeKey,maxHot);
 candidates.filter(record=>!hot.includes(record)).forEach(invalidateTabInstance);
 current.hot=new Map(hot.map(record=>[record.key,record]));
 useEffect(()=>{
  priorScopes.current.forEach(clearTabScope);priorScopes.current.clear();
  [...current.visited].filter(key=>!keys.has(key)).forEach(key=>{disposeTabPage(scope,key);current.visited.delete(key)});
 });
 useEffect(()=>{
  const counts=mounts.current;counts.set(scope,(counts.get(scope)??0)+1);
  return ()=>{counts.set(scope,(counts.get(scope)??1)-1);queueMicrotask(()=>{if(!counts.get(scope))clearTabScope(scope)})};
 },[scope]);
 return <div className={styles.host}>{hot.map(record=><TabPageFrame key={`${scope}:${record.key}`} record={record} location={record.location!} active={record.key===activeKey} effectMode={record.effectMode} renderPage={renderPage}/>)}</div>;
}
const TabPageFrame=memo(function TabPageFrame({record,location,active,effectMode,renderPage}:{effectMode:TabPageRecord['effectMode'];record:TabPageRecord;location:NonNullable<TabPageRecord['location']>;active:boolean;renderPage:TabPageHostProps['renderPage']}){
 const [instance]=useState(record.instance);
 const managedEffects=effectMode==='managed';
 const container=useRef<HTMLDivElement>(null);
 const [popupContainer,setPopupContainer]=useState<HTMLElement|null>(null);
 const bindContainer=useCallback((element:HTMLDivElement|null)=>{if(element){container.current=element;setPopupContainer(element)}},[]);
 useTabDomScroll(record,instance,active,container);
 // Only audited pages opt in. Freeze their inactive geometry so ancestor/window
 // resizes cannot trigger hidden table measurements; ordinary pages use Activity.
 useLayoutEffect(()=>{
  const element=container.current;if(!active||!managedEffects||!element)return;
  const capture=(width:number,height:number)=>{
   if(width>0)element.style.setProperty('--tab-page-width',`${width}px`);
   if(height>0)element.style.setProperty('--tab-page-height',`${height}px`);
  };
  const rect=element.getBoundingClientRect();capture(rect.width,rect.height);
  if(typeof ResizeObserver==='undefined')return;
  const observer=new ResizeObserver(entries=>{if(record.alive&&record.active){const rect=entries[0]?.contentRect;if(rect)capture(rect.width,rect.height)}});
  observer.observe(element);return ()=>observer.disconnect();
 },[active,managedEffects,record]);
 const routerContext=useContext(UNSAFE_LocationContext);
 const getPopupContainer=useCallback(()=>container.current??document.body,[]);
 const [restored]=useState(record.snapshot.size>0);
 const routeContext=useMemo(()=>({navigationType:routerContext.navigationType,location}),[location,routerContext.navigationType]);
 const page=useMemo(()=>renderPage(location),[renderPage,location]);
 const sessionContext=useMemo(()=>({record,instance,active:true,restored,container:popupContainer}),[record,instance,restored,popupContainer]);
 useEffect(()=>{const element=container.current;if(element){element.scrollTop=record.scrollTop;element.scrollLeft=record.scrollLeft}},[record]);
 return <Activity mode={active||managedEffects?'visible':'hidden'}><div ref={bindContainer} className={`${styles.page} ${managedEffects&&!active?styles.managedInactive:''}`} inert={!active} aria-hidden={!active} data-tab-active={active} data-tab-effect-mode={effectMode??'activity'} data-tab-page={record.key} data-page-scroll-container data-table-page-viewport
  onScroll={event=>{record.scrollTop=event.currentTarget.scrollTop;record.scrollLeft=event.currentTarget.scrollLeft}}>
  <TabPageActiveContext.Provider value={active}><TabPageContext.Provider value={sessionContext}>
   <UNSAFE_LocationContext.Provider value={routeContext}>
    <ConfigProvider getPopupContainer={getPopupContainer}>{page}</ConfigProvider>
   </UNSAFE_LocationContext.Provider>
  </TabPageContext.Provider></TabPageActiveContext.Provider>
 </div></Activity>;
});
