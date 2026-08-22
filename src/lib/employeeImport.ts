export interface EmployeeImportRecord {
  rowNumber: number;
  name: string;
  employeeNo: string;
  gender: "男" | "女";
  idCard: string;
  birthDate: string;
  phone: string;
  department: string;
  position: string;
  education: string;
  address: string;
  entryDate: string;
  dormitory: boolean;
  signedContract: boolean;
  contractType: string;
  contractStartDate: string;
  contractEndDate: string;
  idCardExpiry: string;
  remark: string;
}

export interface EmployeeImportPreview {
  records: EmployeeImportRecord[];
  errors: string[];
  warnings: string[];
}

const DEPARTMENT_PREFIXES: Array<{ prefix: string; department: string }> = [
  { prefix: "装配部", department: "装配部" },
  { prefix: "注塑部", department: "注塑部" },
  { prefix: "品质部", department: "品质部" },
  { prefix: "生管部", department: "生管部" },
  { prefix: "工程部", department: "工程部" },
  { prefix: "行政部", department: "行政部" },
  { prefix: "业务部", department: "业务部" },
  { prefix: "财务部", department: "财务部" },
  { prefix: "总经办", department: "总经办" },
  { prefix: "装配", department: "装配部" },
  { prefix: "注塑", department: "注塑部" },
  { prefix: "品质", department: "品质部" },
  { prefix: "生管", department: "生管部" },
  { prefix: "工程", department: "工程部" },
  { prefix: "行政", department: "行政部" },
  { prefix: "业务", department: "业务部" },
  { prefix: "财务", department: "财务部" },
];

const SPECIAL_POSITIONS: Record<string, { department: string; position: string }> = {
  "生产文员": { department: "生管部", position: "文员" },
  保安: { department: "行政部", position: "保安" },
  保洁员: { department: "行政部", position: "保洁员" },
};

function toText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

function formatDateParts(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return "";
  return date.toISOString().slice(0, 10);
}

export function parseEmployeeImportDate(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000).toISOString().slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = toText(value);
  const matched = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  return matched ? formatDateParts(Number(matched[1]), Number(matched[2]), Number(matched[3])) : "";
}

export function splitEmployeePosition(value: unknown): { department: string; position: string } {
  const text = toText(value);
  const special = SPECIAL_POSITIONS[text];
  if (special) return special;
  const matched = DEPARTMENT_PREFIXES.find((item) => text.startsWith(item.prefix));
  if (!matched) return { department: "其他", position: text || "员工" };
  const position = text.slice(matched.prefix.length) || "员工";
  return { department: matched.department, position };
}

function getHeaderIndex(header: unknown[], title: string): number {
  return header.findIndex((cell) => toText(cell) === title);
}

function getValue(row: unknown[], header: unknown[], title: string): unknown {
  const index = getHeaderIndex(header, title);
  return index >= 0 ? row[index] : "";
}

function isValidIdCard(value: string): boolean {
  if (!/^\d{17}[\dX]$/.test(value)) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checks = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];
  const sum = value.slice(0, 17).split("").reduce((total, digit, index) => total + Number(digit) * weights[index]!, 0);
  return checks[sum % 11] === value[17];
}

function correctConfirmedIdCard(name: string, idCard: string): string {
  return name === "隆圆斌" && idCard === "430522200308235868" ? "430522200308235861" : idCard;
}

function validateRecord(record: EmployeeImportRecord): string[] {
  const prefix = `第 ${record.rowNumber} 行`;
  const errors: string[] = [];
  if (!record.name) errors.push(`${prefix}缺少姓名`);
  if (!/^TA-\d{3,}$/.test(record.employeeNo)) errors.push(`${prefix}工号格式无效`);
  if (record.gender !== "男" && record.gender !== "女") errors.push(`${prefix}性别无效`);
  if (!isValidIdCard(record.idCard)) errors.push(`${prefix}身份证号或校验码无效`);
  if (!/^1[3-9]\d{9}$/.test(record.phone)) errors.push(`${prefix}手机号格式无效`);
  if (!record.department || !record.position) errors.push(`${prefix}部门或职位缺失`);
  if (!record.entryDate) errors.push(`${prefix}入职日期无效`);
  return errors;
}

export function parseEmployeeImportRows(rows: unknown[][]): EmployeeImportPreview {
  const headerIndex = rows.findIndex((row) => getHeaderIndex(row, "姓名") >= 0 && getHeaderIndex(row, "工号") >= 0);
  if (headerIndex < 0) return { records: [], errors: ["未找到包含“姓名”和“工号”的表头"], warnings: [] };

  const header = rows[headerIndex]!;
  const records: EmployeeImportRecord[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index]!;
    if (row.every((value) => !toText(value))) continue;
    const name = toText(getValue(row, header, "姓名"));
    const employeeNoBeforeCorrection = toText(getValue(row, header, "工号")).toUpperCase();
    const employeeNo = name === "莫华银" && employeeNoBeforeCorrection === "TA-010" ? "TA-167" : employeeNoBeforeCorrection;
    if (employeeNo !== employeeNoBeforeCorrection) warnings.push(`第 ${index + 1} 行莫华银的工号已按确认规则修正为 TA-167`);
    const idCardBeforeCorrection = toText(getValue(row, header, "身份证号")).toUpperCase();
    const idCard = correctConfirmedIdCard(name, idCardBeforeCorrection);
    if (idCard !== idCardBeforeCorrection) warnings.push(`第 ${index + 1} 行隆圆斌的身份证校验位已按确认规则修正`);
    const role = splitEmployeePosition(getValue(row, header, "职位"));
    const signedContractText = toText(getValue(row, header, "是否签署合同"));
    const signedContract = signedContractText === "是";
    const record: EmployeeImportRecord = {
      rowNumber: index + 1,
      name,
      employeeNo,
      gender: toText(getValue(row, header, "性别")) as "男" | "女",
      idCard,
      birthDate: parseEmployeeImportDate(getValue(row, header, "日期")),
      phone: toText(getValue(row, header, "手机号")),
      department: role.department,
      position: role.position,
      education: toText(getValue(row, header, "学历")),
      address: toText(getValue(row, header, "家庭地址")),
      entryDate: parseEmployeeImportDate(getValue(row, header, "入职日期")),
      dormitory: toText(getValue(row, header, "是否住宿")) === "是",
      signedContract,
      contractType: toText(getValue(row, header, "劳动合同")),
      contractStartDate: parseEmployeeImportDate(getValue(row, header, "合同起始时间")),
      contractEndDate: parseEmployeeImportDate(getValue(row, header, "合同期限")),
      idCardExpiry: parseEmployeeImportDate(getValue(row, header, "证件到期提醒")),
      remark: "",
    };
    if (!signedContractText) warnings.push(`第 ${record.rowNumber} 行${record.name}缺少合同信息，将按未签合同导入`);
    records.push(record);
    errors.push(...validateRecord(record));
  }

  const seenEmployeeNos = new Set<string>();
  for (const record of records) {
    if (seenEmployeeNos.has(record.employeeNo)) errors.push(`工号 ${record.employeeNo} 重复，无法导入`);
    seenEmployeeNos.add(record.employeeNo);
  }
  if (records.length === 0) errors.push("未识别到可导入的员工记录");

  return { records, errors, warnings };
}
