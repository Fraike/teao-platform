import assert from 'node:assert/strict';
import { test } from 'node:test';
import './standard-frontend-dom.ts';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from 'antd';
import { getVisibleMenuItems } from '../src/lib/navigation.ts';
import { useAuthStore } from '../src/lib/authStore.ts';
import { TabPageActiveContext } from '../src/lib/tabPageContext.tsx';
import { CustomerSystemAccountsPage } from '../src/pages/CustomerSystemAccountsPage.tsx';
import type { User } from '../src/types/auth.ts';

const user: User = {
  id: 'fixture', name: '员工', username: 'worker', role: 'user', permissions: ['customer_accounts_view'],
};

test('authorized users can open the customer website and see current passwords directly in the table', async () => {
  assert.equal(getVisibleMenuItems(user).find(item => item.key === '/customer-system-accounts')?.group, 'tools');
  assert.equal(getVisibleMenuItems({ ...user, permissions: ['tools'] }).some(item => item.key === '/customer-system-accounts'), false);
  const originalFetch = globalThis.fetch;
  const account = {
    id: 'fixture', revision: 1, company: '模拟公司 · portal.example.test', username: '0002', url: 'http://portal.example.test/', note: '系统/平台：保安室门禁（192.0.2.1:8000）(https://example.test/login)【[2001:db8::1]:8443】\n条目类型：待确认', passwordChangedAt: null,
    sourceRows: [{ rowNumber: 2, issues: ['待确认'] }],
  };
  const accounts = [account, ...Array.from({ length: 20 }, (_, i) => ({
    ...account, id: 'fixture-' + (i + 1), company: '内部账号 ' + (i + 1), note: '', url: '',
  }))];
  let denied = false;
  let copied = '';
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText: async (value: string) => { copied = value; },
  } });
  const requests: string[] = [];
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith('/passwords')) {
      return denied
        ? Response.json({ error: '无权限' }, { status: 403 })
        : Response.json({ data: Object.fromEntries((JSON.parse(String(options?.body)).ids as string[])
          .map(id => [id, id === 'fixture' ? 'ui-test-password' : 'password-' + id])) });
    }
    return Response.json({ data: accounts });
  };
  useAuthStore.setState({ user, initialized: true });
  const root = createRoot(document.getElementById('root')!);
  const click = async (label: string) => {
    const button = [...document.querySelectorAll('button')].find(el => el.textContent?.replace(/\s+/g, '') === label);
    assert.ok(button, 'missing button ' + label);
    await act(async () => { button.click(); });
  };
  const render = (active: boolean) => act(async () => root.render(
    createElement(App, null, createElement(TabPageActiveContext.Provider, { value: active }, createElement(CustomerSystemAccountsPage))),
  ));
  try {
    await render(true);
    assert.deepEqual(requests, ['/api/customer-system-accounts', '/api/customer-system-accounts/passwords', '/api/customer-system-accounts/passwords']);
    assert.equal(document.querySelectorAll('tbody tr[data-row-key]').length, 21);
    assert.equal(document.querySelector('.ant-pagination'), null);
    assert.match(document.body.textContent!, /名称 \/ 用途|保安室门禁/);
    assert.match(document.body.textContent!, /保安室门禁/);
    const purposeCell = document.querySelector('tr[data-row-key="fixture"] td');
    assert.equal(purposeCell?.textContent, '保安室门禁模拟公司');
    assert.doesNotMatch(document.body.textContent!, /原表待核对|条目类型/);
    const link = document.querySelector<HTMLAnchorElement>('a[href="http://portal.example.test/"]');
    assert.equal(link?.target, '_blank');
    assert.equal(link?.rel, 'noopener noreferrer');
    assert.doesNotMatch(document.body.textContent!, /HTTP|未加密/);
    assert.doesNotMatch(document.body.textContent!, /导入 Excel|登记换密/);
    assert.match(document.querySelector('table')?.textContent ?? '', /ui-test-password/);
    assert.match(document.body.textContent!, /password-fixture-20/);
    await click('复制密码');
    assert.equal(copied, 'ui-test-password');
    const search = document.querySelector<HTMLInputElement>('input[aria-label="搜索第三方账号"]');
    assert.ok(search);
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(search, '保安室');
      search.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await click('搜索');
    assert.equal(document.querySelectorAll('tbody tr[data-row-key]').length, 1);
    await click('重置');
    assert.equal(search.value, '');
    assert.equal(document.querySelectorAll('tbody tr[data-row-key]').length, 21);
    await render(false);
    assert.doesNotMatch(document.body.textContent!, /ui-test-password/);
    denied = true;
    await render(true);
    assert.match(document.body.textContent!, /无权限/);
    assert.doesNotMatch(document.body.textContent!, /0002|ui-test-password/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else Reflect.deleteProperty(navigator, 'clipboard');
    useAuthStore.setState({ user: null, initialized: false });
  }
});

test('an administrator without an explicit grant sees and can open 第三方账号密码 from the default sidebar', async () => {
  const { registerHooks } = await import('node:module');
  const hooks = registerHooks({
    load(url, context, next) {
      return url.endsWith('/PageLoader.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context);
    },
  });
  const { App: PlatformApp } = await import('../src/App.tsx');
  const { useTabStore } = await import('../src/lib/tabStore.ts');
  const originalFetch = globalThis.fetch;
  let attempt = 0;
  let submitted: Record<string, string> = {};
  globalThis.fetch = async (url, options) => {
    if (String(url) === '/api/customer-system-accounts' && options?.method === 'POST') {
      submitted = JSON.parse(String(options.body));
      attempt++;
      if (attempt === 1) return Response.json({ error: '模拟冲突' }, { status: 409 });
      return Response.json({ data: { ...submitted, password: undefined, id: 'saved', revision: 1, hasPassword: false } });
    }
    return Response.json({ data: [] });
  };
  window.history.replaceState(null, '', '/');
  useTabStore.getState().resetForAuthentication();
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(createElement(PlatformApp)));
    await act(async () => useAuthStore.setState({
      user: { ...user, role: 'admin', permissions: [] }, initialized: true,
    }));
    const entry = [...document.querySelectorAll<HTMLElement>('.ant-menu-item')]
      .find(item => item.textContent === '第三方账号密码');
    assert.ok(entry, '第三方账号密码 should be visible under the expanded 公共工具 group');
    await act(async () => entry.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
    assert.equal(window.location.pathname, '/customer-system-accounts');
    assert.match(document.querySelector('h3')?.textContent ?? '', /第三方账号密码/);
    const add = [...document.querySelectorAll('button')].find(button => button.textContent === '新增一行');
    assert.ok(add);
    await act(async () => add.click());
    assert.ok(document.querySelector('tbody input[aria-label="名称 / 用途"]'));
    const cancel = [...document.querySelectorAll('tbody button')].find(button => button.textContent?.replace(/\s/g, '') === '取消');
    assert.ok(cancel);
    await act(async () => cancel.click());
    assert.equal(document.querySelector('tbody input[aria-label="名称 / 用途"]'), null);
    await act(async () => add.click());
    const enter = async (label: string, value: string, multiLine = false) => {
      const node = document.querySelector<HTMLElement>(`tbody [aria-label="${label}"]`);
      assert.ok(node);
      const prototype = multiLine ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      await act(async () => {
        Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(node, value);
        node.dispatchEvent(new window.Event('input', { bubbles: true }));
      });
    };
    await enter('名称 / 用途', '门禁');
    await enter('当前密码', 'fixture-only-password');
    await enter('备注', '第 1 步：输入密码\n第 2 步：开门', true);
    const save = [...document.querySelectorAll('tbody button')].find(button => button.textContent?.replace(/\s/g, '') === '保存');
    assert.ok(save);
    await act(async () => save.click());
    assert.equal(submitted.note, '第 1 步：输入密码\n第 2 步：开门');
    assert.match(document.body.textContent!, /模拟冲突/);
    assert.equal(document.querySelector<HTMLInputElement>('tbody input[aria-label="名称 / 用途"]')?.value, '门禁');
    await act(async () => save.click());
    assert.equal(attempt, 2);
    assert.equal(document.querySelector('tbody input[aria-label="名称 / 用途"]'), null);
    assert.match(document.querySelector('tbody')?.textContent ?? '', /门禁/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    useAuthStore.setState({ user: null, initialized: false });
    useTabStore.getState().resetForAuthentication();
    window.history.replaceState(null, '', '/');
    hooks.deregister();
  }
});
