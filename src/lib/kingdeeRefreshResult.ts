export function requireFreshKingdeeData<T>(response: { stale?: boolean; refreshed?: boolean; data: T }): T {
  if (response.stale || response.refreshed !== true) {
    throw new Error("金蝶更新未完成，继续使用上次缓存；请检查后台服务后重试");
  }
  return response.data;
}
