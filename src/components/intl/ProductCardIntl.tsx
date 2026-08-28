import React from "react";
import { Card, Table, Button, Input, InputNumber, Space, Popconfirm } from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { useIntlQuotationStore } from "../../lib/store";
import { useIsMobile } from "../../lib/useIsMobile";
import type { Product } from "../../types/quotation";
import type { ColumnsType } from "antd/es/table";
import { addTier as addTierItem, removeTier as removeTierItem, setTierPricingEnabled, sortTiers as sortTierItems, updateTier as updateTierItem } from "../../lib/tierPricing";
import { ProductImageUploader } from "../ProductImageUploader";
import priceStyles from "../PriceEmphasis.module.css";
import inputStyles from "../QuotationProductInput.module.css";
import { QUOTE_PRICE_INPUT_PROPS } from "../../lib/quotationInput";

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

  // 切换阶梯模式
  const toggleTierMode = (productId: string) => {
    updateProduct(productId, (prev) => setTierPricingEnabled(prev, !prev.tierPricingEnabled, [500, 100]));
  };

  // 更新单个 tier（通过 id 定位，不排序避免焦点错位）
  const updateTier = (productId: string, tierId: string, field: "minQty" | "price", value: number) => {
    updateProduct(productId, (prev) => {
      if (!prev.tiers || prev.tiers.length === 0) return prev;
      const tiers = updateTierItem(prev.tiers, tierId, field, value);
      return { ...prev, tiers };
    });
  };

  // 排序阶梯（在失焦时调用）
  const sortTiers = (productId: string) => {
    updateProduct(productId, (prev) => {
      if (!prev.tiers || prev.tiers.length <= 1) return prev;
      const tiers = sortTierItems(prev.tiers, "desc");
      return { ...prev, tiers };
    });
  };

  // 添加阶梯
  const addTier = (productId: string) => {
    updateProduct(productId, (prev) => {
      const tiers = addTierItem(prev.tiers || [], prev.tiers?.at(-1)?.price ?? prev.price, 500, "desc");
      return { ...prev, tiers };
    });
  };

  // 删除阶梯（通过 id 定位）
  const removeTier = (productId: string, tierId: string) => {
    updateProduct(productId, (prev) => {
      const tiers = removeTierItem(prev.tiers || [], tierId);
      return { ...prev, tiers };
    });
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
          className={inputStyles.textInput}
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
          className={inputStyles.textInput}
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
          className={inputStyles.textInput}
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
          className={inputStyles.textInput}
          value={r.unit}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(r.id, "unit", e.target.value)}
          style={{ padding: "2px 4px" }}
        />
      ),
    },
    {
      title: "Unit Price",
      dataIndex: "price",
      width: 230,
      render: (_price: number, r: ProductRow) => {
        const hasTiers = r.tierPricingEnabled === true;

        return (
          <div style={{ minWidth: 200 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: hasTiers ? 4 : 0 }}>
              <Button
                type="text"
                size="small"
                icon={<UnorderedListOutlined />}
                onClick={() => toggleTierMode(r.id)}
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
                <div className={`${priceStyles.priceField} ${priceStyles.priceFieldIntl}`}>
                  <span className={`${priceStyles.currencyPrefix} ${priceStyles.currencyPrefixIntl}`}>$</span>
                  <InputNumber
                    className={`${priceStyles.priceInput} ${priceStyles.priceInputIntl}`}
                    size="small"
                    variant="borderless"
                    value={r.price}
                    onChange={(v: number | null) => update(r.id, "price", v ?? 0)}
                    precision={3}
                    min={0}
                    {...QUOTE_PRICE_INPUT_PROPS}
                  />
                </div>
              )}
            </div>

            {hasTiers && (
              <div style={{ background: "#fafafa", borderRadius: 4, padding: "4px 6px" }}>
                {r.tiers!.map((tier, idx) => (
                  <div key={tier.id} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: idx < r.tiers!.length - 1 ? 4 : 0 }}>
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeTier(r.id, tier.id)}
                      style={{ width: 20, height: 20, minWidth: 20, padding: 0, fontSize: 10 }}
                    />
                    <span style={{ fontSize: 11, color: "#999", whiteSpace: "nowrap" }}>≥</span>
                    <InputNumber
                      size="small"
                      style={{ width: 110 }}
                      value={tier.minQty}
                      onChange={(v: number | null) => updateTier(r.id, tier.id, "minQty", v ?? 0)}
                      onBlur={() => sortTiers(r.id)}
                      precision={0}
                      min={0}
                    />
                    <span style={{ fontSize: 10, color: "#999", whiteSpace: "nowrap" }}>PCS</span>
                    <span style={{ fontSize: 11, color: "#999" }}>$</span>
                    <InputNumber
                      className={`${priceStyles.tierPriceInput} ${priceStyles.tierPriceInputIntl}`}
                      size="small"
                      style={{ width: 95 }}
                      value={tier.price}
                      onChange={(v: number | null) => updateTier(r.id, tier.id, "price", v ?? 0)}
                      precision={3}
                      min={0}
                      {...QUOTE_PRICE_INPUT_PROPS}
                    />
                  </div>
                ))}
                <Button
                  type="dashed"
                  size="small"
                  block
                  icon={<PlusOutlined />}
                  onClick={() => addTier(r.id)}
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
      width: 100,
      render: (_qty: number | undefined, r: ProductRow) => {
        if (r.tierPricingEnabled) {
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
        if (r.tierPricingEnabled) {
          return <span style={{ color: "#ccc" }}>—</span>;
        }
        const amt = (r.qty ?? 0) * (r.price ?? 0);
        return (
          <span className={priceStyles.amountValue}>
            {amt.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
          </span>
        );
      },
    },
    {
      title: "Freight",
      dataIndex: "freight",
      width: 90,
      render: (_freight: number | undefined, r: ProductRow) => (
        <InputNumber
          size="small"
          style={{ width: "100%" }}
          value={r.freight ?? 0}
          onChange={(v: number | null) => update(r.id, "freight", v ?? 0)}
          precision={2}
          min={0}
        />
      ),
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
      render: (_image: string | undefined, r: ProductRow) => (
        <ProductImageUploader image={r.image} onChange={(image) => update(r.id, "image", image)} uploadLabel="Click/Drop" />
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
        scroll={{ x: isMobile ? 1100 : 1300 }}
        bordered
      />
    </Card>
  );
}
