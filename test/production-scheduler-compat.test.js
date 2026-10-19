import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import cron from "../server/node_modules/node-cron/src/node-cron.js";

// All storage and delivery are isolated from production.
const directory = mkdtempSync(path.join(os.tmpdir(), "teao-cron-compat-"));
process.env.DATA_DIR = directory;
process.env.PRODUCTION_CONFIG_PATH = path.join(directory, "config.json");
process.env.PRODUCTION_DB_PATH = path.join(directory, "production.db");
process.env.JWT_SECRET = "cron-compat-tests-only-secret-at-least-32-characters";
process.env.NODE_ENV = "production";

async function waitFor(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, "scheduled callback should run within five seconds");
    await delay(50);
  }
}

function trackedCron() {
  const tasks = [];
  return { tasks, validate: cron.validate, schedule(expression, callback, options) {
    const task = cron.schedule(expression, callback, options);
    tasks.push(task);
    assert.match(task.options.name, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    return task;
  } };
}

test("real cron with patched uuid preserves production and standard reminder lifecycle", async () => {
  const config = await import("../server/config.js");
  const { createProductionScheduler } = await import("../server/services/production-report-scheduler.js");
  const store = await import("../server/services/standard-store.js");
  const { createStandardReviewReminders } = await import("../server/services/standard-review-reminders.js");
  const productionCron = trackedCron();
  const reminderCron = trackedCron();
  let sends = 0;
  let checks = 0;
  config.writeConfig({ ...config.DEFAULT_CONFIG, enabled: true, cronExpression: "* * * * * *", wecomWebhook: "" });
  const scheduler = createProductionScheduler(productionCron, async () => {
    sends++;
    return { status: "mocked" };
  }, () => "2026-10-19");
  let reminders;
  try {
    scheduler.start();
    assert.equal(sends, 0, "schedule does not immediately deliver a report");
    await waitFor(() => sends > 0);
    scheduler.stop();
    const stopped = sends;
    await delay(1100);
    assert.equal(sends, stopped, "stop cancels the real cron timer");
    scheduler.start();
    await waitFor(() => sends > stopped);
    config.writeConfig({ ...config.readConfig(), enabled: false });
    const disabled = sends;
    await delay(1100);
    assert.equal(sends, disabled, "disabling config stops delivery");
    scheduler.stop();
    const taskCount = productionCron.tasks.length;
    config.writeConfig({ ...config.readConfig(), enabled: true });
    assert.equal(productionCron.tasks.length, taskCount, "stop unsubscribes config rebuilds");
    store.initDB();
    reminders = createStandardReviewReminders({ config: () => { checks++; return { wecomWebhook: "" }; },
      users: () => [], send: async () => assert.fail("no real reminder delivery") });
    reminders.start(reminderCron);
    reminders.start(reminderCron);
    assert.equal(reminderCron.tasks.length, 1, "repeated start creates one reminder task");
    assert.equal(checks, 1, "reminder performs one explicit initial check");
    await reminderCron.tasks[0].now();
    assert.equal(checks, 2, "scheduled reminder callback remains callable");
    reminders.stop();
    reminders.start(reminderCron);
    assert.equal(reminderCron.tasks.length, 2, "reminder restarts after stop");
    assert.equal(checks, 3);
    assert.equal(new Set([...productionCron.tasks, ...reminderCron.tasks].map(task => task.options.name)).size,
      productionCron.tasks.length + reminderCron.tasks.length, "uuid v4 task names remain unique");
  } finally {
    scheduler.stop();
    reminders?.stop();
    for (const task of [...productionCron.tasks, ...reminderCron.tasks]) task.stop();
    cron.getTasks().clear();
    store.closeDB();
  }
});
