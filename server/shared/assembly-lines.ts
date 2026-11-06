export const ASSEMBLY_LINES = [
  ...Array.from({length: 15}, (_, index) => `${index + 1}#`),
  ...Array.from({length: 5}, (_, index) => `${index + 1}#组装线`),
  '80#自动线', '98#自动线',
];

const aliases: Record<string, string> = {
  '2#线组装': '2#组装线', '2组装线': '2#组装线', '4#线组装': '4#组装线',
  '6#组装线': '6#', '7#组装线': '7#', '12#组装线': '12#', '15#组装线': '15#',
  '组装线': '1#组装线', '自动线': '80#自动线', '80#': '80#自动线', '98#': '98#自动线',
};

export function normalizeAssemblyLine(value: unknown): string {
  const input = typeof value === 'string' ? value.trim() : '';
  const line = Object.hasOwn(aliases, input) ? aliases[input] : input;
  if (!ASSEMBLY_LINES.includes(line)) throw Object.assign(new Error(`未知装配产线：${input || '空值'}，请选择固定产线`), {status: 400});
  return line;
}
