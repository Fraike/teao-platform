# Tiered Pricing (阶梯报价) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-product tiered pricing to the international quotation page, allowing different unit prices at different minimum order quantities.

**Architecture:** Add optional `Tier[]` field to the existing `Product` type. Products without tiers keep single-price behavior. Input UI embeds tier editor directly in the Unit Price column of ProductCardIntl. Preview renders tier rows as indented sub-rows below the main product row in PreviewPanelIntl.

**Tech Stack:** React 18, TypeScript, Ant Design, Zustand

---

## File Structure

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/types/quotation.ts` | Add `Tier` interface, `tiers` field to `Product` |
| Modify | `src/components/intl/ProductCardIntl.tsx` | Tier toggle button + inline tier editor in Unit Price column |
| Modify | `src/components/intl/PreviewPanelIntl.tsx` | Render tier sub-rows in product table |
| Modify | `src/lib/sample-intl.ts` | Add sample product with tiered pricing |

Files **not** changed (no modifications needed):
- `src/lib/store-intl.ts` — `tiers` is optional, normalize passes through, addProduct defaults without it
- `src/lib/pdf-intl.ts` — renders PreviewPanelIntl DOM directly
- `src/lib/constants.ts` — no new constants needed

---

### Task 1: Add `Tier` interface and extend `Product` type

**Files:**
- Modify: `src/types/quotation.ts`

- [ ] **Step 1: Add Tier interface and Product.tiers field**

Insert the `Tier` interface before `Product`, and add `tiers` to `Product`:

```typescript
// src/types/quotation.ts — add after existing imports/exports, before Product:

export interface Tier {
  minQty: number;   // 阶梯起始数量，如 100, 500, 1000
  price: number;    // 该阶梯对应单价
}

export interface Product {
  id: string;
  name: string;
  partNo?: string;
  spec?: string;
  unit: string;
  price: number;
  tiers?: Tier[];        // 新增：可选阶梯报价
  qty?: number;
  amount?: number;
  torque?: string;
  image?: string;
  remark?: string;
  packaging?: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`

Expected: No new errors (existing errors in codebase are pre-existing).

- [ ] **Step 3: Commit**

```bash
git add src/types/quotation.ts
git commit -m "feat: add Tier interface and tiers field to Product type"
```

---

### Task 2: Add tier editing UI to ProductCardIntl Unit Price column

**Files:**
- Modify: `src/components/intl/ProductCardIntl.tsx`

- [ ] **Step 1: Add imports for the tier icon**

Add `UnorderedListOutlined` to the existing ant-design icons import:

```typescript
// src/components/intl/ProductCardIntl.tsx — line 3, change existing import:
import {
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  CameraOutlined,
  UnorderedListOutlined,  // 新增
} from "@ant-design/icons";
```

- [ ] **Step 2: Add `Tier` import**

```typescript
// src/components/intl/ProductCardIntl.tsx — change existing Product import (line 11):
import type { Product, Tier } from "../../types/quotation";
```

- [ ] **Step 3: Add tier helper functions**

Insert after the `handleImageUpload` function and before `scaleImage`:

```typescript
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
      // 按 minQty 降序排序
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
```

- [ ] **Step 4: Replace Unit Price column render**

Replace the existing Unit Price column definition (lines 106-119) with the tier-aware render:

```typescript
    {
      title: "Unit Price",
      dataIndex: "price",
      width: 140,
      render: (_price: number, r: ProductRow) => {
        const hasTiers = r.tiers && r.tiers.length > 0;

        return (
          <div style={{ minWidth: 120 }}>
            {/* Header: single price or tier mode indicator */}
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

            {/* Tier list */}
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
                      style={{ width: 56 }}
                      value={tier.minQty}
                      onChange={(v: number | null) => updateTier(r.id, idx, "minQty", v ?? 0)}
                      min={0}
                      suffix="PCS"
                    />
                    <span style={{ fontSize: 11, color: "#999" }}>$</span>
                    <InputNumber
                      size="small"
                      style={{ width: 64 }}
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
```

- [ ] **Step 5: Update QTY column render for tiered products**

Replace the QTY column render (lines 121-133) — tiered products show "—" for QTY:

```typescript
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
```

- [ ] **Step 6: Update Amount column render for tiered products**

Replace the Amount column render (lines 135-147) — tiered products show "—":

```typescript
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
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`

Expected: No new errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/intl/ProductCardIntl.tsx
git commit -m "feat: add tiered pricing editor in ProductCardIntl Unit Price column"
```

---

### Task 3: Render tiered pricing rows in PreviewPanelIntl

**Files:**
- Modify: `src/components/intl/PreviewPanelIntl.tsx`

- [ ] **Step 1: Update totalAmount calculation to exclude tiered products**

Change line 49 — total only sums non-tiered products:

```typescript
// src/components/intl/PreviewPanelIntl.tsx — replace line 49:
const totalAmount = products.reduce(
  (sum, p) => sum + (p.tiers && p.tiers.length > 0 ? 0 : (p.qty ?? 0) * (p.price ?? 0)),
  0
);
```

- [ ] **Step 2: Replace product row rendering with tiered row support**

Replace the `<tbody>` section (lines 210-247, the `{products.map(...)}` block) with:

```typescript
          <tbody>
            {products.map((p, idx) => {
              const hasTiers = p.tiers && p.tiers.length > 0;
              return (
                <React.Fragment key={p.id}>
                  {/* Main product row */}
                  <tr style={idx % 2 === 1 ? { background: C.bg } : {}}>
                    <td style={td("#", C.subtle)}>{idx + 1}</td>
                    <td style={tdItem()}>
                      <span style={{ fontWeight: 600, color: C.heading }}>{p.name || "—"}</span>
                      {p.torque && <span style={{ display: "block", fontSize: 8, color: C.muted, marginTop: 1 }}>Torque: {p.torque}</span>}
                    </td>
                    <td style={td("left", C.muted)}>{p.spec || "—"}</td>
                    <td style={td("left", C.muted)}>{p.unit}</td>
                    <td style={td("right", C.muted)}>
                      {hasTiers ? (
                        <span style={{ fontSize: 8, fontStyle: "italic", color: C.subtle }}>Tiered →</span>
                      ) : (
                        <>
                          <span style={{ fontSize: 7, color: C.subtle }}>{quoteMeta.currency} </span>
                          {(p.price ?? 0).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        </>
                      )}
                    </td>
                    <td style={td("right", C.text)}>
                      {hasTiers ? (
                        <span style={{ color: C.subtle }}>—</span>
                      ) : (
                        (p.qty ?? 0).toLocaleString("en-US")
                      )}
                    </td>
                    <td style={td("right", C.heading, "monospace", 600)}>
                      {hasTiers ? (
                        <span style={{ color: C.subtle }}>—</span>
                      ) : (
                        <>
                          <span style={{ fontSize: 7, color: C.subtle }}>{quoteMeta.currency} </span>
                          {((p.qty ?? 0) * (p.price ?? 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </>
                      )}
                    </td>
                    <td style={{ ...td("left", C.muted), wordBreak: "break-word" }}>
                      {p.packaging ? (
                        <div style={{ color: C.muted, fontSize: 8.5, lineHeight: 1.4, whiteSpace: "pre-line" }}>{p.packaging}</div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ ...td("left", C.subtle), wordBreak: "break-word" }}>
                      {p.remark ? (
                        <div style={{ fontSize: 8.5, lineHeight: 1.4, whiteSpace: "pre-line" }}>{p.remark}</div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>

                  {/* Tier sub-rows */}
                  {hasTiers && p.tiers!.map((tier, ti) => (
                    <tr key={`${p.id}-t${ti}`} style={{ background: C.bg }}>
                      <td style={{ ...td("#", C.subtle), background: C.bg }}></td>
                      <td style={{ ...td("left", C.muted), background: C.bg, paddingLeft: 24 }} colSpan={4}>
                        <span style={{ fontSize: 7.5, color: C.muted }}>
                          {ti === 0 ? "≥" : ""} {tier.minQty.toLocaleString("en-US")} PCS
                        </span>
                      </td>
                      <td style={{ ...td("right", C.heading, "monospace"), background: C.bg }}>
                        <span style={{ fontSize: 7, color: C.subtle }}>{quoteMeta.currency} </span>
                        <span style={{ fontSize: 8 }}>
                          {tier.price.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        </span>
                      </td>
                      <td style={{ ...td("right", C.text), background: C.bg }}></td>
                      <td style={{ ...td("right", C.heading, "monospace"), background: C.bg }}></td>
                      <td style={{ ...td("left", C.muted), background: C.bg }}></td>
                      <td style={{ ...td("left", C.subtle), background: C.bg }}></td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
```

Note: `React.Fragment` is already imported — the existing import `import { forwardRef, useState, useEffect } from "react";` needs `Fragment`:

```typescript
// src/components/intl/PreviewPanelIntl.tsx — line 1, change:
import { forwardRef, useState, useEffect, Fragment } from "react";
```

- [ ] **Step 3: Add tiered pricing note to total area**

After the total amount display, add a note when tiered products exist. Replace lines 251-263 (the total div) with:

```typescript
        {/* ===== Total ===== */}
        <div style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          padding: "12px 0",
          borderTop: `2px solid ${C.accent}`,
          marginTop: 2,
          gap: 16,
        }}>
          {products.some((p) => p.tiers && p.tiers.length > 0) && (
            <span style={{ fontSize: 7.5, color: C.subtle, fontStyle: "italic" }}>
              * Some products use tiered pricing, total excludes tiered items
            </span>
          )}
          <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginRight: 24 }}>Total Amount</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.heading, fontFamily: "monospace" }}>
            {quoteMeta.currency} {totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`

Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/intl/PreviewPanelIntl.tsx
git commit -m "feat: render tiered pricing sub-rows in PreviewPanelIntl"
```

---

### Task 4: Add sample tiered product to sample-intl.ts

**Files:**
- Modify: `src/lib/sample-intl.ts`

- [ ] **Step 1: Add a tiered pricing product to the sample data**

Replace the products array to include a tiered product:

```typescript
// src/lib/sample-intl.ts — replace products array (lines 31-53):
  products: [
    {
      id: "p1",
      name: "RD-02 Latches",
      partNo: "",
      spec: "RD-02",
      unit: "PCS",
      price: 0,
      tiers: [
        { minQty: 1000, price: 0.12 },
        { minQty: 500, price: 0.14 },
        { minQty: 100, price: 0.15 },
      ],
      torque: "",
      packaging: "1g/pcs, 500 pcs / opp bag packing\nCTN: 32*38*26.5 CM",
      remark: "Freight Cost: $230",
    },
    {
      id: "p2",
      name: "RD-T028 Rotary Damper",
      partNo: "",
      spec: "RD-T028",
      unit: "PCS",
      price: 0.23,
      torque: "200gf.cm",
      packaging: "2.5g/pcs, 200 pcs / opp bag packing\nCTN: 32*38*26.5 CM",
      remark: "",
    },
  ],
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/sample-intl.ts
git commit -m "feat: add sample tiered pricing product to intl quotation"
```

---

### Task 5: Integration verification

**Files:** None new

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Manual verification checklist**

Open the international quotation page in browser and verify:
1. Sample data loads with RD-02 Latches showing tiered pricing and RD-T028 showing single price
2. Click tier icon on RD-T028 — it converts to tiered mode with 2 default tiers
3. Add/remove tiers in both products — UI updates correctly
4. Click tier icon on RD-02 — it converts back to single price mode
5. Preview panel shows tiered sub-rows below RD-02 and normal row for RD-T028
6. Total amount excludes tiered products
7. Export PDF — tiered rows appear in exported PDF
8. Save draft, reload page — data persists
9. Export JSON, import JSON — tiered data preserved

- [ ] **Step 3: Commit any fixes if needed, or mark complete**

```bash
git commit -m "chore: integration verification complete"
```

---

## Summary

| Task | Files Changed | Estimated Time |
|------|--------------|----------------|
| Task 1: Type definitions | `types/quotation.ts` | 2 min |
| Task 2: Input UI | `ProductCardIntl.tsx` | 10 min |
| Task 3: Preview rendering | `PreviewPanelIntl.tsx` | 8 min |
| Task 4: Sample data | `sample-intl.ts` | 2 min |
| Task 5: Verification | Manual testing | 5 min |

**Total estimated:** ~27 minutes
