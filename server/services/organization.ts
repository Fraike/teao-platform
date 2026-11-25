import type Database from 'better-sqlite3';
import type { Employee } from '../../src/types/employee.ts';
import type { ChangeConfig } from '../../src/types/engineeringChange.ts';
import type { DepartmentLeader, EmployeeAccountLink, EmployeeWecomBinding, OrganizationReconciliation, OrganizationView } from '../../src/types/organization.ts';
import type { WecomDirectoryMember } from '../../src/types/wecomDirectory.ts';

type Staff = Pick<Employee, 'id' | 'name' | 'department' | 'employeeNo' | 'status' | 'position'>;
interface Account {
  id: string;
  name: string;
  status: string;
  wecomUserid?: string;
}
const normalize = (value?: string) => String(value ?? '').normalize('NFKC').trim();
const userKey = (value?: string) => normalize(value).toLowerCase();
const pathParts = (value: string) => normalize(value).split('/').map(normalize).filter(Boolean);
const formalDepartment = (name: string) => {
  const parts = pathParts(name);
  return Boolean(parts.length && parts.at(-1) !== '其他' && !parts.includes('特澳内部群'));
};
const isSupervisor = (position: string) => {
  const label = normalize(position);
  return label.endsWith('主管') && !/(副|助理|代理)主管$/.test(label);
};
const departmentLabel = (value: string) => pathParts(value).at(-1) ?? '';
function fail(status: number, message: string): never { throw Object.assign(new Error(message), { status }); }

function indexBy<T>(values: T[], key: (value: T) => string) {
  const result = new Map<string, T[]>();
  for (const value of values) {
    const normalized = key(value);
    const rows = result.get(normalized) ?? [];
    rows.push(value);
    result.set(normalized, rows);
  }
  return result;
}

function directoryDepartments(member: WecomDirectoryMember) {
  return (member.departments ?? []).map(pathParts).filter(parts => !parts.includes('特澳内部群'))
    .map(parts => parts.at(-1) ?? '').filter(formalDepartment);
}

export function createOrganizationStore(db: Database.Database, readEmployees: () => Staff[],
  readAccounts: () => Account[], readDirectory: () => WecomDirectoryMember[]) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organization_employee_links (employeeNo TEXT PRIMARY KEY, name TEXT NOT NULL, userId TEXT NOT NULL UNIQUE);
  `);

  const links = () => db.prepare('SELECT employeeNo,name,userId FROM organization_employee_links').all() as EmployeeAccountLink[];

  function snapshot() {
    const employees = readEmployees();
    const active = employees.filter(row => row.status === 'active');
    const departments = indexBy(active, row => normalize(row.department));
    const employeeByNumber = indexBy(active, row => normalize(row.employeeNo).toUpperCase());
    const accountLinks = links();
    const unavailable = new Set(accountLinks.filter(link =>
      !employeeByNumber.get(link.employeeNo)?.some(row => normalize(row.name) === link.name)).map(link => link.userId));
    const accounts = readAccounts();
    const people = accounts.filter(user => user.status === 'active' && !unavailable.has(user.id));
    return {
      active, departments, employeeByNumber, accountLinks, people, accounts,
      staffNames: indexBy(active, row => normalize(row.name)),
      accountNames: indexBy(accounts, row => normalize(row.name)),
    };
  }

  function accountFor(employee: Staff, state: ReturnType<typeof snapshot>) {
    const employeeNo = normalize(employee.employeeNo).toUpperCase();
    if (employeeNo && state.employeeByNumber.get(employeeNo)?.length !== 1) return;
    const link = employeeNo ? state.accountLinks.find(row => row.employeeNo === employeeNo) : undefined;
    const name = normalize(employee.name);
    if (link) return link.name === name ? state.people.find(row => row.id === link.userId) : undefined;
    const matches = state.accountNames.get(name);
    if (!name || matches?.length !== 1 || state.staffNames.get(name)?.length !== 1) return;
    const [account] = matches;
    if (account.status === 'active' && !state.accountLinks.some(row => row.userId === account.id)) return account;
  }

  function departments(state = snapshot()) {
    return [...state.departments.entries()].filter(([name]) => formalDepartment(name))
      .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
      .map(([name, members]) => {
        const candidates = members.filter(row => isSupervisor(row.position));
        const supervisor = candidates.length === 1 ? candidates[0] : undefined;
        const account = supervisor && accountFor(supervisor, state);
        const issue = account ? undefined : supervisor ? '主管的平台账号未激活或待核对'
          : candidates.length ? '花名册有多位主管' : '花名册未标明主管';
        return { name, members, supervisor, account, issue };
      });
  }

  function view(): OrganizationView {
    const state = snapshot();
    return {
      departments: departments(state).map(row => ({
        name: row.name, leader: row.supervisor ? { name: row.supervisor.name } : null,
        issue: row.issue,
        members: row.members.map(member => ({ name: member.name })),
      })),
      unassigned: state.active.filter(row => !formalDepartment(normalize(row.department))).map(row => ({ name: row.name })),
    };
  }

  function bindings(): EmployeeWecomBinding[] {
    const state = snapshot();
    const directory = readDirectory().filter(row => normalize(row.userId));
    const directoryNames = indexBy(directory, row => normalize(row.name));
    const directoryIds = indexBy(directory, row => userKey(row.userId));
    return state.active.map(employee => {
      const identity = { employeeId: employee.id, employeeNo: employee.employeeNo };
      const account = accountFor(employee, state);
      if (account) return { ...identity, status: 'linked', userId: account.id, wecomUserid: account.wecomUserid ?? '' };

      const name = normalize(employee.name);
      const link = state.accountLinks.find(row => row.employeeNo === normalize(employee.employeeNo).toUpperCase());
      const matches = state.accountNames.get(name) ?? [];
      const linked = link?.name === name ? state.accounts.find(row => row.id === link.userId) : undefined;
      const unique = linked ?? (!link && matches.length === 1 && state.staffNames.get(name)?.length === 1 &&
        !state.accountLinks.some(row => row.userId === matches[0].id) ? matches[0] : undefined);
      if (unique && unique.status !== 'active') {
        return { ...identity, status: unique.status === 'pending' ? 'pending' : 'disabled', wecomUserid: unique.wecomUserid ?? '' };
      }
      if (matches.length || link) return { ...identity, status: 'unlinked', wecomUserid: '' };

      const rows = directoryNames.get(name);
      const contact = name && state.staffNames.get(name)?.length === 1 && rows?.length === 1 &&
        directoryIds.get(userKey(rows[0].userId))?.length === 1 ? rows[0] : undefined;
      return { ...identity, status: 'unregistered', wecomUserid: contact?.userId ?? '' };
    });
  }

  function link(employeeNo: unknown, userId: unknown) {
    if (typeof employeeNo !== 'string' || !employeeNo.trim()) fail(400, '请选择有效的员工工号');
    const state = snapshot();
    const key = normalize(employeeNo as string).toUpperCase();
    const candidates = state.employeeByNumber.get(key);
    if (candidates?.length !== 1) fail(400, '工号不存在或不唯一，请先核对员工档案');
    if (userId === '') {
      db.prepare('DELETE FROM organization_employee_links WHERE employeeNo=?').run(key);
      return;
    }
    if (typeof userId !== 'string' || !readAccounts().some(account => account.id === userId && account.status === 'active')) {
      fail(400, '请选择已激活的平台账号');
    }
    if (state.accountLinks.some(row => row.userId === userId && row.employeeNo !== key)) fail(409, '该平台账号已关联其他员工');
    db.prepare(`INSERT INTO organization_employee_links VALUES(?,?,?)
      ON CONFLICT(employeeNo) DO UPDATE SET name=excluded.name,userId=excluded.userId`)
      .run(key, normalize(candidates![0].name), userId);
  }

  function commitEmployeeEdit(previous: Staff, next: Staff, save: () => () => void) {
    const oldNo = normalize(previous.employeeNo).toUpperCase();
    const newNo = normalize(next.employeeNo).toUpperCase();
    const oldName = normalize(previous.name);
    const newName = normalize(next.name);
    if (!oldNo || (oldNo === newNo && oldName === newName)) return save();
    const confirmed = links().find(row => row.employeeNo === oldNo && row.name === oldName);
    if (!confirmed) return save();

    let restore: (() => void) | undefined;
    try {
      db.transaction(() => {
        if (oldNo !== newNo && links().some(row => row.employeeNo === newNo)) {
          fail(409, '新工号已有账号关联，请先在组织架构中核对');
        }
        db.prepare('UPDATE organization_employee_links SET employeeNo=?,name=? WHERE employeeNo=?')
          .run(newNo, newName, oldNo);
        restore = save();
      }).immediate();
    } catch (error) {
      restore?.();
      throw error;
    }
    return () => {
      db.transaction(() => {
        db.prepare('UPDATE organization_employee_links SET employeeNo=?,name=? WHERE employeeNo=?')
          .run(oldNo, oldName, newNo);
        restore?.();
      }).immediate();
    };
  }

  function reconcile(): OrganizationReconciliation[] {
    const state = snapshot();
    const employeeNames = state.staffNames;
    const directory = readDirectory();
    const directoryNames = indexBy(directory, row => normalize(row.name));
    const directoryIds = indexBy(directory.filter(row => row.userId), row => userKey(row.userId));
    const bound = indexBy(state.people.filter(user => user.wecomUserid), row => userKey(row.wecomUserid));
    const confirmed = new Map(state.accountLinks.map(row => [row.employeeNo, row]));
    const rows = state.active.map((employee, index): OrganizationReconciliation => {
      const name = normalize(employee.name);
      const matches = directoryNames.get(name) ?? [];
      const employeeNo = normalize(employee.employeeNo).toUpperCase();
      const wecomDepartments = [...new Set(matches.flatMap(directoryDepartments))];
      const duplicate = (employeeNames.get(name)?.length ?? 0) > 1 ||
        (state.employeeByNumber.get(employeeNo)?.length ?? 0) !== 1 ||
        matches.length > 1 || matches.some(row => (directoryIds.get(userKey(row.userId))?.length ?? 0) > 1);
      const platform = !duplicate && matches.length === 1 ? bound.get(userKey(matches[0].userId)) : undefined;
      const saved = confirmed.get(employeeNo);
      return {
        key: `employee:${employeeNo}:${index}`, name: employee.name, employeeNo, department: employee.department,
        wecomDepartments, linkedUserId: saved?.name === name ? saved.userId : undefined,
        kind: duplicate ? 'ambiguous' : !matches.length ? 'hr_only' :
          wecomDepartments.length && !wecomDepartments.includes(departmentLabel(employee.department)) ? 'department_diff' : 'match',
        suggestedUserId: duplicate ? undefined : accountFor(employee, state)?.id ?? (platform?.length === 1 ? platform[0].id : undefined),
      };
    });
    for (const [index, member] of directory.entries()) {
      const wecomDepartments = directoryDepartments(member);
      if (wecomDepartments.length && !employeeNames.has(normalize(member.name))) {
        rows.push({ key: `directory:${index}`, kind: 'wecom_only', name: member.name, wecomDepartments });
      }
    }
    return rows;
  }

  function routingConfig(config: ChangeConfig | null) {
    if (!config) return null;
    const eligible: DepartmentLeader[] = departments().flatMap(({ name, account }) =>
      account ? [{ name, userId: account.id }] : []);
    return { ...config, departments: eligible };
  }

  return {
    view, departments, link, reconcile, bindings, routingConfig, confirmedLinks: links, commitEmployeeEdit,
    employeeAccount: (id: string) => {
      const state = snapshot();
      const employee = state.active.find(row => row.id === id);
      return employee && accountFor(employee, state);
    },
    people: () => readAccounts().filter(row => row.status === 'active').map(({ id, name }) => ({ id, name })),
  };
}
