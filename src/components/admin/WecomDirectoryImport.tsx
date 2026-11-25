import { useRef, useState } from 'react';
import { Button, Modal, Typography, message } from 'antd';
import { api } from '../../lib/api';
import { readWecomDirectoryExcel } from '../../lib/wecomDirectoryImport';
import { useTabBusy, useTabPage } from '../../lib/tabPageContext';
import type { WecomDirectoryMember, WecomDirectoryImportSummary } from '../../types/wecomDirectory';

export function WecomDirectoryImport({ onImported }: { onImported?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const tab = useTabPage();
  const [preview, setPreview] = useState<{ members: WecomDirectoryMember[]; summary: WecomDirectoryImportSummary }>();
  const [loading, setLoading] = useState(false);
  useTabBusy(loading);

  async function read(file: File) {
    if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      message.error('请选择 5 MB 以内的企微通讯录 XLSX 文件');
      return;
    }
    setLoading(true);
    try {
      const members = await readWecomDirectoryExcel(await file.arrayBuffer());
      const { data: summary } = await api.post<{ data: WecomDirectoryImportSummary }>('/api/admin/wecom-directory/preview', { members });
      setPreview({ members, summary });
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '读取通讯录失败');
    } finally { setLoading(false); }
  }

  async function save() {
    if (!preview) return;
    setLoading(true);
    try {
      const { data } = await api.put<{ data: WecomDirectoryImportSummary }>('/api/admin/wecom-directory', { members: preview.members, bindingRevision: preview.summary.bindingRevision });
      message.success(`已导入 ${data.count} 个企微账号，补填 ${data.fillable} 人`);
      setPreview(undefined);
      onImported?.();
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '保存通讯录失败');
      setPreview(undefined);
    } finally { setLoading(false); }
  }

  return <>
    <input hidden type="file" accept=".xlsx" ref={input} onChange={event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) void read(file);
    }} />
    <Button size="small" loading={loading} onClick={() => input.current?.click()}>导入企微通讯录</Button>
    <Modal title="更新企微通讯录" open={!!preview} getContainer={tab.container ?? undefined}
      confirmLoading={loading} okText="确认导入" cancelText="取消"
      onOk={() => void save()} onCancel={() => { if (!loading) setPreview(undefined); }}>
      {preview && <>
        <Typography.Paragraph>读取到 {preview.summary.count} 个可用企微账号，可补填 {preview.summary.fillable} 人，已有账号一致 {preview.summary.unchanged} 人。</Typography.Paragraph>
        {preview.summary.conflicts.length > 0 && <details>
          <summary>{preview.summary.conflicts.length} 条待核对，已跳过</summary>
          <ul>{preview.summary.conflicts.map(row => <li key={row.name}>{row.name} · {row.reason}</li>)}</ul>
        </details>}
        {preview.summary.invalidRows > 0 &&
          <Typography.Paragraph type="warning">有 {preview.summary.invalidRows} 条无法用于企微绑定，姓名及部门齐全的条目仍用于组织核对。</Typography.Paragraph>}
        {preview.summary.ambiguousNames + preview.summary.ambiguousIds > 0 &&
          <Typography.Paragraph type="warning">重名 {preview.summary.ambiguousNames} 组，重复账号 {preview.summary.ambiguousIds} 组，这些条目需人工核对。</Typography.Paragraph>}
      </>}
    </Modal>
  </>;
}
