import {assertLandscapePages} from '../../server/shared/product-pdf-layout.ts';
import type {ProductPdfPageSize} from '../types/product.ts';

export async function inspectProductPdf(file:File,signal?:AbortSignal):Promise<number> {
  if(!/\.pdf$/i.test(file.name))throw new Error('当前图纸上传仅支持PDF格式');
  if(!file.size||file.size>25*1024*1024)throw new Error('PDF文件应为1字节至25MiB');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(String.fromCharCode(...bytes.subarray(0,5))!=='%PDF-')throw new Error('请上传有效PDF文件');
  signal?.throwIfAborted();
  const {loadProductPdf}=await import('./productPdf');
  signal?.throwIfAborted();
  const task=loadProductPdf(bytes),abort=()=>{void task.destroy();};
  signal?.addEventListener('abort',abort,{once:true});
  try {
    const pdf=await task.promise;
    if(pdf.numPages<1||pdf.numPages>200)throw new Error('PDF页数应为1–200');
    const pages:ProductPdfPageSize[]=[];
    for(let number=1;number<=pdf.numPages;number++) {
      signal?.throwIfAborted();
      const page=await pdf.getPage(number);
      pages.push(page.getViewport({scale:1}));page.cleanup();
    }
    assertLandscapePages(pages);return pdf.numPages;
  }finally{signal?.removeEventListener('abort',abort);await task.destroy();}
}
