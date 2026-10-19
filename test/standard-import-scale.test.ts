import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseStandardImportRows } from '../src/lib/standardImport.ts';
import { formalMainSource, FORMAL_MAIN_HASH } from './fixtures/standard-source.ts';
test('obsolete warnings defer status to server instead of promising publication', () => {
  const parsed = parseStandardImportRows([['齿形阻尼器'], ['SP0103-A', '客户', '型号', '', '作废']]);
  assert.equal(parsed.warnings.length, 1);
  assert.doesNotMatch(parsed.warnings[0], /仍会发布/);
  assert.equal(parsed.records[0].sourceRow, 2);
});

const XLSX = await import('xlsx');
const encode = (sheet: import('xlsx').WorkSheet, bookType: 'xls' | 'xlsx' = 'xlsx') => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, '标准');
  return XLSX.write(book, { type: 'array', bookType }) as ArrayBuffer;
};
for (const bookType of ['xls', 'xlsx'] as const) {
  test(`${bookType} worker parser preserves absolute rows, merged customers, comments and SHA256`, async () => {
    const { parseStandardImportFile } = await import('../src/lib/standardImportFile.ts');
    const sheet = XLSX.utils.aoa_to_sheet([[], [], ['齿形阻尼器'], ['SP1', '客户', '型号'], ['SP2', '', '型号']]);
    sheet['!merges'] = [{ s: { r: 3, c: 1 }, e: { r: 4, c: 1 } }];
    sheet.C5.c = [{ a: '工程', t: '2024.6.19 批注' }];
    const buffer = encode(sheet, bookType);
    const result = await parseStandardImportFile(buffer);
    const { createHash } = await import('node:crypto');
    assert.equal(result.fileHash, createHash('sha256').update(new Uint8Array(buffer)).digest('hex'));
    assert.deepEqual(result.records.map(r => [r.sourceRow, r.sourceSheet, r.sourceHash, r.customer]), [[4, '标准', result.fileHash, '客户'], [5, '标准', result.fileHash, '客户']]);
    // SheetJS 的 BIFF writer 不写批注；XLS 批注另用已有原始文件回归。
    if (bookType === 'xlsx') assert.equal(result.records[1].comments?.[0].cell, 'C5');
    assert.equal(result.source.rowCount, 5);
  });
}
test('rejects decoded range beyond row/column/cell limits instead of silently truncating', async () => {
  const { parseStandardImportFile } = await import('../src/lib/standardImportFile.ts');
  for (const ref of ['A1:A10002', 'A1:CW2', 'A1:CV10001']) {
    const sheet = XLSX.utils.aoa_to_sheet([['齿形阻尼器'], ['SP1', '客户', '型号']]);
    sheet['!ref'] = ref;
    await assert.rejects(parseStandardImportFile(encode(sheet)), /范围|上限/);
  }
});

const source = formalMainSource();
test('original XLS worker parser retains data-cell comments and known obsolete identity source', {skip:source.skip}, async () => {
  const { parseStandardImportFile } = await import('../src/lib/standardImportFile.ts');
  assert.ok(source.bytes);
  const bytes = source.bytes;
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const result = await parseStandardImportFile(buffer);
  assert.equal(result.records.length, 764);
  assert.equal(result.fileHash, FORMAL_MAIN_HASH);
  assert.equal(result.source.sheetName, '客户阻力值标准一览表-最新');
  assert.ok(result.records.flatMap(r => r.comments ?? []).length > 0);
  const obsolete = result.records.find(r => r.serialNo === 'SP0103-A')!;
  assert.ok(obsolete.sourceRow > 0);
  assert.equal(obsolete.sourceHash, result.fileHash);
  assert.match(obsolete.fields.import_note || obsolete.fields.remark, /作废/);
});

test('accepts the 10000-record boundary and rejects files exceeding 10MB before parsing', async () => {
  const { parseStandardImportFile } = await import('../src/lib/standardImportFile.ts');
  const rows: string[][] = [['齿形阻尼器']];
  for (let i = 0; i < 10000; i++) rows.push([`SP${i}`, '客户', '型号']);
  const result = await parseStandardImportFile(encode(XLSX.utils.aoa_to_sheet(rows)));
  assert.equal(result.records.length, 10000);
  assert.equal(result.records.at(-1)?.sourceRow, 10001);
  await assert.rejects(parseStandardImportFile(new ArrayBuffer(10 * 1024 * 1024 + 1)), /10MB/);
  await assert.rejects(parseStandardImportFile(new ArrayBuffer(0)), /非空/);
});

interface ZipArchive { FullPaths: string[]; FileIndex: { content: Uint8Array }[] }
const { createRequire } = await import('node:module');
const CFB = createRequire(import.meta.url)('xlsx').CFB as {
  read(bytes: Uint8Array, options: { type: string }): ZipArchive;
  write(archive: ZipArchive, options: { type: string; fileType: string; compression: boolean }): Uint8Array;
  utils: { cfb_add(archive: ZipArchive, name: string, data: Uint8Array): void };
};
function zipWith(edit: (archive: ZipArchive) => void): ArrayBuffer {
  const buffer = encode(XLSX.utils.aoa_to_sheet([['齿形阻尼器'], ['SP1', '客户', '型号']]));
  const archive = CFB.read(new Uint8Array(buffer), { type: 'array' }); edit(archive);
  return Uint8Array.from(CFB.write(archive, { type: 'buffer', fileType: 'zip', compression: true })).buffer;
}

test('lying worksheet dimension cannot hide an actual over-limit tail record', async () => {
  const { parseStandardImportFile } = await import('../src/lib/standardImportFile.ts');
  const buffer = zipWith(archive => {
    const index = archive.FullPaths.findIndex(name => name.endsWith('xl/worksheets/sheet1.xml'));
    const xml = new TextDecoder().decode(archive.FileIndex[index].content).replace('</sheetData>', '<row r="10002"><c r="A10002" t="inlineStr"><is><t>SP-LOST</t></is></c></row></sheetData>');
    CFB.utils.cfb_add(archive, archive.FullPaths[index], new TextEncoder().encode(xml));
  });
  await assert.rejects(parseStandardImportFile(buffer), /尾行|范围|超限/);
});

test('compressed non-business ZIP entry is bounded before SheetJS reads the workbook', async () => {
  const { parseStandardImportFile } = await import('../src/lib/standardImportFile.ts');
  const buffer = zipWith(archive => CFB.utils.cfb_add(archive, 'xl/padding.bin', new Uint8Array(32 * 1024 * 1024).fill(65)));
  assert.ok(buffer.byteLength < 10 * 1024 * 1024);
  await assert.rejects(parseStandardImportFile(buffer), /解压大小超限/);
});
