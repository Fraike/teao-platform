import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DATA_DIR } from '../config.js';
import type { EmployeeAccountLink } from '../../src/types/organization.ts';
import type { WecomDirectoryImportSummary, WecomDirectoryMember, WecomDirectorySummary, WecomSuggestion } from '../../src/types/wecomDirectory.ts';

const directoryFile = path.join(DATA_DIR, 'wecom-directory.json');
const validUserId = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,63}$/;

interface PlatformAccount {
  id: string;
  name?: string;
  status?: string;
  wecomUserid?: string;
}

const normalizedName = (value: unknown) => typeof value === 'string' ? value.normalize('NFKC').trim() : '';
const normalizedUserId = (value?: string) => value?.trim().toLowerCase();

export function validateWecomBinding(users: PlatformAccount[], id: string, value: unknown): string | undefined {
  if (typeof value !== 'string') return '企业微信账号格式无效';
  const trimmed = value.trim();
  if (!trimmed) return;
  if (!validUserId.test(trimmed)) return '企业微信账号须以字母或数字开头，可包含 . _ - @，最多 64 个字符';
  if (users.some(user => user.id !== id && normalizedUserId(user.wecomUserid) === normalizedUserId(trimmed))) {
    return '此企业微信账号已被其他平台用户绑定';
  }
}

export function readWecomDirectory(): WecomDirectoryMember[] {
  try { return JSON.parse(fs.readFileSync(directoryFile, 'utf8')).members as WecomDirectoryMember[]; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export function suggestWecomBinding(user: PlatformAccount, users: PlatformAccount[], links: EmployeeAccountLink[] = []): WecomSuggestion {
  const directory = readWecomDirectory();
  const name = normalizedName(user.name);
  const matches = directory.filter(member => member.name === name);
  if (!matches.length) return { kind: 'missing' };
  if (matches.length !== 1 || users.some(other => other.id !== user.id && normalizedName(other.name) === name) ||
    links.some(link => link.name === name && link.userId !== user.id)) {
    return { kind: 'ambiguous' };
  }
  const { userId } = matches[0];
  if (!userId) return { kind: 'missing' };
  if (directory.some(member => member !== matches[0] && normalizedUserId(member.userId) === normalizedUserId(userId))) {
    return { kind: 'ambiguous' };
  }
  if (validateWecomBinding(users, user.id, userId)) return { kind: 'occupied' };
  return { kind: 'matched', userId };
}

function validateMembers(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > 10000) {
    throw Object.assign(new Error('通讯录应包含 1–10000 位成员'), { status: 400 });
  }
  const members = new Map<string, WecomDirectoryMember>();
  let invalidRows = 0;
  for (const row of value) {
    const name = normalizedName(row?.name);
    const rawId = typeof row?.userId === 'string' ? row.userId.trim() : '';
    const userId = validUserId.test(rawId) ? rawId : '';
    if (!name || name.length > 100) {
      invalidRows++;
      continue;
    }
    const rawDepartments: unknown[] = Array.isArray(row.departments) ? row.departments.slice(0, 50) : [];
    const departments = rawDepartments.map(normalizedName).filter(department => department && department.length <= 200);
    if (!userId) {
      invalidRows++;
      if (!departments.length) continue;
    }
    const key = JSON.stringify([name, userId]);
    members.set(key, { name, userId, departments: [...new Set([...(members.get(key)?.departments ?? []), ...departments])] });
  }
  if (![...members.values()].some(member => member.userId)) {
    throw Object.assign(new Error('通讯录没有可用的姓名和账号'), { status: 400 });
  }
  return { members: [...members.values()], invalidRows };
}

function summarize(members: WecomDirectoryMember[], invalidRows: number): WecomDirectorySummary {
  const countDuplicates = (values: string[]) => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const value of values) {
      if (seen.has(value)) duplicates.add(value);
      seen.add(value);
    }
    return duplicates.size;
  };
  const accounts = members.filter(member => member.userId);
  return {
    count: accounts.length, invalidRows, ambiguousNames: countDuplicates(members.map(row => row.name)),
    ambiguousIds: countDuplicates(accounts.map(row => row.userId.toLowerCase())),
  };
}

export function planWecomDirectoryImport(
  input: unknown, employees: { name: string; status: string; employeeNo?: string }[], users: PlatformAccount[],
  links: EmployeeAccountLink[] = [],
) {
  const { members, invalidRows } = validateMembers(input);
  const active = employees.filter(row => row.status === 'active');
  const changes: { id: string; userId: string }[] = [];
  const conflicts: WecomDirectoryImportSummary['conflicts'] = [];
  let unchanged = 0;
  for (const name of new Set(active.map(employee => normalizedName(employee.name)).filter(Boolean))) {
    const candidates = members.filter(row => row.name === name);
    if (!candidates.length) continue;
    const accounts = users.filter(row => normalizedName(row.name) === name);
    if (!accounts.some(row => row.status === 'active')) continue;
    const staff = active.filter(row => normalizedName(row.name) === name);
    if (staff.length !== 1 || accounts.length !== 1 || candidates.length !== 1) {
      conflicts.push({ name, reason: '姓名匹配不唯一' });
      continue;
    }

    const [{ userId }] = candidates;
    const [account] = accounts;
    if (!userId) continue;
    const employeeNo = normalizedName(staff[0].employeeNo).toUpperCase();
    const staffLink = links.find(row => row.employeeNo === employeeNo);
    const userLink = links.find(row => row.userId === account.id);
    if ((staffLink && (staffLink.userId !== account.id || staffLink.name !== name)) ||
      (userLink && userLink.employeeNo !== employeeNo)) {
      conflicts.push({ name, reason: '与已确认的员工账号关联冲突' });
      continue;
    }
    const sameId = (value?: string) => normalizedUserId(value) === normalizedUserId(userId);
    if (members.filter(row => sameId(row.userId)).length !== 1) {
      conflicts.push({ name, reason: '通讯录账号重复' });
    } else if (sameId(account.wecomUserid)) {
      unchanged++;
    } else if (account.wecomUserid?.trim()) {
      conflicts.push({ name, reason: '已有企微账号与通讯录不同' });
    } else if (validateWecomBinding(users, account.id, userId)) {
      conflicts.push({ name, reason: '企微账号已绑定其他用户' });
    } else {
      changes.push({ id: account.id, userId });
    }
  }
  const bindingRevision = createHash('sha256').update(JSON.stringify([members, changes])).digest('hex');
  return {
    changes,
    summary: { ...summarize(members, invalidRows), fillable: changes.length, unchanged, conflicts, bindingRevision },
  };
}

export function writeWecomDirectory(input: unknown, commitBindings?: () => void) {
  const { members, invalidRows } = validateMembers(input);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporary = path.join(DATA_DIR, `.wecom-directory-${randomUUID()}.tmp`);
  const backup = temporary + '.backup';
  let keepBackup = false;
  try {
    fs.writeFileSync(temporary, JSON.stringify({ members }), { flag: 'wx', mode: 0o600 });
    if (commitBindings && fs.existsSync(directoryFile)) {
      fs.writeFileSync(backup, fs.readFileSync(directoryFile), { flag: 'wx', mode: 0o600 });
    }
    fs.renameSync(temporary, directoryFile);
    try { commitBindings?.(); }
    catch (error) {
      if (fs.existsSync(backup)) {
        keepBackup = true;
        fs.renameSync(backup, directoryFile);
        keepBackup = false;
      } else fs.rmSync(directoryFile, { force: true });
      throw error;
    }
  } finally {
    fs.rmSync(temporary, { force: true });
    if (!keepBackup) fs.rmSync(backup, { force: true });
  }
  return summarize(members, invalidRows);
}
