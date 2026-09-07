export function createProductionMaterialRequestQueue<T>() {
  let pendingRead: Promise<T> | null = null;
  let pendingRefresh: Promise<T> | null = null;

  return (forceRefresh: boolean, request: () => Promise<T>): Promise<T> => {
    if (!forceRefresh) {
      if (pendingRefresh) return pendingRefresh;
      if (pendingRead) return pendingRead;
      const readRequest = request().finally(() => {
        if (pendingRead === readRequest) pendingRead = null;
      });
      pendingRead = readRequest;
      return readRequest;
    }

    if (pendingRefresh) return pendingRefresh;
    const previousRead = pendingRead;
    const refreshRequest = (async () => {
      if (previousRead) await previousRead.catch(() => undefined);
      return request();
    })().finally(() => {
      if (pendingRefresh === refreshRequest) pendingRefresh = null;
    });
    pendingRefresh = refreshRequest;
    return refreshRequest;
  };
}
