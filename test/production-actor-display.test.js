import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "../server/node_modules/express/index.js";
import jwt from "../server/node_modules/jsonwebtoken/index.js";

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "teao-production-actor-test-"));
process.env.DATA_DIR = testDirectory;
process.env.PRODUCTION_DB_PATH = path.join(testDirectory, "production.db");
process.env.NODE_ENV = "development";
process.env.JWT_SECRET = "test-only-production-actor-secret-123456";

fs.writeFileSync(path.join(testDirectory, "users.json"), JSON.stringify({
  users: [
    {
      id: "user-1",
      name: "张三",
      username: "operator-a",
      role: "user",
      status: "active",
      permissions: ["production"],
      passwordVersion: 0,
    },
    {
      id: "user-2",
      name: "李四",
      username: "operator-b",
      role: "admin",
      status: "active",
      permissions: ["production"],
      passwordVersion: 0,
    },
  ],
}));

try {
  const {
    createProductionActorResolver,
    getProductionActorName,
    mapProductionHistoryActors,
    mapProductionQueryActors,
    mapProductionRecordActors,
  } = await import("../server/services/production-actors.js");

  assert.equal(getProductionActorName({ id: "user-1", username: "operator-a" }), "张三");
  assert.equal(getProductionActorName({ id: "missing-user", username: "legacy-user" }), "legacy-user");
  assert.equal(getProductionActorName({}), "unknown");

  const resolveActor = createProductionActorResolver();
  assert.equal(resolveActor("user-1"), "张三");
  assert.equal(resolveActor("operator-b"), "李四");
  assert.equal(resolveActor("张三"), "张三");
  assert.equal(resolveActor("deleted-user"), "deleted-user");

  const mappedRecord = mapProductionRecordActors({
    id: 1,
    createdBy: "operator-a",
    updatedBy: "user-2",
  }, resolveActor);
  assert.equal(mappedRecord.createdBy, "张三");
  assert.equal(mappedRecord.updatedBy, "李四");

  const mappedQuery = mapProductionQueryActors({
    total: 2,
    groups: [{
      date: "2026-10-08",
      records: [
        { id: 1, createdBy: "operator-a", updatedBy: "operator-a" },
        { id: 2, createdBy: "deleted-user", updatedBy: "deleted-user" },
      ],
    }],
  }, resolveActor);
  assert.equal(mappedQuery.groups[0].records[0].updatedBy, "张三");
  assert.equal(mappedQuery.groups[0].records[1].updatedBy, "deleted-user");

  const mappedHistory = mapProductionHistoryActors([
    { id: 1, changed_by: "operator-a" },
    { id: 2, changed_by: "deleted-user" },
  ], resolveActor);
  assert.equal(mappedHistory[0].changed_by, "张三");
  assert.equal(mappedHistory[1].changed_by, "deleted-user");

  const store = await import("../server/services/production-store.js");
  const { registerProductionEntryRoutes } = await import("../server/routes/production-entry.js");
  const { registerProductionEntryInjectionRoutes } = await import("../server/routes/production-entry-injection.js");
  const app = express();
  app.use(express.json());
  registerProductionEntryRoutes(app);
  registerProductionEntryInjectionRoutes(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const token = jwt.sign({
    id: "user-1",
    username: "operator-a",
    role: "user",
    permissions: ["production"],
    passwordVersion: 0,
  }, process.env.JWT_SECRET, { expiresIn: "1h" });

  async function request(method, endpoint, body) {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }

  try {
    const assembly = store.createEntry({
      date: "2026-10-08",
      line: "1#",
      customer: "测试客户",
      productName: "历史成品",
      dailyQty: 100,
    }, "operator-a");
    const injection = store.createInjectionEntry({
      date: "2026-10-08",
      machine: "1#",
      shift: "白班",
      productName: "历史塑胶件",
      dailyQty: 100,
    }, "operator-a");

    const assemblyList = await request("GET", "/api/production/entries");
    assert.equal(assemblyList.body.data.groups[0].records[0].updatedBy, "张三");
    const injectionList = await request("GET", "/api/production/injection/entries");
    assert.equal(injectionList.body.data.groups[0].records[0].updatedBy, "张三");

    const assemblyUpdate = await request("PUT", `/api/production/entries/${assembly.id}`, { remark: "已修改" });
    assert.equal(assemblyUpdate.body.data.updatedBy, "张三");
    const injectionUpdate = await request("PUT", `/api/production/injection/entries/${injection.id}`, { remark: "已修改" });
    assert.equal(injectionUpdate.body.data.updatedBy, "张三");

    const assemblyHistory = await request("GET", `/api/production/entries/${assembly.id}/history`);
    assert.ok(assemblyHistory.body.data.every((entry) => entry.changed_by === "张三"));
    const injectionHistory = await request("GET", `/api/production/injection/entries/${injection.id}/history`);
    assert.ok(injectionHistory.body.data.every((entry) => entry.changed_by === "张三"));

    const assemblyExport = await request("GET", "/api/production/entries/export");
    assert.equal(assemblyExport.body.data.groups[0].records[0].createdBy, "张三");
    const injectionExport = await request("GET", "/api/production/injection/entries/export");
    assert.equal(injectionExport.body.data.groups[0].records[0].createdBy, "张三");

    const assemblyImport = await request("POST", "/api/production/entries/import", { records: [{
      date: "2026-10-09",
      line: "2#",
      customer: "导入客户",
      productName: "导入成品",
      dailyQty: 10,
    }] });
    assert.equal(assemblyImport.status, 200);
    assert.equal(store.queryEntries().groups[0].records[0].createdBy, "张三");

    const injectionImport = await request("POST", "/api/production/injection/entries/import", { records: [{
      date: "2026-10-09",
      machine: "2#",
      shift: "夜班",
      productName: "导入塑胶件",
      dailyQty: 10,
    }] });
    assert.equal(injectionImport.status, 200);
    assert.equal(store.queryInjectionEntries().groups[0].records[0].createdBy, "张三");

    const importedAssemblyId = store.queryEntries().groups[0].records[0].id;
    assert.equal((await request("DELETE", `/api/production/entries/${importedAssemblyId}`)).status, 200);
    const deleteHistory = await request("GET", `/api/production/entries/${importedAssemblyId}/history`);
    assert.equal(deleteHistory.body.data[0].changed_by, "张三");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.closeDB();
  }

  console.log("Production actor display tests passed.");
} finally {
  fs.rmSync(testDirectory, { recursive: true, force: true });
}
