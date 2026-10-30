import {drawingAppliesToStandards} from '../shared/product-drawing-applicability.ts';
import type {ProductArchive} from '../../src/types/product.ts';
import type {ProductCatalog} from './product-catalog.ts';
import {productError} from './product-catalog.ts';
import type {ProductDrawingStatusRequest} from '../../src/types/product.ts';
export function productDrawingStatuses(store:ProductCatalog,products:ProductArchive[],items:ProductDrawingStatusRequest[]) {
 if(!Array.isArray(items)||items.length>150||items.some(i=>!i||typeof i.number!=='string'||typeof i.standardId!=='string'||i.number.length>200||i.standardId.length>100))throw productError('图纸状态查询格式无效');
 const byNumber=new Map(products.map(p=>[p.internalNumber,p]));
 const files=store.db.prepare("SELECT product_id,standard_ids FROM product_files WHERE kind='pdf' AND status='published'").all() as {product_id:string;standard_ids:string}[];
 const scopes=new Map<string,string[][]>();for(const file of files)scopes.set(file.product_id,[...(scopes.get(file.product_id)||[]),JSON.parse(file.standard_ids)]);
 return items.map(item=>{const p=byNumber.get(item.number);return {...item,hasDrawing:Boolean(p?.productionAvailable&&(scopes.get(p.id)||[]).some(ids=>drawingAppliesToStandards(ids,p.standards,item.standardId)))};});
}
