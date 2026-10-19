import fs from 'node:fs';
const manifest = JSON.parse(fs.readFileSync(new URL('../data/standard-source-decisions.json', import.meta.url), 'utf8'));

export function resolveStandardImportStatus(record) {
  const marked = [record.serialNo, record.customer, record.model, record.customerPartNo, record.vehicleModel, ...Object.values(record.fields || {})].some(value => typeof value === 'string' && value.includes('作废'));
  if (!marked) return 'published';
  const decision = manifest.decisions.find(item =>
    ['serialNo', 'customer', 'model', 'categoryKey'].every(key => item[key] === record[key])
    && record.sourceHash === (item.sourceHash ?? manifest.sourceHash)
    && record.sourceSheet === (item.sourceSheet ?? manifest.sheet)
    && (item.sourceRow === undefined || item.sourceRow === record.sourceRow));
  if (decision) return decision.status;
  const error = new Error(`序号 ${record.serialNo} 含作废标记，尚无匹配的来源确认决定，不能直接发布`);
  error.status = 400;
  throw error;
}
