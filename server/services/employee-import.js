function toText(value) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

function isValidIdCard(value) {
  if (!/^\d{17}[\dX]$/.test(value)) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checks = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];
  const sum = value.slice(0, 17).split("").reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
  return checks[sum % 11] === value[17];
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

export function validateEmployeeImportRecords(records) {
  if (!Array.isArray(records) || records.length === 0) return ["没有可导入的员工记录"];
  if (records.length > 1000) return ["单次最多导入 1000 名员工"];
  const errors = [];
  const employeeNos = new Set();
  for (const [index, raw] of records.entries()) {
    const row = index + 1;
    if (!raw || typeof raw !== "object") { errors.push(`第 ${row} 条记录格式无效`); continue; }
    const name = toText(raw.name);
    const employeeNo = toText(raw.employeeNo).toUpperCase();
    const gender = toText(raw.gender);
    const idCard = toText(raw.idCard).toUpperCase();
    const phone = toText(raw.phone);
    const department = toText(raw.department);
    const position = toText(raw.position);
    const entryDate = toText(raw.entryDate);
    if (!name || !/^TA-\d{3,}$/.test(employeeNo) || !["男", "女"].includes(gender) || !isValidIdCard(idCard) || !/^1[3-9]\d{9}$/.test(phone) || !department || !position || !isIsoDate(entryDate)) {
      errors.push(`第 ${row} 条记录包含无效或缺失字段`);
    }
    if (employeeNos.has(employeeNo)) errors.push(`工号 ${employeeNo} 重复`);
    employeeNos.add(employeeNo);
  }
  return errors;
}
