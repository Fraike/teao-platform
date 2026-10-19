import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import XLSX from 'xlsx';
import { parseStandardImportRows } from '../src/lib/standardImport.ts';
import { normalizeStandardImportProject, standardImportIdentity } from '../server/services/standard-import-identity.js';
import { parseCommentHistory } from '../server/services/standard-comment-repair.js';
import { formalMainSource, FORMAL_MAIN_HASH } from './fixtures/standard-source.ts';

test('synthetic project suffixes tolerate whitespace while customer English spaces remain meaningful', () => {
  for (const example of [
    {raw:'比亚迪SFHA-5303200\n/CQHA▲',customer:'比亚迪▲',project:'SFHA-5303200/CQHA'},
    {raw:'宁波新泉CC1E-A0-G\n -5303200',customer:'宁波新泉',project:'CC1E-A0-G-5303200'},
    {raw:'常州/长沙新泉\nEKS▲',customer:'常州/长沙新泉▲',project:'EKS'},
    {raw:'美国Jordi Sim▲',customer:'美国Jordi Sim▲',project:''},
  ]) {
    const record = {serialNo:'SP-SYNTHETIC',customer:example.raw,model:'M',fields:{}};
    const normalized = normalizeStandardImportProject(record);
    assert.deepEqual(normalized,{customer:example.customer,vehicleModel:example.project});
    assert.equal(standardImportIdentity(record),standardImportIdentity({...record,...normalized}));
    assert.equal(record.customer,example.raw);
  }
  const english = {serialNo:'SP-SYNTHETIC',customer:'美国Jordi Sim▲',model:'M',fields:{}};
  assert.notEqual(standardImportIdentity(english),standardImportIdentity({...english,customer:'美国JordiSim▲'}));
});

test('vertical merges expand every anchor attribute and markers without changing inputs', () => {
  const rows = [['筒型阻尼器'],
    ['SP1', '客户', 'RD-T138', '001', '40', '35-45', '绿点', '不归位', '', '橡胶圈', '临时标准\n量产后核实'],
    ['SP2', '', '', '', '', '', '', '', '', '', ''], ['SP3']];
  const mergedRanges = [1, 2, 3, 4, 5, 6, 7, 9, 10].map(c => ({s:{r:1,c},e:{r:2,c:c === 7 ? 8 : c}}));
  const before = structuredClone({rows, mergedRanges});
  const {records} = parseStandardImportRows(rows, {mergedRanges});
  assert.deepEqual({...records[1],serialNo:'SP1',sourceRow:2}, records[0]);
  assert.equal(records[1].fields.rib_return, '不归位');
  assert.equal(records[1].fields.import_note, '量产后核实');
  assert.equal(records[1].standardType, 'temporary');
  assert.equal(records[2].model, '');
  assert.deepEqual({rows, mergedRanges}, before);
});

test('rectangular and horizontal merges never copy across attributes or create product serials', () => {
  const rows = [['锁类、同步器'], ['SP1','客户','M','','','','','弹簧'], ['SP2'], ['']];
  const {records} = parseStandardImportRows(rows, {mergedRanges:[
    {s:{r:1,c:7},e:{r:2,c:8}}, {s:{r:1,c:0},e:{r:3,c:1}},
  ]});
  assert.equal(records.length, 2);
  assert.equal(records[1].fields.spring, '弹簧');
  assert.equal(records[1].fields.lock_direction, undefined);
  assert.equal(records[1].customer, '');
  assert.equal(records[0].fields.lock_direction, undefined);
});

for (const separator of [['说明'], ['序号'], ['筒型阻尼器'], ['齿形阻尼器'], []]) {
  test(`merged values and comments stop at non-product boundary ${JSON.stringify(separator)}`, () => {
    const rows = [['齿形阻尼器'], ['SP1','锚客户','锚型号'], ['SP2'], separator, ['SP3']];
    const {records} = parseStandardImportRows(rows, {mergedRanges:[{s:{r:1,c:1},e:{r:4,c:1}}],
      comments:[{row:1,column:1,cell:'B2',author:'工程',text:'2024.1.2 新增'}]});
    assert.equal(records[1].customer, '锚客户');
    assert.equal(records[1].comments?.[0].cell, 'B2');
    assert.equal(records[2].customer, '');
    assert.equal(records[2].comments, undefined);
  });
}

test('non-product anchors never supply values or comments to products; explicit cells are preserved', () => {
  const {records} = parseStandardImportRows([['筒型阻尼器'], ['说明','不是客户','不是型号'],
    ['SP1','真实客户','真实型号'], ['SP2','独立客户']], {mergedRanges:[
      {s:{r:1,c:1},e:{r:3,c:1}}, {s:{r:2,c:2},e:{r:3,c:2}},
    ],comments:[{row:1,column:1,cell:'B2',author:'工程',text:'表注'}]});
  assert.equal(records[0].customer, '真实客户');
  assert.equal(records[1].customer, '独立客户');
  assert.equal(records[1].model, '真实型号');
  assert.ok(records.every(r => !r.comments));
});

test('comment-only merge projects the original cell once and author-only raw text creates no history', () => {
  const rows = [['锁类、同步器'], ['SP1','甲','M'], ['SP2','乙','M']];
  const comment = {row:1,column:9,cell:'J2',author:'Administrator',text:'Administrator:\n\0garbage'};
  const before = structuredClone(comment);
  const range = {s:{r:1,c:9},e:{r:2,c:9}};
  const {records} = parseStandardImportRows(rows, {mergedRanges:[range,range],comments:[comment]});
  assert.equal(records[1].comments?.length, 1);
  assert.deepEqual(records[1].comments, records[0].comments);
  const raw = records[1].comments![0];
  assert.equal(raw.cell, 'J2');
  assert.equal(raw.text, 'Administrator:');
  assert.equal(raw.changedAt, '');
  assert.deepEqual(parseCommentHistory(raw.text, raw.author), []);
  assert.deepEqual(comment, before);
});

test('isolated baseline archives projected author-only comments without creating source history', async () => {
  const {mkdtempSync} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const {DatabaseSync} = await import('node:sqlite');
  const {materializeBaseline} = await import('../server/services/standard-baseline-build.js');
  const records = parseStandardImportRows([['锁类、同步器'],['SP1','甲','M'],['SP2','乙','M']], {
    mergedRanges:[{s:{r:1,c:9},e:{r:2,c:9}}],
    comments:[{row:1,column:9,cell:'J2',author:'Administrator',text:'Administrator:\n'}],
  }).records.map(r => ({...r,comments:r.comments ?? [],sourceHash:'a'.repeat(64),sourceSheet:'标准',initialStatus:'published'}));
  const database = join(mkdtempSync(join(tmpdir(),'teao-import-merge-test-')),'isolated','standards.db');
  const result = materializeBaseline(records,database);
  assert.equal(result.records, 2);
  assert.equal(result.comments, 2);
  assert.equal(result.sourceHistory, 0);
  const db = new DatabaseSync(database,{readOnly:true});
  try {
    const raw = db.prepare('SELECT source_cell,author,text FROM product_standard_excel_comments').all();
    assert.deepEqual(raw.map(r => [r.source_cell,r.author,r.text]), [
      ['J2','Administrator','Administrator:'],['J2','Administrator','Administrator:'],
    ]);
    assert.equal(db.prepare("SELECT count(*) n FROM product_standard_changes WHERE source_cell!=''").get()!.n, 0);
  } finally {db.close();}
});

const source = formalMainSource();
function loadFormalMainSource() {
  assert.ok(source.bytes);
  const audit = JSON.parse(readFileSync(new URL('../docs/audits/formal-standard-source-review-20261019.json',import.meta.url),'utf8')) as {
    inputs:{sha256:string}[];
    transformations:{mergedCellExpansions:{row:number;cell:string;value:string}[];
      projectWhitespaceCases:{row:number;serial:string;rawCustomer:string;customer:string;project:string}[]};
  };
  const workbook = XLSX.read(source.bytes,{type:'buffer'});
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const sourceRows = XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:'',blankrows:true,range:0});
  const comments = Object.entries(sheet).filter(([cell]) => !cell.startsWith('!')).flatMap(([cell,value]) => {
    const {r:row,c:column} = XLSX.utils.decode_cell(cell);
    return (value.c ?? []).map((c:{a?:string;t?:string}) => ({row,column,cell,author:c.a || 'Excel',text:c.t || ''}));
  });
  const parsed = parseStandardImportRows(sourceRows,{mergedRanges:sheet['!merges'],comments});
  return {audit,sourceRows,comments,parsed};
}

test('formal main source has 764 products, all 58 audited expansions and 38 affected products', {skip:source.skip}, () => {
  const {audit,sourceRows,parsed} = loadFormalMainSource();
  assert.equal(FORMAL_MAIN_HASH, audit.inputs[0].sha256);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.records.length, 764);
  const edits = audit.transformations.mergedCellExpansions;
  assert.equal(edits.length, 58);
  assert.equal(new Set(edits.map(e => e.row)).size, 38);
  for (const edit of edits) {
    const record = parsed.records.find(r => r.sourceRow === edit.row)!;
    const col = XLSX.utils.decode_cell(edit.cell).c;
    const field = col === 7 ? (record.categoryKey === 'barrel_damper' ? 'rib_return' : 'spring') : col === 9 ? 'remark' : 'import_note';
    const actual = col === 1 ? record.customer : col === 2 ? record.model : col === 3 ? record.customerPartNo : record.fields[field];
    assert.equal(actual, edit.value.replace(/临时标准|新增序号/g,'').trim(), edit.cell);
  }
  const unmerged = parseStandardImportRows(sourceRows).records;
  const changed = parsed.records.filter((r,i) => JSON.stringify([r.customer,r.model,r.customerPartNo,r.fields]) !==
    JSON.stringify([unmerged[i].customer,unmerged[i].model,unmerged[i].customerPartNo,unmerged[i].fields]));
  assert.equal(changed.length, 38);
  assert.equal(parsed.records.filter(r => r.standardType === 'temporary').length, 11);
  assert.equal(parsed.records.filter(r => r.standardType === 'new_pending').length, 68);
  const separatedMarker = parsed.records.find(r => r.serialNo === 'SP0071-B' && r.customer.includes('青岛新泉'))!;
  assert.equal(separatedMarker.customer, '青岛新泉 ▲');
  assert.equal(normalizeStandardImportProject(separatedMarker).customer, '青岛新泉▲');
});

test('main source preserves 1199 nonempty product comments plus 15 shared associations at their original cells', {skip:source.skip}, () => {
  const {sourceRows,comments,parsed} = loadFormalMainSource();
  const originals = comments.filter(c => /^SP/i.test(String(sourceRows[c.row]?.[0])) && c.text.split('\0')[0].trim());
  assert.equal(originals.length, 1199);
  assert.equal(parsed.records.flatMap(r => r.comments ?? []).length, 1214);
  const shared = new Map([['B318',1],['B468',1],['B470',1],['J536',12]]);
  for (const source of originals) {
    const expected = {cell:source.cell,author:source.author,text:source.text.split('\0')[0].trim()};
    const matches = parsed.records.flatMap(r => r.comments ?? []).filter(c => c.cell === source.cell && c.author === source.author && c.text === expected.text);
    assert.equal(matches.length, 1 + (shared.get(source.cell) ?? 0), source.cell);
  }
  const authorOnly = parsed.records.flatMap(r => r.comments ?? []).filter(c => c.cell === 'J536');
  assert.equal(authorOnly.length, 13);
  assert.ok(authorOnly.every(c => c.text === 'Administrator:' && parseCommentHistory(c.text,c.author).length === 0));
});

test('all 31 audited whitespace projects normalize and identify like explicit projects while preserving raw source', {skip:source.skip}, () => {
  const {audit,parsed} = loadFormalMainSource();
  assert.equal(audit.transformations.projectWhitespaceCases.length, 31);
  for (const example of audit.transformations.projectWhitespaceCases) {
    const record = parsed.records.find(r => r.sourceRow === example.row)!;
    const before = structuredClone(record);
    assert.equal(record.customer, example.rawCustomer);
    const normalized = normalizeStandardImportProject(record);
    assert.deepEqual(normalized, {customer:example.customer,vehicleModel:example.project}, example.serial);
    assert.equal(standardImportIdentity(record),standardImportIdentity({...record,...normalized}));
    assert.deepEqual(record,before);
  }
});

test('English customer spaces survive storage and identity, including the merged Jordi Sim customer', {skip:source.skip}, () => {
  const {parsed} = loadFormalMainSource();
  for (const record of parsed.records.filter(r => r.customer.includes('美国Jordi Sim'))) {
    assert.deepEqual(normalizeStandardImportProject(record),{customer:'美国Jordi Sim▲',vehicleModel:''});
    assert.equal(JSON.parse(standardImportIdentity(record))[1], '美国Jordi Sim');
    assert.notEqual(standardImportIdentity(record),standardImportIdentity({...record,customer:'美国JordiSim▲'}));
  }
  assert.equal(parsed.records.filter(r => r.customer === '美国Jordi Sim▲').length, 2);
});
