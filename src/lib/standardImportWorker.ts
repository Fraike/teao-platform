import type { StandardImportFileResult, StandardImportScope, StandardImportWorkerResponse } from "../types/standardImport";

export const STANDARD_IMPORT_PARSE_TIMEOUT_MS = 30000;

export function parseStandardImportInWorker(file: File, signal: AbortSignal, scope: StandardImportScope = "main"): Promise<StandardImportFileResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("已取消解析", "AbortError")); return; }
    const worker = new Worker(new URL("./standardImport.worker.ts", import.meta.url), { type: "module" });
    let settled = false;
    const finish = (error?: Error, data?: StandardImportFileResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      worker.terminate();
      if (error) reject(error);
      else if (data) resolve(data);
    };
    const cancel = () => finish(new DOMException("已取消解析", "AbortError"));
    signal.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (event: MessageEvent<StandardImportWorkerResponse>) => {
      if (event.data.ok) finish(undefined, event.data.data);
      else finish(new Error(event.data.error));
    };
    worker.onerror = () => finish(new Error("Excel Worker 解析失败。"));
    worker.onmessageerror = () => finish(new Error("Excel Worker 返回数据无法读取。"));
    const timer = setTimeout(() => finish(new Error("Excel 解析超时，已终止处理，请检查文件内容后重试。")), STANDARD_IMPORT_PARSE_TIMEOUT_MS);
    file.arrayBuffer().then(buffer => {
      if (!settled) worker.postMessage(scope === "main" ? buffer : { buffer, scope }, [buffer]);
    }).catch(error => finish(error instanceof Error ? error : new Error("读取文件失败。")));
  });
}
