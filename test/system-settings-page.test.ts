import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { NAVIGATION_ITEMS, canAccessNavigationItem } from '../src/lib/navigation.ts';
import type { User } from '../src/types/auth.ts';
test('system settings is admin navigation and saves with loaded revision', () => {
  const item = NAVIGATION_ITEMS.find(item => item.key === '/system-settings')!;
  assert.equal(item.menu, false);
  assert.equal(canAccessNavigationItem(item, { role: 'user', permissions: [] } as unknown as User), false);
  assert.equal(canAccessNavigationItem(item, { role: 'admin', permissions: [] } as unknown as User), true);
  const source = fs.readFileSync(new URL('../src/pages/SystemSettingsPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /revision: settings.revision/);
  assert.match(source, /TimePicker/);
  assert.match(source, /productionScheduleLegacy/);
  assert.doesNotMatch(source, /send-report|send-reminder|webhook/i);
});

import './standard-frontend-dom.ts';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { SystemSettingsPage } from '../src/pages/SystemSettingsPage.tsx';
import { api } from '../src/lib/api.ts';
import type { PushSettings, PushSettingsInput } from '../src/types/pushSettings.ts';

test('administrator can edit switches, add/delete reminder times and save the latest concurrency tokens', async () => {
  const data: PushSettings = { enabled:true,standardPublicationEnabled:false,standardReviewEnabled:false,reviewTimes:['08:10','13:00'],productionEnabled:true,productionTime:'13:00',revision:3,productionRevision:'production-token',updatedAt:'',updatedBy:'',nextReviewAt:null,nextProductionAt:null,productionScheduleLegacy:false };
  const oldGet=api.get, oldPut=api.put;
  let saved: PushSettingsInput | undefined;
  api.get=(async()=>({ok:true,data})) as typeof api.get;
  api.put=(async(_url:string,body:PushSettingsInput)=>{saved=body;return {ok:true,data:{...data,...body,revision:4}};}) as typeof api.put;
  const root=createRoot(document.getElementById('root')!);
  const findButton=(label:string)=>[...document.querySelectorAll('button')].find(button=>button.textContent?.replace(/\s/g,'')===label)!;
  try {
    await act(async()=>root.render(createElement(SystemSettingsPage)));
    assert.equal(document.querySelectorAll('[role="switch"]').length,4);
    await act(()=>document.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
    assert.equal(document.querySelector('[role="switch"]')!.getAttribute('aria-checked'),'false');
    await act(()=>findButton('添加审核时间').click());
    assert.equal(document.querySelectorAll('input[aria-label^="审核时间"]').length,3);
    const deletes=[...document.querySelectorAll('button')].filter(button=>button.textContent?.replace(/\s/g,'')==='删除');
    await act(()=>deletes.at(-1)!.click());
    assert.equal(document.querySelectorAll('input[aria-label^="审核时间"]').length,2);
    await act(async()=>findButton('保存设置').click());
    assert.equal(saved?.enabled,false);
    assert.equal(saved?.revision,3);
    assert.equal(saved?.productionRevision,'production-token');
    assert.deepEqual(saved?.reviewTimes,['08:10','13:00']);
  } finally {
    await act(()=>root.unmount());api.get=oldGet;api.put=oldPut;
  }
});
