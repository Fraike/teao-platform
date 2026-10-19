import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseStandardImportInWorker, STANDARD_IMPORT_PARSE_TIMEOUT_MS } from '../src/lib/standardImportWorker.ts';
import type { StandardImportFileResult } from '../src/types/standardImport.ts';

class WorkerDouble {
  static instances: WorkerDouble[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  terminated = 0;
  posted: unknown[] = [];
  constructor(public url: URL, public options: WorkerOptions) { WorkerDouble.instances.push(this); }
  terminate() { this.terminated++; }
  postMessage(buffer: ArrayBuffer, transfer: Transferable[]) { this.posted.push([buffer, transfer]); }
}
const result: StandardImportFileResult = { records: [], warnings: [], errors: [], fileHash: 'hash', source: { sheetName: '标准', range: 'A1', rowCount: 1, columnCount: 1 } };
const nextTick = () => new Promise(resolve => setTimeout(resolve, 0));

test('a stalled parser terminates at the deadline without blocking the page', async context => {
  const previous = globalThis.Worker;
  globalThis.Worker = WorkerDouble as unknown as typeof Worker;
  context.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = parseStandardImportInWorker(new File(['data'], 'stalled.xls'), new AbortController().signal);
    const worker = WorkerDouble.instances.at(-1)!;
    context.mock.timers.tick(STANDARD_IMPORT_PARSE_TIMEOUT_MS);
    await assert.rejects(pending, /解析超时/);
    assert.equal(worker.terminated, 1);
  } finally { context.mock.timers.reset(); globalThis.Worker = previous; }
});

test('Worker transfers input, terminates on success/error and cancellation, ignores late results', async () => {
  const original = globalThis.Worker;
  globalThis.Worker = WorkerDouble as unknown as typeof Worker;
  try {
    const file = new File(['bytes'], 'test.xlsx');
    const successful = parseStandardImportInWorker(file, new AbortController().signal);
    const worker = WorkerDouble.instances.at(-1)!;
    assert.equal(worker.options.type, 'module');
    assert.match(worker.url.pathname, /standardImport\.worker\.ts$/);
    await nextTick();
    const [buffer, transfer] = worker.posted[0] as [ArrayBuffer, ArrayBuffer[]];
    assert.equal(transfer[0], buffer);
    worker.onmessage!({ data: { ok: true, data: result } });
    assert.equal(await successful, result);
    assert.equal(worker.terminated, 1);

    for (const failure of ['error', 'messageerror', 'response'] as const) {
      const pending = parseStandardImportInWorker(file, new AbortController().signal);
      const current = WorkerDouble.instances.at(-1)!;
      if (failure === 'error') current.onerror!();
      else if (failure === 'messageerror') current.onmessageerror!();
      else current.onmessage!({ data: { ok: false, error: '范围上限' } });
      await assert.rejects(pending);
      assert.equal(current.terminated, 1);
    }

    let release!: (buffer: ArrayBuffer) => void;
    const slowFile = { arrayBuffer: () => new Promise<ArrayBuffer>(resolve => { release = resolve; }) } as File;
    const controller = new AbortController();
    const cancelled = parseStandardImportInWorker(slowFile, controller.signal);
    const old = WorkerDouble.instances.at(-1)!;
    controller.abort();
    await assert.rejects(cancelled, { name: 'AbortError' });
    release(new ArrayBuffer(1)); await nextTick();
    old.onmessage!({ data: { ok: true, data: result } });
    assert.equal(old.posted.length, 0);
    assert.equal(old.terminated, 1);
    const count = WorkerDouble.instances.length;
    await assert.rejects(parseStandardImportInWorker(file, controller.signal), { name: 'AbortError' });
    assert.equal(WorkerDouble.instances.length, count);
  } finally { globalThis.Worker = original; }
});

test('sanitary selection is sent to the worker with the original buffer transferred', async () => {
 const previous = globalThis.Worker;
 globalThis.Worker = WorkerDouble as unknown as typeof Worker;
 try {
  const pending = parseStandardImportInWorker(new File(['bytes'], 'source.xls'), new AbortController().signal, 'sanitary');
  await nextTick();
  const worker = WorkerDouble.instances.at(-1)!;
  const [request, transfer] = worker.posted[0] as [{buffer: ArrayBuffer; scope: string}, ArrayBuffer[]];
  assert.equal(request.scope, 'sanitary'); assert.equal(request.buffer, transfer[0]);
  worker.onmessage!({data: {ok: true, data: result}});
  await pending;
 } finally {globalThis.Worker = previous;}
});
