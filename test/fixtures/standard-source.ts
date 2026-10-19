import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const FORMAL_MAIN_HASH = 'b23fbed1f4d9812281fab5a30b261910678ec8faaf870313acabaf70dfbb2cb0';
export const FORMAL_SANITARY_HASH = '78435a7348396f85ba413026a2e1a57e50a598125a9ab3e34114e3f80a9ad97f';

// Private XLS files are optional. Never parse an absent or different source as the approved fixture.
export function optionalStandardSource(file: URL, expectedHash: string) {
  if (!existsSync(file)) return { bytes: null, skip: `私有实源不存在：${file.pathname}` };
  const bytes = readFileSync(file);
  if (createHash('sha256').update(bytes).digest('hex') !== expectedHash) {
    return { bytes: null, skip: `私有实源 SHA256 不匹配：${file.pathname}` };
  }
  return { bytes, skip: false as const };
}

export function formalMainSource() {
  return optionalStandardSource(new URL('../../客户标准参数一览表-整理版.xls', import.meta.url), FORMAL_MAIN_HASH);
}

export function formalSanitarySource() {
  return optionalStandardSource(new URL('../../客户标准参数一览表-整理版-卫浴.xls', import.meta.url), FORMAL_SANITARY_HASH);
}
