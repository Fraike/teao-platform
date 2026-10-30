import assert from 'node:assert/strict';import {test} from 'node:test';import './standard-frontend-dom.ts';
import {useTabStore} from '../src/lib/tabStore.ts';
test('tab navigation retains latest full location in memory but persists only tab descriptors',()=>{
 const state=useTabStore.getState();state.resetForAuthentication();
 const location={pathname:'/product-standards',search:'?category=gear_damper&standardId=private-standard',hash:'',state:null,key:'first'};
 state.openTab({key:'/product-standards',label:'产品标准',location});
 state.openTab({key:'/product-standards',label:'产品标准',location:{...location,search:'?category=rack_damper',key:'second'}});
 assert.equal(useTabStore.getState().tabs.find(t=>t.key==='/product-standards')?.location?.search,'?category=rack_damper');
 assert(!localStorage.getItem('teao_tabs_v2')?.includes('private-standard'));
 assert(!localStorage.getItem('teao_tabs_v2')?.includes('location'));
});
