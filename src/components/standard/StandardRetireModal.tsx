import {useTabState,useTabInitialEffect,useTabPage,useTabBusy,useTabDirty} from "../../lib/tabPageContext";
import styles from "./StandardRetireModal.module.css";
import { useId, useRef, useState } from "react";
import { Alert, Input, Modal, Select, message } from "antd";
import { api } from "../../lib/api";
import type { StandardDetail, StandardRetireTarget, StandardVersion } from "../../types/standard";

interface StandardRetireModalProps {
  direct?: boolean;
  target: StandardRetireTarget;
  onClose: () => void;
  onRetired: (detail: StandardDetail) => void;
}

export function StandardRetireModal({ target, direct = true, onClose, onRetired }: StandardRetireModalProps) {
  const tab=useTabPage();
  const [reviewers, setReviewers] = useTabState<{id:string;name:string}[]>(`standard:StandardRetireModal:${target.id}:reviewers`,[]);
  const [reviewerId, setReviewerId] = useTabState<string|undefined>(`standard:StandardRetireModal:${target.id}:reviewerId`,undefined);
  const [reason, setReason] = useTabState(`standard:StandardRetireModal:${target.id}:reason`,"");
  const [version, setVersion] = useTabState<StandardVersion | null>(`standard:StandardRetireModal:${target.id}:version`,null);
  const [error, setError] = useTabState(`standard:StandardRetireModal:${target.id}:error`,"");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const reasonCountId = useId();

  const completionQuery = JSON.stringify([target.id, target.versionNo, target.versionId, target.revision, direct]);
  const [completedQuery,setCompletedQuery] = useTabState<string|null>(`standard:StandardRetireModal:${target.id}:completion`,null);
  useTabBusy(saving);
  useTabDirty(!!reason.trim());
  useTabInitialEffect(`StandardRetireModal:load:${target.id}`, () => {
    setCompletedQuery(null);
    let disposed = false;
    Promise.all([
      api.get<{ data: StandardDetail }>(`/api/standards/${target.id}?summary=true`),
      direct ? Promise.resolve({data:[]}) : api.get<{data:{id:string;name:string}[]}>("/api/standards/retirement-reviewers"),
    ]).then(([{ data }, people]) => {
        if (disposed) return;
        setReviewers(people.data);
        const latest = [...data.versions].sort((a, b) => b.versionNo - a.versionNo)[0];
        if (!latest || latest.versionNo !== target.versionNo) setError("标准版本已变化，请关闭弹窗并刷新列表后重试。");
        else if (latest.status !== "published") setError("只能停用已发布且没有修订稿的标准，请先处理修订稿。");
        else if (latest.id !== target.versionId || latest.revision !== target.revision) setError("标准版本已变化，请关闭并刷新后重试。");
        else setVersion(latest);
      })
      .catch(() => { if (!disposed) setError("标准加载失败，请关闭弹窗后重试。"); })
      .finally(() => { if (!disposed) setCompletedQuery(completionQuery); });
    // Existing error results are terminal for this exact target query too.
    return () => { disposed = true; };
  }, [target.id, target.versionNo, target.versionId, target.revision, direct], completedQuery===completionQuery);

  const retire = async () => {
    if (!version || error || !reason.trim() || (!direct && !reviewerId) || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    try {
      const { data, notification } = await api.post<{ data: StandardDetail; notification?: {status:string;mentionedReviewer?:boolean} }>(`/api/standards/${target.id}/${direct ? "retire" : "retirement-requests"}`, {
        versionId: version.id, revision: version.revision, reason: reason.trim(), ...(!direct ? { reviewerId } : {}),
      });
      onRetired(data);
      onClose();
      if (direct) message.success("标准已停用，历史已保留");
      else if (notification?.status === "sent" && notification.mentionedReviewer) message.success("停用申请已提交并提醒审核人，当前标准继续生效");
      else message.warning("停用申请已提交，当前标准继续生效；群提醒或 @ 送达未确认，请核查通知配置");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "停用失败，请刷新后重试");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  return <Modal getContainer={tab.container ?? undefined} open title={`${direct ? "停用标准" : "申请停用"} · ${target.serialNo}`} okText={direct ? "确认停用" : "提交申请"} cancelText="取消"
    okButtonProps={{ danger: true, disabled: !version || Boolean(error) || !reason.trim() || (!direct && !reviewerId) }}
    confirmLoading={saving} closable={!saving} maskClosable={!saving} keyboard={!saving}
    cancelButtonProps={{ disabled: saving }} onCancel={() => { if (!submitting.current) onClose(); }} onOk={() => void retire()}>
    <p>{direct ? "停用后不可用于生产，完整属性、历史版本与批注仍会保留。" : "选择一位有直接停用权限的审核人；审核通过前，当前标准继续生效。"}</p>
    {error && <Alert className={styles.feedback} type="error" showIcon message={error} />}
    {!direct && <Select className={styles.reviewerSelect} aria-label="停用审核人" placeholder="请选择停用审核人" value={reviewerId} onChange={setReviewerId}
      showSearch optionFilterProp="label" disabled={saving} options={reviewers.map(person=>({value:person.id,label:person.name}))} />}
    {!direct && !reviewers.length && <p>暂无可选审核人，请联系管理员。</p>}
    <Input.TextArea aria-label="停用原因" aria-describedby={reasonCountId} placeholder="请填写停用原因（必填）" value={reason}
      maxLength={2000} disabled={saving} autoSize={{ minRows: 3, maxRows: 6 }}
      onChange={event => setReason(event.target.value)} />
    <div id={reasonCountId} className={styles.reasonCount}>{reason.length} / 2000</div>
  </Modal>;
}
