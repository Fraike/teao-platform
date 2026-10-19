import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChangeEvent, CompositionEvent } from "react";

/** 即时输入留在使用此 hook 的组件内，仅防抖后的值提交到列表。 */
export function useImeSafeFilter(initial = "", delay = 180, onApply?: (value: string) => void) {
  const [value, setValue] = useState(initial);
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
  useEffect(() => cancel, [cancel]);

  const commit = useCallback((next: string) => {
    if (appliedRef.current === next) return;
    appliedRef.current = next;
    setApplied(next);
    onApplyRef.current?.(next);
  }, []);

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
  }, [schedule]);

  const onCompositionStart = useCallback(() => {
    composing.current = true;
    cancel();
  }, [cancel]);

  const onCompositionEnd = useCallback((event: CompositionEvent<HTMLInputElement>) => {
    composing.current = false;
    const next = event.currentTarget.value;
    setValue(next);
    schedule(next);
  }, [schedule]);

  const reset = useCallback(() => {
    cancel();
    composing.current = false;
    setValue("");
    commit("");
  }, [cancel, commit]);

  return { applied, reset, inputProps: { value, onChange, onCompositionStart, onCompositionEnd } };
}
