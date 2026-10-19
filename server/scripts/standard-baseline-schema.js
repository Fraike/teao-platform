// A separate process prevents the singleton store from ever opening the current DATA_DIR.
import fs from 'node:fs';
import path from 'node:path';
const directory = process.argv[2];
if (!directory || !path.isAbsolute(directory) || fs.existsSync(path.join(directory,'standards.db'))) throw new Error('需要全新隔离目录');
process.env.DATA_DIR=directory;
const store=await import('../services/standard-store.js');
try {
  store.initDB();
  const {initializeReminderSchema}=await import('../services/standard-reminder-schema.js');
  initializeReminderSchema(store.getDB());
} finally { store.closeDB(); }
