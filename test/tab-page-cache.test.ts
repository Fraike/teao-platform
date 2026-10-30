import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getTabPage, disposeTabPage, writeTabSnapshot, guardTabClose, selectHotPages, clearTabScope} from '../src/lib/tabPageCache.ts';
test('closed page rejects stale writes and reopening gets fresh generation',()=>{
 const old=getTabPage('s','a'); writeTabSnapshot(old,'x',2); disposeTabPage('s','a');
 assert.equal(writeTabSnapshot(old,'x',3),false); assert.equal(getTabPage('s','a').snapshot.has('x'),false); clearTabScope('s');
});
test('LRU retains active and busy pages, evicts only adapted pages',()=>{
 const pages=Array.from({length:8},(_,i)=>getTabPage('l',String(i)));
 pages.forEach((p,i)=>{p.adapted=true;p.lastUsed=i}); pages[0].busy.set('save',true);
 const hot=selectHotPages(pages,'7',5); assert.equal(hot.length,5); assert.ok(hot.includes(pages[0]));assert.ok(hot.includes(pages[7]));clearTabScope('l');
});
test('close guard includes cold dirty records and blocks busy',async()=>{
 const p=getTabPage('g','a');p.dirty.set('draft',true);
 assert.equal(await guardTabClose('g',['a'],()=>false),false);
 assert.equal(await guardTabClose('g',['a'],()=>true),true);
 p.busy.set('save',true); assert.equal(await guardTabClose('g',['a'],()=>true),false);clearTabScope('g');
});
test('cold instance cannot write into a newly mounted instance',async()=>{
 const {startTabInstance,invalidateTabInstance}=await import('../src/lib/tabPageCache.ts');
 const p=getTabPage('epoch','a');const first=startTabInstance(p);p.dirty.set('old-hook',true);
 invalidateTabInstance(p);
 assert.equal(await guardTabClose('epoch',['a'],()=>false),false);
 const second=startTabInstance(p);p.dirty.set('new-hook',false);
 assert.equal(await guardTabClose('epoch',['a'],()=>false),true);
 assert.equal(writeTabSnapshot(p,'draft','stale',first),false);
 assert.equal(writeTabSnapshot(p,'draft','saved',second),true);clearTabScope('epoch');
});
test('uncommitted declared adapter is recyclable; undeclared and dirty pages remain protected',()=>{
 const fresh=getTabPage('declared','fresh');fresh.adapterDeclared=true;
 const legacy=getTabPage('declared','legacy');
 const dirty=getTabPage('declared','dirty');dirty.adapterDeclared=true;dirty.dirty.set('draft',true);
 const active=getTabPage('declared','active');active.adapted=true;
 const selected=selectHotPages([fresh,legacy,dirty,active],'active',1);
 assert.equal(selected.includes(fresh),false);assert.equal(selected.includes(legacy),true);assert.equal(selected.includes(dirty),true);
 clearTabScope('declared');
});
