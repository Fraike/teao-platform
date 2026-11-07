import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shanghaiMinute, reminderWindowEnd } from '../server/shared/push-schedule.ts';
test('Shanghai reminders separate minutes within an hour and cannot cross the next slot',()=>{
  const at=Date.parse('2026-11-07T08:10:00+08:00');
  assert.equal(shanghaiMinute(at),'08:10');
  assert.equal(reminderWindowEnd(at,'08:10',['08:10','08:30','13:00']),Date.parse('2026-11-07T08:30:00+08:00'));
  assert.equal(reminderWindowEnd(at,'08:10',['08:10','13:00']),Date.parse('2026-11-07T09:00:00+08:00'));
});
