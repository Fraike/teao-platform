import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "teao-config-write-"));
process.env.DATA_DIR = directory;
process.env.PRODUCTION_CONFIG_PATH = path.join(directory, "config.json");
const config = await import("../server/config.js");
const originalUmask = process.umask(0o022);
const originalRename = fs.renameSync;
try {
  config.readConfig();
  assert.equal(fs.statSync(config.CONFIG_FILE).mode & 0o777, 0o600, "新配置不能暴露token/webhook给其他用户");
  for (const permission of [0o600, 0o400]) {
    fs.chmodSync(config.CONFIG_FILE, permission);
    config.writeConfig({ ...config.readConfig(), wecomWebhook: "fixture-only" });
    assert.equal(fs.statSync(config.CONFIG_FILE).mode & 0o777, permission, "原子替换不扩大已有权限");
  }
  fs.chmodSync(config.CONFIG_FILE, 0o600);
  const before = fs.readFileSync(config.CONFIG_FILE, "utf8");
  fs.renameSync = () => { throw new Error("fixture rename failure"); };
  assert.throws(() => config.writeConfig({ ...config.readConfig(), vikaToken: "fixture-only" }));
  assert.equal(fs.readFileSync(config.CONFIG_FILE, "utf8"), before);
  const temporary = fs.readdirSync(directory).filter((name) => name.endsWith(".tmp"));
  assert.ok(temporary.length > 0);
  for (const file of temporary) assert.equal(fs.statSync(path.join(directory, file)).mode & 0o777, 0o600, "失败遗留临时配置也须0600");
  console.log("Production config permission tests passed (umask022; original0600/0400; failed temporary0600).");
} finally {
  fs.renameSync = originalRename;
  process.umask(originalUmask);
  fs.rmSync(directory, { recursive: true, force: true });
}
