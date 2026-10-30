// Keep the engine and worker on the compatibility build for older browser kernels.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&url';
GlobalWorkerOptions.workerSrc = workerUrl;

export function loadProductPdf(src: string | Uint8Array) {
  return getDocument({ ...(typeof src === 'string' ? { url: src } : { data: src }) });
}
export async function renderProductPrint(blob: Blob, target: Window, signal?: AbortSignal) {
  const task = loadProductPdf(new Uint8Array(await blob.arrayBuffer()));
  const abort = () => { void task.destroy(); }; signal?.addEventListener('abort', abort, { once: true });
  try {
    signal?.throwIfAborted();
    const pdf = await task.promise;
    target.document.title = '受控图纸打印';
    target.document.body.textContent = '';
    const style = target.document.createElement('style');
    style.textContent = 'body{margin:0;background:#eef0f3;font:14px sans-serif;}header{padding:16px;background:white;position:sticky;top:0;}button{padding:8px 20px;margin-right:16px;cursor:pointer;}img{display:block;max-width:100%;margin:16px auto;background:white;}@media print{@page{margin:0;}body{background:white;}header{display:none;}img{width:100%;height:auto;margin:0;break-after:page;}img:last-child{break-after:auto;}}';
    target.document.head.append(style);
    const header = target.document.createElement('header'), button = target.document.createElement('button');
    button.textContent = '打印图纸'; button.disabled = true; button.addEventListener('click', () => target.print());
    header.append(button, '正在生成图纸页面…'); target.document.body.append(header);
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      signal?.throwIfAborted();
      if (target.closed) throw new Error('打印窗口已关闭');
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 }), viewport = page.getViewport({ scale: Math.min(2, 1800 / base.width) });
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport, intent: 'print' }).promise;
      const image = target.document.createElement('img'); image.alt = `图纸第${pageNumber}页`; image.src = canvas.toDataURL('image/png');
      await image.decode(); target.document.body.append(image); canvas.width = 0; canvas.height = 0; page.cleanup();
    }
    header.lastChild!.textContent = '文件已附版本与打印时间，请回收旧版纸质图纸。'; button.disabled = false;
  } finally { signal?.removeEventListener('abort', abort); await task.destroy(); }
}
