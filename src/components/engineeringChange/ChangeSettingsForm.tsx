import { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Select, Space, Spin } from 'antd';
import { changeApi, errorText } from '../../lib/engineeringChange';
import { Link } from 'react-router-dom';
import type { ChangePerson } from '../../lib/engineeringChange';
import type { ChangeConfig } from '../../types/engineeringChange';
import styles from './EngineeringChange.module.css';

interface Props {
  onSaved: () => void;
}

export function ChangeSettingsForm({ onSaved }: Props) {
  const [settings, setSettings] = useState<{ users: ChangePerson[]; config: ChangeConfig | null }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void changeApi.settings().then(({ data }) => {
      if (!active) return;
      setSettings(data);
    }).catch(reason => { if (active) setError(errorText(reason)); });
    return () => { active = false; };
  }, []);
  async function save(values: ChangeConfig) {
    setBusy(true);
    setError('');
    try {
      await changeApi.configure(values);
      onSaved();
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  const options = (settings?.users ?? []).map(user => ({ value: user.id, label: `${user.name}${!user.canAccess ? '（未开通工程变更）' : user.bound ? '' : '（未绑定企微）'}`, disabled: !user.canAccess }));
  return <Space orientation="vertical" className={styles.stack}>
    {error && <Alert type="error" showIcon title={error} />}
    {!settings ? !error && <Spin /> : <Form<ChangeConfig> layout="vertical"
      initialValues={{ ...settings.config, origin: settings.config?.origin || window.location.origin }}
      onFinish={values => void save(values)} disabled={busy}>
      <Form.Item name="pmc" label="默认 PMC 处理人" rules={[{ required: true }]}><Select options={options} showSearch={{ optionFilterProp: 'label' }} /></Form.Item>
      <Form.Item name="warehouse" label="默认仓库复核人" rules={[{ required: true }]}><Select options={options} showSearch={{ optionFilterProp: 'label' }} /></Form.Item>
      <Form.Item name="origin" label="企微单据链接的站点地址" rules={[{ required: true }]}>
        <Input placeholder="填写收件人能访问的平台根地址" />
      </Form.Item>
      <Alert type="info" title={<Link to="/organization">会签负责人来自员工花名册的主管职位</Link>} />
      <div className={styles.controls}><Button type="primary" htmlType="submit" loading={busy}>保存流程设置</Button></div>
    </Form>}
  </Space>;
}
