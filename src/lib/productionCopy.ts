interface AssemblyQuantities {
  orderQty?: number;
  planQty?: number;
  dailyQty?: number;
  cumulativeQty?: number;
  defects?: number;
}

interface InjectionQuantities {
  orderQty?: number;
  dailyQty?: number;
  cumulativeQty?: number;
  defects?: number;
}

function copyQuantity(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function buildAssemblyCopyValues(record: AssemblyQuantities): Required<AssemblyQuantities> {
  return {
    orderQty: copyQuantity(record.orderQty),
    planQty: copyQuantity(record.planQty),
    dailyQty: copyQuantity(record.dailyQty),
    cumulativeQty: copyQuantity(record.cumulativeQty),
    defects: copyQuantity(record.defects),
  };
}

export function buildInjectionCopyValues(record: InjectionQuantities): Required<InjectionQuantities> {
  return {
    orderQty: copyQuantity(record.orderQty),
    dailyQty: copyQuantity(record.dailyQty),
    cumulativeQty: copyQuantity(record.cumulativeQty),
    defects: copyQuantity(record.defects),
  };
}
