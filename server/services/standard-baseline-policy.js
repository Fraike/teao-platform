// Pure policy: consumes parsed source rows, never audit JSON, files or databases.
import { normalizeStandardImportProject, standardImportIdentity } from './standard-import-identity.js';
import { resolveStandardImportStatus } from './standard-source-policy.js';

const MAIN_HASH = 'b23fbed1f4d9812281fab5a30b261910678ec8faaf870313acabaf70dfbb2cb0';
const SANITARY_HASH = '78435a7348396f85ba413026a2e1a57e50a598125a9ab3e34114e3f80a9ad97f';
const MAIN_SHEET = '客户阻力值标准一览表-最新';
const SANITARY_SHEET = '客户阻力值标准一览表（智能卫浴';
const CATEGORY_COUNTS = { gear_damper: 345, barrel_damper: 129, rack_damper: 34, lock_sync: 113, air_pull_cord: 111, air_pull_handle: 32, sanitary_damper: 45 };
const TYPE_COUNTS = { formal: 730, new_pending: 68, temporary: 11 };
const SANITARY_APPROVALS = [
  ['SP0009-G', 7, '盖'], ['SP0010-G', 7, '座'], ['SP0024-G', 8, '盖'],
  ['SP0025-G', 8, '座'], ['SP0011-G', 9, '盖'], ['SP0012-G', 9, '座'],
];
function fail(message) {
  const error = new Error(`正式基线政策：${message}`);
  error.status = 400;
  throw error;
}
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

function validateRecord(record) {
  if (!record || !['serialNo', 'customer', 'model'].every(key => nonempty(record[key]))) fail('序号、客户、型号必填');
  if (!Object.hasOwn(CATEGORY_COUNTS, record.categoryKey)) fail('未知分类');
  if (!Object.hasOwn(TYPE_COUNTS, record.standardType)) fail('未知标准性质标记');
  const sanitary = record.categoryKey === 'sanitary_damper';
  if (record.sourceHash !== (sanitary ? SANITARY_HASH : MAIN_HASH)
    || record.sourceSheet !== (sanitary ? SANITARY_SHEET : MAIN_SHEET)) fail(`${record.serialNo} 来源hash/sheet不匹配`);
  if (!Number.isSafeInteger(record.sourceRow) || record.sourceRow < 1) fail('来源行号无效');
  if (!record.fields || typeof record.fields !== 'object' || Array.isArray(record.fields)
    || Object.values(record.fields).some(value => typeof value !== 'string')) fail('规格字段必须为文本');
  record.comments ??= [];
  if (!Array.isArray(record.comments) || record.comments.some(c => !c || ['cell', 'fieldKey', 'fieldLabel', 'author', 'text', 'changedAt'].some(key => typeof c[key] !== 'string'))) fail('原始批注字段不完整');
  for (const key of ['status', 'initialStatus']) {
    if (record[key] !== undefined && !['published', 'obsolete'].includes(record[key])) fail('输入不能包含工作流状态或未知状态');
  }
}

function verifySanitary(records) {
  const rows = records.filter(r => r.categoryKey === 'sanitary_damper');
  for (const [serialNo, sourceRow, part] of SANITARY_APPROVALS) {
    const row = rows.find(r => r.serialNo === serialNo);
    if (!row || row.sourceRow !== sourceRow || row.customer !== '欧陆' || row.model !== 'RD-V088' || row.fields.part_type !== part) fail(`${serialNo} 卫浴已批准补型号身份/字段不匹配`);
  }
  if (rows.filter(r => r.fields.part_type === '盖').length !== 25
    || rows.filter(r => r.fields.part_type === '座').length !== 20) fail('卫浴盖/座数量不匹配');
}

function transformSeasonal(records) {
  const matches = records.filter(r => r.serialNo === 'SP0006-C');
  if (matches.length !== 1) fail('SP0006-C必须唯一存在');
  const record = matches[0];
  if (record.sourceHash !== MAIN_HASH || record.sourceSheet !== MAIN_SHEET || record.sourceRow !== 490
    || record.customer !== '常州新泉▲' || record.model !== 'RD-V128-170' || record.categoryKey !== 'rack_damper'
    || record.customerPartNo !== '2010.0431.0805' || record.fields.test_standard !== '100-140'
    || record.fields.torque_standard !== '120-160' || record.fields.winter_test_standard) fail('SP0006-C来源行/身份/原始规格不匹配');
  const notes = record.comments.filter(c => c.cell === 'F490' && c.fieldKey === 'test_standard');
  if (notes.length !== 1 || !/2026\.10\.15[^\r\n]*100-140[^\r\n]*冬季|2026\.10\.15[^\r\n]*冬季[^\r\n]*100-140/.test(notes[0].text)) fail('SP0006-C缺少F490的2026.10.15冬季100-140来源批注');
  const before = structuredClone(record.fields);
  record.fields.test_standard = '120-160';
  record.fields.winter_test_standard = '100-140';
  return [{
    serialNo: record.serialNo, customer: record.customer, model: record.model, categoryKey: record.categoryKey,
    sourceHash: record.sourceHash, sourceSheet: record.sourceSheet, sourceRow: record.sourceRow, sourceCell: 'F490',
    reason: '按已确认季节语义拆分常规与冬季测试标准；原始正文和批注完整保留',
    before, after: structuredClone(record.fields), comments: structuredClone(record.comments),
  }];
}

function verifyCounts(records, key, expected) {
  const actual = Object.create(null);
  for (const record of records) actual[record[key]] = (actual[record[key]] || 0) + 1;
  if (Object.keys(actual).length !== Object.keys(expected).length
    || Object.entries(expected).some(([name, count]) => actual[name] !== count)) fail(`${key}数量不匹配`);
}

/** @returns {{records: object[], transformations: object[]}} Deep clones; input must be raw parser output (not already transformed). */
export function applyBaselinePolicy(records) {
  if (!Array.isArray(records) || records.length !== 809) fail('记录数量必须为809');
  const normalized = structuredClone(records);
  const identities = new Set();
  for (const record of normalized) {
    validateRecord(record);
    Object.assign(record, normalizeStandardImportProject(record));
    record.initialStatus = resolveStandardImportStatus(record);
    const identity = standardImportIdentity(record);
    if (identities.has(identity)) fail(`${record.serialNo} 完整业务身份重复`);
    identities.add(identity);
  }
  verifyCounts(normalized, 'categoryKey', CATEGORY_COUNTS);
  verifyCounts(normalized, 'standardType', TYPE_COUNTS);
  verifyCounts(normalized, 'initialStatus', { published: 808, obsolete: 1 });
  verifySanitary(normalized);
  const transformations = transformSeasonal(normalized);
  return { records: normalized, transformations };
}
