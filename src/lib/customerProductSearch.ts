export function createCustomerProductSearchCoordinator() {
  let current: AbortController | null = null;

  return {
    begin() {
      current?.abort();
      current = new AbortController();
      return current;
    },
    isCurrent(request: AbortController) {
      return current === request && !request.signal.aborted;
    },
    cancel() {
      current?.abort();
      current = null;
    },
  };
}
