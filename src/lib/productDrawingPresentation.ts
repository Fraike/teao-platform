import {PRODUCT_CATEGORY_IDS,STANDARD_CATEGORY_ALIASES} from '../../server/shared/product-classification.ts';
import type {ProductArchive,ProductDrawingStructure} from '../types/product';

export function usesGearDrawingStructure(product:ProductArchive) {
  if(product.categoryId)return product.categoryId===PRODUCT_CATEGORY_IDS.gear;
  return STANDARD_CATEGORY_ALIASES[product.category]==='gear_damper';
}

export function drawingStructureLabel(structure:ProductDrawingStructure|undefined) {
  return {geared:'有齿轮',gearless:'无齿轮',unspecified:'未区分结构'}[structure||'unspecified'];
}
