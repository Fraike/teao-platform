import {useTabState,useTabInitialEffect,useTabBusy,useTabDirty} from "../../lib/tabPageContext";
import { useRef, useState } from "react";
import { Alert, Button, Input, Popconfirm, Space, Tag, message } from "antd";
import { api } from "../../lib/api";
import { useAuthStore } from "../../lib/authStore";
import type { StandardDetail, StandardRetirementRequest } from "../../types/standard";
import styles from "./StandardRetirementPanel.module.css";

interface Props { standardId: string; versionKey: string; canRetire: boolean; onPendingChange?: (pending: boolean) => void; onChanged: (detail: StandardDetail) => void; }
const labels = { pending: "停用待审", approved: "已批准停用", rejected: "已驳回", invalidated: "已失效" };

export function StandardRetirementPanel({ standardId, versionKey, canRetire, onPendingChange, onChanged }: Props) {
  const [requests, setRequests] = useTabState<StandardRetirementRequest[]>(`standard:StandardRetirementPanel:${standardId}:requests`,[]);
  const [error, setError] = useTabState(`standard:StandardRetirementPanel:${standardId}:error`,"");
  const completionQuery = JSON.stringify([standardId,versionKey]);
  const [completedQuery,setCompletedQuery] = useTabState<string|null>(`standard:retirement:${standardId}:completion`,null);
  useTabInitialEffect(`StandardRetirementPanel:load:${standardId}`, () => {
    setCompletedQuery(null);
    const controller = new AbortController();
    api.get<{data:StandardRetirementRequest[]}>(`/api/standards/${standardId}/retirement-requests`,{signal:controller.signal})
      .then(result => { if (!controller.signal.aborted) { const next = Array.isArray(result.data) ? result.data : []; setRequests(next); setCompletedQuery(completionQuery); onPendingChange?.(next.some(request => request.status === "pending")); setError(""); } })
      .catch(() => { if (!controller.signal.aborted) setError("停用申请记录加载失败，请重新打开详情重试"); });
    return () => controller.abort();
  }, [standardId,versionKey], completedQuery===completionQuery);
  if (!requests.length && !error) return null;
  return <section className={styles.panel} aria-label="停用申请记录">
    <h4>停用申请</h4>
    {error && <Alert type="error" message={error} />}
    {requests.map(request => <RetirementCard key={`${request.id}:${request.revision}`} request={request} standardId={standardId} canRetire={canRetire}
      onReviewed={(data,updated) => { const next = requests.map(r => r.id===updated.id ? updated : r); setRequests(next); onPendingChange?.(next.some(r => r.status === "pending")); onChanged(data); }} />)}
  </section>;
}

function RetirementCard({ request, standardId, canRetire, onReviewed }: {
  request: StandardRetirementRequest; standardId:string; canRetire:boolean;
  onReviewed:(detail:StandardDetail,request:StandardRetirementRequest)=>void;
}) {
  const user = useAuthStore(state=>state.user);
  const [comment,setComment] = useTabState(`standard:StandardRetirementPanel:${standardId}:${request.id}:comment`,"");
  const [saving,setSaving] = useState(false);
  useTabBusy(saving);
  useTabDirty(!!comment.trim());
  const busy = useRef(false);
  const own = request.applicantId===user?.id;
  const designated = request.reviewerId===user?.id;
  const canHandle = request.status==="pending" && canRetire && !own && (designated || user?.role==="admin");
  const review = async (approve:boolean) => {
    if (busy.current || !canHandle || (approve && !designated) || (!approve && !comment.trim())) return;
    busy.current=true;setSaving(true);
    try {
      const result=await api.post<{data:StandardDetail;request:StandardRetirementRequest}>(`/api/standards/${standardId}/retirement-requests/${request.id}/review`,{revision:request.revision,approve,comment:comment.trim()});
      onReviewed(result.data,result.request);message.success(approve?"审核通过，标准已停用":"已驳回停用申请，标准继续生效");
    } catch(cause) {message.error(cause instanceof Error ? cause.message : "操作失败，请刷新后重试");}
    finally {busy.current=false;setSaving(false);}
  };
  return <div className={styles.item}>
    <Tag color={request.status==="pending"?"orange":"default"}>{labels[request.status]}</Tag>
    <p>申请人：{request.applicantName} · 指定审核人：{request.reviewerName}</p>
    <p className={styles.meta}>申请时间：{request.createdAt ? new Date(request.createdAt).toLocaleString("zh-CN",{hour12:false}) : "—"}{request.reviewedBy ? ` · 处理人：${request.reviewedBy}` : ""}</p>
    <p className={styles.reason}>停用原因：{request.reason}</p>
    {request.reviewComment && <p className={styles.reason}>处理意见：{request.reviewComment}</p>}
    {canHandle && <>
      <Input.TextArea aria-label="停用审核意见" value={comment} onChange={event=>setComment(event.target.value)} maxLength={2000}
        disabled={saving} placeholder="审核意见（驳回时必填）" autoSize={{minRows:2,maxRows:4}} />
      <Space className={styles.actions}>
        <Button danger disabled={saving || !comment.trim()} onClick={()=>void review(false)}>驳回停用申请</Button>
        {designated && <Popconfirm title="批准停用此标准？" description="批准后该标准不可再用于生产，完整历史保留。" onConfirm={()=>review(true)} okText="确认批准停用" cancelText="继续核对">
          <Button type="primary" danger loading={saving}>批准停用</Button>
        </Popconfirm>}
      </Space>
    </>}
  </div>;
}
