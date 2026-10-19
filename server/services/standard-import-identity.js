export function standardImportIdentity(record) {
  if (record.fields?.part_type && /^SP\d+-G$/i.test(String(record.serialNo))) return JSON.stringify(["sanitary-component", String(record.serialNo).trim().toUpperCase()]);
  const normalized = normalizeStandardImportProject(record);
  const customer = normalized.customer.replace(/[▲*]/g, '').trim();
  return JSON.stringify([record.serialNo, customer, record.model || '', normalized.vehicleModel]);
}

export function markingProject(fields) {
  return String(fields?.marking ?? '').trim().match(/^(?:型号)?([A-Z]+\d[A-Z0-9\-/.]*)$/)?.[1] || '';
}

// 存储口径与项目身份一致：只拆确认存在的尾部项目码，保留客户标记及批注原文。
export function normalizeStandardImportProject(record) {
  const raw = String(record.customer ?? '').trim();
  const body = raw.replace(/[▲*]+$/, '');
  const markers = raw.slice(body.length);
  if (record.categoryKey === "sanitary_damper") return { customer: body.trimEnd() + markers, vehicleModel: String(record.vehicleModel || "").trim() };
  // 只在项目后缀匹配范围内消除空白，客户名中的英文空格始终保留。
  const suffix = body.match(/[一-龥](\s*[A-Z0-9][A-Z0-9\-/.\s]*)$/)?.[1] || '';
  const customerProject = /[A-Z]/.test(suffix) ? suffix.replace(/\s/g, '') : '';
  return {
    customer: (customerProject ? body.slice(0, -suffix.length) : body).trimEnd() + markers,
    vehicleModel: String(record.vehicleModel || customerProject || markingProject(record.fields)).trim(),
  };
}
