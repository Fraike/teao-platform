/** 同一记录的请求及权威回写串行；不同记录互不阻塞。失败不会堵住下一次保存。 */
export function createProductionSaveQueue() {
  const pending = new Map<number, Promise<unknown>>();
  return {
    async run<T>(id: number, operation: () => Promise<T>): Promise<T> {
      const result = (pending.get(id) ?? Promise.resolve()).catch(() => undefined).then(operation);
      pending.set(id, result);
      try { return await result; }
      finally { if (pending.get(id) === result) pending.delete(id); }
    },
  };
}
