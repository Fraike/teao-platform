import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Typography, Descriptions, Table, Tag, Spin, Button, message, Card, Empty } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import type { KingdeeMaterialDetail } from "../types/kingdee";
import { api } from "../lib/api";
import styles from "./MaterialDetailPage.module.css";

const { Title, Text } = Typography;

export function MaterialDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<KingdeeMaterialDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; data: KingdeeMaterialDetail }>(`/api/kingdee/materials/${id}`);
      setDetail(res.data);
    } catch (err) {
      message.error((err as Error).message || "获取商品详情失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void Promise.resolve().then(fetchDetail);
  }, [fetchDetail]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className={styles.container}>
        <Empty description="商品不存在" />
        <Button type="link" onClick={() => navigate(-1)}>返回</Button>
      </div>
    );
  }

  // 价格列表列定义
  const priceColumns = [
    { title: "单位", dataIndex: "price_unit_name", width: 60 },
    { title: "条码", dataIndex: "price_barcode", width: 140, ellipsis: true },
    { title: "采购价", dataIndex: "price_purchase_price", width: 80, align: "right" as const },
    { title: "最高采购价", dataIndex: "price_max_purchase_price", width: 90, align: "right" as const },
    { title: "成本价", dataIndex: "price_cost_price", width: 80, align: "right" as const },
    { title: "批发价", dataIndex: "price_trade_price", width: 80, align: "right" as const },
    { title: "配送价", dataIndex: "price_distribution_price", width: 80, align: "right" as const },
    { title: "零售价", dataIndex: "price_retail_price", width: 80, align: "right" as const },
    { title: "最低售价", dataIndex: "price_min_sales_price", width: 80, align: "right" as const },
    { title: "最新采购价", dataIndex: "price_near_pur_price", width: 90, align: "right" as const },
    { title: "最新销售价", dataIndex: "price_near_sal_price", width: 90, align: "right" as const },
  ];

  // 条码列表列定义
  const barcodeColumns = [
    { title: "条码", dataIndex: "barcode", width: 160, ellipsis: true },
    { title: "单位", dataIndex: "barcode_unit_name", width: 60 },
    { title: "辅助属性", dataIndex: "barcode_prop_aux_name", width: 120, ellipsis: true, render: (v: string) => v || "-" },
    { title: "备注", dataIndex: "barcode_remark", ellipsis: true, render: (v: string) => v || "-" },
  ];

  // 开关标签
  const flags = [
    { key: "is_sale", label: "可销售" },
    { key: "is_purchase", label: "可采购" },
    { key: "is_subpart", label: "可拆装" },
    { key: "is_assembly", label: "可组装" },
    { key: "is_batch", label: "批次管理" },
    { key: "is_serial", label: "序列号管理" },
    { key: "is_weight", label: "重量管理" },
    { key: "is_kf_period", label: "保质期管理" },
    { key: "is_asst_attr", label: "辅助属性" },
  ];

  const activeFlags = flags.filter((f) => detail[f.key as keyof KingdeeMaterialDetail]);
  const inactiveFlags = flags.filter((f) => !detail[f.key as keyof KingdeeMaterialDetail]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
          type="text"
        />
        <div className={styles.headerTitle}>
          <Title level={4} style={{ margin: 0 }}>
            商品详情
          </Title>
        </div>
      </div>

      <div className={styles.grid}>
        {/* 基本信息 */}
        <Card size="small" title="基本信息">
          <Descriptions column={1} size="small" colon={false}>
            <Descriptions.Item label="编码">{detail.number}</Descriptions.Item>
            <Descriptions.Item label="名称">
              <Text strong>{detail.name}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="规格">{detail.model || "-"}</Descriptions.Item>
            <Descriptions.Item label="条码">{detail.barcode || "-"}</Descriptions.Item>
            <Descriptions.Item label="助记码">{detail.help_code || "-"}</Descriptions.Item>
            <Descriptions.Item label="分类">{detail.parent_name || "-"}</Descriptions.Item>
            <Descriptions.Item label="默认仓库">{detail.stock_name || "-"}</Descriptions.Item>
            <Descriptions.Item label="品牌">{detail.brand_name || "-"}</Descriptions.Item>
            <Descriptions.Item label="产地">{detail.producing_pace || "-"}</Descriptions.Item>
            <Descriptions.Item label="备注">{detail.remark || "-"}</Descriptions.Item>
          </Descriptions>
        </Card>

        {/* 单位信息 + 开关 */}
        <Card size="small" title="单位与属性">
          <Descriptions column={2} size="small" colon={false}>
            <Descriptions.Item label="基本单位">{detail.base_unit_name}</Descriptions.Item>
            <Descriptions.Item label="采购单位">{detail.purchase_unit_name || detail.base_unit_name}</Descriptions.Item>
            <Descriptions.Item label="销售单位">{detail.sale_unit_name || detail.base_unit_name}</Descriptions.Item>
            <Descriptions.Item label="库存单位">{detail.store_unit_name || detail.base_unit_name}</Descriptions.Item>
            <Descriptions.Item label="辅助单位">{detail.aux_unit_name || "-"}</Descriptions.Item>
          </Descriptions>
          <div className={styles.tagRow}>
            {activeFlags.map((f) => (
              <Tag key={f.key} color="blue">{f.label}</Tag>
            ))}
            {inactiveFlags.map((f) => (
              <Tag key={f.key} color="default">{f.label}</Tag>
            ))}
          </div>
        </Card>

        {/* 条码列表 */}
        <Card size="small" title={`条码列表（${(detail.barcode_entity || []).length}）`}>
          {(detail.barcode_entity || []).length > 0 ? (
            <Table
              columns={barcodeColumns}
              dataSource={detail.barcode_entity}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: 500 }}
            />
          ) : (
            <div className={styles.empty}>无条码记录</div>
          )}
        </Card>

        {/* 价格列表 */}
        <Card size="small" title={`价格列表（${(detail.price_entity || []).length}）`}>
          {(detail.price_entity || []).length > 0 ? (
            <Table
              columns={priceColumns}
              dataSource={detail.price_entity}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: 1000 }}
            />
          ) : (
            <div className={styles.empty}>无价格记录</div>
          )}
        </Card>
      </div>
    </div>
  );
}
