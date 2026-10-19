import { memo, useEffect, useRef } from "react";
import { Input } from "antd";
import type { InputProps } from "antd";
import { useImeSafeFilter } from "../../lib/useImeSafeFilter";

interface StandardFilterInputProps extends Omit<InputProps, "value" | "defaultValue" | "onChange" | "onCompositionStart" | "onCompositionEnd"> {
  initialValue?: string;
  resetVersion: number;
  onApply: (value: string) => void;
}

export const StandardFilterInput = memo(function StandardFilterInput({
  initialValue = "", resetVersion, onApply, ...props
}: StandardFilterInputProps) {
  const { inputProps, reset } = useImeSafeFilter(initialValue, 180, onApply);
  const previousReset = useRef(resetVersion);
  useEffect(() => {
    if (previousReset.current === resetVersion) return;
    previousReset.current = resetVersion;
    reset();
  }, [resetVersion, reset]);

  return <Input {...props} {...inputProps} />;
});
