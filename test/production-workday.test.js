import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

for (const TZ of ["UTC", "Asia/Shanghai", "America/New_York"]) {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import { isRestDay, getLastWorkingDay } from './server/config.js';
    const config = { restDays: [], makeupWorkdays: [] };
    assert.equal(isRestDay('2026-09-13', config), true);
    assert.equal(isRestDay('2026-09-14', config), false);
    assert.equal(getLastWorkingDay('2026-09-14', config), '2026-09-12');
    assert.equal(getLastWorkingDay('2026-09-14', { ...config, restDays: ['2026-09-12'] }), '2026-09-11');
    assert.equal(getLastWorkingDay('2026-09-14', { ...config, makeupWorkdays: ['2026-09-13'] }), '2026-09-13');
  `], { env: { ...process.env, TZ }, encoding: "utf8" });
  assert.equal(result.status, 0, `${TZ}: ${result.stderr}`);
}
console.log("Production workday timezone tests passed.");
