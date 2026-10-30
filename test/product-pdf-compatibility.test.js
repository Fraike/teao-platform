import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire,registerHooks} from 'node:module';
import {test} from 'node:test';

// Resolve Vite's worker URL import without replacing the actual PDF.js engine.
registerHooks({
  resolve(specifier,context,nextResolve) {
    if(specifier.endsWith('?worker&url')) {
      const worker=nextResolve(specifier.slice(0,-11),context).url;
      return {url:`data:text/javascript,${encodeURIComponent(`export default ${JSON.stringify(worker)};`)}`,shortCircuit:true};
    }
    return nextResolve(specifier,context);
  },
});

test('shared PDF loader parses and renders without native Uint8Array.toHex',async()=>{
  const require=createRequire(import.meta.resolve('pdfjs-dist/package.json'));
  const {DOMMatrix,ImageData,Path2D,createCanvas}=require('@napi-rs/canvas');
  Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
  const serverRequire=createRequire(new URL('../server/package.json',import.meta.url));
  const {PDFDocument,rgb}=serverRequire('pdf-lib');
  const source=await PDFDocument.create();
  source.addPage([842,595]).drawRectangle({x:0,y:0,width:842,height:595,color:rgb(1,0,0)});
  const bytes=await source.save();
  const descriptor=Object.getOwnPropertyDescriptor(Uint8Array.prototype,'toHex');
  Reflect.deleteProperty(Uint8Array.prototype,'toHex');
  assert.equal(typeof Uint8Array.prototype.toHex,'undefined');
  let task;
  try {
    const {loadProductPdf}=await import('../src/lib/productPdf.ts');
    task=loadProductPdf(bytes);
    const document=await task.promise;
    assert.equal(document.numPages,1);
    const page=await document.getPage(1);
    for(const rotation of [0,90,270]) {
      const viewport=page.getViewport({scale:0.25,rotation});
      const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
      await page.render({canvas,viewport}).promise;
      assert.deepEqual([...canvas.getContext('2d').getImageData(10,10,1,1).data],[255,0,0,255]);
    }
    const code=readFileSync(new URL('../src/lib/productPdf.ts',import.meta.url),'utf8');
    assert.match(code,/pdfjs-dist\/legacy\/build\/pdf\.mjs/);
    assert.match(code,/pdfjs-dist\/legacy\/build\/pdf\.worker\.min\.mjs\?worker&url/);
  } finally {
    await task?.destroy();
    if(descriptor)Object.defineProperty(Uint8Array.prototype,'toHex',descriptor);
    else Reflect.deleteProperty(Uint8Array.prototype,'toHex');
  }
});
