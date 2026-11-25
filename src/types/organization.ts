export interface OrganizationDepartment {
  name: string;
  members: { name: string }[];
  leader: { name: string } | null;
  issue?: string;
}

export interface OrganizationView {
  departments: OrganizationDepartment[];
  unassigned: { name: string }[];
}

export interface DepartmentLeader {
  name: string;
  userId: string;
}

export interface OrganizationReconciliation {
  key: string;
  kind: 'match' | 'department_diff' | 'ambiguous' | 'hr_only' | 'wecom_only';
  name: string;
  employeeNo?: string;
  department?: string;
  wecomDepartments: string[];
  suggestedUserId?: string;
  linkedUserId?: string;
}

export interface OrganizationSettings {
  people: { id: string; name: string }[];
  reconciliation: OrganizationReconciliation[];
}

export type EmployeeAccountStatus = 'linked' | 'unlinked' | 'pending' | 'unregistered' | 'disabled';

export interface EmployeeWecomBinding {
  employeeId: string;
  employeeNo?: string;
  status: EmployeeAccountStatus;
  userId?: string;
  wecomUserid: string;
}

export interface EmployeeAccountLink {
  employeeNo: string;
  name: string;
  userId: string;
}
