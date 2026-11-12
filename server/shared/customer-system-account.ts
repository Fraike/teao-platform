import type { CustomerAccountDetails, CustomerAccountInput } from '../../src/types/customerSystemAccount.ts';

export const CUSTOMER_ACCOUNT_PERMISSION = 'customer_accounts_view';
export const CUSTOMER_ACCOUNT_PATH = '/customer-system-accounts';
export const CUSTOMER_ACCOUNT_API = '/api/customer-system-accounts';
export const CUSTOMER_ACCOUNT_PAGE_SIZE = 20;
export const CUSTOMER_ACCOUNT_IMPORT_LIMIT = 500;

export function customerAccountUrl(value: string): string {
  const url = value.trim();
  if (!/^https?:\/\/[^/]/i.test(url) || /[\s\\]/u.test(url) || url.length > 2048) return '';
  if (Array.from(url).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return '';
  try {
    const parsed = new URL(url);
    return parsed.hostname && !parsed.username && !parsed.password ? parsed.href : '';
  } catch {
    return '';
  }
}

export function customerAccountDetails(input: Partial<CustomerAccountDetails> | null | undefined): CustomerAccountDetails {
  return {
    company: typeof input?.company === 'string' ? input.company.trim() : '',
    url: typeof input?.url === 'string' ? input.url.trim() : '',
    username: typeof input?.username === 'string' ? input.username : '',
    note: typeof input?.note === 'string' ? input.note.trim() : '',
  };
}

export function customerAccountIssues(input: CustomerAccountDetails, requireLoginFields = true): string[] {
  const issues: string[] = [];
  if (!input.company || input.company.length > 200) issues.push(requireLoginFields ? '公司名称必填，最多 200 字' : '名称或用途必填，最多 200 字');
  if ((requireLoginFields || input.url) && !customerAccountUrl(input.url)) issues.push('请输入有效的 HTTP 或 HTTPS 网址');
  if (requireLoginFields && !input.username.trim()) issues.push('账号必填');
  if (input.username.length > 512) issues.push('账号最多 512 字');
  if (input.note.length > 2000) issues.push('备注最多 2000 字');
  return issues;
}

export function customerAccountPasswordIssue(password: unknown): string {
  return typeof password === 'string' && password.length > 0 && password.length <= 1024
    ? '' : '密码必填，最多 1024 字';
}

export function customerAccountContainsPassword(text: string, password: string): boolean {
  const trimmed = password.trim();
  if (!trimmed) return false;
  return text.trim() === trimmed || (trimmed.length >= 4 && text.includes(trimmed));
}

export function customerAccountImportIssues(input: CustomerAccountInput, requireLoginFields = true): string[] {
  const issues = customerAccountIssues(input, requireLoginFields);
  const passwordIssue = customerAccountPasswordIssue(input.password);
  if (passwordIssue) issues.push(passwordIssue);
  else if (customerAccountContainsPassword(input.note, input.password)) issues.push('备注不能包含密码');
  return issues;
}

export function customerAccountIdentity({ company, url, username }: CustomerAccountDetails): string {
  return JSON.stringify([company.trim(), customerAccountUrl(url), username]);
}
