import { useEffect, useState } from 'react';
import { App, Button, Form, Modal, Space, Typography, Upload } from 'antd';
import { FilePdfOutlined, InboxOutlined } from '@ant-design/icons';
import styles from './EngineeringChange.module.css';

const imageFormats = ['image/jpeg', 'image/png', 'image/webp'];

interface Props {
  name: string;
  label: string;
  required: boolean;
  photoOnly?: boolean;
}

export function ChangeEvidenceInput({ name, label, required, photoOnly = false }: Props) {
  const formats = photoOnly ? imageFormats : [...imageFormats, 'application/pdf'];
  return <Form.Item name={name} label={label} required={required}
    rules={[{ required, message: `请上传${label}` }]}>
    <EvidenceUpload label={label} formats={formats}
      hint={photoOnly ? '照片须看清物料及报废标识 · JPG、PNG、WebP' : '金蝶截图或 PDF · JPG、PNG、WebP、PDF'} />
  </Form.Item>;
}

function EvidenceUpload({ id, label, formats, hint, value, onChange }: {
  id?: string;
  label: string;
  formats: string[];
  hint: string;
  value?: File;
  onChange?: (file: File | undefined) => void;
}) {
  const { message } = App.useApp();
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState(false);
  const pdf = value?.type === 'application/pdf';
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  return <div className={styles.evidenceCard}>
    <Upload.Dragger id={id} aria-label={label} accept={formats.join(',')} maxCount={1} showUploadList={false}
      beforeUpload={file => {
        if (!formats.includes(file.type) || file.size === 0 || file.size > 8 * 1024 * 1024) {
          void message.error(`请选择有效的${label}文件，大小不超过 8 MB`);
          return Upload.LIST_IGNORE;
        }
        setUrl(URL.createObjectURL(file));
        onChange?.(file);
        return false;
      }}>
      {value && url ? <>
        {pdf ? <FilePdfOutlined className={styles.evidenceIcon} /> : <img className={styles.evidenceThumbnail} src={url} alt={value.name} />}
        <Typography.Text className={styles.contentText}>{value.name}</Typography.Text>
        <Typography.Text type="secondary">点击或拖放替换</Typography.Text>
      </> : <>
        <InboxOutlined className={styles.evidenceIcon} />
        <Typography.Text strong>点击或拖放上传</Typography.Text>
        <Typography.Text type="secondary">{hint} · 最多 8 MB</Typography.Text>
      </>}
    </Upload.Dragger>
    {value && url && <Space>
      <Button size="small" onClick={() => setPreview(true)}>预览</Button>
      <Button size="small" type="text" onClick={() => { onChange?.(undefined); setUrl(''); }}>移除</Button>
    </Space>}
    {value && url && preview && <Modal open title={value.name} width={850} footer={null} onCancel={() => setPreview(false)}>
      {pdf ? <iframe className={styles.pdfPreview} title={value.name} src={url} />
        : <img className={styles.imagePreview} alt={value.name} src={url} />}
    </Modal>}
  </div>;
}
