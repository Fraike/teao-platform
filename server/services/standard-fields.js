export function isStandardFieldApplicable(categoryKey, fieldKey) {
  return fieldKey !== "lock_direction" || !["gear_damper", "lock_sync"].includes(categoryKey);
}

export function standardBusinessFields(categoryKey, fields) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return {};
  if (isStandardFieldApplicable(categoryKey, "lock_direction") || !Object.hasOwn(fields, "lock_direction")) return fields;
  return Object.fromEntries(Object.entries(fields).filter(([key]) => isStandardFieldApplicable(categoryKey, key)));
}

// Augment at read/output boundaries so old stored category definitions need no migration.
export function seasonalStandardFields(fields = []) {
  const summer = fields.find(field => field.key === "test_standard");
  if (!summer) return fields;
  const winter = fields.find(field => field.key === "winter_test_standard");
  return fields.filter(field => field.key !== "winter_test_standard").flatMap(field => {
    if (field.key !== "test_standard") return [field];
    const label = field.label.replace(/^(?:夏季[／/]常规|夏季|常规)?测试(?:标准|范围)/, "夏季／常规测试标准");
    return [{ ...field, label }, { ...field, ...winter, key: "winter_test_standard", label: "冬季测试标准" }];
  });
}
