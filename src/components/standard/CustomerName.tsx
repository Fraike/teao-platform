import { Popover } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import { parseCustomerName } from "../../lib/standardFormat";
import styles from "./CustomerName.module.css";

interface CustomerNameProps {
  value: string;
}

/**
 * 客户名展示：去掉 ▲/* 符号显示干净名称；
 * 信息图标只说明汽车客户；变更由列表Tag单独展示。
 */
export function CustomerName({ value }: CustomerNameProps) {
  const { name, isAuto } = parseCustomerName(value);

  const label = <span className={styles.name}>{name || "-"}</span>;

  if (!isAuto) return label;

  return (
    <Popover
      trigger="hover"
      placement="top"
      content={
        <div className={styles.tip}>
          <div className={styles.tipTitle}>汽车客户</div>
          <div className={styles.tipDesc}>测试条件：20转/分钟（特殊除外）</div>
        </div>
      }
    >
      <span className={styles.hoverable}>
        {label}
        <InfoCircleOutlined className={styles.hint} />
      </span>
    </Popover>
  );
}
