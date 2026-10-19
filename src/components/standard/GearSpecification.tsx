import { splitGearSpecifications } from "../../lib/gearSpecification";
import styles from "./GearSpecification.module.css";

export function GearSpecification({ value }: { value: string }) {
  const items = splitGearSpecifications(value);
  if (items.length < 2) return <span className={styles.text}>{value || "—"}</span>;
  return <ul className={styles.list} title={value}>{items.map((item, index) => <li key={`${index}:${item}`} className={styles.text}>{item}</li>)}</ul>;
}
