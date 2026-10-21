function text(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim() || '—';
}

// Pass a category map once per notification batch; this formatter never queries storage.
export function standardNotificationIdentity(standard, version, categoryNames) {
  const categoryKey = version?.categoryKey || standard.categoryKey || '';
  const category = categoryNames.get(categoryKey) || version?.categoryName
    || (categoryKey === standard.categoryKey ? standard.categoryName : '') || categoryKey || '未分类';
  const serialNo = text(standard.serialNo);
  const customer = text(String(version?.customer ?? '').replace(/[▲*]/g, ''));
  const model = text(version?.model);
  const params = new URLSearchParams({ category: categoryKey, standardId: String(standard.id) });
  if (version?.status === 'pending_review') params.set('status', 'pending_review');
  const link = `/product-standards?${params}`;
  return {
    description: `${text(category)} · ${serialNo} · ${customer} · ${model}`,
    details: `分类：${text(category)}\n标准：${serialNo}\n客户：${customer}\n型号：${model}`,
    link, url: `https://teao.work${link}`,
  };
}
