import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "teao-start-dev-test-"));

try {
  const scriptPath = path.join(tempDirectory, "start-dev.sh");
  const binDirectory = path.join(tempDirectory, "bin");
  fs.mkdirSync(binDirectory);
  fs.copyFileSync(new URL("../start-dev.sh", import.meta.url), scriptPath);
  fs.writeFileSync(path.join(binDirectory, "node"), "#!/bin/sh\necho 24\n", { mode: 0o755 });

  const result = spawnSync("bash", [scriptPath], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${binDirectory}:${process.env.PATH}` },
  });

  assert.equal(result.status, 1, "启动前置检查失败时必须保留非零退出码");
  assert.match(`${result.stdout}${result.stderr}`, /未找到 \.env 文件/);
  console.log("Start dev script tests passed.");
} finally {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
