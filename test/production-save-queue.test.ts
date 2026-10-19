import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProductionSaveQueue } from '../src/lib/productionSaveQueue.ts';

test('same-record request and full-row application serialize while other records remain independent', async () => {
  const queue = createProductionSaveQueue(), calls: string[] = [];
  let release!: () => void;
  let visible = { dailyQty: 0, defects: 0 };
  const first = queue.run(1, async () => {
    calls.push('A'); await new Promise<void>(resolve => { release = resolve; });
    visible = { dailyQty: 10, defects: 0 };
  });
  const second = queue.run(1, async () => { calls.push('B'); visible = { dailyQty: 10, defects: 2 }; });
  await queue.run(2, async () => { calls.push('other'); });
  assert.deepEqual(calls, ['A', 'other'], 'second snapshot cannot arrive before first is applied');
  release(); await Promise.all([first, second]);
  assert.deepEqual(visible, { dailyQty: 10, defects: 2 }); assert.deepEqual(calls, ['A', 'other', 'B']);
});

test('failed save does not block the next queued save', async () => {
  const queue = createProductionSaveQueue();
  const failed = queue.run(1, async () => { throw Error('first failed'); });
  const succeeded = queue.run(1, async () => 2);
  await assert.rejects(failed, /first failed/); assert.equal(await succeeded, 2);
});
