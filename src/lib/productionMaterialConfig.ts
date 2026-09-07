export type ProductionMaterialDepartment = "assembly" | "injection";

interface ProductionMaterialConfig {
  category: string;
  cacheKey: string;
  label: string;
}

const PRODUCTION_MATERIAL_CONFIG: Record<ProductionMaterialDepartment, ProductionMaterialConfig> = {
  assembly: {
    category: "2314557705978701824",
    cacheKey: "production_finished_products_v3",
    label: "成品",
  },
  injection: {
    category: "2314559979366968320",
    cacheKey: "production_injection_plastic_parts_v3",
    label: "塑胶配件",
  },
};

export function getProductionMaterialConfig(department: ProductionMaterialDepartment): ProductionMaterialConfig {
  return PRODUCTION_MATERIAL_CONFIG[department];
}
