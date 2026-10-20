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
  for (const scenario of [
    { file: '', expected: 'true' },
    { file: 'STANDARD_REVIEW_REMINDERS_ENABLED=false\n', expected: 'false' },
    { file: 'STANDARD_REVIEW_REMINDERS_ENABLED=true\n', override: 'false', expected: 'false' },
    { file: 'STANDARD_REVIEW_REMINDERS_ENABLED=false\n', override: 'true', expected: 'true' },
  ]) {
    fs.mkdirSync(path.join(tempDirectory, 'server'), { recursive: true });
    fs.mkdirSync(path.join(tempDirectory, 'node_modules', '.bin'), { recursive: true });
    fs.writeFileSync(path.join(tempDirectory, '.env'), 'JWT_SECRET=isolated-dev-test-secret-at-least-32-characters\n' + scenario.file);
    fs.writeFileSync(path.join(tempDirectory, 'node_modules', '.bin', 'vite'), '#!/bin/sh\nexec sleep 5\n', { mode: 0o755 });
    fs.writeFileSync(path.join(binDirectory, 'node'), `#!/bin/bash
if [[ "$*" == *server.js* ]]; then
  printf '%s' "$STANDARD_REVIEW_REMINDERS_ENABLED" > "$REMINDER_TEST_OUTPUT"
  exit 1
fi
exec "${process.execPath}" "$@"
`, { mode: 0o755 });
    const output = path.join(tempDirectory, 'reminder-flag');
    const env = { ...process.env, PATH: `${binDirectory}:${process.env.PATH}`, REMINDER_TEST_OUTPUT: output };
    delete env.STANDARD_REVIEW_REMINDERS_ENABLED;
    if (scenario.override) env.STANDARD_REVIEW_REMINDERS_ENABLED = scenario.override;
    const startup = spawnSync('bash', [scriptPath], { encoding: 'utf8', env, timeout: 15000 });
    assert.equal(startup.status, 1, 'mock backend exit must stop dev launcher');
    assert.equal(fs.readFileSync(output, 'utf8'), scenario.expected, 'reminder default, file configuration and process override must be respected');
  }
  console.log("Start dev script tests passed.");
} finally {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
