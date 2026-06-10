// Simple async mutex for sequential file access

export function createMutex() {
  let queue = Promise.resolve();

  return {
    /**
     * Acquire the lock, run the function, release the lock.
     * Returns the function's return value.
     */
    async run(fn) {
      const prev = queue;
      let release;
      const next = new Promise((resolve) => {
        release = resolve;
      });
      queue = next;

      await prev;
      try {
        return await fn();
      } finally {
        release();
      }
    },
  };
}
