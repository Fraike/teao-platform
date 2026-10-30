import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProductPdfResourceCache } from '../src/lib/productPdfResources.ts';
test('PDF bytes reuse, parsed LRU destruction and explicit invalidation', async () => {
 let downloads=0, destroyed=0;
 const cache=createProductPdfResourceCache({fetch:async()=>{downloads++;return new Blob(['abc']);},parse:async()=>({destroy:async()=>{destroyed++;}})}, {documents:2,bytes:6});
 await cache.document('a');await cache.document('b');await cache.document('c');
 assert.equal(destroyed,1);assert.equal(cache.stats().documents,2);assert.equal(cache.stats().bytes,6);
 await cache.document('b');assert.equal(downloads,3);
 cache.clear();assert.equal(cache.stats().documents,0);assert.equal(cache.stats().bytes,0);
});
test('release parsed resources retains file bytes for cold restore',async()=>{
 let downloads=0;const cache=createProductPdfResourceCache({fetch:async()=>{downloads++;return new Blob(['abc']);},parse:async()=>({destroy:async()=>{}})});
 await cache.document('same-file');cache.release('same-file');await cache.document('same-file');assert.equal(downloads,1);
});
test('shared file remains parsed until last viewer releases it; eviction notifies survivors',async()=>{
 let destroyed=0,invalidated=0;
 const cache=createProductPdfResourceCache({fetch:async()=>new Blob(['x']),parse:async()=>({destroy:async()=>{destroyed++;}})});
 const one=cache.subscribe('a',()=>invalidated++),two=cache.subscribe('a',()=>invalidated++);
 const [first,second]=await Promise.all([cache.document('a'),cache.document('a')]);assert.equal(first,second);
 one();cache.releaseUnused('a');assert.equal(destroyed,0);
 await cache.document('b');await cache.document('c');assert.equal(destroyed,1);assert.equal(invalidated,1);
 two();cache.clear();
});
test('last tab owner releases all files, including older selections',async()=>{
 let destroyed=0;
 const cache=createProductPdfResourceCache({fetch:async()=>new Blob(['x']),parse:async()=>({destroy:async()=>{destroyed++;}})});
 cache.retain('tab-a',['same','older']);cache.retain('tab-a',['newer']);cache.retain('tab-b',['same']);
 await cache.document('same');await cache.document('older');
 cache.releaseOwner('tab-a');assert.equal(destroyed,1);assert.equal(cache.stats().bytes,1);
 assert.equal(cache.stats().documents,1);cache.releaseOwner('tab-b');assert.equal(destroyed,2);assert.equal(cache.stats().bytes,0);
});
