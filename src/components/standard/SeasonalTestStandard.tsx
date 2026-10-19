import { createFromIconfontCN } from "@ant-design/icons";
import styles from "./SeasonalTestStandard.module.css";

// No script URL: the custom icon uses only the local SVG.
const SeasonalIcon = createFromIconfontCN({ extraCommonProps: { viewBox: "0 0 24 24" } });

export function SeasonalTestStandard({ summer, winter }: { summer?: string; winter?: string }) {
  const hasWinter = Boolean(winter?.trim());
  const value = (text: string) => <span className={`${styles.value} ${/^[\d.\s±%~–—+*/-]{1,18}$/.test(text) ? styles.range : ""}`}>{text}</span>;
  return <div className={styles.seasons}>
    <span className={styles.season}>{value(summer?.trim() ? summer : "—")}</span>
    {hasWinter && <span className={styles.season}><SeasonalIcon type="" aria-label="冬季" className={styles.winter}>
      <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M12 2v20M3.34 7l17.32 10M3.34 17L20.66 7M9 4l3 3 3-3M9 20l3-3 3 3M3.57 10.6l4.1-1.1-1.1-4.1M17.43 18.6l-1.1-4.1 4.1-1.1M6.57 18.6l1.1-4.1-4.1-1.1M20.43 10.6l-4.1-1.1 1.1-4.1" />
    </SeasonalIcon><span className={styles.label}>冬季 </span>{value(winter || "")}</span>}
  </div>;
}
