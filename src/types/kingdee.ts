/** 金蝶商品 */
export interface KingdeeMaterial {
  id: string;
  number: string;
  name: string;
  model: string;
  barcode: string;
  parent_id: string;
  parent_name: string;
  parent_number: string;
  base_unit_id: string;
  base_unit_name: string;
  base_unit_number: string;
  purchase_unit_id: string;
  stock_id: string;
  stock_name: string;
  stock_number: string;
  help_code: string;
  is_batch: boolean;
  is_serial: boolean;
  is_asst_attr: boolean;
  is_weight: boolean;
  is_kf_period: boolean;
  is_multi_unit: boolean;
  is_self_restraint: string;
  remark: string;
  url: string;
  brand_name: string;
}

/** 金蝶商品分类 */
export interface KingdeeCategory {
  id: string;
  name: string;
  number: string;
  count?: number;
  level?: string;
  isLeaf?: boolean;
  parent_id?: string;
  children?: KingdeeCategory[];
}

/** 金蝶客户 */
export interface KingdeeCustomer {
  id: string;
  number: string;
  name: string;
  group_name: string;
  c_level_id: string;
  remark: string;
  enable: string;
}

/** 金蝶商品详情 */
export interface KingdeeMaterialDetail {
  id: string;
  number: string;
  name: string;
  model: string;
  barcode: string;
  help_code: string;
  enable: string;
  brand_id: string;
  brand_name: string;
  producing_pace: string;
  remark: string;
  url: string;

  // 分类
  parent_id: string;
  parent_name: string;
  parent_number: string;

  // 仓库
  stock_id: string;
  stock_name: string;
  stock_number: string;

  // 单位
  base_unit_id: string;
  base_unit_name: string;
  base_unit_number: string;
  purchase_unit_id: string;
  purchase_unit_name: string;
  sale_unit_id: string;
  sale_unit_name: string;
  store_unit_id: string;
  store_unit_name: string;

  // 多单位
  is_multi_unit: boolean;
  aux_unit_id: string;
  aux_unit_name: string;
  aux_unit_number: string;

  // 开关
  is_batch: boolean;
  is_serial: boolean;
  is_weight: boolean;
  is_sale: boolean;
  is_purchase: boolean;
  is_subpart: boolean;
  is_assembly: boolean;
  is_kf_period: boolean;
  is_asst_attr: boolean;
  kf_period_type: string;
  kf_period: string;
  alarm_day: string;

  // 条码列表
  barcode_entity: KingdeeBarcodeEntity[];
  // 价格列表
  price_entity: KingdeePriceEntity[];
  // 辅助属性
  aux_entity: KingdeeAuxEntity[];
  // 标签
  mul_label: KingdeeMulLabel[];
}

export interface KingdeeBarcodeEntity {
  id: string;
  barcode: string;
  barcode_unit_id: string;
  barcode_unit_name: string;
  barcode_unit_number: string;
  barcode_remark: string;
  barcode_prop_aux_number: string;
  barcode_prop_aux_id: string;
  barcode_prop_aux_name: string;
}

export interface KingdeePriceEntity {
  id: string;
  price_barcode: string;
  price_unit_id: string;
  price_unit_name: string;
  price_unit_number: string;
  price_purchase_price: string;
  price_max_purchase_price: string;
  price_cost_price: string;
  price_distribution_price: string;
  price_trade_price: string;
  price_retail_price: string;
  price_min_sales_price: string;
  price_near_pur_price: string;
  price_near_pur_tax_price: string;
  price_near_sal_price: string;
  price_near_sal_tax_price: string;
  price_sale_price1: string;
  price_sale_price2: string;
  price_sale_price3: string;
  price_sale_price4: string;
  price_sale_price5: string;
  price_sale_price6: string;
  price_sale_price7: string;
  price_sale_price8: string;
  price_sale_price9: string;
  price_sale_price10: string;
  price_min_pur_tax_price: string;
  price_near_pur_unit_cost: string;
}

/** 金蝶辅助属性（如颜色、尺寸等） */
export interface KingdeeAuxEntity {
  id: string;
  name: string;
  number: string;
  aux_attr1?: string;
  aux_attr2?: string;
  aux_attr3?: string;
  aux_attr4?: string;
  aux_attr5?: string;
  [key: string]: unknown;
}

/** 金蝶多单位标签 */
export interface KingdeeMulLabel {
  id: string;
  name: string;
  number: string;
  [key: string]: unknown;
}

/** 金蝶供应商 */
export interface KingdeeSupplier {
  id: string;
  number: string;
  name: string;
  group_id: string;
  group_name: string;
  group_number: string;
  rate: string;
  bank: string;
  bank_account: string;
  account_open_addr: string;
  invoice_name: string;
  taxpayer_no: string;
  remark: string;
}
