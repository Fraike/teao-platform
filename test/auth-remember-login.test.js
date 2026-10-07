import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "teao-remember-login-test-"));
process.env.DATA_DIR = dataDirectory;
process.env.NODE_ENV = "production";
process.env.JWT_SECRET = "01234567890123456789012345678901";
process.env.INITIAL_ADMIN_PASSWORD = "InitialAdmin2026";

const { initDefaultAdmin, loginUser, refreshToken, changeAdminPassword } = await import("../server/services/users.js");

function decodeDurationDays(token) {
  const payload = decodeToken(token);
  return (payload.exp - payload.iat) / 86400;
}

function decodeToken(token) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

try {
  await initDefaultAdmin();

  const standard = await loginUser({ username: "admin", password: "InitialAdmin2026" });
  const standardPayload = decodeToken(standard.token);
  assert.equal(standardPayload.rememberLogin, false);
  assert.equal(decodeDurationDays(standard.token), 7);

  const remembered = await loginUser({
    username: "admin",
    password: "InitialAdmin2026",
    rememberLogin: true,
  });
  const rememberedPayload = decodeToken(remembered.token);
  assert.equal(rememberedPayload.rememberLogin, true);
  assert.equal(decodeDurationDays(remembered.token), 15);

  const refreshed = refreshToken(remembered.token);
  assert.equal(decodeToken(refreshed.token).rememberLogin, true);
  assert.equal(decodeDurationDays(refreshed.token), 15);

  const changed = await changeAdminPassword({
    userId: remembered.user.id,
    currentPassword: "InitialAdmin2026",
    newPassword: "ChangedAdmin2026",
    rememberLogin: true,
  });
  assert.equal(decodeToken(changed.token).rememberLogin, true);
  assert.equal(decodeDurationDays(changed.token), 15);

  const usersFile = path.join(dataDirectory, "users.json");
  const stored = JSON.parse(fs.readFileSync(usersFile, "utf8"));
  stored.users[0].status = "disabled";
  fs.writeFileSync(usersFile, JSON.stringify(stored), "utf8");
  assert.deepEqual(refreshToken(changed.token), { error: "登录状态已失效，请重新登录" });

  console.log("Remember login server tests passed.");
} finally {
  fs.rmSync(dataDirectory, { recursive: true, force: true });
}
