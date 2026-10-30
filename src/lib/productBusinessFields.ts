import type {ProductBusinessFields,ProductMaterial} from '../types/product.ts';
// Confirmed against SP0001-A and Mike's Kingdee configuration; custom weight is in grams.
export const PRODUCT_CUSTOM_FIELDS={packageQuantity:'custom_field__1__5s8xx4pvvzzjia',weight:'custom_field__2__5ug7lp875jr2'} as const;
function decimal(value:unknown):number|null {
 if(typeof value!=='number'&&typeof value!=='string')return null;
 if(typeof value==='string'&&!/^\d+(?:\.\d+)?$/.test(value.trim()))return null;
 const result=Number(value);return Number.isFinite(result)&&result>=0?result:null;
}
function packageQuantity(material:ProductMaterial|null):number|null {
 const custom=decimal(material?.custom_field?.[PRODUCT_CUSTOM_FIELDS.packageQuantity]);
 if(custom!==null&&custom>0)return custom;
 const regular=decimal(material?.min_package_qty);return regular!==null&&regular>0?regular:null;
}
export function resolveProductBusinessFields(detail:ProductMaterial|null,snapshot:ProductMaterial|null):ProductBusinessFields {
 const cached=detail&&snapshot&&detail.id!==snapshot.id?null:snapshot;
 const canUseWarehouse=!detail||!Object.hasOwn(detail,'stock_id')||Boolean(detail.stock_id&&detail.stock_id===cached?.stock_id);
 const warehouse=detail?.stock_name?.trim()||(canUseWarehouse?cached?.stock_name?.trim():null)||null;
 return {packageQuantity:packageQuantity(detail)??packageQuantity(cached),warehouseName:warehouse,
  weight:decimal(detail?.custom_field?.[PRODUCT_CUSTOM_FIELDS.weight])??decimal(cached?.custom_field?.[PRODUCT_CUSTOM_FIELDS.weight]),weightUnit:'g'};
}
export function formatProductWeight(fields:ProductBusinessFields):string {
 return fields.weight===null?'未维护 / 未获取':`${new Intl.NumberFormat('zh-CN',{minimumFractionDigits:3,maximumFractionDigits:6}).format(fields.weight)} ${fields.weightUnit}`;
}
