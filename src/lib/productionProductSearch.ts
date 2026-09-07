export interface ProductionProductOption {
  /** 金蝶物料 ID，只用于下拉框的唯一键，不能保存到生产日报。 */
  value: string;
  /** 下拉框中显示“编码 · 品名”，便于识别同名物料。 */
  label: string;
  /** 生产日报实际保存的品名，兼容现有记录字段。 */
  productName: string;
  spec?: string;
}

interface ProductionMaterialSource {
  id: string | number;
  name: string;
  number?: string;
  spec?: string;
}

const materialNumberCollator = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base",
});

function compareProductionMaterials(left: ProductionMaterialSource, right: ProductionMaterialSource): number {
  const leftNumber = left.number?.trim();
  const rightNumber = right.number?.trim();
  if (leftNumber && rightNumber) {
    const numberOrder = materialNumberCollator.compare(leftNumber, rightNumber);
    if (numberOrder !== 0) return numberOrder;
  } else if (leftNumber) {
    return -1;
  } else if (rightNumber) {
    return 1;
  }
  return materialNumberCollator.compare(left.name, right.name);
}

export function toProductionProductOptions(materials: ProductionMaterialSource[]): ProductionProductOption[] {
  return [...materials].sort(compareProductionMaterials).map((material) => ({
    value: String(material.id),
    label: material.number ? `${material.number} · ${material.name}` : material.name,
    productName: material.name,
    spec: material.spec || "",
  }));
}

export function filterProductionProductOptions(
  options: ProductionProductOption[],
  searchValue: string
): ProductionProductOption[] {
  const keyword = searchValue.trim().toLocaleLowerCase();
  if (!keyword) return options;
  return options.filter((option) => option.label.toLocaleLowerCase().includes(keyword));
}
