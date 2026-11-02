import assert from 'node:assert/strict';
import {test,mock} from 'node:test';
let destroys=0,failDestroy=false;
const failure=new Error('PDF parse failed');
mock.module('../src/lib/productFiles.ts',{namedExports:{productBinary:async()=>new Blob(['%PDF-invalid'])}});
mock.module('../src/lib/productPdf.ts',{namedExports:{loadProductPdf:()=>({promise:Promise.reject(failure),destroy:async()=>{destroys++;if(failDestroy)throw new Error('cleanup failed');}})}});
const {productPdfResources}=await import('../src/lib/productPdfResources.ts');
test('failed PDF loading tasks are destroyed on each retry and cleanup never hides the parse error',async()=>{
 await assert.rejects(()=>productPdfResources.document('/invalid'),error=>error===failure);
 assert.equal(destroys,1);assert.equal(productPdfResources.stats().documents,0);
 failDestroy=true;
 await assert.rejects(()=>productPdfResources.document('/invalid'),error=>error===failure);
 assert.equal(destroys,2);productPdfResources.reset();assert.equal(destroys,2);
});
