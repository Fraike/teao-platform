import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { createStandardRowSelection } from "../../lib/standardRowSelection";
import type { StandardRowSelectionStore } from "../../types/standard";
import styles from "./StandardSelectableRow.module.css";

const SelectionContext = createContext<StandardRowSelectionStore | null>(null);

export function StandardRowSelectionProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => createStandardRowSelection(), []);
  return <SelectionContext.Provider value={store}>{children}</SelectionContext.Provider>;
}

export function StandardSelectableRow(props: ComponentPropsWithoutRef<"tr"> & { "data-row-key"?: string }) {
  const store = useContext(SelectionContext);
  if (!store) throw new Error("标准行选择需要 StandardRowSelectionProvider");
  const id = props["data-row-key"] ?? "";
  const selected = useSyncExternalStore(store.subscribe, () => store.isSelected(id), () => false);
  return (
    <tr {...props} tabIndex={0} aria-selected={selected}
      className={`${props.className ?? ""} ${selected ? styles.selectedRow : ""}`}
      onClick={(event) => {
        props.onClick?.(event);
        if (!id || (event.target as HTMLElement).closest("button, a, input, select, textarea, [role='button']")) return;
        store.toggle(id);
      }}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        if (!id || event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        store.toggle(id);
      }}
    />
  );
}
