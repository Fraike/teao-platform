import type {ProductPdfBox,ProductPdfPageSize} from '../../src/types/product.ts';

export function pdfDisplaySize(media:ProductPdfBox,crop:ProductPdfBox,rotation:number):ProductPdfPageSize {
  if(!Number.isFinite(rotation)||rotation%90!==0)throw new Error('PDF页面旋转角度无效');
  const width=Math.min(media.x+media.width,crop.x+crop.width)-Math.max(media.x,crop.x);
  const height=Math.min(media.y+media.height,crop.y+crop.height)-Math.max(media.y,crop.y);
  const visible=width>0&&height>0?{width,height}:{width:media.width,height:media.height};
  return ((rotation%360)+360)%180===90?{width:visible.height,height:visible.width}:visible;
}

export function assertLandscapePages(pages:ProductPdfPageSize[]) {
  if(pages.length<1||pages.length>200)throw new Error('PDF页数应为1–200');
  const invalid=pages.flatMap((page,index)=>Number.isFinite(page.width)&&Number.isFinite(page.height)&&page.height>0&&page.width>page.height?[]:[index+1]);
  if(invalid.length)throw new Error(`第 ${invalid.join('、')} 页不是横向页面，请将每页设置为横向后重新导出PDF`);
}
