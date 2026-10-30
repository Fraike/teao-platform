import {useTabState} from "../../lib/tabPageContext";
import { Button, Popover, Tag } from "antd";
import { ClockCircleOutlined } from "@ant-design/icons";
import type { StandardPendingOverviewProps } from "../../types/standard";
import styles from "./StandardPendingOverview.module.css";

export function StandardPendingOverview({ data, loading, error, admin, onRetry, onOpen, onViewAll }: StandardPendingOverviewProps) {
  const [previewOpen, setPreviewOpen] = useTabState("standard:pending-preview",false);
  const viewAll = (category?: string) => { setPreviewOpen(false); onViewAll(category); };
  if (error) return <Button size="small" type="text" danger onClick={onRetry}>待审加载失败 · 重试</Button>;
  if (!data?.overallTotal) return null;
  const content = <section className={styles.overview} aria-label="跨分类待审概览" aria-busy={loading}>
    <div className={styles.heading}>
      <strong><ClockCircleOutlined /> {admin ? "全部待审" : "我的待审"}</strong>
      <span role="status" aria-atomic="true">共 {data.overallTotal} 项 · 涉及 {data.categories.length} 个分类</span>
      {data.categories.map(category => <Button key={category.categoryKey} size="small" className={styles.category}
        onClick={() => viewAll(category.categoryKey)}>{category.categoryName} <strong>{category.total}</strong></Button>)}
      <Button size="small" type="link" className={styles.viewAll} onClick={() => viewAll()}>查看全部</Button>
    </div>
    <div className={styles.preview}>
      {data.data.map(item => <button key={item.taskId} type="button" className={styles.item} onClick={() => { setPreviewOpen(false); onOpen(item); }}>
        <Tag color={item.kind === "retirement" ? "orange" : "blue"}>{item.kind === "retirement" ? "停用申请" : "标准审核"}</Tag>
        <span>{item.categoryName}</span><strong>{item.serialNo}</strong><span>{item.customer} · {item.model}</span>
        {admin && <span className={styles.reviewer}>审核人：{item.reviewerName}</span>}
      </button>)}
    </div>
  </section>;
  return <Popover content={content} placement="bottomRight" trigger={["hover", "focus"]} open={previewOpen} onOpenChange={setPreviewOpen} destroyOnHidden>
    <Button className={styles.trigger} icon={<ClockCircleOutlined />} onClick={() => viewAll()}
      aria-label={`${admin ? "全部待审" : "我的待审"}${data.overallTotal}项`}>
      {admin ? "全部待审" : "我的待审"}<span className={styles.number}>{data.overallTotal}</span>
    </Button>
  </Popover>;
}
