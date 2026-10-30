import assert from 'node:assert/strict';
import {test} from 'node:test';
import './standard-frontend-dom.ts';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {TabPageHost} from '../src/components/TabPageHost.tsx';
import QuotationPage from '../src/pages/QuotationPage.tsx';
import QuotationPageIntl from '../src/pages/QuotationPageIntl.tsx';
import QuotationManagementPage from '../src/pages/QuotationManagementPage.tsx';
import {useQuotationStore,useIntlQuotationStore} from '../src/lib/store.ts';
import {api} from '../src/lib/api.ts';
globalThis.Image=window.Image;
for(const intl of [false,true])for(const copy of [false,true])test(`real ${intl?'international':'domestic'} quotation ${copy?'copy':'edit'} cold restore preserves edits without GET`,async()=>{
 const store=intl?useIntlQuotationStore:useQuotationStore;const Page=intl?QuotationPageIntl:QuotationPage;
 const original=api.get;let calls=0;const source=structuredClone(store.getState().quotation);
 api.get=(async()=>{calls++;return {data:{id:'saved',market:intl?'international':'domestic',quotation:source}}}) as typeof api.get;
 const root=createRoot(document.getElementById('root')!);let active='a';
 const tabs=['a','b'].map(key=>({key,location:{pathname:'/quotation',search:copy?'?copyId=saved':'?id=saved',hash:'',state:null,key}}));
 const render=()=>act(async()=>{root.render(createElement(MemoryRouter,{initialEntries:[copy?'/quotation?copyId=saved':'/quotation?id=saved']},createElement(TabPageHost,{scope:`quote-${intl}-${copy}`,tabs,activeKey:active,maxHot:1,renderPage:()=>createElement(Page,{headerHeight:60})})));await new Promise(r=>setTimeout(r,40));});
 try{await render();await render();const warmCalls=calls;const changed={...store.getState().quotation,customer:{...source.customer,name:'Unsaved local edit'}};await act(()=>store.getState().replaceQuotation(changed));await render();assert.equal(calls,warmCalls,'editing does not reload');
 active='b';await render();await render();const before=calls;
 await act(()=>store.getState().replaceQuotation(changed));active='a';await render();await render();
 assert.equal(calls,before);assert.equal(store.getState().quotation.customer.name,'Unsaved local edit');
 }finally{await act(()=>root.unmount());api.get=original;}
});
test('real quotation management restores records without GET',async()=>{
 const original=api.get;let calls=0;api.get=(async()=>{calls++;return {data:[],total:0}}) as typeof api.get;
 const root=createRoot(document.getElementById('root')!);let active='a';const tabs=['a','b'].map(key=>({key,location:{pathname:'/quotation-management',search:'',hash:'',state:null,key}}));
 const render=()=>act(async()=>{root.render(createElement(MemoryRouter,null,createElement(TabPageHost,{scope:'quote-management',tabs,activeKey:active,maxHot:1,renderPage:()=>createElement(QuotationManagementPage)})));await new Promise(r=>setTimeout(r,40));});
 try{await render();await render();active='b';await render();await render();const before=calls;active='a';await render();await render();assert.equal(calls,before);}finally{await act(()=>root.unmount());api.get=original;}
});
