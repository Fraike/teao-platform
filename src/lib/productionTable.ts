export const productionDailyPagination = {
  defaultPageSize: 50,
  hideOnSinglePage: true,
  showSizeChanger: false,
};

export function getProductionDailyTableSticky(getContainer: () => HTMLElement) {
  return {
    offsetHeader: 0,
    getContainer,
  };
}
