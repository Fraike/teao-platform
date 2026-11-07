import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateGreaseAmount, greaseCategoryFields } from '../server/shared/standard-grease.ts';

test('grease requires a nonnegative range or tolerance, not a single value', () => {
  for (const value of ['', ' ', '0.4–0.6', '0.4-0.6', '0.5±0.05', '0.5+0.05/-0.02', '0.3±0.3', '0–0']) assert.equal(validateGreaseAmount(value), undefined, value);
  for (const value of ['0.5', '-0.4–0.6', '0.6-0.4', '0.1±0.2', '0.1+0.1/-0.2', 'NaN±0', '0.5±-0.1', 'abc', '1–Infinity']) assert.ok(validateGreaseAmount(value), value);
});

test('five categories augment old field definitions once, in the right position', () => {
  for (const key of ['gear_damper','barrel_damper','rack_damper','air_pull_cord','sanitary_damper']) {
    const anchor = key === 'sanitary_damper' ? 'oil_no' : 'winter_test_standard';
    const fields = [{key:'test_standard',label:'测试标准'}, {key:anchor,label:'anchor'}, {key:'remark',label:'备注'}];
    const augmented=greaseCategoryFields(key,fields);
    assert.equal(augmented[augmented.findIndex(f=>f.key===anchor)+1].key,'grease_amount_g');
    assert.deepEqual(greaseCategoryFields(key,augmented),augmented);
  }
  for(const key of ['lock_sync','air_pull_handle']) assert.deepEqual(greaseCategoryFields(key,[]),[]);
});

test('store rejects invalid saves and preserves grease through review and change history', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'teao-grease-'));
  const s=await import('../server/services/standard-store.js');
  s.initDB();
  const a={id:'grease-author',name:'录入人'}, b={id:'grease-reviewer',name:'审核人'};
  const input={serialNo:'grease-test',categoryKey:'gear_damper',customer:'客户',model:'型号',fields:{grease_amount_g:'0.5±0.05'}};
  const expected=(d: {versions: {id:string;revision:number}[]})=>({versionId:d.versions[0].id,revision:d.versions[0].revision});
  try {
    for(const category of s.listCategories())assert.equal(category.fields.some((f:{key:string})=>f.key==='grease_amount_g'),!['lock_sync','air_pull_handle'].includes(category.key));
    assert.throws(()=>s.createStandard({...input,fields:{grease_amount_g:'0.5'}},a),/油量/);
    let d=s.createStandard(input,a);
    assert.equal(d.versions[0].fields.grease_amount_g,'0.5±0.05');
    assert.throws(()=>s.updateStandard(d.id,{...expected(d),fields:{grease_amount_g:'0.6-0.4'}},a),/油量/);
    d=s.submitStandard(d.id,a,expected(d));
    d=s.reviewStandard(d.id,{approve:true,...expected(d)},b);
    d=s.updateStandard(d.id,{...expected(d),fields:{grease_amount_g:'0.4–0.6'}},a);
    assert.ok(d.changes.some((change:{fieldKey:string;fieldLabel:string})=>change.fieldKey==='grease_amount_g'&&change.fieldLabel==='油量（阻尼脂）（g）'));
    assert.equal(s.getStandard(d.id,{onlyPublished:true}).versions[0].fields.grease_amount_g,'0.5±0.05');
    const {publicationSections}=await import('../server/services/standard-publication.js');
    const rows=publicationSections(d,d.versions[0],{fields:[]})[0].rows;
    assert.ok(rows.some(([label,value]:string[])=>label==='油量（阻尼脂）（g）'&&value==='0.4–0.6'));
    const {buildStandardWorkbook}=await import('../src/lib/standardExcel.ts');
    const {buildStandardPrintHtml}=await import('../src/lib/standardPrint.ts');
    const products=[{standard:d,version:d.versions[0]}];
    const categories=s.listCategories();
    const book=await buildStandardWorkbook(products,categories,new Date().toISOString());
    assert.match(JSON.stringify(book),/油量（阻尼脂）（g）/);
    assert.match(JSON.stringify(book),/0.4–0.6/);
    const html=buildStandardPrintHtml(products,categories,{generatedAt:new Date().toISOString(),styleUrl:''});
    assert.match(html,/油量（阻尼脂）（g）/);
    assert.match(html,/0.4–0.6/);
    for(const [part,amount] of [['盖','0.2–0.3'],['座','0.5±0.1']]) {
      const item=s.createStandard({...input,serialNo:`grease-${part}`,categoryKey:'sanitary_damper',fields:{part_type:part,grease_amount_g:amount}},a);
      assert.equal(s.getStandard(item.id).versions[0].fields.grease_amount_g,amount);
    }
  } finally { s.closeDB(); }
});
