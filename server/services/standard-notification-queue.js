import { createMutex } from "../lib/mutex.js";

const queues = new Map();
export async function withPublicationQueue(webhook, send) {
  const queue = queues.get(webhook) || { mutex: createMutex(), pending: 0 };
  queues.set(webhook, queue); queue.pending++;
  try { return await queue.mutex.run(send); }
  finally { if (--queue.pending === 0) queues.delete(webhook); }
}
