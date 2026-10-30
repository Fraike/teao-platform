import {useTabState} from "../../lib/tabPageContext";
import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import type { ComponentPropsWithRef,ReactNode,Ref } from "react";
import type {StandardSelectableRowProps} from '../../types/standardTable';
import { createStandardRowSelection } from "../../lib/standardRowSelection";
import type { StandardRowSelectionStore } from "../../types/standard";
import styles from "./StandardSelectableRow.module.css";

const SelectionContext = createContext<StandardRowSelectionStore | null>(null);

export function StandardRowSelectionProvider({ children, selectionKey = "" }: { children: ReactNode; selectionKey?: string }) {
  const [selected,setSelected]=useTabState<string|null>(`standard:selected:${selectionKey}`,null);
  // The external store owns selection; recreating it on selection would notify every row.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const store = useMemo(() => createStandardRowSelection(selected,setSelected), [selectionKey,setSelected]);
  return <SelectionContext.Provider value={store}>{children}</SelectionContext.Provider>;
}

export function StandardSelectableRow({as='tr',ref,...props}:StandardSelectableRowProps) {
  const store = useContext(SelectionContext);
  if (!store) throw new Error("标准行选择需要 StandardRowSelectionProvider");
  const id = props["data-row-key"] ?? "";
  const selected = useSyncExternalStore(store.subscribe, () => store.isSelected(id), () => false);
  const attributes={...props,tabIndex:0,'aria-selected':selected,
      className:`${props.className ?? ""} ${selected ? styles.selectedRow : ""}`,
      onClick:(event:React.MouseEvent<HTMLElement>) => {
        props.onClick?.(event);
        if(id && (event.target as HTMLElement).closest("a[href*='materials/number']")){if(!store.isSelected(id))store.toggle(id);return;}
        if (!id || (event.target as HTMLElement).closest("button, a, input, select, textarea, [role='button']")) return;
        store.toggle(id);
      },
      onKeyDown:(event:React.KeyboardEvent<HTMLElement>) => {
        props.onKeyDown?.(event);
        if (!id || event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        store.toggle(id);
      }};
  return as==='div'?<div {...attributes} ref={ref as Ref<HTMLDivElement>}/>:<tr {...attributes} ref={ref as Ref<HTMLTableRowElement>}/>;
}

export function StandardVirtualRow(props:ComponentPropsWithRef<'div'>&{'data-row-key'?:string}){
  return <StandardSelectableRow {...props} as="div" role="row"/>;
}
