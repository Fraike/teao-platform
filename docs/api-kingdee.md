# 金蝶云星辰 — 内部 API 文档

> 后端封装的金蝶接口，前端统一调用。基础 URL 由 Vite 代理到 `http://127.0.0.1:3899`。

---

## 通用说明

- **鉴权**：所有接口需要 Bearer Token（`Authorization: Bearer <jwt>`），由 `AuthGuard` 自动携带
- **响应格式**：`{ ok: true, data: [...] }` 成功 / `{ error: "..." }` 失败
- **金蝶 Token**：后端自动管理（24h 有效期，提前 1h 刷新），前端无需关心

---

## 一、商品资料

### GET /api/kingdee/materials

获取全部商品列表。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| search | string | 否 | 模糊搜索（编码/名称） |
| category | string | 否 | 按分类 ID 筛选（对应 material_group 的 id） |

**响应示例：**
```json
{
  "ok": true,
  "data": [
    {
      "id": "2479918065672952832",
      "number": "Q0040",
      "name": "0型圈3.95*2.65*0.65棕红色-硅胶/SIL55A",
      "model": "",
      "barcode": "Q004026051501644",
      "parent_id": "2314560770664341504",
      "parent_name": "O型圈",
      "parent_number": "SPFL00009",
      "base_unit_name": "个",
      "stock_name": "半成品仓",
      "help_code": "0xq3.95*2.65*0.65zhs-gj/SIL55A",
      "is_batch": true
    }
  ]
}
```

### GET /api/kingdee/categories

获取商品分类列表（两级树结构：成品/半成品 → 子分类）。每个分类的 `count` 由前端根据商品数据实时计算。

**响应示例：**
```json
{
  "ok": true,
  "data": [
    {
      "id": "2342097486262423552",
      "number": "-A",
      "name": "成品",
      "count": 512,
      "children": [
        {
          "id": "2342097486262423553",
          "number": "-A01",
          "name": "齿轮阻尼器",
          "count": 262,
          "parent_id": "2342097486262423552"
        }
      ]
    }
  ]
}
```

### GET /api/kingdee/materials/:id

获取单个商品详情（含条码列表、价格列表、辅助属性等完整信息）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 商品 ID（路径参数） |

**响应示例：**
```json
{
  "ok": true,
  "data": {
    "id": "2479918065672952832",
    "number": "Q0040",
    "name": "O型圈3.95*2.65*0.65棕红色-硅胶/SIL55A",
    "model": "",
    "barcode": "Q004026051501644",
    "help_code": "0xq3.95*2.65*0.65zhs-gj/SIL55A",
    "parent_id": "2314560770664341504",
    "parent_name": "O型圈",
    "base_unit_name": "个",
    "purchase_unit_name": "个",
    "sale_unit_name": "个",
    "store_unit_name": "个",
    "stock_name": "半成品仓",
    "brand_name": "",
    "producing_pace": "",
    "is_sale": true,
    "is_purchase": true,
    "is_batch": true,
    "is_serial": false,
    "barcode_entity": [
      {
        "id": "xxx",
        "barcode": "Q004026051501644",
        "barcode_unit_name": "个",
        "barcode_remark": ""
      }
    ],
    "price_entity": [
      {
        "id": "xxx",
        "price_barcode": "Q004026051501644",
        "price_unit_name": "个",
        "price_purchase_price": "0.05",
        "price_cost_price": "0.05",
        "price_retail_price": "0.10"
      }
    ]
  }
}
```

---

## 二、客户资料

### GET /api/kingdee/customers

获取全部客户列表。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| search | string | 否 | 模糊搜索（编码/名称/分组） |

**响应示例：**
```json
{
  "ok": true,
  "data": [
    {
      "id": "1",
      "number": "DHSK01",
      "name": "订货散客",
      "group_name": "",
      "enable": "0",
      "remark": ""
    }
  ]
}
```

---

## 三、供应商资料

### GET /api/kingdee/suppliers

获取全部供应商列表。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| search | string | 否 | 模糊搜索（编码/名称/分组） |

**响应示例：**
```json
{
  "ok": true,
  "data": [
    {
      "id": "2330475421889540096",
      "number": "TAGYS021",
      "name": "安徽意博润滑科技有限公司",
      "group_name": "",
      "rate": "0",
      "taxpayer_no": "",
      "remark": ""
    }
  ]
}
```

---

## 数据统计（截至 2026-06-26）

| 接口 | 数据量 |
|------|--------|
| 商品 (materials) | 1,174 条 |
| 分类 (categories) | 18 个 |
| 客户 (customers) | 364 条 |
| 供应商 (suppliers) | 52 条 |

---

## 技术实现

```
浏览器 ──GET /api/kingdee/*──▶ Express (jwtAuth) ──▶ kingdee.js Service ──▶ api.kingdee.com
                                   │                        │
                                   └── JWT 鉴权              ├── X-Api-Signature (HMAC-SHA256)
                                                            ├── Token 缓存 (24h)
                                                            └── 自动分页 (page_size=100)
```

- **源文件**：`server/services/kingdee.js`、`server/routes/kingdee.js`
- **金蝶凭证**：通过服务端环境变量 `KINGDEE_CLIENT_ID` 和 `KINGDEE_CLIENT_SECRET` 配置，绝不写入代码或文档
