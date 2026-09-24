import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "teao-config-read-"));
process.env.DATA_DIR = directory;
process.env.PRODUCTION_CONFIG_PATH = path.join(directory, "config.json");
const { readConfig } = await import("../server/config.js");
const originalRead = fs.readFileSync;
try {
  for (const invalid of ['{"dataSource":"internal",', "null", "[]", '"internal"', '{"dataSource":"bad"}']) {
    fs.writeFileSync(process.env.PRODUCTION_CONFIG_PATH, invalid);
    assert.throws(readConfig, { code: "PRODUCTION_CONFIG_READ_FAILED", status: 503 }, "不可读配置不得回退默认vika");
    assert.equal(fs.readFileSync(process.env.PRODUCTION_CONFIG_PATH, "utf8"), invalid, "失败不覆盖配置");
  }
  const internal = '{"dataSource":"internal","enabled":false}';
  fs.writeFileSync(process.env.PRODUCTION_CONFIG_PATH, internal);
  fs.readFileSync = (file, ...args) => {
    if (file === process.env.PRODUCTION_CONFIG_PATH) {
      const error = new Error("fixture permission denied");
      error.code = "EACCES";
      throw error;
    }
    return originalRead(file, ...args);
  };
  assert.throws(readConfig, { code: "PRODUCTION_CONFIG_READ_FAILED" });
  fs.readFileSync = originalRead;
  assert.equal(fs.readFileSync(process.env.PRODUCTION_CONFIG_PATH, "utf8"), internal);
  assert.equal(readConfig().dataSource, "internal");
  fs.writeFileSync(process.env.PRODUCTION_CONFIG_PATH, '{"enabled":false}');
  assert.equal(readConfig().dataSource, "vika", "合法旧对象缺少来源仍兼容默认vika");
  process.env.PRODUCTION_CONFIG_PATH = path.join(directory, "nonexistent.json");
  // CONFIG_FILE is fixed on import: use a fresh module to exercise a genuinely missing file.
  const missing = await import("../server/config.js?missing-file-test");
  assert.equal(missing.readConfig().dataSource, "vika");
  assert.equal(JSON.parse(fs.readFileSync(process.env.PRODUCTION_CONFIG_PATH)).dataSource, "vika");
  console.log("Production config read tests passed (corrupt/unreadable preserved; missing/legacy defaults only).");
} finally {
  fs.readFileSync = originalRead;
  fs.rmSync(directory, { recursive: true, force: true });
}
