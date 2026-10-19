import { useEffect, useState } from "react";
import { Alert, App, Button, Space, message } from "antd";
import { api } from "../../lib/api";
import type { StandardPublicationDelivery } from "../../types/standard";
import styles from "./PublicationDeliveryPanel.module.css";

const LABELS: Record<StandardPublicationDelivery["status"], string> = {
  sent: "群公告已发送", queued: "群公告已保存，等待发送", sending: "群公告发送中", failed: "企业微信拒绝发送群公告",
  unknown: "群公告发送结果不确定，请先核查群记录", not_configured: "未配置企业微信群，群公告尚未发送", not_recorded: "此历史版本没有群公告发送记录",
  superseded: "已有更新的标准版本，旧公告已停止发送",
};

export function PublicationDeliveryPanel({ standardId }: { standardId: string }) {
  const { modal } = App.useApp();
  const [delivery, setDelivery] = useState<StandardPublicationDelivery | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api.get<{ data: StandardPublicationDelivery }>(`/api/standards/${standardId}/publication`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) { setDelivery(result.data); setError(""); } })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "送达记录读取失败"); });
    return () => controller.abort();
  }, [standardId, reload]);
  const retry = async (acknowledgeUncertain: boolean) => {
    if (!delivery) return;
    setLoading(true);
    try {
      const result = await api.post<{ data: StandardPublicationDelivery }>(`/api/standards/${standardId}/publication/retry`, {
        versionId: delivery.versionId, revision: delivery.revision, acknowledgeUncertain,
      });
      setDelivery(result.data);
      if (result.data.status === "sent") message.success("未确认部分已补发，群公告发送完成");
      else message.warning(LABELS[result.data.status]);
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "补发失败"); }
    finally { setLoading(false); }
  };
  const startRetry = () => {
    if (delivery?.status === "unknown") modal.confirm({ title: "请先核查企业微信群记录", content: "发送超时或服务中断时，消息可能已经到群。确认后将从未确认的部分继续，可能出现重复；不会重发已确认成功的部分。", okText: "已核查，继续发送", cancelText: "取消", onOk: () => retry(true) });
    else void retry(false);
  };
  if (error) return <Alert className={styles.panel} type="warning" message="无法读取群公告送达记录" description={error} action={<Button size="small" onClick={() => setReload(value => value + 1)}>刷新</Button>} />;
  if (!delivery) return null;
  const retryable = ["failed", "unknown", "not_configured"].includes(delivery.status);
  return <Alert className={styles.panel} type={delivery.status === "sent" ? "success" : retryable ? "warning" : "info"}
    showIcon message={LABELS[delivery.status]} description={<>
      {delivery.totalParts > 0 && <span>已确认发送 {delivery.sentParts}/{delivery.totalParts} 条。标准数据已经发布，勿再次审核来补发。</span>}
      <Space className={styles.actions}>
        <Button size="small" onClick={() => setReload(value => value + 1)}>刷新送达状态</Button>
        {retryable && <Button size="small" loading={loading} onClick={startRetry}>补发未确认部分</Button>}
      </Space>
    </>} />;
}
