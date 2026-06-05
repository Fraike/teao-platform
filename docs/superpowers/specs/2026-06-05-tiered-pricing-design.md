# 国际报价单 - 阶梯报价功能设计文档

- **日期**: 2026-06-05
- **状态**: 待确认

---

## 1. 需求概述

在现有国际报价单（`QuotationPageIntl`）中增加阶梯报价功能。每个产品可独立选择是否启用阶梯报价，不同供货量对应不同单价。

## 2. 核心规则

- 每个产品独立配置阶梯价格，可自由增减阶梯数量
- 同一个报价单内可混用：部分产品使用阶梯报价，部分使用单一价格
- 阶梯按 minQty 从大到小排序（如 1000 → 500 → 100）
- 阶梯报价产品的数量（QTY）和金额（Amount）在报价单中不计算总额
- PDF 展示采用行内展开式：产品行下方缩进展示各阶梯价格

---

## 3. 数据模型

### 3.1 新增类型

```typescript
// src/types/quotation.ts
export interface Tier {
  minQty: number;   // 阶梯起始数量
  price: number;    // 该阶梯对应的单价
}
```

### 3.2 Product 接口扩展

```typescript
export interface Product {
  id: string;
  name: string;
  partNo?: string;
  spec?: string;
  unit: string;
  price: number;         // 单一价格（无阶梯时使用）
  tiers?: Tier[];        // 新增：可选，非空数组表示启用阶梯报价
  qty?: number;
  amount?: number;
  torque?: string;
  image?: string;
  remark?: string;
  packaging?: string;
}
```

### 3.3 示例数据

```json
{
  "id": "p1",
  "name": "RD-02 Latches",
  "price": 0,
  "tiers": [
    { "minQty": 1000, "price": 4.00 },
    { "minQty": 500,  "price": 4.50 },
    { "minQty": 100,  "price": 5.00 }
  ]
}
```

---

## 4. 输入界面（ProductCardIntl）

### 4.1 交互逻辑

- Unit Price 列右侧增加阶梯切换按钮（`OrderedListOutlined` 或 `UnorderedListOutlined` 图标）
- 点击切换按钮进入/退出阶梯模式（该产品 `tiers` 字段从 undefined 变为数组或反之）
- 阶梯模式下，单元格内显示多行 `minQty` / `price` 输入框
- 每行左侧有删除小按钮
- 底部有 `+ Add Tier` 按钮
- 保存时自动按 minQty 降序排序

### 4.2 布局示意

| Unit Price |
|------------|
| 无阶梯产品: `[InputNumber]` + 阶梯图标 |
| 有阶梯产品: `≥[100] PCS $[5.00] ×` |
| 　　　　　　 `≥[500] PCS $[4.50] ×` |
| 　　　　　　 `[+ Add Tier]` |

---

## 5. PDF 预览（PreviewPanelIntl）

### 5.1 渲染逻辑

- 判断 `product.tiers` 是否存在且非空
- 有阶梯的产品：产品行在 Unit Price 列留空或显示 "Tiered →"，QTY/Amount 列显示 "—"
- 阶梯行：在产品行下方插入，使用小号字体（7.5px），灰色文字，浅背景色（`#faf8f4`）
- 阶梯行合并其他列，仅在 Unit Price 列显示阶梯信息

### 5.2 效果

```
# | Item       | Desc    | Unit | Unit Price         | QTY  | Amount | ...
1 | Widget A   | Spec-01 | PCS  |                    |  —   |   —    |
  |            |         |      |   ≥ 100 PCS  5.00  |      |        |
  |            |         |      |   ≥ 500 PCS  4.50  |      |        |
  |            |         |      |   ≥1000 PCS  4.00  |      |        |
2 | Widget B   | Spec-02 | PCS  |     3.5000          |  500 |  1,750 |
```

### 5.3 总额计算

- 阶梯报价产品不参与总额计算
- 总额仅统计无阶梯产品：`(qty ?? 0) * (price ?? 0)`
- 总额区域可增加备注文字说明 "部分产品采用阶梯定价"

---

## 6. 影响范围

### 6.1 需修改的文件

| 文件 | 改动内容 |
|------|---------|
| `src/types/quotation.ts` | 新增 `Tier` 接口，`Product` 增加 `tiers?: Tier[]` |
| `src/lib/store-intl.ts` | `normalizeQuotation` 不删 `tiers` 字段；`addProduct` 默认不含 `tiers` |
| `src/components/intl/ProductCardIntl.tsx` | Unit Price 列增加阶梯输入 UI |
| `src/components/intl/PreviewPanelIntl.tsx` | 产品表渲染有阶梯的行 |
| `src/lib/pdf-intl.ts` | 无需改动（使用 PreviewPanelIntl DOM） |
| `src/lib/sample-intl.ts` | 可选：示例数据增加一个阶梯报价产品 |

### 6.2 不受影响的文件

- `CustomerCardIntl` / `QuoteMetaCardIntl` / `TermsCardIntl` / `MoldCardIntl` / `ExportSettingsCardIntl` — 不涉及产品价格
- `QuotationHistoryDrawer` — `Product` 接口扩展后自动兼容
- `src/lib/historyStore.ts` — 同上
- `src/pages/QuotationPage.tsx` — 国内报价单独立

---

## 7. 向后兼容性

- `tiers` 为可选字段，现有 localStorage 数据加载后自动得到 `tiers: undefined`
- 无 `tiers` 的产品行为与现在完全一致
- JSON 导入导出自然支持（`tiers` 为可选字段）
- 历史记录中的产品如有 `tiers` 则保留，无则不显示阶梯
