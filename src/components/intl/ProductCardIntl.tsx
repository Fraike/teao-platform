import React from "react";
import { Card, Table, Button, Input, InputNumber, Space, Popconfirm, Tooltip } from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  CameraOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { useIntlQuotationStore } from "../../lib/store-intl";
import { useIsMobile } from "../../lib/useIsMobile";
import type { Product, Tier } from "../../types/quotation";
import type { ColumnsType } from "antd/es/table";

type ProductRow = Product & { index: number };

export default function ProductCardIntl() {
  const isMobile = useIsMobile();
  const products = useIntlQuotationStore((s) => s.quotation.products);
  const addProduct = useIntlQuotationStore((s) => s.addProduct);
  const removeProduct = useIntlQuotationStore((s) => s.removeProduct);
  const duplicateProduct = useIntlQuotationStore((s) => s.duplicateProduct);
  const updateProduct = useIntlQuotationStore((s) => s.updateProduct);

  const update = (id: string, field: keyof Product, value: unknown) => {
    updateProduct(id, (prev) => ({ ...prev, [field]: value }));
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

  // 切换阶梯模式
  const toggleTierMode = (product: Product) => {
    if (product.tiers && product.tiers.length > 0) {
      update(product.id, "tiers", undefined);
    } else {
      update(product.id, "tiers", [
        { minQty: 100, price: product.price || 0 },
        { minQty: 500, price: product.price || 0 },
      ]);
    }
  };

  // 更新单个 tier
  const updateTier = (productId: string, tierIndex: number, field: keyof Tier, value: number) => {
    updateProduct(productId, (prev) => {
      const tiers = prev.tiers ? [...prev.tiers] : [{ minQty: 100, price: prev.price || 0 }];
      tiers[tierIndex] = { ...tiers[tierIndex], [field]: value };
      tiers.sort((a, b) => b.minQty - a.minQty);
      return { ...prev, tiers };
    });
  };

  // 添加阶梯
  const addTier = (product: Product) => {
    const lastTier = product.tiers?.[product.tiers.length - 1];
    const newMinQty = lastTier ? lastTier.minQty + 500 : 100;
    const tiers = product.tiers ? [...product.tiers, { minQty: newMinQty, price: lastTier?.price || 0 }] : [{ minQty: 100, price: product.price || 0 }];
    tiers.sort((a, b) => b.minQty - a.minQty);
    update(product.id, "tiers", tiers);
  };

  // 删除阶梯
  const removeTier = (product: Product, tierIndex: number) => {
    const tiers = product.tiers?.filter((_, i) => i !== tierIndex) || [];
    if (tiers.length === 0) {
      update(product.id, "tiers", undefined);
    } else {
      update(product.id, "tiers", tiers);
    }
  };

  const columns: ColumnsType<ProductRow> = [
    {
      title: "#",
      dataIndex: "index",
      width: 38,
      render: (v: number) => <span style={{ color: "#999" }}>{v + 1}</span>,
    },
    {
      title: "Item",
      dataIndex: "name",
      width: 150,
      render: (_name: string, r: ProductRow) => (
        <Input
          size="small"
          variant="borderless"
          placeholder="Product name"
          value={r.name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(r.id, "name", e.target.value)}
          style={{ padding: "2px 4px" }}
        />
      ),
    },
    {
      title: "Description",
      dataIndex: "spec",
      width: 100,
      render: (_spec: string | undefined, r: ProductRow) => (
        <Input
          size="small"
          variant="borderless"
          placeholder="Spec/Type"
          value={r.spec ?? ""}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(r.id, "spec", e.target.value)}
          style={{ padding: "2px 4px" }}
        />
      ),
    },
    {
      title: "Torque",
      dataIndex: "torque",
      width: 100,
      render: (_torque: string | undefined, r: ProductRow) => (
        <Input
          size="small"
          variant="borderless"
          placeholder="Torque"
          value={r.torque ?? ""}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(r.id, "torque", e.target.value)}
          style={{ padding: "2px 4px" }}
        />
      ),
    },
    {
      title: "Unit",
      dataIndex: "unit",
      width: 60,
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
      title: "Unit Price",
      dataIndex: "price",
      width: 180,
      render: (_price: number, r: ProductRow) => {
        const hasTiers = r.tiers && r.tiers.length > 0;

        return (
          <div style={{ minWidth: 160 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: hasTiers ? 4 : 0 }}>
              <Button
                type="text"
                size="small"
                icon={<UnorderedListOutlined />}
                onClick={() => toggleTierMode(r)}
                style={{
                  color: hasTiers ? "#1677ff" : "#ccc",
                  width: 24,
                  height: 24,
                  minWidth: 24,
                  padding: 0,
                  fontSize: 14,
                }}
                title={hasTiers ? "Switch to single price" : "Enable tiered pricing"}
              />
              {hasTiers ? (
                <span style={{ fontSize: 11, color: "#1677ff", fontWeight: 500, whiteSpace: "nowrap" }}>Tiered</span>
              ) : (
                <InputNumber
                  size="small"
                  style={{ width: "100%" }}
                  value={r.price}
                  onChange={(v: number | null) => update(r.id, "price", v ?? 0)}
                  precision={4}
                  min={0}
                />
              )}
            </div>

            {hasTiers && (
              <div style={{ background: "#fafafa", borderRadius: 4, padding: "4px 6px" }}>
                {r.tiers!.map((tier, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: idx < r.tiers!.length - 1 ? 4 : 0 }}>
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeTier(r, idx)}
                      style={{ width: 20, height: 20, minWidth: 20, padding: 0, fontSize: 10 }}
                    />
                    <span style={{ fontSize: 11, color: "#999", whiteSpace: "nowrap" }}>≥</span>
                    <InputNumber
                      size="small"
                      style={{ width: 60 }}
                      value={tier.minQty}
                      onChange={(v: number | null) => updateTier(r.id, idx, "minQty", v ?? 0)}
                      min={0}
                      suffix="PCS"
                    />
                    <span style={{ fontSize: 11, color: "#999" }}>$</span>
                    <InputNumber
                      size="small"
                      style={{ width: 68 }}
                      value={tier.price}
                      onChange={(v: number | null) => updateTier(r.id, idx, "price", v ?? 0)}
                      precision={4}
                      min={0}
                    />
                  </div>
                ))}
                <Button
                  type="dashed"
                  size="small"
                  block
                  icon={<PlusOutlined />}
                  onClick={() => addTier(r)}
                  style={{ marginTop: 4, fontSize: 11 }}
                >
                  Add Tier
                </Button>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: "QTY",
      dataIndex: "qty",
      width: 70,
      render: (_qty: number | undefined, r: ProductRow) => {
        if (r.tiers && r.tiers.length > 0) {
          return <span style={{ color: "#ccc" }}>—</span>;
        }
        return (
          <InputNumber
            size="small"
            style={{ width: "100%" }}
            value={r.qty ?? 0}
            onChange={(v: number | null) => update(r.id, "qty", v ?? 0)}
            min={0}
            suffix="PCS"
          />
        );
      },
    },
    {
      title: "Amount",
      dataIndex: "amount",
      width: 90,
      render: (_amount: number | undefined, r: ProductRow) => {
        if (r.tiers && r.tiers.length > 0) {
          return <span style={{ color: "#ccc" }}>—</span>;
        }
        const amt = (r.qty ?? 0) * (r.price ?? 0);
        return (
          <span style={{ color: "#1677ff", fontWeight: 500, fontFamily: "monospace" }}>
            {amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        );
      },
    },
    {
      title: "Packaging",
      dataIndex: "packaging",
      width: 220,
      render: (_pkg: string | undefined, r: ProductRow) => (
        <Input.TextArea
          size="small"
          placeholder="Packaging details"
          value={r.packaging ?? ""}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update(r.id, "packaging", e.target.value)}
          autoSize={{ minRows: 2, maxRows: 5 }}
          style={{ minWidth: 200, padding: "4px 6px", lineHeight: 1.35 }}
        />
      ),
    },
    {
      title: "Note",
      dataIndex: "remark",
      width: 180,
      render: (_remark: string | undefined, r: ProductRow) => (
        <Input.TextArea
          size="small"
          placeholder="Note"
          value={r.remark ?? ""}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update(r.id, "remark", e.target.value)}
          autoSize={{ minRows: 2, maxRows: 5 }}
          style={{ minWidth: 160, padding: "4px 6px", lineHeight: 1.35 }}
        />
      ),
    },
    {
      title: "Image",
      dataIndex: "image",
      width: 80,
      render: (_image: string | undefined, r: ProductRow) =>
        r.image ? (
          <div style={{ position: "relative", display: "inline-block" }}>
            <Tooltip title={<img src={r.image} style={{ maxWidth: 260 }} alt="" />}>
              <img src={r.image} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4 }} alt="" />
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
      title: "",
      width: 60,
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
            title="Delete this product?"
            onConfirm={() => removeProduct(r.id)}
            okText="Delete"
            cancelText="Cancel"
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
          Products
        </span>
      }
      extra={
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={addProduct}>
          Add Product
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
        scroll={{ x: isMobile ? 1000 : 1200 }}
        bordered
      />
    </Card>
  );
}

function scaleImage(base64: string, maxWidth: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.width <= maxWidth) {
        resolve(base64);
        return;
      }
      const ratio = maxWidth / img.width;
      const canvas = document.createElement("canvas");
      canvas.width = maxWidth;
      canvas.height = img.height * ratio;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.src = base64;
  });
}
