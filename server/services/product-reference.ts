import type { ProductStandardReference } from '../../src/types/product.ts';
import type Database from 'better-sqlite3';
interface StandardRow {drawing_source_number:string|null;drawing_source_standard_id:string|null;id:string;serial_no:string;customer:string;customer_part_no:string;model:string;category_key:string;category_name:string;vehicle_model:string;version_no:number;fields:string;}
export function publishedProductReferences(db:Database.Database):ProductStandardReference[] {
  const rows=db.prepare(`SELECT s.id,s.serial_no,v.customer,v.customer_part_no,v.model,v.category_key,
    c.name category_name,v.vehicle_model,v.version_no,v.fields,ds.source_number drawing_source_number,ds.source_standard_id drawing_source_standard_id FROM product_standards s
    JOIN product_standard_versions v ON v.id=(SELECT id FROM product_standard_versions WHERE standard_id=s.id AND status='published' ORDER BY version_no DESC LIMIT 1)
    LEFT JOIN standard_categories c ON c.key=v.category_key
    LEFT JOIN standard_drawing_sources ds ON ds.standard_id=s.id`).all() as StandardRow[];
  return rows.map(r=>({...(r.drawing_source_number?{drawingSourceNumber:r.drawing_source_number,drawingSourceStandardId:r.drawing_source_standard_id||undefined}:{}),id:r.id,serialNo:r.serial_no,customer:r.customer||'',customerPartNo:r.customer_part_no||'',model:r.model||'',
    vehicleModel:r.vehicle_model||'',categoryKey:r.category_key,categoryName:r.category_name||r.category_key,versionNo:r.version_no,fields:JSON.parse(r.fields||'{}')}));
}
