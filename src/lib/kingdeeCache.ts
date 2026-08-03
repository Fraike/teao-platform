/**
 * 金蝶数据前端缓存
 * - 进页面优先展示缓存（1小时有效）
 * - 后台静默刷新
 */

const CACHE_PREFIX = "kd_cache_";
const TTL_MS = 60 * 60 * 1000; // 1 小时

interface CacheEntry<T> {
  data: T;
  ts: number;
}

function getCacheKey(key: string): string {
  return `${CACHE_PREFIX}${key}`;
}

/** 读取缓存（过期返回 null） */
export function getCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(getCacheKey(key));
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.ts > TTL_MS) {
      localStorage.removeItem(getCacheKey(key));
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

/** 写入缓存 */
export function setCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, ts: Date.now() };
    localStorage.setItem(getCacheKey(key), JSON.stringify(entry));
  } catch {
    // localStorage 满了就忽略
  }
}

export function clearKingdeeCache(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // localStorage 不可用时无需处理
  }
}
