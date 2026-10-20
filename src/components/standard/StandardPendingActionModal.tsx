import { useEffect, useRef, useState } from "react";
import { Alert, Checkbox, Input, Modal, message } from "antd";
import { api } from "../../lib/api";
import type { StandardDetail, StandardPendingActionTarget, StandardReviewResponse, StandardVersion } from "../../types/standard";

interface StandardPendingActionModalProps {
  target: StandardPendingActionTarget;
  onClose: () => void;
  onCompleted: (detail: StandardDetail) => void;
}

export function StandardPendingActionModal({ target, onClose, onCompleted }: StandardPendingActionModalProps) {
  const deleting = target.action === "delete";
  const label = deleting ? "删除" : "驳回";
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [version, setVersion] = useState<StandardVersion | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    let disposed = false;
    api.get<{ data: StandardDetail }>(`/api/standards/${target.id}?summary=true`)
      .then(({ data }) => {
        if (disposed) return;
        const latest = [...data.versions].sort((a, b) => b.versionNo - a.versionNo)[0];
        if (!latest || latest.versionNo !== target.versionNo || latest.id !== target.versionId || latest.revision !== target.revision) setError("标准版本已变化，请关闭后刷新列表重试。");
        else if (latest.status !== "pending_review") setError("该内容已不在待审核状态，请刷新后查看。");
        else setVersion(latest);
      }).catch(() => { if (!disposed) setError("加载失败，请关闭弹窗后重试。"); });
    return () => { disposed = true; };
  }, [target.id, target.versionNo, target.versionId, target.revision]);

  const submit = async () => {
    if (!version || error || !reason.trim() || (deleting && !confirmed) || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    try {
      const expected = { versionId: version.id, revision: version.revision };
      const result = await api.post<StandardReviewResponse>(`/api/standards/${target.id}/${deleting ? "discard" : "review"}`,
        deleting ? { ...expected, reason: reason.trim() } : { ...expected, approve: false, comment: reason.trim() });
      onCompleted(result.data);
      onClose();
      if (deleting) message.success("待审内容已删除并归档，已发布版本与历史记录保留");
      else if (result.notification?.status === "sent" && result.notification.mentionedSubmitter) message.success("已驳回并通知提交人");
      else if (result.notification?.status === "sent") message.warning("已驳回并发送群通知；提交人未绑定企微，未能 @ 本人");
      else message.warning("已驳回并退回草稿；提交人通知未确认送达，请核查群记录或通知配置");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${label}失败，请刷新后重试`);
    } finally { submitting.current = false; setSaving(false); }
  };

  return <Modal open title={`管理员${label} · ${target.serialNo}`} okText={`确认${label}`} cancelText="取消"
    okButtonProps={{ danger: true, disabled: !version || Boolean(error) || !reason.trim() || (deleting && !confirmed) }}
    confirmLoading={saving} closable={!saving} maskClosable={!saving} keyboard={!saving}
    cancelButtonProps={{ disabled: saving }} onCancel={() => { if (!submitting.current) onClose(); }} onOk={() => void submit()}>
    <p>{deleting ? "只删除本次待审内容；已有生效版本继续生效，参数、批注与操作记录保留归档。" : "管理员可介入驳回，内容将退回草稿，提交人修改后可重新提交。"}</p>
    {error && <Alert type="error" showIcon message={error} />}
    <Input.TextArea aria-label={`${label}原因`} placeholder={`请填写${label}原因（必填）`} maxLength={2000}
      showCount value={reason} disabled={saving} autoSize={{ minRows: 3, maxRows: 6 }} onChange={event => setReason(event.target.value)} />
    {deleting && <p><Checkbox checked={confirmed} disabled={saving} onChange={event => setConfirmed(event.target.checked)}>
      我确认删除待审内容，并保留已发布版本和历史记录
    </Checkbox></p>}
  </Modal>;
}
