import { useEffect, useRef, useState } from "react";
import { Button, Drawer, Empty, List, Pagination, Select, Spin, Tag } from "antd";
import { api } from "../../lib/api";
import type { StandardPendingReviewDrawerProps, StandardPendingReviewPage } from "../../types/standard";
import styles from "./StandardPendingReviewDrawer.module.css";

export function StandardPendingReviewDrawer({ open, category, scope, version, admin, onClose, onOpen }: StandardPendingReviewDrawerProps) {
  const [filter, setFilter] = useState(category);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [snapshot, setSnapshot] = useState<{ scope: string; key: string; data?: StandardPendingReviewPage; error?: string } | null>(null);
  const currentRequest = useRef<AbortController | null>(null);
  const key = `${filter}:${page}:${version}:${retry}`;
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); currentRequest.current = controller;
    const query = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (filter) query.set("category", filter);
    void api.get<StandardPendingReviewPage>(`/api/standards/pending-reviews?${query}`, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted && currentRequest.current === controller) {
        const lastPage = Math.max(1, Math.ceil(data.total / 20));
        if (page > lastPage) { setPage(lastPage); return; }
        setSnapshot({ scope, key, data });
      }
    }).catch(error => {
      if (!controller.signal.aborted && currentRequest.current === controller) setSnapshot({ scope, key, error: error instanceof Error ? error.message : "加载失败" });
    });
    return () => controller.abort();
  }, [open, scope, key, page, filter]);
  const current = snapshot?.scope === scope && snapshot.key === key ? snapshot : null;
  const options = snapshot?.scope === scope ? snapshot.data?.categories ?? [] : [];
  return <Drawer open={open} onClose={onClose} title={admin ? "全部待审事项" : "我的待审事项"} width="min(720px, 100vw)" className={styles.drawer}>
    <div className={styles.toolbar}>
      <Select aria-label="待审分类" value={filter} className={styles.filter} onChange={value => { setFilter(value); setPage(1); }}
        options={[{ value: "", label: "全部分类" }, ...options.map(item => ({ value: item.categoryKey, label: `${item.categoryName}（${item.total}）` }))]} />
      <span>{current?.data ? `当前 ${current.data.total} 项 · 全部 ${current.data.overallTotal} 项` : "加载中…"}</span>
    </div>
    <div className={styles.list}>
      {current?.error ? <div role="alert">待审清单加载失败 <Button onClick={() => setRetry(value => value + 1)}>重试</Button></div>
        : <Spin spinning={!current}><List dataSource={current?.data?.data ?? []} locale={{ emptyText: current ? <Empty description="暂无待审事项" /> : " " }}
          renderItem={item => <List.Item actions={[<Button key="open" size="small" type="primary" onClick={() => onOpen(item)}>查看 / 处理</Button>]}>
            <List.Item.Meta title={<div className={styles.title}><Tag color={item.kind === "retirement" ? "orange" : "blue"}>{item.kind === "retirement" ? "停用申请" : "标准审核"}</Tag><strong>{item.serialNo}</strong><span>{item.categoryName}</span></div>}
              description={<div className={styles.description}><span>{item.customer} · {item.model}</span>{admin && <span>审核人：{item.reviewerName}</span>}
                <span>提交于：{new Date(item.submittedAt).toLocaleString("zh-CN", { hour12: false })}</span></div>} />
          </List.Item>} /></Spin>}
    </div>
    <Pagination current={page} pageSize={20} total={current?.data?.total ?? 0} showSizeChanger={false} onChange={setPage} size="small" />
  </Drawer>;
}
