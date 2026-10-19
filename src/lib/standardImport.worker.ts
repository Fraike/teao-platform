import { parseStandardImportFile } from "./standardImportFile";
import type { StandardImportWorkerResponse, StandardImportWorkerRequest } from "../types/standardImport";

// 使用独立模块，不给应用引入 WebWorker 全局 lib 与 DOM 的冲突。
const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<StandardImportWorkerRequest>) => void) | null;
  postMessage: (response: StandardImportWorkerResponse) => void;
};
workerScope.onmessage = async (event) => {
  try {
    const request = event.data;
    workerScope.postMessage({ ok: true, data: request instanceof ArrayBuffer ? await parseStandardImportFile(request) : await parseStandardImportFile(request.buffer, request.scope) });
  } catch (error) {
    workerScope.postMessage({ ok: false, error: error instanceof Error ? error.message : "Excel 解析失败。" });
  }
};
