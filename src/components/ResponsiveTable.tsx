import { useEffect, useRef, useState } from "react";
import { Table } from "antd";
import type { TableProps } from "antd";
import { getResponsiveTableWidth } from "../lib/responsiveTable";
import styles from "./ResponsiveTable.module.css";

interface ResponsiveTableProps<RecordType extends object> extends TableProps<RecordType> {
  minWidth: number;
}

export function ResponsiveTable<RecordType extends object>({ minWidth, scroll, ...props }: ResponsiveTableProps<RecordType>) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(minWidth);

  useEffect(() => {
    const element = shellRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => setContainerWidth(entries[0]?.contentRect.width || minWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, [minWidth]);

  return (
    <div ref={shellRef} className={styles.tableShell}>
      <Table<RecordType> {...props} scroll={{ ...scroll, x: getResponsiveTableWidth(minWidth, containerWidth) }} />
    </div>
  );
}
