import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OLD_SOURCE, OLD_SHEET } from './sanitary-migrate.js';
import { digest, privateJson } from './release-common.js';

// Input is the reviewed parser export from the OLD source workbook, never a DB
// export. The original workbook is independently hash checked by the CLI.
export function buildLegacyWhitelist(input, xlsHash) {
  if (xlsHash !== OLD_SOURCE) throw new Error('必须提供已核验旧XLS原件，hash不符');
  const records = Array.isArray(input) ? input : input.records;
  if (!Array.isArray(records) || records.length !== 70 || new Set(records.map(r => r.serialNo)).size !== 70) throw new Error('旧源必须为完整70个唯一WY配对');
  if (records.some(r => !/^WY-/.test(r.serialNo) || r.categoryKey !== 'sanitary_damper' || r.standardType !== 'formal'
    || r.sourceHash !== OLD_SOURCE || r.sourceSheet !== OLD_SHEET || !Number.isInteger(r.sourceRow) || r.sourceRow < 1
    || !r.customer || !r.model || !r.fields || r.fields.part_type
    || !Object.keys(r.fields).some(k => /^lid_/.test(k)) || !Object.keys(r.fields).some(k => /^seat_/.test(k)))) throw new Error('旧源records来源/字段不匹配，不能以当前目标库生成名单');
  return { sourceHash: OLD_SOURCE, sourceSheet: OLD_SHEET, records: records.map(r => ({
    serialNo: r.serialNo, customer: r.customer, model: r.model, sourceRow: r.sourceRow, fieldsSha256: digest(JSON.stringify(r.fields)),
  })).sort((a, b) => a.serialNo.localeCompare(b.serialNo)) };
}
export function exportLegacyWhitelist(options) {
  if (fs.statSync(options.payload).size > 10*1024*1024 || fs.statSync(options.xls).size > 10*1024*1024) throw new Error('输入超过10MB');
  const raw = fs.readFileSync(options.payload);
  const whitelist = buildLegacyWhitelist(JSON.parse(raw), digest(fs.readFileSync(options.xls)));
  const fingerprint = digest(JSON.stringify({ whitelist, payloadHash: digest(raw), output: path.resolve(options.output) }));
  if (!options.apply) return { mode: 'whitelist-preview', fingerprint, whitelist };
  if (options.confirm !== fingerprint) throw new Error('生成名单需 --confirm 匹配预览fingerprint');
  privateJson(options.output, whitelist);
  return { mode: 'whitelist-created', fingerprint, output: options.output };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {};
  for (let i=0;i<args.length;i++) {
    if (args[i] === '--apply') options.apply=true;
    else if (['--payload','--xls','--output','--confirm'].includes(args[i])) options[args[i].slice(2)]=args[++i];
    else throw new Error('未知参数');
  }
  try {
    if (!options.payload || !options.xls || !options.output) throw new Error('usage: sanitary-whitelist.js --payload OLD_RECORDS_JSON --xls ORIGINAL_OLD_XLS --output NEW_WHITELIST_JSON [--apply --confirm FINGERPRINT]');
    console.log(JSON.stringify(exportLegacyWhitelist(options),null,2));
  } catch(error) { console.error(error.message);process.exitCode=1; }
}
