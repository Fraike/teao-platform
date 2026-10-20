import { Radio } from "antd";
import type { StandardCategoryTabsProps } from "../../types/standard";
import styles from "./StandardCategoryTabs.module.css";

export function StandardCategoryTabs({ categories, activeKey, onChange }: StandardCategoryTabsProps) {
  return <section className={styles.navigation} aria-label="产品分类">
    <div className={styles.heading}>产品分类 <span className={styles.count}>共 {categories.length} 类</span></div>
    <Radio.Group className={styles.options} value={activeKey} onChange={event => onChange(String(event.target.value))} aria-label="选择产品分类">
      {categories.map(category => <Radio.Button key={category.key} value={category.key}>{category.name}</Radio.Button>)}
    </Radio.Group>
  </section>;
}
