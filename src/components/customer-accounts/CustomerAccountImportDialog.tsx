import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Modal, Space, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { api } from '../../lib/api';
import { CUSTOMER_ACCOUNT_API, CUSTOMER_ACCOUNT_TITLE, customerAccountIdentity } from '../../lib/customerSystemAccount';
import type { CustomerAccountPreviewRow } from '../../lib/customerAccountImport';
import type { CustomerAccount, CustomerAccountImportResult } from '../../types/customerSystemAccount';
import { CustomerAccountEditDialog } from './CustomerAccountEditDialog';

interface CustomerAccountImportDialogProps {
  accounts: CustomerAccount[];
  onClose: () => void;
  onImported: (result: CustomerAccountImportResult) => void;
  onError: (error: unknown) => void;
}

export function CustomerAccountImportDialog({ accounts, onClose, onImported, onError }: CustomerAccountImportDialogProps) {
  const [rows, setRows] = useState<CustomerAccountPreviewRow[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [editing, setEditing] = useState<CustomerAccountPreviewRow | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);

  const existing = useMemo(() => new Set(accounts.map(customerAccountIdentity)), [accounts]);
  const counts = useMemo(() => {
    const found = new Map<string, number>();
    for (const row of rows) {
      if (row.errors.length) continue;
      const key = customerAccountIdentity(row.account);
      found.set(key, (found.get(key) ?? 0) + 1);
    }
    return found;
  }, [rows]);
  const selectedSet = new Set(selected);
  const selectedRows = rows.filter(row => selectedSet.has(row.rowNumber));
  const selectedKeys = new Set(selectedRows.map(row => customerAccountIdentity(row.account)));
  const selectedHasDuplicate = selectedKeys.size !== selectedRows.length;
  const pending = rows.filter(row => row.errors.length || row.reviews.length ||
    existing.has(customerAccountIdentity(row.account)) || (counts.get(customerAccountIdentity(row.account)) ?? 0) > 1).length;

  const read = async (file: File) => {
    const signal = lifetime.current?.signal;
    setError('');
    setRows([]);
    setSelected([]);
    setReading(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('文件不能超过 5 MB');
      const { parseCustomerAccountWorkbook } = await import('../../lib/customerAccountImport');
      const result = await parseCustomerAccountWorkbook(await file.arrayBuffer());
      if (!signal?.aborted) setRows(result);
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : '无法读取 Excel');
    } finally {
      if (!signal?.aborted) setReading(false);
    }
  };

  const save = async () => {
    const signal = lifetime.current?.signal;
    setError('');
    setSaving(true);
    try {
      const { data } = await api.post<{ data: CustomerAccountImportResult }>(CUSTOMER_ACCOUNT_API + '/import', {
        rows: selectedRows.map(({ rowNumber, account }) => ({ rowNumber, account })),
      }, { signal });
      if (!signal?.aborted) onImported(data);
    } catch (err) {
      if (!signal?.aborted) {
        onError(err);
        setError(err instanceof Error ? err.message : '导入失败');
      }
    } finally {
      if (!signal?.aborted) setSaving(false);
    }
  };

  const columns: TableColumnsType<CustomerAccountPreviewRow> = [
    { title: '原表行号', dataIndex: 'rowNumber', width: 90 },
    { title: '公司名称', render: (_, row) => row.account.company || '—', width: 180 },
    { title: '网址', render: (_, row) => row.account.url || '—', width: 220, ellipsis: true },
    { title: '账号', render: (_, row) => row.account.username || '—', width: 130, ellipsis: true },
    { title: '密码', render: (_, row) => row.account.password ? '••••••••' : '—', width: 90 },
    { title: '核对项', render: (_, row) => {
      const identity = customerAccountIdentity(row.account);
      const issues = [...row.errors, ...row.reviews];
      if (existing.has(identity)) issues.push('后台已有此账号');
      if ((counts.get(identity) ?? 0) > 1) issues.push('表内重复，只能选一条');
      return issues.length ? <Typography.Text type="warning">{issues.join('；')}</Typography.Text> : <Tag color="green">可导入</Tag>;
    } },
    { title: '操作', width: 90, render: (_, row) =>
      <Button type="link" disabled={saving} onClick={() => setEditing(row)}>核对</Button> },
  ];
  return <>
    <Modal open title={`导入${CUSTOMER_ACCOUNT_TITLE}`} width={1120} onCancel={onClose} okText="导入所选记录"
      cancelText="取消" onOk={() => void save()} confirmLoading={saving}
      okButtonProps={{ disabled: reading || !selectedRows.length || selectedHasDuplicate }}>
      <Space orientation="vertical" size="middle">
        <input type="file" accept=".xlsx" aria-label="选择客户账号 Excel 文件" disabled={reading || saving}
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void read(file);
          }} />
        <Typography.Text type="secondary">先按原表行号核对异常，再勾选需要导入的记录。已有记录会保留。</Typography.Text>
        {error && <Alert type="error" showIcon title={error} />}
        {selectedHasDuplicate && <Alert type="warning" showIcon title="所选记录中有重复账号，请只保留其中一条" />}
        {rows.length > 0 && <Typography.Text>{rows.length} 条记录 · {pending} 条需核对 · 已选 {selected.length} 条</Typography.Text>}
      </Space>
      <Table size="small" rowKey="rowNumber" columns={columns} dataSource={rows} loading={reading} scroll={{ x: 1020 }}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: keys => setSelected(keys.map(Number)),
          getCheckboxProps: row => ({
            disabled: saving || !!row.errors.length || !!row.reviews.length || existing.has(customerAccountIdentity(row.account)),
          }),
        }} />
    </Modal>
    {editing && <CustomerAccountEditDialog title={`核对原表第 ${editing.rowNumber} 行`} initial={editing.account}
      reviews={editing.reviews} includePassword requireLoginFields onClose={() => setEditing(null)}
      onSave={account => {
        setRows(current => current.map(row => row.rowNumber === editing.rowNumber
          ? { ...row, account, errors: [], reviews: [], duplicate: false } : row));
        setSelected(current => current.filter(row => row !== editing.rowNumber));
        setEditing(null);
      }} />}
  </>;
}
