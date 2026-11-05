export interface OutsideMaterial {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_number: string;
  material_id: string;
  material_name: string;
  material_number?: string;
  name: string;
  number: string;
  outside_model: string;
  outside_unit: string;
  outside_barcode: string;
  outside_pk_id: string;
  is_bind_relation: boolean;
  type: string; // "1"=供应商 "2"=客户
  type_name: string;
  unit_name: string;
}
