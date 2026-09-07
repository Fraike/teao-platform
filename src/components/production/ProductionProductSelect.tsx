import { useDeferredValue, useMemo, useState } from "react";
import { Button, Select } from "antd";
import type { ProductionProductOption } from "../../lib/productionProductSearch";
import { filterProductionProductOptions } from "../../lib/productionProductSearch";
import styles from "./ProductionProductSelect.module.css";

interface ProductionProductSelectProps {
  className?: string;
  loading?: boolean;
  onChange?: (value: string | undefined) => void;
  onProductSelect?: (option: ProductionProductOption) => void;
  options: ProductionProductOption[];
  placeholder?: string;
  value?: string;
}

export function ProductionProductSelect({
  className,
  loading = false,
  onChange,
  onProductSelect,
  options,
  placeholder = "搜索并选择商品",
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
  const selectedValue = useMemo(() => {
    const selectedOption = options.find((option) => option.value === selectedOptionId);
    if (selectedOption?.productName === value) return selectedOptionId;
    return options.find((option) => option.productName === value)?.value;
  }, [options, selectedOptionId, value]);

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
          onChange?.(undefined);
        }
      }}
      onClear={() => {
        setSelectedOptionId(undefined);
        clearSearch();
      }}
      onDropdownVisibleChange={(open) => { if (!open) clearSearch(); }}
      onSearch={setSearchValue}
      onSelect={(selectedValue) => {
        const selectedOption = options.find((option) => option.value === selectedValue);
        if (!selectedOption) return;
        setSelectedOptionId(selectedOption.value);
        clearSearch();
        onChange?.(selectedOption.productName);
        onProductSelect?.(selectedOption);
      }}
      options={filteredOptions}
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
