import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act, createElement } from 'react';
import dayjs from 'dayjs';
import './standard-frontend-dom.ts';

const { createRoot } = await import('react-dom/client');
const { DatePicker } = await import('antd');
const localeModule = await import('../src/components/AppLocaleProvider.tsx').catch(() => null);

test('app locale renders date picker calendar actions and weekdays in Chinese', async () => {
  assert.ok(localeModule?.AppLocaleProvider, '应用应提供统一中文地区配置');
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(createElement(localeModule.AppLocaleProvider, null,
      createElement(DatePicker, { open: true, value: dayjs('2026-10-27') }))));
    assert.match(document.body.textContent ?? '', /今天/);
    assert.doesNotMatch(document.body.textContent ?? '', /Today/);
    assert.equal(dayjs('2026-10-27').format('dddd'), '星期二');
  } finally {
    await act(async () => root.unmount());
  }
});
