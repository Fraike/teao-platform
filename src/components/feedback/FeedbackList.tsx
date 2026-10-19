import { useEffect, useState } from "react";
import { Button, Empty, Select, Space, Table, Tag, message } from "antd";
import { api } from "../../lib/api";
import { FEEDBACK_CATEGORY_LABELS, FEEDBACK_STATUS_LABELS } from "../../types/feedback";
import type { FeedbackItem, FeedbackPage, FeedbackStatus } from "../../types/feedback";
import { FeedbackDetailDrawer } from "./FeedbackDetailDrawer";
import styles from "./Feedback.module.css";

export function FeedbackList({ scope }: { scope: "mine" | "all" }) {
  const [status, setStatus] = useState<FeedbackStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [snapshot, setSnapshot] = useState<FeedbackPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void api.get<FeedbackPage>(`/api/feedback?scope=${scope}&status=${status}&page=${page}&pageSize=10`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setSnapshot(result); })
      .catch(error => { if (!controller.signal.aborted) { setSnapshot(null); message.error(error instanceof Error ? error.message : "查询失败"); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [scope, status, page, reload]);
  const refresh = () => { setLoading(true); setReload(value => value + 1); };
  return <>
    <Space className={styles.listToolbar}>
      <Select aria-label="反馈状态筛选" className={styles.statusFilter} value={status} onChange={value => { setLoading(true); setStatus(value); setPage(1); }}
        options={[{ value: "all", label: "全部状态" }, ...Object.entries(FEEDBACK_STATUS_LABELS).map(([value, label]) => ({ value, label }))]} />
      <Button onClick={refresh}>刷新</Button>
    </Space>
    <Table<FeedbackItem> size="small" rowKey="id" loading={loading} dataSource={snapshot?.data || []} scroll={{ x: 650 }}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无反馈" /> }}
      pagination={{ current: page, pageSize: 10, total: snapshot?.total || 0, showSizeChanger: false, onChange: value => { setLoading(true); setPage(value); } }}
      columns={[
        { title: "类型", dataIndex: "category", width: 90, render: (value: FeedbackItem["category"]) => FEEDBACK_CATEGORY_LABELS[value] },
        { title: "问题或建议", dataIndex: "description", ellipsis: true },
        { title: "页面", dataIndex: "pageTitle", width: 100, ellipsis: true },
        ...(scope === "all" ? [{ title: "提交人", dataIndex: "createdBy", width: 90 }] : []),
        { title: "状态", dataIndex: "status", width: 90, render: (value: FeedbackStatus) => <Tag color={value === "resolved" ? "green" : value === "processing" ? "blue" : "orange"}>{FEEDBACK_STATUS_LABELS[value]}</Tag> },
        { title: "提交时间", dataIndex: "createdAt", width: 150, render: (value: string) => new Date(value).toLocaleString("zh-CN", { hour12: false }) },
        { title: "操作", width: 65, render: (_: unknown, item) => <Button type="link" size="small" onClick={() => setSelected(item.id)}>查看</Button> },
      ]} />
    {selected && <FeedbackDetailDrawer key={selected} id={selected} onClose={() => setSelected(null)} onSaved={refresh} />}
  </>;
}
