import {TabPageContext,useTabPage,useTabState} from "./tabPageContext";
import { useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ChangeEvent, CompositionEvent, KeyboardEvent } from "react";

/** 即时输入留在使用此 hook 的组件内，仅防抖后的值提交到列表。 */
export function useImeSafeFilter(initial = "", delay = 180, onApply?: (value: string) => void, snapshotKey?: string) {
  const tab=useTabPage();
  const context=useContext(TabPageContext);
  const record=context?.record,instance=context?.instance;
  const id=useId();
  const [value, setValue] = useTabState(snapshotKey ?? `filter:${id}`,initial);
  const [applied, setApplied] = useState(initial);
  const appliedRef = useRef(initial);
  const composing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onApplyRef = useRef(onApply);
  useLayoutEffect(() => { onApplyRef.current = onApply; }, [onApply]);

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  useEffect(() => () => {
    // Activity disconnects effects while hidden. An already requested debounce
    // may finish, while a native IME session must end at this boundary.
    composing.current=false;
    if(!tab.managed || !snapshotKey)cancel();
  }, [cancel,tab.managed,snapshotKey]);

  const commit = useCallback((next: string) => {
    if(record&&(!record.alive||record.instance!==instance))return;
    if (appliedRef.current === next) return;
    appliedRef.current = next;
    setApplied(next);
    onApplyRef.current?.(next);
  }, [record,instance]);

  const schedule = useCallback((next: string) => {
    cancel();
    timer.current = setTimeout(() => {
      timer.current = undefined;
      if (!composing.current) commit(next);
    }, delay);
  }, [cancel, commit, delay]);

  const onChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setValue(next);
    if (!composing.current) schedule(next);
  }, [schedule,setValue]);

  const onCompositionStart = useCallback(() => {
    composing.current = true;
    cancel();
  }, [cancel]);

  const onCompositionEnd = useCallback((event: CompositionEvent<HTMLInputElement>) => {
    composing.current = false;
    const next = event.currentTarget.value;
    setValue(next);
    schedule(next);
  }, [schedule,setValue]);

  const reset = useCallback(() => {
    cancel();
    composing.current = false;
    setValue("");
    commit("");
  }, [cancel, commit,setValue]);

  const onKeyDown=useCallback((event:KeyboardEvent<HTMLInputElement>)=>{
    if(!tab.managed || !snapshotKey || event.key!=="Enter" || composing.current || event.nativeEvent.isComposing)return;
    cancel();commit(event.currentTarget.value);
  },[cancel,commit,tab.managed,snapshotKey]);
  return { applied, reset, inputProps: { value, onChange, onCompositionStart, onCompositionEnd, ...(tab.managed&&snapshotKey?{onKeyDown}:{}) } };
}
