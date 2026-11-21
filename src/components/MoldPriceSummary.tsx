import type { MoldItem, Product } from "../types/quotation";
import { calculateMoldPricing, validateMoldPricing } from "../lib/moldPricing";
import styles from "./MoldPriceSummary.module.css";

export function MoldPriceSummary({ products, molds, compact = false }: {
  products: Product[]; molds: MoldItem[]; compact?: boolean;
}) {
  if (!molds.length) return null;
  const className = `${styles.summary} ${compact ? styles.compact : ""}`;
  const error = validateMoldPricing(products, molds);
  if (error) return <div className={`${className} ${styles.warning}`}>{error}</div>;
  const product = products[0];
  const summary = calculateMoldPricing(product, molds);
  const money = (value: number) => `¥${value.toFixed(4)}`;
  return (
    <div className={className}>
      <strong>单价汇总 · {product.name || product.spec || "当前产品"}</strong>
      {summary.prices.map((row, index) => (
        <div key={index} className={styles.total}>
          {row.minQty !== undefined && `起订量 ${row.minQty.toLocaleString("zh-CN")} PCS：`}
          产品单价 {money(row.price)} ＋ 模具分摊单价 {money(summary.unitCost!)}
          ＝ 合计单价 {money(row.total!)}/PCS
        </div>
      ))}
    </div>
  );
}
