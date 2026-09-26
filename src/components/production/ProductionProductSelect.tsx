import { useDeferredValue, useMemo, useState } from "react";
import { Button, Select } from "antd";
import type { ProductionProductOption } from "../../lib/productionProductSearch";
import { filterProductionProductOptions, getProductionProductSelectedValue, resolveProductionProductOption } from "../../lib/productionProductSearch";
import styles from "./ProductionProductSelect.module.css";

interface ProductionProductSelectProps {
  className?: string;
  loading?: boolean;
  onChange?: (value: string | undefined) => void;
  onProductSelect?: (option: ProductionProductOption) => void;
  onProductClear?: () => void;
  options: ProductionProductOption[];
  placeholder?: string;
  productId?: string;
  productNumber?: string;
  value?: string;
}

export function ProductionProductSelect({
  className,
  loading = false,
  onChange,
  onProductClear,
  onProductSelect,
  options,
  placeholder = "搜索并选择商品",
  productId,
  productNumber,
  value,
}: ProductionProductSelectProps) {
  const [searchValue, setSearchValue] = useState("");
  const [selectedOptionId, setSelectedOptionId] = useState<string>();
  const deferredSearchValue = useDeferredValue(searchValue);
  const filteredOptions = useMemo(
    () => filterProductionProductOptions(options, deferredSearchValue),
    [deferredSearchValue, options]
  );

  const clearSearch = () => setSearchValue("");
  const resolvedOption = useMemo(
    () => resolveProductionProductOption(options, { productId, productNumber, productName: value }),
    [options, productId, productNumber, value]
  );
  const legacyValue = value?.trim() && !resolvedOption ? `legacy:${value}` : undefined;
  const selectOptions = useMemo(() => {
    if (!legacyValue) return filteredOptions;
    return [{ value: legacyValue, label: `历史数据：${value}`, disabled: true }, ...filteredOptions];
  }, [filteredOptions, legacyValue, value]);
  const selectedValue = useMemo(() => {
    return getProductionProductSelectedValue(
      options,
      { productId, productNumber, productName: value },
      selectedOptionId
    ) || legacyValue;
  }, [legacyValue, options, productId, productNumber, selectedOptionId, value]);

  return (
    <Select
      allowClear
      className={className}
      filterOption={false}
      loading={loading}
      notFoundContent="未找到匹配商品"
      onChange={(nextValue) => {
        if (nextValue === undefined) {
          setSelectedOptionId(undefined);
          onProductClear?.();
          onChange?.(undefined);
        }
      }}
      onClear={() => {
        setSelectedOptionId(undefined);
        onProductClear?.();
        clearSearch();
      }}
      onOpenChange={(open) => { if (!open) clearSearch(); }}
      onSearch={setSearchValue}
      onSelect={(selectedValue) => {
        const selectedOption = options.find((option) => option.value === selectedValue);
        if (!selectedOption) return;
        setSelectedOptionId(selectedOption.value);
        clearSearch();
        onChange?.(selectedOption.productName);
        onProductSelect?.(selectedOption);
      }}
      options={selectOptions}
      placeholder={placeholder}
      popupRender={(menu) => (
        <>
          {menu}
          {searchValue && (
            <div className={styles.searchFooter}>
              <Button
                onClick={clearSearch}
                onMouseDown={(event) => event.preventDefault()}
                size="small"
                type="link"
              >
                清空搜索，显示全部商品
              </Button>
            </div>
          )}
        </>
      )}
      searchValue={searchValue}
      showSearch
      value={selectedValue}
      virtual
    />
  );
}
