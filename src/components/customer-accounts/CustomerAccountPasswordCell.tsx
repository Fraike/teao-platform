import { App, Button, Space, Typography } from 'antd';
import styles from './CustomerAccountPasswordCell.module.css';

export function CustomerAccountPasswordCell({ password }: { password: string }) {
  const { message } = App.useApp();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      void message.success('已复制密码');
    } catch {
      void message.error('无法访问剪贴板，请手动选择密码复制');
    }
  };
  return <Space wrap>
    <Typography.Text code className={styles.password}>{password}</Typography.Text>
    <Button type="link" className={styles.copy} onClick={() => void copy()}>复制密码</Button>
  </Space>;
}
