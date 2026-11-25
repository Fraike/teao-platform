import { useEffect, useRef, useState } from 'react';
import { App, Button, Modal, Space, Typography } from 'antd';
import { changeApi, errorText } from '../../lib/engineeringChange';
import type { ChangeAttachment } from '../../types/engineeringChange';
import styles from './EngineeringChange.module.css';

interface Props {
  changeId: string;
  files: ChangeAttachment[];
}

export function ChangeAttachmentList({ changeId, files }: Props) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState('');
  const [preview, setPreview] = useState<{ file: ChangeAttachment; url: string }>();
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  async function open(file: ChangeAttachment, download: boolean) {
    const controller = new AbortController();
    request.current = controller;
    setLoading(file.id + (download ? ':download' : ':preview'));
    try {
      const blob = await changeApi.attachment(changeId, file.id, controller.signal);
      controller.signal.throwIfAborted();
      const url = URL.createObjectURL(blob);
      if (!download) { setPreview({ file, url }); return; }
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      if (!controller.signal.aborted) void message.error(errorText(reason));
    } finally {
      if (!controller.signal.aborted) setLoading('');
    }
  }

  return <>
    {files.map(file => <div className={styles.attachment} key={file.id}>
      <Typography.Text className={styles.contentText}>{file.name}</Typography.Text>
      <Space size="small">
        <Button size="small" disabled={Boolean(loading)} loading={loading === file.id + ':preview'}
          onClick={() => void open(file, false)}>预览</Button>
        <Button size="small" disabled={Boolean(loading)} loading={loading === file.id + ':download'}
          onClick={() => void open(file, true)}>下载</Button>
      </Space>
    </div>)}
    {preview && <Modal title={preview.file.name} open width={900} footer={null} onCancel={() => setPreview(undefined)}>
      {preview.file.mime === 'application/pdf'
        ? <iframe title={preview.file.name} src={preview.url} className={styles.pdfPreview} />
        : <img alt={preview.file.name} src={preview.url} className={styles.imagePreview} />}
    </Modal>}
  </>;
}
