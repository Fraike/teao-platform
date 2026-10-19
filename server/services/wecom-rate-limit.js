import { createMutex } from "../lib/mutex.js";

export function createWecomRateLimiter({ limit = 20, period = 60000, now = Date.now, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const groups = new Map();
  return async webhook => {
    const group = groups.get(webhook) || { mutex: createMutex(), times: [] };
    groups.set(webhook, group);
    await group.mutex.run(async () => {
      group.times = group.times.filter(time => now() - time < period);
      while (group.times.length >= limit) {
        await pause(Math.max(1, group.times[0] + period - now()));
        group.times = group.times.filter(time => now() - time < period);
      }
      group.times.push(now());
    });
  };
}
