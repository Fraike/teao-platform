import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "teao-users-production-test-"));
process.env.DATA_DIR = dataDirectory;
process.env.NODE_ENV = "production";
process.env.JWT_SECRET = "01234567890123456789012345678901";

const { initDefaultAdmin, listUsers } = await import("../server/services/users.js");

try {
  await assert.rejects(initDefaultAdmin(), /INITIAL_ADMIN_PASSWORD/);

  process.env.INITIAL_ADMIN_PASSWORD = "InitialAdmin2026";
  await initDefaultAdmin();
  const admin = listUsers().find((user) => user.role === "admin");
  assert.equal(admin?.username, "admin");
  console.log("Production admin bootstrap tests passed.");
} finally {
  fs.rmSync(dataDirectory, { recursive: true, force: true });
}
