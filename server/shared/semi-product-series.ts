import type {ProductArchive} from '../../src/types/product.ts';
import type {SemiProductIdentity} from '../../src/types/semiProduct.ts';
export const SEMI_SERIES_CATEGORY_IDS:readonly string[]=['2314559979366968320','2314560542703938560','2314560711633708032'];
export const SEMI_DRAWING_CATEGORY_IDS:readonly string[]=[...SEMI_SERIES_CATEGORY_IDS,'2314560770664341504'];
export function isManagedSemiProduct(product:Pick<ProductArchive,'group'|'categoryId'>) {
  return product.group==='semi'&&SEMI_DRAWING_CATEGORY_IDS.includes(product.categoryId);
}
export function parseSemiProductName(name:string):SemiProductIdentity {
  const text=name.trim();
  const match=text.toUpperCase().match(/^(RD-)?([TVR]?\d+[A-Z]*)(?:\s*[/／]\s*(?:RD-)?[TVR]?\d+[A-Z]*)*/);
  const valid=match&&(/^[TVR]\d/.test(match[2])||Boolean(match[1]))&&!/^[A-Z0-9]/.test(text.slice(match[0].length).toUpperCase());
  const rest=valid?text.slice(match[0].length).replace(/^[-+\s]+/,''):text;
  const materialMatch=rest.match(/(?:PPSU|POM|PA66|PA6|PBT|ABS|TPE|TPU|PC|PP)(?=[/\s\-\d]|$)/i);
  const material=materialMatch?rest.slice(materialMatch.index).trim():'';
  const description=(materialMatch?rest.slice(0,materialMatch.index):rest).replace(/[-+\s]+$/,'');
  const partName=description.match(/锁舌|锁芯|锁块|下座|下盖|上盖|轴芯|轴心|拉柄套|拉柄|拉杆套|拉杆|齿轮|外壳|底壳|盖板|內轴|内轴|绳钩|硬拉绳|拉绳|扭簧|压簧|弹簧|钢针|钢圈|转轴|插件|垫片|弹片|碰珠|胶帽|扣件|铰链|O型圈|O形圈|胶圈|密封圈/i)?.[0]||'';
  const color=description.match(/透明色|深咖红|米色|灰色|白色|黑色|红色|蓝色|本色|黑|白|灰|红|蓝|黄|橙|绿/)?.[0]||'';
  const direction=description.toUpperCase().match(/CCW|CW|左|右/)?.[0];
  let series:string[]=[];
  if(valid){
    const tokens=match[0].replace(/^RD-/,'').split(/\s*[/／]\s*/);
    const prefix=tokens[0].match(/^[TVR]/)?.[0]||'';
    series=[...new Set(tokens.map(value=>{
      const token=value.replace(/^RD-/,'');const full=/^[TVR]/.test(token)?token:prefix+token;
      return (/^\d/.test(full)?`RD-${full}`:full)+(direction?`-${direction}`:'');
    }))];
  }
  return {series,partName,material,color,structure:description,pending:!series.length};
}
