import assert from 'node:assert/strict';
import {test} from 'node:test';
import './standard-frontend-dom.ts';
localStorage.setItem('teao_tabs_v2',JSON.stringify({tabs:[{key:'/materials/1',label:'first'},...Array.from({length:14},(_,i)=>({key:`/materials/${i+1}`,label:String(i+1)}))],activeKey:'/materials/14'}));
const {useTabStore}=await import('../src/lib/tabStore.ts');
test('restore limits and deduplicates tabs, keeps home and saved active, writes normalized storage',()=>{
 const {tabs,activeKey}=useTabStore.getState();
 assert.equal(tabs.length,10);assert.equal(tabs[0].key,'/');assert.equal(tabs[9].key,'/materials/14');
 assert.deepEqual(tabs.slice(1,9).map(tab=>tab.key),Array.from({length:8},(_,i)=>`/materials/${i+1}`));
 assert.equal(new Set(tabs.map(tab=>tab.key)).size,10);assert.equal(activeKey,'/materials/14');
 assert.deepEqual(JSON.parse(localStorage.getItem('teao_tabs_v2')!),{tabs,activeKey});
});
