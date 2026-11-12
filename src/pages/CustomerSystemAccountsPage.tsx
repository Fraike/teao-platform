import { useCallback, useEffect, useState } from 'react';
import { PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Input, Space, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { api, isApiError } from '../lib/api';
import { useAuthStore } from '../lib/authStore';
import { useTabBusy, useTabDirty, useTabPage } from '../lib/tabPageContext';
import { CUSTOMER_ACCOUNT_API, CUSTOMER_ACCOUNT_PAGE_SIZE, CUSTOMER_ACCOUNT_PERMISSION, CUSTOMER_ACCOUNT_TITLE, customerAccountDetails, customerAccountImportIssues, customerAccountIssues, customerAccountUrl } from '../lib/customerSystemAccount';
import type { CustomerAccount, CustomerAccountImportResult, CustomerAccountInput } from '../types/customerSystemAccount';
import { CustomerAccountChangeDialog } from '../components/customer-accounts/CustomerAccountChangeDialog';
import { CustomerAccountHistoryDialog } from '../components/customer-accounts/CustomerAccountHistoryDialog';
import { CustomerAccountImportDialog } from '../components/customer-accounts/CustomerAccountImportDialog';
import { CustomerAccountPasswordCell } from '../components/customer-accounts/CustomerAccountPasswordCell';
import { CustomerAccountSupplementalDialog } from '../components/customer-accounts/CustomerAccountSupplementalDialog';
import styles from './CustomerSystemAccountsPage.module.css';

type Dialog = { type: 'import' } |
  { type: 'password' | 'history' | 'supplemental'; account: CustomerAccount };

const newRowId = '__new__';
const blankAccount: CustomerAccount = {
  id: newRowId, company: '', url: '', username: '', note: '', revision: 0, passwordChangedAt: null,
};
const supplementalNote = '另有附加凭据';

type Draft = { account: CustomerAccount; input: CustomerAccountInput };

const accountPath = (account: CustomerAccount) => `${CUSTOMER_ACCOUNT_API}/${account.id}`;

function accountPurpose(note: string): string {
  return note.match(/^系统\/平台[:：]([^\r\n]+)/m)?.[1].trim() ?? '';
}

function accountDisplayName(value: string): string {
  return value
    .replace(/https?:\/\/(?:\[[a-f\d:.]+\]|[\w.-]+)(?::\d+)?(?:[/?#][\w.!~*'/:@&=+$,%?#-]*)?/gi, '')
    .replace(/\b(?:(?:\d{1,3}\.){3}\d{1,3}|(?:[a-z\d_-]+\.)+[a-z]{2,})(?::\d+)?(?:\/[\w./%?&=+#~-]*)?\b/gi, '')
    .replace(/\[[a-f\d:.]*:[a-f\d:.]*\](?::\d+)?|(?<![\w:])(?:[a-f\d]{0,4}:){2,7}[a-f\d]{0,4}(?![\w:])/gi, '')
    .replace(/\(\s*\)|（\s*）|\[\s*\]|【\s*】/g, '')
    .split(/\s*[·｜|]\s*/)
    .map(part => part.trim())
    .filter(Boolean)
    .join(' · ')
    .replace(/^[\s,，:：、]+|[\s,，:：、]+$/g, '');
}

export function CustomerSystemAccountsPage() {
  const { active } = useTabPage();
  const user = useAuthStore(state => state.user);
  if (!active || !user || (user.role !== 'admin' && !user.permissions.includes(CUSTOMER_ACCOUNT_PERMISSION))) return null;
  return <CustomerAccountContent key={`${user.id}:${user.role}`} admin={user.role === 'admin'} />;
}

function CustomerAccountContent({ admin }: { admin: boolean }) {
  const [accounts, setAccounts] = useState<CustomerAccount[] | null>(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [foreground, setForeground] = useState(() => !document.hidden);
  const [passwords, setPasswords] = useState<{ key: string; data: Record<string, string> | null } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState('');
  useTabDirty(draft !== null);
  useTabBusy(saving);
  const { message } = App.useApp();

  const close = () => setDialog(null);
  const handleAccessError = useCallback((error: unknown) => {
    if (!isApiError(error) || (error.status !== 401 && error.status !== 403)) return;
    setAccounts(null);
    setPasswords(null);
    setDialog(null);
    setDraft(null);
    setLoadError(error.message);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void api.get<{ data: CustomerAccount[] }>(CUSTOMER_ACCOUNT_API, { signal: controller.signal, cache: 'no-store' })
      .then(({ data }) => { if (!controller.signal.aborted) setAccounts(data); })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        handleAccessError(error);
        setLoadError(error instanceof Error ? error.message : '无法读取客户账号');
      });
    return () => controller.abort();
  }, [version, handleAccessError]);

  useEffect(() => {
    const onVisibilityChange = () => {
      setForeground(!document.hidden);
      if (document.hidden) {
        setPasswords(null);
        setDialog(null);
        setDraft(current => current ? { ...current, input: { ...current.input, password: '' } } : null);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const refresh = () => {
    setPasswords(null);
    setAccounts(null);
    setLoadError('');
    setVersion(current => current + 1);
  };

  const updateRow = (account: CustomerAccount) => {
    setAccounts(current => [account, ...(current ?? []).filter(item => item.id !== account.id)]
      .sort((a, b) => a.company.localeCompare(b.company, 'zh-CN') || a.username.localeCompare(b.username)));
    close();
  };

  const beginEdit = (account: CustomerAccount) => {
    setRowError('');
    setDraft({
      account,
      input: {
        ...customerAccountDetails(account),
        note: account.note.split('\n').filter(line => line !== supplementalNote).join('\n'),
        password: '',
      },
    });
  };

  const cancelEdit = () => {
    setDraft(null);
    setRowError('');
  };

  const save = async () => {
    if (!draft || saving) return;
    const { account } = draft;
    const input = { ...customerAccountDetails(draft.input), password: draft.input.password };
    if (account.note.split('\n').includes(supplementalNote)) {
      input.note = [input.note, supplementalNote].filter(Boolean).join('\n');
    }
    const creating = account.id === newRowId;
    const issues = creating || input.password ? customerAccountImportIssues(input, false) : customerAccountIssues(input, false);
    if (issues.length) { setRowError(issues.join('；')); return; }
    setSaving(true);
    setRowError('');
    try {
      const { data } = creating
        ? await api.post<{ data: CustomerAccount }>(CUSTOMER_ACCOUNT_API, input)
        : await api.put<{ data: CustomerAccount }>(accountPath(account), { ...input, revision: account.revision });
      updateRow(data);
      cancelEdit();
      void message.success('账号已保存');
    } catch (error) {
      handleAccessError(error);
      setRowError(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const field = (account: CustomerAccount, key: keyof CustomerAccountInput, label: string, readOnly: () => React.ReactNode) => {
    if (draft?.account.id !== account.id) return readOnly();
    const props = {
      'aria-label': label,
      value: draft.input[key],
      disabled: saving,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const value = event.target.value;
        setDraft(current => current ? { ...current, input: { ...current.input, [key]: value } } : null);
      },
    };
    if (key === 'note') return <Input.TextArea {...props} autoSize={{ minRows: 2 }} maxLength={2000} />;
    if (key === 'password') return <Input.Password {...props} autoComplete="new-password" maxLength={1024}
      placeholder={account.id === newRowId ? undefined : '留空则沿用当前密码'} />;
    return <Input {...props} autoFocus={key === 'company'} maxLength={{ company: 200, url: 2048, username: 512 }[key]} />;
  };

  const change = async (input: { password: string; reason?: string }) => {
    if (dialog?.type !== 'password') return;
    try {
      const { data } = await api.put<{ data: CustomerAccount }>(accountPath(dialog.account) + '/password', {
        ...input, revision: dialog.account.revision,
      });
      updateRow(data);
      void message.success(data.revision === dialog.account.revision ? '密码未变化' : '已登记密码变更');
    } catch (error) {
      handleAccessError(error);
      throw error;
    }
  };

  const imported = (result: CustomerAccountImportResult) => {
    close();
    refresh();
    if (result.duplicates.length) {
      void message.warning(`导入 ${result.imported} 条。原表第 ${result.duplicates.join('、')} 行已有记录，已跳过。`);
    } else void message.success(`已导入 ${result.imported} 条账号`);
  };

  const query = appliedSearch.trim().toLocaleLowerCase();
  const visible = (accounts ?? []).filter(account =>
    [account.company, account.username, account.url, accountPurpose(account.note)].some(value => value.toLocaleLowerCase().includes(query)));
  const requestKey = JSON.stringify(visible
    .filter(account => account.hasPassword !== false)
    .map(({ id, revision }) => [id, revision]));
  useEffect(() => {
    if (!foreground || requestKey === '[]') return;
    const controller = new AbortController();
    const ids = (JSON.parse(requestKey) as [string, number][]).map(([id]) => id);
    const requests = [];
    for (let start = 0; start < ids.length; start += CUSTOMER_ACCOUNT_PAGE_SIZE) {
      requests.push(api.post<{ data: Record<string, string> }>(CUSTOMER_ACCOUNT_API + '/passwords', {
        ids: ids.slice(start, start + CUSTOMER_ACCOUNT_PAGE_SIZE),
      }, { signal: controller.signal, cache: 'no-store' }));
    }
    void Promise.all(requests).then(results => {
      if (!controller.signal.aborted) setPasswords({
        key: requestKey, data: Object.assign({}, ...results.map(result => result.data)),
      });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (isApiError(error) && (error.status === 401 || error.status === 403)) handleAccessError(error);
      else setPasswords({ key: requestKey, data: null });
    });
    return () => controller.abort();
  }, [foreground, requestKey, handleAccessError]);

  const displayed = draft?.account.id === newRowId ? [blankAccount, ...visible]
    : draft && !visible.some(row => row.id === draft.account.id) ? [draft.account, ...visible] : visible;
  const columns: TableColumnsType<CustomerAccount> = [
    { title: '名称 / 用途', width: 215, render: (_, account) => field(account, 'company', '名称 / 用途', () => {
      const purpose = accountDisplayName(accountPurpose(account.note));
      const name = accountDisplayName(account.company);
      return <div className={styles.accountName}>
        <span>{purpose || name || '—'}</span>
        {purpose && name && purpose !== name &&
          <Typography.Text type="secondary">{name}</Typography.Text>}
      </div>;
    }) },
    { title: '登录网址', width: 270, render: (_, account) => field(account, 'url', '登录网址', () => {
      const url = customerAccountUrl(account.url);
      return url ? <a className={styles.url} href={url} target="_blank" rel="noopener noreferrer"
          aria-label={`打开 ${accountDisplayName(accountPurpose(account.note)) || accountDisplayName(account.company) || "登录"} 网站`}>{url}</a>
        : '—';
    }) },
    { title: '账号', width: 145, render: (_, account) => field(account, 'username', '账号',
      () => <span className={styles.username}>{account.username || '—'}</span>) },
    { title: '当前密码', width: 200, render: (_, account) => field(account, 'password', '当前密码', () => {
      if (account.hasPassword === false) return '未填写';
      if (!foreground || passwords?.key !== requestKey) return '—';
      if (!passwords.data) return '读取失败';
      const password = passwords.data[account.id];
      return password === undefined ? '—' : <CustomerAccountPasswordCell password={password} />;
    }) },
    { title: '备注', width: 250, render: (_, account) => field(account, 'note', '备注', () => {
      const lines = account.note.split('\n');
      const note = lines.filter(line => line !== supplementalNote && !/^(系统\/平台|条目类型)[:：]/.test(line)).join('\n').trim();
      return <div>
        <span className={styles.username}>{note || (lines.includes(supplementalNote) ? '' : '—')}</span>
        {lines.includes(supplementalNote) && <div><Button type="link" className={styles.inlineButton}
          disabled={!!draft} onClick={() => setDialog({ type: 'supplemental', account })}>附加凭据</Button></div>}
      </div>;
    }) },
  ];
  if (admin) columns.push({ title: '操作', width: 220, render: (_, account) => draft?.account.id === account.id
    ? <Space orientation="vertical" align="start">
      <Space>
        <Button type="primary" size="small" loading={saving} onClick={() => void save()}>保存</Button>
        <Button size="small" disabled={saving} onClick={cancelEdit}>取消</Button>
      </Space>
      {rowError && <Typography.Text type="danger" role="alert">{rowError}</Typography.Text>}
    </Space>
    : <Space wrap>
      <Button type="link" className={styles.inlineButton} disabled={!!draft} onClick={() => beginEdit(account)}>编辑</Button>
      <Button type="link" className={styles.inlineButton} disabled={!!draft} onClick={() => setDialog({ type: 'password', account })}>更新密码</Button>
      <Button type="link" className={styles.inlineButton} disabled={!!draft} onClick={() => setDialog({ type: 'history', account })}>变更记录</Button>
    </Space> });


  return <div className={styles.page}>
    <Card>
      <header className={styles.header}>
        <div>
          <Typography.Title level={3} className={styles.title}>{CUSTOMER_ACCOUNT_TITLE}</Typography.Title>
        </div>
        <Space wrap>
          <Button onClick={refresh} disabled={!!draft || (!accounts && !loadError)}>刷新</Button>
          {admin && <Button disabled={!accounts || !!draft} onClick={() => setDialog({ type: 'import' })}>导入 Excel</Button>}
        </Space>
      </header>
      {loadError ? <Alert type="error" showIcon title={loadError} /> : <>
        <div className={styles.toolbar}>
          {admin && <Button type="primary" icon={<PlusOutlined />} disabled={!accounts || !!draft}
            onClick={() => beginEdit(blankAccount)}>新增一行</Button>}
          <Input.Search className={styles.search} value={search} onChange={event => setSearch(event.target.value)}
            onSearch={value => setAppliedSearch(value)} enterButton="搜索"
            placeholder="搜索名称、用途、账号或网址" aria-label="搜索第三方账号" />
          <Button disabled={!search && !appliedSearch} onClick={() => { setSearch(''); setAppliedSearch(''); }}>重置</Button>
        </div>
        <Table size="small" rowKey="id" columns={columns} dataSource={displayed} loading={accounts === null}
          scroll={{ x: admin ? 1245 : 1005 }} locale={{ emptyText: query ? '没有匹配的账号' : '暂无第三方账号' }}
          pagination={false} />
      </>}
    </Card>
    {dialog?.type === 'supplemental' && <CustomerAccountSupplementalDialog accountId={dialog.account.id}
      onClose={close} onError={handleAccessError} />}
    {dialog?.type === 'password' && <CustomerAccountChangeDialog onClose={close} onSave={change} />}
    {dialog?.type === 'history' && <CustomerAccountHistoryDialog accountId={dialog.account.id} onClose={close} onError={handleAccessError} />}
    {dialog?.type === 'import' && <CustomerAccountImportDialog accounts={accounts ?? []}
      onClose={close} onImported={imported} onError={handleAccessError} />}
  </div>;
}
