// Only explicit T/V pairs with identical number and structural suffix share drawings.
export function sharedDrawingSeries(sourcePath:string,primary:string|null):string[] {
 const parts=sourcePath.split('/');
 function pair(text:string):string[]|null {
  const match=text.toUpperCase().match(/RD-(T\d+[A-Z]*)\s*[-&/]\s*(?:RD-)?(V\d+[A-Z]*)(?![A-Z0-9])/);
  return match&&match[1].slice(1)===match[2].slice(1)?[match[1],match[2]]:null;
 }
 const filename=parts.at(-1)||'',explicit=pair(filename);
 if(explicit){const direction=primary?.match(/-(CW|CCW|左|右)$/)?.[1];return direction?explicit.map(s=>`${s}-${direction}`):explicit;}
 if(/RD-T\d+[A-Z]*\s*[-&/]\s*(?:RD-)?V\d+[A-Z]*/i.test(filename))return primary?[primary]:[];
 const folder=parts.slice(0,-1).map(pair).find(Boolean);
 if(folder&&primary&&folder.includes(primary))return folder;
 return primary?[primary]:[];
}
