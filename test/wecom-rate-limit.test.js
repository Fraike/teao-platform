import assert from "node:assert/strict";
import { createWecomRateLimiter } from "../server/services/wecom-rate-limit.js";
let now = 100000, waits = [];
const reserve = createWecomRateLimiter({ limit: 20, period: 60000, now: () => now, pause: async ms => { waits.push(ms); now += ms; } });
await Promise.all(Array.from({ length: 20 }, () => reserve("group-one")));assert.equal(waits.length, 0);
await reserve("group-two");assert.equal(waits.length, 0);
await reserve("group-one");assert.equal(waits.length, 1);assert.equal(waits[0], 60000);
await reserve("group-one");assert.equal(waits.length, 1);
console.log("WeCom per-webhook 20/minute rate limiting and parallel reservation passed with fake clock.");
