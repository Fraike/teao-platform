import assert from "node:assert/strict";
import { test } from "node:test";
import XLSX from "xlsx";
import { parseStandardImportRows } from "../src/lib/standardImport.ts";
import { formalMainSource } from './fixtures/standard-source.ts';

test("multiline markers preserve explanatory annotations and temporary takes priority", () => {
  const row = ["SP001-A", "客户", "型号", "340038321.0", "45-55", "45-55", "", "齿轮", "", "备注",
    "临时标准\n量产后扭矩只选一种，齿轮为黑色；", "新增序号", "附加说明"];
  const { records } = parseStandardImportRows([["齿形阻尼器"], row]);
  assert.equal(records[0].standardType, "temporary");
  assert.equal(records[0].customerPartNo, "340038321");
  assert.equal(records[0].fields.import_note, "量产后扭矩只选一种，齿轮为黑色；\n附加说明");
  assert.equal(records[0].fields.remark, "备注");
});

test("lock direction uses column index 8 and obsolete text remains a warning, not a new type", () => {
  const { records, warnings } = parseStandardImportRows([
    ["锁类、同步器"],
    ["SP001-D", "客户", "RD-01", "", "30N", "30N", "", "弹簧", "锁装右边", "原备注", "此行作废\n放筒型阻尼器行内"],
  ]);
  assert.equal(records[0].fields.lock_direction, "锁装右边");
  assert.equal(records[0].fields.import_note, "此行作废\n放筒型阻尼器行内");
  assert.equal(records[0].standardType, "formal");
  assert.ok(warnings.some((warning) => warning.includes("SP001-D") && warning.includes("作废")));
});

test("air categories keep mapped late columns and preserve unmapped explanations", () => {
  const row = ["SP001-E", "客户", "型号", "", "1.2", "1.2", "喷码", "扣件", "", "下座", "轴芯", "弹簧", "另注", "拉绳", "", "胶圈", "", "新增序号\n注意包装", "尾注"];
  const { records } = parseStandardImportRows([["空气拉绳阻尼器"], row, ["空气拉柄阻尼器"], ["SP001-F", "客户", "型号", "", "", "", "", "拉柄", "", "另注", "", "", "", "", "", "备注", "", "临时标准"]]);
  assert.equal(records[0].fields.axis_core, "轴芯");
  assert.equal(records[0].fields.pull_cord, "拉绳");
  assert.equal(records[0].fields.remark, "胶圈");
  assert.equal(records[0].fields.import_note, "另注\n注意包装\n尾注");
  assert.equal(records[0].standardType, "new_pending");
  assert.equal(records[1].fields.material, "拉柄");
  assert.equal(records[1].fields.import_note, "另注");
  assert.equal(records[1].standardType, "temporary");
});

test("only explicit vertical customer merges carry the anchor and inputs are untouched", () => {
  const rows = [["齿形阻尼器"], ["SP001-A", "客户甲"], ["SP002-A", ""], ["SP003-A", ""], ["SP004-A", "客户乙"]];
  const original = structuredClone(rows);
  const mergedRanges = [{ s: { r: 1, c: 1 }, e: { r: 2, c: 1 } }, { s: { r: 3, c: 0 }, e: { r: 4, c: 1 } }];
  const { records } = parseStandardImportRows(rows, { mergedRanges });
  assert.deepEqual(records.map((record) => record.customer), ["客户甲", "客户甲", "", "客户乙"]);
  assert.equal(parseStandardImportRows(rows).records[1].customer, "");
  assert.deepEqual(rows, original);
});

test("headers and paragraphs are ignored and empty imports report errors", () => {
  assert.equal(parseStandardImportRows([["序号"], ["说明"], ["SP001-A"]]).records.length, 0);
  assert.ok(parseStandardImportRows([]).errors.length);
  assert.equal(parseStandardImportRows([["齿形阻尼器"], ["序号"], ["段落备注"], ["SP001-A"]]).records.length, 1);
});

test("mid-table lock direction headers are respected and do not leak into the next category", () => {
  const { records } = parseStandardImportRows([
    ["齿形阻尼器"],
    ["序号", "客户名", "型号", "客户料号", "", "", "", "", "装锁方向"],
    ["SP001-C", "客户", "型号", "", "", "", "", "反方向", "锁装右边"],
    ["空气拉绳阻尼器"],
    ["SP001-E", "客户", "型号", "", "", "", "", "扣件", "未映射说明"],
  ]);
  assert.equal(records[0].fields.lock_direction, "锁装右边");
  assert.equal(records[1].fields.lock_direction, undefined);
  assert.equal(records[1].fields.import_note, "未映射说明");
});

for (const bookType of ["xls", "xlsx"] as const) {
  test(`${bookType} round-trip preserves merge row positions and multiline notes`, () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      [], ["齿形阻尼器"],
      ["SP001-A", "合并客户", "型号", "", "", "", "", "", "", "", "临时标准\n量产后核实"],
      ["SP002-A", ""], ["SP003-A", ""],
    ]);
    sheet["!merges"] = [{ s: { r: 2, c: 1 }, e: { r: 3, c: 1 } }];
    const source = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(source, sheet, "标准");
    const workbook = XLSX.read(XLSX.write(source, { type: "buffer", bookType }), { type: "buffer" });
    const parsedSheet = workbook.Sheets["标准"];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(parsedSheet, { header: 1, defval: "", range: 0 });
    const { records } = parseStandardImportRows(rows, { mergedRanges: parsedSheet["!merges"] });
    assert.deepEqual(records.map((record) => record.customer), ["合并客户", "合并客户", ""]);
    assert.equal(records[0].standardType, "temporary");
    assert.equal(records[0].fields.import_note, "量产后核实");
  });
}

const source = formalMainSource();
test("source workbook retains the known multiline standard, obsolete note and lock direction", { skip: source.skip }, () => {
  assert.ok(source.bytes);
  const workbook = XLSX.read(source.bytes, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames.find((name) => !name.includes("智能卫浴"))!];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", range: 0 });
  const { records, errors, warnings } = parseStandardImportRows(rows, { mergedRanges: sheet["!merges"] });
  assert.deepEqual(errors, []);
  assert.equal(records.find((record) => record.serialNo === "SP0261-A")?.standardType, "temporary");
  assert.match(records.find((record) => record.serialNo === "SP0261-A")!.fields.import_note, /量产后/);
  assert.equal(records.find((record) => record.serialNo === "SP0028-C")?.fields.lock_direction, "锁装右边");
  assert.ok(warnings.some((warning) => warning.includes("SP0103-A")));
});

test("second-column section titles split barrel and rack and preserve field meanings and comments", () => {
  const {records}=parseStandardImportRows([
    ["", "筒型阻尼器"],
    ["序号","客户名","型号","客户料号","扭矩标准","测试范围","打点颜色/喷码","筋条是否归位","","备注"],
    ["SP0001-B","客户甲","RD-T012A","","","400-500","","不归位","","黑色"],
    ["", "齿条阻尼器"],
    ["序号","客户名","型号","客户料号","扭矩标准","测试范围","打码","扭矩方向","装锁方向","备注"],
    ["SP0001-C","客户乙","RD-V126A","","","280-330","290gf.cm+生产日期","反方向","锁装右边"],
  ],{comments:[{row:5,column:7,cell:"H6",author:"工程师",text:"2024.6.19 正方向改为反方向\u0000\u0014垃圾"}]});
  assert.equal(records[0].categoryKey,"barrel_damper");assert.equal(records[0].fields.rib_return,"不归位");
  assert.equal(records[1].categoryKey,"rack_damper");assert.equal(records[1].fields.torque_direction,"反方向");assert.equal(records[1].fields.lock_direction,"锁装右边");assert.equal(records[1].fields.gear_spec,undefined);
  assert.deepEqual(records[1].comments,[{fieldKey:"torque_direction",fieldLabel:"扭矩方向",author:"工程师",text:"2024.6.19 正方向改为反方向",cell:"H6",changedAt:"2024-06-19"}]);
});

test("all source data-cell comments retain readable text and authors for eventual import", {skip:source.skip}, () => {
  assert.ok(source.bytes);
  const workbook=XLSX.read(source.bytes, { type: 'buffer' });
  const sheet=workbook.Sheets[workbook.SheetNames[0]];
  const comments=Object.entries(sheet).filter(([cell])=>!cell.startsWith('!')).flatMap(([cell,v])=>{
    const p=XLSX.utils.decode_cell(cell);return (v.c ?? []).map((c:{a?:string;t?:string})=>({row:p.r,column:p.c,cell,author:c.a || 'Excel',text:c.t || ''}));
  });
  const rows=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:'',range:0});
  const parsed=parseStandardImportRows(rows,{mergedRanges:sheet['!merges'],comments});
  const expected=comments.filter(c=>String(rows[c.row]?.[0] ?? '').startsWith('SP') && c.text.split('\0')[0].trim());
  assert.equal(parsed.records.flatMap(r=>r.comments ?? []).length,expected.length + 15);
  assert.equal(parsed.records.filter(r=>r.categoryKey==='rack_damper').length,34);
  assert.equal(parsed.records.filter(r=>r.categoryKey==='barrel_damper').length,129);
  assert.equal(parsed.records.length,764);
});
