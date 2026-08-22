import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "teao-admin-recovery-test-"));
process.env.DATA_DIR = dataDirectory;
process.env.NODE_ENV = "production";
process.env.JWT_SECRET = "01234567890123456789012345678901";
process.env.INITIAL_ADMIN_PASSWORD = "InitialAdmin2026";
process.env.ADMIN_RECOVERY_CODE = "recovery-code-0123456789-abcdefghijklmnopqrstuvwxyz";

const {
  initDefaultAdmin,
  loginUser,
  recoverAdminPassword,
  changeAdminPassword,
  isTokenSessionValid,
} = await import("../server/services/users.js");

try {
  await initDefaultAdmin();
  const firstLogin = await loginUser({ username: "admin", password: "InitialAdmin2026" });
  assert.ok(firstLogin.token);
  assert.equal(await isTokenSessionValid(firstLogin.token), true);

  assert.deepEqual(
    await recoverAdminPassword({ username: "admin", recoveryCode: "wrong-code", newPassword: "RecoveredAdmin2026" }),
    { error: "管理员恢复信息无效" },
  );
  assert.deepEqual(
    await recoverAdminPassword({ username: "admin", recoveryCode: process.env.ADMIN_RECOVERY_CODE, newPassword: "RecoveredAdmin2026" }),
    { ok: true },
  );
  assert.equal((await loginUser({ username: "admin", password: "InitialAdmin2026" })).error, "用户名或密码错误");
  assert.equal(await isTokenSessionValid(firstLogin.token), false);

  const recoveredLogin = await loginUser({ username: "admin", password: "RecoveredAdmin2026" });
  const changed = await changeAdminPassword({
    userId: recoveredLogin.user.id,
    currentPassword: "RecoveredAdmin2026",
    newPassword: "ChangedAdmin2026",
  });
  assert.ok(changed.token);
  assert.equal(await isTokenSessionValid(recoveredLogin.token), false);
  assert.equal((await loginUser({ username: "admin", password: "ChangedAdmin2026" })).user.username, "admin");
  console.log("Admin password recovery tests passed.");
} finally {
  fs.rmSync(dataDirectory, { recursive: true, force: true });
}
