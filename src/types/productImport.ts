import type {ProductArchive,ProductDrawingRole,ProductDrawingStructure} from './product.ts';
export interface ProductImportBatch {id:string;name:string;createdAt:string;createdBy:string;}
export interface ProductImportCandidate {productId:string;internalNumber:string;model:string;standardIds:string[];}
export interface ProductImportTarget {productId:string;standardIds:string[];role?:ProductDrawingRole;structure?:ProductDrawingStructure;}
export interface ProductImportDecision {entryId:string;drawingNo:string;version:string;targets:ProductImportTarget[];}
export interface ProductImportLink {productId:string;fileId:string;}
export interface ProductImportEntry {
 id:string;batchId:string;sourcePath:string;filename:string;sha256:string;size:number;
 scope:'general'|'customer';series:string|null;sharedSeries?:string[];hints:string[];candidates:ProductImportCandidate[];
 decision?:ProductImportDecision;
 status:'ready'|'invalid'|'partial'|'imported';error:string|null;links:ProductImportLink[];
}
export interface ProductImportView {batch:ProductImportBatch;entries:ProductImportEntry[];products:ProductArchive[];}
