import { Modal } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { validateQuotationTiers } from "../lib/tierPricing";
import type { Product } from "../types/quotation";

type TierValidationLocale = "zh" | "en";

const COPY = {
  zh: {
    errorTitle: "阶梯报价信息不完整",
    warningTitle: "阶梯价格趋势提醒",
    warningSuffix: "。MOQ增加时单价通常应降低，是否仍然继续？",
    edit: "返回修改",
    continue: "仍然继续",
  },
  en: {
    errorTitle: "Incomplete tier pricing",
    warningTitle: "Tier price trend warning",
    warningSuffix: ". Unit price normally decreases as MOQ increases. Continue anyway?",
    edit: "Return to edit",
    continue: "Continue anyway",
  },
} as const;

export function confirmTierPricing(products: Product[], locale: TierValidationLocale): Promise<boolean> {
  const validation = validateQuotationTiers(products, locale);
  const copy = COPY[locale];
  if (validation.errors.length > 0) {
    Modal.error({ title: copy.errorTitle, content: validation.errors.join(locale === "zh" ? "；" : "; "), okText: copy.edit });
    return Promise.resolve(false);
  }
  if (validation.warnings.length === 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    Modal.confirm({
      title: copy.warningTitle,
      icon: <WarningOutlined />,
      content: `${validation.warnings.join(locale === "zh" ? "；" : "; ")}${copy.warningSuffix}`,
      okText: copy.continue,
      cancelText: copy.edit,
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}
