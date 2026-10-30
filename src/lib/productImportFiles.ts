export function isFinishedPdfPath(sourcePath:string):boolean {
 const parts=sourcePath.split('/');
 return parts.every(part=>part&&!part.startsWith('.'))&&/\.pdf$/i.test(parts.at(-1)||'')
  &&!parts.some(part=>['子件图','3D'].includes(part))
  &&(parts.includes('成品图')||parts.includes('客户图纸')||parts.length<=3);
}
