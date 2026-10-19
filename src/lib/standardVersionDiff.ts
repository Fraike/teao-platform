import type { StandardCategory, StandardVersion } from '../types/standard';
import { STANDARD_TYPE_LABELS } from '../types/standard';
import { activeStandardFields } from './standardFieldGroups';

export function standardVersionDiff(previous: StandardVersion | null, next: StandardVersion, categories: StandardCategory[]) {
  const base = [
    { key: 'customer', label: '客户名', before: previous?.customer, after: next.customer },
    { key: 'model', label: '型号', before: previous?.model, after: next.model },
    { key: 'customerPartNo', label: '客户料号', before: previous?.customerPartNo, after: next.customerPartNo },
    { key: 'vehicleModel', label: '项目代号', before: previous?.vehicleModel, after: next.vehicleModel },
    { key: 'categoryKey', label: '分类', before: previous?.categoryName, after: next.categoryName },
    { key: 'standardType', label: '标准性质', before: previous ? STANDARD_TYPE_LABELS[previous.standardType] : '', after: STANDARD_TYPE_LABELS[next.standardType] },
  ];
  const fields = new Map([...activeStandardFields(categories.find(c => c.key === previous?.categoryKey), previous?.fields), ...activeStandardFields(categories.find(c => c.key === next.categoryKey), next.fields)].map(f => [f.key, f]));
  for (const field of fields.values()) base.push({ key: field.key, label: field.label, before: previous?.fields[field.key], after: next.fields[field.key] });
  return base.filter(row => (row.before ?? '') !== (row.after ?? '')).map(row => ({ ...row, before: row.before || '—', after: row.after || '—' }));
}
