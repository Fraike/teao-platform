import { activeStandardFields } from "../../lib/standardFieldGroups";
import { SeasonalTestStandard } from "./SeasonalTestStandard";
import { GearSpecification } from "./GearSpecification";
import { useEffect, useState } from "react";
import { Drawer, Descriptions, Tag, Timeline, Space, Table, Empty, Spin, Collapse, Pagination, Alert } from "antd";
import styles from "./StandardHistoryDrawer.module.css";
import { useAuthStore } from "../../lib/authStore";
import { loadStandardCategories } from "../../lib/standardQueryCache";
import { useStandardHistoryPage } from "../../lib/useStandardHistoryPage";
import { api } from "../../lib/api";
import { standardStatusColor as statusColor, standardTypeDisplayLabel } from "../../lib/standardFormat";
import type { StandardDetail, StandardCategory, StandardVersion, StandardChange, StandardSourceComment } from "../../types/standard";
import { STANDARD_STATUS_LABELS, STANDARD_TYPE_COLORS } from "../../types/standard";

interface StandardHistoryDrawerProps {
  open: boolean;
  standardId: string | null;
  onClose: () => void;
}

export function StandardHistoryDrawer(props: StandardHistoryDrawerProps) {
  const user = useAuthStore(state => state.user);
  const scope = `${user?.id}:${user?.role}:${user?.permissions?.join(",")}`;
  if (!props.open || !props.standardId) return null;
  return <StandardHistoryContent key={`${props.standardId}:${scope}`} standardId={props.standardId} onClose={props.onClose} includeDeleted={user?.role === "admin"} />;
}

function StandardHistoryContent({ standardId, onClose, includeDeleted }: { standardId: string; onClose: () => void; includeDeleted: boolean }) {
  const [detail, setDetail] = useState<StandardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<StandardCategory[]>([]);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const versions = useStandardHistoryPage<StandardVersion>(standardId, "versions", 20);
  const changes = useStandardHistoryPage<StandardChange>(standardId, "changes", 20);
  const comments = useStandardHistoryPage<StandardSourceComment>(standardId, "comments", 10, commentsOpen);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api.get<{ ok: boolean; data: StandardDetail }>(`/api/standards/${standardId}?summary=true${includeDeleted ? "&includeDeleted=true" : ""}`, { signal: controller.signal }),
      loadStandardCategories(),
    ]).then(([response, categoryData]) => {
      if (!controller.signal.aborted) { setDetail(response.data); setCategories(categoryData); }
    }).catch(() => { if (!controller.signal.aborted) setDetail(null); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [standardId, includeDeleted]);

  return (
    <Drawer title="变更历史" open onClose={onClose} width={640}>
      {loading ? (
        <Spin size="large" />
      ) : !detail ? (
        <Empty description="标准不存在或无权查看" />
      ) : (
        <>
          <Descriptions column={1} size="small" title="版本历史" />
          {versions.error && <Alert type="error" message={versions.error} />}
          <Spin spinning={versions.loading}>
          <Timeline
            items={versions.data.map((v) => ({
              color: v.status === "published" ? "green" : v.status === "archived" ? "gray" : "blue",
              children: (
                <Space direction="vertical" size={0}>
                  <span>
                    <Tag color={statusColor(v.status)}>{STANDARD_STATUS_LABELS[v.status]}</Tag>
                    <Tag color={STANDARD_TYPE_COLORS[v.standardType]}>{standardTypeDisplayLabel(v.standardType,v.status)}</Tag>
                    V{v.versionNo} · 创建人 {v.createdBy}
                  </span>
                  {v.reviewedBy && (
                    <span>
                      审核人 {v.reviewedBy}
                      {v.publishedAt ? ` · 发布于 ${new Date(v.publishedAt).toLocaleString("zh-CN")}` : ""}
                    </span>
                  )}
                  {v.reviewComment && <span>意见：{v.reviewComment}</span>}
                  <Collapse size="small" items={[{
                    key: v.id, label: `查看 V${v.versionNo} 完整参数`, children: (
                      <Descriptions column={1} size="small" bordered items={[
                        {key:"category",label:"分类",children:v.categoryName},
                        {key:"customer",label:"客户",children:v.customer || "—"},
                        {key:"model",label:"型号",children:v.model || "—"},
                        ...(v.categoryKey === "sanitary_damper" ? [] : [{key:"part",label:"客户料号",children:v.customerPartNo || "—"},{key:"project",label:"项目代号",children:v.vehicleModel || "—"}]),
                        ...activeStandardFields(categories.find(c=>c.key===v.categoryKey), v.fields).filter(field => field.key !== "winter_test_standard").map(f=>({key:f.key,label:f.key === "test_standard" ? "测试标准" : f.label,children:f.key === "test_standard" ? <SeasonalTestStandard summer={v.fields.test_standard} winter={v.fields.winter_test_standard} /> : f.key === "gear_spec" ? <GearSpecification value={v.fields[f.key] || ""} /> : v.fields[f.key] || "—"})),
                      ]} />
                    ),
                  }]} />
                </Space>
              ),
            }))}
          />

          </Spin>
          {versions.total > 20 && <Pagination size="small" current={versions.page} pageSize={20} total={versions.total} showSizeChanger={false} onChange={versions.setPage} />}

          <Collapse onChange={(keys) => setCommentsOpen(keys.includes("excel-comments"))} items={[{key:"excel-comments",label:`Excel 原始批注${commentsOpen ? `（${comments.total}）` : ""}`,children:comments.error ? <Alert type="error" message={comments.error} /> : comments.loading ? <Spin /> : comments.data.length ? (
            <Table size="small" rowKey="id" pagination={{pageSize:10,current:comments.page,total:comments.total,onChange:comments.setPage,showSizeChanger:false}} dataSource={comments.data}
              columns={[{title:"原表单元格",dataIndex:"sourceCell",width:90},{title:"字段",dataIndex:"fieldLabel",width:90},{title:"作者",dataIndex:"author",width:90},{title:"原始批注",dataIndex:"text",render:(text:string)=><span className={styles.commentText}>{text}</span>}]} />
          ) : <Empty description="无原始 Excel 批注" />}]} />
          <Descriptions column={1} size="small" title="变更历史" />
          {changes.error && <Alert type="error" message={changes.error} />}
          <Table
            size="small"
            rowKey="id"
            loading={changes.loading}
            pagination={{ current: changes.page, total: changes.total, pageSize: 20, size: "small", showSizeChanger: false, onChange: changes.setPage }}
            columns={[
              {
                title: "变更日期",
                dataIndex: "changedAt",
                width: 110,
                render: (value: string) => value || "无日期",
              },
              { title: "字段", dataIndex: "fieldLabel", width: 90, render: (value: string) => value || "-" },
              { title: "变更内容", dataIndex: "description" },
              { title: "修改人", dataIndex: "author", width: 90, render: (value: string) => value || "-" },
            ]}
            dataSource={changes.data}
          />
        </>
      )}
    </Drawer>
  );
}
