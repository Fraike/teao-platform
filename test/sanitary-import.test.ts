import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseStandardImportFile } from '../src/lib/standardImportFile.ts';
import { legacyPairedWorkbook } from './fixtures/sanitary-paired-workbook.ts';
import { formalSanitarySource, FORMAL_SANITARY_HASH } from './fixtures/standard-source.ts';
test('synthetic legacy sanitary worksheet retains 70 paired rows, 83 comments, merged identities and exceptional cells', async () => {
 const result = await parseStandardImportFile(legacyPairedWorkbook(), 'sanitary');
 assert.deepEqual(result.errors, []);
 assert.equal(result.records.length, 70);
 assert.equal(result.records.flatMap(r => r.comments ?? []).length, 83);
 assert.equal(new Set(result.records.map(r => r.serialNo)).size, 70);
 assert(result.records.every(r => r.categoryKey === 'sanitary_damper' && /^WY-[a-f0-9]{16}$/.test(r.serialNo)));
 const row = (n: number) => result.records.find(r => r.sourceRow === n)!;
 assert.equal(row(10).customer, '欧陆');
 assert.equal(row(10).model, 'RD-V088');
 assert.equal(row(10).fields.customer_model, '968');
 assert.match(row(10).fields.import_note, /K10.*968-Seat/);
 assert.equal(row(47).fields.customer_model, '003\n008\n012');
 assert.equal(row(57).fields.lid_standard, '暂无');
 assert.equal(row(59).fields.lid_standard, '');
 assert.equal(row(59).fields.seat_standard, 'CW21');
 assert.match(row(72).fields.seat_standard, /共用Q9/);
 assert.equal(row(46).fields.lid_length, '44.5mm');
 assert.match(row(46).comments!.find(c => c.cell === 'I46')!.text, /42.5/);
 assert.equal(row(46).comments!.find(c => c.cell === 'I46')!.fieldKey, 'lid_length');
 assert(result.warnings.some(w => w.includes('kg')));
 assert(result.warnings.some(w => w.includes('I46')));
 const main = await parseStandardImportFile(legacyPairedWorkbook());
 assert.equal(main.records.length, 1);
 assert.equal(main.records[0].serialNo, 'SP-SYNTHETIC');
});

test('sanitary initialization is idempotent and a complete pair follows designated review and publication', async () => {
 const { mkdtempSync } = await import('node:fs');
 const os = await import('node:os'); const path = await import('node:path');
 process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'sanitary-standards-'));
 const store = await import('../server/services/standard-store.js');
 store.initDB();
 try {
  const category = store.listCategories().find((c: {key: string}) => c.key === 'sanitary_damper');
  assert(category, 'sanitary category must be available to form/list/review');
  assert.equal(category.fields.filter((f: {group?: string}) => f.group === '盖标准').length, 7);
  const parsed = await parseStandardImportFile(legacyPairedWorkbook(), 'sanitary');
  const admin = {id: 'admin', name: '管理员', role: 'admin'};
  const preview = store.previewStandardImport(parsed.records, admin);
  assert.deepEqual(preview.errors, []); assert.equal(preview.valid, 70);
  const imported = await store.confirmStandardImport(parsed.records, admin, preview.token);
  assert.equal(imported.inserted, 70);
  assert.equal(store.getDB().prepare('SELECT COUNT(*) AS n FROM product_standard_excel_comments').get().n, 83);
  const repeated = store.previewStandardImport(parsed.records, admin);
  assert.equal(repeated.skipped, 70);
  const byCustomerModel = store.listStandardPage({category:"sanitary_damper", search:"801D", pageSize:null});
  assert.equal(byCustomerModel.total, 1);
  assert.equal(byCustomerModel.data[0].fields.customer_model, "801D");
  const editor = {id: 'engineer', name: '工程员'}, reviewer = {id: 'reviewer', name: '审核人'};
  const input = {...parsed.records[0], serialNo: 'WY-REVIEW'};
  let detail = store.createStandard(input, editor);
  const expected = () => ({versionId: detail.versions[0].id, revision: detail.versions[0].revision});
  detail = store.submitStandard(detail.id, editor, {...expected(), reviewerId: reviewer.id, reviewerName: reviewer.name});
  assert.equal(store.getStandard(detail.id, {onlyPublished: true}), null);
  detail = store.reviewStandard(detail.id, {...expected(), approve: true}, reviewer);
  assert.equal(detail.versions[0].status, 'published');
  const {buildStandardPublication} = await import('../server/services/standard-publication.js');
  const announcement = buildStandardPublication(detail, detail.versions[0], category, {reviewerName: reviewer.name});
  assert.match(announcement, /盖.*实际扭矩/); assert.match(announcement, /座垫.*实际扭矩/);
  assert.match(announcement, /CCW25/); assert.match(announcement, /CW20/);
 } finally {store.closeDB();}
});

const sanitarySource = formalSanitarySource();
test('latest approved sanitary XLS independently imports 45 SP products with 50 comment associations', {skip:sanitarySource.skip}, async () => {
 assert.ok(sanitarySource.bytes);
 const bytes = sanitarySource.bytes;
 const parsed = await parseStandardImportFile(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset + bytes.byteLength), 'sanitary');
 assert.deepEqual(parsed.errors, []);
 assert.equal(parsed.fileHash, FORMAL_SANITARY_HASH);
 assert.equal(parsed.records.length, 45);
 assert.equal(parsed.records.filter(r => r.fields.part_type === '盖').length, 25);
 assert.equal(parsed.records.filter(r => r.fields.part_type === '座').length, 20);
 assert.equal(parsed.records.flatMap(r => r.comments ?? []).length, 50);
 assert.equal(new Set(parsed.records.map(r => r.serialNo)).size, 45);
 assert.ok(parsed.records.every(r => /^SP\d+-G$/.test(r.serialNo) && r.customer && r.model));
 for (const serial of ['SP0009-G','SP0010-G','SP0024-G','SP0025-G','SP0011-G','SP0012-G']) {
  assert.equal(parsed.records.find(r => r.serialNo === serial)?.model, 'RD-V088');
 }
 const {mkdtempSync} = await import('node:fs');
 const {tmpdir} = await import('node:os');
 const {join} = await import('node:path');
 process.env.DATA_DIR = mkdtempSync(join(tmpdir(),'sanitary-component-source-'));
 const store = await import('../server/services/standard-store.js');
 store.initDB();
 try {
  const user = {id:'admin',name:'管理员',role:'admin'};
  const preview = store.previewStandardImport(parsed.records,user);
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.valid, 45);
  assert.equal((await store.confirmStandardImport(parsed.records,user,preview.token)).inserted, 45);
  assert.equal(store.previewStandardImport(parsed.records,user).skipped, 45);
  assert.equal(store.getDB().prepare('SELECT count(*) n FROM product_standard_excel_comments WHERE source_hash=?').get(FORMAL_SANITARY_HASH).n, 50);
 } finally {store.closeDB();}
});

test('sanitary numbering survives row reorder and duplicate identities block preview', async () => {
 const XLSX = await import('xlsx');
 const encode = (rows: unknown[][]) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), '客户标准参数（智能卫浴）');
  return XLSX.write(book, {type: 'array', bookType: 'xlsx'}) as ArrayBuffer;
 };
 const header = ['客户名', '客户型号', '产品型号', '盖标准'];
 const a = ['客户A', '001', 'M', 'CW20'];
 const b = ['客户B', '002', 'M', 'CW30'];
 const first = await parseStandardImportFile(encode([header, a, b]), 'sanitary');
 const second = await parseStandardImportFile(encode([header, b, a]), 'sanitary');
 assert.equal(first.records[0].serialNo, second.records[1].serialNo);
 const duplicate = await parseStandardImportFile(encode([header, a, a]), 'sanitary');
 assert(duplicate.errors.some(e => e.includes('重复')));
 const noMerge = await parseStandardImportFile(encode([header, a, ['', '', '', 'CW10']]), 'sanitary');
 assert.equal(noMerge.records.length, 1);
 assert(noMerge.errors.some(e => e.includes('缺少客户')));
 await assert.rejects(parseStandardImportFile(encode([header, a])), /常规标准工作表/);
});

test('renamed sanitary worksheet imports the same records and stays out of main import', async () => {
 const XLSX = await import('xlsx');
 const book = XLSX.read(legacyPairedWorkbook(), {type:'array'});
 const oldName = book.SheetNames.find(name => name.includes('智能卫浴'))!;
 const newName = oldName.replace('智能卫浴', '马桶座盖');
 book.Sheets[newName] = book.Sheets[oldName];
 book.SheetNames = book.SheetNames.map(name => name === oldName ? newName : name);
 const bytes = XLSX.write(book, {type:'array',bookType:'xlsx'}) as ArrayBuffer;
 const result = await parseStandardImportFile(bytes,'sanitary');
 const old = await parseStandardImportFile(legacyPairedWorkbook(),'sanitary');
 assert.deepEqual(result.errors,[]);
 assert.deepEqual(result.records.map(r=>[r.serialNo,r.categoryKey,r.fields]),old.records.map(r=>[r.serialNo,r.categoryKey,r.fields]));
 assert.equal((await parseStandardImportFile(bytes,'main')).records[0].serialNo,'SP-SYNTHETIC');
});
