import React from "react";
import { Card, Table, Button, Input, InputNumber, Space, Popconfirm, Tooltip } from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  CameraOutlined,
} from "@ant-design/icons";
import { useQuotationStore } from "../lib/store";
import { useIsMobile } from "../lib/useIsMobile";
import type { Product } from "../types/quotation";
import type { ColumnsType } from "antd/es/table";

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

  const handleImageUpload = (id: string, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      scaleImage(base64, 200).then((scaled) => {
        updateProduct(id, (prev) => ({ ...prev, image: scaled }));
      });
    };
    reader.readAsDataURL(file);
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
          variant="borderless"
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
          variant="borderless"
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
          variant="borderless"
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
          variant="borderless"
          value={r.unit}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(r.id, "unit", e.target.value)}
          style={{ padding: "2px 4px" }}
        />
      ),
    },
    {
      title: "单价",
      dataIndex: "price",
      width: 90,
      render: (_price: number, r: ProductRow) => (
        <InputNumber
          size="small"
          style={{ width: "100%" }}
          value={r.price}
          onChange={(v: number | null) => update(r.id, "price", v ?? 0)}
          precision={2}
          min={0}
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
          variant="borderless"
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
      render: (_image: string | undefined, r: ProductRow) =>
        r.image ? (
          <div style={{ position: "relative", display: "inline-block" }}>
            <Tooltip title={<img src={r.image} style={{ maxWidth: 260 }} alt="" />}>
              <img src={r.image} style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 4 }} alt="" />
            </Tooltip>
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => update(r.id, "image", undefined)}
              style={{
                position: "absolute",
                top: -6,
                right: -6,
                width: 18,
                height: 18,
                minWidth: 18,
                padding: 0,
                fontSize: 10,
                borderRadius: "50%",
                background: "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }}
            />
          </div>
        ) : (
          <label style={{ cursor: "pointer", color: "#bbb" }}>
            <CameraOutlined />
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload(r.id, file);
                e.target.value = "";
              }}
            />
          </label>
        ),
    },
    {
      title: "备注",
      dataIndex: "remark",
      width: 100,
      render: (_remark: string | undefined, r: ProductRow) => (
        <Input
          size="small"
          variant="borderless"
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
        scroll={{ x: isMobile ? 700 : 900 }}
        bordered
      />
    </Card>
  );
}

import { scaleImage } from "../lib/imageUtils";
