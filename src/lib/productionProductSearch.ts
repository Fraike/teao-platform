export interface ProductionProductOption {
  /** 金蝶物料 ID，同时作为下拉框唯一键和生产日报关联标识。 */
  value: string;
  /** 下拉框中显示“编码 · 品名”，便于识别同名物料。 */
  label: string;
  /** 生产日报实际保存的品名，兼容现有记录字段。 */
  productName: string;
  /** 金蝶商品编码，用于旧记录回选和人工识别。 */
  productNumber: string;
  spec?: string;
}

export interface ProductionProductIdentity {
  productId?: string;
  productNumber?: string;
  productName?: string;
}

export type ProductionProductMode = "create" | "edit" | "copy";

interface ProductionMaterialSource {
  id: string | number;
  name: string;
  number?: string;
  spec?: string;
  model?: string;
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
    productNumber: material.number?.trim() || "",
    spec: material.spec?.trim() || material.model?.trim() || "",
  }));
}

export function resolveProductionProductOption(
  options: ProductionProductOption[],
  identity: ProductionProductIdentity
): ProductionProductOption | undefined {
  const productId = identity.productId?.trim();
  if (productId) {
    const byId = options.find((option) => option.value === productId);
    if (byId) return byId;
  }
  const productNumber = identity.productNumber?.trim();
  if (productNumber) {
    const byNumber = options.filter((option) => option.productNumber === productNumber);
    if (byNumber.length === 1) return byNumber[0];
  }
  const productName = identity.productName?.trim();
  if (!productName) return undefined;
  const byName = options.filter((option) => option.productName === productName);
  return byName.length === 1 ? byName[0] : undefined;
}

export function resolveProductionProductForSubmit(
  options: ProductionProductOption[],
  validatedValues: ProductionProductIdentity,
  currentIdentity: ProductionProductIdentity
): ProductionProductOption | undefined {
  return resolveProductionProductOption(options, {
    productId: currentIdentity.productId ?? validatedValues.productId,
    productNumber: currentIdentity.productNumber ?? validatedValues.productNumber,
    productName: validatedValues.productName,
  });
}

export function validateProductionProductSelection(
  mode: ProductionProductMode,
  productName: string | undefined,
  selectedOption: ProductionProductOption | undefined
): string | undefined {
  if (selectedOption) return undefined;
  if (mode === "edit" && productName?.trim()) return undefined;
  if (mode === "copy" && productName?.trim()) return "历史商品无法匹配，请重新选择当前金蝶商品";
  return "请选择当前金蝶商品";
}

export function getProductionProductSelectedValue(
  options: ProductionProductOption[],
  identity: ProductionProductIdentity,
  localSelectedOptionId?: string
): string | undefined {
  const resolved = resolveProductionProductOption(options, identity);
  if (resolved) return resolved.value;
  const localSelected = options.find((option) => option.value === localSelectedOptionId);
  if (!localSelected || localSelected.productName !== identity.productName) return undefined;
  return localSelected.value;
}

export function filterProductionProductOptions(
  options: ProductionProductOption[],
  searchValue: string
): ProductionProductOption[] {
  const keyword = searchValue.trim().toLocaleLowerCase();
  if (!keyword) return options;
  return options.filter((option) => option.label.toLocaleLowerCase().includes(keyword));
}
