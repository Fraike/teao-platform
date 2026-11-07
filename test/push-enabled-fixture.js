import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
/** Existing delivery tests explicitly opt in; production defaults remain off. */
export function enableTestPushes() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'teao-push-enabled-'));
  process.env.PUSH_SETTINGS_PATH = path.join(directory, 'push-settings.json');
  fs.writeFileSync(process.env.PUSH_SETTINGS_PATH, JSON.stringify({ enabled: true,
    standardPublicationEnabled: true, standardReviewEnabled: true, reviewTimes: ['08:10', '13:00'],
    revision: 1, updatedAt: '', updatedBy: 'isolated-test' }), { mode: 0o600 });
}
