import { groupStandardFields, activeStandardFields } from "../../lib/standardFieldGroups";
import { SeasonalTestStandard } from "./SeasonalTestStandard";
import { StandardTestHistory } from "./StandardTestHistory";
import { GearSpecification } from "./GearSpecification";
import { useEffect, useMemo, useState } from "react";
import { Drawer, Descriptions, Tag, Space, Button, Input, message, Popconfirm, Empty, Spin, Alert, Table, Select } from "antd";
import { useAuthStore } from "../../lib/authStore";
import { standardVersionDiff } from "../../lib/standardVersionDiff";
import { api } from "../../lib/api";
import { standardStatusColor as statusColor } from "../../lib/standardFormat";
import { CustomerName } from "./CustomerName";
import { PublicationDeliveryPanel } from "./PublicationDeliveryPanel";
import type { StandardCategory, StandardDetail, StandardVersion, StandardReviewResponse } from "../../types/standard";
import { STANDARD_STATUS_LABELS, STANDARD_TYPE_LABELS, STANDARD_TYPE_COLORS } from "../../types/standard";
import styles from "./StandardDetailDrawer.module.css";

interface StandardDetailDrawerProps {
  open: boolean;
  standardId: string | null;
  categories: StandardCategory[];
  canEdit: boolean;
  allowDirectEdit?: boolean;
  canReview: boolean;
  onClose: () => void;
  onChanged: (detail: StandardDetail) => void;
  onEdit: (detail: StandardDetail) => void;
}

export function StandardDetailDrawer({
  open,
  standardId,
  categories,
  canEdit,
  allowDirectEdit = false,
  canReview,
  onClose,
  onChanged,
  onEdit,
}: StandardDetailDrawerProps) {
  const user = useAuthStore(s => s.user);
  const [detail, setDetail] = useState<StandardDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewers, setReviewers] = useState<{id:string;name:string}[]>([]);
  const [reviewerId, setReviewerId] = useState<string>();
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!open || !standardId) return;
    let disposed = false;
    queueMicrotask(() => { if (!disposed) { setDetail(null); setReviewComment(""); setLoading(true); } });
    Promise.all([
      api.get<{ ok: boolean; data: StandardDetail }>(`/api/standards/${standardId}?summary=true`),
      api.get<{ok:boolean;data:{id:string;name:string}[]}>("/api/standards/reviewers"),
    ]).then(([res,list]) => { if (!disposed) { setDetail(res.data); setReviewers(list.data); setReviewerId(undefined); } })
      .catch((err) => { if (!disposed) message.error((err as Error).message || "加载详情失败"); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [open, standardId]);

  const category = useMemo(
    () => categories.find((c) => c.key === detail?.categoryKey),
    [categories, detail]
  );

  // 展示版本：工作版本（草稿/待审核）优先，其次已发布，最后最新一条
  const current = useMemo<StandardVersion | null>(() => {
    if (!detail) return null;
    return (
      detail.versions.find((v) => v.status === "draft" || v.status === "pending_review") ||
      detail.versions.find((v) => v.status === "published") ||
      detail.versions[0] ||
      null
    );
  }, [detail]);

  // 最后更新时间：已发布看发布时间，草稿/待审核看最后编辑时间
  const lastUpdatedAt = current ? (current.publishedAt || current.updatedAt || current.createdAt) : "";
  const lastUpdatedBy = current
    ? (current.status === "published" ? current.reviewedBy : current.updatedBy) || current.createdBy
    : "";

  const submit = async () => {
    if (!detail || !current) return;
    if (!reviewerId) { message.error("请选择审核人"); return; }
    setActing(true);
    try {
      const res = await api.post<{ ok: boolean; data: StandardDetail }>(`/api/standards/${detail.id}/submit`, { versionId: current.id, revision: current.revision, reviewerId });
      setDetail(res.data);
      onChanged(res.data);
      message.success("已提交审核");
    } catch (err) {
      message.error((err as Error).message || "提交失败");
    } finally {
      setActing(false);
    }
  };

  const review = async (approve: boolean) => {
    if (!detail || !current) return;
    setActing(true);
    try {
      const res = await api.post<StandardReviewResponse>(`/api/standards/${detail.id}/review`, {
        approve,
        versionId: current.id,
        revision: current.revision,
        comment: reviewComment.trim(),
      });
      setDetail(res.data);
      onChanged(res.data);
      setReviewComment("");
      if (res.notification?.status === "sent" && !approve && !res.notification.mentionedSubmitter) message.warning("已驳回并发送群通知；提交人未绑定企微账号，未能 @ 到本人");
      else if (res.notification?.status === "sent") message.success(approve ? "审核通过，完整标准已发布到群并 @所有人" : "已驳回并 @ 提交人");
      else if (res.notification?.status === "not_configured") message.warning(approve ? "审核已通过，系统标准已生效；尚未配置企业微信群，未发送群公告" : "已驳回；尚未配置企业微信群，未发送提醒");
      else if (res.notification?.status === "queued" || res.notification?.status === "sending") message.info("标准已发布，群公告已入队；可在详情中查看送达状态");
      else if (res.notification) message.warning(`审核${approve ? "通过" : "驳回"}已保存；群消息${res.notification.status === "unknown" ? "发送结果不确定，请先核查群记录" : "发送失败"}（已确认 ${res.notification.sentParts}/${res.notification.totalParts} 条）`);
      else message.success(approve ? "审核通过，标准已发布" : "已驳回");
    } catch (err) {
      message.error((err as Error).message || "审核失败");
    } finally {
      setActing(false);
    }
  };

  const legacyPending = current?.status === "pending_review" && !current.submittedById;
  const retire = async () => {
    if (!detail || !current || !reviewComment.trim()) return;
    setActing(true);
    try {
      const res = await api.post<{ok:boolean;data:StandardDetail}>(`/api/standards/${detail.id}/retire`,{versionId:current.id,revision:current.revision,reason:reviewComment.trim()});
      setDetail(res.data);onChanged(res.data);setReviewComment("");message.success("标准已停用，历史已保留");
    } catch(error) {message.error((error as Error).message || "停用失败");}
    finally {setActing(false);}
  };

  const canSubmit = canEdit && (current?.status === "draft" || legacyPending);
  const isSubmitter = current?.submittedById ? current.submittedById === user?.id : current?.submittedBy === (user?.name || user?.username);
  const isDesignated = current?.assignedReviewerId ? current.assignedReviewerId === user?.id : canReview;
  const canReviewThis = isDesignated && !legacyPending && !isSubmitter && current?.status === "pending_review";
  const published = detail?.versions.find(v => v.status === "published") ?? null;
  const differences = current ? standardVersionDiff(published, current, categories) : [];

  return (
    <Drawer
      title={canReviewThis ? "审核产品标准" : "产品标准详情"}
      open={open}
      onClose={onClose}
      width={640}
      footer={
        <Space wrap className={canReviewThis ? styles.reviewFooter : undefined}>
          <Button onClick={onClose}>关闭</Button>
          {canEdit && (current?.status === "draft" || current?.status === "published" || (allowDirectEdit && current?.status === "pending_review")) && (
            <Button onClick={() => detail && onEdit(detail)}>编辑</Button>
          )}
          {canReview && current?.status === "published" && <Popconfirm title="停用此标准？" description="停用后不再作为当前生产标准，历史版本与批注仍保留。" onConfirm={retire} okText="停用" cancelText="取消"><Button danger loading={acting} disabled={!reviewComment.trim()}>停用标准</Button></Popconfirm>}
          {canSubmit && (
            <><Select className={styles.reviewerSelect} placeholder="选择审核人" showSearch optionFilterProp="label" value={reviewerId} onChange={setReviewerId}
              options={reviewers.map(person=>({value:person.id,label:person.name}))} />
            <Button type="primary" loading={acting} onClick={submit}>
              {legacyPending ? "重新提交审核" : "提交审核"}
            </Button></>
          )}
          {canReviewThis && (
            <>
              <Popconfirm
                title="驳回该标准？"
                description="驳回后回到草稿状态，需填写驳回意见。"
                onConfirm={() => review(false)}
                okText="驳回"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button danger loading={acting} disabled={!reviewComment.trim()}>
                  驳回
                </Button>
              </Popconfirm>
              <Popconfirm title="确认通过并发布到企业微信群？" description="将发送完整标准内容并 @所有人，请先核对参数和变更。" okText="确认通过并发布" cancelText="继续核对" onConfirm={() => review(true)}>
                <Button type="primary" size="large" loading={acting}>通过并发布到群</Button>
              </Popconfirm>
            </>
          )}
        </Space>
      }
    >
      {current?.status === "pending_review" && current.assignedReviewerName && <Alert type="info" message={`指定审核人：${current.assignedReviewerName}`} />}
      {canReviewThis && <Alert className={styles.reviewTask} type="warning" showIcon message="待你审核，请核对完整标准和变更对比" description="核对后在底部选择“通过并发布到群”；需修改时填写意见并驳回。" />}
      {loading ? (
        <Spin size="large" />
      ) : !detail || !current ? (
        <Empty description="标准不存在或无权查看" />
      ) : (
        <>
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="序号">{detail.serialNo}</Descriptions.Item>
            <Descriptions.Item label="分类">{detail.categoryName}</Descriptions.Item>
            <Descriptions.Item label="客户">
              <CustomerName value={current.customer} />
            </Descriptions.Item>
            {detail.categoryKey !== "sanitary_damper" && <Descriptions.Item label="项目代号">{current.vehicleModel || "-"}</Descriptions.Item>}
            <Descriptions.Item label="型号">{current.model || "-"}</Descriptions.Item>
            {detail.categoryKey !== "sanitary_damper" && <Descriptions.Item label="客户料号">{current.customerPartNo || "-"}</Descriptions.Item>}
            <Descriptions.Item label="当前版本">V{current.versionNo}</Descriptions.Item>
            <Descriptions.Item label="标准性质">
              <Tag color={STANDARD_TYPE_COLORS[current.standardType]}>
                {STANDARD_TYPE_LABELS[current.standardType]}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusColor(current.status)}>{STANDARD_STATUS_LABELS[current.status]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="最后更新" span={2}>
              {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString("zh-CN", { hour12: false }) : "-"}
              {lastUpdatedBy ? ` · ${lastUpdatedBy}` : ""}
            </Descriptions.Item>
          </Descriptions>

          {current.reviewComment && current.status === "draft" && (
            <Alert className={styles.reviewComment} type="warning" showIcon message="审核驳回意见" description={current.reviewComment} />
          )}
          {legacyPending && <Alert type="warning" message="旧待审记录缺少提交人身份，请工程人员重新提交审核。" />}
          {isSubmitter && current.status === "pending_review" && <Alert type="info" message="该标准由你提交，需其他审核人处理。" />}
          {current.status === "pending_review" && (
            <Table className={styles.reviewComment} size="small" pagination={false} rowKey="key" dataSource={differences}
              title={() => published ? `审核变更对比：V${published.versionNo} → V${current.versionNo}` : "新标准审核：首次发布"}
              columns={[{title:"字段",dataIndex:"label"},{title:"已发布值",dataIndex:"before"},{title:"待审核值",dataIndex:"after"}]} />
          )}
          {canReview && current.status === "published" && <Input.TextArea className={styles.reviewComment} value={reviewComment} onChange={e=>setReviewComment(e.target.value)} placeholder="如需停用，请填写停用原因" autoSize={{minRows:1,maxRows:3}} />}
          {current.status === "obsolete" && <Alert type="warning" message="该标准已停用，仅供历史追溯，不可用于生产。" />}
          {user?.role === "admin" && current.status === "published" && <PublicationDeliveryPanel key={`${detail.id}:${current.id}`} standardId={detail.id} />}
          {canReviewThis && (
            <Input.TextArea
              className={styles.reviewComment}
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="审核意见（驳回时必填）"
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          )}

          {groupStandardFields(activeStandardFields(category, current.fields).filter(field => field.key !== "winter_test_standard")).map(group => <Descriptions
            key={group.name} column={1} size="small" bordered
            title={group.name || "规格参数"}
            items={group.fields.map(field => ({
              key: field.key, label: field.key === "test_standard" ? "测试标准" : field.label,
              children: field.key === "test_standard" ? <SeasonalTestStandard summer={current.fields.test_standard} winter={current.fields.winter_test_standard} /> : field.key === "gear_spec" ? <GearSpecification value={current.fields[field.key] || ""} /> : current.fields[field.key] || "—",
            }))}
          />)}

          {open && activeStandardFields(category, current.fields).some(field => field.key === "test_standard") && <StandardTestHistory key={`${detail.id}:${current.id}:${current.revision}`} standardId={detail.id} />}
        </>
      )}
    </Drawer>
  );
}
