import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { createRequire } from "node:module";
const cron = createRequire(new URL("../server/package.json", import.meta.url))("node-cron");

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
    assert.ok(task.id, "scheduled task has a public id");
    return task;
  } };
}

test("real cron preserves production and standard reminder lifecycle without registry leaks", async () => {
  const config = await import("../server/config.js");
  const { createProductionScheduler } = await import("../server/services/production-report-scheduler.js");
  const store = await import("../server/services/standard-store.js");
  const { createStandardReviewReminders } = await import("../server/services/standard-review-reminders.js");
  const productionCron = trackedCron();
  const reminderCron = trackedCron();
  let sends = 0;
  let checks = 0;
  // Start outside the matching second so startup must not send a report.
  const laterSecond = (new Date().getSeconds() + 30) % 60;
  config.writeConfig({ ...config.DEFAULT_CONFIG, enabled: true, cronExpression: `${laterSecond} * * * * *`, wecomWebhook: "" });
  const scheduler = createProductionScheduler(productionCron, async () => {
    sends++;
    return { status: "mocked" };
  }, () => "2026-10-19");
  let reminders;
  try {
    scheduler.start();
    assert.equal(sends, 0, "startup outside the scheduled time does not deliver a report");
    config.writeConfig({ ...config.readConfig(), cronExpression: "* * * * * *" });
    await waitFor(() => sends > 0);
    scheduler.stop();
    assert(productionCron.tasks.every(task => !cron.getTasks().has(task.id)), "stopped production tasks leave the registry");
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
    assert.equal(checks, 0, "reminder must not catch up immediately on startup");
    await reminderCron.tasks[0].execute();
    assert.equal(checks, 1, "scheduled reminder callback remains callable");
    reminders.stop();
    assert.equal(cron.getTasks().has(reminderCron.tasks[0].id), false, "stopped reminder leaves the registry");
    reminders.start(reminderCron);
    assert.equal(reminderCron.tasks.length, 2, "reminder restarts after stop");
    assert.equal(checks, 1, "restart does not run an extra check");
    assert.equal(new Set([...productionCron.tasks, ...reminderCron.tasks].map(task => task.id)).size,
      productionCron.tasks.length + reminderCron.tasks.length, "public task ids remain unique");
  } finally {
    scheduler.stop();
    reminders?.stop();
    for (const task of [...productionCron.tasks, ...reminderCron.tasks]) task.destroy();
    cron.getTasks().clear();
    store.closeDB();
  }
});
