import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "teao-kingdee-cache-test-"));
process.env.DATA_DIR = dataDirectory;
process.env.JWT_SECRET = "01234567890123456789012345678901";

const { readKingdeeCache, writeKingdeeCache } = await import("../server/services/kingdee-cache.js");
const { registerKingdeeRoutes } = await import("../server/routes/kingdee.js");
const require = createRequire(import.meta.url);
const express = require("../server/node_modules/express");
const jwt = require("../server/node_modules/jsonwebtoken");

try {
  fs.writeFileSync(
    path.join(dataDirectory, "kingdee_materials.json"),
    JSON.stringify({
      fetchedAt: "2026-07-30T00:00:00.000Z",
      materials: [
        { id: "material-1", parent_id: "group-a", name: "Material one" },
        { id: "material-2", parent_id: "group-b", name: "Material two" },
      ],
    })
  );
  assert.deepEqual(readKingdeeCache("materials"), {
    fetchedAt: "2026-07-30T00:00:00.000Z",
    data: [
      { id: "material-1", parent_id: "group-a", name: "Material one" },
      { id: "material-2", parent_id: "group-b", name: "Material two" },
    ],
  });

  writeKingdeeCache("customers", [{ id: "customer-1" }]);
  assert.deepEqual(readKingdeeCache("customers")?.data, [{ id: "customer-1" }]);

  const app = express();
  registerKingdeeRoutes(app);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    const port = server.address().port;
    const token = jwt.sign({ role: "admin", permissions: ["basic_data"] }, process.env.JWT_SECRET);
    const response = await fetch(`http://127.0.0.1:${port}/api/kingdee/materials?category=group-a&search=one`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.data, [{ id: "material-1", parent_id: "group-a", name: "Material one" }]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  console.log("Kingdee cache tests passed.");
} finally {
  fs.rmSync(dataDirectory, { recursive: true, force: true });
}
