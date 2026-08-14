import { Button, InputNumber, Switch } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { addTier, removeTier, setTierPricingEnabled, sortTiers, updateTier } from "../lib/tierPricing";
import type { Product } from "../types/quotation";
import styles from "./TierPricingEditor.module.css";

interface TierPricingEditorProps {
  product: Product;
  onChange: (product: Product) => void;
  labels: {
    toggle: string;
    enabled: string;
    add: string;
  };
  pricePrecision: number;
  currencyLabel: string;
}

export function TierPricingEditor({ product, onChange, labels, pricePrecision, currencyLabel }: TierPricingEditorProps) {
  const enabled = product.tierPricingEnabled === true;
  const tiers = sortTiers(product.tiers || []);

  const changeTier = (tierId: string, field: "minQty" | "price", value: number) => {
    onChange({ ...product, tiers: updateTier(product.tiers || [], tierId, field, value) });
  };

  return (
    <div className={styles.editor}>
      <div className={styles.header}>
        <Switch size="small" checked={enabled} onChange={(checked) => onChange(setTierPricingEnabled(product, checked))} />
        <span className={enabled ? styles.enabledLabel : styles.muted}>{enabled ? labels.enabled : labels.toggle}</span>
        {!enabled && (
          <InputNumber
            size="small"
            value={product.price}
            onChange={(value) => onChange({ ...product, price: value ?? 0 })}
            precision={pricePrecision}
            min={0}
          />
        )}
      </div>
      {enabled && (
        <div className={styles.tierList}>
          {tiers.map((tier) => (
            <div className={styles.tierRow} key={tier.id}>
              <Button
                className={styles.deleteButton}
                type="text"
                size="small"
                danger
                disabled={tiers.length <= 2}
                icon={<DeleteOutlined />}
                onClick={() => onChange({ ...product, tiers: removeTier(tiers, tier.id) })}
              />
              <span className={styles.muted}>≥</span>
              <InputNumber
                size="small"
                value={tier.minQty}
                onChange={(value) => changeTier(tier.id, "minQty", value ?? 0)}
                onBlur={() => onChange({ ...product, tiers: sortTiers(product.tiers || []) })}
                precision={0}
                min={0}
              />
              <span className={styles.muted}>{product.unit || "PCS"}</span>
              <span className={styles.muted}>{currencyLabel}</span>
              <InputNumber
                size="small"
                value={tier.price}
                onChange={(value) => changeTier(tier.id, "price", value ?? 0)}
                precision={pricePrecision}
                min={0}
              />
            </div>
          ))}
          <Button
            className={styles.addButton}
            type="dashed"
            size="small"
            block
            icon={<PlusOutlined />}
            onClick={() => onChange({ ...product, tiers: addTier(tiers, tiers.at(-1)?.price ?? product.price) })}
          >
            {labels.add}
          </Button>
        </div>
      )}
    </div>
  );
}
