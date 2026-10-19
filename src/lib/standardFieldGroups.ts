import type { StandardCategoryField, StandardCategory, StandardFields } from '../types/standard';

export function groupStandardFields(fields: StandardCategoryField[]) {
  const groups = new Map<string, StandardCategoryField[]>();
  for (const field of fields) {
    const name = field.group || '';
    const entries = groups.get(name) || [];
    entries.push(field);
    groups.set(name, entries);
  }
  return [...groups].map(([name, fields]) => ({ name, fields }));
}

export function activeStandardFields(
  category: StandardCategory | undefined,
  values?: StandardFields,
  options: { includeWinter?: boolean } = {},
) {
  const paired = values && !values.part_type && Object.keys(values).some(key => /^(lid|seat)_/.test(key));
  const fields = (category?.fields || []).filter(field => !field.variant || field.variant === (paired ? "paired" : "component"));
  const summer = fields.find(field => field.key === "test_standard");
  if (!summer) return fields;
  const winter = fields.find(field => field.key === "winter_test_standard");
  return fields.filter(field => field.key !== "winter_test_standard").flatMap(field => {
    if (field.key !== "test_standard") return [field];
    const label = field.label.replace(/^(?:夏季[／/]常规|夏季|常规)?测试(?:标准|范围)/, "夏季／常规测试标准");
    const seasonal = [{ ...field, label }];
    if (options.includeWinter !== false) seasonal.push({ ...field, ...winter, key: "winter_test_standard", label: "冬季测试标准" });
    return seasonal;
  });
}
