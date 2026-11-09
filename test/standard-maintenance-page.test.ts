import assert from 'node:assert/strict';
import { test } from 'node:test';
import './standard-frontend-dom.ts';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { SystemSettingsPage } from '../src/pages/SystemSettingsPage.tsx';
import { api } from '../src/lib/api.ts';
import { USER_PERMISSION_SECTIONS } from '../src/lib/userPermissions.ts';

test('shared toolbar saves selected maintainers and mode without rewriting unchanged push settings', async () => {
  const oldGet = api.get, oldPut = api.put;
  const calls: { url: string; body: unknown }[] = [];
  let conflict = false;
  let maintenance = { enabled: false, revision: 2, updatedAt: '2026-11-07T00:00:00Z', updatedBy: '管理员甲' };
  let roster={candidates:[{id:'editor',name:'编辑员',username:'editor'}],selectedIds:[] as string[],revision:'roster-v1'};
  api.get = (async (url: string) => ({ ok: true, data: url.endsWith('standard-maintenance') ? maintenance : url.endsWith('standard-maintainers') ? roster : { enabled: true, reviewTimes: ['08:10'], revision: 8, productionTime: '13:00' } })) as typeof api.get;
  api.put = (async (url: string, body: { enabled: boolean; revision: number; selectedIds?: string[] }) => {
    calls.push({ url, body });
    if (url.endsWith('/standard-maintainers')) { roster={...roster,selectedIds:body.selectedIds||[],revision:'roster-v2'}; return {ok:true,data:roster}; }
    if (conflict) throw new Error('校对模式配置已更新，请刷新后重试');
    maintenance = { ...maintenance, ...body, revision: 3, updatedBy: '管理员乙' };
    return { ok: true, data: maintenance };
  }) as typeof api.put;
  const root = createRoot(document.getElementById('root')!);
  const button = (label: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.replace(/\s/g, '') === label)!;
  try {
    await act(async () => root.render(createElement(SystemSettingsPage)));
    assert.ok(document.body.textContent?.includes('新增、复制仍需审核'));
    const toggle = document.querySelector<HTMLButtonElement>('[aria-label="产品标准临时校对模式"]')!;
    assert.ok(toggle);
    const selector=document.querySelector<HTMLInputElement>('input[aria-label="免审核校对人员"]')!;
    await act(()=>selector.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true})));
    const option=[...document.querySelectorAll('.ant-select-item-option')].find(node=>node.textContent?.includes('编辑员'))!;
    await act(()=>option.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));
    await act(() => toggle.click());
    await act(async () => button('保存设置').click());
    assert.deepEqual(calls, [{url:'/api/admin/system-settings/standard-maintainers',body:{selectedIds:['editor'],revision:'roster-v1'}}, { url: '/api/admin/system-settings/standard-maintenance', body: { enabled: true, revision: 2, rosterRevision: 'roster-v2' } }]);
    assert.ok(document.body.textContent?.includes('管理员乙'));
    assert.equal(button('保存设置').disabled,true);
    conflict = true;
    await act(()=>toggle.click());
    await act(async () => button('保存设置').click());
    assert.ok(document.body.textContent?.includes('请刷新后重试'));
    maintenance = { ...maintenance, enabled: false, revision: 4 };
    await act(async () => button('刷新设置').click());
    assert.equal(toggle.getAttribute('aria-checked'), 'false');
  } finally { await act(() => root.unmount()); api.get = oldGet; api.put = oldPut; }
  const permission = USER_PERMISSION_SECTIONS.flatMap(s => s.permissions).find(p => p.key === 'engineering_maintain');
  assert.equal(permission, undefined);
});
