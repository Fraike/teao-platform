import type { StandardCategoryField } from '../../src/types/standard.ts';

export const GREASE_AMOUNT_KEY = 'grease_amount_g';
export const GREASE_AMOUNT_LABEL = '油量（阻尼脂）（g）';
const categories = new Set(['gear_damper', 'barrel_damper', 'rack_damper', 'sanitary_damper', 'air_pull_cord']);
const decimal = '(?:\\d+(?:\\.\\d+)?|\\.\\d+)';
const range = new RegExp(`^(${decimal})\\s*[-–—~～至]\\s*(${decimal})$`);
const tolerance = new RegExp(`^(${decimal})\\s*±\\s*(${decimal})$`);
const asymmetric = new RegExp(`^(${decimal})\\s*\\+\\s*(${decimal})\\s*/\\s*-\\s*(${decimal})$`);

export function validateGreaseAmount(value: string | undefined): string | undefined {
  const text = value?.trim() || '';
  if (!text) return undefined;
  const match = text.match(range) || text.match(tolerance) || text.match(asymmetric);
  const error = '油量请填写有效范围或公差（克），不可填写单个数值；下限不能为负，范围下限不能超过上限';
  if (!match) return error;
  const numbers = match.slice(1).map(Number);
  if (!numbers.every(Number.isFinite)) return error;
  const [base, second, lowerTolerance] = numbers;
  if (range.test(text)) return base <= second ? undefined : error;
  const lower = base - (lowerTolerance ?? second);
  return lower >= -Number.EPSILON * Math.max(base, second, lowerTolerance ?? 0)
    && Number.isFinite(base + second) ? undefined : error;
}

export function greaseCategoryFields(category: string, fields: StandardCategoryField[]): StandardCategoryField[] {
  if (!categories.has(category)) return fields;
  const clean = fields.filter(field => field.key !== GREASE_AMOUNT_KEY);
  const anchor = category === 'sanitary_damper' ? 'oil_no'
    : clean.some(field => field.key === 'winter_test_standard') ? 'winter_test_standard' : 'test_standard';
  const position = clean.findIndex(field => field.key === anchor);
  const field: StandardCategoryField = { key: GREASE_AMOUNT_KEY, label: GREASE_AMOUNT_LABEL,
    ...(category === 'sanitary_damper' ? { group: '产品参数', variant: 'component' } : {}) };
  clean.splice(position < 0 ? clean.length : position + 1, 0, field);
  return clean;
}
