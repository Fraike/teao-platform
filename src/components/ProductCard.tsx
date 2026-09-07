import React from "react";
import { Card, Table, Button, Input, Space, Popconfirm } from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
} from "@ant-design/icons";
import { useQuotationStore } from "../lib/store";
import { useIsMobile } from "../lib/useIsMobile";
import type { Product } from "../types/quotation";
import type { ColumnsType } from "antd/es/table";
import { TierPricingEditor } from "./TierPricingEditor";
import { ProductImageUploader } from "./ProductImageUploader";
import inputStyles from "./QuotationProductInput.module.css";

type ProductRow = Product & { index: number };

export default function ProductCard() {
  const isMobile = useIsMobile();
  const products = useQuotationStore((s) => s.quotation.products);
  const addProduct = useQuotationStore((s) => s.addProduct);
  const removeProduct = useQuotationStore((s) => s.removeProduct);
  const duplicateProduct = useQuotationStore((s) => s.duplicateProduct);
  const updateProduct = useQuotationStore((s) => s.updateProduct);

  const update = (id: string, field: keyof Product, value: unknown) => {
    updateProduct(id, (prev) => {
      return { ...prev, [field]: value };
    });
  };

  const columns: ColumnsType<ProductRow> = [
    {
      title: "#",
      dataIndex: "index",
      width: 40,
      render: (v: number) => <span style={{ color: "#999" }}>{v + 1}</span>,
    },
    {
      title: "产品名称",
      dataIndex: "name",
      width: 160,
      render: (_name: string, r: ProductRow) => (
        <Input
          size="small"
          className={inputStyles.textInput}
          placeholder="产品名称"
          value={r.name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(r.id, "name", e.target.value)}
          style={{ padding: "2px 4px" }}
        />
      ),
    },
    {
      title: "料号",
      dataIndex: "partNo",
      width: 110,
      render: (_partNo: string | undefined, r: ProductRow) => (
        <Input
          size="small"
          className={inputStyles.textInput}
          placeholder="料号"
          value={r.partNo ?? ""}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(r.id, "partNo", e.target.value)}
          style={{ padding: "2px 4px" }}
        />
      ),
    },
    {
      title: "规格",
      dataIndex: "spec",
      width: 80,
      render: (_spec: string | undefined, r: ProductRow) => (
        <Input
          size="small"
          className={inputStyles.textInput}
          placeholder="规格"
          value={r.spec ?? ""}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(r.id, "spec", e.target.value)}
          style={{ padding: "2px 4px" }}
        />
      ),
    },
    {
      title: "单位",
      dataIndex: "unit",
      width: 70,
      render: (_unit: string, r: ProductRow) => (
        <Input
          size="small"
          className={inputStyles.textInput}
          value={r.unit}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(r.id, "unit", e.target.value)}
          style={{ padding: "2px 4px" }}
        />
      ),
    },
    {
      title: "单价",
      dataIndex: "price",
      width: 280,
      render: (_price: number, r: ProductRow) => (
        <TierPricingEditor
          product={r}
          onChange={(product) => updateProduct(r.id, () => product)}
          labels={{ toggle: "启用阶梯报价", enabled: "阶梯报价", add: "添加档位" }}
          currencyLabel="¥"
        />
      ),
    },
    {
      title: "扭矩/参数",
      dataIndex: "torque",
      width: 110,
      render: (_torque: string | undefined, r: ProductRow) => (
        <Input
          size="small"
          className={inputStyles.textInput}
          placeholder="参数"
          value={r.torque ?? ""}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(r.id, "torque", e.target.value)}
          style={{ padding: "2px 4px" }}
        />
      ),
    },
    {
      title: "图片",
      dataIndex: "image",
      width: 86,
      render: (_image: string | undefined, r: ProductRow) => (
        <ProductImageUploader image={r.image} onChange={(image) => update(r.id, "image", image)} uploadLabel="点击/拖入" />
      ),
    },
    {
      title: "备注",
      dataIndex: "remark",
      width: 100,
      render: (_remark: string | undefined, r: ProductRow) => (
        <Input
          size="small"
          className={inputStyles.textInput}
          placeholder="备注"
          value={r.remark ?? ""}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(r.id, "remark", e.target.value)}
          style={{ padding: "2px 4px" }}
        />
      ),
    },
    {
      title: "操作",
      width: 70,
      fixed: "right" as const,
      render: (_v: unknown, r: ProductRow) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => duplicateProduct(r.id)}
          />
          <Popconfirm
            title="确定删除该产品？"
            onConfirm={() => removeProduct(r.id)}
            okText="删除"
            cancelText="取消"
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const dataSource = products.map((p, idx) => ({ ...p, index: idx, key: p.id }));

  return (
    <Card
      title={
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          产品明细
        </span>
      }
      extra={
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={addProduct}>
          添加产品
        </Button>
      }
      size="small"
      styles={{ body: { padding: "8px 12px" } }}
    >
      <Table<ProductRow>
        columns={columns}
        dataSource={dataSource}
        pagination={false}
        size="small"
        scroll={{ x: isMobile ? 1000 : 1120 }}
        bordered
      />
    </Card>
  );
}
