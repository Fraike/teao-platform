import assert from 'node:assert/strict';
import {test} from 'node:test';
import './standard-frontend-dom.ts';
import {useTabStore} from '../src/lib/tabStore.ts';

test('ten tabs include home; rejecting a new tab leaves state and persistence untouched',()=>{
 const store=useTabStore.getState();store.resetForAuthentication();
 for(let i=1;i<10;i++)store.openTab({key:`/materials/${i}`,label:String(i)});
 const before=useTabStore.getState();const saved=localStorage.getItem('teao_tabs_v2');
 assert.equal(store.openTab({key:'/materials/11',label:'11'}),false);
 assert.equal(useTabStore.getState(),before);
 assert.equal(localStorage.getItem('teao_tabs_v2'),saved);
 const location={pathname:'/materials/1',search:'?view=files',hash:'#drawing',state:{draft:true},key:'updated'};
 assert.equal(store.openTab({key:location.pathname,label:'1',location}),true);
 assert.equal(useTabStore.getState().tabs.find(tab=>tab.key===location.pathname)?.location,location);
 store.closeTab('/materials/2');
 assert.equal(store.openTab({key:'/materials/11',label:'11'}),true);
 assert.equal(useTabStore.getState().tabs.length,10);
});
