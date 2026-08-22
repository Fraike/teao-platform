import assert from "node:assert/strict";
import { parseEmployeeImportRows } from "../src/lib/employeeImport.ts";

const header = [
  "序号", "姓名", "职位", "工号", "家庭地址", "性别", "身份证号", "日期", "年龄", "手机号", "入职日期", "学历", "是否住宿", "是否签署合同", "身份证有效期限", "证件到期提醒", "劳动合同", "合同起始时间", "合同期限", "合同剩余天数", "工作年限",
];

const rows = [
  header,
  [1, "肖咏刚", "品质经理", "TA-010", "广东", "男", "440785198906064044", "1989-06-06", 37, "13426732131", "2024-03-22", "本科", "否", "是", "", "", "劳动合同", "2024-03-22", "2027-03-21", 0, "2年"],
  [2, "莫华银", "工程部", "TA-010", "广东", "男", "44162419840925523X", "1984-09-25", 41, "15812826467", 45373, "初中", "是", "", "", "", "", "", "", 0, "2年"],
  [3, "隆圆斌", "装配部", "TA-154", "广东", "女", "430522200308235868", "2003-08-23", 23, "16673904327", "2026-06-01", "高中", "否", "是", "", "", "劳动合同", "2026-06-01", "2029-05-31", 0, "0年"],
];

const preview = parseEmployeeImportRows(rows);

assert.equal(preview.records.length, 3);
assert.equal(preview.records[0]?.department, "品质部");
assert.equal(preview.records[0]?.position, "经理");
assert.equal(preview.records[1]?.employeeNo, "TA-167");
assert.equal(preview.records[1]?.entryDate, "2024-03-22");
assert.equal(preview.records[2]?.idCard, "430522200308235861");
assert.equal(preview.errors.length, 0);
assert.ok(preview.warnings.some((warning) => warning.includes("莫华银")));
assert.ok(preview.warnings.some((warning) => warning.includes("隆圆斌")));

const duplicatePreview = parseEmployeeImportRows([
  header,
  rows[1]!,
  [3, "测试人员", "装配部员工", "TA-010", "广东", "女", "511011198309224739", "1983-09-22", 42, "13712342561", "2024-03-22", "初中", "否", "是", "", "", "劳动合同", "2024-03-22", "2027-03-21", 0, "2年"],
]);

assert.ok(duplicatePreview.errors.some((error) => error.includes("TA-010")));

console.log("Employee import tests passed.");
