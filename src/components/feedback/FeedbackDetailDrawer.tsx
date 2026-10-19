import { useEffect, useState } from "react";
import { Alert, Button, Descriptions, Drawer, Image, Input, Select, Spin, message } from "antd";
import { api } from "../../lib/api";
import { useAuthStore } from "../../lib/authStore";
import { FEEDBACK_CATEGORY_LABELS, FEEDBACK_STATUS_LABELS } from "../../types/feedback";
import type { FeedbackDetail, FeedbackStatus } from "../../types/feedback";
import styles from "./Feedback.module.css";

interface FeedbackDetailDrawerProps { id: string; onClose: () => void; onSaved: () => void; }

export function FeedbackDetailDrawer({ id, onClose, onSaved }: FeedbackDetailDrawerProps) {
  const admin = useAuthStore(state => state.user?.role === "admin");
  const [detail, setDetail] = useState<FeedbackDetail | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<FeedbackStatus>("pending");
  const [reply, setReply] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void api.get<{ data: FeedbackDetail }>(`/api/feedback/${id}`, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      setDetail(result.data); setStatus(result.data.status); setReply(result.data.reply);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "加载失败"); });
    return () => controller.abort();
  }, [id]);
  const save = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await api.put<{ data: FeedbackDetail }>(`/api/feedback/${id}`, { status, reply, revision: detail.revision });
      setDetail(result.data); message.success("处理进度已更新"); onSaved();
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "保存失败"); }
    finally { setSaving(false); }
  };
  return <Drawer title="反馈详情" open onClose={onClose} width={640}>
    {error ? <Alert type="error" message={error} /> : !detail ? <Spin /> : <>
      <Descriptions column={1} size="small" bordered items={[
        { key: "type", label: "反馈类型", children: FEEDBACK_CATEGORY_LABELS[detail.category] },
        { key: "owner", label: "提交人", children: detail.createdBy },
        { key: "time", label: "提交时间", children: new Date(detail.createdAt).toLocaleString("zh-CN", { hour12: false }) },
        { key: "page", label: "所在页面", children: `${detail.pageTitle} · ${detail.pagePath}` },
        { key: "description", label: "问题或建议", children: <div className={styles.description}>{detail.description}</div> },
      ]} />
      {detail.screenshots.length > 0 && <section className={styles.section}><h4>截图</h4><Image.PreviewGroup>
        <div className={styles.screenshots}>{detail.screenshots.map(image => <Image key={image.id} src={image.dataUrl} alt={image.name} />)}</div>
      </Image.PreviewGroup></section>}
      <section className={styles.section}><h4>处理进度</h4>
        {admin ? <>
          <Select aria-label="处理状态" className={styles.statusFilter} value={status} onChange={setStatus}
            options={Object.entries(FEEDBACK_STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
          <Input.TextArea className={styles.reply} aria-label="处理说明" placeholder="填写处理说明" value={reply} onChange={event => setReply(event.target.value)} maxLength={2000} autoSize={{ minRows: 3, maxRows: 8 }} />
          <Button type="primary" loading={saving} onClick={() => void save()}>保存处理结果</Button>
        </> : <><p>{FEEDBACK_STATUS_LABELS[detail.status]}</p><div className={styles.description}>{detail.reply || "暂无处理说明"}</div></>}
        {detail.handledBy && <p className={styles.handler}>最后处理：{detail.handledBy} · {new Date(detail.updatedAt).toLocaleString("zh-CN", { hour12: false })}</p>}
      </section>
    </>}
  </Drawer>;
}
