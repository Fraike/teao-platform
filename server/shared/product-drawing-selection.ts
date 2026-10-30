import {drawingAppliesToStandards} from './product-drawing-applicability.ts';
import type {ProductArchive,ProductDrawing,ProductDrawingStructure} from '../../src/types/product.ts';
export function filenameDrawingStructure(filename:string):ProductDrawingStructure {
 if(/无齿轮|不装齿轮/.test(filename))return 'gearless';
 return /有齿轮|带齿轮|\d+齿/.test(filename)?'geared':'unspecified';
}
export function productDrawingStructure(product:ProductArchive,standardId=''):ProductDrawingStructure {
 const selected=standardId?product.standards.filter(s=>s.id===standardId):product.standards;
 const values=selected.map(s=>s.fields.gear_spec?.trim()||'');
 if(!values.length||values.some(v=>!v))return 'unspecified';
 if(values.every(v=>/^(无|无齿轮|不装齿轮)$/.test(v)))return 'gearless';
 if(values.every(v=>/齿/.test(v)&&! /无齿轮|不装齿轮/.test(v)))return 'geared';
 return 'unspecified';
}
export function selectProductionDrawings(drawings:ProductDrawing[],standardId:string,product?:ProductArchive) {
 const structure=product?productDrawingStructure(product,standardId):'unspecified';
 const published=drawings.filter(d=>d.kind==='pdf'&&d.status==='published');
 const specific=published.filter(d=>standardId&&d.standardIds.length>0&&drawingAppliesToStandards(d.standardIds,product?.standards||[{id:standardId}],standardId));
 const candidates=[...specific,...published.filter(d=>!d.standardIds.length&&!specific.some(s=>s.drawingNo===d.drawingNo&&(s.structure||'unspecified')===(d.structure||'unspecified')))];
 const fit=(d:ProductDrawing)=>structure==='unspecified'?0:d.structure===structure?0:!d.structure||d.structure==='unspecified'?1:2;
 return candidates.sort((a,b)=>Number(!a.standardIds.length)-Number(!b.standardIds.length)||fit(a)-fit(b)||Number(a.role==='supplement')-Number(b.role==='supplement')||a.drawingNo.localeCompare(b.drawingNo,'zh-CN',{numeric:true})||a.id.localeCompare(b.id));
}
