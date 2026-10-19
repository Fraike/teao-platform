const ZIP_ENTRY_LIMIT = 16 * 1024 * 1024;
const ZIP_TOTAL_LIMIT = 64 * 1024 * 1024;
const ZIP_ENTRIES_LIMIT = 1000;
const fail = () => { throw new Error("Excel ZIP 范围或解压大小超限（单条16MB、合计64MB、最多1000条）。"); };

function endRecord(view: DataView): number {
  for (let offset = view.byteLength - 22; offset >= Math.max(0, view.byteLength - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === view.byteLength) return offset;
  }
  return fail();
}

async function expandBounded(data: Uint8Array<ArrayBuffer>, method: number, collect: boolean): Promise<{ size: number; xml: string }> {
  if (method === 0) return { size: data.byteLength, xml: collect ? new TextDecoder().decode(data) : "" };
  let position = 0;
  const input = new ReadableStream<Uint8Array<ArrayBuffer>>({ pull(controller) {
    if (position >= data.length) { controller.close(); return; }
    // 每次只喂1KB压缩内容，避免一次输入导致巨量解压分配。
    const next = Math.min(position + 1024, data.length);
    controller.enqueue(data.subarray(position, next)); position = next;
  } });
  const reader = input.pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  let size = 0;
  const decoder = new TextDecoder(), text: string[] = [];
  try {
    for (;;) {
      const result = await reader.read(); if (result.done) break;
      size += result.value.byteLength;
      if (size > ZIP_ENTRY_LIMIT) { await reader.cancel(); fail(); }
      if (collect) text.push(decoder.decode(result.value, { stream: true }));
    }
  } finally { reader.releaseLock(); }
  return { size, xml: collect ? text.join("") + decoder.decode() : "" };
}

function checkWorksheet(xml: string) {
  let cells = 0;
  for (const match of xml.matchAll(/<(?:[\w]+:)?(?:c|row)\b[^>]*\br=["']([A-Z]+)?(\d+)["']/g)) {
    if (Number(match[2]) > 10001) throw new Error("工作表实际尾行超过10001行，拒绝截断导入。");
    if (!match[1]) continue;
    let column = 0; for (const letter of match[1]) column = column * 26 + letter.charCodeAt(0) - 64;
    if (column > 100 || ++cells > 500000) throw new Error("工作表实际列或单元格数量超限。");
  }
}

export async function validateStandardZip(buffer: ArrayBuffer): Promise<void> {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint32(0, true) !== 0x04034b50) return; // XLS/CFB由原文件10MB上限约束。
  const end = endRecord(view), count = view.getUint16(end + 10, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count || count > ZIP_ENTRIES_LIMIT) fail();
  let offset = view.getUint32(end + 16, true), total = 0;
  const directoryEnd = offset + view.getUint32(end + 12, true);
  if (directoryEnd > end) fail();
  for (let index = 0; index < count; index++) {
    if (offset + 46 > directoryEnd || view.getUint32(offset, true) !== 0x02014b50) fail();
    const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true), declaredSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true), extraLength = view.getUint16(offset + 30, true), commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    if ((flags & 1) || ![0, 8].includes(method) || declaredSize > ZIP_ENTRY_LIMIT || total + declaredSize > ZIP_TOTAL_LIMIT || offset + 46 + nameLength + extraLength + commentLength > directoryEnd) fail();
    if (local + 30 > buffer.byteLength || view.getUint32(local, true) !== 0x04034b50 || view.getUint16(local + 8, true) !== method) fail();
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + compressedSize > view.getUint32(end + 16, true)) fail();
    const name = new TextDecoder().decode(new Uint8Array(buffer, offset + 46, nameLength));
    const worksheet = /^xl\/worksheets\/[^/]+\.xml$/.test(name);
    const decoded = await expandBounded(new Uint8Array(buffer, start, compressedSize), method, worksheet);
    if (decoded.size !== declaredSize || total + decoded.size > ZIP_TOTAL_LIMIT) fail();
    total += decoded.size;
    if (worksheet) checkWorksheet(decoded.xml);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset !== directoryEnd) fail();
}
