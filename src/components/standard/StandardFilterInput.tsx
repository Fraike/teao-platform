import { memo, useEffect, useRef } from "react";
import type { Ref } from "react";
import { Input } from "antd";
import type { InputProps, InputRef } from "antd";
import { useImeSafeFilter } from "../../lib/useImeSafeFilter";

interface StandardFilterInputProps extends Omit<InputProps, "value" | "defaultValue" | "onChange" | "onCompositionStart" | "onCompositionEnd"> {
  initialValue?: string;
  resetVersion: number;
  onApply: (value: string) => void;
  inputRef?: Ref<InputRef>;
}

export const StandardFilterInput = memo(function StandardFilterInput({
  initialValue = "", resetVersion, onApply, inputRef, ...props
}: StandardFilterInputProps) {
  const { inputProps, reset } = useImeSafeFilter(initialValue, 180, onApply);
  const previousReset = useRef(resetVersion);
  useEffect(() => {
    if (previousReset.current === resetVersion) return;
    previousReset.current = resetVersion;
    reset();
  }, [resetVersion, reset]);

  return <Input ref={inputRef} {...props} {...inputProps} />;
});
